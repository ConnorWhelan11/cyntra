"""
Unit tests for Playability Metrics Collector.
"""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from cyntra.fab.playability_metrics import (
    AggregatedStats,
    GateResultRecord,
    PlayabilityMetricsCollector,
    get_collector,
    record_gate_result,
)


class TestGateResultRecord:
    """Tests for GateResultRecord dataclass."""

    def test_default_values(self):
        record = GateResultRecord(
            timestamp="2024-12-26T12:00:00Z",
            world_id="test_world",
            gate_config_id="test_gate",
        )

        assert record.success is False
        assert record.failures == []
        assert record.warnings == []
        assert record.frames_processed == 0
        assert record.playtime_seconds == 0.0
        assert record.stuck_ratio == 0.0
        assert record.coverage_estimate == 0.0
        assert record.interaction_rate == 0.0
        assert record.movement_distance == 0.0
        assert record.jump_attempts == 0
        assert record.interaction_attempts == 0
        assert record.crash_count == 0
        assert record.nitrogen_timeouts == 0
        assert record.avg_latency_ms == 0.0
        assert record.total_retries == 0
        assert record.environment_type == ""
        assert record.seed is None
        assert record.run_id is None

    def test_full_record(self):
        record = GateResultRecord(
            timestamp="2024-12-26T12:00:00Z",
            world_id="forest_test",
            gate_config_id="gameplay_playability_forest_v001",
            run_id="run-123",
            success=True,
            failures=[],
            warnings=["LOW_COVERAGE"],
            frames_processed=1000,
            playtime_seconds=60.0,
            stuck_ratio=0.05,
            coverage_estimate=0.75,
            interaction_rate=0.15,
            movement_distance=150.0,
            jump_attempts=10,
            interaction_attempts=5,
            crash_count=0,
            nitrogen_timeouts=1,
            avg_latency_ms=45.5,
            total_retries=2,
            environment_type="forest",
            seed=42,
        )

        assert record.success is True
        assert record.playtime_seconds == 60.0
        assert record.seed == 42

    def test_to_dict(self):
        record = GateResultRecord(
            timestamp="2024-12-26T12:00:00Z",
            world_id="test_world",
            gate_config_id="test_gate",
            success=True,
            frames_processed=500,
        )

        data = record.to_dict()

        assert isinstance(data, dict)
        assert data["timestamp"] == "2024-12-26T12:00:00Z"
        assert data["world_id"] == "test_world"
        assert data["gate_config_id"] == "test_gate"
        assert data["success"] is True
        assert data["frames_processed"] == 500

    def test_from_dict(self):
        data = {
            "timestamp": "2024-12-26T12:00:00Z",
            "world_id": "test_world",
            "gate_config_id": "test_gate",
            "success": True,
            "frames_processed": 500,
            "playtime_seconds": 30.0,
            "stuck_ratio": 0.1,
            "unknown_field": "should be ignored",
        }

        record = GateResultRecord.from_dict(data)

        assert record.timestamp == "2024-12-26T12:00:00Z"
        assert record.world_id == "test_world"
        assert record.success is True
        assert record.frames_processed == 500
        assert record.playtime_seconds == 30.0
        assert record.stuck_ratio == 0.1

    def test_roundtrip(self):
        original = GateResultRecord(
            timestamp="2024-12-26T12:00:00Z",
            world_id="test_world",
            gate_config_id="test_gate",
            success=True,
            failures=["STUCK"],
            warnings=["LOW_COVERAGE"],
            frames_processed=1000,
        )

        data = original.to_dict()
        restored = GateResultRecord.from_dict(data)

        assert restored.timestamp == original.timestamp
        assert restored.world_id == original.world_id
        assert restored.success == original.success
        assert restored.failures == original.failures
        assert restored.warnings == original.warnings
        assert restored.frames_processed == original.frames_processed


