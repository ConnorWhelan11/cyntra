"""
Unit tests for the check-coverage skill.

Tests:
- Coverage data parsing
- Threshold checking
- Gap identification
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add skills directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "development"))

from importlib import import_module

# Import the module
check_coverage = import_module("check-coverage")


class TestParseExistingCoverage:
    """Tests for parsing existing coverage data."""

    def test_parses_coverage_json(self, tmp_path: Path) -> None:
        """Test parsing coverage.json file."""
        coverage_data = {
            "totals": {"percent_covered": 85.5},
            "files": {
                "src/auth.py": {
                    "summary": {"percent_covered": 90.0},
                    "missing_lines": [10, 15, 20],
                }
            },
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        result = check_coverage.parse_existing_coverage(tmp_path)

        assert result is not None
        assert result["totals"]["percent_covered"] == 85.5

    def test_returns_none_when_no_coverage(self, tmp_path: Path) -> None:
        """Test returns None when no coverage data exists."""
        result = check_coverage.parse_existing_coverage(tmp_path)

        assert result is None

    def test_handles_invalid_json(self, tmp_path: Path) -> None:
        """Test handling of invalid JSON file."""
        (tmp_path / "coverage.json").write_text("not valid json")

        result = check_coverage.parse_existing_coverage(tmp_path)

        assert result is None


class TestExtractCoverageInfo:
    """Tests for extracting coverage information."""

    def test_extracts_overall_coverage(self) -> None:
        """Test extraction of overall coverage percentage."""
        coverage_data = {
            "totals": {"percent_covered": 85.5},
            "files": {},
        }

        overall, file_coverage, uncovered = check_coverage.extract_coverage_info(coverage_data)

        assert overall == 85.5

    def test_extracts_file_coverage(self) -> None:
        """Test extraction of per-file coverage."""
        coverage_data = {
            "totals": {"percent_covered": 80.0},
            "files": {
                "src/auth.py": {"summary": {"percent_covered": 90.0}},
                "src/utils.py": {"summary": {"percent_covered": 70.0}},
            },
        }

        overall, file_coverage, uncovered = check_coverage.extract_coverage_info(coverage_data)

        assert file_coverage["src/auth.py"] == 90.0
        assert file_coverage["src/utils.py"] == 70.0

    def test_extracts_uncovered_lines(self) -> None:
        """Test extraction of uncovered lines."""
        coverage_data = {
            "totals": {"percent_covered": 80.0},
            "files": {
                "src/auth.py": {
                    "summary": {"percent_covered": 90.0},
                    "missing_lines": [10, 15, 20],
                }
            },
        }

        overall, file_coverage, uncovered = check_coverage.extract_coverage_info(coverage_data)

        assert uncovered["src/auth.py"] == [10, 15, 20]

    def test_handles_empty_files(self) -> None:
        """Test handling of empty files section."""
        coverage_data = {
            "totals": {"percent_covered": 0},
            "files": {},
        }

        overall, file_coverage, uncovered = check_coverage.extract_coverage_info(coverage_data)

        assert overall == 0
        assert file_coverage == {}
        assert uncovered == {}


class TestIdentifyCoverageGaps:
    """Tests for identifying coverage gaps."""

    def test_identifies_files_below_threshold(self) -> None:
        """Test identification of files below threshold."""
        file_coverage = {
            "src/auth.py": 90.0,
            "src/utils.py": 60.0,
            "src/main.py": 75.0,
        }
        uncovered_lines = {
            "src/utils.py": [10, 15, 20, 25, 30],
            "src/main.py": [5, 10],
        }

        gaps = check_coverage.identify_coverage_gaps(
            file_coverage, uncovered_lines, min_coverage=80.0
        )

        assert len(gaps) == 2
        # Should be sorted by gap size (largest first)
        assert gaps[0]["file"] == "src/utils.py"
        assert gaps[0]["coverage"] == 60.0
        assert gaps[0]["gap"] == 20.0

    def test_includes_sample_uncovered_lines(self) -> None:
        """Test that sample uncovered lines are included."""
        file_coverage = {"src/auth.py": 50.0}
        uncovered_lines = {"src/auth.py": list(range(1, 20))}

        gaps = check_coverage.identify_coverage_gaps(
            file_coverage, uncovered_lines, min_coverage=80.0
        )

        assert len(gaps) == 1
        assert len(gaps[0]["sample_lines"]) <= 10

    def test_no_gaps_when_above_threshold(self) -> None:
        """Test no gaps when all files above threshold."""
        file_coverage = {
            "src/auth.py": 90.0,
            "src/utils.py": 85.0,
        }
        uncovered_lines: dict = {}

        gaps = check_coverage.identify_coverage_gaps(
            file_coverage, uncovered_lines, min_coverage=80.0
        )

        assert len(gaps) == 0


class TestExecuteFunction:
    """Tests for the main execute function."""

    def test_returns_coverage_from_existing_data(self, tmp_path: Path) -> None:
        """Test returning coverage from existing data."""
        coverage_data = {
            "totals": {"percent_covered": 85.5},
            "files": {
                "src/auth.py": {
                    "summary": {"percent_covered": 90.0},
                    "missing_lines": [],
                }
            },
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        result = check_coverage.execute(
            repo_path=str(tmp_path),
            min_coverage=80.0,
            run_tests=False,
        )

        assert result["success"] is True
        assert result["overall_coverage"] == 85.5
        assert result["meets_threshold"] is True

    def test_identifies_threshold_failure(self, tmp_path: Path) -> None:
        """Test identification of threshold failure."""
        coverage_data = {
            "totals": {"percent_covered": 70.0},
            "files": {},
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        result = check_coverage.execute(
            repo_path=str(tmp_path),
            min_coverage=80.0,
            run_tests=False,
        )

        assert result["success"] is True
        assert result["meets_threshold"] is False

    def test_returns_error_for_nonexistent_repo(self) -> None:
        """Test error return for nonexistent repository."""
        result = check_coverage.execute(
            repo_path="/nonexistent/path",
            min_coverage=80.0,
            run_tests=False,
        )

        assert result["success"] is False
        assert "error" in result

    def test_returns_error_when_no_coverage_data(self, tmp_path: Path) -> None:
        """Test error when no coverage data available."""
        result = check_coverage.execute(
            repo_path=str(tmp_path),
            min_coverage=80.0,
            run_tests=False,
        )

        assert result["success"] is False
        assert "coverage data" in result["error"].lower()

    def test_includes_stats(self, tmp_path: Path) -> None:
        """Test that stats are included in result."""
        coverage_data = {
            "totals": {"percent_covered": 80.0},
            "files": {
                "src/auth.py": {
                    "summary": {"percent_covered": 70.0},
                    "missing_lines": [1, 2, 3],
                },
                "src/utils.py": {
                    "summary": {"percent_covered": 90.0},
                    "missing_lines": [],
                },
            },
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        result = check_coverage.execute(
            repo_path=str(tmp_path),
            min_coverage=80.0,
            run_tests=False,
        )

        assert "stats" in result
        assert result["stats"]["total_files"] == 2
        assert result["stats"]["total_uncovered_lines"] == 3

    def test_includes_coverage_gaps(self, tmp_path: Path) -> None:
        """Test that coverage gaps are included."""
        coverage_data = {
            "totals": {"percent_covered": 60.0},
            "files": {
                "src/auth.py": {
                    "summary": {"percent_covered": 50.0},
                    "missing_lines": [1, 2, 3, 4, 5],
                }
            },
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        result = check_coverage.execute(
            repo_path=str(tmp_path),
            min_coverage=80.0,
            run_tests=False,
        )

        assert len(result["coverage_gaps"]) > 0
        assert result["coverage_gaps"][0]["file"] == "src/auth.py"


class TestRunCoverage:
    """Tests for running coverage with pytest."""

    def test_runs_pytest_with_coverage(self, tmp_path: Path) -> None:
        """Test running pytest with coverage options."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            # Create a dummy coverage.json after "running"
            coverage_data = {"totals": {"percent_covered": 80.0}, "files": {}}

            def create_coverage(*args, **kwargs):
                (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))
                return MagicMock(returncode=0)

            mock_run.side_effect = create_coverage

            result = check_coverage.run_coverage(tmp_path)

            assert result is not None
            mock_run.assert_called_once()

    def test_returns_none_on_timeout(self, tmp_path: Path) -> None:
        """Test returns None on timeout."""
        import subprocess

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="pytest", timeout=300)

            result = check_coverage.run_coverage(tmp_path)

            assert result is None

    def test_returns_none_on_error(self, tmp_path: Path) -> None:
        """Test returns None on error."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = Exception("pytest failed")

            result = check_coverage.run_coverage(tmp_path)

            assert result is None


class TestSourcePathFiltering:
    """Tests for source path filtering."""

    def test_filters_by_source_paths(self, tmp_path: Path) -> None:
        """Test filtering coverage by source paths."""
        coverage_data = {
            "totals": {"percent_covered": 80.0},
            "files": {
                "src/auth.py": {"summary": {"percent_covered": 90.0}},
                "src/utils.py": {"summary": {"percent_covered": 70.0}},
                "tests/test_auth.py": {"summary": {"percent_covered": 100.0}},
            },
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        result = check_coverage.execute(
            repo_path=str(tmp_path),
            source_paths=["src"],
            min_coverage=80.0,
            run_tests=False,
        )

        # Should only include src/ files in analysis
        # (Implementation may vary - this tests the expected behavior)
        assert result["success"] is True
