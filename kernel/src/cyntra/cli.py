"""
Cyntra CLI - Umbrella entry point (Phase 1).

For now this mirrors the kernel CLI (run/status/workcells/etc) and defaults to `.cyntra/config.yaml`.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import click
from rich.console import Console
from rich.table import Table

console = Console()


@click.group()
@click.version_option(version="0.1.0")
@click.option("--config", "-c", type=Path, help="Path to config file")
@click.pass_context
def main(ctx: click.Context, config: Path | None) -> None:
    """Cyntra - Local-first autonomous kernel + fab system."""
    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config or Path(".cyntra/config.yaml")


@main.command()
@click.option("--config", type=Path, help="Path to config file (default: .cyntra/config.yaml)")
@click.pass_context
def init(ctx: click.Context, config: Path | None) -> None:
    """Initialize Cyntra in repo."""
    from cyntra.init import initialize_cyntra

    config_path = config or ctx.obj["config_path"]
    initialize_cyntra(config_path)
    console.print("[green]✓[/green] Cyntra initialized")


@main.command()
@click.option("--once", is_flag=True, help="Process one cycle and exit")
@click.option("--issue", type=str, help="Run specific issue only")
@click.option("--universe", type=str, help="Universe context (universes/<id>)")
@click.option("--max-concurrent", type=int, help="Override max concurrent workcells")
@click.option("--speculate", is_flag=True, help="Force speculate mode")
@click.option("--dry-run", is_flag=True, help="Show what would happen without executing")
@click.option("--watch", is_flag=True, help="Continuous mode (re-run on Beads changes)")
@click.pass_context
def run(
    ctx: click.Context,
    once: bool,
    issue: str | None,
    universe: str | None,
    max_concurrent: int | None,
    speculate: bool,
    dry_run: bool,
    watch: bool,
) -> None:
    """Run the kernel loop."""
    from cyntra.kernel.runner import KernelRunner

    runner = KernelRunner(
        config_path=ctx.obj["config_path"],
        single_cycle=once,
        target_issue=issue,
        universe_id=universe,
        max_concurrent=max_concurrent,
        force_speculate=speculate,
        dry_run=dry_run,
        watch_mode=watch,
    )
    runner.run()


@main.command()
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.option("--verbose", "-v", is_flag=True, help="Include workcell details")
@click.pass_context
def status(ctx: click.Context, as_json: bool, verbose: bool) -> None:
    """Show kernel status."""
    from cyntra.kernel.status import show_status

    show_status(ctx.obj["config_path"], json_output=as_json, verbose=verbose)


@main.command()
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.option("--all", "show_all", is_flag=True, help="Include completed/archived")
@click.pass_context
def workcells(ctx: click.Context, as_json: bool, show_all: bool) -> None:
    """List active workcells."""
    from cyntra.workcell.list import list_workcells

    list_workcells(ctx.obj["config_path"], json_output=as_json, include_archived=show_all)


@main.command()
@click.option("--run", "run_id", type=str, help="Specific run")
@click.option("--issue", type=str, help="Specific issue")
@click.option("--limit", type=int, default=50, help="Last N events")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def history(
    ctx: click.Context,
    run_id: str | None,
    issue: str | None,
    limit: int,
    as_json: bool,
) -> None:
    """Show run history."""
    from cyntra.observability.history import show_history

    show_history(
        ctx.obj["config_path"],
        run_id=run_id,
        issue_id=issue,
        limit=limit,
        json_output=as_json,
    )


@main.command()
@click.option("--cost", is_flag=True, help="Token/cost breakdown")
@click.option("--success-rate", is_flag=True, help="Per-toolchain success rates")
@click.option("--time", "timing", is_flag=True, help="Timing analysis")
@click.pass_context
def stats(ctx: click.Context, cost: bool, success_rate: bool, timing: bool) -> None:
    """Show statistics."""
    from cyntra.observability.stats import show_stats

    show_stats(
        ctx.obj["config_path"],
        show_cost=cost,
        show_success_rate=success_rate,
        show_timing=timing,
    )


@main.group()
def strategy() -> None:
    """Strategy telemetry (profiles, distributions, optimal patterns)."""
    pass


@strategy.command(name="ls")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
def strategy_ls(as_json: bool) -> None:
    """List available strategy dimensions for the default rubric."""
    from cyntra.strategy.rubric import CYNTRA_V1_RUBRIC

    dims = [
        {
            "id": d.id,
            "name": d.name,
            "pattern_a": d.pattern_a,
            "pattern_b": d.pattern_b,
            "source": d.source,
        }
        for d in CYNTRA_V1_RUBRIC
    ]

    if as_json:
        console.print(json.dumps({"rubric": CYNTRA_V1_RUBRIC.version, "dimensions": dims}, indent=2))
        return

    table = Table(title=f"Strategy Dimensions ({CYNTRA_V1_RUBRIC.version})")
    table.add_column("id", style="cyan")
    table.add_column("name")
    table.add_column("patterns", style="dim")
    table.add_column("source", style="dim")

    for d in dims:
        table.add_row(
            d["id"],
            d["name"],
            f'{d["pattern_a"]} / {d["pattern_b"]}',
            d["source"],
        )

    console.print(table)


@strategy.command(name="optimal")
@click.option("--toolchain", type=str, default=None, help="Filter by toolchain")
@click.option("--outcome", type=str, default="passed", show_default=True, help="Outcome filter")
@click.option(
    "--min-confidence",
    type=float,
    default=0.5,
    show_default=True,
    help="Minimum dimension confidence",
)
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def strategy_optimal(
    ctx: click.Context,
    toolchain: str | None,
    outcome: str,
    min_confidence: float,
    as_json: bool,
) -> None:
    """Show dataset-wide optimal patterns (most common among successful runs)."""
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.strategy.rubric import CYNTRA_V1_RUBRIC

    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"
    if not db_path.exists():
        console.print("[dim]No dynamics DB found; run the kernel to collect profiles.[/dim]")
        return

    db = TransitionDB(db_path)
    try:
        optimal = db.get_optimal_strategy_for(
            toolchain=toolchain,
            outcome=outcome,
            min_confidence=min_confidence,
        )
        payload = {
            "rubric_version": CYNTRA_V1_RUBRIC.version,
            "toolchain": toolchain,
            "outcome": outcome,
            "min_confidence": min_confidence,
            "optimal_patterns": optimal,
        }

        if as_json:
            console.print(json.dumps(payload, indent=2, sort_keys=True))
            return

        table = Table(title="Optimal Strategy Patterns")
        table.add_column("dimension_id", style="cyan")
        table.add_column("pattern", style="green")
        table.add_column("name")
        for dim in CYNTRA_V1_RUBRIC:
            pattern = optimal.get(dim.id) or "-"
            table.add_row(dim.id, pattern, dim.name)
        console.print(table)
    finally:
        db.close()


@strategy.command(name="dist")
@click.argument("dimension_id", type=str)
@click.option("--toolchain", type=str, default=None, help="Filter by toolchain")
@click.option("--outcome", type=str, default=None, help="Outcome filter")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def strategy_dist(
    ctx: click.Context,
    dimension_id: str,
    toolchain: str | None,
    outcome: str | None,
    as_json: bool,
) -> None:
    """Show distribution of pattern values for a given dimension."""
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"
    if not db_path.exists():
        console.print("[dim]No dynamics DB found; run the kernel to collect profiles.[/dim]")
        return

    db = TransitionDB(db_path)
    try:
        dist = db.get_dimension_distribution(
            dimension_id=dimension_id,
            toolchain=toolchain,
            outcome=outcome,
        )
        payload = {
            "dimension_id": dimension_id,
            "toolchain": toolchain,
            "outcome": outcome,
            "distribution": dist,
        }

        if as_json:
            console.print(json.dumps(payload, indent=2, sort_keys=True))
            return

        table = Table(title=f"Strategy Distribution: {dimension_id}")
        table.add_column("pattern", style="cyan")
        table.add_column("count", justify="right")
        for pattern, count in sorted(dist.items(), key=lambda kv: (-kv[1], kv[0])):
            table.add_row(pattern, str(count))
        console.print(table)
    finally:
        db.close()

@main.group()
def universe() -> None:
    """Universe tooling (registry + policies + indices)."""
    pass


@universe.command(name="ls")
@click.pass_context
def universe_ls(ctx: click.Context) -> None:
    """List available universes in `universes/*/universe.yaml`."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import list_universe_ids

    config = KernelConfig.load(ctx.obj["config_path"])
    universe_ids = list_universe_ids(config.repo_root)

    if not universe_ids:
        console.print("[yellow]No universes found[/yellow]")
        return

    table = Table(title="Universes")
    table.add_column("universe_id", style="cyan")
    table.add_column("path", style="dim")

    for universe_id in universe_ids:
        table.add_row(universe_id, str((config.repo_root / "universes" / universe_id).as_posix()))

    console.print(table)


@universe.command(name="validate")
@click.argument("universe_id", type=str)
@click.pass_context
def universe_validate(ctx: click.Context, universe_id: str) -> None:
    """Validate universe config and referenced worlds."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        load_universe(universe_id, repo_root=config.repo_root, validate_worlds=True)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc
    console.print(f"[green]✓[/green] Universe `{universe_id}` is valid")


@universe.command(name="status")
@click.argument("universe_id", type=str)
@click.pass_context
def universe_status(ctx: click.Context, universe_id: str) -> None:
    """Show a universe summary (worlds + defaults + policies)."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        universe_cfg = load_universe(universe_id, repo_root=config.repo_root, validate_worlds=False)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    defaults = universe_cfg.defaults
    policies = universe_cfg.policies

    header = Table.grid(padding=(0, 1))
    header.add_column(style="cyan", justify="right")
    header.add_column()
    header.add_row("universe_id", universe_cfg.universe_id)
    header.add_row("name", universe_cfg.name or "-")
    header.add_row("defaults.swarm_id", str(defaults.get("swarm_id") or "-"))
    header.add_row("defaults.objective_id", str(defaults.get("objective_id") or "-"))
    header.add_row(
        "policies.determinism", json.dumps(policies.get("determinism") or {}, sort_keys=True)
    )
    header.add_row("policies.budgets", json.dumps(policies.get("budgets") or {}, sort_keys=True))

    worlds_table = Table(title="Worlds")
    worlds_table.add_column("world_id", style="cyan")
    worlds_table.add_column("kind")
    worlds_table.add_column("enabled")
    worlds_table.add_column("path", style="dim")

    for world in universe_cfg.worlds:
        enabled = "yes" if world.enabled else "no"
        worlds_table.add_row(world.world_id, world.world_kind, enabled, world.path)

    console.print(header)
    console.print()
    console.print(worlds_table)


