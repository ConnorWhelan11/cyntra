"""Tests for collective memory service."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime

from cyntra.memory.models import AgentMemory, MemoryType, MemoryScope


class TestPromotionCriteria:
    """Tests for PromotionCriteria dataclass."""

    def test_default_values(self):
        """Test default criteria values."""
        from cyntra.memory.collective import PromotionCriteria

        criteria = PromotionCriteria()

        assert criteria.pattern_min_agents == 3
        assert criteria.pattern_min_confidence == 0.8
        assert criteria.dynamic_min_sample_size == 10
        assert criteria.dynamic_min_confidence == 0.85
        assert criteria.min_importance == 0.6
        assert criteria.min_access_count == 3

    def test_custom_values(self):
        """Test custom criteria values."""
        from cyntra.memory.collective import PromotionCriteria

        criteria = PromotionCriteria(
            pattern_min_agents=5,
            min_importance=0.7,
        )

        assert criteria.pattern_min_agents == 5
        assert criteria.min_importance == 0.7


class TestCollectiveMemoryService:
    """Tests for CollectiveMemoryService class."""

    @pytest.fixture
    def mock_store(self):
        """Create mock memory store."""
        store = MagicMock()
        store.get = AsyncMock(return_value=None)
        store.update = AsyncMock()
        store.pool = MagicMock()
        store.pool.acquire = MagicMock(return_value=AsyncMock())
        store._row_to_memory = MagicMock()
        return store

    @pytest.fixture
    def service(self, mock_store):
        """Create collective memory service."""
        from cyntra.memory.collective import CollectiveMemoryService

        return CollectiveMemoryService(store=mock_store)

    @pytest.fixture
    def sample_pattern(self):
        """Create sample pattern memory."""
        return AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="When debugging API issues, check logs first",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.75,
            confidence=0.9,
            access_count=5,
            created_at=datetime.utcnow(),
        )

    @pytest.mark.asyncio
    async def test_promote_to_collective_not_found(self, service, mock_store):
        """Test promotion of non-existent memory."""
        mock_store.get.return_value = None

        result = await service.promote_to_collective(
            memory_id=uuid4(),
            validation_agents=["claude", "codex", "opencode"],
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_promote_already_collective(self, service, mock_store, sample_pattern):
        """Test promotion of already collective memory."""
        sample_pattern.scope = MemoryScope.COLLECTIVE
        mock_store.get.return_value = sample_pattern

        result = await service.promote_to_collective(memory_id=sample_pattern.id)

        assert result is True
        mock_store.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_promote_pattern_success(self, service, mock_store, sample_pattern):
        """Test successful pattern promotion."""
        mock_store.get.return_value = sample_pattern

        result = await service.promote_to_collective(
            memory_id=sample_pattern.id,
            validation_agents=["claude", "codex", "opencode"],
        )

        assert result is True
        mock_store.update.assert_called_once()
        call_args = mock_store.update.call_args
        assert call_args[1]["updates"]["scope"] == MemoryScope.COLLECTIVE.value

    @pytest.mark.asyncio
    async def test_promote_fails_low_importance(self, service, mock_store, sample_pattern):
        """Test promotion fails with low importance."""
        sample_pattern.importance_score = 0.3
        mock_store.get.return_value = sample_pattern

        result = await service.promote_to_collective(
            memory_id=sample_pattern.id,
            validation_agents=["claude", "codex", "opencode"],
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_promote_fails_low_access_count(self, service, mock_store, sample_pattern):
        """Test promotion fails with low access count."""
        sample_pattern.access_count = 1
        mock_store.get.return_value = sample_pattern

        result = await service.promote_to_collective(
            memory_id=sample_pattern.id,
            validation_agents=["claude", "codex", "opencode"],
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_promote_fails_insufficient_agents(self, service, mock_store, sample_pattern):
        """Test promotion fails with insufficient validating agents."""
        mock_store.get.return_value = sample_pattern

        result = await service.promote_to_collective(
            memory_id=sample_pattern.id,
            validation_agents=["claude"],  # Only 1 agent
        )

        assert result is False


class TestPromotionCriteriaChecks:
    """Tests for check_promotion_criteria method."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        return MagicMock()

    @pytest.fixture
    def service(self, mock_store):
        """Create service with default criteria."""
        from cyntra.memory.collective import CollectiveMemoryService

        return CollectiveMemoryService(store=mock_store)

    @pytest.mark.asyncio
    async def test_pattern_criteria_met(self, service):
        """Test pattern meets promotion criteria."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test pattern",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.85,
            access_count=5,
            created_at=datetime.utcnow(),
        )

        result = await service.check_promotion_criteria(
            memory=memory,
            validation_agents=["claude", "codex", "opencode"],
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_dynamic_criteria_met(self, service):
        """Test dynamic memory meets promotion criteria."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test dynamic",
            memory_type=MemoryType.DYNAMIC,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            access_count=5,
            created_at=datetime.utcnow(),
        )

        result = await service.check_promotion_criteria(memory=memory)

        assert result is True

    @pytest.mark.asyncio
    async def test_frontier_always_promoted(self, service):
        """Test frontier memories always meet criteria."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Pareto optimal solution",
            memory_type=MemoryType.FRONTIER,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,  # Even with lower importance
            confidence=0.7,
            access_count=5,
            created_at=datetime.utcnow(),
        )

        result = await service.check_promotion_criteria(memory=memory)

        assert result is True

    @pytest.mark.asyncio
    async def test_playbook_needs_high_access(self, service):
        """Test playbook needs high access count."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Repair playbook",
            memory_type=MemoryType.PLAYBOOK,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            access_count=3,  # min_access_count is 3, needs 6
            created_at=datetime.utcnow(),
        )

        result = await service.check_promotion_criteria(memory=memory)

        assert result is False

        # With enough accesses
        memory.access_count = 6
        result = await service.check_promotion_criteria(memory=memory)

        assert result is True


class TestCollectiveQueries:
    """Tests for collective memory query methods."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store with query support."""
        store = MagicMock()
        store.pool = MagicMock()

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])

        store.pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        store.pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        store._row_to_memory = MagicMock(
            side_effect=lambda row: AgentMemory(
                id=uuid4(),
                agent_id="collective",
                text=row.get("text", "test"),
                memory_type=MemoryType.PATTERN,
                scope=MemoryScope.COLLECTIVE,
                importance_score=0.8,
                confidence=0.9,
                created_at=datetime.utcnow(),
            )
        )

        return store

    @pytest.fixture
    def service(self, mock_store):
        """Create service."""
        from cyntra.memory.collective import CollectiveMemoryService

        return CollectiveMemoryService(store=mock_store)

    @pytest.mark.asyncio
    async def test_get_collective_patterns(self, service, mock_store):
        """Test retrieving collective patterns."""
        patterns = await service.get_collective_patterns(limit=10)

        assert isinstance(patterns, list)
        mock_store.pool.acquire.return_value.__aenter__.assert_called()

    @pytest.mark.asyncio
    async def test_get_collective_by_type(self, service, mock_store):
        """Test retrieving collective memories by type."""
        memories = await service.get_collective_by_type(
            memory_type=MemoryType.DYNAMIC,
            limit=20,
        )

        assert isinstance(memories, list)

    @pytest.mark.asyncio
    async def test_find_similar_no_embedding(self, service):
        """Test find_similar_across_agents with no embedding."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="No embedding",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            embedding=None,  # No embedding
            created_at=datetime.utcnow(),
        )

        result = await service.find_similar_across_agents(memory=memory)

        assert result == []
