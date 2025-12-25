"""
Integration tests for hook system.

Tests end-to-end hook flows through Dispatcher and Verifier.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock
from dataclasses import dataclass, field

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
from cyntra.kernel.config import (
    KernelConfig,
    GatesConfig,
    PostExecutionHooksConfig,
    CodeReviewerHookConfig,
    DebugSpecialistHookConfig,
)


@pytest.fixture
def sample_config(tmp_path: Path) -> KernelConfig:
    """Create a sample kernel config for testing."""
    config = KernelConfig(
        repo_root=tmp_path,
        gates=GatesConfig(
            test_command="pytest",
            typecheck_command="mypy .",
            lint_command="ruff check .",
        ),
        post_execution_hooks=PostExecutionHooksConfig(
            enabled=True,
            timeout_seconds=60,
            code_reviewer=CodeReviewerHookConfig(
                enabled=True,
                review_depth="standard",
            ),
            debug_specialist=DebugSpecialistHookConfig(
                enabled=True,
                trigger_on_gate_failure=True,
            ),
        ),
    )
    return config


@pytest.fixture
def sample_proof() -> PatchProof:
    """Create a sample PatchProof."""
    return PatchProof(
        schema_version="1.0.0",
        workcell_id="wc-test-123",
        issue_id="42",
        status="success",
        patch={
            "files_modified": ["src/main.py"],
            "branch": "wc/42/wc-test-123",
        },
        verification={"all_passed": True},
        metadata={},
    )


@pytest.fixture
def sample_manifest() -> dict:
    """Create a sample manifest."""
    return {
        "workcell_id": "wc-test-123",
        "branch_name": "wc/42/wc-test-123",
        "issue": {
            "id": "42",
            "title": "Fix authentication bug",
            "description": "The login form doesn't validate email format.",
            "tags": ["bugfix", "auth"],
            "acceptance_criteria": ["Email must be validated"],
        },
        "quality_gates": {
            "test": "pytest",
            "typecheck": "mypy .",
        },
    }


@pytest.fixture(autouse=True)
def clear_hook_registry():
    """Clear the hook registry before and after each test."""
    HookRegistry.clear()
    yield
    HookRegistry.clear()


class TestHookRunnerConfig:
    """Tests for HookRunner configuration integration."""

    def test_reads_timeout_from_config(self, sample_config: KernelConfig) -> None:
        """Test that runner reads timeout from config."""
        runner = HookRunner(sample_config)
        assert runner._default_timeout == 60

    def test_default_timeout_when_no_config(self) -> None:
        """Test default timeout when no hooks config."""
        config = KernelConfig()
        runner = HookRunner(config)
        assert runner._default_timeout == 120

    def test_get_hook_config_returns_dataclass_as_dict(
        self, sample_config: KernelConfig
    ) -> None:
        """Test that get_hook_config converts dataclass to dict."""
        runner = HookRunner(sample_config)

        config = runner.get_hook_config("code-reviewer")

        assert isinstance(config, dict)
        assert config["enabled"] is True
        assert config["review_depth"] == "standard"

    def test_get_hook_config_returns_empty_for_unknown(
        self, sample_config: KernelConfig
    ) -> None:
        """Test that get_hook_config returns empty for unknown hook."""
        runner = HookRunner(sample_config)

        config = runner.get_hook_config("unknown-hook")

        assert config == {}

    def test_hook_disabled_via_config(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that hooks can be disabled via config."""
        # Disable code-reviewer in config
        sample_config.post_execution_hooks.code_reviewer.enabled = False

        # Register a hook that matches "code-reviewer"
        executed = []

        def handler(ctx: HookContext) -> HookResult:
            executed.append("code-reviewer")
            return HookResult(hook_name="code-reviewer", success=True)

        HookRegistry.register(
            HookDefinition(
                name="code-reviewer",
                trigger=HookTrigger.POST_EXECUTION,
                handler=handler,
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
        )

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, context)

        # Hook should not have run
        assert len(results) == 0
        assert len(executed) == 0


