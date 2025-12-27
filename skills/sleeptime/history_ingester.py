"""
History Ingester - Scan recent runs and yield structured summaries.

Sleeptime skill that processes .cyntra/runs/ to extract run metadata,
tool sequences, outcomes, and error signatures for downstream pattern analysis.
"""

from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Literal


@dataclass
class ToolCall:
    """Single tool invocation from a run."""

    name: str
    timestamp: str
    duration_ms: int
    success: bool
    error: str | None = None


@dataclass
class RunSummary:
    """Structured summary of a single run."""

    run_id: str
    outcome: Literal["success", "failure", "timeout", "cancelled"]
    started_at: str
    duration_ms: int
    toolchain: str
    genome_id: str | None
    tool_sequence: list[str]
    tool_calls: list[ToolCall]
    error_signature: str | None
    files_modified: list[str]
    gate_results: dict[str, bool]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class WatermarkState:
    """Tracks processing progress."""

    last_processed_timestamp: str
    last_processed_run_id: str
    total_processed: int


class HistoryIngester:
    """Scan and summarize recent runs for sleeptime consolidation."""

    def __init__(
        self,
        runs_dir: Path | str = ".cyntra/runs",
        watermark_path: Path | str = ".cyntra/sleeptime/ingester_watermark.json",
    ):
        self.runs_dir = Path(runs_dir)
        self.watermark_path = Path(watermark_path)

    def load_watermark(self) -> WatermarkState | None:
        """Load last processing watermark."""
        if not self.watermark_path.exists():
            return None
        try:
            data = json.loads(self.watermark_path.read_text())
            return WatermarkState(**data)
        except Exception:
            return None

    def save_watermark(self, state: WatermarkState) -> None:
        """Persist watermark state."""
        self.watermark_path.parent.mkdir(parents=True, exist_ok=True)
        self.watermark_path.write_text(json.dumps(asdict(state), indent=2))

    def discover_runs(
        self,
        since_timestamp: str | None = None,
        max_runs: int = 20,
    ) -> list[Path]:
        """Find run directories newer than watermark."""
        if not self.runs_dir.exists():
            return []

        runs = []
        for run_dir in self.runs_dir.iterdir():
            if not run_dir.is_dir():
                continue
            manifest = run_dir / "manifest.json"
            if not manifest.exists():
                continue

            try:
                meta = json.loads(manifest.read_text())
                started = meta.get("started_at", "")
                if since_timestamp and started <= since_timestamp:
                    continue
                runs.append((started, run_dir))
            except Exception:
                continue

        # Sort by start time, take most recent
        runs.sort(key=lambda x: x[0], reverse=True)
        return [r[1] for r in runs[:max_runs]]

    def extract_tool_sequence(self, run_dir: Path) -> tuple[list[str], list[ToolCall]]:
        """Extract ordered tool calls from run logs."""
        tools_log = run_dir / "tools.jsonl"
        sequence = []
        calls = []

        if tools_log.exists():
            for line in tools_log.read_text().splitlines():
                try:
                    entry = json.loads(line)
                    tool_name = entry.get("tool", "unknown")
                    sequence.append(tool_name)
                    calls.append(
                        ToolCall(
                            name=tool_name,
                            timestamp=entry.get("timestamp", ""),
                            duration_ms=entry.get("duration_ms", 0),
                            success=entry.get("success", True),
                            error=entry.get("error"),
                        )
                    )
                except Exception:
                    continue

        return sequence, calls

    def extract_error_signature(self, run_dir: Path) -> str | None:
        """Generate canonical error signature for clustering."""
        error_log = run_dir / "error.txt"
        if not error_log.exists():
            return None

        error_text = error_log.read_text()[:2000]  # Truncate

        # Normalize paths, line numbers for clustering
        import re

        normalized = re.sub(r"/[\w/]+/", "<path>/", error_text)
        normalized = re.sub(r":\d+:", ":<line>:", normalized)
        normalized = re.sub(r"0x[0-9a-f]+", "<addr>", normalized)

        # Hash for dedup
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def extract_files_modified(self, run_dir: Path) -> list[str]:
        """Get list of files modified during run."""
        diff_file = run_dir / "changes.patch"
        if not diff_file.exists():
            return []

        files = set()
        for line in diff_file.read_text().splitlines():
            if line.startswith("+++ b/") or line.startswith("--- a/"):
                path = line[6:]
                if path != "/dev/null":
                    files.add(path)
        return sorted(files)

    def extract_gate_results(self, run_dir: Path) -> dict[str, bool]:
        """Get quality gate pass/fail status."""
        gates_file = run_dir / "gates.json"
        if not gates_file.exists():
            return {}
        try:
            return json.loads(gates_file.read_text())
        except Exception:
            return {}

    def summarize_run(self, run_dir: Path) -> RunSummary | None:
        """Generate structured summary for a single run."""
        manifest = run_dir / "manifest.json"
        if not manifest.exists():
            return None

        try:
            meta = json.loads(manifest.read_text())
        except Exception:
            return None

        tool_sequence, tool_calls = self.extract_tool_sequence(run_dir)

        return RunSummary(
            run_id=run_dir.name,
            outcome=meta.get("outcome", "unknown"),
            started_at=meta.get("started_at", ""),
            duration_ms=meta.get("duration_ms", 0),
            toolchain=meta.get("toolchain", "unknown"),
            genome_id=meta.get("genome_id"),
            tool_sequence=tool_sequence,
            tool_calls=tool_calls,
            error_signature=self.extract_error_signature(run_dir),
            files_modified=self.extract_files_modified(run_dir),
            gate_results=self.extract_gate_results(run_dir),
        )

    def ingest(
        self,
        since_timestamp: str | None = None,
        include_only: Literal["all", "failures", "successes"] = "all",
        max_runs: int = 20,
    ) -> dict:
        """
        Main entry point - ingest recent runs and return summaries.

        Returns:
            {
                "run_summaries": [...],
                "unprocessed_count": int,
                "watermark": str,
            }
        """
        # Use stored watermark if no explicit timestamp
        if since_timestamp is None:
            watermark = self.load_watermark()
            if watermark:
                since_timestamp = watermark.last_processed_timestamp

        run_dirs = self.discover_runs(
            since_timestamp, max_runs * 2
        )  # Over-fetch for filtering

        summaries = []
        for run_dir in run_dirs:
            summary = self.summarize_run(run_dir)
            if summary is None:
                continue

            # Apply filter
            if include_only == "failures" and summary.outcome == "success":
                continue
            if include_only == "successes" and summary.outcome != "success":
                continue

            summaries.append(summary)
            if len(summaries) >= max_runs:
                break

        # Update watermark
        new_watermark = datetime.now(timezone.utc).isoformat()
        if summaries:
            self.save_watermark(
                WatermarkState(
                    last_processed_timestamp=new_watermark,
                    last_processed_run_id=summaries[0].run_id,
                    total_processed=(
                        self.load_watermark() or WatermarkState("", "", 0)
                    ).total_processed
                    + len(summaries),
                )
            )

        return {
            "run_summaries": [s.to_dict() for s in summaries],
            "unprocessed_count": len(run_dirs) - len(summaries),
            "watermark": new_watermark,
        }


# CLI entry point
if __name__ == "__main__":
    import sys

    ingester = HistoryIngester()
    result = ingester.ingest(
        include_only=sys.argv[1] if len(sys.argv) > 1 else "all",
        max_runs=int(sys.argv[2]) if len(sys.argv) > 2 else 20,
    )
    print(json.dumps(result, indent=2))
