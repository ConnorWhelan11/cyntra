"""Tests for working memory trinkets."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime

from cyntra.memory.models import AgentMemory, MemoryType, MemoryScope
from cyntra.memory.trinkets.base import RunContext, AgentTrinket


class TestRunContext:
    """Tests for RunContext dataclass."""

    def test_create_minimal_context(self):
        """Test creating minimal run context."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
        )

        assert ctx.agent_id == "claude"
        assert ctx.run_id == "run-123"
        assert ctx.issue_title is None
        assert ctx.retry_count == 0

    def test_create_full_context(self):
        """Test creating full run context."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            issue_id="issue-456",
            issue_title="Fix API error handling",
            issue_tags=["api", "bug"],
            target_files=["src/api.py", "src/handler.py"],
            world_name="outora-library",
            retry_count=2,
            last_fail_code="GATE_FAILED",
            last_error="pytest failed with 3 errors",
            previous_runs=[
                {"status": "failed", "summary": "First attempt failed"},
                {"status": "failed", "summary": "Second attempt also failed"},
            ],
            current_runs_count=50,
        )

        assert ctx.issue_title == "Fix API error handling"
        assert "api" in ctx.issue_tags
        assert ctx.retry_count == 2
        assert len(ctx.previous_runs) == 2


class TestAgentTrinket:
    """Tests for AgentTrinket base class."""

    def test_trinket_priority(self):
        """Test trinket priority ordering."""
        from cyntra.memory.trinkets.task_context import TaskContextTrinket
        from cyntra.memory.trinkets.patterns import PatternsTrinket

        task_trinket = TaskContextTrinket()
        patterns_trinket = PatternsTrinket(store=MagicMock())

        # Task context should have highest priority
        assert task_trinket.priority > patterns_trinket.priority

    def test_trinket_cache_policy(self):
        """Test trinket cache policy settings."""
        from cyntra.memory.trinkets.task_context import TaskContextTrinket
        from cyntra.memory.trinkets.codebase import CodebaseTrinket

        task_trinket = TaskContextTrinket()
        codebase_trinket = CodebaseTrinket(store=MagicMock())

        # Task context is dynamic (not cached)
        assert task_trinket.cache_policy is False
        # Codebase is stable (cached)
        assert codebase_trinket.cache_policy is True


class TestTaskContextTrinket:
    """Tests for TaskContextTrinket."""

    @pytest.fixture
    def trinket(self):
        """Create task context trinket."""
        from cyntra.memory.trinkets.task_context import TaskContextTrinket

        return TaskContextTrinket()

    @pytest.mark.asyncio
    async def test_generate_content_basic(self, trinket):
        """Test basic content generation."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            issue_title="Fix bug in parser",
            issue_tags=["bug", "parser"],
        )

        content = await trinket.generate_content(ctx)

        assert "Fix bug in parser" in content
        assert "bug" in content

    @pytest.mark.asyncio
    async def test_generate_content_with_retry(self, trinket):
        """Test content generation with retry context."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            issue_title="Fix failing test",
            retry_count=2,
            last_fail_code="PYTEST_FAILED",
            last_error="AssertionError in test_main.py",
        )

        content = await trinket.generate_content(ctx)

        assert "Retry #2" in content
        assert "PYTEST_FAILED" in content

    @pytest.mark.asyncio
    async def test_should_include_always_true(self, trinket):
        """Test that task context is always included."""
        ctx = RunContext(agent_id="claude", run_id="run-123")

        assert await trinket.should_include(ctx) is True


class TestPatternsTrinket:
    """Tests for PatternsTrinket."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.search_similar = AsyncMock(return_value=[])
        store.search_by_tags = AsyncMock(return_value=[])
        store.search_by_type = AsyncMock(return_value=[])
        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector ops."""
        ops = MagicMock()
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        return ops

    @pytest.fixture
    def trinket(self, mock_store, mock_vector_ops):
        """Create patterns trinket."""
        from cyntra.memory.trinkets.patterns import PatternsTrinket

        return PatternsTrinket(store=mock_store, vector_ops=mock_vector_ops)

    @pytest.mark.asyncio
    async def test_generate_content_with_patterns(
        self, trinket, mock_store, mock_vector_ops
    ):
        """Test content generation with patterns found."""
        # Setup mock to return patterns
        pattern = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="When handling API errors, always log the status code",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            created_at=datetime.utcnow(),
        )
        mock_store.search_similar.return_value = [pattern]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            issue_title="Handle API errors",
        )

        content = await trinket.generate_content(ctx)

        assert "API errors" in content or "status code" in content

    @pytest.mark.asyncio
    async def test_should_include_with_issue(self, trinket):
        """Test inclusion check with issue context."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            issue_title="Some issue",
        )

        assert await trinket.should_include(ctx) is True


