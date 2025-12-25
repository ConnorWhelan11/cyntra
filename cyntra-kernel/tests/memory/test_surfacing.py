"""Tests for memory surfacing service."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime

from cyntra.memory.models import AgentMemory, MemoryType, MemoryScope


class TestSurfacingConfig:
    """Tests for SurfacingConfig dataclass."""

    def test_default_values(self):
        """Test default configuration values."""
        from cyntra.memory.surfacing import SurfacingConfig

        config = SurfacingConfig()

        assert config.max_memories == 20
        assert config.max_per_signal == 10
        assert config.semantic_threshold == 0.6
        assert config.min_importance == 0.15
        assert config.max_link_depth == 1
        assert config.semantic_weight == 0.4
        assert config.tag_weight == 0.25
        assert config.file_weight == 0.25
        assert config.link_weight == 0.1

    def test_weights_sum_to_one(self):
        """Test that weights approximately sum to 1."""
        from cyntra.memory.surfacing import SurfacingConfig

        config = SurfacingConfig()

        total = (
            config.semantic_weight +
            config.tag_weight +
            config.file_weight +
            config.link_weight
        )

        assert 0.99 <= total <= 1.01

    def test_custom_values(self):
        """Test custom configuration."""
        from cyntra.memory.surfacing import SurfacingConfig

        config = SurfacingConfig(
            max_memories=50,
            semantic_threshold=0.8,
        )

        assert config.max_memories == 50
        assert config.semantic_threshold == 0.8


class TestMemorySurfacingService:
    """Tests for MemorySurfacingService class."""

    @pytest.fixture
    def mock_store(self):
        """Create mock memory store."""
        store = MagicMock()
        store.search_similar = AsyncMock(return_value=[])
        store.search_by_tags = AsyncMock(return_value=[])
        store.search_by_files = AsyncMock(return_value=[])
        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector operations."""
        ops = MagicMock()
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        return ops

    @pytest.fixture
    def mock_linking_service(self):
        """Create mock linking service."""
        service = MagicMock()
        service.traverse_related = AsyncMock(return_value=[])
        return service

    @pytest.fixture
    def service(self, mock_store, mock_vector_ops, mock_linking_service):
        """Create surfacing service."""
        from cyntra.memory.surfacing import MemorySurfacingService

        return MemorySurfacingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
            linking_service=mock_linking_service,
        )

    @pytest.fixture
    def sample_memories(self):
        """Create sample memories for testing."""
        return [
            AgentMemory(
                id=uuid4(),
                agent_id="claude",
                text="Pattern for API error handling",
                memory_type=MemoryType.PATTERN,
                scope=MemoryScope.INDIVIDUAL,
                importance_score=0.8,
                confidence=0.9,
                issue_tags=["api", "error-handling"],
                file_paths=["src/api.py"],
                similarity_score=0.85,
                created_at=datetime.utcnow(),
            ),
            AgentMemory(
                id=uuid4(),
                agent_id="claude",
                text="Auth module structure",
                memory_type=MemoryType.CONTEXT,
                scope=MemoryScope.INDIVIDUAL,
                importance_score=0.7,
                confidence=0.85,
                issue_tags=["auth"],
                file_paths=["src/auth.py", "src/middleware.py"],
                created_at=datetime.utcnow(),
            ),
        ]

    @pytest.mark.asyncio
    async def test_get_relevant_memories_semantic(
        self, service, mock_store, sample_memories
    ):
        """Test semantic search retrieval."""
        mock_store.search_similar.return_value = [sample_memories[0]]

        memories = await service.get_relevant_memories(
            query_text="How to handle API errors",
            agent_id="claude",
        )

        assert len(memories) == 1
        mock_store.search_similar.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_relevant_memories_by_tags(
        self, service, mock_store, sample_memories
    ):
        """Test tag-based retrieval."""
        mock_store.search_by_tags.return_value = [sample_memories[0]]

        memories = await service.get_relevant_memories(
            query_text="",
            agent_id="claude",
            tags=["api", "error-handling"],
        )

        assert len(memories) >= 1
        mock_store.search_by_tags.assert_called()

    @pytest.mark.asyncio
    async def test_get_relevant_memories_by_files(
        self, service, mock_store, sample_memories
    ):
        """Test file-based retrieval."""
        mock_store.search_by_files.return_value = [sample_memories[1]]

        memories = await service.get_relevant_memories(
            query_text="",
            agent_id="claude",
            file_paths=["src/auth.py"],
        )

        assert len(memories) >= 1
        mock_store.search_by_files.assert_called()

    @pytest.mark.asyncio
    async def test_get_relevant_memories_combined(
        self, service, mock_store, sample_memories
    ):
        """Test combined multi-signal retrieval."""
        mock_store.search_similar.return_value = [sample_memories[0]]
        mock_store.search_by_tags.return_value = [sample_memories[0]]
        mock_store.search_by_files.return_value = [sample_memories[1]]

        memories = await service.get_relevant_memories(
            query_text="Handle API errors in auth",
            agent_id="claude",
            tags=["api"],
            file_paths=["src/auth.py"],
        )

        # Should deduplicate and return unique memories
        assert len(memories) >= 1
        assert len(memories) <= 2

    @pytest.mark.asyncio
    async def test_get_relevant_memories_with_limit(
        self, service, mock_store, sample_memories
    ):
        """Test retrieval respects limit."""
        mock_store.search_similar.return_value = sample_memories

        memories = await service.get_relevant_memories(
            query_text="Test query",
            agent_id="claude",
            limit=1,
        )

        assert len(memories) <= 1

    @pytest.mark.asyncio
    async def test_get_relevant_memories_empty(self, service, mock_store):
        """Test retrieval with no matches."""
        memories = await service.get_relevant_memories(
            query_text="No matches",
            agent_id="claude",
        )

        assert memories == []


