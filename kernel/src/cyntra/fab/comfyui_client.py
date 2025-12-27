"""
ComfyUI HTTP Client - Async client for ComfyUI's REST API.

Provides workflow execution, status polling, and output retrieval
for integration with the fab pipeline.
"""

from __future__ import annotations

import asyncio
import copy
import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


@dataclass
class ComfyUIConfig:
    """Configuration for ComfyUI client."""

    host: str = "localhost"
    port: int = 8188
    timeout_seconds: float = 300.0
    poll_interval_seconds: float = 1.0
    max_retries: int = 3
    retry_delay_seconds: float = 1.0

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


@dataclass
class ComfyUIResult:
    """Result from a ComfyUI workflow execution."""

    prompt_id: str
    status: str  # "pending", "running", "completed", "failed", "cancelled"
    outputs: dict[str, list[Path]] = field(default_factory=dict)
    execution_time_ms: int = 0
    error: str | None = None
    node_errors: dict[str, str] = field(default_factory=dict)


class ComfyUIError(Exception):
    """Base exception for ComfyUI client errors."""

    pass


class ComfyUIConnectionError(ComfyUIError):
    """Failed to connect to ComfyUI server."""

    pass


class ComfyUIExecutionError(ComfyUIError):
    """Workflow execution failed."""

    pass


class ComfyUITimeoutError(ComfyUIError):
    """Workflow execution timed out."""

    pass