class TestFailuresTrinket:
    """Tests for FailuresTrinket."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.search_by_type = AsyncMock(return_value=[])
        store.search_by_tags = AsyncMock(return_value=[])
        return store

    @pytest.fixture
    def trinket(self, mock_store):
        """Create failures trinket."""
        from cyntra.memory.trinkets.failures import FailuresTrinket

        return FailuresTrinket(store=mock_store)

    @pytest.mark.asyncio
    async def test_generate_content_with_failures(self, trinket, mock_store):
        """Test content generation with failure patterns."""
        failure = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Don't modify config files without backup",
            memory_type=MemoryType.FAILURE,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.85,
            confidence=0.9,
            created_at=datetime.utcnow(),
        )
        mock_store.search_by_type.return_value = [failure]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            issue_title="Update configuration",
        )

        content = await trinket.generate_content(ctx)

        assert "config" in content or "backup" in content


class TestDynamicsTrinket:
    """Tests for DynamicsTrinket."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.search_by_type = AsyncMock(return_value=[])
        return store

    @pytest.fixture
    def trinket(self, mock_store):
        """Create dynamics trinket."""
        from cyntra.memory.trinkets.dynamics import DynamicsTrinket

        return DynamicsTrinket(store=mock_store)

    @pytest.mark.asyncio
    async def test_generate_content_with_dynamics(self, trinket, mock_store):
        """Test content generation with dynamics."""
        dynamic = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Tests typically take 2-3 iterations to pass for API changes",
            memory_type=MemoryType.DYNAMIC,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.7,
            confidence=0.8,
            created_at=datetime.utcnow(),
        )
        mock_store.search_by_type.return_value = [dynamic]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
        )

        content = await trinket.generate_content(ctx)

        assert len(content) > 0


class TestComposer:
    """Tests for AgentPromptComposer."""

    @pytest.fixture
    def mock_trinkets(self):
        """Create mock trinkets."""
        task_trinket = MagicMock()
        task_trinket.priority = 100
        task_trinket.cache_policy = False
        task_trinket.get_section_name.return_value = "Task Context"
        task_trinket.should_include = AsyncMock(return_value=True)
        task_trinket.generate_content = AsyncMock(return_value="Task: Fix bug")

        pattern_trinket = MagicMock()
        pattern_trinket.priority = 80
        pattern_trinket.cache_policy = False
        pattern_trinket.get_section_name.return_value = "Patterns"
        pattern_trinket.should_include = AsyncMock(return_value=True)
        pattern_trinket.generate_content = AsyncMock(return_value="Pattern 1: Check first")

        return [task_trinket, pattern_trinket]

    @pytest.mark.asyncio
    async def test_compose_basic(self, mock_trinkets):
        """Test basic prompt composition."""
        from cyntra.memory.composer import AgentPromptComposer

        composer = AgentPromptComposer(
            trinkets=mock_trinkets,
            base_prompt="You are a helpful assistant.",
        )

        ctx = RunContext(agent_id="claude", run_id="run-123")
        result = await composer.compose(ctx)

        assert result.cached_content is not None
        assert "helpful assistant" in result.cached_content
        assert result.dynamic_content is not None

    @pytest.mark.asyncio
    async def test_compose_respects_priority(self, mock_trinkets):
        """Test that composition respects trinket priority."""
        from cyntra.memory.composer import AgentPromptComposer

        composer = AgentPromptComposer(trinkets=mock_trinkets)

        ctx = RunContext(agent_id="claude", run_id="run-123")
        result = await composer.compose(ctx)

        # Higher priority should come first
        combined = result.to_system_prompt()
        task_pos = combined.find("Task")
        pattern_pos = combined.find("Pattern")

        if task_pos != -1 and pattern_pos != -1:
            assert task_pos < pattern_pos

    @pytest.mark.asyncio
    async def test_compose_skips_excluded_trinkets(self):
        """Test that excluded trinkets are skipped."""
        from cyntra.memory.composer import AgentPromptComposer

        excluded_trinket = MagicMock()
        excluded_trinket.priority = 50
        excluded_trinket.should_include = AsyncMock(return_value=False)
        excluded_trinket.generate_content = AsyncMock(return_value="Should not appear")

        composer = AgentPromptComposer(trinkets=[excluded_trinket])

        ctx = RunContext(agent_id="claude", run_id="run-123")
        result = await composer.compose(ctx)

        assert "Should not appear" not in result.to_system_prompt()


