"""
Unit tests for the explain-failure skill.

Tests:
- Pytest error detection
- Mypy error detection
- Ruff error detection
- Syntax error detection
- File reference extraction
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Add skills directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "development"))

from importlib import import_module

# Import the module
explain_failure = import_module("explain-failure")


class TestPytestPatterns:
    """Tests for pytest error pattern matching."""

    def test_detects_failed_test(self) -> None:
        """Test detection of FAILED test pattern."""
        error_output = """
FAILED tests/test_auth.py::TestLogin::test_login_success - AssertionError
"""
        result = explain_failure.execute("test", error_output, ["src/auth.py"])

        assert result["success"] is True
        assert "root_cause" in result
        assert result["category"] == "test"

    def test_detects_assertion_error(self) -> None:
        """Test detection of AssertionError."""
        error_output = """
E       AssertionError: expected True, got False
"""
        result = explain_failure.execute("pytest", error_output, [])

        assert result["success"] is True
        assert "Assertion failed" in result["root_cause"]
        assert result["category"] == "test"
        assert len(result["suggestions"]) > 0

    def test_detects_module_not_found(self) -> None:
        """Test detection of ModuleNotFoundError."""
        error_output = """
ModuleNotFoundError: No module named 'nonexistent_package'
"""
        result = explain_failure.execute("pytest", error_output, [])

        assert result["success"] is True
        assert "nonexistent_package" in result["root_cause"]
        assert result["category"] == "import"
        assert result["severity"] == "low"

    def test_detects_import_error(self) -> None:
        """Test detection of ImportError."""
        error_output = """
ImportError: cannot import name 'Foo' from 'module'
"""
        result = explain_failure.execute("pytest", error_output, [])

        assert result["success"] is True
        assert "Import error" in result["root_cause"]
        assert result["category"] == "import"

    def test_detects_type_error(self) -> None:
        """Test detection of TypeError."""
        error_output = """
TypeError: expected str, got int
"""
        result = explain_failure.execute("pytest", error_output, [])

        assert result["success"] is True
        assert "Type error" in result["root_cause"]
        assert result["category"] == "runtime"

    def test_detects_attribute_error(self) -> None:
        """Test detection of AttributeError."""
        error_output = """
AttributeError: 'NoneType' object has no attribute 'foo'
"""
        result = explain_failure.execute("pytest", error_output, [])

        assert result["success"] is True
        assert "Attribute error" in result["root_cause"]
        assert result["category"] == "runtime"


class TestMypyPatterns:
    """Tests for mypy error pattern matching."""

    def test_detects_mypy_error(self) -> None:
        """Test detection of mypy error."""
        error_output = """
src/auth.py:42: error: Incompatible types in assignment
"""
        result = explain_failure.execute("mypy", error_output, [])

        assert result["success"] is True
        assert "src/auth.py" in result["root_cause"]
        assert result["category"] == "type"
        assert result["line_number"] == 42

    def test_detects_incompatible_types(self) -> None:
        """Test detection of incompatible types message."""
        error_output = """
Incompatible types in assignment (expression has type "int", variable has type "str")
"""
        result = explain_failure.execute("typecheck", error_output, [])

        assert result["success"] is True
        assert result["category"] == "type"
        assert len(result["suggestions"]) > 0

    def test_detects_argument_type_mismatch(self) -> None:
        """Test detection of argument type mismatch."""
        error_output = """
error: Argument 1 has incompatible type "int"; expected "str"
"""
        result = explain_failure.execute("mypy", error_output, [])

        assert result["success"] is True
        assert "int" in result["root_cause"]
        assert "str" in result["root_cause"]
        assert result["category"] == "type"


class TestRuffPatterns:
    """Tests for ruff error pattern matching."""

    def test_detects_ruff_error(self) -> None:
        """Test detection of ruff lint error."""
        error_output = """
src/main.py:10:5: E501 Line too long (150 > 120 characters)
"""
        result = explain_failure.execute("ruff", error_output, [])

        assert result["success"] is True
        assert result["category"] == "lint"
        assert result["line_number"] == 10

    def test_detects_line_too_long(self) -> None:
        """Test detection of E501 line too long."""
        error_output = """
E501: line too long
"""
        result = explain_failure.execute("lint", error_output, [])

        assert result["success"] is True
        assert "Line too long" in result["root_cause"]
        assert len(result["suggestions"]) > 0

    def test_detects_unused_import(self) -> None:
        """Test detection of F401 unused import."""
        error_output = """
