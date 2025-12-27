"""Tests for prompt genome utilities."""

from __future__ import annotations

from cyntra.evolve.genome import create_genome, genome_id_from_data


def test_genome_id_deterministic() -> None:
    genome = create_genome(
        domain="code",
        toolchain="codex",
        system_prompt="Test prompt",
        instruction_blocks=["A", "B"],
        tool_use_rules=["Rule"],
        sampling={"temperature": 0.2, "top_p": 0.9},
        metadata={"note": "x"},
    )

    genome_id = genome["genome_id"]
    regenerated = genome_id_from_data(genome)
    assert genome_id == regenerated