@universe.command(name="init")
@click.argument("universe_id", type=str)
@click.option("--template", type=str, default="medica", show_default=True)
@click.pass_context
def universe_init(ctx: click.Context, universe_id: str, template: str) -> None:
    """Initialize a new universe by copying an existing universe as a template."""
    import shutil

    import yaml

    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root
    universes_dir = repo_root / "universes"
    src_dir = universes_dir / template
    dst_dir = universes_dir / universe_id

    if not (src_dir / "universe.yaml").exists():
        raise click.ClickException(f"Template universe not found: {src_dir / 'universe.yaml'}")
    if dst_dir.exists():
        raise click.ClickException(f"Universe already exists: {dst_dir}")

    shutil.copytree(src_dir, dst_dir)

    # Rewrite universe_id (and name if it matches the template).
    universe_path = dst_dir / "universe.yaml"
    raw = yaml.safe_load(universe_path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise click.ClickException(f"Invalid universe.yaml after copy: {universe_path}")
    raw["universe_id"] = universe_id
    if raw.get("name") == template:
        raw["name"] = universe_id
    universe_path.write_text(yaml.safe_dump(raw, sort_keys=False), encoding="utf-8")

    try:
        load_universe(universe_id, repo_root=repo_root, validate_worlds=True)
    except UniverseLoadError as exc:
        raise click.ClickException(f"Universe created but validation failed: {exc}") from exc

    console.print(f"[green]✓[/green] Created universe `{universe_id}` from template `{template}`")


@universe.group(name="index")
def universe_index() -> None:
    """Universe-scoped indices (rebuilt from `.cyntra/runs`)."""
    pass


@universe_index.command(name="rebuild")
@click.argument("universe_id", type=str)
@click.option("--output", type=Path, help="Override output runs.jsonl path")
@click.pass_context
def universe_index_rebuild(ctx: click.Context, universe_id: str, output: Path | None) -> None:
    """Rebuild `.cyntra/universes/<id>/index/runs.jsonl` by scanning `.cyntra/runs/`."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe
    from cyntra.universe.index import build_runs_index

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        load_universe(universe_id, repo_root=config.repo_root, validate_worlds=False)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    runs_dir = config.kernel_dir / "runs"
    output_path = output
    if output_path is None:
        output_path = config.kernel_dir / "universes" / universe_id / "index" / "runs.jsonl"
    elif not output_path.is_absolute():
        output_path = (config.repo_root / output_path).resolve()

    out_path, count = build_runs_index(
        universe_id=universe_id,
        runs_dir=runs_dir,
        output_path=output_path,
    )
    console.print(f"[green]✓[/green] Wrote {count} run record(s) to {out_path}")


@universe_index.command(name="update")
@click.argument("universe_id", type=str)
@click.option(
    "--run-id", "run_id", type=str, required=True, help="Run directory name under `.cyntra/runs/`"
)
@click.option("--output", type=Path, help="Override output runs.jsonl path")
@click.pass_context
def universe_index_update(
    ctx: click.Context, universe_id: str, run_id: str, output: Path | None
) -> None:
    """Upsert a single run record into `.cyntra/universes/<id>/index/runs.jsonl`."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe
    from cyntra.universe.index import update_runs_index

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        load_universe(universe_id, repo_root=config.repo_root, validate_worlds=False)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    runs_dir = config.kernel_dir / "runs"
    output_path = output
    if output_path is None:
        output_path = config.kernel_dir / "universes" / universe_id / "index" / "runs.jsonl"
    elif not output_path.is_absolute():
        output_path = (config.repo_root / output_path).resolve()

    try:
        out_path, changed = update_runs_index(
            universe_id=universe_id,
            runs_dir=runs_dir,
            output_path=output_path,
            run_id=run_id,
        )
    except FileNotFoundError as exc:
        raise click.ClickException(str(exc)) from exc

    if changed:
        console.print(f"[green]✓[/green] Updated {out_path} for run `{run_id}`")
    else:
        console.print(f"[yellow]No changes[/yellow] for run `{run_id}`")


@universe_index.command(name="rebuild-generations")
@click.argument("universe_id", type=str)
@click.option("--output", type=Path, help="Override output generations.jsonl path")
@click.pass_context
def universe_index_rebuild_generations(
    ctx: click.Context, universe_id: str, output: Path | None
) -> None:
    """Rebuild `.cyntra/universes/<id>/index/generations.jsonl` by scanning `.cyntra/runs/`."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe
    from cyntra.universe.generations import build_generations_index

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        load_universe(universe_id, repo_root=config.repo_root, validate_worlds=False)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    runs_dir = config.kernel_dir / "runs"
    output_path = output
    if output_path is None:
        output_path = config.kernel_dir / "universes" / universe_id / "index" / "generations.jsonl"
    elif not output_path.is_absolute():
        output_path = (config.repo_root / output_path).resolve()

    out_path, count = build_generations_index(
        universe_id=universe_id,
        runs_dir=runs_dir,
        output_path=output_path,
    )
    console.print(f"[green]✓[/green] Wrote {count} generation record(s) to {out_path}")


@universe.group(name="patterns")
def universe_patterns() -> None:
    """Universe-scoped pattern store (derived from `.cyntra/runs`)."""
    pass


@universe_patterns.command(name="rebuild")
@click.argument("universe_id", type=str)
@click.option("--output", type=Path, help="Override output patterns.jsonl path")
@click.option("--min-frequency", type=int, default=2, show_default=True)
@click.option(
    "--max-evidence", type=int, default=5, show_default=True, help="Max evidence_runs per pattern"
)
@click.pass_context
def universe_patterns_rebuild(
    ctx: click.Context,
    universe_id: str,
    output: Path | None,
    min_frequency: int,
    max_evidence: int,
) -> None:
    """Rebuild `.cyntra/universes/<id>/patterns/patterns.jsonl` by scanning `.cyntra/runs/`."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe
    from cyntra.universe.patterns import build_patterns_store

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        load_universe(universe_id, repo_root=config.repo_root, validate_worlds=False)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    runs_dir = config.kernel_dir / "runs"
    output_path = output
    if output_path is None:
        output_path = config.kernel_dir / "universes" / universe_id / "patterns" / "patterns.jsonl"
    elif not output_path.is_absolute():
        output_path = (config.repo_root / output_path).resolve()

    out_path, count = build_patterns_store(
        universe_id=universe_id,
        runs_dir=runs_dir,
        output_path=output_path,
        min_frequency=max(1, int(min_frequency)),
        max_evidence_runs=max(1, int(max_evidence)),
    )
    console.print(f"[green]✓[/green] Wrote {count} pattern record(s) to {out_path}")


@universe.group(name="frontiers")
def universe_frontiers() -> None:
    """Universe-scoped Pareto frontiers (per world)."""
    pass


@universe_frontiers.command(name="rebuild")
@click.argument("universe_id", type=str)
@click.option("--world", "world_id", multiple=True, help="Limit rebuild to a world_id (repeatable)")
@click.option("--output-dir", type=Path, help="Override output frontiers/ directory")
@click.pass_context
def universe_frontiers_rebuild(
    ctx: click.Context,
    universe_id: str,
    world_id: tuple[str, ...],
    output_dir: Path | None,
) -> None:
    """Rebuild `.cyntra/universes/<id>/frontiers/<world_id>.json` files by scanning `.cyntra/runs/`."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe
    from cyntra.universe.frontiers import build_frontiers_store

    config = KernelConfig.load(ctx.obj["config_path"])
    try:
        universe_cfg = load_universe(universe_id, repo_root=config.repo_root, validate_worlds=False)
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    runs_dir = config.kernel_dir / "runs"
    output_path = output_dir
    if output_path is None:
        output_path = config.kernel_dir / "universes" / universe_id / "frontiers"
    elif not output_path.is_absolute():
        output_path = (config.repo_root / output_path).resolve()

    world_ids = list(world_id) if world_id else None
    paths, total_points = build_frontiers_store(
        universe_cfg=universe_cfg,
        runs_dir=runs_dir,
        output_dir=output_path,
        world_ids=world_ids,
    )
    console.print(
        f"[green]✓[/green] Wrote {len(paths)} world frontier file(s) ({total_points} point(s)) to {output_path}"
    )


@main.group()
def world() -> None:
    """World tooling (build pipelines + evaluation)."""
    pass


# =============================================================================
# Strategy Analytics
# =============================================================================


@main.group()
def strategy() -> None:
    """Strategy telemetry analytics."""
    pass


@strategy.command(name="stats")
@click.option("--toolchain", type=str, help="Filter by toolchain")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def strategy_stats(ctx: click.Context, toolchain: str | None, as_json: bool) -> None:
    """Show strategy profile statistics."""
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.kernel.config import KernelConfig
    from cyntra.strategy import CYNTRA_V1_RUBRIC

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"

    if not db_path.exists():
        console.print("[yellow]No dynamics database found[/yellow]")
        return

    db = TransitionDB(db_path)
    total = db.profile_count()
    success_profiles = db.get_profiles(toolchain=toolchain, outcome="success", limit=1000)
    failed_profiles = db.get_profiles(toolchain=toolchain, outcome="failed", limit=1000)

    if as_json:
        result = {
            "total_profiles": total,
            "success_count": len(success_profiles),
            "failed_count": len(failed_profiles),
            "dimensions": {},
        }
        for dim in CYNTRA_V1_RUBRIC:
            dist = db.get_dimension_distribution(dim.id, toolchain=toolchain)
            if dist:
                result["dimensions"][dim.id] = dist
        console.print(json.dumps(result, indent=2))
        db.conn.close()
        return

    console.print(f"\n[bold]Strategy Profile Statistics[/bold]")
    console.print(f"Total Profiles: {total}")
    console.print(f"Successful: {len(success_profiles)}")
    console.print(f"Failed: {len(failed_profiles)}")
    if toolchain:
        console.print(f"Filtered by: {toolchain}")
    console.print()

    table = Table(title="Dimension Distributions (Success)")
    table.add_column("Dimension", style="cyan")
    table.add_column("Pattern A", style="green")
    table.add_column("Count A")
    table.add_column("Pattern B", style="yellow")
    table.add_column("Count B")

    for dim in CYNTRA_V1_RUBRIC:
        dist = db.get_dimension_distribution(dim.id, toolchain=toolchain, outcome="success")
        if dist:
            count_a = dist.get(dim.pattern_a, 0)
            count_b = dist.get(dim.pattern_b, 0)
            table.add_row(dim.name, dim.pattern_a, str(count_a), dim.pattern_b, str(count_b))

    console.print(table)
    db.conn.close()


@strategy.command(name="list")
@click.option("--toolchain", type=str, help="Filter by toolchain")
@click.option("--outcome", type=click.Choice(["success", "failed"]), help="Filter by outcome")
@click.option("--limit", type=int, default=20, help="Max profiles to show")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def strategy_list(
    ctx: click.Context,
    toolchain: str | None,
    outcome: str | None,
    limit: int,
    as_json: bool,
) -> None:
    """List recent strategy profiles."""
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"

    if not db_path.exists():
        console.print("[yellow]No dynamics database found[/yellow]")
        return

    db = TransitionDB(db_path)
    profiles = db.get_profiles(toolchain=toolchain, outcome=outcome, limit=limit)

    if as_json:
        console.print(json.dumps(profiles, indent=2, default=str))
        db.conn.close()
        return

    if not profiles:
        console.print("[dim]No profiles found[/dim]")
        db.conn.close()
        return

    table = Table(title=f"Strategy Profiles (last {len(profiles)})")
    table.add_column("ID", style="dim", max_width=12)
    table.add_column("Workcell", style="cyan", max_width=20)
    table.add_column("Toolchain")
    table.add_column("Outcome", style="green")
    table.add_column("Method")
    table.add_column("Dims")
    table.add_column("Time", style="dim")

    for p in profiles:
        profile_id = str(p.get("profile_id", ""))[:12]
        workcell_id = str(p.get("workcell_id", ""))[:20]
        tc = p.get("toolchain", "")
        out = p.get("outcome", "")
        method = p.get("extraction_method", "")
        dim_count = len(p.get("dimensions", {})) if isinstance(p.get("dimensions"), dict) else 0
        timestamp = str(p.get("created_at", ""))[:19]
        outcome_style = "[green]" if out == "success" else "[red]"
        table.add_row(profile_id, workcell_id, tc, f"{outcome_style}{out}[/]", method, str(dim_count), timestamp)

    console.print(table)
    db.conn.close()


@strategy.command(name="optimal")
@click.option("--toolchain", type=str, help="Filter by toolchain")
@click.option("--min-confidence", type=float, default=0.5, help="Minimum confidence threshold")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def strategy_optimal(
    ctx: click.Context,
    toolchain: str | None,
    min_confidence: float,
    as_json: bool,
) -> None:
    """Show optimal strategy patterns based on successful executions."""
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.kernel.config import KernelConfig
    from cyntra.strategy import CYNTRA_V1_RUBRIC

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"

    if not db_path.exists():
        console.print("[yellow]No dynamics database found[/yellow]")
        return

    db = TransitionDB(db_path)
    optimal = db.get_optimal_strategy_for(toolchain=toolchain, outcome="success", min_confidence=min_confidence)

    if as_json:
        console.print(json.dumps(optimal, indent=2))
        db.conn.close()
        return

    if not optimal:
        console.print("[dim]No optimal patterns found (need more data)[/dim]")
        db.conn.close()
        return

    console.print(f"\n[bold]Optimal Strategy Patterns[/bold]")
    if toolchain:
        console.print(f"Toolchain: {toolchain}")
    console.print(f"Min Confidence: {min_confidence}")
    console.print()

    table = Table(title="Recommended Patterns")
    table.add_column("Dimension", style="cyan")
    table.add_column("Optimal Pattern", style="green")
    table.add_column("Description")

    for dim in CYNTRA_V1_RUBRIC:
        if dim.id in optimal:
            pattern = optimal[dim.id]
            desc = dim.description_a if pattern == dim.pattern_a else dim.description_b
            table.add_row(dim.name, pattern, desc[:50] + "..." if len(desc) > 50 else desc)

    console.print(table)
    patterns = [optimal.get(d.id, "?") for d in CYNTRA_V1_RUBRIC]
    console.print(f"\n[dim]Compact: {', '.join(patterns)}[/dim]")
    db.conn.close()


@strategy.command(name="rubric")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
def strategy_rubric(as_json: bool) -> None:
    """Show the strategy rubric dimensions."""
    from cyntra.strategy import CYNTRA_V1_RUBRIC

    if as_json:
        console.print(json.dumps(CYNTRA_V1_RUBRIC.to_dict(), indent=2))
        return

    console.print(f"\n[bold]Cyntra Strategy Rubric v1[/bold]")
    console.print(f"Dimensions: {len(CYNTRA_V1_RUBRIC.dimensions)}\n")

    table = Table(title="Strategy Dimensions")
    table.add_column("#", style="dim")
    table.add_column("ID", style="cyan")
    table.add_column("Name")
    table.add_column("Pattern A", style="green")
    table.add_column("Pattern B", style="yellow")
    table.add_column("Source", style="dim")

    for i, dim in enumerate(CYNTRA_V1_RUBRIC, 1):
        table.add_row(str(i), dim.id, dim.name, dim.pattern_a, dim.pattern_b, dim.source)

    console.print(table)


def _parse_param_overrides(raw: tuple[str, ...]) -> dict[str, object]:
    overrides: dict[str, object] = {}
    for item in raw:
        if "=" not in item:
            raise click.ClickException(f"Invalid --param (expected key=value): {item}")
        key, value = item.split("=", 1)
        key = key.strip()
        if not key:
            raise click.ClickException(f"Invalid --param key: {item}")
        parsed: object = value
        try:
            parsed = json.loads(value)
        except Exception:
            parsed = value
        overrides[key] = parsed
    return overrides


@world.command(name="build")
@click.option("--universe", type=str, help="Universe context (universes/<id>)")
@click.option(
    "--world",
    "world_ref",
    required=True,
    help="World id (if --universe) or path to world directory/world.yaml",
)
@click.option("--seed", type=int, help="Override seed (default: world determinism seed)")
@click.option(
    "--output", type=Path, help="Run output dir (default: .cyntra/runs/world_<id>_seed<seed>_<ts>)"
)
@click.option("--param", multiple=True, help="Parameter override (key=value, supports JSON values)")
@click.option("--until", type=str, help="Stop after this stage (for incremental builds)")
@click.option(
    "--prune-intermediates", is_flag=True, help="Delete intermediate stage dirs after use"
)
@click.pass_context
def world_build(
    ctx: click.Context,
    universe: str | None,
    world_ref: str,
    seed: int | None,
    output: Path | None,
    param: tuple[str, ...],
    until: str | None,
    prune_intermediates: bool,
) -> None:
    """Build a world pipeline and write artifacts under `.cyntra/runs/`."""
    import os
    from contextlib import contextmanager

    from cyntra.fab.world_config import load_world_config
    from cyntra.fab.world_runner import run_world
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root

    resolved_world_path: Path
    resolved_world_id: str | None = None
    objective_id: str | None = None
    swarm_id: str | None = None
    universe_cfg = None

    if universe:
        from cyntra.universe import UniverseLoadError, load_universe

        try:
            universe_cfg = load_universe(universe, repo_root=repo_root, validate_worlds=False)
        except UniverseLoadError as exc:
            raise click.ClickException(str(exc)) from exc

        world = universe_cfg.get_world(world_ref)
        if world is not None:
            resolved_world_id = world.world_id
            resolved_world_path = world.resolved_path(repo_root)
        else:
            resolved_world_path = (
                (repo_root / world_ref).resolve()
                if not Path(world_ref).is_absolute()
                else Path(world_ref).resolve()
            )

        defaults = universe_cfg.defaults
        objective_id = str(defaults.get("objective_id") or "") or None
        swarm_id = str(defaults.get("swarm_id") or "") or None
    else:
        resolved_world_path = (
            (repo_root / world_ref).resolve()
            if not Path(world_ref).is_absolute()
            else Path(world_ref).resolve()
        )

    # Validate / load world config (also resolves world_id).
    world_config = load_world_config(resolved_world_path)
    if resolved_world_id is None:
        resolved_world_id = world_config.world_id

    resolved_seed = seed
    if resolved_seed is None:
        resolved_seed = int(world_config.get_determinism_config().get("seed", 42))

    run_dir = output
    if run_dir is None:
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        run_dir = (
            config.kernel_dir
            / "runs"
            / f"world_{resolved_world_id}_seed{resolved_seed}_{timestamp}"
        )
    elif not run_dir.is_absolute():
        run_dir = (repo_root / run_dir).resolve()

    if universe:
        from cyntra.universe import RunContext, write_run_context

        write_run_context(
            run_dir,
            RunContext(
                universe_id=universe,
                world_id=resolved_world_id,
                objective_id=objective_id,
                swarm_id=swarm_id,
                issue_id=None,
            ),
        )

    overrides = _parse_param_overrides(param)
    env_overrides: dict[str, str] = {}
    if universe_cfg is not None:
        from cyntra.universe.policy import universe_env_overrides

        env_overrides = universe_env_overrides(universe_cfg)

    @contextmanager
    def _temporary_env(overrides: dict[str, str]):
        if not overrides:
            yield
            return
        previous = {k: os.environ.get(k) for k in overrides}
        try:
            os.environ.update(overrides)
            yield
        finally:
            for key, prior in previous.items():
                if prior is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = prior

    with _temporary_env(env_overrides):
        success = run_world(
            world_path=resolved_world_path,
            output_dir=run_dir,
            seed=resolved_seed,
            param_overrides=overrides,
            until_stage=until,
            prune_intermediates=prune_intermediates,
        )

    if not success:
        raise click.ClickException(f"World build failed (see {run_dir})")

    # Best-effort: update universe-scoped frontiers for this world.
    if universe_cfg is not None:
        try:
            (run_dir.resolve()).relative_to((config.kernel_dir / "runs").resolve())
        except Exception:
            pass
        else:
            try:
                from cyntra.universe.frontiers import build_world_frontiers

                build_world_frontiers(
                    universe_cfg=universe_cfg,
                    runs_dir=config.kernel_dir / "runs",
                    output_dir=config.kernel_dir
                    / "universes"
                    / universe_cfg.universe_id
                    / "frontiers",
                    world_id=resolved_world_id,
                )
            except Exception:
                # Frontier export must never fail the build.
                pass

    console.print(f"[green]✓[/green] World build complete: {run_dir}")


@main.group()
def dynamics() -> None:
    """Dynamics tooling (states + transitions)."""
    pass


def _collect_dirs(base: Path | None) -> list[Path]:
    if not base or not base.exists():
        return []
    return [p for p in base.iterdir() if p.is_dir()]


def _run_dynamics_ingest(
    *,
    config_path: Path,
    db_path: Path | None,
    workcells_dir: Path | None,
    archives_dir: Path | None,
    limit: int | None,
) -> tuple[int, int, Path] | None:
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.dynamics.transition_logger import build_transitions
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(config_path)
    resolved_db_path = db_path or (config.kernel_dir / "dynamics" / "dynamics.sqlite")

    resolved_workcells = workcells_dir or config.workcells_dir
    resolved_archives = archives_dir or config.archives_dir

    sources = _collect_dirs(resolved_workcells) + _collect_dirs(resolved_archives)
    if limit:
        sources = sources[:limit]

    if not sources:
        return None

    db_handle = TransitionDB(resolved_db_path)
    transitions_written = 0
    processed = 0

    for path in sources:
        transitions = build_transitions(path)
        if not transitions:
            continue
        transitions_written += db_handle.insert_transitions(transitions)
        processed += 1

    db_handle.close()
    return processed, transitions_written, resolved_db_path


@dynamics.command(name="ingest")
@click.option("--db", type=Path, help="Path to dynamics sqlite DB")
@click.option("--workcells", type=Path, help="Path to workcells directory")
@click.option("--archives", type=Path, help="Path to archives directory")
@click.option("--limit", type=int, help="Limit number of workcells processed")
@click.pass_context
def dynamics_ingest(
    ctx: click.Context,
    db: Path | None,
    workcells: Path | None,
    archives: Path | None,
    limit: int | None,
) -> None:
    """Ingest workcell telemetry into the dynamics DB."""
    result = _run_dynamics_ingest(
        config_path=ctx.obj["config_path"],
        db_path=db,
        workcells_dir=workcells,
        archives_dir=archives,
        limit=limit,
    )

    if not result:
        console.print("[yellow]No workcells or archives found[/yellow]")
        return

    processed, transitions_written, db_path = result

    console.print(
        f"[green]✓[/green] Ingested {processed} workcells "
        f"({transitions_written} transitions) into {db_path}"
    )


@dynamics.command(name="stats")
@click.option("--db", type=Path, help="Path to dynamics sqlite DB")
@click.option("--limit", type=int, default=20, help="Max transitions to show")
@click.pass_context
def dynamics_stats(ctx: click.Context, db: Path | None, limit: int) -> None:
    """Show transition counts and probabilities."""
    from cyntra.dynamics.transition_db import TransitionDB
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = db or (config.kernel_dir / "dynamics" / "dynamics.sqlite")

    if not db_path.exists():
        console.print(f"[yellow]No dynamics DB found at {db_path}[/yellow]")
        return

    db_handle = TransitionDB(db_path)
    rows = db_handle.transition_probabilities(limit=limit)
    db_handle.close()

    if not rows:
        console.print("[dim]No transitions recorded yet[/dim]")
        return

    table = Table(title="Transition Probabilities")
    table.add_column("From", style="cyan")
    table.add_column("To", style="cyan")
    table.add_column("Count", justify="right")
    table.add_column("P(to|from)", justify="right")

    for row in rows:
        table.add_row(
            row.get("from_state", "-"),
            row.get("to_state", "-"),
            str(row.get("count", 0)),
            f"{row.get('probability', 0):.3f}",
        )

    console.print(table)


@dynamics.command(name="report")
@click.option("--db", type=Path, help="Path to dynamics sqlite DB")
@click.option("--output", type=Path, help="Output report path")
@click.option("--alpha", type=float, default=1.0, show_default=True, help="Smoothing alpha")
@click.option(
    "--action-low", type=float, default=0.1, show_default=True, help="Low action threshold"
)
@click.option(
    "--delta-v-low", type=float, default=0.05, show_default=True, help="Low delta-V threshold"
)
@click.option("--ingest", is_flag=True, help="Ingest workcells before reporting")
@click.pass_context
def dynamics_report(
    ctx: click.Context,
    db: Path | None,
    output: Path | None,
    alpha: float,
    action_low: float,
    delta_v_low: float,
    ingest: bool,
) -> None:
    """Generate a dynamics report (potential + action)."""
    from cyntra.dynamics.report import write_report
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    db_path = db or (config.kernel_dir / "dynamics" / "dynamics.sqlite")
    output_path = output or (config.kernel_dir / "dynamics" / "dynamics_report.json")

    if ingest:
        result = _run_dynamics_ingest(
            config_path=ctx.obj["config_path"],
            db_path=db_path,
            workcells_dir=None,
            archives_dir=None,
            limit=None,
        )
        if result:
            processed, transitions_written, db_path = result
            console.print(
                f"[green]✓[/green] Ingested {processed} workcells "
                f"({transitions_written} transitions) into {db_path}"
            )
        else:
            console.print("[yellow]No workcells or archives found[/yellow]")
            return

    if not db_path.exists():
        console.print(
            f"[yellow]No dynamics DB found at {db_path}[/yellow]\n"
            "[dim]Run `cyntra dynamics ingest` or re-run with --ingest.[/dim]"
        )
        return

    write_report(
        db_path,
        output_path,
        smoothing_alpha=alpha,
        action_low=action_low,
        delta_v_low=delta_v_low,
    )
    console.print(f"[green]✓[/green] Wrote dynamics report to {output_path}")


class _EvolveDispatchGroup(click.Group):
    """Allow `cyntra evolve --universe ...` to coexist with `cyntra evolve <subcommand> ...`.

    Click groups treat unknown tokens as potential subcommands. With
    `ignore_unknown_options=True`, flags like `--universe` become "unknown args"
    and Click will try to resolve them as a subcommand name, raising
    `NoSuchCommand`.

    This group treats leading flag-style args as "no subcommand", allowing the
    callback to parse world evolution flags via argparse.
    """

    def parse_args(self, ctx: click.Context, args: list[str]) -> list[str]:  # type: ignore[override]
        super().parse_args(ctx, args)

        # If the "subcommand slot" is actually an unknown flag (because we
        # intentionally accept unknown options), treat it as "no subcommand"
        # and pass all tokens through to the callback in `ctx.args`.
        if not self.chain and getattr(ctx, "_protected_args", None):
            protected = list(ctx._protected_args)  # type: ignore[attr-defined]
            if protected and str(protected[0]).startswith("-"):
                ctx.args = [*protected, *ctx.args]
                ctx._protected_args = []  # type: ignore[attr-defined]

        return ctx.args


@main.group(
    cls=_EvolveDispatchGroup,
    invoke_without_command=True,
    context_settings={"ignore_unknown_options": True, "allow_extra_args": True},
)
@click.pass_context
def evolve(ctx: click.Context) -> None:
    """Evolution loops (Universe worlds + prompt evolution labs)."""
    if ctx.invoked_subcommand is not None:
        return

    if not ctx.args:
        console.print(ctx.get_help())
        return

    import argparse

    parser = argparse.ArgumentParser(prog="cyntra evolve", exit_on_error=False)
    parser.add_argument("--universe", required=True, help="Universe id (universes/<id>)")
    parser.add_argument("--world", required=True, help="World id (from universe registry)")
    parser.add_argument(
        "--objective-id",
        "--objective",
        dest="objective_id",
        help="Objective id (defaults from universe)",
    )
    parser.add_argument(
        "--swarm-id", "--swarm", dest="swarm_id", help="Swarm id (defaults from universe)"
    )
    parser.add_argument("--generations", type=int, default=3)
    parser.add_argument(
        "--population", dest="population_size", type=int, help="Population size override"
    )
    parser.add_argument("--seed", type=int, help="Deterministic seed (mutations + world seed)")
    parser.add_argument("--output", type=Path, help="Output evolve run directory")
    parser.add_argument(
        "--reuse-candidates",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Reuse existing candidate runs if present",
    )

    try:
        args = parser.parse_args(ctx.args)
    except Exception as exc:
        raise click.ClickException(str(exc)) from exc

    from cyntra.kernel.config import KernelConfig
    from cyntra.universe import UniverseLoadError, load_universe
    from cyntra.universe.evolve_world import evolve_world

    config = KernelConfig.load(ctx.obj["config_path"])

    try:
        universe_cfg = load_universe(
            args.universe, repo_root=config.repo_root, validate_worlds=False
        )
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    defaults = universe_cfg.defaults
    resolved_objective = args.objective_id or str(defaults.get("objective_id") or "") or None
    resolved_swarm = args.swarm_id or str(defaults.get("swarm_id") or "") or None

    if not resolved_objective:
        raise click.ClickException(
            "No objective id specified and universe has no defaults.objective_id"
        )
    if not resolved_swarm:
        raise click.ClickException("No swarm id specified and universe has no defaults.swarm_id")

    output_dir = args.output
    if output_dir is None:
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        output_dir = config.kernel_dir / "runs" / f"evolve_world_{args.world}_{timestamp}"
    elif not output_dir.is_absolute():
        output_dir = (config.repo_root / output_dir).resolve()

    try:
        result = evolve_world(
            universe_cfg=universe_cfg,
            repo_root=config.repo_root,
            kernel_dir=config.kernel_dir,
            world_id=args.world,
            objective_id=resolved_objective,
            swarm_id=resolved_swarm,
            generations=args.generations,
            population_size=args.population_size,
            seed=args.seed,
            output_dir=output_dir,
            reuse_existing_candidates=args.reuse_candidates,
        )
    except UniverseLoadError as exc:
        raise click.ClickException(str(exc)) from exc

    console.print(f"[green]✓[/green] World evolution complete: {output_dir}")
    selected = None
    if isinstance(result, dict):
        history = result.get("history")
        if isinstance(history, list) and history:
            last = history[-1] if isinstance(history[-1], dict) else {}
            if isinstance(last, dict):
                selected = last.get("selected_run_id")
    if isinstance(selected, str) and selected:
        console.print(f"[dim]Selected:[/dim] {selected}")

    # Best-effort: refresh universe-scoped indices/frontiers.
    try:
        from cyntra.universe.frontiers import build_world_frontiers

        build_world_frontiers(
            universe_cfg=universe_cfg,
            runs_dir=config.kernel_dir / "runs",
            output_dir=config.kernel_dir / "universes" / universe_cfg.universe_id / "frontiers",
            world_id=args.world,
        )
    except Exception:
        pass

    try:
        from cyntra.universe.generations import build_generations_index

        build_generations_index(
            universe_id=universe_cfg.universe_id,
            runs_dir=config.kernel_dir / "runs",
            output_path=config.kernel_dir
            / "universes"
            / universe_cfg.universe_id
            / "index"
            / "generations.jsonl",
        )
    except Exception:
        pass

    try:
        from cyntra.universe.index import update_runs_index

        runs_dir = config.kernel_dir / "runs"
        runs_index = (
            config.kernel_dir / "universes" / universe_cfg.universe_id / "index" / "runs.jsonl"
        )
        update_runs_index(
            universe_id=universe_cfg.universe_id,
            runs_dir=runs_dir,
            output_path=runs_index,
            run_id=output_dir.name,
        )

        candidate_ids: set[str] = set()
        if isinstance(result, dict):
            history = result.get("history")
            if isinstance(history, list):
                for entry in history:
                    if not isinstance(entry, dict):
                        continue
                    candidates = entry.get("candidates")
                    if not isinstance(candidates, list):
                        continue
                    for cand in candidates:
                        if not isinstance(cand, dict):
                            continue
                        rid = cand.get("run_id")
                        if isinstance(rid, str) and rid:
                            candidate_ids.add(rid)

        for run_id in sorted(candidate_ids):
            update_runs_index(
                universe_id=universe_cfg.universe_id,
                runs_dir=runs_dir,
                output_path=runs_index,
                run_id=run_id,
            )
    except Exception:
        pass


@main.group()
def bench() -> None:
    """End-to-end bench suites (runs through `cyntra run`)."""
    pass


@main.group()
def immersa() -> None:
    """Immersa tooling (assets + presentations)."""
    pass


@immersa.command(name="generate")
@click.option("--repo", type=Path, default=Path("."), show_default=True, help="Repo root")
@click.option("--deck-id", default="cyntra_latest", show_default=True, help="Presentation ID")
@click.option("--title", default="Cyntra Latest", show_default=True, help="Presentation title")
@click.option("--limit", type=int, help="Limit number of assets")
@click.option(
    "--include-outora/--no-include-outora",
    default=True,
    show_default=True,
    help="Include `fab/assets/**/*.glb`",
)
@click.option(
    "--include-runs/--no-include-runs",
    default=True,
    show_default=True,
    help="Include `.cyntra/runs/**/artifacts/**/*.glb`",
)
@click.option("--output", type=Path, help="Override output JSON path")
def immersa_generate(
    repo: Path,
    deck_id: str,
    title: str,
    limit: int | None,
    include_outora: bool,
    include_runs: bool,
    output: Path | None,
) -> None:
    """Generate an Immersa presentation from GLB assets in the repo."""
    from cyntra.immersa.generator import generate_deck, scan_glb_assets, write_deck_json

    repo_root = repo.resolve()
    output_path = output
    if output_path is not None and not output_path.is_absolute():
        output_path = (repo_root / output_path).resolve()

    assets = scan_glb_assets(repo_root, include_outora=include_outora, include_runs=include_runs)
    if limit is not None:
        assets = assets[:limit]

    deck = generate_deck(assets, deck_id=deck_id, title=title)
    out_path = write_deck_json(repo_root, deck_id=deck_id, deck=deck, output=output_path)
    console.print(f"[green]✓[/green] Wrote {out_path} ({len(assets)} assets)")


@immersa.command(name="watch")
@click.option("--repo", type=Path, default=Path("."), show_default=True, help="Repo root")
@click.option("--deck-id", default="cyntra_latest", show_default=True, help="Presentation ID")
@click.option("--title", default="Cyntra Latest", show_default=True, help="Presentation title")
@click.option("--poll-seconds", type=float, default=2.0, show_default=True)
@click.option("--limit", type=int, help="Limit number of assets")
@click.option(
    "--include-outora/--no-include-outora",
    default=True,
    show_default=True,
    help="Include `fab/assets/**/*.glb`",
)
@click.option(
    "--include-runs/--no-include-runs",
    default=True,
    show_default=True,
    help="Include `.cyntra/runs/**/artifacts/**/*.glb`",
)
@click.option("--output", type=Path, help="Override output JSON path")
def immersa_watch(
    repo: Path,
    deck_id: str,
    title: str,
    poll_seconds: float,
    limit: int | None,
    include_outora: bool,
    include_runs: bool,
    output: Path | None,
) -> None:
    """Watch for GLB changes and keep an Immersa presentation updated."""
    from cyntra.immersa.generator import watch_deck

    repo_root = repo.resolve()
    output_path = output
    if output_path is not None and not output_path.is_absolute():
        output_path = (repo_root / output_path).resolve()

    watch_deck(
        repo_root,
        deck_id=deck_id,
        title=title,
        poll_seconds=poll_seconds,
        include_outora=include_outora,
        include_runs=include_runs,
        limit=limit,
        output=output_path,
    )


def _parse_objectives(raw: tuple[str, ...]) -> dict[str, str]:
    objectives: dict[str, str] = {}
    for item in raw:
        if ":" not in item:
            continue
        key, direction = item.split(":", 1)
        direction = direction.strip().lower()
        if direction not in ("max", "min"):
            continue
        objectives[key.strip()] = direction
    return objectives


@evolve.command(name="run")
@click.option("--bench", required=True, help="Bench module path or file")
@click.option("--universe", type=str, help="Universe context (universes/<id>)")
@click.option("--output", type=Path, help="Output run directory")
@click.option("--objective", multiple=True, help="Metric objective (e.g. quality:max)")
@click.option("--gepa-config", type=Path, help="YAML file with GEPA config")
@click.pass_context
def evolve_run(
    ctx: click.Context,
    bench: str,
    universe: str | None,
    output: Path | None,
    objective: tuple[str, ...],
    gepa_config: Path | None,
) -> None:
    """Run GEPA on a bench and produce genomes/frontier."""
    import yaml

    from cyntra.evolve.bench import load_bench
    from cyntra.evolve.evaluation import (
        build_result_payload,
        evaluate_program,
        run_gepa,
    )
    from cyntra.evolve.genome import create_genome, save_genome
    from cyntra.evolve.pareto import pareto_frontier
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root

    bench_data = load_bench(bench)
    program = bench_data.get("program")
    if program is None:
        builder = bench_data.get("build_program")
        program = builder() if callable(builder) else None
    if program is None:
        raise click.ClickException("Bench did not provide a program or build_program()")

    trainset = bench_data.get("trainset") or bench_data.get("train")
    devset = bench_data.get("devset") or bench_data.get("dev") or trainset
    metric = bench_data.get("metric")
    evaluate_fn = bench_data.get("evaluate")

    gepa_cfg = {}
    if gepa_config:
        gepa_cfg = yaml.safe_load(gepa_config.read_text()) or {}

    optimized_program, gepa_meta = run_gepa(
        program=program,
        trainset=trainset,
        devset=devset,
        metric=metric,
        gepa_config=gepa_cfg,
    )

    metrics = evaluate_program(
        program=optimized_program,
        dataset=devset,
        evaluate_fn=evaluate_fn,
    )

    genome = create_genome(
        domain=str(bench_data.get("domain") or "code"),
        toolchain=str(bench_data.get("toolchain") or "codex"),
        system_prompt=str(bench_data.get("system_prompt") or ""),
        instruction_blocks=bench_data.get("instruction_blocks") or [],
        tool_use_rules=bench_data.get("tool_use_rules") or [],
        sampling=bench_data.get("sampling") or {},
        metadata={
            "bench": bench_data.get("name") or bench,
            "gepa": gepa_meta,
        },
    )

    prompts_root = repo_root / "prompts"
    genome_path = save_genome(genome, prompts_root)

    result_payload = build_result_payload(
        genome_id=genome["genome_id"],
        metrics=metrics,
        gepa_meta=gepa_meta,
        program=optimized_program,
    )

    run_dir = output or (config.kernel_dir / "runs" / f"evolve_{genome['genome_id']}")
    run_dir.mkdir(parents=True, exist_ok=True)

    if universe:
        from cyntra.universe import RunContext, UniverseLoadError, load_universe, write_run_context

        try:
            universe_cfg = load_universe(universe, repo_root=repo_root, validate_worlds=False)
        except UniverseLoadError as exc:
            raise click.ClickException(str(exc)) from exc
        defaults = universe_cfg.defaults
        write_run_context(
            run_dir,
            RunContext(
                universe_id=universe,
                world_id=None,
                objective_id=str(defaults.get("objective_id") or "") or None,
                swarm_id=str(defaults.get("swarm_id") or "") or None,
                issue_id=None,
            ),
        )

    evolve_run = {
        "schema_version": "cyntra.evolve_run.v1",
        "run_id": run_dir.name,
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "bench": bench_data.get("name") or bench,
        "objectives": bench_data.get("objectives") or {},
        "genome_path": str(genome_path.relative_to(repo_root)),
        "results": [result_payload],
    }
    (run_dir / "evolve_run.json").write_text(json.dumps(evolve_run, indent=2))

    objectives = _parse_objectives(objective) or evolve_run.get("objectives") or {}
    frontier = pareto_frontier(
        [
            {
                "genome_id": result_payload["genome_id"],
                **(result_payload.get("metrics") or {}),
            }
        ],
        objectives,
    )
    frontier_payload = {
        "schema_version": "cyntra.frontier.v1",
        "generated_at": evolve_run.get("generated_at"),
        "objectives": objectives,
        "items": frontier,
    }
    (run_dir / "frontier.json").write_text(json.dumps(frontier_payload, indent=2))

    console.print(f"[green]✓[/green] GEPA run complete in {run_dir}")
    console.print(f"[dim]Genome:[/dim] {genome_path}")


@evolve.command(name="loop")
@click.option("--bench", required=True, help="Bench module path or file")
@click.option("--output", type=Path, help="Output run directory")
@click.option("--objective", multiple=True, help="Metric objective (e.g. pass_rate:max)")
@click.option("--generations", type=int, default=3, show_default=True)
@click.option("--population", type=int, default=6, show_default=True, help="Population size")
@click.option("--seed", type=int, help="RNG seed for deterministic mutation")
@click.option("--base-genome", type=Path, help="Base genome YAML path (overrides bench base)")
@click.option("--toolchain", type=str, help="Force toolchain for bench runs")
@click.option("--keep-workcells", is_flag=True, help="Do not delete benchmark workcells")
@click.option("--max-cases", type=int, help="Limit number of bench cases evaluated")
@click.pass_context
def evolve_loop(
    ctx: click.Context,
    bench: str,
    output: Path | None,
    objective: tuple[str, ...],
    generations: int,
    population: int,
    seed: int | None,
    base_genome: Path | None,
    toolchain: str | None,
    keep_workcells: bool,
    max_cases: int | None,
) -> None:
    """Run a Cyntra-native prompt evolution loop on a bench."""
    from cyntra.evolve.bench import load_bench
    from cyntra.evolve.loop import run_evolution_loop
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root

    bench_data = load_bench(bench)

    prompts_root = repo_root / "prompts"
    prompts_root.mkdir(parents=True, exist_ok=True)

    run_dir = output
    if run_dir is None:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        run_dir = config.kernel_dir / "runs" / f"evolve_loop_{stamp}"
    elif not run_dir.is_absolute():
        run_dir = (repo_root / run_dir).resolve()

    base_genome_path = None
    if base_genome is not None:
        base_genome_path = base_genome
        if not base_genome_path.is_absolute():
            base_genome_path = (repo_root / base_genome_path).resolve()
        if not base_genome_path.exists():
            raise click.ClickException(f"Base genome not found: {base_genome_path}")

    objectives = _parse_objectives(objective) or bench_data.get("objectives") or {}

    run_evolution_loop(
        config=config,
        bench=bench_data,
        prompts_root=prompts_root,
        run_dir=run_dir,
        generations=generations,
        population_size=population,
        seed=seed,
        objectives=objectives,
        base_genome_path=base_genome_path,
        toolchain_override=toolchain,
        keep_workcells=keep_workcells,
        max_cases=max_cases,
    )

    console.print(f"[green]✓[/green] Evolve loop complete in {run_dir}")
    console.print(f"[dim]Run:[/dim] {run_dir / 'evolve_loop.json'}")
    console.print(f"[dim]Frontier:[/dim] {run_dir / 'frontier.json'}")


@evolve.command(name="frontier")
@click.option("--run", "run_dir", type=Path, required=True, help="Run directory")
@click.option("--objective", multiple=True, help="Metric objective (e.g. quality:max)")
def evolve_frontier(run_dir: Path, objective: tuple[str, ...]) -> None:
    """Compute Pareto frontier for an evolve run."""
    from cyntra.evolve.pareto import pareto_frontier

    run_file = run_dir / "evolve_run.json"
    if not run_file.exists():
        console.print(f"[yellow]No evolve_run.json found in {run_dir}[/yellow]")
        return

    data = json.loads(run_file.read_text())
    objectives = _parse_objectives(objective) or data.get("objectives") or {}
    items = []
    for result in data.get("results") or []:
        metrics = result.get("metrics") or {}
        items.append({"genome_id": result.get("genome_id"), **metrics})

    frontier = pareto_frontier(items, objectives)
    payload = {
        "schema_version": "cyntra.frontier.v1",
        "objectives": objectives,
        "items": frontier,
    }
    (run_dir / "frontier.json").write_text(json.dumps(payload, indent=2))
    console.print(f"[green]✓[/green] Wrote frontier to {run_dir / 'frontier.json'}")


@evolve.command(name="promote")
@click.option("--frontier", type=Path, required=True, help="Frontier JSON path")
@click.pass_context
def evolve_promote(ctx: click.Context, frontier: Path) -> None:
    """Promote a frontier into prompts/frontier.json."""
    if not frontier.exists():
        console.print(f"[yellow]Frontier file not found: {frontier}[/yellow]")
        return

    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root
    prompts_root = repo_root / "prompts"
    prompts_root.mkdir(parents=True, exist_ok=True)

    destination = prompts_root / "frontier.json"
    destination.write_text(frontier.read_text())
    console.print(f"[green]✓[/green] Promoted frontier to {destination}")


@bench.command(name="run")
@click.option("--bench", "bench_ref", required=True, help="Bench module path or file")
@click.option(
    "--output", type=Path, help="Output directory (default: .cyntra/benches/<name>_<timestamp>)"
)
@click.option("--toolchain", type=str, help="Override dk_tool_hint for all cases")
@click.option("--prompt-genome", type=str, help="Override dk_prompt_genome_id for all cases")
@click.option("--temperature", type=float, help="Override sampling temperature for all cases")
@click.option("--top-p", type=float, help="Override sampling top_p for all cases")
@click.option("--max-concurrent", type=int, default=1, show_default=True)
@click.option("--limit", type=int, help="Run only the first N cases")
@click.pass_context
def bench_run(
    ctx: click.Context,
    bench_ref: str,
    output: Path | None,
    toolchain: str | None,
    prompt_genome: str | None,
    temperature: float | None,
    top_p: float | None,
    max_concurrent: int,
    limit: int | None,
) -> None:
    """Run a bench suite in an isolated `.cyntra/benches/` sandbox."""
    from cyntra.bench.runner import (
        prepare_bench_config,
        write_bench_beads,
        write_bench_config_snapshot,
        write_bench_report,
    )
    from cyntra.evolve.bench import load_bench
    from cyntra.kernel.config import KernelConfig
    from cyntra.kernel.runner import KernelRunner

    base_config = KernelConfig.load(ctx.obj["config_path"])
    bench_data = load_bench(bench_ref)
    if limit is not None:
        cases = bench_data.get("cases") or bench_data.get("tasks") or []
        if isinstance(cases, list):
            bench_data = dict(bench_data)
            bench_data["cases"] = cases[:limit]

    bench_name = str(bench_data.get("name") or bench_data.get("id") or Path(bench_ref).stem)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    default_dir = base_config.kernel_dir / "benches" / f"{bench_name}_{timestamp}"

    bench_dir = output
    if bench_dir is None:
        bench_dir = default_dir
    elif not bench_dir.is_absolute():
        bench_dir = (base_config.repo_root / bench_dir).resolve()

    bench_config = prepare_bench_config(
        base_config=base_config,
        bench_dir=bench_dir,
        max_concurrent=max_concurrent,
    )
    write_bench_config_snapshot(bench_config, bench_dir)

    sampling = {"temperature": temperature, "top_p": top_p}
    issue_ids = write_bench_beads(
        bench=bench_data,
        beads_dir=bench_config.beads_path,
        toolchain=toolchain or str(bench_data.get("toolchain") or ""),
        prompt_genome_id=prompt_genome,
        sampling=sampling,
        apply_patch=False,
    )

    console.print(f"[cyan]Bench:[/cyan] {bench_name} ({len(issue_ids)} case(s))")
    console.print(f"[dim]Output:[/dim] {bench_dir}")

    runner = KernelRunner(config=bench_config, max_concurrent=max_concurrent)
    runner.run()

    report_path = write_bench_report(
        bench=bench_data,
        bench_dir=bench_dir,
        toolchain=toolchain,
        prompt_genome_id=prompt_genome,
        sampling=sampling,
    )
    console.print(f"[green]✓[/green] Wrote bench report to {report_path}")


@main.group()
def flaky_tests() -> None:
    """Manage flaky tests."""
    pass


@flaky_tests.command(name="list")
@click.pass_context
def flaky_list(ctx: click.Context) -> None:
    """List known flaky tests."""
    from cyntra.gates.flaky import list_flaky_tests

    list_flaky_tests(ctx.obj["config_path"])


@flaky_tests.command(name="ignore")
@click.argument("test_name")
@click.pass_context
def flaky_ignore(ctx: click.Context, test_name: str) -> None:
    """Ignore a flaky test."""
    from cyntra.gates.flaky import ignore_flaky_test

    ignore_flaky_test(ctx.obj["config_path"], test_name)


@flaky_tests.command(name="clear")
@click.pass_context
def flaky_clear(ctx: click.Context) -> None:
    """Clear flaky test data."""
    from cyntra.gates.flaky import clear_flaky_tests

    clear_flaky_tests(ctx.obj["config_path"])


@main.command()
@click.argument("issue_id")
@click.option("--reason", required=True, help="Reason for escalation")
@click.pass_context
def escalate(ctx: click.Context, issue_id: str, reason: str) -> None:
    """Manual escalation of an issue."""
    from cyntra.kernel.escalation import manual_escalate

    manual_escalate(ctx.obj["config_path"], issue_id, reason)
    console.print(f"[yellow]⚠[/yellow] Issue {issue_id} escalated: {reason}")


@main.command()
@click.option("--all", "remove_all", is_flag=True, help="Remove all workcells")
@click.option("--older-than", type=int, help="Remove workcells older than N days")
@click.option("--keep-logs", is_flag=True, help="Keep log archives")
@click.pass_context
def cleanup(
    ctx: click.Context,
    remove_all: bool,
    older_than: int | None,
    keep_logs: bool,
) -> None:
    """Cleanup workcells."""
    from cyntra.workcell.cleanup import cleanup_workcells

    count = cleanup_workcells(
        ctx.obj["config_path"],
        remove_all=remove_all,
        older_than_days=older_than,
        keep_logs=keep_logs,
    )
    console.print(f"[green]✓[/green] Cleaned up {count} workcells")


@main.group()
def planner() -> None:
    """Swarm planner dataset + training utilities."""
    pass


@planner.command(name="stats")
@click.option("--include-world/--no-include-world", default=True, help="Include fab-world runs")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def planner_stats(ctx: click.Context, include_world: bool, as_json: bool) -> None:
    """Summarize available planner training examples from local artifacts."""
    from cyntra.planner.dataset import collect_run_summaries, infer_default_universe_id

    config_path = Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")).resolve()
    repo_root = config_path.parent.parent
    summaries = collect_run_summaries(repo_root=repo_root, include_world=include_world)

    counts: dict[str, int] = {}
    by_domain: dict[str, int] = {}
    for s in summaries:
        jt = str(s.get("job_type") or "unknown")
        counts[jt] = counts.get(jt, 0) + 1
        domain = str(s.get("domain") or "unknown")
        by_domain[domain] = by_domain.get(domain, 0) + 1

    payload = {
        "example_count": len(summaries),
        "by_job_type": dict(sorted(counts.items())),
        "by_domain": dict(sorted(by_domain.items())),
        "default_universe_id": infer_default_universe_id(repo_root),
    }
    if as_json:
        console.print_json(data=payload)
        return

    table = Table(title="Planner Dataset Stats")
    table.add_column("Key")
    table.add_column("Value")
    table.add_row("examples", str(payload["example_count"]))
    table.add_row("default_universe_id", str(payload["default_universe_id"]))
    table.add_row("by_job_type", json.dumps(payload["by_job_type"]))
    table.add_row("by_domain", json.dumps(payload["by_domain"]))
    console.print(table)


@planner.command(name="build-dataset")
@click.option(
    "--out",
    "out_dir",
    type=Path,
    default=Path(".cyntra/benches/planner_dataset_v1"),
    show_default=True,
    help="Output directory",
)
@click.option("--universe", "universe_id", type=str, default=None, help="Universe ID (optional)")
@click.option(
    "--n-similar", type=int, default=8, show_default=True, help="Similar runs per example"
)
@click.option("--include-world/--no-include-world", default=True, help="Include fab-world runs")
@click.pass_context
def planner_build_dataset(
    ctx: click.Context,
    out_dir: Path,
    universe_id: str | None,
    n_similar: int,
    include_world: bool,
) -> None:
    """Build a deterministic planner dataset from `.cyntra/*` and `.beads/*` artifacts."""
    from cyntra.planner.dataset import build_and_write_dataset

    config_path = Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")).resolve()
    repo_root = config_path.parent.parent
    meta = build_and_write_dataset(
        repo_root=repo_root,
        out_dir=out_dir,
        include_world=include_world,
        n_similar=n_similar,
        universe_id=universe_id,
    )
    console.print(f"[green]✓[/green] Wrote planner dataset to {out_dir}")
    console.print_json(data=meta)


@planner.command(name="build-outcome-dataset")
@click.option(
    "--bench",
    "bench_dir",
    type=Path,
    default=Path(".cyntra/benches/planner_best_of_k_v1"),
    show_default=True,
    help="Bench run directory (or base dir containing run_*/)",
)
@click.option(
    "--out",
    "out_dir",
    type=Path,
    default=Path(".cyntra/benches/planner_outcome_dataset_v1"),
    show_default=True,
    help="Output directory",
)
@click.pass_context
def planner_build_outcome_dataset(ctx: click.Context, bench_dir: Path, out_dir: Path) -> None:
    """Build a winner-labeled dataset from a best-of-K bench run (Stage B labels)."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.planner.outcome_dataset import (
        build_outcome_dataset_rows,
        resolve_bench_run_dir,
        write_outcome_dataset,
    )

    config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = config.repo_root

    if not bench_dir.is_absolute():
        bench_dir = (repo_root / bench_dir).resolve()
    bench_run_dir = resolve_bench_run_dir(bench_dir)
    if bench_run_dir is None:
        raise click.ClickException(f"Bench run dir not found under: {bench_dir}")

    if not out_dir.is_absolute():
        out_dir = (repo_root / out_dir).resolve()

    rows, meta = build_outcome_dataset_rows(bench_run_dir)
    write_outcome_dataset(out_dir, rows, meta=meta)
    console.print(f"[green]✓[/green] Wrote outcome dataset to {out_dir}")
    console.print_json(data=meta)