class ComfyUIClient:
    """
    Async HTTP client for ComfyUI API.

    Supports:
    - Health checks
    - Workflow submission (queue_prompt)
    - Status polling (get_history)
    - Output download
    - Deterministic seed injection

    Example:
        config = ComfyUIConfig(host="localhost", port=8188)
        client = ComfyUIClient(config)

        if await client.health_check():
            workflow = json.load(open("workflow.json"))
            workflow = ComfyUIClient.inject_seed(workflow, seed=42)
            prompt_id = await client.queue_prompt(workflow)
            result = await client.wait_for_completion(prompt_id)
            if result.status == "completed":
                await client.download_outputs(result, output_dir)
    """

    # Node types that have seed inputs
    SEED_NODE_TYPES = frozenset(
        {
            "KSampler",
            "KSamplerAdvanced",
            "SamplerCustom",
            "SamplerCustomAdvanced",
            "RandomNoise",
        }
    )

    def __init__(self, config: ComfyUIConfig | None = None) -> None:
        self.config = config or ComfyUIConfig()
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> ComfyUIClient:
        await self._ensure_client()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=httpx.Timeout(self.config.timeout_seconds),
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def health_check(self) -> bool:
        """
        Check if ComfyUI server is running and responsive.

        Returns:
            True if server is healthy, False otherwise
        """
        try:
            client = await self._ensure_client()
            response = await client.get("/system_stats", timeout=5.0)
            return response.status_code == 200
        except (httpx.RequestError, httpx.TimeoutException) as e:
            logger.debug("ComfyUI health check failed", error=str(e))
            return False

    async def get_system_stats(self) -> dict[str, Any]:
        """
        Get system statistics from ComfyUI.

        Returns:
            System stats including GPU info, memory usage, etc.

        Raises:
            ComfyUIConnectionError: If server is not reachable
        """
        try:
            client = await self._ensure_client()
            response = await client.get("/system_stats")
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            raise ComfyUIConnectionError(f"Failed to connect: {e}") from e

    async def queue_prompt(
        self,
        workflow: dict[str, Any],
        client_id: str | None = None,
    ) -> str:
        """
        Queue a workflow for execution.

        Args:
            workflow: ComfyUI workflow in API format (node_id -> node_config)
            client_id: Optional client ID for tracking (auto-generated if not provided)

        Returns:
            prompt_id: Unique identifier for tracking execution

        Raises:
            ComfyUIConnectionError: If server is not reachable
            ComfyUIExecutionError: If workflow is invalid
        """
        if client_id is None:
            client_id = str(uuid.uuid4())

        payload = {
            "prompt": workflow,
            "client_id": client_id,
        }

        try:
            client = await self._ensure_client()
            response = await client.post("/prompt", json=payload)

            if response.status_code == 400:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", "Invalid workflow")
                node_errors = error_data.get("node_errors", {})
                raise ComfyUIExecutionError(
                    f"Invalid workflow: {error_msg}. Node errors: {node_errors}"
                )

            response.raise_for_status()
            result = response.json()
            prompt_id = result.get("prompt_id")

            if not prompt_id:
                raise ComfyUIExecutionError("No prompt_id in response")

            logger.debug(
                "Queued ComfyUI prompt",
                prompt_id=prompt_id,
                client_id=client_id,
            )
            return prompt_id

        except httpx.RequestError as e:
            raise ComfyUIConnectionError(f"Failed to queue prompt: {e}") from e

    async def get_history(self, prompt_id: str) -> dict[str, Any] | None:
        """
        Get execution history for a prompt.

        Args:
            prompt_id: The prompt ID to look up

        Returns:
            History entry if found, None if not yet available
        """
        try:
            client = await self._ensure_client()
            response = await client.get(f"/history/{prompt_id}")

            if response.status_code == 404:
                return None

            response.raise_for_status()
            history = response.json()

            # History is keyed by prompt_id
            return history.get(prompt_id)

        except httpx.RequestError as e:
            logger.warning("Failed to get history", prompt_id=prompt_id, error=str(e))
            return None

    async def get_queue_status(self) -> dict[str, Any]:
        """
        Get current queue status.

        Returns:
            Queue info with running and pending counts
        """
        try:
            client = await self._ensure_client()
            response = await client.get("/queue")
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            raise ComfyUIConnectionError(f"Failed to get queue: {e}") from e

    async def wait_for_completion(
        self,
        prompt_id: str,
        timeout: float | None = None,
    ) -> ComfyUIResult:
        """
        Wait for a prompt to complete execution.

        Args:
            prompt_id: The prompt ID to wait for
            timeout: Maximum wait time in seconds (uses config default if None)

        Returns:
            ComfyUIResult with status and outputs

        Raises:
            ComfyUITimeoutError: If execution exceeds timeout
        """
        timeout = timeout if timeout is not None else self.config.timeout_seconds
        start_time = asyncio.get_event_loop().time()

        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout:
                raise ComfyUITimeoutError(
                    f"Execution timed out after {timeout}s for prompt {prompt_id}"
                )

            history = await self.get_history(prompt_id)

            if history is not None:
                # Check for completion
                status = history.get("status", {})
                status_str = status.get("status_str", "unknown")

                if status_str == "success":
                    outputs = self._parse_outputs(history.get("outputs", {}))
                    exec_info = status.get("messages", [[]])[0]
                    exec_time = 0
                    if len(exec_info) > 1 and isinstance(exec_info[1], dict):
                        exec_time = int(exec_info[1].get("execution_time", 0) * 1000)

                    return ComfyUIResult(
                        prompt_id=prompt_id,
                        status="completed",
                        outputs=outputs,
                        execution_time_ms=exec_time,
                    )

                elif status_str == "error":
                    # Extract error details
                    error_msg = "Execution failed"
                    node_errors: dict[str, str] = {}

                    messages = status.get("messages", [])
                    for msg in messages:
                        if isinstance(msg, list) and len(msg) >= 2 and msg[0] == "execution_error":
                            error_data = msg[1]
                            if isinstance(error_data, dict):
                                error_msg = error_data.get("exception_message", error_msg)
                                node_id = error_data.get("node_id")
                                if node_id:
                                    node_errors[str(node_id)] = error_msg

                    return ComfyUIResult(
                        prompt_id=prompt_id,
                        status="failed",
                        error=error_msg,
                        node_errors=node_errors,
                        execution_time_ms=int(elapsed * 1000),
                    )

            # Check queue for running status
            try:
                queue = await self.get_queue_status()
                running = queue.get("queue_running", [])
                pending = queue.get("queue_pending", [])

                is_running = any(item[1] == prompt_id for item in running if isinstance(item, list))
                is_pending = any(item[1] == prompt_id for item in pending if isinstance(item, list))

                if not is_running and not is_pending and history is None:
                    # Not in queue and no history - might have been cancelled
                    await asyncio.sleep(self.config.poll_interval_seconds)
                    # Check one more time
                    history = await self.get_history(prompt_id)
                    if history is None:
                        return ComfyUIResult(
                            prompt_id=prompt_id,
                            status="cancelled",
                            error="Prompt not found in queue or history",
                            execution_time_ms=int(elapsed * 1000),
                        )
            except ComfyUIConnectionError:
                pass  # Continue waiting

            await asyncio.sleep(self.config.poll_interval_seconds)

    def _parse_outputs(self, outputs: dict[str, Any]) -> dict[str, list[Path]]:
        """Parse output node results into file paths."""
        result: dict[str, list[Path]] = {}

        for node_id, node_outputs in outputs.items():
            if not isinstance(node_outputs, dict):
                continue

            files: list[Path] = []

            # Handle image outputs
            images = node_outputs.get("images", [])
            for img in images:
                if isinstance(img, dict):
                    filename = img.get("filename")
                    subfolder = img.get("subfolder", "")
                    if filename:
                        # Store relative path info for download
                        files.append(Path(subfolder) / filename if subfolder else Path(filename))

            # Handle other file outputs (gifs, videos, 3d meshes, etc.)
            for key in ("gifs", "videos", "files", "3d"):
                items = node_outputs.get(key, [])
                for item in items:
                    if isinstance(item, dict):
                        filename = item.get("filename")
                        subfolder = item.get("subfolder", "")
                        if filename:
                            files.append(
                                Path(subfolder) / filename if subfolder else Path(filename)
                            )

            if files:
                result[node_id] = files

        return result

    async def download_outputs(
        self,
        result: ComfyUIResult,
        output_dir: Path,
    ) -> dict[str, list[Path]]:
        """
        Download output files from ComfyUI server.

        Args:
            result: ComfyUIResult with output file info
            output_dir: Directory to save files to

        Returns:
            Dict mapping node_id to list of downloaded file paths
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        downloaded: dict[str, list[Path]] = {}

        client = await self._ensure_client()

        for node_id, files in result.outputs.items():
            node_files: list[Path] = []

            for file_path in files:
                filename = file_path.name
                subfolder = str(file_path.parent) if file_path.parent != Path(".") else ""

                # Build download URL
                params = {"filename": filename}
                if subfolder:
                    params["subfolder"] = subfolder
                params["type"] = "output"

                try:
                    response = await client.get("/view", params=params)
                    response.raise_for_status()

                    # Save to output directory
                    dest_path = output_dir / f"{node_id}_{filename}"
                    dest_path.write_bytes(response.content)
                    node_files.append(dest_path)

                    logger.debug(
                        "Downloaded ComfyUI output",
                        node_id=node_id,
                        filename=filename,
                        dest=str(dest_path),
                    )

                except httpx.RequestError as e:
                    logger.warning(
                        "Failed to download output",
                        node_id=node_id,
                        filename=filename,
                        error=str(e),
                    )

            if node_files:
                downloaded[node_id] = node_files

        return downloaded

    async def interrupt(self) -> bool:
        """
        Interrupt the currently running prompt.

        Returns:
            True if interrupt was sent successfully
        """
        try:
            client = await self._ensure_client()
            response = await client.post("/interrupt")
            return response.status_code == 200
        except httpx.RequestError:
            return False

    async def clear_queue(self) -> bool:
        """
        Clear all pending prompts from the queue.

        Returns:
            True if queue was cleared successfully
        """
        try:
            client = await self._ensure_client()
            response = await client.post("/queue", json={"clear": True})
            return response.status_code == 200
        except httpx.RequestError:
            return False

    async def upload_image(
        self,
        image_path: Path,
        subfolder: str = "",
        overwrite: bool = True,
    ) -> str | None:
        """
        Upload an image to ComfyUI's input folder.

        Args:
            image_path: Local path to the image file
            subfolder: Optional subfolder in ComfyUI's input directory
            overwrite: Whether to overwrite existing files

        Returns:
            The filename to use in workflows, or None if upload failed
        """
        try:
            client = await self._ensure_client()

            # Read image file
            image_data = image_path.read_bytes()

            # Prepare multipart form data
            files = {
                "image": (image_path.name, image_data, "image/png"),
            }
            data = {
                "overwrite": "true" if overwrite else "false",
            }
            if subfolder:
                data["subfolder"] = subfolder

            response = await client.post(
                "/upload/image",
                files=files,
                data=data,
            )
            response.raise_for_status()

            result = response.json()
            filename = result.get("name")

            if filename:
                logger.debug(
                    "Uploaded image to ComfyUI",
                    local_path=str(image_path),
                    comfyui_name=filename,
                )
                return filename

            return None

        except httpx.RequestError as e:
            logger.error("Failed to upload image", path=str(image_path), error=str(e))
            return None
        except Exception as e:
            logger.error("Image upload error", path=str(image_path), error=str(e))
            return None

    @staticmethod
    def inject_seed(workflow: dict[str, Any], seed: int) -> dict[str, Any]:
        """
        Inject deterministic seed into all sampler nodes.

        Modifies seed and sets control_after_generate to "fixed" to ensure
        reproducible outputs.

        Args:
            workflow: ComfyUI workflow in API format
            seed: Seed value to inject

        Returns:
            Modified workflow (deep copy, original unchanged)
        """
        modified = copy.deepcopy(workflow)

        for node_id, node in modified.items():
            if not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")
            if class_type not in ComfyUIClient.SEED_NODE_TYPES:
                continue

            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                continue

            # Inject seed
            if "seed" in inputs or "noise_seed" in inputs:
                seed_key = "noise_seed" if "noise_seed" in inputs else "seed"
                inputs[seed_key] = seed
                # Lock seed to prevent auto-increment
                if "control_after_generate" in inputs or class_type == "KSampler":
                    inputs["control_after_generate"] = "fixed"

                logger.debug(
                    "Injected seed into node",
                    node_id=node_id,
                    class_type=class_type,
                    seed=seed,
                )

        return modified

    @staticmethod
    def inject_params(
        workflow: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Inject parameters into workflow nodes by convention.

        Supports:
        - positive_prompt: Injected into CLIPTextEncode nodes with "positive" in title/id
        - negative_prompt: Injected into CLIPTextEncode nodes with "negative" in title/id
        - steps: Injected into KSampler nodes
        - cfg: Injected into KSampler nodes
        - width/height: Injected into EmptyLatentImage nodes
        - denoise: Injected into KSampler nodes

        Args:
            workflow: ComfyUI workflow in API format
            params: Parameters to inject

        Returns:
            Modified workflow (deep copy, original unchanged)
        """
        modified = copy.deepcopy(workflow)

        for node_id, node in modified.items():
            if not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")
            inputs = node.get("inputs")
            if not isinstance(inputs, dict):
                continue

            # Get node title from _meta if available
            meta = node.get("_meta", {})
            title = meta.get("title", "").lower() if isinstance(meta, dict) else ""
            node_id_lower = str(node_id).lower()

            # CLIPTextEncode - prompt injection
            if class_type == "CLIPTextEncode":
                if (
                    "positive" in title or "positive" in node_id_lower
                ) and "positive_prompt" in params:
                    inputs["text"] = params["positive_prompt"]
                elif (
                    "negative" in title or "negative" in node_id_lower
                ) and "negative_prompt" in params:
                    inputs["text"] = params["negative_prompt"]

            # KSampler nodes
            if class_type in ("KSampler", "KSamplerAdvanced"):
                if "steps" in params:
                    inputs["steps"] = params["steps"]
                if "cfg" in params:
                    inputs["cfg"] = params["cfg"]
                if "denoise" in params:
                    inputs["denoise"] = params["denoise"]
                if "sampler_name" in params:
                    inputs["sampler_name"] = params["sampler_name"]
                if "scheduler" in params:
                    inputs["scheduler"] = params["scheduler"]

            # EmptyLatentImage - dimensions
            if class_type == "EmptyLatentImage":
                if "width" in params:
                    inputs["width"] = params["width"]
                if "height" in params:
                    inputs["height"] = params["height"]
                if "batch_size" in params:
                    inputs["batch_size"] = params["batch_size"]

            # CheckpointLoaderSimple - model selection
            if class_type == "CheckpointLoaderSimple" and "checkpoint" in params:
                inputs["ckpt_name"] = params["checkpoint"]

        return modified

    async def get_node_info(self, node_type: str) -> dict[str, Any] | None:
        """
        Get information about a specific node type.

        Args:
            node_type: The node class type (e.g., "CheckpointLoaderSimple")

        Returns:
            Node info dict with inputs/outputs, or None if not found
        """
        try:
            client = await self._ensure_client()
            response = await client.get(f"/object_info/{node_type}")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()
            return data.get(node_type)
        except httpx.RequestError as e:
            logger.warning("Failed to get node info", node_type=node_type, error=str(e))
            return None

    async def list_checkpoints(self) -> list[str]:
        """
        List available checkpoint models on the ComfyUI server.

        Returns:
            List of checkpoint filenames (e.g., ["sd_xl_base_1.0.safetensors", ...])
        """
        info = await self.get_node_info("CheckpointLoaderSimple")
        if info is None:
            return []

        # Navigate the nested structure: input.required.ckpt_name[0]
        try:
            ckpt_list = info.get("input", {}).get("required", {}).get("ckpt_name", [[]])[0]
            if isinstance(ckpt_list, list):
                return ckpt_list
            return []
        except (IndexError, TypeError):
            return []

    async def list_hunyuan3d_models(self) -> list[str]:
        """
        List available Hunyuan3D models (via ImageOnlyCheckpointLoader).

        Returns:
            List of model filenames (e.g., ["hunyuan_3d_v2.1.safetensors", ...])
        """
        info = await self.get_node_info("ImageOnlyCheckpointLoader")
        if info is None:
            return []

        try:
            ckpt_list = info.get("input", {}).get("required", {}).get("ckpt_name", [[]])[0]
            if isinstance(ckpt_list, list):
                # Filter for Hunyuan3D models
                return [m for m in ckpt_list if "hunyuan" in m.lower() or "hy3d" in m.lower()]
            return []
        except (IndexError, TypeError):
            return []

    async def find_sdxl_checkpoint(self) -> str | None:
        """
        Find an available SDXL checkpoint for image generation.

        Searches for common SDXL checkpoint names.

        Returns:
            Checkpoint name if found, None otherwise
        """
        checkpoints = await self.list_checkpoints()
        if not checkpoints:
            return None

        # Priority order for SDXL models
        sdxl_patterns = [
            "sd_xl_base_1.0",
            "sdxl_base",
            "sdxl",
            "sd_xl",
        ]

        for pattern in sdxl_patterns:
            for ckpt in checkpoints:
                if pattern in ckpt.lower():
                    logger.info("Found SDXL checkpoint", checkpoint=ckpt)
                    return ckpt

        return None

    async def validate_models_for_text_mode(self) -> tuple[bool, str | None, str | None]:
        """
        Validate that required models are available for text-to-3D mode.

        Returns:
            Tuple of (is_valid, sdxl_checkpoint, hunyuan3d_model)
            - is_valid: True if all required models are available
            - sdxl_checkpoint: Name of SDXL model to use, or None
            - hunyuan3d_model: Name of Hunyuan3D model to use, or None
        """
        sdxl = await self.find_sdxl_checkpoint()
        hunyuan_models = await self.list_hunyuan3d_models()

        hunyuan = hunyuan_models[0] if hunyuan_models else None

        if sdxl and hunyuan:
            return (True, sdxl, hunyuan)
        elif not sdxl:
            logger.warning("SDXL checkpoint not found - text mode unavailable")
            return (False, None, hunyuan)
        else:
            logger.warning("Hunyuan3D model not found")
            return (False, sdxl, None)

    @staticmethod
    def load_workflow(path: Path | str) -> dict[str, Any]:
        """
        Load a workflow JSON file.

        Args:
            path: Path to workflow JSON file

        Returns:
            Workflow dict in API format

        Raises:
            FileNotFoundError: If file doesn't exist
            json.JSONDecodeError: If file is not valid JSON
        """
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Workflow not found: {path}")

        content = path.read_text()
        return json.loads(content)
