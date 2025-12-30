"""
Research CLI commands.

Commands:
- research list: List all research programs
- research status: Show schedule status
- research run: Manually trigger a program
- research validate: Validate program configs
- research history: Show run history
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

import click
from rich.console import Console
from rich.table import Table

if TYPE_CHECKING:
    from cyntra.research.models import ResearchProgram
    from cyntra.research.registry import Registry
    from cyntra.research.runner import RunResult

console = Console()


def _get_registry(ctx: click.Context) -> Registry:
    """Get or create registry from context."""
    from cyntra.research.registry import Registry

    if "research_registry" not in ctx.obj:
        config_path = ctx.obj.get("config_path", Path(".cyntra/config.yaml"))
        repo_root = config_path.parent.parent if config_path.exists() else Path.cwd()
        ctx.obj["research_registry"] = Registry.load(repo_root)
    return ctx.obj["research_registry"]


@click.group()
def research() -> None:
    """Research program management."""
    pass


@research.command(name="list")
@click.option("--enabled-only", is_flag=True, help="Only show enabled programs")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def list_programs(ctx: click.Context, enabled_only: bool, as_json: bool) -> None:
    """List all research programs."""
    import json as json_module

    registry = _get_registry(ctx)
    programs = registry.list_programs(enabled_only=enabled_only)

    if as_json:
        data = [
            {
                "program_id": p.program_id,
                "name": p.name,
                "scope": p.scope,
                "owner": p.owner,
                "enabled": p.schedule.enabled,
                "cadence": p.schedule.cadence,
                "output_type": p.output.type.value,
            }
            for p in programs
        ]
        console.print(json_module.dumps(data, indent=2))
        return

    if not programs:
        console.print("[yellow]No research programs found[/yellow]")
        console.print("Add programs to: knowledge/research/programs/*.yaml")
        return

    table = Table(title="Research Programs")
    table.add_column("ID", style="cyan")
    table.add_column("Name")
    table.add_column("Scope", style="dim")
    table.add_column("Owner")
    table.add_column("Enabled")
    table.add_column("Cadence", style="dim")
    table.add_column("Output")

    for program in programs:
        enabled = "[green]✓[/green]" if program.schedule.enabled else "[red]✗[/red]"
        table.add_row(
            program.program_id,
            program.name,
            program.scope,
            program.owner,
            enabled,
            program.schedule.cadence,
            program.output.type.value,
        )

    console.print(table)


@research.command(name="status")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def schedule_status(ctx: click.Context, as_json: bool) -> None:
    """Show research schedule status."""
    import json as json_module

    from cyntra.research.scheduler import Scheduler

    registry = _get_registry(ctx)
    scheduler = Scheduler(registry)
    now = datetime.now(UTC)

    summaries = scheduler.get_schedule_summary(now)

    if as_json:
        console.print(json_module.dumps(summaries, indent=2, default=str))
        return

    if not summaries:
        console.print("[yellow]No research programs configured[/yellow]")
        return

    table = Table(title="Research Schedule Status")
    table.add_column("Program", style="cyan")
    table.add_column("Enabled")
    table.add_column("Last Run")
    table.add_column("Next Run")
    table.add_column("Due?")
    table.add_column("Failures")
    table.add_column("Daily $")
    table.add_column("Weekly $")

    for summary in summaries:
        enabled = "[green]✓[/green]" if summary["enabled"] else "[red]✗[/red]"
        is_due = "[green]Yes[/green]" if summary["is_due"] else "[dim]No[/dim]"

        last_run = summary["last_run_at"]
        if last_run:
            # Parse and format
            from datetime import datetime as dt

            if isinstance(last_run, str):
                last_run_dt = dt.fromisoformat(last_run.replace("Z", "+00:00"))
            else:
                last_run_dt = last_run
            last_run_str = last_run_dt.strftime("%Y-%m-%d %H:%M")
        else:
            last_run_str = "[dim]Never[/dim]"

        next_run = summary["next_run_at"]
        if next_run:
            from datetime import datetime as dt

            if isinstance(next_run, str):
                next_run_dt = dt.fromisoformat(next_run.replace("Z", "+00:00"))
            else:
                next_run_dt = next_run
            next_run_str = next_run_dt.strftime("%Y-%m-%d %H:%M")
        else:
            next_run_str = "[dim]--[/dim]"

        failures = summary["consecutive_failures"]
        failures_str = f"[red]{failures}[/red]" if failures > 0 else "[green]0[/green]"

        daily_remaining = summary["budget_daily_remaining"]
        weekly_remaining = summary["budget_weekly_remaining"]

        table.add_row(
            summary["program_id"],
            enabled,
            last_run_str,
            next_run_str,
            is_due,
            failures_str,
            f"${daily_remaining:.2f}",
            f"${weekly_remaining:.2f}",
        )

    console.print(table)

    # Show due programs
    due = scheduler.get_due_programs(now)
    if due:
        console.print()
        console.print(f"[bold]Programs due to run: {len(due)}[/bold]")
        for ranked in due:
            console.print(
                f"  • {ranked.program.program_id} (priority: {ranked.priority_score:.1f})"
            )


@research.command(name="run")
@click.argument("program_id")
@click.option("--dry-run", is_flag=True, help="Show what would happen without executing")
@click.option("--force", is_flag=True, help="Run even if not scheduled or over budget")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed progress")
@click.pass_context
def run_program(
    ctx: click.Context, program_id: str, dry_run: bool, force: bool, verbose: bool
) -> None:
    """Manually run a research program."""
    import asyncio

    from cyntra.research.scheduler import Scheduler

    registry = _get_registry(ctx)
    program = registry.get_program(program_id)

    if program is None:
        raise click.ClickException(f"Program not found: {program_id}")

    scheduler = Scheduler(registry)
    now = datetime.now(UTC)

    # Check if due (unless forcing)
    if not force:
        decision = scheduler.is_due(program, now)
        if not decision.should_run:
            console.print(f"[yellow]Program not due: {decision.reason}[/yellow]")
            if not click.confirm("Run anyway?"):
                return

    if dry_run:
        console.print(f"[dim]Dry run: Would execute program {program_id}[/dim]")
        console.print(f"  Scope: {program.scope}")
        console.print(f"  Output type: {program.output.type.value}")
        console.print(f"  Target memories: {program.output.target_memories}")
        console.print(f"  Max cost: ${program.budgets.max_cost_per_run:.2f}")
        console.print(f"  Web sources: {len(program.sources.web)}")
        console.print(f"  Query templates: {len(program.queries.templates)}")
        return

    # Run the program
    result = asyncio.run(_execute_program(registry, program, verbose))

    if result.success:
        console.print()
        console.print("[green]Research run completed successfully[/green]")
        console.print(f"  Run ID: {result.run.run_id}")
        console.print(f"  Sources queried: {result.run.sources_queried}")
        console.print(f"  Pages fetched: {result.run.pages_fetched}")
        console.print(f"  Memories created: {result.run.memories_verified}")

        if result.librarian_output and result.librarian_output.report_path:
            console.print(f"  Report: {result.librarian_output.report_path}")
    else:
        console.print()
        console.print("[red]Research run failed[/red]")
        console.print(f"  Run ID: {result.run.run_id}")
        if result.error:
            console.print(f"  Error: {result.error}")
        raise click.ClickException("Research run failed")


async def _execute_program(
    registry: Registry,
    program: ResearchProgram,
    verbose: bool,
) -> RunResult:
    """Execute a research program with progress display."""
    from rich.progress import Progress, SpinnerColumn, TextColumn

    from cyntra.research.runner import ResearchRunner, RunnerConfig

    # Get repo root from registry
    repo_root = registry.repo_root

    # Load global domain lists
    global_allowlist = _load_global_domains(
        repo_root / "knowledge" / "research" / "domains" / "allowlist.txt"
    )
    global_denylist = _load_global_domains(
        repo_root / "knowledge" / "research" / "domains" / "denylist.txt"
    )

    # Create runner config
    config = RunnerConfig(
        repo_root=repo_root,
        global_allowlist=global_allowlist,
        global_denylist=global_denylist,
    )

    runner = ResearchRunner(config)

    # Get prior evidence and memories for diff mode
    prior_evidence = _get_prior_evidence(registry, program.program_id)
    prior_memories = _get_prior_memories(repo_root, program.scope)

    if verbose:
        console.print(f"[dim]Starting research run for {program.program_id}[/dim]")
        console.print(f"[dim]  Prior evidence: {len(prior_evidence)} items[/dim]")
        console.print(f"[dim]  Prior memories: {len(prior_memories)} items[/dim]")

    # Run with progress display
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task(f"Running {program.program_id}...", total=None)

        result = await runner.run(
            program,
            prior_evidence=prior_evidence,
            prior_memories=prior_memories,
        )

        progress.update(task, description="Complete")

    # Record run in ledger
    registry.ledger.append(result.run)

    return result


def _load_global_domains(path: Path) -> list[str]:
    """Load domain list from file."""
    if not path.exists():
        return []

    domains = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                domains.append(line)
    return domains


def _get_prior_evidence(registry: Registry, program_id: str) -> list[dict]:
    """Get prior evidence from recent runs."""
    from cyntra.research.models import RunStatus

    prior = []
    runs = list(registry.ledger.iter_runs(program_id=program_id, status=RunStatus.COMPLETED))

    # Get evidence from last successful run
    if runs:
        runs.sort(key=lambda r: r.completed_at or r.started_at, reverse=True)
        last_run = runs[0]

        if last_run.run_dir:
            evidence_meta = last_run.run_dir / "evidence" / "metadata.json"
            if evidence_meta.exists():
                import json

                with open(evidence_meta) as f:
                    data = json.load(f)
                    prior = data.get("sources", [])

    return prior


def _get_prior_memories(repo_root: Path, scope: str) -> list[dict]:
    """Get existing memories for the scope."""
    memories = []
    drafts_dir = repo_root / ".cyntra" / "memories" / "drafts"

    if not drafts_dir.exists():
        return memories

    for memory_file in drafts_dir.glob("*.md"):
        try:
            content = memory_file.read_text()

            # Quick parse to check scope
            if f"scope: {scope}" in content:
                # Extract basic info
                import re

                memory_id_match = re.search(r"memory_id:\s*(\S+)", content)
                title_match = re.search(r"title:\s*[\"']?(.+?)[\"']?\s*$", content, re.MULTILINE)

                if memory_id_match:
                    memories.append(
                        {
                            "memory_id": memory_id_match.group(1),
                            "title": title_match.group(1) if title_match else "",
                            "content": content,
                        }
                    )
        except Exception:
            continue

    return memories


@research.command(name="validate")
@click.argument("program_id", required=False)
@click.pass_context
def validate_program(ctx: click.Context, program_id: str | None) -> None:
    """Validate research program configurations."""
    registry = _get_registry(ctx)

    if program_id:
        programs = [registry.get_program(program_id)]
        if programs[0] is None:
            raise click.ClickException(f"Program not found: {program_id}")
    else:
        programs = registry.list_programs()

    if not programs:
        console.print("[yellow]No programs to validate[/yellow]")
        return

    all_valid = True
    for program in programs:
        if program is None:
            continue

        errors = registry.validate_program(program)

        if errors:
            all_valid = False
            console.print(f"[red]✗[/red] {program.program_id}")
            for error in errors:
                console.print(f"  [red]•[/red] {error}")
        else:
            console.print(f"[green]✓[/green] {program.program_id}")

    if all_valid:
        console.print()
        console.print(f"[green]All {len(programs)} program(s) valid[/green]")
    else:
        raise click.ClickException("Validation failed")


@research.command(name="history")
@click.option("--program", "program_id", help="Filter by program ID")
@click.option("--status", "status_filter", help="Filter by status (completed, failed, running)")
@click.option("--limit", type=int, default=20, help="Number of runs to show")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def run_history(
    ctx: click.Context,
    program_id: str | None,
    status_filter: str | None,
    limit: int,
    as_json: bool,
) -> None:
    """Show research run history."""
    import json as json_module

    from cyntra.research.models import RunStatus

    registry = _get_registry(ctx)

    # Parse status filter
    status = None
    if status_filter:
        try:
            status = RunStatus(status_filter.lower())
        except ValueError:
            valid = ", ".join(s.value for s in RunStatus)
            raise click.ClickException(f"Invalid status. Valid: {valid}") from None

    runs = list(registry.ledger.iter_runs(program_id=program_id, status=status))

    # Sort by started_at descending and limit
    runs.sort(key=lambda r: r.started_at or datetime.min.replace(tzinfo=UTC), reverse=True)
    runs = runs[:limit]

    if as_json:
        data = [r.model_dump(mode="json") for r in runs]
        console.print(json_module.dumps(data, indent=2, default=str))
        return

    if not runs:
        console.print("[yellow]No runs found[/yellow]")
        return

    table = Table(title=f"Research Run History (last {limit})")
    table.add_column("Run ID", style="cyan")
    table.add_column("Program")
    table.add_column("Status")
    table.add_column("Started")
    table.add_column("Duration")
    table.add_column("Memories")
    table.add_column("Cost")

    for run in runs:
        status_style = {
            "completed": "[green]completed[/green]",
            "failed": "[red]failed[/red]",
            "running": "[yellow]running[/yellow]",
            "pending": "[dim]pending[/dim]",
            "cancelled": "[dim]cancelled[/dim]",
        }.get(run.status.value, run.status.value)

        started = run.started_at.strftime("%Y-%m-%d %H:%M") if run.started_at else "--"
        duration = f"{run.duration_seconds()}s" if run.duration_seconds() else "--"
        memories = str(run.memories_verified) if run.memories_verified else "--"
        cost = f"${run.budget_consumed.cost_usd:.4f}" if run.budget_consumed.cost_usd else "--"

        table.add_row(
            run.run_id[:40] + "..." if len(run.run_id) > 40 else run.run_id,
            run.program_id,
            status_style,
            started,
            duration,
            memories,
            cost,
        )

    console.print(table)


@research.command(name="due")
@click.option("--json", "as_json", is_flag=True, help="JSON output")
@click.pass_context
def show_due(ctx: click.Context, as_json: bool) -> None:
    """Show programs that are due to run."""
    import json as json_module

    from cyntra.research.scheduler import Scheduler

    registry = _get_registry(ctx)
    scheduler = Scheduler(registry)
    now = datetime.now(UTC)

    due = scheduler.get_due_programs(now)

    if as_json:
        data = [
            {
                "program_id": r.program.program_id,
                "name": r.program.name,
                "priority_score": r.priority_score,
                "reasons": r.reasons,
            }
            for r in due
        ]
        console.print(json_module.dumps(data, indent=2))
        return

    if not due:
        console.print("[green]No programs due to run[/green]")

        # Show next scheduled times
        next_runs = scheduler.get_next_run_times(now)
        if next_runs:
            console.print()
            console.print("[dim]Next scheduled runs:[/dim]")
            for program_id, next_time in sorted(
                next_runs, key=lambda x: x[1] or datetime.max.replace(tzinfo=UTC)
            ):
                if next_time:
                    delta = next_time - now
                    hours = int(delta.total_seconds() / 3600)
                    console.print(
                        f"  {program_id}: {next_time.strftime('%Y-%m-%d %H:%M')} (in {hours}h)"
                    )
        return

    table = Table(title=f"Programs Due to Run ({len(due)})")
    table.add_column("Priority", style="cyan")
    table.add_column("Program")
    table.add_column("Name")
    table.add_column("Score")
    table.add_column("Factors", style="dim")

    for i, ranked in enumerate(due, 1):
        factors = ", ".join(ranked.reasons[:3])
        if len(ranked.reasons) > 3:
            factors += f" (+{len(ranked.reasons) - 3} more)"

        table.add_row(
            str(i),
            ranked.program.program_id,
            ranked.program.name,
            f"{ranked.priority_score:.1f}",
            factors,
        )

    console.print(table)
