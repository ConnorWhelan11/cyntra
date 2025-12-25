"""Integration tests for memory system.

These tests verify end-to-end behavior of the memory pipeline.
Some tests require external dependencies (database, LLM client).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime

from cyntra.memory.models import (
    AgentMemory,
    ExtractedMemory,
    MemoryType,
    MemoryScope,
)


class TestExtractionPipeline:
    """Integration tests for the extraction pipeline."""

    @pytest.fixture
    def mock_dependencies(self):
        """Create all mock dependencies for pipeline."""
        store = MagicMock()
        store.create = AsyncMock(return_value=uuid4())
        store.create_batch = AsyncMock(return_value=[uuid4(), uuid4()])
        store.get = AsyncMock(return_value=None)
        store.search_similar = AsyncMock(return_value=[])

        vector_ops = MagicMock()
        vector_ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        vector_ops.batch_embeddings = AsyncMock(return_value=[[0.1] * 768])
        vector_ops.cosine_similarity = MagicMock(return_value=0.5)

        llm_client = MagicMock()
        llm_client.messages = MagicMock()
        llm_client.messages.create = AsyncMock(
            return_value=MagicMock(
                content=[
                    MagicMock(
                        text="""
[
  {
    "text": "Extracted pattern from run",
    "memory_type": "pattern",
    "importance_score": 0.8,
    "confidence": 0.9
  }
]
"""
                    )
                ]
            )
        )

        return {
            "store": store,
            "vector_ops": vector_ops,
            "llm_client": llm_client,
        }

    @pytest.mark.asyncio
    async def test_full_extraction_pipeline(self, mock_dependencies):
        """Test complete extraction from run to stored memory."""
        from cyntra.memory.extraction import MemoryExtractor

        extractor = MemoryExtractor(
            llm_client=mock_dependencies["llm_client"],
            store=mock_dependencies["store"],
            vector_ops=mock_dependencies["vector_ops"],
        )

        # Simulate run transcript
        transcript = """
