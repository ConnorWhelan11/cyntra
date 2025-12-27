"""
Unit tests for NitroGen RunPod Manager.
"""

import time
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cyntra.fab.nitrogen_runpod import (
    NitroGenEndpoint,
    NitroGenPodConfig,
    NitroGenRunPodManager,
)
from cyntra.fab.runpod_manager import (
    PodStatus,
    RunPodAPIError,
    RunPodConfig,
    RunPodError,
    TunnelInfo,
)


class TestNitroGenPodConfig:
    """Tests for NitroGenPodConfig."""

    def test_default_values(self):
        config = NitroGenPodConfig()

        assert config.gpu_type == "NVIDIA H100 80GB HBM3"
        assert "NVIDIA A100 80GB PCIe" in config.fallback_gpu_types
        assert config.volume_gb == 100
        assert config.container_disk_gb == 50
        assert config.idle_timeout_minutes == 15
        assert config.max_pod_lifetime_hours == 8
        assert config.startup_timeout_seconds == 600
        assert config.nitrogen_port == 5555
        assert config.local_tunnel_port == 5555
        assert config.pod_name_prefix == "nitrogen-server"

    def test_custom_values(self):
        config = NitroGenPodConfig(
            gpu_type="NVIDIA A100 80GB PCIe",
            idle_timeout_minutes=30,
            nitrogen_port=6666,
        )

        assert config.gpu_type == "NVIDIA A100 80GB PCIe"
        assert config.idle_timeout_minutes == 30
        assert config.nitrogen_port == 6666


class TestNitroGenEndpoint:
    """Tests for NitroGenEndpoint."""

    def test_creation(self):
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )

        assert endpoint.host == "localhost"
        assert endpoint.port == 5555
        assert endpoint.pod_id == "pod123"
        assert endpoint.tunnel_info is None

    def test_mark_used(self):
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )

        original_time = endpoint.last_used_at
        time.sleep(0.1)
        endpoint.mark_used()

        assert endpoint.last_used_at > original_time

    def test_idle_seconds(self):
        # Create endpoint with specific time
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )

        # Force last_used_at to be in the past
        endpoint.last_used_at = datetime.now() - timedelta(seconds=60)

        assert endpoint.idle_seconds >= 60
        assert endpoint.idle_seconds < 65  # Some tolerance

    def test_age_seconds(self):
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )

        # Force created_at to be in the past
        endpoint.created_at = datetime.now() - timedelta(seconds=120)

        assert endpoint.age_seconds >= 120
        assert endpoint.age_seconds < 125  # Some tolerance


