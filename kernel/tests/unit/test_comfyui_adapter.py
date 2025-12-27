"""
Tests for ComfyUI adapter.
"""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cyntra.adapters.base import CostEstimate, PatchProof
from cyntra.adapters.comfyui import ComfyUIAdapter
from cyntra.fab.comfyui_client import (
    ComfyUIConnectionError,
    ComfyUIExecutionError,
    ComfyUIResult,
    ComfyUITimeoutError,
)


@pytest.fixture
def sample_manifest() -> dict[str, Any]:
    """Sample manifest for ComfyUI execution."""
    return {
        "workcell_id": "wc-comfyui-test-001",
        "issue": {
            "id": "test-issue-42",
            "title": "Generate car texture",
            "description": "Generate PBR textures for car model",
        },
        "comfyui_config": {
            "workflow_path": "fab/workflows/comfyui/txt2img_test.json",
            "seed": 42,
            "params": {
                "positive_prompt": "a red sports car, high detail",
                "negative_prompt": "blurry, low quality",
                "steps": 30,
            },
        },
    }


@pytest.fixture
def sample_workflow() -> dict[str, Any]:
    """Sample ComfyUI workflow."""
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 0,
                "steps": 20,
                "cfg": 7.0,
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Positive Prompt"},
            "inputs": {"text": ""},
        },
    }


class TestComfyUIAdapterInit:
    """Tests for adapter initialization."""

    def test_default_config(self) -> None:
        adapter = ComfyUIAdapter()
        assert adapter.name == "comfyui"
        assert adapter.host == "localhost"
        assert adapter.port == 8188
        assert adapter.timeout_minutes == 10

    def test_custom_config(self) -> None:
        adapter = ComfyUIAdapter(
            {
                "host": "192.168.1.100",
                "port": 9000,
                "timeout_minutes": 30,
            }
        )
        assert adapter.host == "192.168.1.100"
        assert adapter.port == 9000
        assert adapter.timeout_minutes == 30

    def test_supports_flags(self) -> None:
        adapter = ComfyUIAdapter()
        assert adapter.supports_mcp is False
        assert adapter.supports_streaming is False


class TestComfyUIAdapterEstimateCost:
    """Tests for cost estimation."""

    def test_estimate_cost_is_zero(self, sample_manifest: dict) -> None:
        adapter = ComfyUIAdapter()
        estimate = adapter.estimate_cost(sample_manifest)

        assert isinstance(estimate, CostEstimate)
        assert estimate.estimated_tokens == 0
        assert estimate.estimated_cost_usd == 0.0
        assert estimate.model == "local-comfyui"

    def test_estimate_cost_empty_manifest(self) -> None:
        adapter = ComfyUIAdapter()
        estimate = adapter.estimate_cost({})

        assert estimate.estimated_cost_usd == 0.0


class TestComfyUIAdapterHealthCheck:
    """Tests for health check."""

    @pytest.mark.asyncio
    async def test_health_check_success(self) -> None:
        adapter = ComfyUIAdapter()

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_get.return_value = mock_client

            result = await adapter.health_check()

            assert result is True
            assert adapter._available is True

    @pytest.mark.asyncio
    async def test_health_check_failure(self) -> None:
        adapter = ComfyUIAdapter()

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = False
            mock_get.return_value = mock_client

            result = await adapter.health_check()

            assert result is False
            assert adapter._available is False

    @pytest.mark.asyncio
    async def test_health_check_exception(self) -> None:
        adapter = ComfyUIAdapter()

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.side_effect = Exception("Connection failed")
            mock_get.return_value = mock_client

            result = await adapter.health_check()

            assert result is False
            assert adapter._available is False

    def test_health_check_sync(self) -> None:
        adapter = ComfyUIAdapter()

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = MagicMock()
            mock_client.health_check = AsyncMock(return_value=True)
            mock_get.return_value = mock_client

            result = adapter.health_check_sync()
            assert result is True


