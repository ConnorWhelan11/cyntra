"""
NitroGen RunPod Manager - Auto-scaling H100 pods for NitroGen inference.

Manages the lifecycle of NitroGen inference servers on RunPod:
- Spin up H100 pods on demand
- Create SSH tunnels for secure access
- Auto-shutdown after idle timeout
- Health monitoring and recovery

Usage:
    from cyntra.fab.nitrogen_runpod import NitroGenRunPodManager

    manager = NitroGenRunPodManager()

    # Get or create a running NitroGen pod
    endpoint = await manager.ensure_nitrogen_server()
    # endpoint = {"host": "localhost", "port": 5555}

    # When done, release (will auto-shutdown after idle timeout)
    await manager.release()
"""

from __future__ import annotations

import asyncio
import contextlib
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import structlog

from cyntra.fab.runpod_manager import (
    PodStatus,
    RunPodAPIError,
    RunPodConfig,
    RunPodError,
    RunPodManager,
    TunnelInfo,
)

logger = structlog.get_logger(__name__)


# NitroGen server setup script
NITROGEN_SETUP_SCRIPT = """#!/bin/bash
set -e

echo "Setting up NitroGen environment..."

# Install dependencies
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install pyzmq pillow numpy

# Clone NitroGen if not exists
if [ ! -d "/workspace/nitrogen" ]; then
    echo "Cloning NitroGen..."
    cd /workspace
    git clone https://github.com/nvidia/nitrogen.git || echo "Clone failed, may already exist"
fi

# Download weights if not exists
if [ ! -f "/workspace/nitrogen/weights/ng.pt" ]; then
    echo "Downloading NitroGen weights..."
    mkdir -p /workspace/nitrogen/weights
    # Note: Replace with actual weight download URL/method
    echo "Weights need to be uploaded manually or downloaded from authorized source"
fi

echo "Setup complete!"
"""

# NitroGen server start script
NITROGEN_START_SCRIPT = """#!/bin/bash
cd /workspace/nitrogen
python scripts/serve_headless.py weights/ng.pt --port 5555 &
echo $! > /tmp/nitrogen.pid
echo "NitroGen server started on port 5555"
"""


@dataclass
class NitroGenPodConfig:
    """Configuration for NitroGen pods."""

    # Pod settings
    gpu_type: str = "NVIDIA H100 80GB HBM3"  # H100 for best performance
    fallback_gpu_types: list[str] = field(
        default_factory=lambda: [
            "NVIDIA H100 PCIe",
            "NVIDIA A100 80GB PCIe",
            "NVIDIA A100-SXM4-80GB",
            "NVIDIA RTX A6000",
        ]
    )
    volume_gb: int = 100
    container_disk_gb: int = 50

    # Lifecycle
    idle_timeout_minutes: int = 15  # Shutdown after 15 mins idle
    max_pod_lifetime_hours: int = 8  # Force shutdown after 8 hours
    startup_timeout_seconds: int = 600  # 10 min to start

    # Network
    nitrogen_port: int = 5555
    local_tunnel_port: int = 5555

    # Naming
    pod_name_prefix: str = "nitrogen-server"


@dataclass
class NitroGenEndpoint:
    """Active NitroGen server endpoint."""

    host: str
    port: int
    pod_id: str
    tunnel_info: TunnelInfo | None = None
    created_at: datetime = field(default_factory=datetime.now)
    last_used_at: datetime = field(default_factory=datetime.now)

    def mark_used(self) -> None:
        """Mark endpoint as recently used."""
        self.last_used_at = datetime.now()

    @property
    def idle_seconds(self) -> float:
        """Seconds since last use."""
        return (datetime.now() - self.last_used_at).total_seconds()

    @property
    def age_seconds(self) -> float:
        """Seconds since creation."""
        return (datetime.now() - self.created_at).total_seconds()


