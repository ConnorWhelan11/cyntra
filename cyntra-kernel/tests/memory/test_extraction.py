"""Tests for memory extraction engine."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from cyntra.memory.models import ExtractedMemory, MemoryType


class TestMemoryExtractor:
    """Tests for MemoryExtractor class."""

    @pytest.fixture
    def mock_llm_client(self):
        """Create a mock LLM client."""
        client = MagicMock()
        client.messages = MagicMock()
        client.messages.create = AsyncMock()
        return client

    @pytest.fixture
    def mock_store(self):
        """Create a mock memory store."""
        store = MagicMock()
        store.create = AsyncMock(return_value=uuid4())
        store.create_batch = AsyncMock(return_value=[uuid4(), uuid4()])
        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector operations."""
        ops = MagicMock()
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        ops.batch_embeddings = AsyncMock(return_value=[[0.1] * 768, [0.2] * 768])
        ops.cosine_similarity = MagicMock(return_value=0.85)
        return ops

    def test_extraction_config_defaults(self):
        """Test default extraction configuration."""
        from cyntra.memory.extraction import ExtractionConfig

        config = ExtractionConfig()

        assert config.max_memories_per_run == 10
        assert config.min_importance == 0.3
        assert config.dedup_threshold == 0.9

    @pytest.mark.asyncio
    async def test_extract_from_run_success(
        self, mock_llm_client, mock_store, mock_vector_ops
    ):
        """Test successful memory extraction from run."""
        from cyntra.memory.extraction import MemoryExtractor

        # Configure LLM response
        mock_llm_client.messages.create.return_value = MagicMock(
            content=[
                MagicMock(
                    text="""
[
  {
    "text": "When handling file errors, check permissions first",
    "memory_type": "pattern",
    "importance_score": 0.8,
    "confidence": 0.9
  },
  {
    "text": "API rate limit exceeded after 100 requests",
    "memory_type": "failure",
    "importance_score": 0.7,
    "confidence": 0.85
  }
]
"""
                )
            ]
        )

        extractor = MemoryExtractor(
            llm_client=mock_llm_client,
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        transcript = """
User: Fix the file permission error
Assistant: I'll check the file permissions first...
<tool_use>Bash: chmod 644 file.txt</tool_use>
Assistant: Fixed the permission issue.
"""

        memories = await extractor.extract_from_run(
            run_id="run-123",
            agent_id="claude",
            transcript=transcript,
            issue_tags=["bug", "permissions"],
            file_paths=["file.txt"],
        )

        # Should have extracted 2 memories
        assert len(memories) == 2
        assert mock_llm_client.messages.create.called

    @pytest.mark.asyncio
    async def test_extract_with_empty_transcript(
        self, mock_llm_client, mock_store, mock_vector_ops
    ):
        """Test extraction with empty transcript."""
        from cyntra.memory.extraction import MemoryExtractor

        extractor = MemoryExtractor(
            llm_client=mock_llm_client,
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        memories = await extractor.extract_from_run(
            run_id="run-empty",
            agent_id="claude",
            transcript="",
        )

        assert len(memories) == 0
        assert not mock_llm_client.messages.create.called

    @pytest.mark.asyncio
    async def test_deduplication(self, mock_llm_client, mock_store, mock_vector_ops):
        """Test memory deduplication."""
        from cyntra.memory.extraction import MemoryExtractor

        extractor = MemoryExtractor(
            llm_client=mock_llm_client,
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        # Two similar memories
        memories = [
            ExtractedMemory(
                text="Check file permissions before writing",
                memory_type=MemoryType.PATTERN,
                importance_score=0.8,
            ),
            ExtractedMemory(
                text="Check file permissions before writing files",
                memory_type=MemoryType.PATTERN,
                importance_score=0.75,
            ),
        ]

        # High similarity should deduplicate
        mock_vector_ops.cosine_similarity.return_value = 0.95

        deduplicated = await extractor.deduplicate_batch(
            memories,
            threshold=0.9,
        )

        # Should keep only one (higher importance)
        assert len(deduplicated) == 1
        assert deduplicated[0].importance_score == 0.8

    def test_parse_llm_response_valid_json(self):
        """Test parsing valid LLM response."""
        from cyntra.memory.extraction import MemoryExtractor

        extractor = MemoryExtractor.__new__(MemoryExtractor)

        response_text = """
[
  {
    "text": "Test memory",
    "memory_type": "pattern",
    "importance_score": 0.8,
    "confidence": 0.9
  }
]
"""
        memories = extractor._parse_extraction_response(response_text)

        assert len(memories) == 1
        assert memories[0].text == "Test memory"
        assert memories[0].memory_type == MemoryType.PATTERN

    def test_parse_llm_response_invalid_json(self):
        """Test parsing invalid LLM response."""
        from cyntra.memory.extraction import MemoryExtractor

        extractor = MemoryExtractor.__new__(MemoryExtractor)

        response_text = "This is not valid JSON"
        memories = extractor._parse_extraction_response(response_text)

        assert len(memories) == 0


class TestExtractionBatchService:
    """Tests for ExtractionBatchService."""

    @pytest.fixture
    def mock_extractor(self):
        """Create mock extractor."""
        extractor = MagicMock()
        extractor.extract_from_run = AsyncMock(return_value=[])
        return extractor

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.create_batch = AsyncMock(return_value=[])
        return store

    @pytest.mark.asyncio
    async def test_create_batch(self, mock_extractor, mock_store):
        """Test batch creation."""
        from cyntra.memory.extraction import ExtractionBatchService

        service = ExtractionBatchService(
            extractor=mock_extractor,
            store=mock_store,
        )

        batch_id = await service.create_batch(
            run_ids=["run-1", "run-2"],
            agent_id="claude",
        )

        assert batch_id is not None
        assert batch_id.startswith("batch_")

    @pytest.mark.asyncio
    async def test_process_batch(self, mock_extractor, mock_store):
        """Test batch processing."""
        from cyntra.memory.extraction import ExtractionBatchService

        # Setup mock to return extracted memories
        mock_extractor.extract_from_run.return_value = [
            ExtractedMemory(
                text="Batch extracted memory",
                memory_type=MemoryType.PATTERN,
            )
        ]

        service = ExtractionBatchService(
            extractor=mock_extractor,
            store=mock_store,
        )

        # Create and process batch
        batch_id = await service.create_batch(
            run_ids=["run-1"],
            agent_id="claude",
        )

        # Simulate batch processing by setting transcripts
        service._batches[batch_id]["transcripts"] = {"run-1": "Test transcript"}

        results = await service.process_batch(batch_id)

        assert mock_extractor.extract_from_run.called
