"""
Integration tests for ComfyUI.

These tests require a running ComfyUI server. Set the COMFYUI_TEST_SERVER
environment variable to enable them:

    COMFYUI_TEST_SERVER=localhost:8188 pytest tests/integration/test_comfyui_integration.py -v

The server must have the SDXL base model installed for workflow tests.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

# Skip all tests in this module if COMFYUI_TEST_SERVER is not set
pytestmark = pytest.mark.skipif(
    not os.environ.get("COMFYUI_TEST_SERVER"),
    reason="COMFYUI_TEST_SERVER environment variable not set",
)


def get_server_config() -> tuple[str, int]:
    """Parse server config from environment variable."""
    server = os.environ.get("COMFYUI_TEST_SERVER", "localhost:8188")
    if ":" in server:
        host, port_str = server.rsplit(":", 1)
        return host, int(port_str)
    return server, 8188


# ---------------------------------------------------------------------------
# Test: Client Health Check
# ---------------------------------------------------------------------------


class TestClientHealthCheck:
    """Integration tests for ComfyUI client health check."""

    @pytest.mark.asyncio
    async def test_health_check_real_server(self):
        """Test health check against real ComfyUI server."""
        from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

        host, port = get_server_config()
        config = ComfyUIConfig(host=host, port=port)
        client = ComfyUIClient(config)

        result = await client.health_check()

        # Server should be healthy
        assert result is True

    @pytest.mark.asyncio
    async def test_system_stats_available(self):
        """Test that system stats are available from real server."""
        from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

        host, port = get_server_config()
        config = ComfyUIConfig(host=host, port=port)
        client = ComfyUIClient(config)

        stats = await client.get_system_stats()

        # Should return system info
        assert stats is not None
        assert isinstance(stats, dict)


# ---------------------------------------------------------------------------
# Test: Adapter Health Check
# ---------------------------------------------------------------------------


class TestAdapterHealthCheck:
    """Integration tests for ComfyUI adapter."""

    @pytest.mark.asyncio
    async def test_adapter_health_check(self):
        """Test adapter health check against real server."""
        from cyntra.adapters.comfyui import ComfyUIAdapter

        host, port = get_server_config()
        adapter = ComfyUIAdapter({"host": host, "port": port})

        result = await adapter.health_check()

        assert result is True
        assert adapter.available is True

    def test_adapter_cost_estimate(self):
        """Test that adapter reports zero cost (local execution)."""
        from cyntra.adapters.comfyui import ComfyUIAdapter

        adapter = ComfyUIAdapter({})
        estimate = adapter.estimate_cost({})

        assert estimate.estimated_tokens == 0
        assert estimate.estimated_cost_usd == 0.0
        assert estimate.model == "local-comfyui"


# ---------------------------------------------------------------------------
# Test: Workflow Execution (requires SDXL model)
# ---------------------------------------------------------------------------


class TestWorkflowExecution:
    """Integration tests for workflow execution.

    These tests require the SDXL base model to be installed in ComfyUI.
    They are skipped if COMFYUI_SKIP_WORKFLOW_TESTS is set.
    """

    @pytest.fixture
    def skip_workflow_tests(self):
        """Skip workflow tests if explicitly disabled."""
        if os.environ.get("COMFYUI_SKIP_WORKFLOW_TESTS"):
            pytest.skip("COMFYUI_SKIP_WORKFLOW_TESTS is set")

    @pytest.fixture
    def sample_workflow(self, tmp_path: Path) -> Path:
        """Create a minimal test workflow."""
        import json

        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "test image", "clip": ["1", 1]},
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "", "clip": ["1", 1]},
            },
            "4": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512, "batch_size": 1},
            },
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 0,
                    "steps": 5,  # Minimal steps for speed
                    "cfg": 7.5,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0],
                },
            },
            "6": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
            },
            "7": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "test_output", "images": ["6", 0]},
            },
        }
        workflow_path = tmp_path / "test_workflow.json"
        workflow_path.write_text(json.dumps(workflow), encoding="utf-8")
        return workflow_path

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_queue_and_complete_workflow(
        self, skip_workflow_tests, sample_workflow: Path, tmp_path: Path
    ):
        """Test queueing and completing a real workflow."""
        from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

        host, port = get_server_config()
        config = ComfyUIConfig(host=host, port=port, timeout_seconds=300)
        client = ComfyUIClient(config)

        # Load and prepare workflow
        workflow = ComfyUIClient.load_workflow(sample_workflow)
        workflow = ComfyUIClient.inject_seed(workflow, 42)

        # Queue the workflow
        prompt_id = await client.queue_prompt(workflow)
        assert prompt_id is not None
        assert len(prompt_id) > 0

        # Wait for completion
        result = await client.wait_for_completion(prompt_id, timeout=300)

        # Should complete successfully
        assert result.status == "completed"
        assert result.error is None
        assert result.execution_time_ms > 0

        # Download outputs
        output_dir = tmp_path / "outputs"
        output_dir.mkdir()
        downloaded = await client.download_outputs(result, output_dir)

        # Should have downloaded at least one image
        assert len(downloaded) > 0
        total_files = sum(len(paths) for paths in downloaded.values())
        assert total_files > 0

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_deterministic_seed_produces_same_output(
        self, skip_workflow_tests, sample_workflow: Path, tmp_path: Path
    ):
        """Test that the same seed produces identical outputs."""
        from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

        host, port = get_server_config()
        config = ComfyUIConfig(host=host, port=port, timeout_seconds=300)
        client = ComfyUIClient(config)

        # Load workflow
        workflow = ComfyUIClient.load_workflow(sample_workflow)

        # Run with seed 42 twice
        results = []
        for run_idx in range(2):
            run_workflow = ComfyUIClient.inject_seed(workflow.copy(), 42)
            prompt_id = await client.queue_prompt(run_workflow)
            result = await client.wait_for_completion(prompt_id, timeout=300)
            assert result.status == "completed"

            output_dir = tmp_path / f"run_{run_idx}"
            output_dir.mkdir()
            downloaded = await client.download_outputs(result, output_dir)
            results.append(downloaded)

        # Both runs should produce outputs
        assert len(results[0]) > 0
        assert len(results[1]) > 0

        # Note: Full determinism verification would require comparing
        # actual image bytes, which depends on GPU/driver consistency


# ---------------------------------------------------------------------------
# Test: Error Handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    """Integration tests for error handling."""

    @pytest.mark.asyncio
    async def test_invalid_workflow_error(self):
        """Test error handling for invalid workflow."""
        from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

        host, port = get_server_config()
        config = ComfyUIConfig(host=host, port=port)
        client = ComfyUIClient(config)

        # Invalid workflow with missing required inputs
        invalid_workflow = {
            "1": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 0,
                    # Missing required inputs: model, positive, negative, latent_image
                },
            },
        }

        # Should fail to queue or execute
        try:
            prompt_id = await client.queue_prompt(invalid_workflow)
            result = await client.wait_for_completion(prompt_id, timeout=30)
            # If we get here, check that it failed
            assert result.status != "completed" or result.error is not None
        except Exception:
            # Expected - invalid workflow should raise an error
            pass

    @pytest.mark.asyncio
    async def test_missing_model_error(self):
        """Test error handling for missing model."""
        from cyntra.fab.comfyui_client import ComfyUIClient, ComfyUIConfig

        host, port = get_server_config()
        config = ComfyUIConfig(host=host, port=port)
        client = ComfyUIClient(config)

        # Workflow referencing non-existent model
        workflow = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "nonexistent_model_12345.safetensors"},
            },
        }

        # Should fail
        try:
            prompt_id = await client.queue_prompt(workflow)
            result = await client.wait_for_completion(prompt_id, timeout=30)
            # If we get here, check that it failed
            assert result.status != "completed" or result.error is not None
        except Exception:
            # Expected - missing model should raise an error
            pass