@planner.command(name="train")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to dataset.jsonl",
)
@click.option(
    "--out",
    "out_dir",
    type=Path,
    default=Path(".cyntra/models/planner_mlp_v1"),
    show_default=True,
    help="Output model bundle directory",
)
@click.option("--seq-len", type=int, default=512, show_default=True)
@click.option("--d-model", type=int, default=128, show_default=True)
@click.option("--hidden-dim", type=int, default=256, show_default=True)
@click.option("--dropout", type=float, default=0.1, show_default=True)
@click.option("--epochs", type=int, default=10, show_default=True)
@click.option("--batch-size", type=int, default=32, show_default=True)
@click.option("--lr", type=float, default=3e-4, show_default=True)
@click.option("--seed", type=int, default=42, show_default=True)
@click.pass_context
def planner_train(
    ctx: click.Context,
    dataset_path: Path,
    out_dir: Path,
    seq_len: int,
    d_model: int,
    hidden_dim: int,
    dropout: float,
    epochs: int,
    batch_size: int,
    lr: float,
    seed: int,
) -> None:
    """Train a baseline planner policy (MLP) from a dataset."""
    from cyntra.planner.training.train import TrainConfig, train_mlp

    config_path = Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")).resolve()
    repo_root = config_path.parent.parent

    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()
    if not out_dir.is_absolute():
        out_dir = (repo_root / out_dir).resolve()

    cfg = TrainConfig(
        seq_len=seq_len,
        d_model=d_model,
        hidden_dim=hidden_dim,
        dropout=dropout,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        seed=seed,
    )
    metrics = train_mlp(dataset_path=dataset_path, out_dir=out_dir, config=cfg)
    console.print(f"[green]✓[/green] Trained planner MLP to {out_dir}")
    console.print_json(data=metrics)


