"""
End-to-end integration test for NitroGen playability pipeline.

This test validates the full pipeline:
1. Spin up H100 pod on RunPod
2. Create SSH tunnel
3. Connect NitroGen client
4. Run playability gate
5. Collect metrics
6. Shutdown pod

Requirements:
- RUNPOD_API_KEY environment variable set
- SSH key at ~/.ssh/id_ed25519

Run with:
    pytest tests/integration/test_nitrogen_e2e.py -v -s

Or standalone:
    python tests/integration/test_nitrogen_e2e.py
"""

import asyncio
import os
import sys
import time
from pathlib import Path

import pytest
import structlog

# Add kernel src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from cyntra.fab.nitrogen_client import (
    ConnectionState,
    NitroGenClient,
    RetryConfig,
)
from cyntra.fab.nitrogen_runpod import (
    NitroGenPodConfig,
    NitroGenRunPodManager,
)
from cyntra.fab.runpod_manager import RunPodConfig

logger = structlog.get_logger(__name__)


# Skip if no API key
RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
SKIP_REASON = "RUNPOD_API_KEY not set - skipping integration tests"


def has_runpod_key() -> bool:
    return bool(RUNPOD_API_KEY)


@pytest.fixture
def runpod_config():
    if not has_runpod_key():
        pytest.skip(SKIP_REASON)
    return RunPodConfig(api_key=RUNPOD_API_KEY)


@pytest.fixture
def nitrogen_config():
    return NitroGenPodConfig(
        idle_timeout_minutes=5,  # Short timeout for testing
        startup_timeout_seconds=300,  # 5 min startup
    )


class TestNitroGenE2E:
    """End-to-end tests for NitroGen pipeline."""

    @pytest.mark.skipif(not has_runpod_key(), reason=SKIP_REASON)
    @pytest.mark.asyncio
    async def test_runpod_connection(self, runpod_config):
        """Test basic RunPod API connectivity."""
        from cyntra.fab.runpod_manager import RunPodManager

        async with RunPodManager(runpod_config) as manager:
            # List pods (should work even with 0 pods)
            pods = await manager.list_pods()
            logger.info("Found pods", count=len(pods))

            # List available GPUs
            gpus = await manager.get_available_gpus()
            logger.info("Available GPUs", count=len(gpus))

            # Check for H100
            h100_available = any("H100" in g.get("name", "") for g in gpus)
            logger.info("H100 available", available=h100_available)

            assert isinstance(pods, list)
            assert isinstance(gpus, list)

    @pytest.mark.skipif(not has_runpod_key(), reason=SKIP_REASON)
    @pytest.mark.asyncio
    async def test_nitrogen_pod_lifecycle(self, runpod_config, nitrogen_config):
        """Test NitroGen pod creation, connection, and shutdown."""
        manager = NitroGenRunPodManager(
            runpod_config=runpod_config,
            nitrogen_config=nitrogen_config,
        )

        try:
            # Get status before
            status_before = await manager.get_status()
            logger.info("Status before", status=status_before)

            # Ensure server (this may create a new pod)
            logger.info("Ensuring NitroGen server...")
            endpoint = await manager.ensure_nitrogen_server()

            logger.info(
                "Got endpoint",
                host=endpoint.host,
                port=endpoint.port,
                pod_id=endpoint.pod_id,
            )

            assert endpoint.host == "localhost"
            assert endpoint.port == 5555
            assert endpoint.pod_id is not None

            # Get status after
            status_after = await manager.get_status()
            logger.info("Status after", status=status_after)

            assert status_after["has_active_endpoint"] is True

            # Test client connection
            client = NitroGenClient(
                host=endpoint.host,
                port=endpoint.port,
                timeout_ms=30000,
                retry_config=RetryConfig(max_retries=3),
            )

            try:
                # Get info
                info = client.info()
                logger.info("NitroGen info", info=info)

                # Reset session
                client.reset()
                logger.info("Session reset")

                assert client.state == ConnectionState.CONNECTED
                assert client.is_healthy

            finally:
                client.close()

        finally:
            # Force shutdown to clean up
            await manager.force_shutdown()
            await manager.close()

    @pytest.mark.skipif(not has_runpod_key(), reason=SKIP_REASON)
    @pytest.mark.asyncio
    async def test_nitrogen_prediction(self, runpod_config, nitrogen_config):
        """Test NitroGen prediction with a simple frame."""
        import numpy as np
        from PIL import Image

        manager = NitroGenRunPodManager(
            runpod_config=runpod_config,
            nitrogen_config=nitrogen_config,
        )

        try:
            endpoint = await manager.ensure_nitrogen_server()

            client = NitroGenClient(
                host=endpoint.host,
                port=endpoint.port,
                timeout_ms=30000,
            )

            try:
                client.reset()

                # Create test frame (random noise)
                frame = Image.fromarray(np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8))

                # Run prediction
                start = time.time()
                action = client.predict_action(frame, timestep=0)
                latency = (time.time() - start) * 1000

                logger.info(
                    "Prediction result",
                    move_x=action.move_x,
                    move_y=action.move_y,
                    look_x=action.look_x,
                    look_y=action.look_y,
                    jump=action.jump,
                    interact=action.interact,
                    latency_ms=latency,
                )

                # Validate action
                assert -1.0 <= action.move_x <= 1.0
                assert -1.0 <= action.move_y <= 1.0
                assert isinstance(action.jump, bool)
                assert isinstance(action.interact, bool)

                # Check client metrics
                status = client.get_status()
                logger.info("Client status", metrics=status.get("metrics"))

                assert status["metrics"]["successful_requests"] >= 1

            finally:
                client.close()

        finally:
            await manager.force_shutdown()
            await manager.close()


