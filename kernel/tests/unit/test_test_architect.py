"""
Unit tests for the TestArchitectAdapter.

Tests:
- Adapter initialization
- Backing adapter delegation
- Test file discovery
- Coverage checking
- Prompt building
"""

from __future__ import annotations

import asyncio
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cyntra.adapters.base import PatchProof
from cyntra.adapters.test_architect import TestArchitectAdapter


@pytest.fixture
def adapter() -> TestArchitectAdapter:
    """Create a TestArchitectAdapter instance."""
    return TestArchitectAdapter({"backing_adapter": "claude", "model": "sonnet"})


@pytest.fixture
def sample_manifest() -> dict:
    """Create a sample manifest for testing."""
    return {
        "workcell_id": "wc-test-123",
        "issue": {
            "id": "42",
            "title": "Add tests for auth module",
            "description": "Create unit tests for the authentication module.",
            "acceptance_criteria": [
                "Test login functionality",
                "Test logout functionality",
                "Achieve 80% coverage",
            ],
            "context_files": ["src/auth.py", "src/utils.py"],
        },
    }


class TestAdapterInitialization:
    """Tests for adapter initialization."""

    def test_default_config(self) -> None:
        """Test adapter with default configuration."""
        adapter = TestArchitectAdapter()
        assert adapter.backing_adapter_name == "claude"
        assert adapter.backing_model == "sonnet"

    def test_custom_config(self) -> None:
        """Test adapter with custom configuration."""
        adapter = TestArchitectAdapter(
            {
                "backing_adapter": "codex",
                "model": "gpt-5.2",
            }
        )
        assert adapter.backing_adapter_name == "codex"
        assert adapter.backing_model == "gpt-5.2"

    def test_name_property(self) -> None:
        """Test adapter name."""
        adapter = TestArchitectAdapter()
        assert adapter.name == "test-architect"

    def test_supports_flags(self) -> None:
        """Test capability flags."""
        adapter = TestArchitectAdapter()
        assert adapter.supports_mcp is False
        assert adapter.supports_streaming is False


class TestAdapterAvailability:
    """Tests for adapter availability checking."""

    def test_available_when_backing_adapter_exists(self) -> None:
        """Test availability when backing adapter is available."""
        adapter = TestArchitectAdapter()

        with patch("cyntra.adapters.test_architect.get_adapter") as mock_get:
            mock_backing = MagicMock()
            mock_backing.available = True
            mock_get.return_value = mock_backing

            assert adapter.available is True

    def test_unavailable_when_backing_adapter_missing(self) -> None:
        """Test unavailability when backing adapter is not available."""
        adapter = TestArchitectAdapter()

        with patch("cyntra.adapters.test_architect.get_adapter") as mock_get:
            mock_get.return_value = None

            assert adapter.available is False

    def test_unavailable_when_backing_adapter_not_ready(self) -> None:
        """Test unavailability when backing adapter exists but not ready."""
        adapter = TestArchitectAdapter()

        with patch("cyntra.adapters.test_architect.get_adapter") as mock_get:
            mock_backing = MagicMock()
            mock_backing.available = False
            mock_get.return_value = mock_backing

            assert adapter.available is False


class TestPromptBuilding:
    """Tests for test architect prompt building."""

    def test_includes_issue_info(
        self, adapter: TestArchitectAdapter, sample_manifest: dict, tmp_path: Path
    ) -> None:
        """Test that prompt includes issue information."""
        prompt = adapter._build_test_architect_prompt(sample_manifest, tmp_path)

        assert "Add tests for auth module" in prompt
        assert "authentication module" in prompt

    def test_includes_acceptance_criteria(
        self, adapter: TestArchitectAdapter, sample_manifest: dict, tmp_path: Path
    ) -> None:
        """Test that prompt includes acceptance criteria."""
        prompt = adapter._build_test_architect_prompt(sample_manifest, tmp_path)

        assert "Test login functionality" in prompt
        assert "80% coverage" in prompt

    def test_includes_context_files(
        self, adapter: TestArchitectAdapter, sample_manifest: dict, tmp_path: Path
    ) -> None:
        """Test that prompt includes context files."""
        prompt = adapter._build_test_architect_prompt(sample_manifest, tmp_path)

        assert "src/auth.py" in prompt
        assert "src/utils.py" in prompt

    def test_includes_test_structure_example(
        self, adapter: TestArchitectAdapter, sample_manifest: dict, tmp_path: Path
    ) -> None:
        """Test that prompt includes test structure example."""
        prompt = adapter._build_test_architect_prompt(sample_manifest, tmp_path)

        assert "class Test" in prompt
        assert "pytest" in prompt


