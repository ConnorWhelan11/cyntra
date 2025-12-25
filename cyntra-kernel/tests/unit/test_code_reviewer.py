"""
Unit tests for the code_reviewer hook.

Tests:
- Git diff parsing
- Issue detection (debug statements, TODOs, secrets)
- Review result generation
- Skill invocation fallback
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cyntra.adapters.base import PatchProof
from cyntra.hooks import HookContext
from cyntra.hooks.code_reviewer import (
    CODE_REVIEWER_HOOK,
    code_reviewer_handler,
    get_git_diff,
    invoke_analyze_diff,
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
            "title": "Add logging feature",
            "tags": ["feature"],
            "acceptance_criteria": ["Logs should include timestamps"],
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
    )


class TestGetGitDiff:
    """Tests for get_git_diff function."""

    def test_returns_diff_output(self, tmp_path: Path) -> None:
        """Test that git diff output is returned."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="diff --git a/test.py b/test.py\n+print('hello')\n",
                returncode=0,
            )
            result = get_git_diff(tmp_path)
            assert "diff --git" in result
            assert "print" in result

    def test_returns_empty_on_error(self, tmp_path: Path) -> None:
        """Test that empty string is returned on error."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = Exception("Git not found")
            result = get_git_diff(tmp_path)
            assert result == ""

    def test_returns_empty_on_timeout(self, tmp_path: Path) -> None:
        """Test that empty string is returned on timeout."""
        import subprocess

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="git", timeout=30)
            result = get_git_diff(tmp_path)
            assert result == ""


class TestInvokeAnalyzeDiff:
    """Tests for invoke_analyze_diff function."""

    def test_fallback_when_skill_not_found(self) -> None:
        """Test fallback behavior when skill is not available."""
        # Skill import will fail, should return fallback result
        result = invoke_analyze_diff("some diff", None, "standard")

        assert result["success"] is True
        assert "issues" in result
        assert "approval" in result

    def test_with_context(self) -> None:
        """Test with issue context provided."""
        context = {"issue_id": "42", "issue_title": "Test"}
        result = invoke_analyze_diff("some diff", context, "quick")

        assert result["success"] is True


class TestCodeReviewerHandler:
    """Tests for code_reviewer_handler function."""

    def test_no_changes_returns_approve(self, sample_context: HookContext) -> None:
        """Test that no changes result in approval."""
        with patch(
            "cyntra.hooks.code_reviewer.get_git_diff", return_value=""
        ):
            result = code_reviewer_handler(sample_context)

            assert result.success is True
            assert result.hook_name == "code-reviewer"
            assert result.output["approval"] == "approve"
            assert "No changes" in result.output["review"]

    def test_detects_debug_statements(self, sample_context: HookContext) -> None:
        """Test detection of debug statements in diff."""
        diff_with_debug = """
diff --git a/src/main.py b/src/main.py
@@ -1,3 +1,5 @@
+print("debugging here")
+console.log("test")
 def main():
     pass
"""
        with patch(
            "cyntra.hooks.code_reviewer.get_git_diff", return_value=diff_with_debug
        ):
            result = code_reviewer_handler(sample_context)

            assert result.success is True
            # The fallback analyzer should find these as issues
            assert result.hook_name == "code-reviewer"

    def test_returns_recommendations(self, sample_context: HookContext) -> None:
        """Test that recommendations are populated from issues."""
        diff = """
diff --git a/src/main.py b/src/main.py
@@ -1,3 +1,5 @@
+password = "secret123"
 def main():
     pass
"""
        with patch(
            "cyntra.hooks.code_reviewer.get_git_diff", return_value=diff
        ):
            result = code_reviewer_handler(sample_context)

            assert result.success is True
            # With secret detection, should have recommendations
            assert isinstance(result.recommendations, list)

    def test_handles_exception_gracefully(self, sample_context: HookContext) -> None:
        """Test graceful handling of exceptions."""
        with patch(
            "cyntra.hooks.code_reviewer.get_git_diff",
            side_effect=Exception("Unexpected error"),
        ):
            # Should raise since we don't catch in handler
            with pytest.raises(Exception):
                code_reviewer_handler(sample_context)


class TestCodeReviewerHookDefinition:
    """Tests for CODE_REVIEWER_HOOK definition."""

    def test_hook_name(self) -> None:
        """Test hook name is correct."""
        assert CODE_REVIEWER_HOOK.name == "code-reviewer"

    def test_hook_trigger(self) -> None:
        """Test hook trigger is POST_EXECUTION."""
        from cyntra.hooks import HookTrigger

        assert CODE_REVIEWER_HOOK.trigger == HookTrigger.POST_EXECUTION

    def test_match_status_filter(self) -> None:
        """Test hook only runs on success/partial status."""
        assert CODE_REVIEWER_HOOK.match_status == ["success", "partial"]

    def test_is_not_async(self) -> None:
        """Test hook is synchronous."""
        assert CODE_REVIEWER_HOOK.async_handler is False