class TestDispatcherHookIntegration:
    """Tests for Dispatcher hook integration."""

    def test_post_execution_hooks_populate_review(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that POST_EXECUTION hooks populate proof.review."""
        # Register a hook
        HookRegistry.register(
            HookDefinition(
                name="test-reviewer",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: HookResult(
                    hook_name="test-reviewer",
                    success=True,
                    output={"reviewed": True, "score": 0.9},
                    recommendations=["Consider adding more tests"],
                ),
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
        )

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, context)

        # Verify hook ran successfully
        assert len(results) == 1
        assert results[0].success is True
        assert results[0].output["reviewed"] is True

        # Simulate what Dispatcher does with results
        sample_proof.review = {
            "hooks_executed": [h.hook_name for h in results],
            "recommendations": [r for h in results for r in h.recommendations],
            "hook_outputs": {h.hook_name: h.output for h in results},
        }

        # Verify proof.review is populated correctly
        assert sample_proof.review["hooks_executed"] == ["test-reviewer"]
        assert "Consider adding more tests" in sample_proof.review["recommendations"]
        assert sample_proof.review["hook_outputs"]["test-reviewer"]["score"] == 0.9

    def test_multiple_hooks_chain_outputs(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that multiple hooks can chain their outputs."""
        execution_order = []

        def early_hook(ctx: HookContext) -> HookResult:
            execution_order.append("early")
            return HookResult(
                hook_name="early",
                success=True,
                output={"step": 1},
            )

        def late_hook(ctx: HookContext) -> HookResult:
            execution_order.append("late")
            # Access previous hook's output
            early_output = ctx.hook_outputs.get("early", {})
            return HookResult(
                hook_name="late",
                success=True,
                output={"step": 2, "saw_early": early_output.get("step")},
            )

        HookRegistry.register(
            HookDefinition(
                name="early",
                trigger=HookTrigger.POST_EXECUTION,
                handler=early_hook,
                priority=HookPriority.EARLY,
            )
        )
        HookRegistry.register(
            HookDefinition(
                name="late",
                trigger=HookTrigger.POST_EXECUTION,
                handler=late_hook,
                priority=HookPriority.LATE,
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
        )

        results = runner.run_hooks(HookTrigger.POST_EXECUTION, context)

        assert execution_order == ["early", "late"]
        assert len(results) == 2
        # Late hook should have seen early hook's output
        assert results[1].output["saw_early"] == 1


class TestVerifierHookIntegration:
    """Tests for Verifier hook integration."""

    def test_gate_failure_triggers_debug_hooks(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that gate failures trigger ON_GATE_FAILURE hooks."""
        # Set up proof as failed
        sample_proof.status = "success"  # Execution succeeded but gates failed
        sample_proof.verification = {
            "all_passed": False,
            "gates": {
                "test": {"passed": False, "stderr": "AssertionError: expected 1, got 2"}
            },
        }

        # Register a debug hook
        debug_called = []

        def debug_hook(ctx: HookContext) -> HookResult:
            debug_called.append(ctx.gate_failures)
            return HookResult(
                hook_name="debug-specialist",
                success=True,
                output={
                    "root_cause": "Test assertion failed",
                    "suggested_fix": "Check the expected value",
                },
            )

        HookRegistry.register(
            HookDefinition(
                name="debug-specialist",
                trigger=HookTrigger.ON_GATE_FAILURE,
                handler=debug_hook,
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
            gate_failures=["test"],
        )

        results = runner.run_hooks(HookTrigger.ON_GATE_FAILURE, context)

        assert len(results) == 1
        assert results[0].success is True
        assert debug_called == [["test"]]
        assert "root_cause" in results[0].output

    def test_debug_analysis_attached_to_verification(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that debug analysis is attached to verification results."""
        # Create log files that the debug hook might read
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "test.log").write_text(
            "FAILED tests/test_auth.py::test_login\nAssertionError: login failed"
        )

        HookRegistry.register(
            HookDefinition(
                name="debug-hook",
                trigger=HookTrigger.ON_GATE_FAILURE,
                handler=lambda ctx: HookResult(
                    hook_name="debug-hook",
                    success=True,
                    output={"diagnosis": "Auth test failed due to missing mock"},
                ),
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
            gate_failures=["test"],
            verification_result={
                "results": {"test": {"passed": False}},
                "all_passed": False,
            },
        )

        results = runner.run_hooks(HookTrigger.ON_GATE_FAILURE, context)

        # Simulate what Verifier does
        debug_analysis = {h.hook_name: h.output for h in results if h.success}

        assert "debug-hook" in debug_analysis
        assert debug_analysis["debug-hook"]["diagnosis"] == "Auth test failed due to missing mock"


class TestAsyncHookIntegration:
    """Tests for async hook execution."""

    @pytest.mark.asyncio
    async def test_async_hooks_work_with_runner(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that async hooks work with the runner."""
        import asyncio

        async def async_hook(ctx: HookContext) -> HookResult:
            await asyncio.sleep(0.001)  # Simulate async work
            return HookResult(
                hook_name="async-hook",
                success=True,
                output={"async": True},
            )

        HookRegistry.register(
            HookDefinition(
                name="async-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=async_hook,
                async_handler=True,
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
        )

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, context)

        assert len(results) == 1
        assert results[0].success is True
        assert results[0].output["async"] is True

    @pytest.mark.asyncio
    async def test_mixed_sync_async_hooks(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        """Test that sync and async hooks can be mixed."""
        import asyncio

        order = []

        def sync_hook(ctx: HookContext) -> HookResult:
            order.append("sync")
            return HookResult(hook_name="sync", success=True)

        async def async_hook(ctx: HookContext) -> HookResult:
            await asyncio.sleep(0.001)
            order.append("async")
            return HookResult(hook_name="async", success=True)

        HookRegistry.register(
            HookDefinition(
                name="sync",
                trigger=HookTrigger.POST_EXECUTION,
                handler=sync_hook,
                priority=HookPriority.EARLY,
            )
        )
        HookRegistry.register(
            HookDefinition(
                name="async",
                trigger=HookTrigger.POST_EXECUTION,
                handler=async_hook,
                async_handler=True,
                priority=HookPriority.LATE,
            )
        )

        runner = HookRunner(sample_config)
        context = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-test-123",
            issue_id="42",
            proof=sample_proof,
            manifest=sample_manifest,
        )

        results = await runner.run_hooks_async(HookTrigger.POST_EXECUTION, context)

        assert len(results) == 2
        assert order == ["sync", "async"]


class TestTagFiltering:
    """Tests for tag-based hook filtering."""

    def test_hook_only_runs_for_matching_tags(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        tmp_path: Path,
    ) -> None:
        """Test that hooks with match_tags only run for matching issues."""
        executed = []

        HookRegistry.register(
            HookDefinition(
                name="security-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: (
                    executed.append("security"),
                    HookResult(hook_name="security", success=True),
                )[1],
                match_tags=["security", "auth"],
            )
        )

        runner = HookRunner(sample_config)

        # Issue without matching tags
        context1 = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-1",
            issue_id="1",
            proof=sample_proof,
            manifest={"issue": {"tags": ["feature"]}},
        )
        runner.run_hooks(HookTrigger.POST_EXECUTION, context1)
        assert executed == []

        # Issue with matching tag
        context2 = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-2",
            issue_id="2",
            proof=sample_proof,
            manifest={"issue": {"tags": ["auth", "feature"]}},
        )
        runner.run_hooks(HookTrigger.POST_EXECUTION, context2)
        assert executed == ["security"]

    def test_hook_excluded_by_tags(
        self,
        sample_config: KernelConfig,
        sample_proof: PatchProof,
        tmp_path: Path,
    ) -> None:
        """Test that hooks with exclude_tags don't run for excluded issues."""
        executed = []

        HookRegistry.register(
            HookDefinition(
                name="review-hook",
                trigger=HookTrigger.POST_EXECUTION,
                handler=lambda ctx: (
                    executed.append("review"),
                    HookResult(hook_name="review", success=True),
                )[1],
                exclude_tags=["skip-review", "wip"],
            )
        )

        runner = HookRunner(sample_config)

        # Issue with excluded tag
        context1 = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-1",
            issue_id="1",
            proof=sample_proof,
            manifest={"issue": {"tags": ["feature", "wip"]}},
        )
        runner.run_hooks(HookTrigger.POST_EXECUTION, context1)
        assert executed == []

        # Issue without excluded tags
        context2 = HookContext(
            workcell_path=tmp_path,
            workcell_id="wc-2",
            issue_id="2",
            proof=sample_proof,
            manifest={"issue": {"tags": ["feature", "ready"]}},
        )
        runner.run_hooks(HookTrigger.POST_EXECUTION, context2)
        assert executed == ["review"]