class TestComfyUIAdapterExecute:
    """Tests for workflow execution."""

    @pytest.mark.asyncio
    async def test_execute_success(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        # Mock client
        mock_result = ComfyUIResult(
            prompt_id="test-prompt-123",
            status="completed",
            outputs={"9": [Path("output.png")]},
            execution_time_ms=5000,
        )

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_client.queue_prompt.return_value = "test-prompt-123"
            mock_client.wait_for_completion.return_value = mock_result
            mock_client.download_outputs.return_value = {
                "9": [tmp_path / "comfyui_outputs" / "output.png"]
            }
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        assert isinstance(proof, PatchProof)
        assert proof.status == "success"
        assert proof.workcell_id == "wc-comfyui-test-001"
        assert proof.issue_id == "test-issue-42"
        assert proof.metadata["toolchain"] == "comfyui"
        assert proof.metadata["seed"] == 42
        assert proof.artifacts is not None
        assert proof.artifacts["prompt_id"] == "test-prompt-123"
        assert proof.confidence == 0.95

    @pytest.mark.asyncio
    async def test_execute_workflow_not_found(
        self,
        sample_manifest: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        proof = await adapter.execute(
            manifest=sample_manifest,
            workcell_path=tmp_path,
            timeout=timedelta(minutes=5),
        )

        assert proof.status == "error"
        assert "Workflow not found" in proof.metadata.get("error", "")

    @pytest.mark.asyncio
    async def test_execute_server_unavailable(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = False
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        assert proof.status == "error"
        assert "not available" in proof.metadata.get("error", "")

    @pytest.mark.asyncio
    async def test_execute_timeout(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_client.queue_prompt.return_value = "test-prompt"
            mock_client.wait_for_completion.side_effect = ComfyUITimeoutError(
                "Timed out after 300s"
            )
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        assert proof.status == "timeout"
        assert "Timed out" in proof.artifacts.get("error", "")

    @pytest.mark.asyncio
    async def test_execute_connection_error(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_client.queue_prompt.side_effect = ComfyUIConnectionError("Connection refused")
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        assert proof.status == "error"
        assert "Connection failed" in proof.metadata.get("error", "")

    @pytest.mark.asyncio
    async def test_execute_execution_error(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_client.queue_prompt.side_effect = ComfyUIExecutionError("Invalid workflow")
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        assert proof.status == "error"
        assert "Execution failed" in proof.metadata.get("error", "")

    @pytest.mark.asyncio
    async def test_execute_failed_result(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        mock_result = ComfyUIResult(
            prompt_id="test-prompt",
            status="failed",
            error="Out of VRAM",
            node_errors={"5": "Memory error"},
        )

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_client.queue_prompt.return_value = "test-prompt"
            mock_client.wait_for_completion.return_value = mock_result
            mock_client.download_outputs.return_value = {}
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        assert proof.status == "failed"
        assert proof.artifacts is not None
        assert proof.artifacts.get("error") == "Out of VRAM"
        assert "5" in proof.artifacts.get("node_errors", {})

    def test_execute_sync(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        mock_result = ComfyUIResult(
            prompt_id="test-prompt",
            status="completed",
            outputs={},
            execution_time_ms=1000,
        )

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = MagicMock()
            mock_client.health_check = AsyncMock(return_value=True)
            mock_client.queue_prompt = AsyncMock(return_value="test-prompt")
            mock_client.wait_for_completion = AsyncMock(return_value=mock_result)
            mock_client.download_outputs = AsyncMock(return_value={})
            mock_get.return_value = mock_client

            proof = adapter.execute_sync(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout_seconds=300,
            )

        assert isinstance(proof, PatchProof)


class TestComfyUIAdapterResolveWorkflowPath:
    """Tests for workflow path resolution."""

    def test_resolve_absolute_path(self, tmp_path: Path) -> None:
        adapter = ComfyUIAdapter()

        workflow_file = tmp_path / "workflow.json"
        workflow_file.write_text("{}")

        result = adapter._resolve_workflow_path(
            str(workflow_file),
            tmp_path / "workcell",
        )

        assert result == workflow_file

    def test_resolve_relative_to_workcell(self, tmp_path: Path) -> None:
        adapter = ComfyUIAdapter()

        workcell = tmp_path / "workcell"
        workcell.mkdir()
        workflow_file = workcell / "workflow.json"
        workflow_file.write_text("{}")

        result = adapter._resolve_workflow_path("workflow.json", workcell)

        assert result == workflow_file

    def test_resolve_relative_to_repo_root(self, tmp_path: Path) -> None:
        adapter = ComfyUIAdapter()

        # Simulate workcell in .workcells directory
        workcells_dir = tmp_path / ".workcells"
        workcells_dir.mkdir()
        workcell = workcells_dir / "wc-test"
        workcell.mkdir()

        # Workflow in repo root
        workflow_dir = tmp_path / "fab" / "workflows"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "test.json"
        workflow_file.write_text("{}")

        result = adapter._resolve_workflow_path("fab/workflows/test.json", workcell)

        assert result == workflow_file

    def test_resolve_not_found(self, tmp_path: Path) -> None:
        adapter = ComfyUIAdapter()

        result = adapter._resolve_workflow_path(
            "nonexistent/workflow.json",
            tmp_path,
        )

        assert result is None

    def test_resolve_configured_workflow_dir(self, tmp_path: Path) -> None:
        workflow_dir = tmp_path / "custom_workflows"
        workflow_dir.mkdir()
        workflow_file = workflow_dir / "test.json"
        workflow_file.write_text("{}")

        adapter = ComfyUIAdapter({"workflow_dir": str(workflow_dir)})

        result = adapter._resolve_workflow_path("test.json", tmp_path / "workcell")

        assert result == workflow_file


class TestComfyUIAdapterParseTaskConfig:
    """Tests for task config parsing."""

    def test_parse_full_config(self) -> None:
        adapter = ComfyUIAdapter()

        config = {
            "workflow_path": "path/to/workflow.json",
            "seed": 123,
            "params": {"steps": 50},
            "timeout_seconds": 600,
        }

        result = adapter._parse_task_config(config, timedelta(minutes=5))

        assert result.workflow_path == "path/to/workflow.json"
        assert result.seed == 123
        assert result.params == {"steps": 50}
        assert result.timeout_seconds == 600

    def test_parse_minimal_config(self) -> None:
        adapter = ComfyUIAdapter()

        config = {"workflow_path": "workflow.json"}

        result = adapter._parse_task_config(config, timedelta(minutes=10))

        assert result.workflow_path == "workflow.json"
        assert result.seed == 42  # Default
        assert result.params is None
        assert result.timeout_seconds == 600  # From timeout arg

    def test_parse_empty_config(self) -> None:
        adapter = ComfyUIAdapter()

        result = adapter._parse_task_config({}, timedelta(seconds=120))

        assert result.workflow_path == ""
        assert result.seed == 42
        assert result.timeout_seconds == 120


class TestComfyUIAdapterRegistry:
    """Tests for adapter registry integration."""

    def test_get_adapter(self) -> None:
        from cyntra.adapters import get_adapter

        adapter = get_adapter("comfyui")

        assert adapter is not None
        assert isinstance(adapter, ComfyUIAdapter)
        assert adapter.name == "comfyui"

    def test_get_adapter_with_config(self) -> None:
        from cyntra.adapters import get_adapter

        adapter = get_adapter("comfyui", {"host": "custom.host", "port": 9000})

        assert adapter is not None
        assert adapter.host == "custom.host"
        assert adapter.port == 9000

    def test_lazy_import(self) -> None:
        from cyntra.adapters import ComfyUIAdapter as LazyAdapter

        assert LazyAdapter is ComfyUIAdapter


class TestComfyUIAdapterProofStructure:
    """Tests for PatchProof structure."""

    @pytest.mark.asyncio
    async def test_proof_has_required_fields(
        self,
        sample_manifest: dict,
        sample_workflow: dict,
        tmp_path: Path,
    ) -> None:
        adapter = ComfyUIAdapter()

        # Create workflow file
        workflow_dir = tmp_path / "fab" / "workflows" / "comfyui"
        workflow_dir.mkdir(parents=True)
        workflow_file = workflow_dir / "txt2img_test.json"
        workflow_file.write_text(json.dumps(sample_workflow))

        mock_result = ComfyUIResult(
            prompt_id="test",
            status="completed",
            outputs={},
            execution_time_ms=1000,
        )

        with patch.object(adapter, "_get_client") as mock_get:
            mock_client = AsyncMock()
            mock_client.health_check.return_value = True
            mock_client.queue_prompt.return_value = "test"
            mock_client.wait_for_completion.return_value = mock_result
            mock_client.download_outputs.return_value = {}
            mock_get.return_value = mock_client

            proof = await adapter.execute(
                manifest=sample_manifest,
                workcell_path=tmp_path,
                timeout=timedelta(minutes=5),
            )

        # Check required fields
        assert proof.schema_version == "1.0.0"
        assert proof.workcell_id is not None
        assert proof.issue_id is not None
        assert proof.status in ("success", "failed", "error", "timeout")
        assert isinstance(proof.patch, dict)
        assert isinstance(proof.verification, dict)
        assert isinstance(proof.metadata, dict)
        assert proof.risk_classification == "low"

        # Check patch structure
        assert "files_modified" in proof.patch
        assert "diff_stats" in proof.patch
        assert "forbidden_path_violations" in proof.patch

        # Check verification structure
        assert "gates" in proof.verification
        assert "all_passed" in proof.verification
        assert "blocking_failures" in proof.verification

        # Check metadata
        assert proof.metadata["toolchain"] == "comfyui"
        assert "started_at" in proof.metadata
        assert "completed_at" in proof.metadata
        assert "duration_ms" in proof.metadata