@planner.command(name="train-transformer")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to dataset.jsonl",
)
@click.option(
    "--out",
    "out_dir",
    type=Path,
    default=Path(".cyntra/models/planner_transformer_v1"),
    show_default=True,
    help="Output model bundle directory",
)
@click.option("--seq-len", type=int, default=512, show_default=True)
@click.option("--d-model", type=int, default=128, show_default=True)
@click.option("--hidden-dim", type=int, default=512, show_default=True, help="Transformer FF dim")
@click.option("--n-layers", type=int, default=2, show_default=True)
@click.option("--n-heads", type=int, default=4, show_default=True)
@click.option("--dropout", type=float, default=0.1, show_default=True)
@click.option("--epochs", type=int, default=10, show_default=True)
@click.option("--batch-size", type=int, default=32, show_default=True)
@click.option("--lr", type=float, default=3e-4, show_default=True)
@click.option("--seed", type=int, default=42, show_default=True)
@click.pass_context
def planner_train_transformer(
    ctx: click.Context,
    dataset_path: Path,
    out_dir: Path,
    seq_len: int,
    d_model: int,
    hidden_dim: int,
    n_layers: int,
    n_heads: int,
    dropout: float,
    epochs: int,
    batch_size: int,
    lr: float,
    seed: int,
) -> None:
    """Train a Transformer encoder baseline planner from a dataset."""
    from cyntra.planner.training.train import TrainConfig, train_transformer

    config_path = Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")).resolve()
    repo_root = config_path.parent.parent

    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()
    if not out_dir.is_absolute():
        out_dir = (repo_root / out_dir).resolve()

    cfg = TrainConfig(
        seq_len=seq_len,
        d_model=d_model,
        hidden_dim=hidden_dim,
        n_layers=n_layers,
        n_heads=n_heads,
        dropout=dropout,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        seed=seed,
    )
    metrics = train_transformer(dataset_path=dataset_path, out_dir=out_dir, config=cfg)
    console.print(f"[green]✓[/green] Trained planner Transformer to {out_dir}")
    console.print_json(data=metrics)


