"""
Prompt genome runtime helpers.

Prompt genomes are stored in-repo under:

    prompts/<domain>/<toolchain>/<genome_id>.yaml
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import structlog
import yaml

logger = structlog.get_logger()


def detect_domain(job_type: str) -> str:
    if job_type.startswith("fab-world") or job_type.startswith("fab.world"):
        return "fab_world"
    if job_type.startswith("fab"):
        return "fab_asset"
    return "code"


def _as_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float)) and str(item).strip()]


def _as_str(value: Any) -> str:
    return str(value) if isinstance(value, (str, int, float)) else ""


def load_prompt_genome(
    *,
    prompts_root: Path,
    domain: str,
    toolchain: str,
    genome_id: str,
) -> dict[str, Any] | None:
    path = prompts_root / domain / toolchain / f"{genome_id}.yaml"
    if not path.exists():
        logger.warning(
            "Prompt genome not found",
            path=str(path),
            genome_id=genome_id,
            domain=domain,
            toolchain=toolchain,
        )
        return None
    try:
        data = yaml.safe_load(path.read_text())
    except Exception as exc:  # noqa: BLE001 - best-effort load
        logger.warning("Failed to load prompt genome", path=str(path), error=str(exc))
        return None
    if not isinstance(data, dict):
        logger.warning("Invalid prompt genome format", path=str(path))
        return None
    return data


def render_prompt_genome_preamble(
    *,
    genome: dict[str, Any],
    genome_id: str,
    sampling: dict[str, Any] | None,
) -> str:
    system_prompt = _as_str(genome.get("system_prompt"))
    instruction_blocks = _as_list(genome.get("instruction_blocks"))
    tool_use_rules = _as_list(genome.get("tool_use_rules"))

    lines: list[str] = ["# Prompt Genome", f"- genome_id: {genome_id}"]

    if sampling:
        temperature = sampling.get("temperature")
        top_p = sampling.get("top_p")
        if isinstance(temperature, (int, float)):
            lines.append(f"- temperature: {float(temperature):.3f}".rstrip("0").rstrip("."))
        else:
            lines.append("- temperature: null")
        if isinstance(top_p, (int, float)):
            lines.append(f"- top_p: {float(top_p):.3f}".rstrip("0").rstrip("."))
        else:
            lines.append("- top_p: null")

    if system_prompt.strip():
        lines.extend(["", "## System Prompt", system_prompt.strip()])

    if instruction_blocks:
        lines.append("")
        lines.append("## Instruction Blocks")
        for block in instruction_blocks:
            lines.append(f"- {block}")

    if tool_use_rules:
        lines.append("")
        lines.append("## Tool Use Rules")
        for rule in tool_use_rules:
            lines.append(f"- {rule}")

    return "\n".join(lines).strip() + "\n"

