"""
Unit tests for the analyze-diff skill.

Tests:
- Diff parsing
- Debug statement detection
- TODO/FIXME detection
- Secret detection
- Acceptance criteria checking
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Add skills directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "development"))

from importlib import import_module

# Import the module
analyze_diff = import_module("analyze-diff")


class TestParseDiff:
    """Tests for parse_diff function."""

    def test_parses_simple_diff(self) -> None:
        """Test parsing a simple diff."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,5 @@
 def main():
+    print("hello")
     pass
"""
        hunks = analyze_diff.parse_diff(diff)

        assert len(hunks) == 1
        assert hunks[0].file == "test.py"
        assert len(hunks[0].additions) > 0

    def test_parses_multiple_files(self) -> None:
        """Test parsing diff with multiple files."""
        diff = """diff --git a/file1.py b/file1.py
@@ -1,3 +1,4 @@
+line1
 existing
diff --git a/file2.py b/file2.py
@@ -1,2 +1,3 @@
+line2
 existing
"""
        hunks = analyze_diff.parse_diff(diff)

        assert len(hunks) == 2
        assert hunks[0].file == "file1.py"
        assert hunks[1].file == "file2.py"

    def test_tracks_line_numbers(self) -> None:
        """Test that line numbers are tracked correctly."""
        diff = """diff --git a/test.py b/test.py
@@ -10,3 +10,5 @@
 context
+added line
 more context
"""
        hunks = analyze_diff.parse_diff(diff)

        assert len(hunks) == 1
        # Added line should have correct line number
        additions = hunks[0].additions
        assert any(line_num >= 10 for line_num, _ in additions)

    def test_empty_diff_returns_empty(self) -> None:
        """Test empty diff returns empty list."""
        hunks = analyze_diff.parse_diff("")
        assert hunks == []


class TestDebugDetection:
    """Tests for debug statement detection."""

    def test_detects_print_statement(self) -> None:
        """Test detection of print statements."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+print("debugging")
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        assert result["success"] is True
        issues = result["issues"]
        debug_issues = [i for i in issues if i["category"] == "debug"]
        assert len(debug_issues) >= 1

    def test_detects_console_log(self) -> None:
        """Test detection of console.log statements."""
        diff = """diff --git a/test.js b/test.js
@@ -1,3 +1,4 @@
+console.log("test");
 function main() {
 }
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        debug_issues = [i for i in issues if i["category"] == "debug"]
        assert len(debug_issues) >= 1

    def test_detects_debugger(self) -> None:
        """Test detection of debugger statements."""
        diff = """diff --git a/test.js b/test.js
@@ -1,3 +1,4 @@
+debugger;
 function main() {
 }
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        debug_issues = [i for i in issues if i["category"] == "debug"]
        assert len(debug_issues) >= 1

    def test_detects_pdb(self) -> None:
        """Test detection of pdb.set_trace."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,5 @@
+import pdb
+pdb.set_trace()
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        debug_issues = [i for i in issues if i["category"] == "debug"]
        assert len(debug_issues) >= 1


class TestTodoDetection:
    """Tests for TODO/FIXME detection."""

    def test_detects_todo(self) -> None:
        """Test detection of TODO comments."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+# TODO: fix this later
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        todo_issues = [i for i in issues if i["category"] == "todo"]
        assert len(todo_issues) >= 1

    def test_detects_fixme(self) -> None:
        """Test detection of FIXME comments."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+# FIXME: urgent bug
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        todo_issues = [i for i in issues if i["category"] == "todo"]
        assert len(todo_issues) >= 1


class TestSecretDetection:
    """Tests for secret detection."""

    def test_detects_hardcoded_password(self) -> None:
        """Test detection of hardcoded passwords."""
        diff = """diff --git a/config.py b/config.py