@planner.command(name="train-recurrent")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to dataset.jsonl",
)
@click.option(
    "--out",
    "out_dir",
    type=Path,
    default=Path(".cyntra/models/planner_recurrent_v1"),
    show_default=True,
    help="Output model bundle directory",
)
@click.option("--seq-len", type=int, default=512, show_default=True)
@click.option("--d-model", type=int, default=128, show_default=True)
@click.option("--n-layers", type=int, default=2, show_default=True, help="GRU layers")
@click.option("--dropout", type=float, default=0.1, show_default=True)
@click.option(
    "--tbptt-len", type=int, default=64, show_default=True, help="Truncated BPTT chunk length"
)
@click.option("--epochs", type=int, default=10, show_default=True)
@click.option("--batch-size", type=int, default=32, show_default=True)
@click.option("--lr", type=float, default=3e-4, show_default=True)
@click.option("--seed", type=int, default=42, show_default=True)
@click.pass_context
def planner_train_recurrent(
    ctx: click.Context,
    dataset_path: Path,
    out_dir: Path,
    seq_len: int,
    d_model: int,
    n_layers: int,
    dropout: float,
    tbptt_len: int,
    epochs: int,
    batch_size: int,
    lr: float,
    seed: int,
) -> None:
    """Train a recurrent (GRU) planner model with truncated BPTT."""
    from cyntra.planner.training.train import TrainConfig, train_recurrent

    config_path = Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")).resolve()
    repo_root = config_path.parent.parent

    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()
    if not out_dir.is_absolute():
        out_dir = (repo_root / out_dir).resolve()

    cfg = TrainConfig(
        seq_len=seq_len,
        d_model=d_model,
        n_layers=n_layers,
        dropout=dropout,
        tbptt_len=tbptt_len,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        seed=seed,
    )
    metrics = train_recurrent(dataset_path=dataset_path, out_dir=out_dir, config=cfg)
    console.print(f"[green]✓[/green] Trained planner recurrent model to {out_dir}")
    console.print_json(data=metrics)


