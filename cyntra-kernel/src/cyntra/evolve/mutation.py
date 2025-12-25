"""
Mutation operators for prompt genomes.

This module intentionally keeps mutations lightweight and deterministic under a
fixed RNG seed. Higher-level "reflection"/LLM-driven prompt edits can be layered
on top later.
"""

from __future__ import annotations

from copy import deepcopy
import random
from typing import Any

from cyntra.evolve.genome import genome_id_from_data


_INSTRUCTION_POOL: dict[str, list[str]] = {
    "code": [
        "Prefer minimal diffs; fix root cause.",
        "Run the narrowest test first, then broaden.",
        "When uncertain, ask a clarifying question before large changes.",
        "Keep changes deterministic and repo-local; avoid network calls unless required.",
        "Surface tradeoffs explicitly (time vs. risk vs. correctness).",
    ],
    "fab_asset": [
        "Keep outputs deterministic (fixed seeds) unless instructed otherwise.",
        "Prefer CPU-only Blender rendering; avoid GPU-specific features.",
        "Preserve directory conventions under `.cyntra/` for runtime outputs.",
    ],
    "fab_world": [
        "Keep outputs deterministic (fixed seeds) unless instructed otherwise.",
        "Prefer CPU-only Blender rendering; avoid GPU-specific features.",
        "Preserve directory conventions under `.cyntra/` for runtime outputs.",
    ],
}

_SYSTEM_APPEND_POOL: dict[str, list[str]] = {
    "code": [
        "Be concise and information-dense.",
        "Avoid unrelated refactors; focus only on the requested change.",
        "Always validate changes with the repo's standard gates when possible.",
    ],
    "fab_asset": [
        "Maintain determinism and reproducibility across renders.",
        "Prefer pipeline-compatible formats and stable IDs.",
    ],
    "fab_world": [
        "Maintain determinism and reproducibility across renders.",
        "Prefer pipeline-compatible formats and stable IDs.",
    ],
}

_TOOL_RULE_POOL: list[str] = [
    "Use `rg` for search; prefer repo-local commands.",
    "Do not modify forbidden paths.",
    "Avoid network access unless explicitly requested.",
]


def _clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def mutate_genome(
    parent: dict[str, Any],
    rng: random.Random,
    *,
    mutation_strength: float = 1.0,
) -> dict[str, Any]:
    """
    Produce a mutated child genome from a parent genome.

    Mutations are applied stochastically using the provided RNG. The returned
    genome will have an updated `genome_id` and `parent_id` set to the parent.
    """
    genome = deepcopy(parent)

    parent_id = str(parent.get("genome_id") or parent.get("parent_id") or "")
    genome["parent_id"] = parent_id or None

    domain = str(genome.get("domain") or "code")

    # --- Sampling mutations -------------------------------------------------
    sampling = genome.get("sampling")
    if not isinstance(sampling, dict):
        sampling = {}

    if rng.random() < 0.75 * mutation_strength:
        temp = sampling.get("temperature", 0.2)
        temp_val = 0.2 if temp is None else float(temp)
        step = rng.choice([-0.1, 0.1]) * mutation_strength
        sampling["temperature"] = round(_clamp01(temp_val + step), 3)

    if rng.random() < 0.5 * mutation_strength:
        top_p = sampling.get("top_p", 0.9)
        top_p_val = 0.9 if top_p is None else float(top_p)
        step = rng.choice([-0.05, 0.05]) * mutation_strength
        sampling["top_p"] = round(_clamp01(top_p_val + step), 3)

    genome["sampling"] = sampling

    # --- Instruction block mutations ---------------------------------------
    blocks = genome.get("instruction_blocks")
    if not isinstance(blocks, list):
        blocks = []
    blocks = [str(b) for b in blocks if isinstance(b, str) and b.strip()]

    instruction_pool = _INSTRUCTION_POOL.get(domain, _INSTRUCTION_POOL["code"])
    if rng.random() < 0.8 * mutation_strength:
        op = rng.choice(["add", "drop", "swap", "noop"])
        if op == "add":
            candidate = rng.choice(instruction_pool)
            if candidate not in blocks:
                blocks.append(candidate)
        elif op == "drop" and blocks:
            blocks.pop(rng.randrange(len(blocks)))
        elif op == "swap" and len(blocks) >= 2:
            i, j = rng.sample(range(len(blocks)), 2)
            blocks[i], blocks[j] = blocks[j], blocks[i]
    genome["instruction_blocks"] = blocks

    # --- Tool-use rule mutations -------------------------------------------
    tool_rules = genome.get("tool_use_rules")
    if not isinstance(tool_rules, list):
        tool_rules = []
    tool_rules = [str(r) for r in tool_rules if isinstance(r, str) and r.strip()]

    if rng.random() < 0.35 * mutation_strength:
        candidate = rng.choice(_TOOL_RULE_POOL)
        if candidate not in tool_rules:
            tool_rules.append(candidate)
    if rng.random() < 0.15 * mutation_strength and tool_rules:
        tool_rules.pop(rng.randrange(len(tool_rules)))
    genome["tool_use_rules"] = tool_rules

    # --- System prompt mutations -------------------------------------------
    system_prompt = genome.get("system_prompt")
    if system_prompt is None:
        system_prompt = ""
    system_prompt = str(system_prompt)

    append_pool = _SYSTEM_APPEND_POOL.get(domain, _SYSTEM_APPEND_POOL["code"])
    if rng.random() < 0.4 * mutation_strength:
        addition = rng.choice(append_pool)
        if addition not in system_prompt:
            system_prompt = (system_prompt.strip() + "\n\n" + addition).strip()
    genome["system_prompt"] = system_prompt

    # Update genome id deterministically from content.
    genome["genome_id"] = genome_id_from_data(genome)
    return genome