class TestPlayabilityGateE2E:
    """End-to-end test for full playability gate."""

    @pytest.mark.skipif(not has_runpod_key(), reason=SKIP_REASON)
    @pytest.mark.asyncio
    async def test_playability_gate_mock_frames(self, runpod_config, nitrogen_config):
        """
        Test playability gate with mock frames (no Godot required).

        This simulates what the gate does but with synthetic frames.
        """
        import numpy as np
        from PIL import Image

        from cyntra.fab.playability_gate import (
            PlayabilityGateResult,
            PlayabilityMetrics,
            PlayabilityThresholds,
            _evaluate_thresholds,
        )

        manager = NitroGenRunPodManager(
            runpod_config=runpod_config,
            nitrogen_config=nitrogen_config,
        )

        try:
            endpoint = await manager.ensure_nitrogen_server()

            client = NitroGenClient(
                host=endpoint.host,
                port=endpoint.port,
                timeout_ms=30000,
                retry_config=RetryConfig(max_retries=3),
            )

            try:
                client.reset()

                # Simulate playtest
                metrics = PlayabilityMetrics()
                num_frames = 100  # Short test
                stuck_threshold = 0.005

                logger.info("Running mock playtest", frames=num_frames)

                for i in range(num_frames):
                    # Generate random frame
                    frame = Image.fromarray(
                        np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
                    )

                    try:
                        action = client.predict_action(frame, timestep=0)

                        # Track metrics
                        movement = np.sqrt(action.move_x**2 + action.move_y**2)
                        if movement < stuck_threshold:
                            metrics.stuck_frames += 1

                        if action.interact:
                            metrics.interaction_attempts += 1

                        if action.jump:
                            metrics.jump_attempts += 1

                        metrics.movement_distance += float(movement)
                        metrics.frames_processed += 1

                    except Exception as e:
                        metrics.nitrogen_timeouts += 1
                        logger.warning("Prediction failed", error=str(e))

                    if (i + 1) % 20 == 0:
                        logger.info(
                            "Progress",
                            frame=i + 1,
                            stuck_ratio=f"{metrics.stuck_ratio:.1%}",
                        )

                # Evaluate
                result = PlayabilityGateResult(metrics=metrics)
                thresholds = PlayabilityThresholds(
                    stuck_ratio_max=0.5,
                    coverage_min=0.1,
                )
                _evaluate_thresholds(result, thresholds)
                result.success = len(result.failures) == 0

                logger.info(
                    "Playtest complete",
                    success=result.success,
                    frames=metrics.frames_processed,
                    stuck_ratio=f"{metrics.stuck_ratio:.1%}",
                    interactions=metrics.interaction_attempts,
                    jumps=metrics.jump_attempts,
                    failures=result.failures,
                    warnings=result.warnings,
                )

                # Get client health
                status = client.get_status()
                logger.info(
                    "Client health",
                    state=status["state"],
                    success_rate=status["metrics"].get("success_rate"),
                    avg_latency=status["metrics"].get("avg_latency_ms"),
                )

                # Assertions
                assert metrics.frames_processed == num_frames - metrics.nitrogen_timeouts
                assert metrics.nitrogen_timeouts < num_frames * 0.1  # <10% timeouts

            finally:
                client.close()

        finally:
            await manager.force_shutdown()
            await manager.close()


