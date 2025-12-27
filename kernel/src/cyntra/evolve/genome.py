"""
Genome storage utilities for prompt evolution.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def genome_id_from_data(data: dict[str, Any]) -> str:
    scrubbed = dict(data)
    scrubbed.pop("genome_id", None)
    scrubbed.pop("created_at", None)
    canonical = yaml.safe_dump(scrubbed, sort_keys=True)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"gen_{digest[:12]}"


def create_genome(
    *,
    domain: str,
    toolchain: str,
    system_prompt: str | None,
    instruction_blocks: list[str] | None = None,
    tool_use_rules: list[str] | None = None,
    sampling: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    parent_id: str | None = None,
) -> dict[str, Any]:
    genome = {
        "schema_version": "cyntra.genome.v1",
        "genome_id": "pending",
        "domain": domain,
        "toolchain": toolchain,
        "created_at": _utc_now(),
        "parent_id": parent_id,
        "system_prompt": system_prompt or "",
        "instruction_blocks": instruction_blocks or [],
        "tool_use_rules": tool_use_rules or [],
        "sampling": sampling or {"temperature": None, "top_p": None},
        "metadata": metadata or {},
    }
    genome["genome_id"] = genome_id_from_data(genome)
    return genome


def save_genome(genome: dict[str, Any], prompts_root: Path) -> Path:
    domain = genome.get("domain") or "unknown"
    toolchain = genome.get("toolchain") or "unknown"
    genome_id = genome.get("genome_id") or genome_id_from_data(genome)

    path = prompts_root / domain / toolchain / f"{genome_id}.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(genome, sort_keys=False))
    return path


def load_genome(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text())