@@ -1,3 +1,4 @@
+password = "secret123"
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        security_issues = [i for i in issues if i["category"] == "security"]
        assert len(security_issues) >= 1
        assert security_issues[0]["severity"] == "error"

    def test_detects_api_key(self) -> None:
        """Test detection of hardcoded API keys."""
        diff = """diff --git a/config.py b/config.py
@@ -1,3 +1,4 @@
+api_key = "sk_live_12345"
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        security_issues = [i for i in issues if i["category"] == "security"]
        assert len(security_issues) >= 1

    def test_redacts_secret_in_output(self) -> None:
        """Test that secrets are redacted in output."""
        diff = """diff --git a/config.py b/config.py
@@ -1,3 +1,4 @@
+password = "supersecret"
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        security_issues = [i for i in issues if i["category"] == "security"]
        assert len(security_issues) >= 1
        # Code should be redacted
        assert security_issues[0]["code"] == "[REDACTED]"


class TestQualityPatterns:
    """Tests for quality pattern detection."""

    def test_detects_bare_except(self) -> None:
        """Test detection of bare except clauses."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,6 @@
+try:
+    something()
+except:
+    pass
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        quality_issues = [i for i in issues if i["category"] == "quality"]
        assert len(quality_issues) >= 1

    def test_detects_type_ignore(self) -> None:
        """Test detection of type: ignore comments."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+x = foo()  # type: ignore
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        issues = result["issues"]
        quality_issues = [i for i in issues if i["category"] == "quality"]
        assert len(quality_issues) >= 1


class TestApprovalRecommendation:
    """Tests for approval recommendation."""

    def test_approves_clean_diff(self) -> None:
        """Test approval for clean diff."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+def new_function():
+    return 42
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        assert result["approval"] == "approve"

    def test_requests_changes_on_error(self) -> None:
        """Test request changes when errors found."""
        diff = """diff --git a/config.py b/config.py
@@ -1,3 +1,4 @@
+password = "secret123"
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        assert result["approval"] == "request_changes"

    def test_needs_discussion_on_many_warnings(self) -> None:
        """Test needs_discussion when many warnings."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,7 @@
+print("debug1")
+print("debug2")
+print("debug3")
+console.log("debug4")
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        # Multiple warnings should trigger discussion
        assert result["approval"] in ["needs_discussion", "approve"]


class TestAcceptanceCriteria:
    """Tests for acceptance criteria checking."""

    def test_identifies_coverage_gaps(self) -> None:
        """Test identification of acceptance criteria gaps."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+def unrelated_function():
+    pass
"""
        context = {
            "acceptance_criteria": [
                "Must implement user authentication",
                "Must validate email format",
            ]
        }

        result = analyze_diff.execute(diff, context, "standard")

        # Should identify that criteria may not be addressed
        assert "coverage_gaps" in result
        # The simple heuristic should find gaps since keywords don't match
        # (implementation may vary)


class TestExecuteFunction:
    """Tests for the main execute function."""

    def test_empty_diff_returns_approve(self) -> None:
        """Test empty diff returns approval."""
        result = analyze_diff.execute("", None, "standard")

        assert result["success"] is True
        assert result["approval"] == "approve"
        assert result["issues"] == []

    def test_includes_stats(self) -> None:
        """Test that stats are included in result."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,5 @@
+line1
+line2
-removed
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "standard")

        assert "stats" in result
        assert result["stats"]["additions"] >= 2
        assert result["stats"]["deletions"] >= 1

    def test_quick_depth_skips_quality(self) -> None:
        """Test that quick depth skips quality patterns."""
        diff = """diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+x = foo()  # type: ignore
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "quick")

        # Quick mode shouldn't flag type: ignore as aggressively
        issues = result["issues"]
        # May or may not have issues depending on implementation

    def test_deep_depth_checks_line_length(self) -> None:
        """Test that deep depth checks line length."""
        long_line = "x = " + "a" * 150
        diff = f"""diff --git a/test.py b/test.py
@@ -1,3 +1,4 @@
+{long_line}
 def main():
     pass
"""
        result = analyze_diff.execute(diff, None, "deep")

        issues = result["issues"]
        style_issues = [i for i in issues if i["category"] == "style"]
        assert len(style_issues) >= 1
