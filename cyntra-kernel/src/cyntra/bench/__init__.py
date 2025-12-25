"""
End-to-end bench harness for Cyntra.

Benches are small task suites that run through `cyntra run` and emit:
- workcell archives (manifest/proof/telemetry/rollout)
- a summarized bench report JSON
"""

from cyntra.bench.runner import (
    prepare_bench_config,
    write_bench_beads,
    write_bench_report,
)

__all__ = [
    "prepare_bench_config",
    "write_bench_beads",
    "write_bench_report",
]