@planner.command(name="infer")
@click.option(
    "--bundle",
    "bundle_dir",
    type=Path,
    default=Path(".cyntra/models/planner_mlp_v1"),
    show_default=True,
    help="Planner model bundle directory (contains planner.onnx + vocab.json)",
)
@click.option("--issue", "issue_id", required=True, type=str, help="Beads issue id")
@click.option("--universe", "universe_id", type=str, default=None, help="Universe id (optional)")
@click.option("--json", "as_json", is_flag=True, help="JSON output only")
@click.pass_context
def planner_infer(
    ctx: click.Context,
    bundle_dir: Path,
    issue_id: str,
    universe_id: str | None,
    as_json: bool,
) -> None:
    """Run planner inference on an issue using an ONNX bundle (offline)."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.kernel.dispatcher import Dispatcher
    from cyntra.planner.action_space import action_space_for_swarms
    from cyntra.planner.artifacts import (
        build_planner_input_v1,
        collect_history_candidates,
        system_state_snapshot,
    )
    from cyntra.planner.dataset import (
        infer_default_universe_id,
        load_universe_defaults,
        load_universe_swarm_ids,
    )
    from cyntra.planner.inference import OnnxPlanner
    from cyntra.state.manager import StateManager

    config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = config.repo_root

    resolved_universe = universe_id or infer_default_universe_id(repo_root) or "unknown"
    swarm_ids = load_universe_swarm_ids(repo_root, resolved_universe)
    defaults = load_universe_defaults(repo_root, resolved_universe)
    action_space = action_space_for_swarms(swarm_ids)

    state = StateManager(config)
    graph = state.load_beads_graph()
    issue = next((i for i in graph.issues if i.id == issue_id), None)
    if issue is None:
        raise click.ClickException(f"Issue not found in Beads: {issue_id}")

    dispatcher = Dispatcher(config)
    system_state = system_state_snapshot(
        active_workcells=0,
        queue_depth=len([i for i in graph.issues if i.status in ("open", "ready")]),
        available_toolchains=dispatcher.get_available_toolchains()
        or list(config.toolchain_priority),
    )

    job_type = "fab-world" if "asset:world" in (issue.tags or []) else "code"
    history_candidates = collect_history_candidates(repo_root=repo_root, include_world=False)

    planner_input = build_planner_input_v1(
        issue=issue,
        job_type=job_type,
        universe_id=resolved_universe,
        universe_defaults=defaults,
        action_space=action_space,
        history_candidates=history_candidates,
        system_state=system_state,
    )

    if not bundle_dir.is_absolute():
        bundle_dir = (repo_root / bundle_dir).resolve()
    planner = OnnxPlanner(bundle_dir)
    action = planner.predict_action(planner_input)

    if as_json:
        console.print_json(data=action)
        return

    console.print(f"[bold]Issue[/bold] #{issue.id}: {issue.title}")
    console.print_json(data={"planner_input": planner_input, "planner_action": action})


@planner.command(name="eval")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to dataset.jsonl",
)
@click.option(
    "--bundle",
    "bundle_dir",
    type=Path,
    default=None,
    help="Optional ONNX bundle directory to evaluate",
)
@click.option(
    "--split",
    type=click.Choice(["all", "train", "val", "test"], case_sensitive=False),
    default="all",
    show_default=True,
)
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def planner_eval(
    ctx: click.Context,
    dataset_path: Path,
    bundle_dir: Path | None,
    split: str,
    as_json: bool,
) -> None:
    """Offline evaluation for planner datasets (baselines + optional ONNX bundle)."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.planner.action_space import NA
    from cyntra.planner.eval import action_tuple, evaluate_predictions, load_dataset_rows
    from cyntra.planner.inference import OnnxPlanner

    config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = config.repo_root
    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()

    rows = load_dataset_rows(dataset_path)
    if split.lower() != "all":
        rows = [r for r in rows if str(r.get("split") or "").lower() == split.lower()]

    def _default_baseline(row: dict) -> tuple | None:
        pi = row.get("planner_input")
        if not isinstance(pi, dict):
            return None
        defaults = pi.get("universe_defaults")
        defaults = defaults if isinstance(defaults, dict) else {}
        swarm = defaults.get("swarm_id")
        swarm_id = str(swarm) if isinstance(swarm, str) and swarm else "serial_handoff"
        max_candidates = 1 if swarm_id == "serial_handoff" else 2
        return (swarm_id, max_candidates, NA, NA)

    def _risk_baseline(row: dict) -> tuple | None:
        pi = row.get("planner_input")
        if not isinstance(pi, dict):
            return None
        issue = pi.get("issue")
        issue = issue if isinstance(issue, dict) else {}
        risk = str(issue.get("dk_risk") or "medium")
        if risk == "critical":
            return ("speculate_vote", 3, NA, NA)
        if risk == "high":
            return ("speculate_vote", 2, NA, NA)
        return ("serial_handoff", 1, NA, NA)

    gold_pairs = []
    default_pairs = []
    risk_pairs = []
    model_pairs = []

    planner = None
    if bundle_dir is not None:
        if not bundle_dir.is_absolute():
            bundle_dir = (repo_root / bundle_dir).resolve()
        planner = OnnxPlanner(bundle_dir)

    for row in rows:
        label = row.get("label_action")
        if not isinstance(label, dict):
            continue
        gold = action_tuple(label)
        if gold is None:
            continue
        pred_default = _default_baseline(row)
        if pred_default is not None:
            default_pairs.append((pred_default, gold))
        pred_risk = _risk_baseline(row)
        if pred_risk is not None:
            risk_pairs.append((pred_risk, gold))
        if planner is not None:
            pi = row.get("planner_input")
            if isinstance(pi, dict):
                pred = planner.predict_action(pi)
                pred_tuple = action_tuple(pred)
                if pred_tuple is not None:
                    model_pairs.append((pred_tuple, gold))
        gold_pairs.append((gold, gold))

    report: dict[str, Any] = {
        "schema_version": "cyntra.planner_eval_report.v1",
        "dataset": str(dataset_path),
        "split": split.lower(),
        "examples": len(gold_pairs),
        "baseline_defaults": evaluate_predictions(default_pairs).to_dict(),
        "baseline_risk": evaluate_predictions(risk_pairs).to_dict(),
    }
    if model_pairs:
        report["onnx_bundle"] = str(bundle_dir)
        report["model"] = evaluate_predictions(model_pairs).to_dict()

    if as_json:
        console.print_json(data=report)
        return

    table = Table(title="Planner Eval")
    table.add_column("Model")
    table.add_column("Exact")
    table.add_column("Swarm Acc")
    table.add_column("Entropy")
    for name, metrics in [
        ("defaults", report["baseline_defaults"]),
        ("risk", report["baseline_risk"]),
        ("onnx", report.get("model")),
    ]:
        if not isinstance(metrics, dict):
            continue
        table.add_row(
            name,
            f"{metrics.get('exact_match'):.3f}",
            f"{metrics.get('acc_swarm'):.3f}",
            f"{metrics.get('swarm_entropy'):.3f}",
        )
    console.print(table)