class TestAggregatedStats:
    """Tests for AggregatedStats dataclass."""

    def test_default_values(self):
        stats = AggregatedStats()

        assert stats.world_id is None
        assert stats.gate_config_id is None
        assert stats.total_runs == 0
        assert stats.passed == 0
        assert stats.failed == 0
        assert stats.pass_rate == 0.0
        assert stats.failure_codes == {}
        assert stats.warning_codes == {}

    def test_to_dict(self):
        stats = AggregatedStats(
            world_id="test_world",
            total_runs=10,
            passed=8,
            failed=2,
            pass_rate=0.8,
            failure_codes={"STUCK": 2},
        )

        data = stats.to_dict()

        assert data["world_id"] == "test_world"
        assert data["total_runs"] == 10
        assert data["pass_rate"] == 0.8
        assert data["failure_codes"] == {"STUCK": 2}


class TestPlayabilityMetricsCollector:
    """Tests for PlayabilityMetricsCollector."""

    @pytest.fixture
    def temp_storage(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage_path = Path(tmpdir) / "metrics" / "playability.jsonl"
            yield storage_path

    @pytest.fixture
    def collector(self, temp_storage):
        return PlayabilityMetricsCollector(storage_path=temp_storage)

    def test_initialization(self, temp_storage):
        collector = PlayabilityMetricsCollector(
            storage_path=temp_storage,
            max_records_in_memory=500,
        )

        assert collector.storage_path == temp_storage
        assert collector.max_records_in_memory == 500
        assert temp_storage.parent.exists()

    def _create_mock_result(
        self,
        success: bool = True,
        failures: list | None = None,
        warnings: list | None = None,
        frames_processed: int = 1000,
        total_playtime_seconds: float = 60.0,
        stuck_ratio: float = 0.05,
        coverage_estimate: float = 0.75,
        interaction_rate: float = 0.15,
        movement_distance: float = 100.0,
        jump_attempts: int = 10,
        interaction_attempts: int = 5,
        crash_count: int = 0,
        nitrogen_timeouts: int = 0,
    ):
        """Helper to create a properly configured mock result."""
        mock_result = MagicMock()
        mock_result.success = success
        mock_result.failures = failures or []
        mock_result.warnings = warnings or []

        # Create metrics with all attributes
        mock_metrics = MagicMock()
        mock_metrics.frames_processed = frames_processed
        mock_metrics.total_playtime_seconds = total_playtime_seconds
        mock_metrics.stuck_ratio = stuck_ratio
        mock_metrics.coverage_estimate = coverage_estimate
        mock_metrics.interaction_rate = interaction_rate
        mock_metrics.movement_distance = movement_distance
        mock_metrics.jump_attempts = jump_attempts
        mock_metrics.interaction_attempts = interaction_attempts
        mock_metrics.crash_count = crash_count
        mock_metrics.nitrogen_timeouts = nitrogen_timeouts

        mock_result.metrics = mock_metrics
        return mock_result

    def test_record_gate_result(self, collector):
        mock_result = self._create_mock_result(
            warnings=["LOW_COVERAGE"],
        )

        record = collector.record_gate_result(
            world_id="forest_test",
            gate_config_id="test_gate",
            result=mock_result,
            run_id="run-123",
            environment_type="forest",
            seed=42,
        )

        assert record.world_id == "forest_test"
        assert record.gate_config_id == "test_gate"
        assert record.success is True
        assert record.warnings == ["LOW_COVERAGE"]
        assert record.frames_processed == 1000
        assert record.playtime_seconds == 60.0
        assert record.environment_type == "forest"
        assert record.seed == 42

    def test_record_gate_result_with_nitrogen_metrics(self, collector):
        mock_result = self._create_mock_result(frames_processed=500)

        nitrogen_metrics = {
            "avg_latency_ms": 42.5,
            "total_retries": 3,
        }

        record = collector.record_gate_result(
            world_id="test",
            gate_config_id="gate",
            result=mock_result,
            nitrogen_metrics=nitrogen_metrics,
        )

        assert record.avg_latency_ms == 42.5
        assert record.total_retries == 3

    def test_record_persists_to_storage(self, collector, temp_storage):
        mock_result = self._create_mock_result(frames_processed=500)

        collector.record_gate_result(
            world_id="test",
            gate_config_id="gate",
            result=mock_result,
        )

        # Check file was written
        assert temp_storage.exists()
        content = temp_storage.read_text()
        data = json.loads(content.strip())
        assert data["world_id"] == "test"
        assert data["gate_config_id"] == "gate"

    def test_record_trims_memory_cache(self, temp_storage):
        collector = PlayabilityMetricsCollector(
            storage_path=temp_storage,
            max_records_in_memory=5,
        )

        # Record more than max
        for i in range(10):
            mock_result = self._create_mock_result(frames_processed=100)
            collector.record_gate_result(
                world_id=f"world_{i}",
                gate_config_id="gate",
                result=mock_result,
            )

        # Should only keep last 5 in memory
        assert len(collector._records) == 5
        assert collector._records[0].world_id == "world_5"
        assert collector._records[-1].world_id == "world_9"

    def test_get_records_empty(self, collector):
        records = collector.get_records()
        assert records == []

    def test_get_records_returns_all(self, collector):
        for i in range(3):
            mock_result = self._create_mock_result()
            collector.record_gate_result(
                world_id=f"world_{i}",
                gate_config_id="gate",
                result=mock_result,
            )

        records = collector.get_records()

        assert len(records) == 3

    def test_get_records_filter_by_world_id(self, collector):
        collector.record_gate_result(
            world_id="world_a", gate_config_id="gate", result=self._create_mock_result()
        )
        collector.record_gate_result(
            world_id="world_b", gate_config_id="gate", result=self._create_mock_result()
        )
        collector.record_gate_result(
            world_id="world_a", gate_config_id="gate", result=self._create_mock_result()
        )

        records = collector.get_records(world_id="world_a")

        assert len(records) == 2
        assert all(r.world_id == "world_a" for r in records)

    def test_get_records_filter_by_gate_config(self, collector):
        collector.record_gate_result(
            world_id="world", gate_config_id="gate_a", result=self._create_mock_result()
        )
        collector.record_gate_result(
            world_id="world", gate_config_id="gate_b", result=self._create_mock_result()
        )
        collector.record_gate_result(
            world_id="world", gate_config_id="gate_a", result=self._create_mock_result()
        )

        records = collector.get_records(gate_config_id="gate_a")

        assert len(records) == 2
        assert all(r.gate_config_id == "gate_a" for r in records)

    def test_get_records_filter_by_since(self, collector, temp_storage):
        # Manually write records with different timestamps
        old_time = (datetime.utcnow() - timedelta(days=10)).isoformat() + "Z"
        new_time = datetime.utcnow().isoformat() + "Z"

        records = [
            {"timestamp": old_time, "world_id": "old", "gate_config_id": "gate", "success": True},
            {"timestamp": new_time, "world_id": "new", "gate_config_id": "gate", "success": True},
        ]

        with open(temp_storage, "w") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        since = datetime.utcnow() - timedelta(days=1)
        result = collector.get_records(since=since)

        assert len(result) == 1
        assert result[0].world_id == "new"

    def test_get_records_with_limit(self, collector):
        for i in range(10):
            mock_result = self._create_mock_result()
            collector.record_gate_result(
                world_id=f"world_{i}",
                gate_config_id="gate",
                result=mock_result,
            )

        records = collector.get_records(limit=3)

        assert len(records) == 3

    def test_get_stats_empty(self, collector):
        stats = collector.get_stats()

        assert stats.total_runs == 0
        assert stats.passed == 0
        assert stats.pass_rate == 0.0

    def test_get_stats_calculates_correctly(self, collector):
        # Record 3 passes and 1 failure
        for success in [True, True, True, False]:
            mock_result = self._create_mock_result(
                success=success,
                failures=["STUCK"] if not success else [],
                stuck_ratio=0.3 if not success else 0.05,
                coverage_estimate=0.5,
                interaction_rate=0.1,
            )
            collector.record_gate_result(
                world_id="test_world",
                gate_config_id="gate",
                result=mock_result,
            )

        stats = collector.get_stats(world_id="test_world")

        assert stats.total_runs == 4
        assert stats.passed == 3
        assert stats.failed == 1
        assert stats.pass_rate == 0.75
        assert "STUCK" in stats.failure_codes
        assert stats.failure_codes["STUCK"] == 1

    def test_get_stats_averages(self, collector):
        for stuck_ratio in [0.1, 0.2, 0.3]:
            mock_result = self._create_mock_result(stuck_ratio=stuck_ratio)
            collector.record_gate_result(
                world_id="test",
                gate_config_id="gate",
                result=mock_result,
            )

        stats = collector.get_stats()

        assert stats.avg_stuck_ratio == pytest.approx(0.2, rel=0.01)

    def test_get_all_stats(self, collector):
        # Record for multiple worlds
        for world in ["world_a", "world_a", "world_b"]:
            mock_result = self._create_mock_result()
            collector.record_gate_result(
                world_id=world,
                gate_config_id="gate",
                result=mock_result,
            )

        all_stats = collector.get_all_stats()

        assert "world_a" in all_stats
        assert "world_b" in all_stats
        assert all_stats["world_a"].total_runs == 2
        assert all_stats["world_b"].total_runs == 1

    def test_print_summary_no_data(self, collector, capsys):
        collector.print_summary()

        captured = capsys.readouterr()
        assert "No playability gate data found" in captured.out

    def test_print_summary_with_data(self, collector, capsys):
        mock_result = self._create_mock_result(stuck_ratio=0.05, coverage_estimate=0.8)
        collector.record_gate_result(
            world_id="test_world",
            gate_config_id="gate",
            result=mock_result,
        )

        collector.print_summary()

        captured = capsys.readouterr()
        assert "PLAYABILITY GATE SUMMARY" in captured.out
        assert "test_world" in captured.out


class TestModuleFunctions:
    """Tests for module-level convenience functions."""

    def _create_mock_result(self, success: bool = True):
        """Helper to create a properly configured mock result."""
        mock_result = MagicMock()
        mock_result.success = success
        mock_result.failures = []
        mock_result.warnings = []

        mock_metrics = MagicMock()
        mock_metrics.frames_processed = 1000
        mock_metrics.total_playtime_seconds = 60.0
        mock_metrics.stuck_ratio = 0.05
        mock_metrics.coverage_estimate = 0.75
        mock_metrics.interaction_rate = 0.15
        mock_metrics.movement_distance = 100.0
        mock_metrics.jump_attempts = 10
        mock_metrics.interaction_attempts = 5
        mock_metrics.crash_count = 0
        mock_metrics.nitrogen_timeouts = 0

        mock_result.metrics = mock_metrics
        return mock_result

    def test_get_collector_singleton(self):
        # Reset global
        import cyntra.fab.playability_metrics as pm

        pm._collector = None

        collector1 = get_collector()
        collector2 = get_collector()

        assert collector1 is collector2

    def test_record_gate_result_function(self):
        # Reset global
        import cyntra.fab.playability_metrics as pm

        pm._collector = None

        with tempfile.TemporaryDirectory() as tmpdir:
            storage_path = Path(tmpdir) / "metrics" / "playability.jsonl"
            pm._collector = PlayabilityMetricsCollector(storage_path=storage_path)

            mock_result = self._create_mock_result()

            record = record_gate_result(
                world_id="test",
                gate_config_id="gate",
                result=mock_result,
            )

            assert record.world_id == "test"
            assert record.success is True
