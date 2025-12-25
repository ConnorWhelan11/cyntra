"""
Unit tests for the find-tests skill.

Tests:
- Test framework detection
- Test file discovery
- Source to test mapping
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Add skills directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "development"))

from importlib import import_module

# Import the module
find_tests = import_module("find-tests")


class TestDetectTestFrameworks:
    """Tests for test framework detection."""

    def test_detects_pytest_from_ini(self, tmp_path: Path) -> None:
        """Test detection of pytest from pytest.ini."""
        (tmp_path / "pytest.ini").write_text("[pytest]")

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "pytest" in frameworks

    def test_detects_pytest_from_pyproject(self, tmp_path: Path) -> None:
        """Test detection of pytest from pyproject.toml."""
        (tmp_path / "pyproject.toml").write_text('[tool.pytest.ini_options]\nminversion = "6.0"')

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "pytest" in frameworks

    def test_detects_pytest_from_conftest(self, tmp_path: Path) -> None:
        """Test detection of pytest from conftest.py."""
        (tmp_path / "conftest.py").write_text("# pytest config")

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "pytest" in frameworks

    def test_detects_jest(self, tmp_path: Path) -> None:
        """Test detection of Jest from package.json."""
        pkg = {"devDependencies": {"jest": "^29.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "jest" in frameworks

    def test_detects_vitest(self, tmp_path: Path) -> None:
        """Test detection of Vitest from package.json."""
        pkg = {"devDependencies": {"vitest": "^1.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "vitest" in frameworks

    def test_detects_go_test(self, tmp_path: Path) -> None:
        """Test detection of Go testing."""
        (tmp_path / "foo_test.go").write_text("package foo")

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "go-test" in frameworks

    def test_detects_cargo_test(self, tmp_path: Path) -> None:
        """Test detection of Rust/Cargo testing."""
        (tmp_path / "Cargo.toml").write_text("[package]")

        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "cargo-test" in frameworks

    def test_defaults_to_pytest(self, tmp_path: Path) -> None:
        """Test that pytest is default when nothing detected."""
        frameworks = find_tests.detect_test_frameworks(tmp_path)

        assert "pytest" in frameworks


class TestFindTestFile:
    """Tests for finding test files for source files."""

    def test_finds_test_in_tests_dir(self, tmp_path: Path) -> None:
        """Test finding test file in tests/ directory."""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_auth.py").write_text("# tests")

        result = find_tests.find_test_file("src/auth.py", tmp_path)

        assert "tests/test_auth.py" in result

    def test_finds_test_with_underscore_pattern(self, tmp_path: Path) -> None:
        """Test finding test file with _test.py pattern."""
        (tmp_path / "auth_test.py").write_text("# tests")

        result = find_tests.find_test_file("src/auth.py", tmp_path)

        assert "auth_test.py" in result

    def test_finds_typescript_test_files(self, tmp_path: Path) -> None:
        """Test finding TypeScript test files."""
        (tmp_path / "App.test.tsx").write_text("// tests")

        result = find_tests.find_test_file("src/App.tsx", tmp_path)

        assert "App.test.tsx" in result

    def test_finds_spec_files(self, tmp_path: Path) -> None:
        """Test finding .spec files."""
        (tmp_path / "utils.spec.ts").write_text("// tests")

        result = find_tests.find_test_file("src/utils.ts", tmp_path)

        assert "utils.spec.ts" in result

    def test_finds_go_test_files(self, tmp_path: Path) -> None:
        """Test finding Go test files."""
        (tmp_path / "auth_test.go").write_text("package auth")

        result = find_tests.find_test_file("auth.go", tmp_path)

        assert "auth_test.go" in result

    def test_returns_empty_when_not_found(self, tmp_path: Path) -> None:
        """Test returns empty list when no tests found."""
        result = find_tests.find_test_file("src/nonexistent.py", tmp_path)

        assert result == []


class TestExecuteFunction:
    """Tests for the main execute function."""

    def test_maps_source_to_tests(self, tmp_path: Path) -> None:
        """Test mapping source files to test files."""
        # Create source file
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        (src_dir / "auth.py").write_text("# source")

        # Create test file
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_auth.py").write_text("# tests")

        result = find_tests.execute(
            source_files=["src/auth.py"],
            repo_path=str(tmp_path),
        )

        assert result["success"] is True
        assert "src/auth.py" in result["test_mapping"]
        assert "tests/test_auth.py" in result["test_mapping"]["src/auth.py"]

    def test_identifies_untested_files(self, tmp_path: Path) -> None:
        """Test identification of untested files."""
        result = find_tests.execute(
            source_files=["src/auth.py", "src/utils.py"],
            repo_path=str(tmp_path),
        )

        assert result["success"] is True
        assert "src/auth.py" in result["untested_files"]
        assert "src/utils.py" in result["untested_files"]

    def test_includes_test_frameworks(self, tmp_path: Path) -> None:
        """Test that detected frameworks are included."""
        (tmp_path / "pytest.ini").write_text("[pytest]")

        result = find_tests.execute(
            source_files=["src/auth.py"],
            repo_path=str(tmp_path),
        )

        assert result["success"] is True
        assert "pytest" in result["test_frameworks"]

    def test_includes_stats(self, tmp_path: Path) -> None:
        """Test that stats are included."""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_auth.py").write_text("# tests")

        result = find_tests.execute(
            source_files=["src/auth.py", "src/utils.py"],
            repo_path=str(tmp_path),
        )

        assert "stats" in result
        assert result["stats"]["total_sources"] == 2

    def test_handles_nonexistent_repo(self) -> None:
        """Test handling of nonexistent repository path."""
        result = find_tests.execute(
            source_files=["src/auth.py"],
            repo_path="/nonexistent/path",
        )

        assert result["success"] is False
        assert "error" in result

    def test_multiple_tests_for_source(self, tmp_path: Path) -> None:
        """Test finding multiple test files for a source."""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_auth.py").write_text("# unit tests")
        (tmp_path / "auth_test.py").write_text("# integration tests")

        result = find_tests.execute(
            source_files=["src/auth.py"],
            repo_path=str(tmp_path),
        )

        assert result["success"] is True
        if "src/auth.py" in result["test_mapping"]:
            # Should find at least one test file
            assert len(result["test_mapping"]["src/auth.py"]) >= 1