@planner.command(name="ablate")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to dataset.jsonl",
)
@click.option(
    "--bundle",
    "bundle_dirs",
    type=Path,
    multiple=True,
    help="ONNX bundle directory to evaluate (repeatable)",
)
@click.option(
    "--split",
    type=click.Choice(["all", "train", "val", "test"], case_sensitive=False),
    default="test",
    show_default=True,
)
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def planner_ablate(
    ctx: click.Context,
    dataset_path: Path,
    bundle_dirs: tuple[Path, ...],
    split: str,
    as_json: bool,
) -> None:
    """Compare multiple planner bundles on the same dataset split."""
    import statistics

    from cyntra.kernel.config import KernelConfig
    from cyntra.planner.eval import action_tuple, evaluate_predictions, load_dataset_rows
    from cyntra.planner.inference import OnnxPlanner

    def _quantile(values: list[float], q: float) -> float | None:
        if not values:
            return None
        xs = sorted(values)
        idx = int(round(q * float(len(xs) - 1)))
        return float(xs[max(0, min(len(xs) - 1, idx))])

    config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = config.repo_root
    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()

    rows = load_dataset_rows(dataset_path)
    if split.lower() != "all":
        rows = [r for r in rows if str(r.get("split") or "").lower() == split.lower()]

    from cyntra.planner.action_space import NA

    def _default_baseline(row: dict) -> tuple | None:
        pi = row.get("planner_input")
        if not isinstance(pi, dict):
            return None
        defaults = pi.get("universe_defaults")
        defaults = defaults if isinstance(defaults, dict) else {}
        swarm = defaults.get("swarm_id")
        swarm_id = str(swarm) if isinstance(swarm, str) and swarm else "serial_handoff"
        max_candidates = 1 if swarm_id == "serial_handoff" else 2
        return (swarm_id, max_candidates, NA, NA)

    def _risk_baseline(row: dict) -> tuple | None:
        pi = row.get("planner_input")
        if not isinstance(pi, dict):
            return None
        issue = pi.get("issue")
        issue = issue if isinstance(issue, dict) else {}
        risk = str(issue.get("dk_risk") or "medium")
        if risk == "critical":
            return ("speculate_vote", 3, NA, NA)
        if risk == "high":
            return ("speculate_vote", 2, NA, NA)
        return ("serial_handoff", 1, NA, NA)

    gold: list[tuple] = []
    default_pairs = []
    risk_pairs = []

    for row in rows:
        label = row.get("label_action")
        if not isinstance(label, dict):
            continue
        gold_tuple = action_tuple(label)
        if gold_tuple is None:
            continue
        gold.append(gold_tuple)
        pred_default = _default_baseline(row)
        if pred_default is not None:
            default_pairs.append((pred_default, gold_tuple))
        pred_risk = _risk_baseline(row)
        if pred_risk is not None:
            risk_pairs.append((pred_risk, gold_tuple))

    report: dict[str, Any] = {
        "schema_version": "cyntra.planner_ablation_report.v1",
        "dataset": str(dataset_path),
        "split": split.lower(),
        "examples": len(gold),
        "baseline_defaults": evaluate_predictions(default_pairs).to_dict(),
        "baseline_risk": evaluate_predictions(risk_pairs).to_dict(),
        "bundles": {},
    }

    for bundle_dir in bundle_dirs:
        resolved = bundle_dir
        if not resolved.is_absolute():
            resolved = (repo_root / resolved).resolve()
        planner = OnnxPlanner(resolved)

        pairs = []
        confidences: list[float] = []
        for row in rows:
            label = row.get("label_action")
            if not isinstance(label, dict):
                continue
            gold_tuple = action_tuple(label)
            if gold_tuple is None:
                continue
            pi = row.get("planner_input")
            if not isinstance(pi, dict):
                continue
            pred = planner.predict_action(pi)
            pred_tuple = action_tuple(pred)
            if pred_tuple is None:
                continue
            pairs.append((pred_tuple, gold_tuple))
            conf = pred.get("confidence")
            if isinstance(conf, (int, float)):
                confidences.append(float(conf))

        metrics = evaluate_predictions(pairs).to_dict()
        metrics["confidence_mean"] = statistics.fmean(confidences) if confidences else None
        metrics["confidence_p10"] = _quantile(confidences, 0.10)
        metrics["confidence_p50"] = _quantile(confidences, 0.50)
        metrics["confidence_p90"] = _quantile(confidences, 0.90)
        report["bundles"][resolved.name] = {
            "bundle_dir": str(resolved),
            "metrics": metrics,
        }

    if as_json:
        console.print_json(data=report)
        return

    table = Table(title="Planner Ablations")
    table.add_column("Model")
    table.add_column("Exact")
    table.add_column("Swarm Acc")
    table.add_column("Entropy")
    table.add_column("Conf p50")
    for name, metrics in [
        ("defaults", report["baseline_defaults"]),
        ("risk", report["baseline_risk"]),
    ]:
        if not isinstance(metrics, dict):
            continue
        table.add_row(
            name,
            f"{metrics.get('exact_match'):.3f}",
            f"{metrics.get('acc_swarm'):.3f}",
            f"{metrics.get('swarm_entropy'):.3f}",
            "NA",
        )
    bundles = report.get("bundles") if isinstance(report.get("bundles"), dict) else {}
    for name, entry in bundles.items():
        metrics = entry.get("metrics") if isinstance(entry, dict) else None
        if not isinstance(metrics, dict):
            continue
        p50 = metrics.get("confidence_p50")
        table.add_row(
            str(name),
            f"{metrics.get('exact_match'):.3f}",
            f"{metrics.get('acc_swarm'):.3f}",
            f"{metrics.get('swarm_entropy'):.3f}",
            f"{p50:.3f}" if isinstance(p50, (int, float)) else "NA",
        )
    console.print(table)


