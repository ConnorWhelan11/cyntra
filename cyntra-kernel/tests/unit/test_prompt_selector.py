"""Tests for prompt genome selector."""

from __future__ import annotations

import json
from pathlib import Path

from cyntra.prompts.selector import select_prompt_genome_id


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("schema_version: cyntra.genome.v1\n")


def test_select_prompt_genome_id_scores_frontier_when_objectives_present(tmp_path: Path) -> None:
    # Create prompt genomes for this domain/toolchain.
    _touch(tmp_path / "prompts" / "code" / "codex" / "gen_a.yaml")
    _touch(tmp_path / "prompts" / "code" / "codex" / "gen_b.yaml")
    _touch(tmp_path / "prompts" / "code" / "codex" / "gen_c.yaml")

    frontier = {
        "schema_version": "cyntra.frontier.v1",
        "objectives": {"quality": "max", "cost": "min"},
        "items": [
            {"genome_id": "gen_a", "quality": 0.9, "cost": 1.5},
            {"genome_id": "gen_b", "quality": 0.85, "cost": 1.0},
            {"genome_id": "gen_c", "quality": 0.7, "cost": 0.8},
        ],
    }
    (tmp_path / "prompts" / "frontier.json").write_text(json.dumps(frontier))

    selected = select_prompt_genome_id(repo_root=tmp_path, domain="code", toolchain="codex")
    assert selected == "gen_b"


def test_select_prompt_genome_id_falls_back_to_first_existing(tmp_path: Path) -> None:
    _touch(tmp_path / "prompts" / "code" / "codex" / "gen_x.yaml")
    _touch(tmp_path / "prompts" / "code" / "codex" / "gen_y.yaml")

    # No objectives, and items ordered.
    frontier = {"items": ["gen_y", "gen_x"]}
    (tmp_path / "prompts" / "frontier.json").write_text(json.dumps(frontier))

    selected = select_prompt_genome_id(repo_root=tmp_path, domain="code", toolchain="codex")
    assert selected == "gen_y"

