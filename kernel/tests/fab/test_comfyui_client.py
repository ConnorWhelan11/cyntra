"""
Tests for ComfyUI HTTP client.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from cyntra.fab.comfyui_client import (
    ComfyUIClient,
    ComfyUIConfig,
    ComfyUIConnectionError,
    ComfyUIExecutionError,
    ComfyUIResult,
    ComfyUITimeoutError,
)


class TestComfyUIConfig:
    """Tests for ComfyUIConfig dataclass."""

    def test_default_values(self) -> None:
        config = ComfyUIConfig()
        assert config.host == "localhost"
        assert config.port == 8188
        assert config.timeout_seconds == 300.0
        assert config.poll_interval_seconds == 1.0

    def test_custom_values(self) -> None:
        config = ComfyUIConfig(
            host="192.168.1.100",
            port=9000,
            timeout_seconds=600.0,
        )
        assert config.host == "192.168.1.100"
        assert config.port == 9000
        assert config.timeout_seconds == 600.0

    def test_base_url(self) -> None:
        config = ComfyUIConfig(host="example.com", port=8080)
        assert config.base_url == "http://example.com:8080"


class TestComfyUIResult:
    """Tests for ComfyUIResult dataclass."""

    def test_default_values(self) -> None:
        result = ComfyUIResult(prompt_id="test-123", status="completed")
        assert result.prompt_id == "test-123"
        assert result.status == "completed"
        assert result.outputs == {}
        assert result.execution_time_ms == 0
        assert result.error is None

    def test_with_outputs(self) -> None:
        result = ComfyUIResult(
            prompt_id="test-123",
            status="completed",
            outputs={"9": [Path("output.png")]},
            execution_time_ms=5000,
        )
        assert len(result.outputs) == 1
        assert result.execution_time_ms == 5000

    def test_with_error(self) -> None:
        result = ComfyUIResult(
            prompt_id="test-123",
            status="failed",
            error="Node 5 failed",
            node_errors={"5": "Out of memory"},
        )
        assert result.status == "failed"
        assert result.error == "Node 5 failed"
        assert "5" in result.node_errors


class TestComfyUIClientInit:
    """Tests for ComfyUIClient initialization."""

    def test_default_config(self) -> None:
        client = ComfyUIClient()
        assert client.config.host == "localhost"
        assert client.config.port == 8188

    def test_custom_config(self) -> None:
        config = ComfyUIConfig(host="remote.example.com", port=9000)
        client = ComfyUIClient(config)
        assert client.config.host == "remote.example.com"
        assert client.config.port == 9000


class TestComfyUIClientHealthCheck:
    """Tests for health_check method."""

    @pytest.mark.asyncio
    async def test_health_check_success(self) -> None:
        client = ComfyUIClient()

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            result = await client.health_check()
            assert result is True
            mock_http.get.assert_called_once_with("/system_stats", timeout=5.0)

    @pytest.mark.asyncio
    async def test_health_check_failure_status(self) -> None:
        client = ComfyUIClient()

        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            result = await client.health_check()
            assert result is False

    @pytest.mark.asyncio
    async def test_health_check_connection_error(self) -> None:
        client = ComfyUIClient()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            mock_ensure.return_value = mock_http

            result = await client.health_check()
            assert result is False


class TestComfyUIClientQueuePrompt:
    """Tests for queue_prompt method."""

    @pytest.mark.asyncio
    async def test_queue_prompt_success(self) -> None:
        client = ComfyUIClient()
        workflow = {"3": {"class_type": "KSampler", "inputs": {}}}

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"prompt_id": "abc-123"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            prompt_id = await client.queue_prompt(workflow, client_id="test-client")

            assert prompt_id == "abc-123"
            mock_http.post.assert_called_once()
            call_args = mock_http.post.call_args
            assert call_args[0][0] == "/prompt"
            payload = call_args[1]["json"]
            assert payload["prompt"] == workflow
            assert payload["client_id"] == "test-client"

    @pytest.mark.asyncio
    async def test_queue_prompt_auto_client_id(self) -> None:
        client = ComfyUIClient()
        workflow = {}

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"prompt_id": "xyz-789"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            prompt_id = await client.queue_prompt(workflow)

            assert prompt_id == "xyz-789"
            # Verify a client_id was generated
            call_args = mock_http.post.call_args
            payload = call_args[1]["json"]
            assert "client_id" in payload
            assert len(payload["client_id"]) > 0

    @pytest.mark.asyncio
    async def test_queue_prompt_invalid_workflow(self) -> None:
        client = ComfyUIClient()
        workflow = {"bad": "workflow"}

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "error": {"message": "Invalid node type"},
            "node_errors": {"bad": "Unknown node"},
        }

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            with pytest.raises(ComfyUIExecutionError) as exc_info:
                await client.queue_prompt(workflow)

            assert "Invalid workflow" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_queue_prompt_connection_error(self) -> None:
        client = ComfyUIClient()
        workflow = {}

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(side_effect=httpx.ConnectError("Failed"))
            mock_ensure.return_value = mock_http

            with pytest.raises(ComfyUIConnectionError):
                await client.queue_prompt(workflow)


class TestComfyUIClientGetHistory:
    """Tests for get_history method."""

    @pytest.mark.asyncio
    async def test_get_history_found(self) -> None:
        client = ComfyUIClient()
        prompt_id = "test-prompt"

        history_data = {
            prompt_id: {
                "status": {"status_str": "success"},
                "outputs": {"9": {"images": [{"filename": "out.png"}]}},
            }
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = history_data
        mock_response.raise_for_status = MagicMock()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            result = await client.get_history(prompt_id)

            assert result is not None
            assert result["status"]["status_str"] == "success"

    @pytest.mark.asyncio
    async def test_get_history_not_found(self) -> None:
        client = ComfyUIClient()

        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            result = await client.get_history("nonexistent")
            assert result is None


class TestComfyUIClientWaitForCompletion:
    """Tests for wait_for_completion method."""

    @pytest.mark.asyncio
    async def test_wait_for_completion_immediate_success(self) -> None:
        client = ComfyUIClient(ComfyUIConfig(poll_interval_seconds=0.01))
        prompt_id = "test-prompt"

        history_data = {
            "status": {
                "status_str": "success",
                "messages": [["execution_start", {"execution_time": 1.5}]],
            },
            "outputs": {"9": {"images": [{"filename": "out.png", "subfolder": ""}]}},
        }

        with patch.object(client, "get_history", new_callable=AsyncMock) as mock_history:
            mock_history.return_value = history_data

            result = await client.wait_for_completion(prompt_id, timeout=5.0)

            assert result.status == "completed"
            assert result.prompt_id == prompt_id
            assert "9" in result.outputs

    @pytest.mark.asyncio
    async def test_wait_for_completion_with_error(self) -> None:
        client = ComfyUIClient(ComfyUIConfig(poll_interval_seconds=0.01))
        prompt_id = "test-prompt"

        history_data = {
            "status": {
                "status_str": "error",
                "messages": [
                    [
                        "execution_error",
                        {"exception_message": "Out of memory", "node_id": "5"},
                    ]
                ],
            },
            "outputs": {},
        }

        with patch.object(client, "get_history", new_callable=AsyncMock) as mock_history:
            mock_history.return_value = history_data

            result = await client.wait_for_completion(prompt_id, timeout=5.0)

            assert result.status == "failed"
            assert "Out of memory" in (result.error or "")
            assert "5" in result.node_errors

    @pytest.mark.asyncio
    async def test_wait_for_completion_timeout(self) -> None:
        client = ComfyUIClient(ComfyUIConfig(poll_interval_seconds=0.01))
        prompt_id = "test-prompt"

        # Simulate pending state that never completes
        with patch.object(client, "get_history", new_callable=AsyncMock) as mock_history:
            mock_history.return_value = None

            with patch.object(client, "get_queue_status", new_callable=AsyncMock) as mock_queue:
                mock_queue.return_value = {"queue_running": [[0, prompt_id]], "queue_pending": []}

                with pytest.raises(ComfyUITimeoutError):
                    await client.wait_for_completion(prompt_id, timeout=0.05)


class TestComfyUIClientDownloadOutputs:
    """Tests for download_outputs method."""

    @pytest.mark.asyncio
    async def test_download_outputs_success(self, tmp_path: Path) -> None:
        client = ComfyUIClient()

        result = ComfyUIResult(
            prompt_id="test",
            status="completed",
            outputs={"9": [Path("test_image.png")]},
        )

        mock_response = MagicMock()
        mock_response.content = b"fake image data"
        mock_response.raise_for_status = MagicMock()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            downloaded = await client.download_outputs(result, tmp_path)

            assert "9" in downloaded
            assert len(downloaded["9"]) == 1
            assert downloaded["9"][0].exists()
            assert downloaded["9"][0].read_bytes() == b"fake image data"

    @pytest.mark.asyncio
    async def test_download_outputs_with_subfolder(self, tmp_path: Path) -> None:
        client = ComfyUIClient()

        result = ComfyUIResult(
            prompt_id="test",
            status="completed",
            outputs={"9": [Path("subfolder/test_image.png")]},
        )

        mock_response = MagicMock()
        mock_response.content = b"image data"
        mock_response.raise_for_status = MagicMock()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.get = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            await client.download_outputs(result, tmp_path)

            # Verify subfolder was passed in params
            call_args = mock_http.get.call_args
            assert call_args[1]["params"]["subfolder"] == "subfolder"


class TestComfyUIClientInjectSeed:
    """Tests for inject_seed static method."""

    def test_inject_seed_ksampler(self) -> None:
        workflow = {
            "3": {
                "class_type": "KSampler",
                "inputs": {"seed": 0, "steps": 20},
            }
        }

        modified = ComfyUIClient.inject_seed(workflow, seed=42)

        assert modified["3"]["inputs"]["seed"] == 42
        assert modified["3"]["inputs"]["control_after_generate"] == "fixed"
        # Original unchanged
        assert workflow["3"]["inputs"]["seed"] == 0

    def test_inject_seed_multiple_samplers(self) -> None:
        workflow = {
            "3": {"class_type": "KSampler", "inputs": {"seed": 0}},
            "5": {"class_type": "KSamplerAdvanced", "inputs": {"noise_seed": 0}},
            "7": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}},
        }

        modified = ComfyUIClient.inject_seed(workflow, seed=123)

        assert modified["3"]["inputs"]["seed"] == 123
        assert modified["5"]["inputs"]["noise_seed"] == 123
        # Non-sampler unchanged
        assert "seed" not in modified["7"]["inputs"]

    def test_inject_seed_preserves_other_inputs(self) -> None:
        workflow = {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 0,
                    "steps": 30,
                    "cfg": 7.5,
                    "sampler_name": "euler",
                },
            }
        }

        modified = ComfyUIClient.inject_seed(workflow, seed=999)

        assert modified["3"]["inputs"]["seed"] == 999
        assert modified["3"]["inputs"]["steps"] == 30
        assert modified["3"]["inputs"]["cfg"] == 7.5
        assert modified["3"]["inputs"]["sampler_name"] == "euler"


class TestComfyUIClientInjectParams:
    """Tests for inject_params static method."""

    def test_inject_positive_prompt(self) -> None:
        workflow = {
            "6": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Positive Prompt"},
                "inputs": {"text": "old prompt"},
            }
        }

        modified = ComfyUIClient.inject_params(workflow, {"positive_prompt": "a beautiful sunset"})

        assert modified["6"]["inputs"]["text"] == "a beautiful sunset"

    def test_inject_negative_prompt(self) -> None:
        workflow = {
            "7": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Negative Prompt"},
                "inputs": {"text": ""},
            }
        }

        modified = ComfyUIClient.inject_params(workflow, {"negative_prompt": "blurry, low quality"})

        assert modified["7"]["inputs"]["text"] == "blurry, low quality"

    def test_inject_sampler_params(self) -> None:
        workflow = {
            "3": {
                "class_type": "KSampler",
                "inputs": {"steps": 20, "cfg": 7.0, "denoise": 1.0},
            }
        }

        modified = ComfyUIClient.inject_params(workflow, {"steps": 50, "cfg": 8.5, "denoise": 0.75})

        assert modified["3"]["inputs"]["steps"] == 50
        assert modified["3"]["inputs"]["cfg"] == 8.5
        assert modified["3"]["inputs"]["denoise"] == 0.75

    def test_inject_dimensions(self) -> None:
        workflow = {
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 512, "height": 512, "batch_size": 1},
            }
        }

        modified = ComfyUIClient.inject_params(workflow, {"width": 1024, "height": 768})

        assert modified["5"]["inputs"]["width"] == 1024
        assert modified["5"]["inputs"]["height"] == 768
        assert modified["5"]["inputs"]["batch_size"] == 1  # Unchanged

    def test_inject_checkpoint(self) -> None:
        workflow = {
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "sd_xl_base.safetensors"},
            }
        }

        modified = ComfyUIClient.inject_params(workflow, {"checkpoint": "custom_model.safetensors"})

        assert modified["4"]["inputs"]["ckpt_name"] == "custom_model.safetensors"

    def test_inject_params_by_node_id(self) -> None:
        """Test that positive/negative detection works via node ID."""
        workflow = {
            "positive_prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": ""},
            },
            "negative_prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": ""},
            },
        }

        modified = ComfyUIClient.inject_params(
            workflow,
            {
                "positive_prompt": "good stuff",
                "negative_prompt": "bad stuff",
            },
        )

        assert modified["positive_prompt"]["inputs"]["text"] == "good stuff"
        assert modified["negative_prompt"]["inputs"]["text"] == "bad stuff"


class TestComfyUIClientLoadWorkflow:
    """Tests for load_workflow static method."""

    def test_load_workflow_success(self, tmp_path: Path) -> None:
        workflow_data = {"3": {"class_type": "KSampler", "inputs": {}}}
        workflow_path = tmp_path / "test_workflow.json"
        workflow_path.write_text(json.dumps(workflow_data))

        loaded = ComfyUIClient.load_workflow(workflow_path)

        assert loaded == workflow_data

    def test_load_workflow_not_found(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            ComfyUIClient.load_workflow(tmp_path / "nonexistent.json")

    def test_load_workflow_invalid_json(self, tmp_path: Path) -> None:
        workflow_path = tmp_path / "invalid.json"
        workflow_path.write_text("not valid json {{{")

        with pytest.raises(json.JSONDecodeError):
            ComfyUIClient.load_workflow(workflow_path)


class TestComfyUIClientContextManager:
    """Tests for async context manager."""

    @pytest.mark.asyncio
    async def test_context_manager(self) -> None:
        async with ComfyUIClient() as client:
            assert client._client is not None

        # Client should be closed after exiting
        assert client._client is None or client._client.is_closed


class TestComfyUIClientInterrupt:
    """Tests for interrupt method."""

    @pytest.mark.asyncio
    async def test_interrupt_success(self) -> None:
        client = ComfyUIClient()

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_ensure.return_value = mock_http

            result = await client.interrupt()
            assert result is True

    @pytest.mark.asyncio
    async def test_interrupt_failure(self) -> None:
        client = ComfyUIClient()

        with patch.object(client, "_ensure_client") as mock_ensure:
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(side_effect=httpx.ConnectError("Failed"))
            mock_ensure.return_value = mock_http

            result = await client.interrupt()
            assert result is False
