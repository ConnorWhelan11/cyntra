"""
Tests for ComfyUI stage execution in the fab pipeline.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cyntra.fab.stage_executor import (
    execute_comfyui_stage,
    execute_stage,
    _resolve_comfyui_workflow_path,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def temp_dirs(tmp_path: Path) -> dict[str, Path]:
    """Create temp directories for testing."""
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    stage_dir = tmp_path / "stages" / "comfyui_stage"
    stage_dir.mkdir(parents=True)
    world_dir = tmp_path / "world"
    world_dir.mkdir()
    workflows_dir = tmp_path / "fab" / "workflows" / "comfyui"
    workflows_dir.mkdir(parents=True)
    return {
        "run_dir": run_dir,
        "stage_dir": stage_dir,
        "world_dir": world_dir,
        "workflows_dir": workflows_dir,
        "root": tmp_path,
    }


@pytest.fixture
def sample_workflow(temp_dirs: dict[str, Path]) -> Path:
    """Create a sample workflow file."""
    workflow = {
        "1": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 0,
                "steps": 20,
            },
        },
        "2": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "output",
            },
        },
    }
    workflow_path = temp_dirs["workflows_dir"] / "test_workflow.json"
    workflow_path.write_text(json.dumps(workflow), encoding="utf-8")
    return workflow_path


@pytest.fixture
def mock_manifest() -> MagicMock:
    """Create a mock manifest with determinism settings."""
    manifest = MagicMock()
    manifest.data = {
        "determinism": {
            "seed": 42,
        },
    }
    return manifest


@pytest.fixture
def mock_world_config(temp_dirs: dict[str, Path]) -> MagicMock:
    """Create a mock world config."""
    config = MagicMock()
    config.world_dir = temp_dirs["world_dir"]
    config.world_id = "test_world"
    return config


@pytest.fixture
def basic_stage(sample_workflow: Path) -> dict[str, Any]:
    """Create a basic ComfyUI stage config."""
    return {
        "id": "texture_gen",
        "type": "comfyui",
        "workflow": str(sample_workflow),
        "comfyui_params": {
            "positive_prompt": "test prompt",
        },
        "settings": {
            "host": "localhost",
            "port": 8188,
            "timeout_seconds": 60,
        },
    }


# ---------------------------------------------------------------------------
# Test: Workflow Path Resolution
# ---------------------------------------------------------------------------


class TestResolveWorkflowPath:
    """Tests for _resolve_comfyui_workflow_path."""

    def test_absolute_path(self, sample_workflow: Path, mock_world_config: MagicMock, temp_dirs: dict[str, Path]):
        """Test resolving absolute path."""
        result = _resolve_comfyui_workflow_path(
            str(sample_workflow),
            mock_world_config,
            temp_dirs["run_dir"],
        )
        assert result == sample_workflow

    def test_relative_to_world_dir(self, temp_dirs: dict[str, Path], mock_world_config: MagicMock):
        """Test resolving path relative to world directory."""
        workflow = temp_dirs["world_dir"] / "workflow.json"
        workflow.write_text("{}", encoding="utf-8")
        mock_world_config.world_dir = temp_dirs["world_dir"]

        result = _resolve_comfyui_workflow_path(
            "workflow.json",
            mock_world_config,
            temp_dirs["run_dir"],
        )
        assert result == workflow

    def test_relative_to_repo_root(self, temp_dirs: dict[str, Path], mock_world_config: MagicMock):
        """Test resolving path relative to repo root."""
        # Create .git to mark repo root
        (temp_dirs["root"] / ".git").mkdir()
        workflow = temp_dirs["root"] / "custom" / "workflow.json"
        workflow.parent.mkdir(parents=True, exist_ok=True)
        workflow.write_text("{}", encoding="utf-8")

        result = _resolve_comfyui_workflow_path(
            "custom/workflow.json",
            mock_world_config,
            temp_dirs["run_dir"],
        )
        assert result == workflow

    def test_in_comfyui_workflows_dir(self, sample_workflow: Path, temp_dirs: dict[str, Path], mock_world_config: MagicMock):
        """Test resolving path from fab/workflows/comfyui/ directory."""
        # Create .git to mark repo root
        (temp_dirs["root"] / ".git").mkdir()

        result = _resolve_comfyui_workflow_path(
            sample_workflow.name,  # Just the filename
            mock_world_config,
            temp_dirs["run_dir"],
        )
        assert result == sample_workflow

    def test_not_found(self, temp_dirs: dict[str, Path], mock_world_config: MagicMock):
        """Test returning None when workflow not found."""
        result = _resolve_comfyui_workflow_path(
            "nonexistent_workflow.json",
            mock_world_config,
            temp_dirs["run_dir"],
        )
        assert result is None

    def test_empty_ref(self, temp_dirs: dict[str, Path], mock_world_config: MagicMock):
        """Test returning None for empty workflow ref."""
        result = _resolve_comfyui_workflow_path(
            "",
            mock_world_config,
            temp_dirs["run_dir"],
        )
        assert result is None


# ---------------------------------------------------------------------------
# Test: ComfyUI Stage Execution
# ---------------------------------------------------------------------------


class TestExecuteComfyuiStage:
    """Tests for execute_comfyui_stage."""

    def test_no_workflow_specified(
        self,
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test error when no workflow is specified."""
        stage = {"id": "test", "type": "comfyui"}

        result = execute_comfyui_stage(
            stage=stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "No workflow specified" in result["errors"][0]

    def test_workflow_not_found(
        self,
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test error when workflow file doesn't exist."""
        stage = {
            "id": "test",
            "type": "comfyui",
            "workflow": "nonexistent.json",
        }

        result = execute_comfyui_stage(
            stage=stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "Workflow not found" in result["errors"][0]

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_server_not_available(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test error when ComfyUI server is not available."""
        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})

        result = execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "not available" in result["errors"][0]

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_successful_execution(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test successful workflow execution."""
        # Create mock result
        mock_result = MagicMock()
        mock_result.status = "completed"
        mock_result.execution_time_ms = 5000
        mock_result.error = None
        mock_result.node_errors = {}

        # Create output file
        output_file = temp_dirs["stage_dir"] / "output_00001_.png"
        output_file.write_bytes(b"fake image data")

        # Setup mock client
        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
        mock_client.download_outputs = AsyncMock(return_value={
            "2": [output_file],
        })
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={"1": {}})
        mock_client_cls.inject_seed = MagicMock(return_value={"1": {}})
        mock_client_cls.inject_params = MagicMock(return_value={"1": {}})

        result = execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is True
        assert len(result["outputs"]) == 1
        assert str(output_file) in result["outputs"]
        assert result["metadata"]["prompt_id"] == "prompt-123"
        assert result["metadata"]["execution_time_ms"] == 5000
        assert len(result["errors"]) == 0

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_execution_timeout(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test timeout during workflow execution."""
        from cyntra.fab.comfyui_client import ComfyUITimeoutError

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(side_effect=ComfyUITimeoutError("Timeout"))
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})
        mock_client_cls.inject_params = MagicMock(return_value={})

        result = execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "timed out" in result["errors"][0]
        assert "duration_ms" in result["metadata"]

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_execution_failure(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test workflow execution failure."""
        mock_result = MagicMock()
        mock_result.status = "failed"
        mock_result.execution_time_ms = 1000
        mock_result.error = "Node execution failed"
        mock_result.node_errors = {"1": "Memory error"}

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})
        mock_client_cls.inject_params = MagicMock(return_value={})

        result = execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "Node execution failed" in result["errors"][0]
        assert "Node errors" in result["errors"][0]

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_seed_from_manifest(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
    ):
        """Test that seed is extracted from manifest."""
        manifest = MagicMock()
        manifest.data = {"determinism": {"seed": 12345}}

        mock_result = MagicMock()
        mock_result.status = "completed"
        mock_result.execution_time_ms = 1000
        mock_result.error = None
        mock_result.node_errors = {}

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
        mock_client.download_outputs = AsyncMock(return_value={})
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})
        mock_client_cls.inject_params = MagicMock(return_value={})

        execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=manifest,
        )

        # Verify inject_seed was called with the manifest seed
        mock_client_cls.inject_seed.assert_called_once()
        call_args = mock_client_cls.inject_seed.call_args
        assert call_args[0][1] == 12345  # Second positional arg is seed

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_params_merged(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test that stage params and world params are merged."""
        mock_result = MagicMock()
        mock_result.status = "completed"
        mock_result.execution_time_ms = 1000
        mock_result.error = None
        mock_result.node_errors = {}

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
        mock_client.download_outputs = AsyncMock(return_value={})
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})
        mock_client_cls.inject_params = MagicMock(return_value={})

        world_params = {"steps": 30, "cfg": 7.5}
        basic_stage["comfyui_params"] = {"positive_prompt": "test", "steps": 50}

        execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params=world_params,
            manifest=mock_manifest,
        )

        # Verify inject_params was called with merged params (stage overrides world)
        mock_client_cls.inject_params.assert_called_once()
        call_args = mock_client_cls.inject_params.call_args
        merged = call_args[0][1]
        assert merged["steps"] == 50  # Stage param overrides world param
        assert merged["cfg"] == 7.5  # World param preserved
        assert merged["positive_prompt"] == "test"


# ---------------------------------------------------------------------------
# Test: Stage Dispatch
# ---------------------------------------------------------------------------


class TestExecuteStageDispatch:
    """Tests for execute_stage routing to ComfyUI."""

    @patch("cyntra.fab.stage_executor.execute_comfyui_stage")
    def test_routes_comfyui_type(
        self,
        mock_execute: MagicMock,
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test that 'comfyui' stage type routes to execute_comfyui_stage."""
        mock_execute.return_value = {
            "success": True,
            "outputs": [],
            "metadata": {},
            "errors": [],
        }

        stage = {"id": "test", "type": "comfyui", "workflow": "test.json"}

        result = execute_stage(
            stage=stage,
            world_config=mock_world_config,
            manifest=mock_manifest,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
        )

        mock_execute.assert_called_once()
        assert result["success"] is True

    def test_unknown_stage_type(
        self,
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test error for unknown stage type."""
        stage = {"id": "test", "type": "unknown_type"}

        result = execute_stage(
            stage=stage,
            world_config=mock_world_config,
            manifest=mock_manifest,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
        )

        assert result["success"] is False
        assert "Unknown stage type" in result["errors"][0]


# ---------------------------------------------------------------------------
# Test: Download Error Handling
# ---------------------------------------------------------------------------


class TestDownloadErrorHandling:
    """Tests for handling download failures."""

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_partial_success_on_download_failure(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test that download failure results in partial success."""
        mock_result = MagicMock()
        mock_result.status = "completed"
        mock_result.execution_time_ms = 5000
        mock_result.error = None
        mock_result.node_errors = {}

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
        mock_client.download_outputs = AsyncMock(side_effect=Exception("Download failed"))
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})
        mock_client_cls.inject_params = MagicMock(return_value={})

        result = execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        # Workflow completed but download failed
        assert result["success"] is False
        assert "download_error" in result["metadata"]
        assert "Failed to download outputs" in result["errors"][0]


