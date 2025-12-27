"""
Toy bench for exercising the evolve loop without running the kernel.

This is intentionally synthetic: it scores genomes based on sampling settings
to provide a fast, deterministic target for development.
"""

from __future__ import annotations

from typing import Any


def _get_float(value: object, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def evaluate_genome(genome: dict[str, Any]) -> dict[str, Any]:
    sampling = genome.get("sampling") if isinstance(genome.get("sampling"), dict) else {}
    temp = _get_float((sampling or {}).get("temperature"), 0.2)
    top_p = _get_float((sampling or {}).get("top_p"), 0.9)

    # Prefer temperature close to 0.2 and top_p close to 0.9.
    quality = 1.0 - abs(temp - 0.2)
    cost = 1.0 + abs(top_p - 0.9)
    return {"quality": round(quality, 6), "cost": round(cost, 6)}


BENCH = {
    "name": "toy",
    "domain": "code",
    "toolchain": "codex",
    "system_prompt": "Toy bench (no kernel).",
    "instruction_blocks": ["Prefer minimal diffs."],
    "tool_use_rules": ["Use rg for search."],
    "sampling": {"temperature": 0.2, "top_p": 0.9},
    "objectives": {"quality": "max", "cost": "min"},
    "evaluate_genome": evaluate_genome,
}
