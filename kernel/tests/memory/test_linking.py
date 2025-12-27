"""Tests for relationship linking service."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from cyntra.memory.models import (
    AgentMemory,
    LinkType,
    MemoryLink,
    MemoryScope,
    MemoryType,
)


class TestLinkingService:
    """Tests for LinkingService class."""

    @pytest.fixture
    def mock_store(self):
        """Create mock memory store."""
        store = MagicMock()
        store.search_similar = AsyncMock(return_value=[])
        store.search_by_tags = AsyncMock(return_value=[])
        store.create_link = AsyncMock(return_value=True)
        store.get_links = AsyncMock(return_value={"inbound": [], "outbound": []})
        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector operations."""
        ops = MagicMock()
        ops.cosine_similarity = MagicMock(return_value=0.85)
        return ops

    @pytest.fixture
    def mock_llm_client(self):
        """Create mock LLM client."""
        client = MagicMock()
        client.messages = MagicMock()
        client.messages.create = AsyncMock()
        return client

    @pytest.fixture
    def sample_memory(self):
        """Create sample memory for testing."""
        return AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Pattern for handling API errors",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.75,
            confidence=0.9,
            issue_tags=["api", "error-handling"],
            file_paths=["src/api.py"],
            embedding=[0.1] * 768,
            created_at=datetime.utcnow(),
        )

    def test_linking_config_defaults(self):
        """Test default linking configuration."""
        from cyntra.memory.linking import LinkingConfig

        config = LinkingConfig()

        assert config.similarity_threshold == 0.7
        assert config.max_candidates == 10
        assert config.min_confidence == 0.6

    @pytest.mark.asyncio
    async def test_find_link_candidates(self, mock_store, mock_vector_ops, sample_memory):
        """Test finding candidate memories for linking."""
        from cyntra.memory.linking import LinkingService

        # Setup mock to return candidate memories
        candidate = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Another API pattern",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.85,
            issue_tags=["api"],
            embedding=[0.15] * 768,
            created_at=datetime.utcnow(),
        )
        mock_store.search_similar.return_value = [candidate]

        service = LinkingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        candidates = await service.find_link_candidates(sample_memory)

        assert len(candidates) == 1
        assert mock_store.search_similar.called

    @pytest.mark.asyncio
    async def test_classify_relationship_supersedes(
        self, mock_store, mock_vector_ops, mock_llm_client, sample_memory
    ):
        """Test classifying relationship as supersedes."""
        from cyntra.memory.linking import LinkingService

        # Setup LLM to return supersedes relationship
        mock_llm_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text='{"link_type": "supersedes", "confidence": 0.85}')]
        )

        older_memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Old API pattern",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.6,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )

        service = LinkingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
            llm_client=mock_llm_client,
        )

        link = await service.classify_relationship(sample_memory, older_memory)

        assert link is not None
        assert link.link_type == LinkType.SUPERSEDES
        assert link.confidence >= 0.8

    @pytest.mark.asyncio
    async def test_classify_no_relationship(
        self, mock_store, mock_vector_ops, mock_llm_client, sample_memory
    ):
        """Test when no relationship is found."""
        from cyntra.memory.linking import LinkingService

        # Setup LLM to return no relationship
        mock_llm_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text='{"link_type": null, "confidence": 0.2}')]
        )

        unrelated_memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Unrelated memory about database",
            memory_type=MemoryType.CONTEXT,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.5,
            confidence=0.7,
            created_at=datetime.utcnow(),
        )

        service = LinkingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
            llm_client=mock_llm_client,
        )

        link = await service.classify_relationship(sample_memory, unrelated_memory)

        assert link is None

    @pytest.mark.asyncio
    async def test_create_bidirectional_link(self, mock_store, mock_vector_ops):
        """Test creating bidirectional links."""
        from cyntra.memory.linking import LinkingService

        link = MemoryLink(
            source_id=uuid4(),
            target_id=uuid4(),
            link_type=LinkType.CONFLICTS,
            confidence=0.9,
        )

        service = LinkingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        await service.create_bidirectional_link(link)

        # Should create both directions
        assert mock_store.create_link.call_count == 2

    @pytest.mark.asyncio
    async def test_traverse_related(self, mock_store, mock_vector_ops, sample_memory):
        """Test traversing related memories."""
        from cyntra.memory.linking import LinkingService

        related_memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Related memory",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )

        mock_store.get_links.return_value = {
            "inbound": [],
            "outbound": [{"uuid": str(related_memory.id), "type": "improves_on"}],
        }
        mock_store.get = AsyncMock(return_value=related_memory)

        service = LinkingService(
            store=mock_store,
            vector_ops=mock_vector_ops,
        )

        related = await service.traverse_related(
            memory_id=sample_memory.id,
            max_depth=1,
        )

        assert len(related) == 1
        assert related[0].id == related_memory.id


class TestLinkTypes:
    """Tests for link type classification logic."""

    def test_all_link_types_have_values(self):
        """Test that all link types have string values."""
        for lt in LinkType:
            assert isinstance(lt.value, str)
            assert len(lt.value) > 0

    def test_bidirectional_link_types(self):
        """Test identifying bidirectional link types."""
        # These link types should create links in both directions
        bidirectional = [
            LinkType.CONFLICTS,
            LinkType.CAUSES,
        ]

        for lt in bidirectional:
            assert lt in LinkType

    def test_asymmetric_link_types(self):
        """Test identifying asymmetric link types."""
        # These link types are directional
        asymmetric = [
            LinkType.SUPERSEDES,
            LinkType.INVALIDATED_BY,
            LinkType.IMPROVES_ON,
            LinkType.REQUIRES,
        ]

        for lt in asymmetric:
            assert lt in LinkType