@planner.command(name="eval-outcomes")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_outcome_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to outcome dataset.jsonl (from planner build-outcome-dataset)",
)
@click.option(
    "--bundle",
    "bundle_dir",
    type=Path,
    default=None,
    help="Optional ONNX bundle directory to evaluate",
)
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def planner_eval_outcomes(
    ctx: click.Context,
    dataset_path: Path,
    bundle_dir: Path | None,
    as_json: bool,
) -> None:
    """Evaluate policies against best-of-K outcomes (pass rate / regret vs oracle-in-bench)."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.planner.outcome_eval import evaluate_outcome_dataset

    config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = config.repo_root

    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()
    if bundle_dir is not None and not bundle_dir.is_absolute():
        bundle_dir = (repo_root / bundle_dir).resolve()

    report = evaluate_outcome_dataset(dataset_path=dataset_path, bundle_dir=bundle_dir)
    if as_json:
        console.print_json(data=report)
        return

    table = Table(title="Planner Outcome Eval")
    table.add_column("Model")
    table.add_column("Pass Rate")
    table.add_column("Oracle Match")
    table.add_column("Regret (ms)")
    for name, metrics in [
        ("baseline", report.get("baseline")),
        ("onnx", report.get("model")),
    ]:
        if not isinstance(metrics, dict):
            continue
        regret = metrics.get("mean_regret_ms")
        table.add_row(
            name,
            f"{metrics.get('pass_rate'):.3f}",
            f"{metrics.get('oracle_match_rate'):.3f}"
            if metrics.get("oracle_match_rate") is not None
            else "NA",
            f"{regret:.1f}" if isinstance(regret, (int, float)) else "NA",
        )
    console.print(table)


@planner.command(name="ablate-outcomes")
@click.option(
    "--dataset",
    "dataset_path",
    type=Path,
    default=Path(".cyntra/benches/planner_outcome_dataset_v1/dataset.jsonl"),
    show_default=True,
    help="Path to outcome dataset.jsonl (from planner build-outcome-dataset)",
)
@click.option(
    "--bundle",
    "bundle_dirs",
    type=Path,
    multiple=True,
    help="ONNX bundle directory to evaluate (repeatable)",
)
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def planner_ablate_outcomes(
    ctx: click.Context,
    dataset_path: Path,
    bundle_dirs: tuple[Path, ...],
    as_json: bool,
) -> None:
    """Compare multiple planner bundles on outcome metrics (regret/pass rate vs oracle-in-bench)."""
    from cyntra.kernel.config import KernelConfig
    from cyntra.planner.outcome_eval import evaluate_outcome_dataset

    config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = config.repo_root

    if not dataset_path.is_absolute():
        dataset_path = (repo_root / dataset_path).resolve()

    baseline_report = evaluate_outcome_dataset(dataset_path=dataset_path, bundle_dir=None)
    report: dict[str, Any] = {
        "schema_version": "cyntra.planner_outcome_ablation_report.v1",
        "dataset": str(dataset_path),
        "baseline": baseline_report.get("baseline"),
        "oracle": baseline_report.get("oracle"),
        "bundles": {},
    }

    for bundle in bundle_dirs:
        resolved = bundle
        if not resolved.is_absolute():
            resolved = (repo_root / resolved).resolve()
        model_report = evaluate_outcome_dataset(dataset_path=dataset_path, bundle_dir=resolved)
        report["bundles"][resolved.name] = {
            "bundle_dir": str(resolved),
            "metrics": model_report.get("model"),
        }

    if as_json:
        console.print_json(data=report)
        return

    table = Table(title="Planner Outcome Ablations")
    table.add_column("Model")
    table.add_column("Pass Rate")
    table.add_column("Oracle Match")
    table.add_column("Regret (ms)")

    baseline = report.get("baseline") if isinstance(report.get("baseline"), dict) else None
    if baseline is not None:
        table.add_row(
            "baseline",
            f"{baseline.get('pass_rate'):.3f}",
            f"{baseline.get('oracle_match_rate'):.3f}"
            if baseline.get("oracle_match_rate") is not None
            else "NA",
            "NA",
        )

    bundles = report.get("bundles") if isinstance(report.get("bundles"), dict) else {}
    for name, entry in bundles.items():
        metrics = entry.get("metrics") if isinstance(entry, dict) else None
        if not isinstance(metrics, dict):
            continue
        regret = metrics.get("mean_regret_ms")
        table.add_row(
            str(name),
            f"{metrics.get('pass_rate'):.3f}",
            f"{metrics.get('oracle_match_rate'):.3f}"
            if metrics.get("oracle_match_rate") is not None
            else "NA",
            f"{regret:.1f}" if isinstance(regret, (int, float)) else "NA",
        )
    console.print(table)


@planner.command(name="best-of-k")
@click.option("--issue", "issue_ids", multiple=True, help="Issue id(s) to bench (repeatable)")
@click.option("--max-cases", type=int, default=None, help="Limit number of issues")
@click.option("--k", type=int, default=6, show_default=True, help="Candidates per issue")
@click.option("--seed", type=int, default=42, show_default=True)
@click.option("--universe", "universe_id", type=str, default=None, help="Universe id (optional)")
@click.option(
    "--out",
    "out_base",
    type=Path,
    default=Path(".cyntra/benches/planner_best_of_k_v1"),
    show_default=True,
    help="Base output directory (run will create a timestamped subdir)",
)
@click.option(
    "--toolchain", "toolchain_override", type=str, default=None, help="Force toolchain (debug)"
)
@click.pass_context
def planner_best_of_k(
    ctx: click.Context,
    issue_ids: tuple[str, ...],
    max_cases: int | None,
    k: int,
    seed: int,
    universe_id: str | None,
    out_base: Path,
    toolchain_override: str | None,
) -> None:
    """Run a best-of-K outcome bench to generate winner labels (can be expensive)."""
    import asyncio

    from cyntra.kernel.config import KernelConfig
    from cyntra.planner.action_space import action_space_for_swarms
    from cyntra.planner.artifacts import collect_history_candidates
    from cyntra.planner.bench import BenchConfig, run_best_of_k_bench
    from cyntra.planner.dataset import (
        infer_default_universe_id,
        load_universe_defaults,
        load_universe_swarm_ids,
    )
    from cyntra.state.manager import StateManager

    base_config = KernelConfig.load(Path(ctx.obj.get("config_path") or Path(".cyntra/config.yaml")))
    repo_root = base_config.repo_root

    resolved_universe = universe_id or infer_default_universe_id(repo_root) or "unknown"
    swarm_ids = load_universe_swarm_ids(repo_root, resolved_universe)
    defaults = load_universe_defaults(repo_root, resolved_universe)
    action_space = action_space_for_swarms(swarm_ids)

    state = StateManager(base_config)
    graph = state.load_beads_graph()
    issues: list[Any] = []
    wanted = set(issue_ids)
    for issue in graph.issues:
        if wanted and issue.id not in wanted:
            continue
        issues.append(issue)

    if not issues:
        raise click.ClickException("No issues selected (use --issue <id> ...)")

    now_ms = int(datetime.now(UTC).timestamp() * 1000)
    history_candidates = collect_history_candidates(repo_root=repo_root, include_world=False)
    bench_cfg = BenchConfig(
        universe_id=resolved_universe,
        universe_defaults=defaults,
        action_space=action_space,
        k=k,
        seed=seed,
        now_ms=now_ms,
        history_candidates=history_candidates,
    )

    if not out_base.is_absolute():
        out_base = (repo_root / out_base).resolve()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    bench_dir = out_base / f"run_{stamp}"

    report = asyncio.run(
        run_best_of_k_bench(
            base_config=base_config,
            bench_dir=bench_dir,
            issues=issues,
            bench_cfg=bench_cfg,
            max_cases=max_cases,
            toolchain_override=toolchain_override,
        )
    )
    console.print(f"[green]✓[/green] Wrote best-of-K bench to {bench_dir}")
    console.print_json(data=report)


def _normalize_cocoindex_row(row: object) -> dict[str, Any] | None:
    if isinstance(row, dict):
        return row
    if isinstance(row, list):
        out: dict[str, Any] = {}
        for item in row:
            if not isinstance(item, list | tuple) or len(item) != 2:
                return None
            key, value = item
            if not isinstance(key, str):
                return None
            out[key] = value
        return out
    return None


def _encode_cyntra_query(query: str, args: dict[str, object]) -> str:
    if not args:
        return query
    lines: list[str] = []
    for key in sorted(args.keys()):
        value = args[key]
        if value is None:
            continue
        lines.append(f"{key}={value}")
    if not lines:
        return query
    return "\n".join([query.rstrip(), "[CYNTRA_ARGS]", *lines, "[/CYNTRA_ARGS]"]).strip()


def _cocoindex_server_url(server_url: str | None) -> str:
    raw = server_url or os.environ.get("CYNTRA_COCOINDEX_SERVER_URL") or "http://127.0.0.1:8020"
    return raw.rstrip("/")


def _cocoindex_query_handler(
    *,
    server_url: str,
    handler: str,
    query: str,
) -> dict[str, Any]:
    url = (
        f"{server_url}/cocoindex/api/flows/CyntraIndex/queryHandlers/{handler}"
        f"?query={urllib.parse.quote(query, safe='')}"
    )
    with urllib.request.urlopen(url) as resp:  # noqa: S310
        payload = json.loads(resp.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise click.ClickException("Invalid CocoIndex response (expected object)")
    return payload


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return slug or "memory"


def _split_markdown_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    raw = text.lstrip("\ufeff")
    if not raw.startswith("---"):
        return {}, text
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, text
    import yaml  # type: ignore[import-untyped]

    fm_raw = parts[1].strip("\n")
    body = parts[2].lstrip("\n")
    try:
        data = yaml.safe_load(fm_raw)
    except yaml.YAMLError:
        return {}, body
    return (data if isinstance(data, dict) else {}), body


def _render_markdown_frontmatter(frontmatter: dict[str, Any], body: str) -> str:
    import yaml  # type: ignore[import-untyped]

    fm_text = yaml.safe_dump(frontmatter, sort_keys=False).strip()
    return "\n".join(["---", fm_text, "---", "", body.lstrip("\n")]).rstrip() + "\n"


@main.group()
def memory() -> None:
    """Draft + promote Markdown memories (shared canon + private drafts)."""


@memory.command(name="draft-from-search")
@click.option("--title", required=True, help="Memory title")
@click.option("--query", "search_query", required=True, help="Search query to pull evidence from")
@click.option("--issue-id", type=str, help="Attach to a Beads issue_id (optional but recommended)")
@click.option("--k", type=int, default=8, show_default=True, help="Top-K evidence hits to fetch")
@click.option(
    "--select",
    "select_index",
    type=int,
    default=0,
    show_default=True,
    help="Which hit index to cite (0-based)",
)
@click.option("--server-url", type=str, help="CocoIndex server URL (default: CYNTRA_COCOINDEX_SERVER_URL)")
@click.pass_context
def memory_draft_from_search(
    ctx: click.Context,
    title: str,
    search_query: str,
    issue_id: str | None,
    k: int,
    select_index: int,
    server_url: str | None,
) -> None:
    """Create a private draft memory in `.cyntra/memories/` from a CocoIndex search hit."""
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root
    draft_dir = repo_root / ".cyntra" / "memories"
    draft_dir.mkdir(parents=True, exist_ok=True)

    server = _cocoindex_server_url(server_url)
    query = _encode_cyntra_query(search_query, {"k": k})
    payload = _cocoindex_query_handler(server_url=server, handler="search_artifacts", query=query)
    raw_results = payload.get("results")
    if not isinstance(raw_results, list) or not raw_results:
        raise click.ClickException("No search results returned")

    results: list[dict[str, Any]] = []
    for row in raw_results:
        norm = _normalize_cocoindex_row(row)
        if norm:
            results.append(norm)

    if select_index < 0 or select_index >= len(results):
        raise click.ClickException(f"--select out of range (got {select_index}, results={len(results)})")

    hit = results[select_index]
    repo_path = str(hit.get("repo_path") or "")
    run_id = hit.get("run_id")
    artifact_id = hit.get("artifact_id")
    start = hit.get("start")
    end = hit.get("end")
    score = hit.get("score")
    snippet = str(hit.get("snippet") or "")

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    memory_id = f"mem_{_slugify(title)[:48]}_{uuid.uuid4().hex[:8]}"
    out_path = draft_dir / f"{memory_id}.md"

    excerpt_hash = hashlib.sha256(snippet.encode("utf-8")).hexdigest() if snippet else None
    citations: list[dict[str, Any]] = [
        {
            "kind": "cocoindex_chunk",
            "repo_path": repo_path or None,
            "run_id": run_id,
            "issue_id": issue_id,
            "artifact_id": artifact_id,
            "start": start,
            "end": end,
            "score": score,
            "excerpt_hash": excerpt_hash,
            "source_query": search_query,
        }
    ]

    frontmatter: dict[str, Any] = {
        "memory_id": memory_id,
        "title": title,
        "status": "draft",
        "agent": "human",
        "type": "context",
        "scope": "individual",
        "tags": [],
        "related_issue_ids": [issue_id] if issue_id else [],
        "created_at": now,
        "updated_at": now,
        "citations": citations,
    }

    body_lines: list[str] = []
    body_lines.append(f"# {title}")
    body_lines.append("")
    body_lines.append("## Memory")
    body_lines.append("")
    body_lines.append("_Write the distilled memory here._")
    body_lines.append("")
    body_lines.append("## Evidence")
    body_lines.append("")
    body_lines.append(f"- repo_path: `{repo_path}`")
    if run_id:
        body_lines.append(f"- run_id: `{run_id}`")
    if artifact_id:
        body_lines.append(f"- artifact_id: `{artifact_id}`")
    if start is not None and end is not None:
        body_lines.append(f"- span: {start}..{end}")
    if score is not None:
        body_lines.append(f"- score: {score}")
    if snippet:
        body_lines.append("")
        body_lines.append("```text")
        body_lines.append(snippet[:2000])
        body_lines.append("```")
    body = "\n".join(body_lines).rstrip() + "\n"

    out_path.write_text(_render_markdown_frontmatter(frontmatter, body), encoding="utf-8")
    console.print(f"[green]✓[/green] Wrote draft memory: {out_path}")


@memory.command(name="promote")
@click.argument("draft_path", type=Path)
@click.option(
    "--status",
    type=click.Choice(["reviewed", "canonical"], case_sensitive=False),
    default="reviewed",
    show_default=True,
)
@click.option("--keep-draft", is_flag=True, help="Keep the original draft file")
@click.pass_context
def memory_promote(
    ctx: click.Context,
    draft_path: Path,
    status: str,
    keep_draft: bool,
) -> None:
    """Promote a private draft memory into `knowledge/memories/` (shared canon)."""
    from cyntra.kernel.config import KernelConfig

    config = KernelConfig.load(ctx.obj["config_path"])
    repo_root = config.repo_root
    draft_path = draft_path if draft_path.is_absolute() else (repo_root / draft_path).resolve()
    if not draft_path.is_file():
        raise click.ClickException(f"Draft file not found: {draft_path}")

    target_dir = repo_root / "knowledge" / "memories"
    target_dir.mkdir(parents=True, exist_ok=True)

    text = draft_path.read_text(encoding="utf-8")
    frontmatter, body = _split_markdown_frontmatter(text)
    memory_id = str(frontmatter.get("memory_id") or frontmatter.get("id") or "").strip()
    if not memory_id:
        digest = hashlib.sha256(str(draft_path).encode("utf-8")).hexdigest()[:12]
        memory_id = f"mem_{digest}"
        frontmatter["memory_id"] = memory_id

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    frontmatter["status"] = status.lower()
    frontmatter["scope"] = frontmatter.get("scope") or "collective"
    frontmatter["updated_at"] = now
    frontmatter["visibility"] = "shared"

    out_path = target_dir / f"{memory_id}.md"
    out_path.write_text(_render_markdown_frontmatter(frontmatter, body), encoding="utf-8")
    console.print(f"[green]✓[/green] Promoted memory: {out_path}")

    if not keep_draft:
        try:
            draft_path.unlink()
        except OSError as exc:
            raise click.ClickException(f"Failed to remove draft: {exc}") from exc


@main.group()
def index() -> None:
    """Indexing + retrieval substrate (CocoIndex)."""


def _cocoindex_exe() -> str:
    exe = shutil.which("cocoindex")
    if exe:
        return exe

    local_exe = Path(sys.executable).with_name("cocoindex")
    if local_exe.exists():
        return str(local_exe)

    raise click.ClickException(
        "CocoIndex CLI not found (`cocoindex`). Install `cyntra[indexing]` or `pip install cocoindex[embeddings]`."
    )


def _cocoindex_app_target() -> str:
    return "cyntra.indexing.cocoindex_app"


def _run_cocoindex(args: list[str]) -> None:
    subprocess.run(args, check=True)


@index.command(context_settings={"ignore_unknown_options": True, "allow_extra_args": True})
@click.option("--env-file", type=Path, help="Path to a CocoIndex .env file")
@click.option("--reset", is_flag=True, help="Drop existing setup before setup")
@click.option("--force", is_flag=True, help="Force setup without prompts")
@click.pass_context
def setup(ctx: click.Context, env_file: Path | None, reset: bool, force: bool) -> None:
    """Create/update CocoIndex internal storage + target schemas."""
    exe = _cocoindex_exe()
    cmd: list[str] = [exe]
    if env_file is not None:
        cmd += ["--env-file", str(env_file)]
    cmd += ["setup"]
    if reset:
        cmd += ["--reset"]
    if force:
        cmd += ["--force"]
    cmd += [_cocoindex_app_target()]
    cmd += list(ctx.args)
    _run_cocoindex(cmd)


@index.command(context_settings={"ignore_unknown_options": True, "allow_extra_args": True})
@click.option("--env-file", type=Path, help="Path to a CocoIndex .env file")
@click.option("--live", is_flag=True, help="Live update (watch for changes)")
@click.option("--reexport", is_flag=True, help="Reexport targets even if unchanged")
@click.option("--full-reprocess", is_flag=True, help="Invalidate caches and reprocess everything")
@click.option("--reset", is_flag=True, help="Drop existing setup before update")
@click.option("--force", is_flag=True, help="Force setup without prompts")
@click.option("--quiet", is_flag=True, help="Suppress stats output")
@click.pass_context
def update(
    ctx: click.Context,
    env_file: Path | None,
    live: bool,
    reexport: bool,
    full_reprocess: bool,
    reset: bool,
    force: bool,
    quiet: bool,
) -> None:
    """Incrementally update CocoIndex targets from Cyntra artifacts."""
    exe = _cocoindex_exe()
    cmd: list[str] = [exe]
    if env_file is not None:
        cmd += ["--env-file", str(env_file)]
    cmd += ["update"]
    if live:
        cmd += ["--live"]
    if reexport:
        cmd += ["--reexport"]
    if full_reprocess:
        cmd += ["--full-reprocess"]
    if reset:
        cmd += ["--reset"]
    if force:
        cmd += ["--force"]
    if quiet:
        cmd += ["--quiet"]
    cmd += [f"{_cocoindex_app_target()}:CyntraIndex"]
    cmd += list(ctx.args)
    _run_cocoindex(cmd)


@index.command(context_settings={"ignore_unknown_options": True, "allow_extra_args": True})
@click.option("--env-file", type=Path, help="Path to a CocoIndex .env file")
@click.option(
    "--address",
    type=str,
    help="Bind address in the format IP:PORT (defaults to COCOINDEX_SERVER_ADDRESS)",
)
@click.option("--cors-local", type=int, help="Allow http://localhost:<port> via CORS")
@click.option("--cors-origin", type=str, help="Comma-separated list of allowed CORS origins")
@click.option("--cors-cocoindex", is_flag=True, help="Allow https://cocoindex.io via CORS")
@click.option("--live", is_flag=True, help="Live update while serving")
@click.option("--reexport", is_flag=True, help="Reexport targets on startup")
@click.option(
    "--full-reprocess", is_flag=True, help="Invalidate caches and reprocess everything on startup"
)
@click.option("--reset", is_flag=True, help="Drop existing setup before starting server")
@click.option("--force", is_flag=True, help="Force setup without prompts")
@click.option("--reload", is_flag=True, help="Reload on code changes")
@click.option("--quiet", is_flag=True, help="Suppress stats output")
@click.pass_context
def serve(
    ctx: click.Context,
    env_file: Path | None,
    address: str | None,
    cors_local: int | None,
    cors_origin: str | None,
    cors_cocoindex: bool,
    live: bool,
    reexport: bool,
    full_reprocess: bool,
    reset: bool,
    force: bool,
    reload: bool,
    quiet: bool,
) -> None:
    """Start the CocoIndex HTTP server (query handlers + optional live updates)."""
    exe = _cocoindex_exe()
    cmd: list[str] = [exe]
    if env_file is not None:
        cmd += ["--env-file", str(env_file)]
    cmd += ["server"]
    if address is not None:
        cmd += ["--address", address]
    if cors_origin is not None:
        cmd += ["--cors-origin", cors_origin]
    if cors_cocoindex:
        cmd += ["--cors-cocoindex"]
    if cors_local is not None:
        cmd += ["--cors-local", str(cors_local)]
    if live:
        cmd += ["--live-update"]
    if reexport:
        cmd += ["--reexport"]
    if full_reprocess:
        cmd += ["--full-reprocess"]
    if reset:
        cmd += ["--reset"]
    if force:
        cmd += ["--force"]
    if reload:
        cmd += ["--reload"]
    if quiet:
        cmd += ["--quiet"]
    cmd += [_cocoindex_app_target()]
    cmd += list(ctx.args)
    _run_cocoindex(cmd)


if __name__ == "__main__":
    main()