class TestFindExistingTests:
    """Tests for finding existing test files."""

    def test_finds_test_files_in_tests_dir(
        self, adapter: TestArchitectAdapter, tmp_path: Path
    ) -> None:
        """Test finding test files in tests/ directory."""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_auth.py").write_text("# test file")
        (tests_dir / "test_utils.py").write_text("# test file")

        result = adapter._find_existing_tests(tmp_path, ["src/auth.py"])

        assert "tests/test_auth.py" in result
        assert "tests/test_utils.py" in result

    def test_finds_test_pattern_files(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test finding *_test.py pattern files."""
        (tmp_path / "auth_test.py").write_text("# test file")

        result = adapter._find_existing_tests(tmp_path, ["src/auth.py"])

        assert "auth_test.py" in result

    def test_limits_results(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test that results are limited."""
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        # Create many test files
        for i in range(20):
            (tests_dir / f"test_module_{i}.py").write_text("# test")

        result = adapter._find_existing_tests(tmp_path, [])

        assert len(result) <= 10


class TestFindTestFiles:
    """Tests for finding created test files."""

    def test_finds_test_files_in_diff(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test finding test files from git diff."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout="src/auth.py\ntests/test_auth.py\ntests/test_utils.py\n",
                returncode=0,
            )

            result = adapter._find_test_files(tmp_path)

            assert "tests/test_auth.py" in result
            assert "tests/test_utils.py" in result
            assert "src/auth.py" not in result

    def test_handles_empty_diff(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test handling of empty git diff."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="", returncode=0)

            result = adapter._find_test_files(tmp_path)

            assert result == []

    def test_handles_git_error(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test handling of git command error."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = Exception("git error")

            result = adapter._find_test_files(tmp_path)

            assert result == []


class TestCoverageCheck:
    """Tests for coverage checking."""

    def test_parses_coverage_json(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test parsing coverage.json output."""
        import json

        # Create coverage.json
        coverage_data = {
            "totals": {"percent_covered": 85.5},
            "files": {"src/auth.py": {"summary": {"percent_covered": 90}}},
        }
        (tmp_path / "coverage.json").write_text(json.dumps(coverage_data))

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            result = adapter._check_coverage(tmp_path)

            assert result is not None
            assert result["total_coverage"] == 85.5
            assert result["tests_passed"] is True

    def test_handles_missing_coverage_file(
        self, adapter: TestArchitectAdapter, tmp_path: Path
    ) -> None:
        """Test handling when coverage.json doesn't exist."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1)

            result = adapter._check_coverage(tmp_path)

            assert result is None

    def test_handles_timeout(self, adapter: TestArchitectAdapter, tmp_path: Path) -> None:
        """Test handling of pytest timeout."""
        import subprocess

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="pytest", timeout=300)

            result = adapter._check_coverage(tmp_path)

            assert result is None


class TestCostEstimation:
    """Tests for cost estimation."""

    def test_estimates_cost_for_sonnet(self, adapter: TestArchitectAdapter) -> None:
        """Test cost estimation for sonnet model."""
        manifest = {"issue": {"dk_estimated_tokens": 50000}}

        estimate = adapter.estimate_cost(manifest)

        assert estimate.model == "test-architect(sonnet)"
        # 50000 * 0.6 = 30000 tokens
        assert estimate.estimated_tokens == 30000
        # Cost should be tokens * rate
        assert estimate.estimated_cost_usd > 0

    def test_estimates_cost_for_haiku(self) -> None:
        """Test cost estimation for haiku model."""
        adapter = TestArchitectAdapter({"model": "haiku"})
        manifest = {"issue": {"dk_estimated_tokens": 50000}}

        estimate = adapter.estimate_cost(manifest)

        assert estimate.model == "test-architect(haiku)"
        # Haiku is cheaper
        assert estimate.estimated_cost_usd < 1.0


class TestExecution:
    """Tests for execute methods."""

    def test_execute_sync_returns_error_when_unavailable(
        self, sample_manifest: dict, tmp_path: Path
    ) -> None:
        """Test sync execution returns error when adapter unavailable."""
        adapter = TestArchitectAdapter()

        with patch.object(adapter, "available", False):
            proof = adapter.execute_sync(sample_manifest, tmp_path, 60)

            assert proof.status == "error"
            assert "No backing adapter" in proof.metadata.get("error", "")

    def test_execute_async_delegates_to_backing(
        self, sample_manifest: dict, tmp_path: Path
    ) -> None:
        """Test async execution delegates to backing adapter."""
        adapter = TestArchitectAdapter()

        mock_backing = AsyncMock()
        mock_backing.available = True
        mock_backing.execute = AsyncMock(
            return_value=PatchProof(
                schema_version="1.0.0",
                workcell_id="wc-test",
                issue_id="42",
                status="success",
                patch={},
                verification={"all_passed": True},
                metadata={},
            )
        )

        with patch("cyntra.adapters.test_architect.get_adapter") as mock_get:
            mock_get.return_value = mock_backing
            # Force re-check availability
            adapter._available = None
            adapter._backing_adapter = None

            proof = asyncio.run(adapter.execute(sample_manifest, tmp_path, timedelta(seconds=60)))

            assert proof.status == "success"
            assert proof.metadata.get("test_architect") is True

    def test_execute_adds_test_metadata(self, sample_manifest: dict, tmp_path: Path) -> None:
        """Test that execution adds test-architect metadata."""
        adapter = TestArchitectAdapter()

        mock_backing = AsyncMock()
        mock_backing.available = True
        mock_backing.execute = AsyncMock(
            return_value=PatchProof(
                schema_version="1.0.0",
                workcell_id="wc-test",
                issue_id="42",
                status="success",
                patch={},
                verification={"all_passed": True},
                metadata={},
            )
        )

        with patch("cyntra.adapters.test_architect.get_adapter") as mock_get:
            mock_get.return_value = mock_backing
            adapter._available = None
            adapter._backing_adapter = None

            proof = asyncio.run(adapter.execute(sample_manifest, tmp_path, timedelta(seconds=60)))

            assert proof.metadata["test_architect"] is True
            assert proof.metadata["backing_adapter"] == "claude"


class TestHealthCheck:
    """Tests for health check."""

    def test_health_check_returns_availability(self) -> None:
        """Test health check returns availability status."""
        adapter = TestArchitectAdapter()

        with patch.object(adapter, "available", True):
            result = asyncio.run(adapter.health_check())
            assert result is True

        with patch.object(adapter, "available", False):
            result = asyncio.run(adapter.health_check())
            assert result is False