class NitroGenRunPodManager:
    """
    Manages NitroGen inference servers on RunPod.

    Provides automatic pod lifecycle management:
    - Creates H100 pods on demand when nitrogen server is needed
    - Establishes SSH tunnels for secure local access
    - Monitors idle time and shuts down unused pods
    - Handles pod recovery on failure
    """

    def __init__(
        self,
        runpod_config: RunPodConfig | None = None,
        nitrogen_config: NitroGenPodConfig | None = None,
    ):
        self.runpod_config = runpod_config or RunPodConfig.from_env()
        self.nitrogen_config = nitrogen_config or NitroGenPodConfig()

        self._manager: RunPodManager | None = None
        self._active_endpoint: NitroGenEndpoint | None = None
        self._shutdown_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    async def __aenter__(self) -> NitroGenRunPodManager:
        await self._ensure_manager()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def _ensure_manager(self) -> RunPodManager:
        """Ensure RunPod manager is initialized."""
        if self._manager is None:
            self._manager = RunPodManager(self.runpod_config)
            await self._manager.__aenter__()
        return self._manager

    async def close(self) -> None:
        """Clean up resources."""
        if self._shutdown_task and not self._shutdown_task.done():
            self._shutdown_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._shutdown_task

        if self._manager is not None:
            await self._manager.close()
            self._manager = None

        self._active_endpoint = None

    async def ensure_nitrogen_server(self) -> NitroGenEndpoint:
        """
        Ensure a NitroGen server is running and accessible.

        Returns endpoint configuration for NitroGenClient.
        Creates a new pod if none exists.
        """
        async with self._lock:
            # Check if we have an active endpoint
            if self._active_endpoint is not None:
                # Verify it's still healthy
                if await self._verify_endpoint(self._active_endpoint):
                    self._active_endpoint.mark_used()
                    self._schedule_idle_shutdown()
                    return self._active_endpoint
                else:
                    logger.warning("Active endpoint unhealthy, will recreate")
                    self._active_endpoint = None

            # Look for existing nitrogen pods
            manager = await self._ensure_manager()
            pods = await manager.list_pods()

            nitrogen_pod = None
            for pod in pods:
                if pod.name.startswith(self.nitrogen_config.pod_name_prefix):
                    if pod.is_running:
                        nitrogen_pod = pod
                        break
                    elif pod.is_stopped:
                        # Try to resume stopped pod
                        try:
                            logger.info("Resuming stopped nitrogen pod", pod_id=pod.id)
                            nitrogen_pod = await manager.start_pod(pod.id)
                            break
                        except RunPodAPIError as e:
                            # Host may be out of GPUs, will create new pod
                            logger.warning(
                                "Failed to resume pod, will create new",
                                pod_id=pod.id,
                                error=str(e),
                            )
                            continue

            # Create new pod if none found
            if nitrogen_pod is None:
                nitrogen_pod = await self._create_nitrogen_pod()

            # Create tunnel and endpoint
            endpoint = await self._setup_endpoint(nitrogen_pod)
            self._active_endpoint = endpoint
            self._schedule_idle_shutdown()

            return endpoint

    async def _create_nitrogen_pod(self) -> PodStatus:
        """Create a new NitroGen pod."""
        manager = await self._ensure_manager()
        config = self.nitrogen_config

        # Generate unique pod name
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        pod_name = f"{config.pod_name_prefix}-{timestamp}"

        logger.info(
            "Creating NitroGen pod",
            name=pod_name,
            gpu_type=config.gpu_type,
        )

        # Try preferred GPU, then fallbacks
        gpu_types_to_try = [config.gpu_type] + config.fallback_gpu_types
        last_error: Exception | None = None

        for gpu_type in gpu_types_to_try:
            try:
                pod = await manager.create_pod(
                    name=pod_name,
                    gpu_type=gpu_type,
                    volume_gb=config.volume_gb,
                    image="runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
                    env={
                        "NITROGEN_PORT": str(config.nitrogen_port),
                    },
                )

                logger.info(
                    "Pod created",
                    pod_id=pod.id,
                    gpu_type=gpu_type,
                    cost_per_hour=pod.cost_per_hour,
                )

                # Wait for pod to be fully ready
                await self._wait_for_nitrogen_ready(pod)

                return pod

            except RunPodAPIError as e:
                last_error = e
                logger.warning(
                    "Failed to create pod with GPU type",
                    gpu_type=gpu_type,
                    error=str(e),
                )
                continue

        raise RunPodError(f"Failed to create pod with any GPU type: {last_error}")

    async def _wait_for_nitrogen_ready(self, pod: PodStatus) -> None:
        """Wait for NitroGen server to be ready on the pod."""
        manager = await self._ensure_manager()
        config = self.nitrogen_config

        logger.info("Waiting for NitroGen server to start", pod_id=pod.id)

        start_time = time.time()
        ssh_ready = False
        setup_done = False

        while time.time() - start_time < config.startup_timeout_seconds:
            elapsed = int(time.time() - start_time)

            # Check if pod is still running
            current_pod = await manager.get_pod(pod.id)
            if current_pod is None or not current_pod.is_running:
                raise RunPodError(f"Pod {pod.id} stopped unexpectedly")

            # Update pod reference to get fresh SSH info
            pod = current_pod

            # Step 1: Wait for SSH to be available
            if not ssh_ready:
                if await self._wait_for_ssh(pod, timeout=30):
                    ssh_ready = True
                    logger.info("SSH is ready", pod_id=pod.id, elapsed=elapsed)
                else:
                    logger.debug("Waiting for SSH", pod_id=pod.id, elapsed=elapsed)
                    await asyncio.sleep(10)
                    continue

            # Step 2: Run setup if not done yet
            if not setup_done:
                try:
                    await self._run_nitrogen_setup(pod)
                    setup_done = True
                    logger.info("NitroGen setup complete", pod_id=pod.id)
                except Exception as e:
                    logger.warning("Setup failed, will retry", error=str(e))
                    await asyncio.sleep(10)
                    continue

            # Step 3: Create tunnel and check nitrogen health
            try:
                await manager.create_tunnel(
                    pod.id,
                    local_port=config.local_tunnel_port,
                    remote_port=config.nitrogen_port,
                )

                # Quick check if something is listening
                if await self._check_nitrogen_health("localhost", config.local_tunnel_port):
                    logger.info("NitroGen server is ready", pod_id=pod.id, elapsed=elapsed)
                    return

            except Exception as e:
                logger.debug("Waiting for nitrogen", error=str(e), elapsed=elapsed)

            await asyncio.sleep(10)

        raise RunPodError(f"Timeout waiting for NitroGen server on pod {pod.id}")

    async def _wait_for_ssh(self, pod: PodStatus, timeout: int = 30) -> bool:
        """Wait for SSH to become available on the pod."""
        import socket

        if not pod.ssh_command:
            return False

        # Parse SSH command to get host and port
        # Format: ssh root@<ip> -p <port> -i <key>
        parts = pod.ssh_command.split()
        host = None
        port = 22

        for i, part in enumerate(parts):
            if "@" in part and not part.startswith("-"):
                host = part.split("@")[1]
            elif part == "-p" and i + 1 < len(parts):
                port = int(parts[i + 1])

        if not host:
            return False

        # Try to connect to SSH port
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except Exception:
            return False

    async def _run_nitrogen_setup(self, pod: PodStatus) -> None:
        """Run NitroGen setup script on the pod via SSH."""
        if not pod.ssh_command:
            return

        # Parse SSH command to get connection details
        # Format: ssh root@<ip> -p <port> -i <key>
        pod.ssh_command.split()

        # Run setup script
        setup_cmd = f"{pod.ssh_command} 'bash -s' << 'SCRIPT'\n{NITROGEN_SETUP_SCRIPT}\nSCRIPT"

        try:
            result = subprocess.run(
                setup_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                logger.warning("Setup script had issues", stderr=result.stderr[:500])
        except subprocess.TimeoutExpired:
            logger.warning("Setup script timed out")
        except Exception as e:
            logger.warning("Failed to run setup script", error=str(e))

        # Start nitrogen server
        start_cmd = f"{pod.ssh_command} 'bash -s' << 'SCRIPT'\n{NITROGEN_START_SCRIPT}\nSCRIPT"

        try:
            subprocess.run(
                start_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
        except Exception as e:
            logger.warning("Failed to start nitrogen server", error=str(e))

    async def _check_nitrogen_health(self, host: str, port: int) -> bool:
        """Check if NitroGen server is responding."""
        import socket

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5.0)
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except Exception:
            return False

    async def _setup_endpoint(self, pod: PodStatus) -> NitroGenEndpoint:
        """Set up endpoint with tunnel for a pod."""
        manager = await self._ensure_manager()
        config = self.nitrogen_config

        # Create or get existing tunnel
        tunnel = await manager.ensure_tunnel(
            pod.id,
            local_port=config.local_tunnel_port,
            remote_port=config.nitrogen_port,
        )

        return NitroGenEndpoint(
            host="localhost",
            port=config.local_tunnel_port,
            pod_id=pod.id,
            tunnel_info=tunnel,
        )

    async def _verify_endpoint(self, endpoint: NitroGenEndpoint) -> bool:
        """Verify an endpoint is still healthy."""
        # Check tunnel process
        if (
            endpoint.tunnel_info
            and endpoint.tunnel_info.process
            and endpoint.tunnel_info.process.poll() is not None
        ):
            logger.warning("Tunnel process died")
            return False

        # Check pod status
        manager = await self._ensure_manager()
        pod = await manager.get_pod(endpoint.pod_id)

        if pod is None or not pod.is_running:
            logger.warning("Pod not running", pod_id=endpoint.pod_id)
            return False

        # Check nitrogen health
        if not await self._check_nitrogen_health(endpoint.host, endpoint.port):
            logger.warning("NitroGen not responding")
            return False

        return True

    def _schedule_idle_shutdown(self) -> None:
        """Schedule shutdown check for idle pods."""
        if self._shutdown_task and not self._shutdown_task.done():
            return  # Already scheduled

        self._shutdown_task = asyncio.create_task(self._idle_shutdown_loop())

    async def _idle_shutdown_loop(self) -> None:
        """Background task to check for idle shutdown."""
        config = self.nitrogen_config
        idle_timeout = config.idle_timeout_minutes * 60
        max_lifetime = config.max_pod_lifetime_hours * 3600

        while True:
            await asyncio.sleep(60)  # Check every minute

            async with self._lock:
                if self._active_endpoint is None:
                    continue

                endpoint = self._active_endpoint

                # Check max lifetime
                if endpoint.age_seconds > max_lifetime:
                    logger.info(
                        "Pod exceeded max lifetime, shutting down",
                        pod_id=endpoint.pod_id,
                        age_hours=endpoint.age_seconds / 3600,
                    )
                    await self._shutdown_pod(endpoint.pod_id)
                    self._active_endpoint = None
                    continue

                # Check idle timeout
                if endpoint.idle_seconds > idle_timeout:
                    logger.info(
                        "Pod idle timeout, shutting down",
                        pod_id=endpoint.pod_id,
                        idle_minutes=endpoint.idle_seconds / 60,
                    )
                    await self._shutdown_pod(endpoint.pod_id)
                    self._active_endpoint = None

    async def _shutdown_pod(self, pod_id: str) -> None:
        """Stop a pod."""
        try:
            manager = await self._ensure_manager()
            await manager.stop_pod(pod_id)
            logger.info("Pod stopped", pod_id=pod_id)
        except Exception as e:
            logger.error("Failed to stop pod", pod_id=pod_id, error=str(e))

    async def release(self) -> None:
        """
        Release the current endpoint.

        The pod will be shut down after idle timeout.
        Call this when done with the nitrogen server.
        """
        if self._active_endpoint is not None:
            logger.info(
                "Releasing nitrogen endpoint",
                pod_id=self._active_endpoint.pod_id,
                will_shutdown_after_minutes=self.nitrogen_config.idle_timeout_minutes,
            )

    async def force_shutdown(self) -> None:
        """Immediately shut down the active pod."""
        async with self._lock:
            if self._active_endpoint is not None:
                await self._shutdown_pod(self._active_endpoint.pod_id)
                self._active_endpoint = None

    async def get_status(self) -> dict[str, Any]:
        """Get current status for monitoring."""
        status: dict[str, Any] = {
            "has_active_endpoint": self._active_endpoint is not None,
            "active_pods": [],
        }

        if self._active_endpoint is not None:
            endpoint = self._active_endpoint
            status["active_endpoint"] = {
                "host": endpoint.host,
                "port": endpoint.port,
                "pod_id": endpoint.pod_id,
                "idle_seconds": endpoint.idle_seconds,
                "age_seconds": endpoint.age_seconds,
            }

        # List all nitrogen pods
        try:
            manager = await self._ensure_manager()
            pods = await manager.list_pods()

            for pod in pods:
                if pod.name.startswith(self.nitrogen_config.pod_name_prefix):
                    status["active_pods"].append(
                        {
                            "id": pod.id,
                            "name": pod.name,
                            "status": pod.status,
                            "gpu_type": pod.gpu_type,
                            "cost_per_hour": pod.cost_per_hour,
                            "uptime_seconds": pod.uptime_seconds,
                        }
                    )
        except Exception as e:
            status["error"] = str(e)

        return status


async def get_nitrogen_endpoint() -> tuple[str, int]:
    """
    Convenience function to get a NitroGen endpoint.

    Returns (host, port) tuple for NitroGenClient.

    Usage:
        host, port = await get_nitrogen_endpoint()
        client = NitroGenClient(host=host, port=port)
    """
    async with NitroGenRunPodManager() as manager:
        endpoint = await manager.ensure_nitrogen_server()
        return endpoint.host, endpoint.port