class TestGenerateFingerprint:
    """Tests for fingerprint generation."""

    @pytest.fixture
    def service(self):
        """Create service with mock dependencies."""
        from cyntra.memory.surfacing import MemorySurfacingService

        store = MagicMock()
        vector_ops = MagicMock()
        vector_ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)

        return MemorySurfacingService(
            store=store,
            vector_ops=vector_ops,
        )

    @pytest.mark.asyncio
    async def test_generate_fingerprint(self, service):
        """Test fingerprint generation."""
        fingerprint, embedding = await service.generate_fingerprint(
            "Test query text"
        )

        assert isinstance(fingerprint, str)
        assert len(fingerprint) == 32  # MD5 hex
        assert len(embedding) == 768

    @pytest.mark.asyncio
    async def test_generate_fingerprint_deterministic(self, service):
        """Test fingerprint is deterministic."""
        fp1, _ = await service.generate_fingerprint("Same text")
        fp2, _ = await service.generate_fingerprint("Same text")

        assert fp1 == fp2


class TestExpandViaLinks:
    """Tests for link-based expansion."""

    @pytest.fixture
    def mock_linking_service(self):
        """Create mock linking service."""
        service = MagicMock()
        service.traverse_related = AsyncMock(return_value=[])
        return service

    @pytest.fixture
    def service(self, mock_linking_service):
        """Create surfacing service."""
        from cyntra.memory.surfacing import MemorySurfacingService

        store = MagicMock()
        vector_ops = MagicMock()

        return MemorySurfacingService(
            store=store,
            vector_ops=vector_ops,
            linking_service=mock_linking_service,
        )

    @pytest.mark.asyncio
    async def test_expand_via_links_empty(self, service):
        """Test expansion with no links."""
        related = await service.expand_via_links(
            memory_ids=[uuid4()],
            max_depth=2,
        )

        assert related == []

    @pytest.mark.asyncio
    async def test_expand_via_links_with_results(
        self, service, mock_linking_service
    ):
        """Test expansion returns linked memories."""
        linked_memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Linked memory",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )
        mock_linking_service.traverse_related.return_value = [linked_memory]

        starting_id = uuid4()
        related = await service.expand_via_links(
            memory_ids=[starting_id],
            max_depth=1,
        )

        assert len(related) == 1
        assert related[0].id == linked_memory.id

    @pytest.mark.asyncio
    async def test_expand_via_links_no_service(self):
        """Test expansion without linking service."""
        from cyntra.memory.surfacing import MemorySurfacingService

        service = MemorySurfacingService(
            store=MagicMock(),
            vector_ops=MagicMock(),
            linking_service=None,  # No linking service
        )

        related = await service.expand_via_links([uuid4()])

        assert related == []


class TestAddMemoryScoring:
    """Tests for _add_memory helper method."""

    @pytest.fixture
    def service(self):
        """Create service."""
        from cyntra.memory.surfacing import MemorySurfacingService

        return MemorySurfacingService(
            store=MagicMock(),
            vector_ops=MagicMock(),
        )

    def test_add_new_memory(self, service):
        """Test adding new memory to results."""
        memories = {}
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )

        service._add_memory(memories, memory, 0.5)

        assert memory.id in memories
        assert memories[memory.id][1] == 0.5

    def test_add_memory_higher_score(self, service):
        """Test adding memory with higher score updates."""
        memories = {}
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )

        service._add_memory(memories, memory, 0.3)
        service._add_memory(memories, memory, 0.7)

        assert memories[memory.id][1] == 0.7

    def test_add_memory_lower_score_keeps_higher(self, service):
        """Test that lower score doesn't replace higher."""
        memories = {}
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )

        service._add_memory(memories, memory, 0.8)
        service._add_memory(memories, memory, 0.3)

        assert memories[memory.id][1] == 0.8


class TestIssueFingerprinter:
    """Tests for IssueFingerprinter class."""

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector ops."""
        ops = MagicMock()
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        return ops

    @pytest.fixture
    def fingerprinter(self, mock_vector_ops):
        """Create fingerprinter."""
        from cyntra.memory.surfacing import IssueFingerprinter

        return IssueFingerprinter(vector_ops=mock_vector_ops)

    @pytest.mark.asyncio
    async def test_fingerprint_issue_basic(self, fingerprinter):
        """Test basic issue fingerprinting."""
        fingerprint, embedding = await fingerprinter.fingerprint_issue(
            title="Fix API error handling",
            body="The API throws 500 errors on invalid input",
        )

        assert isinstance(fingerprint, str)
        assert len(fingerprint) == 32
        assert len(embedding) == 768

    @pytest.mark.asyncio
    async def test_fingerprint_issue_with_tags(self, fingerprinter):
        """Test issue fingerprinting with tags."""
        fingerprint, embedding = await fingerprinter.fingerprint_issue(
            title="Add authentication",
            body="Implement JWT-based auth",
            tags=["feature", "security", "auth"],
        )

        assert isinstance(fingerprint, str)
        assert len(embedding) == 768

    @pytest.mark.asyncio
    async def test_fingerprint_issue_long_body(self, fingerprinter, mock_vector_ops):
        """Test fingerprinting with long body is truncated."""
        long_body = "x" * 5000

        await fingerprinter.fingerprint_issue(
            title="Test",
            body=long_body,
        )

        # Should have been called with truncated text
        call_args = mock_vector_ops.generate_embedding.call_args[0][0]
        assert len(call_args) < len(long_body) + 100  # Plus title
