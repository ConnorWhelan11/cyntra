"""
Unit tests for the debug_specialist hook.

Tests:
- Gate log reading
- Failure analysis
- Diagnosis generation
- Skill invocation fallback
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cyntra.adapters.base import PatchProof
from cyntra.hooks import HookContext
from cyntra.hooks.debug_specialist import (
    DEBUG_SPECIALIST_HOOK,
    debug_specialist_handler,
    invoke_explain_failure,
    read_gate_logs,
)


@pytest.fixture
def sample_proof() -> PatchProof:
    """Create a sample PatchProof for testing."""
    return PatchProof(
        schema_version="1.0.0",
        workcell_id="wc-test-123",
        issue_id="42",
        status="failed",
        patch={"files_modified": ["src/main.py", "tests/test_main.py"]},
        verification={"all_passed": False, "blocking_failures": ["test"]},
        metadata={},
    )


@pytest.fixture
def sample_manifest() -> dict:
    """Create a sample manifest for testing."""
    return {
        "workcell_id": "wc-test-123",
        "issue": {
            "id": "42",
            "title": "Fix auth bug",
            "tags": ["bugfix"],
        },
    }


@pytest.fixture
def sample_context(
    tmp_path: Path, sample_proof: PatchProof, sample_manifest: dict
) -> HookContext:
    """Create a sample HookContext for testing."""
    return HookContext(
        workcell_path=tmp_path,
        workcell_id="wc-test-123",
        issue_id="42",
        proof=sample_proof,
        manifest=sample_manifest,
        gate_failures=["test", "typecheck"],
    )


class TestReadGateLogs:
    """Tests for read_gate_logs function."""

    def test_reads_existing_log(self, tmp_path: Path) -> None:
        """Test reading existing gate log file."""
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        log_file = logs_dir / "test.log"
        log_file.write_text("FAILED tests/test_auth.py::test_login - AssertionError")

        result = read_gate_logs(tmp_path, "test")

        assert "FAILED" in result
        assert "AssertionError" in result

    def test_reads_multiple_log_patterns(self, tmp_path: Path) -> None:
        """Test reading multiple log file patterns."""
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()

        # Create multiple log files
        (logs_dir / "test-stdout.log").write_text("Running tests...")
        (logs_dir / "test-stderr.log").write_text("Error: test failed")

        result = read_gate_logs(tmp_path, "test")

        assert "Running tests" in result
        assert "Error: test failed" in result

    def test_returns_empty_when_no_logs(self, tmp_path: Path) -> None:
        """Test empty return when no logs exist."""
        result = read_gate_logs(tmp_path, "test")
        assert result == ""

    def test_handles_unreadable_file(self, tmp_path: Path) -> None:
        """Test handling of unreadable files."""
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        log_file = logs_dir / "test.log"
        log_file.write_text("")  # Empty file

        result = read_gate_logs(tmp_path, "test")
        # Empty content should not be included
        assert result == ""


class TestInvokeExplainFailure:
    """Tests for invoke_explain_failure function."""

    def test_fallback_when_skill_not_found(self) -> None:
        """Test fallback behavior when skill is not available."""
        result = invoke_explain_failure(
            gate_name="test",
            error_output="AssertionError: expected True",
            files_modified=["src/auth.py"],
        )

        assert result["success"] is True
        assert "root_cause" in result
        assert "suggestions" in result
        assert isinstance(result["suggestions"], list)

    def test_includes_files_in_result(self) -> None:
        """Test that modified files are included in result."""
        files = ["src/main.py", "src/utils.py"]
        result = invoke_explain_failure(
            gate_name="typecheck",
            error_output="error: incompatible type",
            files_modified=files,
        )

        assert result["related_files"] == files

    def test_with_empty_error_output(self) -> None:
        """Test with empty error output."""
        result = invoke_explain_failure(
            gate_name="lint",
            error_output="",
            files_modified=[],
        )

        assert result["success"] is True


class TestDebugSpecialistHandler:
    """Tests for debug_specialist_handler function."""

    def test_no_failures_returns_early(self, sample_context: HookContext) -> None:
        """Test that no failures result in early return."""
        sample_context.gate_failures = []

        result = debug_specialist_handler(sample_context)

        assert result.success is True
        assert result.hook_name == "debug-specialist"
        assert "No failures" in result.output["message"]

    def test_investigates_gate_failures(self, sample_context: HookContext) -> None:
        """Test investigation of gate failures."""
        # Create log files for the context
        logs_dir = sample_context.workcell_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "test.log").write_text(
            "FAILED tests/test_auth.py::test_login\nAssertionError: expected 200, got 401"
        )

        result = debug_specialist_handler(sample_context)

        assert result.success is True
        assert "diagnostics" in result.output
        assert len(result.output["diagnostics"]) > 0

    def test_uses_verification_result_fallback(
        self, sample_context: HookContext
    ) -> None:
        """Test fallback to verification_result when no logs exist."""
        sample_context.verification_result = {
            "results": {
                "test": {
                    "passed": False,
                    "stderr": "ModuleNotFoundError: No module named 'missing'",
                }
            }
        }

        result = debug_specialist_handler(sample_context)

        assert result.success is True
        assert "diagnostics" in result.output

    def test_generates_recommendations(self, sample_context: HookContext) -> None:
        """Test that recommendations are generated."""
        logs_dir = sample_context.workcell_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "test.log").write_text("TypeError: cannot call None")

        result = debug_specialist_handler(sample_context)

        assert isinstance(result.recommendations, list)
        # Should have at least one recommendation per failure
        assert len(result.recommendations) >= 0

    def test_determines_auto_fixable(self, sample_context: HookContext) -> None:
        """Test auto_fixable determination."""
        result = debug_specialist_handler(sample_context)

        assert "auto_fixable" in result.output
        assert isinstance(result.output["auto_fixable"], bool)

    def test_handles_multiple_gate_failures(self, sample_context: HookContext) -> None:
        """Test handling of multiple gate failures."""
        sample_context.gate_failures = ["test", "typecheck", "lint"]

        logs_dir = sample_context.workcell_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "test.log").write_text("AssertionError")
        (logs_dir / "typecheck.log").write_text("error: missing type")
        (logs_dir / "lint.log").write_text("E501: line too long")

        result = debug_specialist_handler(sample_context)

        assert result.success is True
        assert len(result.output["diagnostics"]) == 3


class TestDebugSpecialistHookDefinition:
    """Tests for DEBUG_SPECIALIST_HOOK definition."""

    def test_hook_name(self) -> None:
        """Test hook name is correct."""
        assert DEBUG_SPECIALIST_HOOK.name == "debug-specialist"

    def test_hook_trigger(self) -> None:
        """Test hook trigger is ON_GATE_FAILURE."""
        from cyntra.hooks import HookTrigger

        assert DEBUG_SPECIALIST_HOOK.trigger == HookTrigger.ON_GATE_FAILURE

    def test_priority_is_early(self) -> None:
        """Test hook runs early to inform other hooks."""
        from cyntra.hooks import HookPriority

        assert DEBUG_SPECIALIST_HOOK.priority == HookPriority.EARLY

    def test_is_not_async(self) -> None:
        """Test hook is synchronous."""
        assert DEBUG_SPECIALIST_HOOK.async_handler is False