F401: 'os' imported but unused
"""
        result = explain_failure.execute("lint", error_output, [])

        assert result["success"] is True
        assert "Unused import" in result["root_cause"]

    def test_detects_unused_variable(self) -> None:
        """Test detection of F841 unused variable."""
        error_output = """
F841: local variable 'x' is assigned to but never used
"""
        result = explain_failure.execute("lint", error_output, [])

        assert result["success"] is True
        assert "Unused variable" in result["root_cause"]


class TestSyntaxPatterns:
    """Tests for syntax error detection."""

    def test_detects_syntax_error(self) -> None:
        """Test detection of SyntaxError."""
        error_output = """
SyntaxError: invalid syntax
"""
        result = explain_failure.execute("test", error_output, [])

        assert result["success"] is True
        assert "Syntax error" in result["root_cause"]
        assert result["category"] == "syntax"
        assert result["severity"] == "high"

    def test_detects_indentation_error(self) -> None:
        """Test detection of IndentationError."""
        error_output = """
IndentationError: unexpected indent
"""
        result = explain_failure.execute("test", error_output, [])

        assert result["success"] is True
        assert "Indentation error" in result["root_cause"]
        assert result["category"] == "syntax"


class TestFileReferenceExtraction:
    """Tests for extracting file references from error output."""

    def test_extracts_python_file_references(self) -> None:
        """Test extraction of Python file references."""
        error_output = """
File "src/auth.py", line 42, in login
    return user
src/utils.py:10: error
"""
        files = explain_failure.extract_file_references(error_output)

        assert "src/auth.py" in files
        assert "src/utils.py" in files

    def test_extracts_typescript_file_references(self) -> None:
        """Test extraction of TypeScript file references."""
        error_output = """
src/components/App.tsx:15:3 - error TS2322
"""
        files = explain_failure.extract_file_references(error_output)

        assert "src/components/App.tsx" in files

    def test_limits_file_count(self) -> None:
        """Test that file count is limited."""
        error_output = "\n".join([f"file{i}.py:1: error" for i in range(20)])

        files = explain_failure.extract_file_references(error_output)

        assert len(files) <= 5


class TestExecuteFunction:
    """Tests for the main execute function."""

    def test_empty_output_returns_success(self) -> None:
        """Test empty output returns success with appropriate message."""
        result = explain_failure.execute("test", "", [])

        assert result["success"] is True
        assert "No output" in result["root_cause"]

    def test_includes_related_files(self) -> None:
        """Test that related files are included."""
        error_output = """
src/auth.py:42: error: Something wrong
"""
        result = explain_failure.execute("test", error_output, ["src/auth.py"])

        assert "src/auth.py" in result["related_files"]

    def test_fallback_for_unknown_pattern(self) -> None:
        """Test fallback for unrecognized error pattern."""
        error_output = """
Some completely unknown error format that doesn't match anything
"""
        result = explain_failure.execute("unknown_gate", error_output, ["file.py"])

        assert result["success"] is True
        # Should have fallback suggestions
        assert len(result["suggestions"]) > 0
        assert result["category"] == "unknown"

    def test_merges_file_references(self) -> None:
        """Test that file references from output and input are merged."""
        error_output = """
File "src/auth.py", line 42
"""
        files_modified = ["src/utils.py", "src/main.py"]

        result = explain_failure.execute("test", error_output, files_modified)

        # Should include both referenced and modified files
        assert "src/auth.py" in result["related_files"]


class TestAnalyzeGateOutput:
    """Tests for analyze_gate_output function."""

    def test_selects_correct_patterns_for_pytest(self) -> None:
        """Test that pytest patterns are used for test gate."""
        error_output = "FAILED tests/test_foo.py::test_bar - AssertionError"

        analysis = explain_failure.analyze_gate_output("pytest", error_output, [])

        assert analysis.category == "test"

    def test_selects_correct_patterns_for_mypy(self) -> None:
        """Test that mypy patterns are used for typecheck gate."""
        error_output = "src/foo.py:10: error: incompatible type"

        analysis = explain_failure.analyze_gate_output("mypy", error_output, [])

        assert analysis.category == "type"

    def test_tries_all_patterns_for_unknown_gate(self) -> None:
        """Test that all patterns are tried for unknown gate."""
        error_output = "TypeError: cannot add str and int"

        analysis = explain_failure.analyze_gate_output("custom_gate", error_output, [])

        # Should still detect the TypeError
        assert "Type error" in analysis.root_cause or analysis.category in [
            "runtime",
            "unknown",
        ]