# ---------------------------------------------------------------------------
# Test: Connection Errors
# ---------------------------------------------------------------------------


class TestConnectionErrors:
    """Tests for ComfyUI connection error handling."""

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_connection_error(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test handling of connection errors."""
        from cyntra.fab.comfyui_client import ComfyUIConnectionError

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(side_effect=ComfyUIConnectionError("Connection refused"))
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})

        result = execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "Cannot connect to ComfyUI" in result["errors"][0]


# ---------------------------------------------------------------------------
# Test: Workflow Loading Errors
# ---------------------------------------------------------------------------


class TestWorkflowLoadingErrors:
    """Tests for workflow loading error handling."""

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_invalid_workflow_json(
        self,
        mock_client_cls: MagicMock,
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test handling of invalid workflow JSON."""
        # Create invalid JSON file
        workflow_path = temp_dirs["workflows_dir"] / "invalid.json"
        workflow_path.write_text("{ invalid json }", encoding="utf-8")

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(side_effect=json.JSONDecodeError("Invalid", "", 0))
        mock_client_cls.inject_seed = MagicMock(return_value={})

        stage = {
            "id": "test",
            "type": "comfyui",
            "workflow": str(workflow_path),
        }

        result = execute_comfyui_stage(
            stage=stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        assert result["success"] is False
        assert "Failed to load workflow" in result["errors"][0]


# ---------------------------------------------------------------------------
# Test: Stage Settings Override
# ---------------------------------------------------------------------------


class TestSettingsOverride:
    """Tests for stage settings overriding defaults."""

    @patch("cyntra.fab.comfyui_client.ComfyUIConfig")
    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_custom_host_port(
        self,
        mock_client_cls: MagicMock,
        mock_config_cls: MagicMock,
        sample_workflow: Path,
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
        mock_manifest: MagicMock,
    ):
        """Test that custom host/port are used."""
        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})

        stage = {
            "id": "test",
            "type": "comfyui",
            "workflow": str(sample_workflow),
            "settings": {
                "host": "gpu-server",
                "port": 9999,
                "timeout_seconds": 300,
            },
        }

        execute_comfyui_stage(
            stage=stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=mock_manifest,
        )

        # Verify config was created with custom settings
        mock_config_cls.assert_called_once()
        call_kwargs = mock_config_cls.call_args
        assert call_kwargs[1]["host"] == "gpu-server"
        assert call_kwargs[1]["port"] == 9999
        assert call_kwargs[1]["timeout_seconds"] == 300


