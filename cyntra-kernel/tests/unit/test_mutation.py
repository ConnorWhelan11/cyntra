"""Tests for genome mutation operators."""

from __future__ import annotations

import random

from cyntra.evolve.genome import create_genome
from cyntra.evolve.mutation import mutate_genome


def test_mutate_genome_is_deterministic_and_links_parent() -> None:
    parent = create_genome(
        domain="code",
        toolchain="codex",
        system_prompt="Base system prompt",
        instruction_blocks=["One"],
        tool_use_rules=["Rule A"],
        sampling={"temperature": 0.2, "top_p": 0.9},
        metadata={"note": "base"},
    )

    rng1 = random.Random(123)
    child1 = mutate_genome(parent, rng1)

    rng2 = random.Random(123)
    child2 = mutate_genome(parent, rng2)

    assert child1["genome_id"] == child2["genome_id"]
    assert child1["genome_id"] != parent["genome_id"]
    assert child1["parent_id"] == parent["genome_id"]

    sampling = child1["sampling"]
    assert 0.0 <= float(sampling["temperature"]) <= 1.0
    assert 0.0 <= float(sampling["top_p"]) <= 1.0