async def run_quick_test():
    """Quick standalone test - run this directly."""
    if not has_runpod_key():
        print(f"Error: {SKIP_REASON}")
        print("Set it with: export RUNPOD_API_KEY=your_key_here")
        return 1

    print("=" * 60)
    print("NitroGen E2E Integration Test")
    print("=" * 60)

    config = RunPodConfig(api_key=RUNPOD_API_KEY)
    nitrogen_config = NitroGenPodConfig(
        idle_timeout_minutes=5,
        startup_timeout_seconds=300,
    )

    manager = NitroGenRunPodManager(
        runpod_config=config,
        nitrogen_config=nitrogen_config,
    )

    try:
        print("\n[1/4] Checking RunPod connection...")
        from cyntra.fab.runpod_manager import RunPodManager

        async with RunPodManager(config) as rm:
            pods = await rm.list_pods()
            print(f"  Found {len(pods)} existing pods")

            gpus = await rm.get_available_gpus()
            h100 = [g for g in gpus if "H100" in g.get("name", "")]
            print(f"  H100 GPUs available: {len(h100)}")

        print("\n[2/4] Starting NitroGen server...")
        start = time.time()
        endpoint = await manager.ensure_nitrogen_server()
        startup_time = time.time() - start
        print(f"  Server ready in {startup_time:.1f}s")
        print(f"  Endpoint: {endpoint.host}:{endpoint.port}")
        print(f"  Pod ID: {endpoint.pod_id}")

        print("\n[3/4] Testing NitroGen predictions...")
        import numpy as np
        from PIL import Image

        client = NitroGenClient(
            host=endpoint.host,
            port=endpoint.port,
            timeout_ms=30000,
        )

        try:
            client.reset()

            latencies = []
            for _i in range(10):
                frame = Image.fromarray(np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8))

                start = time.time()
                client.predict_action(frame, timestep=0)
                latency = (time.time() - start) * 1000
                latencies.append(latency)

            avg_latency = sum(latencies) / len(latencies)
            print("  10 predictions completed")
            print(f"  Average latency: {avg_latency:.1f}ms")
            print(f"  Min/Max: {min(latencies):.1f}ms / {max(latencies):.1f}ms")

            status = client.get_status()
            print(f"  Success rate: {status['metrics'].get('success_rate', 0):.1%}")

        finally:
            client.close()

        print("\n[4/4] Cleaning up...")
        await manager.force_shutdown()
        print("  Pod stopped")

        print("\n" + "=" * 60)
        print("SUCCESS - All tests passed!")
        print("=" * 60)
        return 0

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback

        traceback.print_exc()
        return 1

    finally:
        await manager.close()


if __name__ == "__main__":
    import asyncio

    exit_code = asyncio.run(run_quick_test())
    sys.exit(exit_code)