# ---------------------------------------------------------------------------
# Test: Default Seed Handling
# ---------------------------------------------------------------------------


class TestDefaultSeedHandling:
    """Tests for default seed when manifest doesn't have determinism."""

    @patch("cyntra.fab.comfyui_client.ComfyUIClient")
    def test_default_seed_when_no_determinism(
        self,
        mock_client_cls: MagicMock,
        basic_stage: dict[str, Any],
        temp_dirs: dict[str, Path],
        mock_world_config: MagicMock,
    ):
        """Test default seed of 42 when manifest has no determinism."""
        manifest = MagicMock()
        manifest.data = {}  # No determinism key

        mock_result = MagicMock()
        mock_result.status = "completed"
        mock_result.execution_time_ms = 1000
        mock_result.error = None
        mock_result.node_errors = {}

        mock_client = MagicMock()
        mock_client.health_check = AsyncMock(return_value=True)
        mock_client.queue_prompt = AsyncMock(return_value="prompt-123")
        mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
        mock_client.download_outputs = AsyncMock(return_value={})
        mock_client_cls.return_value = mock_client
        mock_client_cls.load_workflow = MagicMock(return_value={})
        mock_client_cls.inject_seed = MagicMock(return_value={})
        mock_client_cls.inject_params = MagicMock(return_value={})

        execute_comfyui_stage(
            stage=basic_stage,
            world_config=mock_world_config,
            run_dir=temp_dirs["run_dir"],
            stage_dir=temp_dirs["stage_dir"],
            inputs={},
            params={},
            manifest=manifest,
        )

        # Verify inject_seed was called with default seed 42
        mock_client_cls.inject_seed.assert_called_once()
        call_args = mock_client_cls.inject_seed.call_args
        assert call_args[0][1] == 42