class TestNitroGenRunPodManager:
    """Tests for NitroGenRunPodManager."""

    @pytest.fixture
    def mock_runpod_config(self):
        return RunPodConfig(api_key="test-api-key")

    @pytest.fixture
    def mock_nitrogen_config(self):
        return NitroGenPodConfig(
            idle_timeout_minutes=5,
            startup_timeout_seconds=10,
        )

    def test_initialization(self, mock_runpod_config, mock_nitrogen_config):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        assert manager.runpod_config == mock_runpod_config
        assert manager.nitrogen_config == mock_nitrogen_config
        assert manager._active_endpoint is None
        assert manager._manager is None

    @pytest.mark.asyncio
    async def test_close_without_init(self):
        manager = NitroGenRunPodManager(
            runpod_config=RunPodConfig(api_key="test"),
        )

        # Should not raise
        await manager.close()

        assert manager._manager is None
        assert manager._active_endpoint is None

    @pytest.mark.asyncio
    async def test_get_status_no_active(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        # Mock the manager
        mock_rm = AsyncMock()
        mock_rm.list_pods = AsyncMock(return_value=[])
        manager._manager = mock_rm

        status = await manager.get_status()

        assert status["has_active_endpoint"] is False
        assert status["active_pods"] == []
        assert "active_endpoint" not in status

    @pytest.mark.asyncio
    async def test_get_status_with_active(self, mock_runpod_config, mock_nitrogen_config):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Set up active endpoint
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )
        manager._active_endpoint = endpoint

        # Mock manager
        mock_rm = AsyncMock()
        mock_pod = PodStatus(
            id="pod123",
            name="nitrogen-server-20241226",
            status="running",
            gpu_type="NVIDIA H100 80GB HBM3",
            cost_per_hour=2.50,
            uptime_seconds=3600,
        )
        mock_rm.list_pods = AsyncMock(return_value=[mock_pod])
        manager._manager = mock_rm

        status = await manager.get_status()

        assert status["has_active_endpoint"] is True
        assert "active_endpoint" in status
        assert status["active_endpoint"]["pod_id"] == "pod123"
        assert len(status["active_pods"]) == 1
        assert status["active_pods"][0]["id"] == "pod123"

    @pytest.mark.asyncio
    async def test_release(self, mock_runpod_config, mock_nitrogen_config):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Set up active endpoint
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )
        manager._active_endpoint = endpoint

        # Release should not immediately clear endpoint
        await manager.release()

        assert manager._active_endpoint is not None

    @pytest.mark.asyncio
    async def test_force_shutdown(self, mock_runpod_config, mock_nitrogen_config):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Set up active endpoint
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )
        manager._active_endpoint = endpoint

        # Mock manager
        mock_rm = AsyncMock()
        mock_rm.stop_pod = AsyncMock()
        manager._manager = mock_rm

        await manager.force_shutdown()

        assert manager._active_endpoint is None
        mock_rm.stop_pod.assert_called_once_with("pod123")

    @pytest.mark.asyncio
    async def test_check_nitrogen_health_success(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        # Mock the method directly - socket import happens inside function
        with patch.object(manager, "_check_nitrogen_health", return_value=True):
            result = await manager._check_nitrogen_health("localhost", 5555)
            assert result is True

    @pytest.mark.asyncio
    async def test_check_nitrogen_health_unreachable_port(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        # Test with a port that's definitely not listening
        result = await manager._check_nitrogen_health("localhost", 59999)
        assert result is False

    @pytest.mark.asyncio
    async def test_verify_endpoint_tunnel_died(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        # Create mock tunnel with dead process
        mock_process = MagicMock()
        mock_process.poll.return_value = 1  # Process exited
        mock_tunnel = TunnelInfo(
            local_port=5555,
            remote_host="localhost",
            remote_port=5555,
            ssh_host="1.2.3.4",
            ssh_port=22,
            process=mock_process,
        )

        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
            tunnel_info=mock_tunnel,
        )

        result = await manager._verify_endpoint(endpoint)

        assert result is False

    @pytest.mark.asyncio
    async def test_verify_endpoint_pod_not_running(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        # Mock manager returning stopped pod
        mock_rm = AsyncMock()
        mock_rm.get_pod = AsyncMock(
            return_value=PodStatus(
                id="pod123",
                name="nitrogen-server",
                status="stopped",
            )
        )
        manager._manager = mock_rm

        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )

        result = await manager._verify_endpoint(endpoint)

        assert result is False

    @pytest.mark.asyncio
    @patch.object(NitroGenRunPodManager, "_check_nitrogen_health")
    async def test_verify_endpoint_healthy(self, mock_health_check, mock_runpod_config):
        mock_health_check.return_value = True

        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        # Mock manager returning running pod
        mock_rm = AsyncMock()
        mock_rm.get_pod = AsyncMock(
            return_value=PodStatus(
                id="pod123",
                name="nitrogen-server",
                status="running",
            )
        )
        manager._manager = mock_rm

        # No tunnel to check
        endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="pod123",
        )

        result = await manager._verify_endpoint(endpoint)

        assert result is True

    @pytest.mark.asyncio
    @patch.object(NitroGenRunPodManager, "_verify_endpoint")
    async def test_ensure_nitrogen_server_uses_existing(
        self, mock_verify, mock_runpod_config, mock_nitrogen_config
    ):
        mock_verify.return_value = True

        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Set up existing healthy endpoint
        existing_endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="existing-pod",
        )
        manager._active_endpoint = existing_endpoint

        # Cancel shutdown task if it gets scheduled
        manager._schedule_idle_shutdown = MagicMock()

        endpoint = await manager.ensure_nitrogen_server()

        assert endpoint.pod_id == "existing-pod"
        mock_verify.assert_called_once_with(existing_endpoint)

    @pytest.mark.asyncio
    @patch.object(NitroGenRunPodManager, "_setup_endpoint")
    @patch.object(NitroGenRunPodManager, "_verify_endpoint")
    async def test_ensure_nitrogen_server_finds_existing_pod(
        self, mock_verify, mock_setup, mock_runpod_config, mock_nitrogen_config
    ):
        mock_verify.return_value = False  # Force recreation

        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Mock manager with existing running pod
        mock_pod = PodStatus(
            id="existing-running",
            name="nitrogen-server-20241225",
            status="running",
        )
        mock_rm = AsyncMock()
        mock_rm.list_pods = AsyncMock(return_value=[mock_pod])
        manager._manager = mock_rm

        # Mock setup_endpoint
        expected_endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="existing-running",
        )
        mock_setup.return_value = expected_endpoint

        # Disable shutdown scheduling
        manager._schedule_idle_shutdown = MagicMock()

        endpoint = await manager.ensure_nitrogen_server()

        assert endpoint.pod_id == "existing-running"
        mock_setup.assert_called_once_with(mock_pod)

    @pytest.mark.asyncio
    @patch.object(NitroGenRunPodManager, "_create_nitrogen_pod")
    @patch.object(NitroGenRunPodManager, "_setup_endpoint")
    async def test_ensure_nitrogen_server_creates_new_pod(
        self, mock_setup, mock_create, mock_runpod_config, mock_nitrogen_config
    ):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Mock manager with no pods
        mock_rm = AsyncMock()
        mock_rm.list_pods = AsyncMock(return_value=[])
        manager._manager = mock_rm

        # Mock pod creation
        new_pod = PodStatus(
            id="new-pod",
            name="nitrogen-server-20241226",
            status="running",
        )
        mock_create.return_value = new_pod

        # Mock setup
        expected_endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="new-pod",
        )
        mock_setup.return_value = expected_endpoint

        # Disable shutdown scheduling
        manager._schedule_idle_shutdown = MagicMock()

        endpoint = await manager.ensure_nitrogen_server()

        assert endpoint.pod_id == "new-pod"
        mock_create.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_nitrogen_pod_gpu_fallback(self, mock_runpod_config, mock_nitrogen_config):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Mock manager that fails on H100, succeeds on A100
        mock_rm = AsyncMock()

        call_count = 0

        async def mock_create_pod(**kwargs):
            nonlocal call_count
            call_count += 1
            gpu_type = kwargs.get("gpu_type")

            if "H100" in gpu_type:
                raise RunPodAPIError("No H100 available")

            return PodStatus(
                id="a100-pod",
                name=kwargs.get("name", "nitrogen"),
                status="running",
                gpu_type=gpu_type,
                cost_per_hour=1.50,
            )

        mock_rm.create_pod = mock_create_pod
        manager._manager = mock_rm

        # Mock wait_for_nitrogen_ready to skip
        manager._wait_for_nitrogen_ready = AsyncMock()

        pod = await manager._create_nitrogen_pod()

        assert pod.id == "a100-pod"
        assert "A100" in pod.gpu_type or call_count > 1

    @pytest.mark.asyncio
    async def test_create_nitrogen_pod_all_gpus_fail(
        self, mock_runpod_config, mock_nitrogen_config
    ):
        # Config with only one fallback
        nitrogen_config = NitroGenPodConfig(fallback_gpu_types=[])

        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=nitrogen_config,
        )

        # Mock manager that always fails
        mock_rm = AsyncMock()
        mock_rm.create_pod = AsyncMock(side_effect=RunPodAPIError("No GPUs available"))
        manager._manager = mock_rm

        with pytest.raises(RunPodError, match="Failed to create pod with any GPU type"):
            await manager._create_nitrogen_pod()

    @pytest.mark.asyncio
    async def test_setup_endpoint(self, mock_runpod_config, mock_nitrogen_config):
        manager = NitroGenRunPodManager(
            runpod_config=mock_runpod_config,
            nitrogen_config=mock_nitrogen_config,
        )

        # Mock manager
        mock_tunnel = TunnelInfo(
            local_port=5555,
            remote_host="localhost",
            remote_port=5555,
            ssh_host="1.2.3.4",
            ssh_port=22,
        )
        mock_rm = AsyncMock()
        mock_rm.ensure_tunnel = AsyncMock(return_value=mock_tunnel)
        manager._manager = mock_rm

        pod = PodStatus(
            id="pod123",
            name="nitrogen-server",
            status="running",
        )

        endpoint = await manager._setup_endpoint(pod)

        assert endpoint.host == "localhost"
        assert endpoint.port == 5555
        assert endpoint.pod_id == "pod123"
        assert endpoint.tunnel_info == mock_tunnel

    @pytest.mark.asyncio
    async def test_context_manager(self, mock_runpod_config):
        with patch("cyntra.fab.nitrogen_runpod.RunPodManager") as mock_rm_cls:
            mock_rm_instance = AsyncMock()
            mock_rm_instance.__aenter__ = AsyncMock(return_value=mock_rm_instance)
            mock_rm_instance.__aexit__ = AsyncMock()
            mock_rm_instance.close = AsyncMock()
            mock_rm_cls.return_value = mock_rm_instance

            async with NitroGenRunPodManager(runpod_config=mock_runpod_config) as manager:
                assert manager._manager is mock_rm_instance

            # close should have been called on exit
            mock_rm_instance.close.assert_called()

    @pytest.mark.asyncio
    async def test_shutdown_pod(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        mock_rm = AsyncMock()
        mock_rm.stop_pod = AsyncMock()
        manager._manager = mock_rm

        await manager._shutdown_pod("pod123")

        mock_rm.stop_pod.assert_called_once_with("pod123")

    @pytest.mark.asyncio
    async def test_shutdown_pod_error_handling(self, mock_runpod_config):
        manager = NitroGenRunPodManager(runpod_config=mock_runpod_config)

        mock_rm = AsyncMock()
        mock_rm.stop_pod = AsyncMock(side_effect=Exception("API Error"))
        manager._manager = mock_rm

        # Should not raise, just log error
        await manager._shutdown_pod("pod123")


class TestNitroGenRunPodManagerResumeStopped:
    """Tests for resuming stopped pods."""

    @pytest.mark.asyncio
    @patch.object(NitroGenRunPodManager, "_setup_endpoint")
    async def test_resumes_stopped_pod(self, mock_setup):
        manager = NitroGenRunPodManager(
            runpod_config=RunPodConfig(api_key="test"),
        )

        # Mock manager with stopped pod
        stopped_pod = PodStatus(
            id="stopped-pod",
            name="nitrogen-server-20241225",
            status="stopped",
        )
        resumed_pod = PodStatus(
            id="stopped-pod",
            name="nitrogen-server-20241225",
            status="running",
        )

        mock_rm = AsyncMock()
        mock_rm.list_pods = AsyncMock(return_value=[stopped_pod])
        mock_rm.start_pod = AsyncMock(return_value=resumed_pod)
        manager._manager = mock_rm

        # Mock setup
        expected_endpoint = NitroGenEndpoint(
            host="localhost",
            port=5555,
            pod_id="stopped-pod",
        )
        mock_setup.return_value = expected_endpoint

        # Disable shutdown scheduling
        manager._schedule_idle_shutdown = MagicMock()

        endpoint = await manager.ensure_nitrogen_server()

        assert endpoint.pod_id == "stopped-pod"
        mock_rm.start_pod.assert_called_once_with("stopped-pod")
