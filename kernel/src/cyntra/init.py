"""
Cyntra Initialization - Sets up Cyntra in a repository.

Creates:
- .cyntra/ directory structure
- Default config.yaml
"""

from __future__ import annotations

from pathlib import Path

import yaml
from rich.console import Console

from cyntra.kernel.init import _create_default_config

console = Console()


def initialize_cyntra(config_path: Path) -> None:
    """
    Initialize Cyntra in the current repository.

    If `config_path` is a file path, it is used directly.
    Otherwise, `.cyntra/config.yaml` is created under `config_path`.
    """
    if config_path.name == "config.yaml":
        cyntra_dir = config_path.parent
    else:
        cyntra_dir = config_path / ".cyntra"
        config_path = cyntra_dir / "config.yaml"

    cyntra_dir.mkdir(parents=True, exist_ok=True)
    (cyntra_dir / "logs").mkdir(exist_ok=True)
    (cyntra_dir / "archives").mkdir(exist_ok=True)
    (cyntra_dir / "state").mkdir(exist_ok=True)
    (cyntra_dir / "runs").mkdir(exist_ok=True)
    (cyntra_dir / "dynamics").mkdir(exist_ok=True)

    repo_root = cyntra_dir.parent
    (repo_root / ".workcells").mkdir(exist_ok=True)

    if not config_path.exists():
        default_config = _create_default_config()
        with open(config_path, "w") as f:
            yaml.dump(default_config, f, default_flow_style=False, sort_keys=False)
        console.print(f"  Created [cyan]{config_path}[/cyan]")

    console.print(f"\n[dim]Config:[/dim] {config_path}")
    console.print("[dim]Run:[/dim] cyntra run --once")