User: Fix the authentication bug
Assistant: I'll investigate the auth module...
<tool_use>Read: src/auth.py</tool_use>
Assistant: Found the issue - the token validation is incorrect.
<tool_use>Edit: src/auth.py</tool_use>
Assistant: Fixed the token validation logic.
"""

        memories = await extractor.extract_from_run(
            run_id="run-integration-test",
            agent_id="claude",
            transcript=transcript,
            issue_tags=["bug", "auth"],
            file_paths=["src/auth.py"],
        )

        # Verify extraction happened
        assert len(memories) >= 1
        assert mock_dependencies["llm_client"].messages.create.called
        assert mock_dependencies["vector_ops"].generate_embedding.called


class TestSurfacingPipeline:
    """Integration tests for memory surfacing."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store with test data."""
        store = MagicMock()

        # Pre-populate with test memories
        test_memories = [
            AgentMemory(
                id=uuid4(),
                agent_id="claude",
                text="Pattern for API error handling",
                memory_type=MemoryType.PATTERN,
                scope=MemoryScope.INDIVIDUAL,
                importance_score=0.8,
                confidence=0.9,
                issue_tags=["api"],
                file_paths=["src/api.py"],
                similarity_score=0.85,
                created_at=datetime.utcnow(),
            ),
            AgentMemory(
                id=uuid4(),
                agent_id="claude",
                text="Failure: Don't mutate shared state",
                memory_type=MemoryType.FAILURE,
                scope=MemoryScope.INDIVIDUAL,
                importance_score=0.75,
                confidence=0.85,
                issue_tags=["concurrency"],
                created_at=datetime.utcnow(),
            ),
        ]

        store.search_similar = AsyncMock(return_value=[test_memories[0]])
        store.search_by_tags = AsyncMock(return_value=[test_memories[0]])
        store.search_by_files = AsyncMock(return_value=[test_memories[0]])
        store.get_links = AsyncMock(return_value={"inbound": [], "outbound": []})

        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector ops."""
        ops = MagicMock()
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        return ops

    @pytest.mark.asyncio
    async def test_multi_signal_surfacing(self, mock_store, mock_vector_ops):
        """Test surfacing with multiple signals."""
        from cyntra.memory.surfacing import MemorySurfacingService

        service = MemorySurfacingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        memories = await service.get_relevant_memories(
            query_text="Handle API errors gracefully",
            agent_id="claude",
            tags=["api"],
            file_paths=["src/api.py"],
        )

        # Should return memories from multiple signals
        assert len(memories) >= 1
        assert mock_store.search_similar.called
        assert mock_store.search_by_tags.called


class TestSleeptimePipeline:
    """Integration tests for sleeptime processing."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.pool = MagicMock()
        store.pool.acquire = MagicMock(return_value=AsyncMock())
        store.get = AsyncMock(return_value=None)
        store.get_batch = AsyncMock(return_value=[])
        store.update = AsyncMock()
        store.archive = AsyncMock()
        store.find_hubs = AsyncMock(return_value=[])
        store.get_agent_run_count = AsyncMock(return_value=100)
        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector ops."""
        ops = MagicMock()
        ops.cosine_similarity = MagicMock(return_value=0.9)
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        return ops

    @pytest.mark.asyncio
    async def test_sleeptime_processing(self, mock_store, mock_vector_ops):
        """Test complete sleeptime processing."""
        from cyntra.memory.sleeptime import SleeptimeProcessor

        processor = SleeptimeProcessor(
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        report = await processor.process(agent_id="claude")

        # Should complete without error
        assert report is not None
        assert report.errors == []
        assert report.duration_seconds >= 0

    @pytest.mark.asyncio
    async def test_consolidation_with_similar_memories(
        self, mock_store, mock_vector_ops
    ):
        """Test memory consolidation."""
        from cyntra.memory.consolidation import ConsolidationHandler

        # Create similar memories for consolidation
        similar_memories = [
            AgentMemory(
                id=uuid4(),
                agent_id="claude",
                text="Always validate input before processing",
                memory_type=MemoryType.PATTERN,
                scope=MemoryScope.INDIVIDUAL,
                importance_score=0.8,
                confidence=0.9,
                embedding=[0.1] * 768,
                created_at=datetime.utcnow(),
            ),
            AgentMemory(
                id=uuid4(),
                agent_id="claude",
                text="Validate all inputs prior to processing them",
                memory_type=MemoryType.PATTERN,
                scope=MemoryScope.INDIVIDUAL,
                importance_score=0.75,
                confidence=0.85,
                embedding=[0.11] * 768,
                created_at=datetime.utcnow(),
            ),
        ]

        # Setup mock to return similar memories
        async def mock_fetch(*args):
            return [
                {
                    "id": m.id,
                    "agent_id": m.agent_id,
                    "text": m.text,
                    "memory_type": m.memory_type.value,
                    "scope": m.scope.value,
                    "importance_score": m.importance_score,
                    "confidence": m.confidence,
                    "embedding": m.embedding,
                    "issue_tags": [],
                    "file_paths": [],
                    "access_count": 0,
                    "mention_count": 0,
                    "runs_at_creation": 1,
                    "runs_at_last_access": 1,
                    "is_archived": False,
                    "created_at": m.created_at,
                    "updated_at": m.created_at,
                }
                for m in similar_memories
            ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_store.pool.acquire.return_value.__aenter__ = AsyncMock(
            return_value=mock_conn
        )
        mock_store.pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_store._row_to_memory = MagicMock(side_effect=lambda r: similar_memories[0])

        handler = ConsolidationHandler(
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        clusters = await handler.find_clusters(agent_id="claude")

        # Should find at least one cluster of similar memories
        assert isinstance(clusters, list)


class TestEventHandlers:
    """Integration tests for event handlers."""

    @pytest.fixture
    def mock_dependencies(self):
        """Create mock dependencies."""
        store = MagicMock()
        store.get = AsyncMock(return_value=None)
        store.create = AsyncMock(return_value=uuid4())

        extractor = MagicMock()
        extractor.extract_from_run = AsyncMock(return_value=[])

        linking_service = MagicMock()
        linking_service.find_link_candidates = AsyncMock(return_value=[])

        sleeptime_processor = MagicMock()

        return {
            "store": store,
            "extractor": extractor,
            "linking_service": linking_service,
            "sleeptime_processor": sleeptime_processor,
        }

    @pytest.mark.asyncio
    async def test_run_completed_handler(self, mock_dependencies):
        """Test handling run completed event."""
        from cyntra.memory.handlers import MemoryEventHandler
        from cyntra.memory.events import RunCompletedEvent

        handler = MemoryEventHandler(
            store=mock_dependencies["store"],
            extractor=mock_dependencies["extractor"],
            linking_service=mock_dependencies["linking_service"],
        )

        event = RunCompletedEvent.create(
            agent_id="claude",
            run_id="run-test",
            workcell_id="wc-test",
            issue_id="issue-1",
            world_id=None,
            status="success",
            patch_applied=True,
            gates_passed=True,
            transcript="Test transcript",
            tool_calls=[],
            file_changes=["src/test.py"],
            issue_tags=["test"],
            duration_seconds=120.0,
            token_count=5000,
        )

        result = await handler.handle(event)

        assert result.success or result.errors
        # Extractor should be called
        mock_dependencies["extractor"].extract_from_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_event_bus_publish(self, mock_dependencies):
        """Test event bus publishing."""
        from cyntra.memory.handlers import MemoryEventBus, MemoryEventHandler
        from cyntra.memory.events import MemoryEvent

        handler = MemoryEventHandler(
            store=mock_dependencies["store"],
            extractor=mock_dependencies["extractor"],
        )

        bus = MemoryEventBus(handler=handler)

        # Create a simple event
        event = MemoryEvent(agent_id="claude")

        results = await bus.publish(event)

        assert isinstance(results, list)