class TestPlaybookTrinket:
    """Tests for PlaybookTrinket."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.search_by_type = AsyncMock(return_value=[])
        return store

    @pytest.fixture
    def mock_vector_ops(self):
        """Create mock vector ops."""
        ops = MagicMock()
        ops.generate_embedding = AsyncMock(return_value=[0.1] * 768)
        ops.cosine_similarity = MagicMock(return_value=0.8)
        return ops

    @pytest.fixture
    def trinket(self, mock_store, mock_vector_ops):
        """Create playbook trinket."""
        from cyntra.memory.trinkets.playbook import PlaybookTrinket

        return PlaybookTrinket(
            store=mock_store,
            vector_ops=mock_vector_ops,
            max_instructions=3,
        )

    def test_priority(self, trinket):
        """Test playbook has high priority."""
        assert trinket.priority == 90

    def test_get_section_name(self, trinket):
        """Test section name."""
        assert trinket.get_section_name() == "Repair Instructions"

    @pytest.mark.asyncio
    async def test_should_include_on_retry(self, trinket):
        """Test inclusion on retry with error."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            retry_count=2,
            last_error="TypeError: undefined is not a function",
            last_fail_code="GATE_FAILED",
        )

        assert await trinket.should_include(ctx) is True

    @pytest.mark.asyncio
    async def test_should_not_include_first_try(self, trinket):
        """Test exclusion on first attempt."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            retry_count=0,
        )

        assert await trinket.should_include(ctx) is False

    @pytest.mark.asyncio
    async def test_should_not_include_retry_without_error(self, trinket):
        """Test exclusion on retry without error info."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            retry_count=1,
            last_error=None,
            last_fail_code=None,
        )

        assert await trinket.should_include(ctx) is False

    @pytest.mark.asyncio
    async def test_generate_content_no_error(self, trinket):
        """Test content generation without error."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
        )

        content = await trinket.generate_content(ctx)

        assert content == ""

    @pytest.mark.asyncio
    async def test_generate_content_with_playbooks(
        self, trinket, mock_store, mock_vector_ops
    ):
        """Test content generation with playbooks found."""
        playbook = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="On GATE_FAILED, check the test output and fix failing assertions",
            memory_type=MemoryType.PLAYBOOK,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.9,
            confidence=0.95,
            embedding=[0.1] * 768,
            created_at=datetime.utcnow(),
        )
        mock_store.search_by_type.return_value = [playbook]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            retry_count=2,
            last_error="AssertionError in test_main.py",
            last_fail_code="GATE_FAILED",
        )

        content = await trinket.generate_content(ctx)

        assert "GATE_FAILED" in content
        assert "Repair Instructions" not in content  # Section name is separate
        assert "1." in content


class TestCodebaseTrinket:
    """Tests for CodebaseTrinket."""

    @pytest.fixture
    def mock_store(self):
        """Create mock store."""
        store = MagicMock()
        store.search_by_files = AsyncMock(return_value=[])
        store.search_by_tags = AsyncMock(return_value=[])
        return store

    @pytest.fixture
    def trinket(self, mock_store):
        """Create codebase trinket."""
        from cyntra.memory.trinkets.codebase import CodebaseTrinket

        return CodebaseTrinket(store=mock_store, max_context=5)

    def test_priority(self, trinket):
        """Test codebase has medium priority."""
        assert trinket.priority == 50

    def test_cache_policy(self, trinket):
        """Test codebase uses caching."""
        assert trinket.cache_policy is True

    def test_get_section_name(self, trinket):
        """Test section name."""
        assert trinket.get_section_name() == "Codebase Context"

    @pytest.mark.asyncio
    async def test_should_include_with_files(self, trinket):
        """Test inclusion when files are specified."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            target_files=["src/main.py"],
        )

        assert await trinket.should_include(ctx) is True

    @pytest.mark.asyncio
    async def test_should_not_include_without_files(self, trinket):
        """Test exclusion without file targets."""
        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
        )

        assert await trinket.should_include(ctx) is False

    @pytest.mark.asyncio
    async def test_generate_content_with_context(self, trinket, mock_store):
        """Test content generation with context found."""
        context = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="The auth module handles JWT token validation and refresh",
            memory_type=MemoryType.CONTEXT,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            file_paths=["src/auth.py"],
            created_at=datetime.utcnow(),
        )
        mock_store.search_by_files.return_value = [context]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            target_files=["src/auth.py"],
        )

        content = await trinket.generate_content(ctx)

        assert "auth module" in content
        assert "JWT token" in content

    @pytest.mark.asyncio
    async def test_generate_content_deduplicates(self, trinket, mock_store):
        """Test content deduplication."""
        memory_id = uuid4()
        context = AgentMemory(
            id=memory_id,
            agent_id="claude",
            text="Shared context",
            memory_type=MemoryType.CONTEXT,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            file_paths=["src/shared.py"],
            issue_tags=["api"],
            created_at=datetime.utcnow(),
        )

        # Same memory returned from both queries
        mock_store.search_by_files.return_value = [context]
        mock_store.search_by_tags.return_value = [context]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            target_files=["src/shared.py"],
            issue_tags=["api"],
        )

        content = await trinket.generate_content(ctx)

        # Should only appear once
        assert content.count("Shared context") == 1

    @pytest.mark.asyncio
    async def test_generate_content_filters_by_type(self, trinket, mock_store):
        """Test that only CONTEXT type is included."""
        pattern = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Pattern not context",
            memory_type=MemoryType.PATTERN,  # Not CONTEXT
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.8,
            confidence=0.9,
            file_paths=["src/api.py"],
            created_at=datetime.utcnow(),
        )
        mock_store.search_by_files.return_value = [pattern]

        ctx = RunContext(
            agent_id="claude",
            run_id="run-123",
            target_files=["src/api.py"],
        )

        content = await trinket.generate_content(ctx)

        # Pattern should be filtered out
        assert "Pattern not context" not in content
