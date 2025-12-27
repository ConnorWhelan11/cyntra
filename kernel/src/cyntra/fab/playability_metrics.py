"""
Playability Metrics - Track gate pass rates and performance over time.

Provides:
- Structured logging of gate results
- Historical pass rate tracking
- Aggregation and reporting
- Integration with monitoring systems

Usage:
    from cyntra.fab.playability_metrics import PlayabilityMetricsCollector

    collector = PlayabilityMetricsCollector()

    # Record a gate result
    collector.record_gate_result(
        world_id="outora_library",
        gate_config="gameplay_playability_gothic_v001",
        result=gate_result,
    )

    # Get aggregated stats
    stats = collector.get_stats(world_id="outora_library")
"""

from __future__ import annotations

import json
import threading
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class GateResultRecord:
    """A single gate result record for storage."""

    # Identity
    timestamp: str
    world_id: str
    gate_config_id: str
    run_id: str | None = None

    # Result
    success: bool = False
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # Core metrics
    frames_processed: int = 0
    playtime_seconds: float = 0.0
    stuck_ratio: float = 0.0
    coverage_estimate: float = 0.0
    interaction_rate: float = 0.0

    # Extended metrics
    movement_distance: float = 0.0
    jump_attempts: int = 0
    interaction_attempts: int = 0
    crash_count: int = 0
    nitrogen_timeouts: int = 0

    # Performance metrics
    avg_latency_ms: float = 0.0
    total_retries: int = 0

    # Environment context
    environment_type: str = ""
    seed: int | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GateResultRecord:
        """Create from dictionary."""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class AggregatedStats:
    """Aggregated statistics for a time period."""

    world_id: str | None = None
    gate_config_id: str | None = None
    period_start: str = ""
    period_end: str = ""

    # Counts
    total_runs: int = 0
    passed: int = 0
    failed: int = 0
    warnings_count: int = 0

    # Rates
    pass_rate: float = 0.0
    avg_stuck_ratio: float = 0.0
    avg_coverage: float = 0.0
    avg_interaction_rate: float = 0.0

    # Failure breakdown
    failure_codes: dict[str, int] = field(default_factory=dict)
    warning_codes: dict[str, int] = field(default_factory=dict)

    # Performance
    avg_playtime_seconds: float = 0.0
    avg_latency_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PlayabilityMetricsCollector:
    """
    Collects and aggregates playability gate metrics.

    Stores results in JSONL format for easy streaming and analysis.
    """

    def __init__(
        self,
        storage_path: Path | None = None,
        max_records_in_memory: int = 1000,
    ):
        self.storage_path = storage_path or Path(".cyntra/metrics/playability.jsonl")
        self.max_records_in_memory = max_records_in_memory

        self._records: list[GateResultRecord] = []
        self._lock = threading.Lock()

        # Ensure storage directory exists
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)

    def record_gate_result(
        self,
        world_id: str,
        gate_config_id: str,
        result: Any,  # PlayabilityGateResult
        run_id: str | None = None,
        environment_type: str = "",
        seed: int | None = None,
        nitrogen_metrics: dict[str, Any] | None = None,
    ) -> GateResultRecord:
        """
        Record a gate result.

        Args:
            world_id: World/level identifier
            gate_config_id: Gate configuration used
            result: PlayabilityGateResult from the gate
            run_id: Optional run identifier
            environment_type: Environment type (forest, dungeon, etc)
            seed: Random seed used
            nitrogen_metrics: NitroGen client metrics if available

        Returns:
            The created record
        """
        metrics = result.metrics if hasattr(result, "metrics") else result

        record = GateResultRecord(
            timestamp=datetime.utcnow().isoformat() + "Z",
            world_id=world_id,
            gate_config_id=gate_config_id,
            run_id=run_id,
            success=result.success if hasattr(result, "success") else False,
            failures=result.failures if hasattr(result, "failures") else [],
            warnings=result.warnings if hasattr(result, "warnings") else [],
            frames_processed=getattr(metrics, "frames_processed", 0),
            playtime_seconds=getattr(metrics, "total_playtime_seconds", 0.0),
            stuck_ratio=getattr(metrics, "stuck_ratio", 0.0),
            coverage_estimate=getattr(metrics, "coverage_estimate", 0.0),
            interaction_rate=getattr(metrics, "interaction_rate", 0.0),
            movement_distance=getattr(metrics, "movement_distance", 0.0),
            jump_attempts=getattr(metrics, "jump_attempts", 0),
            interaction_attempts=getattr(metrics, "interaction_attempts", 0),
            crash_count=getattr(metrics, "crash_count", 0),
            nitrogen_timeouts=getattr(metrics, "nitrogen_timeouts", 0),
            environment_type=environment_type,
            seed=seed,
        )

        # Add NitroGen client metrics if provided
        if nitrogen_metrics:
            record.avg_latency_ms = nitrogen_metrics.get("avg_latency_ms", 0.0)
            record.total_retries = nitrogen_metrics.get("total_retries", 0)

        # Store record
        with self._lock:
            self._records.append(record)

            # Write to disk
            self._append_to_storage(record)

            # Trim in-memory cache
            if len(self._records) > self.max_records_in_memory:
                self._records = self._records[-self.max_records_in_memory :]

        # Log the result
        log_method = logger.info if record.success else logger.warning
        log_method(
            "Gate result recorded",
            world_id=world_id,
            gate_config=gate_config_id,
            success=record.success,
            stuck_ratio=f"{record.stuck_ratio:.1%}",
            coverage=f"{record.coverage_estimate:.2f}",
            failures=record.failures,
        )

        return record

    def _append_to_storage(self, record: GateResultRecord) -> None:
        """Append a record to the JSONL storage file."""
        try:
            with open(self.storage_path, "a") as f:
                f.write(json.dumps(record.to_dict()) + "\n")
        except Exception as e:
            logger.error("Failed to write metrics", error=str(e))

    def get_records(
        self,
        world_id: str | None = None,
        gate_config_id: str | None = None,
        since: datetime | None = None,
        limit: int | None = None,
    ) -> list[GateResultRecord]:
        """
        Get historical records with optional filters.

        Args:
            world_id: Filter by world
            gate_config_id: Filter by gate config
            since: Only records after this time
            limit: Maximum records to return

        Returns:
            List of matching records (newest first)
        """
        records = []

        # Read from storage
        if self.storage_path.exists():
            for line in self._read_storage_lines():
                try:
                    data = json.loads(line)
                    record = GateResultRecord.from_dict(data)

                    # Apply filters
                    if world_id and record.world_id != world_id:
                        continue
                    if gate_config_id and record.gate_config_id != gate_config_id:
                        continue
                    if since:
                        record_time = datetime.fromisoformat(record.timestamp.rstrip("Z"))
                        if record_time < since:
                            continue

                    records.append(record)

                except (json.JSONDecodeError, KeyError):
                    continue

        # Sort by timestamp descending (newest first)
        records.sort(key=lambda r: r.timestamp, reverse=True)

        if limit:
            records = records[:limit]

        return records

    def _read_storage_lines(self) -> Iterator[str]:
        """Read lines from storage file."""
        try:
            with open(self.storage_path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        yield line
        except Exception as e:
            logger.error("Failed to read metrics storage", error=str(e))

    def get_stats(
        self,
        world_id: str | None = None,
        gate_config_id: str | None = None,
        period_days: int = 7,
    ) -> AggregatedStats:
        """
        Get aggregated statistics for a time period.

        Args:
            world_id: Filter by world
            gate_config_id: Filter by gate config
            period_days: Number of days to aggregate

        Returns:
            Aggregated statistics
        """
        since = datetime.utcnow() - timedelta(days=period_days)
        records = self.get_records(
            world_id=world_id,
            gate_config_id=gate_config_id,
            since=since,
        )

        if not records:
            return AggregatedStats(
                world_id=world_id,
                gate_config_id=gate_config_id,
                period_start=since.isoformat() + "Z",
                period_end=datetime.utcnow().isoformat() + "Z",
            )

        # Calculate aggregates
        total = len(records)
        passed = sum(1 for r in records if r.success)
        failed = total - passed

        # Failure code breakdown
        failure_codes: dict[str, int] = defaultdict(int)
        warning_codes: dict[str, int] = defaultdict(int)

        for r in records:
            for code in r.failures:
                failure_codes[code] += 1
            for code in r.warnings:
                warning_codes[code] += 1

        # Averages
        avg_stuck = sum(r.stuck_ratio for r in records) / total
        avg_coverage = sum(r.coverage_estimate for r in records) / total
        avg_interaction = sum(r.interaction_rate for r in records) / total
        avg_playtime = sum(r.playtime_seconds for r in records) / total
        avg_latency = sum(r.avg_latency_ms for r in records) / total

        return AggregatedStats(
            world_id=world_id,
            gate_config_id=gate_config_id,
            period_start=since.isoformat() + "Z",
            period_end=datetime.utcnow().isoformat() + "Z",
            total_runs=total,
            passed=passed,
            failed=failed,
            warnings_count=sum(len(r.warnings) for r in records),
            pass_rate=passed / total if total > 0 else 0.0,
            avg_stuck_ratio=avg_stuck,
            avg_coverage=avg_coverage,
            avg_interaction_rate=avg_interaction,
            failure_codes=dict(failure_codes),
            warning_codes=dict(warning_codes),
            avg_playtime_seconds=avg_playtime,
            avg_latency_ms=avg_latency,
        )

    def get_all_stats(self, period_days: int = 7) -> dict[str, AggregatedStats]:
        """Get stats for all world/gate combinations."""
        since = datetime.utcnow() - timedelta(days=period_days)
        records = self.get_records(since=since)

        # Group by world_id
        by_world: dict[str, list[GateResultRecord]] = defaultdict(list)
        for r in records:
            by_world[r.world_id].append(r)

        stats = {}
        for world_id, world_records in by_world.items():
            stats[world_id] = self._aggregate_records(world_records, world_id, None, since)

        return stats

    def _aggregate_records(
        self,
        records: list[GateResultRecord],
        world_id: str | None,
        gate_config_id: str | None,
        since: datetime,
    ) -> AggregatedStats:
        """Aggregate a list of records."""
        if not records:
            return AggregatedStats(world_id=world_id, gate_config_id=gate_config_id)

        total = len(records)
        passed = sum(1 for r in records if r.success)

        failure_codes: dict[str, int] = defaultdict(int)
        warning_codes: dict[str, int] = defaultdict(int)

        for r in records:
            for code in r.failures:
                failure_codes[code] += 1
            for code in r.warnings:
                warning_codes[code] += 1

        return AggregatedStats(
            world_id=world_id,
            gate_config_id=gate_config_id,
            period_start=since.isoformat() + "Z",
            period_end=datetime.utcnow().isoformat() + "Z",
            total_runs=total,
            passed=passed,
            failed=total - passed,
            warnings_count=sum(len(r.warnings) for r in records),
            pass_rate=passed / total if total > 0 else 0.0,
            avg_stuck_ratio=sum(r.stuck_ratio for r in records) / total,
            avg_coverage=sum(r.coverage_estimate for r in records) / total,
            avg_interaction_rate=sum(r.interaction_rate for r in records) / total,
            failure_codes=dict(failure_codes),
            warning_codes=dict(warning_codes),
            avg_playtime_seconds=sum(r.playtime_seconds for r in records) / total,
            avg_latency_ms=sum(r.avg_latency_ms for r in records) / total,
        )

    def print_summary(self, period_days: int = 7) -> None:
        """Print a human-readable summary of gate stats."""
        all_stats = self.get_all_stats(period_days=period_days)

        if not all_stats:
            print("No playability gate data found.")
            return

        print(f"\n{'=' * 70}")
        print(f"PLAYABILITY GATE SUMMARY (Last {period_days} days)")
        print(f"{'=' * 70}")

        for world_id, stats in sorted(all_stats.items()):
            status = "✓" if stats.pass_rate >= 0.8 else "⚠" if stats.pass_rate >= 0.5 else "✗"

            print(f"\n{status} {world_id}")
            print(f"  Runs: {stats.total_runs} | Pass Rate: {stats.pass_rate:.1%}")
            print(
                f"  Avg Stuck: {stats.avg_stuck_ratio:.1%} | Avg Coverage: {stats.avg_coverage:.2f}"
            )

            if stats.failure_codes:
                top_failures = sorted(
                    stats.failure_codes.items(), key=lambda x: x[1], reverse=True
                )[:3]
                print(f"  Top Failures: {', '.join(f'{k}({v})' for k, v in top_failures)}")

        print(f"\n{'=' * 70}")


# Global collector instance
_collector: PlayabilityMetricsCollector | None = None


def get_collector() -> PlayabilityMetricsCollector:
    """Get the global metrics collector."""
    global _collector
    if _collector is None:
        _collector = PlayabilityMetricsCollector()
    return _collector


def record_gate_result(
    world_id: str,
    gate_config_id: str,
    result: Any,
    **kwargs: Any,
) -> GateResultRecord:
    """Convenience function to record a gate result."""
    return get_collector().record_gate_result(
        world_id=world_id,
        gate_config_id=gate_config_id,
        result=result,
        **kwargs,
    )
