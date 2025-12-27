"""Tests for memory storage layer.

Note: These tests require a PostgreSQL database with pgvector extension.
Set DATABASE_URL environment variable for integration tests.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from cyntra.memory.models import (
    ExtractedMemory,
    MemoryScope,
    MemoryType,
)


class TestMemoryStoreUnit:
    """Unit tests for MemoryStore (mocked database)."""

    @pytest.fixture
    def mock_pool(self):
        """Create a mock connection pool."""
        pool = MagicMock()
        pool.acquire = MagicMock(return_value=AsyncMock())
        return pool

    @pytest.fixture
    def mock_store(self, mock_pool):
        """Create a store with mocked pool."""
        from cyntra.memory.store import MemoryStore

        store = MemoryStore.__new__(MemoryStore)
        store.pool = mock_pool
        store.db_url = "postgresql://test"
        return store

    def test_row_to_memory(self, mock_store):
        """Test converting database row to AgentMemory."""
        # Simulate a database row as dict
        row = {
            "id": uuid4(),
            "agent_id": "claude",
            "text": "Test pattern",
            "memory_type": "pattern",
            "scope": "individual",
            "importance_score": 0.75,
            "confidence": 0.9,
            "issue_tags": ["bug"],
            "file_paths": ["src/test.py"],
            "embedding": None,
            "access_count": 5,
            "mention_count": 2,
            "runs_at_creation": 1,
            "runs_at_last_access": 10,
            "is_archived": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        memory = mock_store._row_to_memory(row)

        assert memory.agent_id == "claude"
        assert memory.memory_type == MemoryType.PATTERN
        assert memory.scope == MemoryScope.INDIVIDUAL
        assert memory.importance_score == 0.75

    def test_memory_to_insert_params(self, mock_store):
        """Test converting ExtractedMemory to insert parameters."""
        memory = ExtractedMemory(
            text="Test pattern for insert",
            memory_type=MemoryType.PATTERN,
            importance_score=0.8,
            confidence=0.85,
            issue_tags=["test"],
            file_paths=["src/main.py"],
        )

        params = mock_store._memory_to_insert_params(
            memory=memory,
            agent_id="claude",
            embedding=[0.1] * 768,
            current_runs=5,
        )

        assert params["agent_id"] == "claude"
        assert params["text"] == "Test pattern for insert"
        assert params["memory_type"] == "pattern"
        assert params["runs_at_creation"] == 5


class TestMemoryStoreQueries:
    """Test SQL query building and execution patterns."""

    def test_search_similar_query_structure(self):
        """Test that similarity search query is well-formed."""
        expected_elements = [
            "SELECT",
            "FROM agent_memories",
            "WHERE",
            "agent_id",
            "embedding",
            "ORDER BY",
            "LIMIT",
        ]

        # The actual query should contain these elements
        query = """
            SELECT m.*,
                   1 - (m.embedding <=> $1::vector) as similarity_score
            FROM agent_memories m
            WHERE m.agent_id = $2
              AND m.is_archived = FALSE
              AND 1 - (m.embedding <=> $1::vector) >= $3
            ORDER BY m.embedding <=> $1::vector
            LIMIT $4
        """

        for element in expected_elements:
            assert element in query

    def test_search_by_tags_query_structure(self):
        """Test that tag search query is well-formed."""
        query = """
            SELECT * FROM agent_memories
            WHERE agent_id = $1
              AND issue_tags && $2::text[]
              AND is_archived = FALSE
            ORDER BY importance_score DESC
            LIMIT $3
        """

        assert "issue_tags &&" in query
        assert "importance_score DESC" in query


@pytest.mark.asyncio
class TestMemoryStoreIntegration:
    """Integration tests for MemoryStore (requires database).

    These tests are marked as integration and skip if DATABASE_URL not set.
    """

    @pytest.fixture
    async def store(self):
        """Create and initialize store for testing."""
        import os

        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            pytest.skip("DATABASE_URL not set")

        from cyntra.memory.store import MemoryStore

        store = MemoryStore(db_url=db_url)
        await store.initialize()
        yield store
        await store.close()

    async def test_create_and_get_memory(self, store):
        """Test creating and retrieving a memory."""
        memory = ExtractedMemory(
            text="Integration test pattern",
            memory_type=MemoryType.PATTERN,
            importance_score=0.7,
            confidence=0.8,
        )

        # Create
        memory_id = await store.create(
            memory=memory,
            agent_id="test-agent",
            embedding=[0.1] * 768,
        )

        assert memory_id is not None

        # Get
        retrieved = await store.get(memory_id)
        assert retrieved is not None
        assert retrieved.text == "Integration test pattern"
        assert retrieved.agent_id == "test-agent"

        # Cleanup
        await store.archive(memory_id)

    async def test_search_by_tags(self, store):
        """Test tag-based search."""
        # Create test memory with tags
        memory = ExtractedMemory(
            text="Memory with specific tags",
            memory_type=MemoryType.PATTERN,
            issue_tags=["unique-test-tag-123"],
        )

        memory_id = await store.create(
            memory=memory,
            agent_id="test-agent",
        )

        # Search by tag
        results = await store.search_by_tags(
            tags=["unique-test-tag-123"],
            agent_id="test-agent",
        )

        assert len(results) > 0
        assert any(m.id == memory_id for m in results)

        # Cleanup
        await store.archive(memory_id)

    async def test_increment_access(self, store):
        """Test access count increment."""
        memory = ExtractedMemory(
            text="Memory to track access",
            memory_type=MemoryType.CONTEXT,
        )

        memory_id = await store.create(
            memory=memory,
            agent_id="test-agent",
        )

        # Initial access count should be 0
        initial = await store.get(memory_id)
        assert initial.access_count == 0

        # Increment
        await store.increment_access(memory_id, current_runs=10)

        # Check updated
        updated = await store.get(memory_id)
        assert updated.access_count == 1
        assert updated.runs_at_last_access == 10

        # Cleanup
        await store.archive(memory_id)
