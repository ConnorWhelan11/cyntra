"""
Unit tests for the hook system.

Tests:
- HookRegistry registration and lookup
- HookRunner execution and filtering
- Hook result handling
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from cyntra.adapters.base import PatchProof
from cyntra.hooks import (
    HookContext,
    HookDefinition,
    HookPriority,
    HookRegistry,
    HookResult,
    HookRunner,
    HookTrigger,
)


@pytest.fixture
def sample_proof() -> PatchProof:
    """Create a sample PatchProof for testing."""
    return PatchProof(
        schema_version="1.0.0",
        workcell_id="wc-test-123",
        issue_id="42",
        status="success",
        patch={"files_modified": ["src/main.py"]},
        verification={"all_passed": True},
        metadata={},
    )


@pytest.fixture
def sample_manifest() -> dict:
    """Create a sample manifest for testing."""
    return {
        "workcell_id": "wc-test-123",
        "issue": {
            "id": "42",
            "title": "Test Issue",
            "tags": ["test-tag"],
        },
    }


@pytest.fixture
def sample_context(tmp_path: Path, sample_proof: PatchProof, sample_manifest: dict) -> HookContext:
    """Create a sample HookContext for testing."""
    return HookContext(
        workcell_path=tmp_path,
        workcell_id="wc-test-123",
        issue_id="42",
        proof=sample_proof,
        manifest=sample_manifest,
    )


class TestHookRegistry:
    """Tests for HookRegistry."""

    def setup_method(self) -> None:
        """Clear registry before each test."""
        HookRegistry.clear()

    def teardown_method(self) -> None:
        """Clear registry after each test."""
        HookRegistry.clear()

    def test_register_hook(self) -> None:
        """Test registering a hook."""
        hook = HookDefinition(
            name="test-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="test", success=True),
        )
        HookRegistry.register(hook)

        hooks = HookRegistry.get_hooks(HookTrigger.POST_EXECUTION)
        assert len(hooks) == 1
        assert hooks[0].name == "test-hook"

    def test_register_multiple_hooks(self) -> None:
        """Test registering multiple hooks."""
        hook1 = HookDefinition(
            name="hook1",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="hook1", success=True),
        )
        hook2 = HookDefinition(
            name="hook2",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="hook2", success=True),
        )

        HookRegistry.register(hook1)
        HookRegistry.register(hook2)

        hooks = HookRegistry.get_hooks(HookTrigger.POST_EXECUTION)
        assert len(hooks) == 2

    def test_hooks_sorted_by_priority(self) -> None:
        """Test that hooks are sorted by priority."""
        late_hook = HookDefinition(
            name="late",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="late", success=True),
            priority=HookPriority.LATE,
        )
        early_hook = HookDefinition(
            name="early",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="early", success=True),
            priority=HookPriority.EARLY,
        )

        # Register in reverse order
        HookRegistry.register(late_hook)
        HookRegistry.register(early_hook)

        hooks = HookRegistry.get_hooks(HookTrigger.POST_EXECUTION)
        assert hooks[0].name == "early"
        assert hooks[1].name == "late"

    def test_get_hooks_different_triggers(self) -> None:
        """Test that hooks are separated by trigger."""
        post_hook = HookDefinition(
            name="post",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="post", success=True),
        )
        failure_hook = HookDefinition(
            name="failure",
            trigger=HookTrigger.ON_GATE_FAILURE,
            handler=lambda ctx: HookResult(hook_name="failure", success=True),
        )

        HookRegistry.register(post_hook)
        HookRegistry.register(failure_hook)

        post_hooks = HookRegistry.get_hooks(HookTrigger.POST_EXECUTION)
        failure_hooks = HookRegistry.get_hooks(HookTrigger.ON_GATE_FAILURE)

        assert len(post_hooks) == 1
        assert len(failure_hooks) == 1
        assert post_hooks[0].name == "post"
        assert failure_hooks[0].name == "failure"

    def test_unregister_hook(self) -> None:
        """Test unregistering a hook."""
        hook = HookDefinition(
            name="test-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="test", success=True),
        )
        HookRegistry.register(hook)
        assert HookRegistry.hook_count() == 1

        result = HookRegistry.unregister("test-hook")
        assert result is True
        assert HookRegistry.hook_count() == 0

    def test_clear_registry(self) -> None:
        """Test clearing all hooks."""
        hook = HookDefinition(
            name="test-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="test", success=True),
        )
        HookRegistry.register(hook)
        assert HookRegistry.hook_count() == 1

        HookRegistry.clear()
        assert HookRegistry.hook_count() == 0


class TestHookRunner:
    """Tests for HookRunner."""

    def setup_method(self) -> None:
        """Clear registry before each test."""
        HookRegistry.clear()

    def teardown_method(self) -> None:
        """Clear registry after each test."""
        HookRegistry.clear()

    def test_run_hooks_in_order(self, sample_context: HookContext) -> None:
        """Test that hooks run in priority order."""
        execution_order: list[str] = []

        def hook1_handler(ctx: HookContext) -> HookResult:
            execution_order.append("hook1")
            return HookResult(hook_name="hook1", success=True)

        def hook2_handler(ctx: HookContext) -> HookResult:
            execution_order.append("hook2")
            return HookResult(hook_name="hook2", success=True)

        HookRegistry.register(
            HookDefinition(
                name="hook1",
                trigger=HookTrigger.POST_EXECUTION,
                handler=hook1_handler,
                priority=HookPriority.EARLY,
            )
        )
        HookRegistry.register(
            HookDefinition(
                name="hook2",
                trigger=HookTrigger.POST_EXECUTION,
                handler=hook2_handler,
                priority=HookPriority.LATE,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)

        assert execution_order == ["hook1", "hook2"]
        assert len(results) == 2
        assert all(r.success for r in results)

    def test_run_hooks_with_tag_filter(self, sample_context: HookContext) -> None:
        """Test that hooks filter by tags."""
        HookRegistry.register(
            HookDefinition(
                name="tagged-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(hook_name="tagged", success=True),
                match_tags=["special-tag"],
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        # Context without matching tag
        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 0

        # Update context to have matching tag
        sample_context.manifest["issue"]["tags"] = ["special-tag"]
        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 1

    def test_run_hooks_with_status_filter(self, sample_context: HookContext) -> None:
        """Test that hooks filter by proof status."""
        HookRegistry.register(
            HookDefinition(
                name="success-only",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(hook_name="success-only", success=True),
                match_status=["success"],
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        # With success status
        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 1

        # Change to failed status
        sample_context.proof.status = "failed"
        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 0

    def test_run_hooks_handles_exception(self, sample_context: HookContext) -> None:
        """Test that hook exceptions are caught."""

        def failing_handler(ctx: HookContext) -> HookResult:
            raise ValueError("Test error")

        HookRegistry.register(
            HookDefinition(
                name="failing-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=failing_handler,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 1
        assert results[0].success is False
        assert "Test error" in str(results[0].error)

    def test_hook_outputs_chaining(self, sample_context: HookContext) -> None:
        """Test that hook outputs are passed to subsequent hooks."""

        def hook1_handler(ctx: HookContext) -> HookResult:
            return HookResult(
                hook_name="hook1",
                success=True,
                output={"key": "value"},
            )

        def hook2_handler(ctx: HookContext) -> HookResult:
            # Check that previous hook output is available
            assert ctx.hook_outputs.get("hook1") == {"key": "value"}
            return HookResult(hook_name="hook2", success=True)

        HookRegistry.register(
            HookDefinition(
                name="hook1",
                trigger=HookTrigger.POST_EXECUTION,
                handler=hook1_handler,
                priority=HookPriority.EARLY,
            )
        )
        HookRegistry.register(
            HookDefinition(
                name="hook2",
                trigger=HookTrigger.POST_EXECUTION,
                handler=hook2_handler,
                priority=HookPriority.LATE,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 2
        assert all(r.success for r in results)

    def test_disabled_hook_not_run(self, sample_context: HookContext) -> None:
        """Test that disabled hooks are not run."""
        HookRegistry.register(
            HookDefinition(
                name="disabled-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(hook_name="disabled", success=True),
                enabled=False,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 0

    def test_exclude_tags_filter(self, sample_context: HookContext) -> None:
        """Test that hooks with exclude_tags are properly filtered."""
        HookRegistry.register(
            HookDefinition(
                name="excluded-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(hook_name="excluded", success=True),
                exclude_tags=["test-tag"],
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        # Context has "test-tag", so hook should be excluded
        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 0

        # Remove the excluded tag
        sample_context.manifest["issue"]["tags"] = ["other-tag"]
        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 1

    def test_global_hooks_disabled(self, sample_context: HookContext) -> None:
        """Test that hooks are skipped when globally disabled."""
        HookRegistry.register(
            HookDefinition(
                name="test-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(hook_name="test", success=True),
            )
        )

        config = MagicMock()
        config.post_execution_hooks = MagicMock()
        config.post_execution_hooks.enabled = False
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)
        assert len(results) == 0

    def test_replace_existing_hook(self) -> None:
        """Test that registering a hook with same name replaces it."""
        hook1 = HookDefinition(
            name="my-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(
                hook_name="my-hook", success=True, output={"version": 1}
            ),
        )
        hook2 = HookDefinition(
            name="my-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(
                hook_name="my-hook", success=True, output={"version": 2}
            ),
        )

        HookRegistry.register(hook1)
        HookRegistry.register(hook2)

        hooks = HookRegistry.get_hooks(HookTrigger.POST_EXECUTION)
        assert len(hooks) == 1
        # Should be the second hook (replacement)
        assert hooks[0] is hook2

    def test_empty_trigger_returns_empty(self, sample_context: HookContext) -> None:
        """Test that empty trigger returns empty list."""
        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.ON_SUCCESS, sample_context)
        assert results == []

    def test_hook_duration_recorded(self, sample_context: HookContext) -> None:
        """Test that hook duration is recorded."""
        import time

        def slow_handler(ctx: HookContext) -> HookResult:
            time.sleep(0.01)  # 10ms
            return HookResult(hook_name="slow", success=True)

        HookRegistry.register(
            HookDefinition(
                name="slow-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=slow_handler,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 1
        assert results[0].duration_ms >= 10


class TestHookRunnerAsync:
    """Tests for async hook runner."""

    def setup_method(self) -> None:
        """Clear registry before each test."""
        HookRegistry.clear()

    def teardown_method(self) -> None:
        """Clear registry after each test."""
        HookRegistry.clear()

    @pytest.mark.asyncio
    async def test_run_hooks_async(self, sample_context: HookContext) -> None:
        """Test async hook execution."""
        HookRegistry.register(
            HookDefinition(
                name="sync-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(hook_name="sync", success=True),
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 1
        assert results[0].success is True

    @pytest.mark.asyncio
    async def test_run_async_handler(self, sample_context: HookContext) -> None:
        """Test execution of async handler."""
        import asyncio

        async def async_handler(ctx: HookContext) -> HookResult:
            await asyncio.sleep(0.001)
            return HookResult(hook_name="async", success=True, output={"async": True})

        HookRegistry.register(
            HookDefinition(
                name="async-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=async_handler,
                async_handler=True,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 1
        assert results[0].success is True
        assert results[0].output["async"] is True

    @pytest.mark.asyncio
    async def test_async_handles_exception(self, sample_context: HookContext) -> None:
        """Test that async exceptions are caught."""

        async def failing_async_handler(ctx: HookContext) -> HookResult:
            raise ValueError("Async error")

        HookRegistry.register(
            HookDefinition(
                name="failing-async",
                trigger=HookTrigger.POST_EXECUTION,
                handler=failing_async_handler,
                async_handler=True,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 1
        assert results[0].success is False
        assert "Async error" in str(results[0].error)

    @pytest.mark.asyncio
    async def test_async_runs_sync_in_executor(self, sample_context: HookContext) -> None:
        """Test that sync handlers run in executor during async execution."""
        execution_thread: list[str] = []

        import threading

        def sync_handler(ctx: HookContext) -> HookResult:
            execution_thread.append(threading.current_thread().name)
            return HookResult(hook_name="sync", success=True)

        HookRegistry.register(
            HookDefinition(
                name="sync-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=sync_handler,
                async_handler=False,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 1
        assert results[0].success is True
        # Should have recorded the thread name
        assert len(execution_thread) == 1

    @pytest.mark.asyncio
    async def test_async_output_chaining(self, sample_context: HookContext) -> None:
        """Test output chaining in async mode."""

        async def hook1_handler(ctx: HookContext) -> HookResult:
            return HookResult(hook_name="hook1", success=True, output={"data": "from_hook1"})

        async def hook2_handler(ctx: HookContext) -> HookResult:
            # Verify previous hook output is available
            prev_output = ctx.hook_outputs.get("hook1", {})
            return HookResult(
                hook_name="hook2",
                success=True,
                output={"received": prev_output.get("data")},
            )

        HookRegistry.register(
            HookDefinition(
                name="hook1",
                trigger=HookTrigger.POST_EXECUTION,
                handler=hook1_handler,
                async_handler=True,
                priority=HookPriority.EARLY,
            )
        )
        HookRegistry.register(
            HookDefinition(
                name="hook2",
                trigger=HookTrigger.POST_EXECUTION,
                handler=hook2_handler,
                async_handler=True,
                priority=HookPriority.LATE,
            )
        )

        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, sample_context)

        assert len(results) == 2
        assert results[1].output["received"] == "from_hook1"

    @pytest.mark.asyncio
    async def test_async_empty_trigger(self, sample_context: HookContext) -> None:
        """Test async with no registered hooks."""
        config = MagicMock()
        config.post_execution_hooks = None
        runner = HookRunner(config)

        results = await runner.run_hooks_async(HookTrigger.ON_SUCCESS, sample_context)

        assert results == []


class TestHookRegistryEdgeCases:
    """Edge case tests for HookRegistry."""

    def setup_method(self) -> None:
        """Clear registry before each test."""
        HookRegistry.clear()

    def teardown_method(self) -> None:
        """Clear registry after each test."""
        HookRegistry.clear()

    def test_unregister_nonexistent_hook(self) -> None:
        """Test unregistering a hook that doesn't exist."""
        result = HookRegistry.unregister("nonexistent")
        assert result is False

    def test_unregister_with_trigger(self) -> None:
        """Test unregistering with specific trigger."""
        hook = HookDefinition(
            name="my-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="my-hook", success=True),
        )
        HookRegistry.register(hook)

        # Try wrong trigger
        result = HookRegistry.unregister("my-hook", HookTrigger.ON_GATE_FAILURE)
        assert result is False
        assert HookRegistry.hook_count() == 1

        # Try correct trigger
        result = HookRegistry.unregister("my-hook", HookTrigger.POST_EXECUTION)
        assert result is True
        assert HookRegistry.hook_count() == 0

    def test_get_all_hooks(self) -> None:
        """Test getting all registered hooks."""
        hook1 = HookDefinition(
            name="post-hook",
            trigger=HookTrigger.POST_EXECUTION,
            handler=lambda ctx: HookResult(hook_name="post", success=True),
        )
        hook2 = HookDefinition(
            name="failure-hook",
            trigger=HookTrigger.ON_GATE_FAILURE,
            handler=lambda ctx: HookResult(hook_name="failure", success=True),
        )

        HookRegistry.register(hook1)
        HookRegistry.register(hook2)

        all_hooks = HookRegistry.get_all_hooks()

        assert HookTrigger.POST_EXECUTION in all_hooks
        assert HookTrigger.ON_GATE_FAILURE in all_hooks
        assert len(all_hooks[HookTrigger.POST_EXECUTION]) == 1
        assert len(all_hooks[HookTrigger.ON_GATE_FAILURE]) == 1
