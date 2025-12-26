"""
Kernel Runner - Main orchestration loop.

Coordinates the full cycle:
1. Load Beads state
2. Schedule ready tasks
3. Dispatch to workcells (parallel)
4. Verify results
5. Write back to Beads
6. Handle failures → create issues
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog
from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from cyntra.kernel.config import KernelConfig
from cyntra.control.exploration_controller import ExplorationController
from cyntra.kernel.scheduler import Scheduler, ScheduleResult
from cyntra.kernel.dispatcher import Dispatcher, DispatchResult
from cyntra.kernel.planner_integration import KernelPlannerIntegration
from cyntra.kernel.verifier import Verifier
from cyntra.kernel.memory_integration import KernelMemoryBridge
from cyntra.dynamics.transition_db import TransitionDB
from cyntra.dynamics.state_t1 import build_state_t1
from cyntra.state.manager import StateManager
from cyntra.workcell.manager import WorkcellManager
from cyntra.sleeptime import SleeptimeOrchestrator, SleeptimeConfig

if TYPE_CHECKING:
    from cyntra.planner.action_space import ActionSpace
    from cyntra.state.models import BeadsGraph, Issue

logger = structlog.get_logger()
console = Console()

ESCALATION_TAGS = {"escalation", "needs-human", "@human-escalated", "human-escalated"}


def _utc_now() -> datetime:
    """Get current UTC time as timezone-aware datetime."""
    return datetime.now(timezone.utc)


class KernelRunner:
    """
    Main kernel orchestration loop.

    Coordinates scheduling, dispatch, verification, and state updates.
    Supports both synchronous (single-threaded) and asynchronous (parallel)
    execution modes.
    """

    def __init__(
        self,
        config_path: Path | None = None,
        config: KernelConfig | None = None,
        single_cycle: bool = False,
        target_issue: str | None = None,
        universe_id: str | None = None,
        max_concurrent: int | None = None,
        force_speculate: bool = False,
        dry_run: bool = False,
        watch_mode: bool = False,
    ) -> None:
        # Load or use provided config
        if config:
            self.config = config
        elif config_path:
            self.config = KernelConfig.load(config_path)
        else:
            self.config = KernelConfig()

        self.universe_id = universe_id
        self.universe_config = None

        if universe_id:
            from cyntra.universe import UniverseLoadError, load_universe

            try:
                self.universe_config = load_universe(
                    universe_id,
                    repo_root=self.config.repo_root,
                    validate_worlds=False,
                )
            except UniverseLoadError as exc:
                raise RuntimeError(str(exc)) from exc

            from cyntra.universe.policy import apply_universe_policies

            apply_universe_policies(self.config, self.universe_config)

        # Apply runtime overrides
        self.config.force_speculate = force_speculate
        self.config.dry_run = dry_run
        self.config.watch_mode = watch_mode

        if max_concurrent:
            self.config.max_concurrent_workcells = max_concurrent

        self.single_cycle = single_cycle
        self.target_issue = target_issue

        # Track running tasks
        self._running_tasks: set[str] = set()

        # Initialize components
        self.state_manager = StateManager(self.config)
        self.controller = ExplorationController(self.config)
        self.scheduler = Scheduler(self.config, self._running_tasks, controller=self.controller)
        self.dispatcher = Dispatcher(self.config, controller=self.controller)
        self.verifier = Verifier(self.config)
        self.planner_integration = KernelPlannerIntegration(self.config)
        self.workcell_manager = WorkcellManager(self.config, self.config.repo_root)

        # Memory integration (claude-mem pattern)
        self.memory_bridge = KernelMemoryBridge(
            db_path=self.config.repo_root / ".cyntra" / "memory" / "cyntra-mem.db"
        )

        # Sleeptime orchestrator for background consolidation
        sleeptime_config = SleeptimeConfig()
        if hasattr(self.config, "sleeptime") and self.config.sleeptime:
            sleeptime_config = SleeptimeConfig.from_dict(self.config.sleeptime)
        self.sleeptime = SleeptimeOrchestrator(
            config=sleeptime_config,
            repo_root=self.config.repo_root,
        )

        # Dynamics transition DB for routing improvement
        dynamics_db_path = self.config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"
        self.transition_db = TransitionDB(dynamics_db_path)

        # Track from_state for each workcell
        self._workcell_from_states: dict[str, dict] = {}

        self._running = False
        self._cycle_count = 0
        self._stats = {
            "issues_completed": 0,
            "issues_failed": 0,
            "total_duration_ms": 0,
        }

    def run(self) -> None:
        """Run the kernel loop (synchronous entry point)."""
        asyncio.run(self.run_async())

    async def run_async(self) -> None:
        """Run the kernel loop asynchronously."""
        self._running = True

        console.print("\n[bold blue]Cyntra[/bold blue] starting...")
        console.print(f"[dim]Config:[/dim] {self.config.config_path}")
        console.print(f"[dim]Mode:[/dim] {'dry-run' if self.config.dry_run else 'live'}")
        console.print(f"[dim]Max Concurrent:[/dim] {self.config.max_concurrent_workcells}")

        available = self.dispatcher.get_available_toolchains()
        console.print(f"[dim]Toolchains:[/dim] {', '.join(available) if available else 'none'}")

        if self.target_issue:
            console.print(f"[dim]Target:[/dim] Issue #{self.target_issue}")

        console.print()

        try:
            while self._running:
                self._cycle_count += 1
                logger.info("Starting kernel cycle", cycle=self._cycle_count)

                had_work = await self._run_cycle()

                if self.single_cycle:
                    console.print("\n[green]✓[/green] Single cycle complete")
                    break

                if not had_work and not self.config.watch_mode:
                    console.print("\n[green]✓[/green] No more ready work")
                    break

                if self.config.watch_mode:
                    console.print("[dim]Waiting for Beads changes...[/dim]")
                    await asyncio.sleep(5)

        except KeyboardInterrupt:
            console.print("\n[yellow]Interrupted[/yellow]")
            self._running = False

        self._display_summary()

    async def _run_cycle(self) -> bool:
        """
        Execute one scheduling cycle.

        Returns True if work was dispatched.
        """
        # Load current state
        graph = self.state_manager.load_beads_graph()

        if not graph.issues:
            console.print("[yellow]No issues found in Beads[/yellow]")
            return False

        # Filter to target issue if specified
        if self.target_issue:
            graph = graph.filter_to_issue(self.target_issue)
            if not graph.issues:
                console.print(f"[yellow]Issue #{self.target_issue} not found[/yellow]")
                return False

        # Update scheduler with current running tasks
        self.scheduler.update_running_tasks(self._running_tasks)

        # Schedule
        schedule = self.scheduler.schedule(graph)

        if not schedule.scheduled_lanes:
            if self.target_issue and self.single_cycle:
                issue = next(
                    (i for i in graph.issues if i.id == self.target_issue),
                    None,
                )
                if issue:
                    reason = self._explain_not_ready(issue, graph)
                    console.print(
                        f"[yellow]Target issue not ready ({reason}); forcing one-shot run[/yellow]"
                    )
                    from cyntra.planner.artifacts import collect_history_candidates
                    history_candidates = collect_history_candidates(
                        repo_root=self.config.repo_root,
                        include_world=False,
                    )
                    await self._dispatch_single_async(issue, history_candidates=history_candidates)
                    return True
            console.print("[dim]Nothing ready to schedule[/dim]")
            return False

        # Display schedule
        self._display_schedule(schedule)

        if self.config.dry_run:
            console.print("\n[yellow]Dry run - no changes made[/yellow]")
            return True

        # Dispatch work in parallel
        await self._dispatch_parallel(schedule)

        return True

    def _explain_not_ready(self, issue: Issue, graph: BeadsGraph) -> str:
        reasons: list[str] = []
        if issue.status not in ("open", "ready"):
            reasons.append(f"status={issue.status}")
        if issue.dk_attempts >= issue.dk_max_attempts:
            reasons.append(f"attempts={issue.dk_attempts}/{issue.dk_max_attempts}")
        if any(tag in ESCALATION_TAGS for tag in (issue.tags or [])):
            reasons.append("escalated")
        blockers = [
            b.id
            for b in graph.get_blocking_deps(issue.id)
            if b.status != "done"
        ]
        if blockers:
            reasons.append(f"blocked_by={','.join(blockers[:3])}")
        return "; ".join(reasons) if reasons else "unspecified"

    async def _dispatch_parallel(self, schedule: ScheduleResult) -> None:
        """Dispatch all scheduled work in parallel."""
        spec_ids = {i.id for i in schedule.speculate_issues}

        from cyntra.planner.artifacts import collect_history_candidates

        history_candidates = collect_history_candidates(
            repo_root=self.config.repo_root,
            include_world=False,
        )

        # Separate speculate vs single dispatch
        speculate_issues = [i for i in schedule.scheduled_lanes if i.id in spec_ids]
        single_issues = [i for i in schedule.scheduled_lanes if i.id not in spec_ids]

        # Create tasks for all dispatches
        tasks = []

        for issue in single_issues:
            tasks.append(self._dispatch_single_async(issue, history_candidates=history_candidates))

        for issue in speculate_issues:
            tasks.append(self._dispatch_speculate_async(issue, history_candidates=history_candidates))

        # Run all in parallel
        if tasks:
            console.print(f"\n[cyan]Dispatching {len(tasks)} task(s) in parallel...[/cyan]")
            await asyncio.gather(*tasks)

    async def _dispatch_single_async(
        self,
        issue: Issue,
        *,
        history_candidates: list[dict[str, Any]],
    ) -> None:
        """Dispatch a single workcell for an issue asynchronously."""
        console.print(f"\n[cyan]Dispatching[/cyan] #{issue.id}: {issue.title}")

        # Track as running
        self._running_tasks.add(issue.id)
        workcell_path = None
        workcell_id = None

        try:
            # Create workcell
            try:
                workcell_path = self.workcell_manager.create(issue.id)
            except Exception as exc:
                self._handle_workcell_create_failure(issue, exc)
                return
            workcell_id = workcell_path.name

            # Update issue status
            self.state_manager.update_issue_status(issue.id, "running")

            self.state_manager.add_event(
                issue.id,
                "issue.started",
                {"speculate": False},
            )

            # Determine toolchain for this dispatch
            toolchain = self.dispatcher._route_toolchain(issue)

            planner_universe_id, planner_universe_defaults, planner_action_space = (
                self._planner_universe_context()
            )
            from cyntra.planner.artifacts import system_state_snapshot

            now_ms = int(time.time() * 1000)
            system_state = system_state_snapshot(
                active_workcells=len(self._running_tasks),
                queue_depth=None,
                available_toolchains=self.dispatcher.get_available_toolchains(),
                now_ms=now_ms,
            )
            toolchain_cfg = self.config.toolchains.get(toolchain)
            timeout_seconds = (
                int(getattr(toolchain_cfg, "timeout_seconds", 1800))
                if toolchain_cfg is not None
                else 1800
            )
            job_type = "fab-world" if "asset:world" in (issue.tags or []) else "code"

            selection = self.planner_integration.decide(
                issue=issue,
                job_type=job_type,
                universe_id=planner_universe_id,
                universe_defaults=planner_universe_defaults,
                action_space=planner_action_space,
                history_candidates=history_candidates,
                system_state=system_state,
                now_ms=now_ms,
                baseline_swarm_id="serial_handoff",
                baseline_max_candidates=1,
                baseline_timeout_cap_seconds=int(timeout_seconds),
                max_iterations=None,
            )
            planner_bundle = self.planner_integration.build_manifest_planner_bundle(
                selection=selection,
                swarm_id_executed="serial_handoff",
                timeout_seconds_default=int(timeout_seconds),
                max_iterations_executed=None,
            )

            # Dynamics: capture from_state before execution
            from_state = self._build_from_state(issue, workcell_id, toolchain)
            self._workcell_from_states[workcell_id] = from_state

            self.state_manager.add_event(
                issue.id,
                "workcell.created",
                {
                    "toolchain": toolchain,
                    "speculate_tag": None,
                },
                workcell_id=workcell_id,
            )
            self.state_manager.add_event(
                issue.id,
                "workcell.started",
                {"toolchain": toolchain},
                workcell_id=workcell_id,
            )

            # Memory: start session and get context for injection
            manifest_base = self.dispatcher._build_manifest(
                issue, workcell_id, toolchain, None
            )
            memory_context = self.memory_bridge.on_workcell_start(
                workcell_id=workcell_id,
                issue=issue,
                manifest=manifest_base,
            )

            # Run toolchain via async dispatch (pass memory context for injection)
            result = await self.dispatcher.dispatch_async(
                issue,
                workcell_path,
                memory_context=memory_context,
                manifest_overrides={"planner": planner_bundle},
            )

            # Memory: parse telemetry for tool observations
            if workcell_path:
                self.memory_bridge.on_dispatch_complete(
                    workcell_id=workcell_id,
                    workcell_path=workcell_path,
                    proof=result.proof,
                )

            if result.success and result.proof:
                # Verify
                verified = self.verifier.verify(result.proof, workcell_path)

                # Memory: record gate results
                if result.proof and isinstance(result.proof.verification, dict):
                    gates = result.proof.verification.get("gates", {})
                    for gate_name, gate_result in gates.items():
                        if isinstance(gate_result, dict):
                            self.memory_bridge.on_gate_result(
                                gate_name=gate_name,
                                passed=gate_result.get("passed", False),
                                score=gate_result.get("score"),
                                fail_codes=gate_result.get("fail_codes", []),
                            )

                if verified:
                    await self._handle_success(issue, result, workcell_path)
                    # Memory: end session as success
                    self.memory_bridge.on_workcell_end(workcell_id, "success")
                    # Sleeptime: notify completion and possibly consolidate
                    consolidation_result = self.sleeptime.on_workcell_complete(success=True)
                    if consolidation_result and consolidation_result.success:
                        # Reload controller's dynamics report after consolidation
                        self.controller._report = self.controller._load_report()
                else:
                    await self._handle_failure(issue, result, workcell_path)
                    # Memory: end session as failed
                    self.memory_bridge.on_workcell_end(workcell_id, "failed")
                    # Sleeptime: notify failure and possibly consolidate
                    consolidation_result = self.sleeptime.on_workcell_complete(success=False)
                    if consolidation_result and consolidation_result.success:
                        self.controller._report = self.controller._load_report()
            else:
                await self._handle_failure(issue, result, workcell_path)
                # Memory: end session as failed
                if workcell_id:
                    self.memory_bridge.on_workcell_end(workcell_id, "failed")
                # Sleeptime: notify failure and possibly consolidate
                consolidation_result = self.sleeptime.on_workcell_complete(success=False)
                if consolidation_result and consolidation_result.success:
                    self.controller._report = self.controller._load_report()

        finally:
            self._running_tasks.discard(issue.id)

    async def _dispatch_speculate_async(
        self,
        issue: Issue,
        *,
        history_candidates: list[dict[str, Any]],
    ) -> None:
        """Dispatch multiple parallel workcells for speculate+vote."""
        from cyntra.kernel.routing import speculate_parallelism, speculate_toolchains

        # Determine which toolchains to run in parallel for this issue.
        candidates = speculate_toolchains(self.config, issue)
        if not candidates:
            candidates = list(self.config.toolchain_priority)

        available = set(self.dispatcher.get_available_toolchains())
        candidates = [c for c in candidates if c in available]

        if not candidates:
            console.print("  [red]No available toolchains for speculate[/red]")
            return

        desired_parallelism = self.controller.speculate_parallelism(
            issue,
            speculate_parallelism(self.config, issue),
        )
        parallelism = min(desired_parallelism, len(candidates)) or 1

        planner_universe_id, planner_universe_defaults, planner_action_space = (
            self._planner_universe_context()
        )
        from cyntra.planner.artifacts import system_state_snapshot

        now_ms = int(time.time() * 1000)
        system_state = system_state_snapshot(
            active_workcells=len(self._running_tasks) + 1,
            queue_depth=None,
            available_toolchains=self.dispatcher.get_available_toolchains(),
            now_ms=now_ms,
        )
        job_type = "fab-world" if "asset:world" in (issue.tags or []) else "code"

        # Compute a conservative timeout cap across toolchains to ensure we never extend timeouts.
        timeout_caps: list[int] = []
        for toolchain in candidates[:parallelism]:
            toolchain_cfg = self.config.toolchains.get(toolchain)
            timeout_caps.append(
                int(getattr(toolchain_cfg, "timeout_seconds", 1800))
                if toolchain_cfg is not None
                else 1800
            )
        timeout_cap_seconds = min(timeout_caps) if timeout_caps else 1800

        selection = self.planner_integration.decide(
            issue=issue,
            job_type=job_type,
            universe_id=planner_universe_id,
            universe_defaults=planner_universe_defaults,
            action_space=planner_action_space,
            history_candidates=history_candidates,
            system_state=system_state,
            now_ms=now_ms,
            baseline_swarm_id="speculate_vote",
            baseline_max_candidates=parallelism,
            baseline_timeout_cap_seconds=int(timeout_cap_seconds),
            max_iterations=None,
        )
        parallelism = max(1, min(int(selection.max_candidates_executed), parallelism))
        candidates = candidates[:parallelism]
        console.print(
            f"\n[magenta]Speculate[/magenta] #{issue.id}: {issue.title} "
            f"(×{parallelism}: {', '.join(candidates)})"
        )

        # Track as running
        self._running_tasks.add(issue.id)

        try:
            # Create one workcell per candidate toolchain.
            workcells: list[tuple[str, str, Path]] = []
            for toolchain in candidates:
                tag = f"spec-{toolchain}"
                try:
                    path = self.workcell_manager.create(issue.id, speculate_tag=tag)
                except Exception as exc:
                    self.state_manager.add_event(
                        issue.id,
                        "workcell.create_failed",
                        {
                            "toolchain": toolchain,
                            "speculate_tag": tag,
                            "error": str(exc),
                        },
                    )
                    console.print(
                        f"  [red]✗[/red] Workcell create failed for {toolchain}: {exc}"
                    )
                    continue
                workcells.append((toolchain, tag, path))

                # Dynamics: capture from_state for each workcell
                workcell_id = path.name
                from_state = self._build_from_state(issue, workcell_id, toolchain)
                self._workcell_from_states[workcell_id] = from_state

            if not workcells:
                self._handle_workcell_create_failure(
                    issue, RuntimeError("All speculate workcell creations failed")
                )
                return

            # Update issue status
            self.state_manager.update_issue_status(issue.id, "running")
            self.state_manager.add_event(
                issue.id,
                "issue.started",
                {"speculate": True},
            )

            # Dispatch all candidates in parallel (one per toolchain).
            dispatch_tasks = []
            for toolchain, tag, path in workcells:
                self.state_manager.add_event(
                    issue.id,
                    "workcell.created",
                    {
                        "toolchain": toolchain,
                        "speculate_tag": tag,
                    },
                    workcell_id=path.name,
                )
                self.state_manager.add_event(
                    issue.id,
                    "workcell.started",
                    {
                        "toolchain": toolchain,
                        "speculate_tag": tag,
                    },
                    workcell_id=path.name,
                )
                toolchain_cfg = self.config.toolchains.get(toolchain)
                timeout_seconds = (
                    int(getattr(toolchain_cfg, "timeout_seconds", 1800))
                    if toolchain_cfg is not None
                    else 1800
                )
                planner_bundle = self.planner_integration.build_manifest_planner_bundle(
                    selection=selection,
                    swarm_id_executed="speculate_vote",
                    timeout_seconds_default=int(timeout_seconds),
                    max_iterations_executed=None,
                )
                dispatch_tasks.append(
                    self.dispatcher.dispatch_async(
                        issue,
                        path,
                        speculate_tag=tag,
                        toolchain_override=toolchain,
                        manifest_overrides={"planner": planner_bundle},
                    )
                )
            results = await asyncio.gather(*dispatch_tasks)

            workcell_by_id = {path.name: path for _, _, path in workcells}

            # Verify all candidates before voting.
            for r in results:
                if r.proof:
                    path = workcell_by_id.get(r.workcell_id)
                    if path:
                        self.verifier.verify(r.proof, path)

            proofs = [r.proof for r in results if r.proof]
            self.state_manager.add_event(
                issue.id,
                "speculate.voting",
                {
                    "candidates": candidates,
                    "count": len(candidates),
                },
            )
            winner_proof = self.verifier.vote(proofs) if proofs else None

            winner_result: DispatchResult | None = None
            winner_path: Path | None = None

            if winner_proof:
                for r in results:
                    if r.proof and r.proof.workcell_id == winner_proof.workcell_id:
                        winner_result = r
                        winner_path = workcell_by_id.get(r.workcell_id)
                        break

            # Fallback if vote didn't return a winner (e.g., all failed gates).
            if not winner_result:
                passing = [
                    r
                    for r in results
                    if r.proof
                    and isinstance(r.proof.verification, dict)
                    and r.proof.verification.get("all_passed", False)
                ]
                if passing:
                    passing.sort(
                        key=lambda x: x.proof.confidence if x.proof else 0,
                        reverse=True,
                    )
                    winner_result = passing[0]
                    winner_path = workcell_by_id.get(winner_result.workcell_id)
                else:
                    successful = [r for r in results if r.success and r.proof]
                    if successful:
                        successful.sort(
                            key=lambda x: x.proof.confidence if x.proof else 0,
                            reverse=True,
                        )
                        winner_result = successful[0]
                        winner_path = workcell_by_id.get(winner_result.workcell_id)

            # If still no winner, fail the issue using the first candidate (best-effort).
            if not winner_result or not winner_path:
                fallback_path = workcells[0][2]
                await self._handle_failure(issue, results[0] if results else None, fallback_path)
                for _, _, path in workcells[1:]:
                    self.workcell_manager.cleanup(path, keep_logs=False)
                return

            verified = (
                bool(winner_result.proof)
                and isinstance(winner_result.proof.verification, dict)
                and winner_result.proof.verification.get("all_passed", False)
            )

            # Memory: record only the winning workcell's execution
            winner_workcell_id = winner_path.name
            manifest_base = self.dispatcher._build_manifest(
                issue, winner_workcell_id, winner_result.toolchain, winner_result.speculate_tag
            )
            self.memory_bridge.on_workcell_start(
                workcell_id=winner_workcell_id,
                issue=issue,
                manifest=manifest_base,
            )
            self.memory_bridge.on_dispatch_complete(
                workcell_id=winner_workcell_id,
                workcell_path=winner_path,
                proof=winner_result.proof,
            )

            # Memory: record gate results for winner
            if winner_result.proof and isinstance(winner_result.proof.verification, dict):
                gates = winner_result.proof.verification.get("gates", {})
                for gate_name, gate_result in gates.items():
                    if isinstance(gate_result, dict):
                        self.memory_bridge.on_gate_result(
                            gate_name=gate_name,
                            passed=gate_result.get("passed", False),
                            score=gate_result.get("score"),
                            fail_codes=gate_result.get("fail_codes", []),
                        )

            if verified:
                await self._handle_success(issue, winner_result, winner_path)
                self.memory_bridge.on_workcell_end(winner_workcell_id, "success")
                consolidation_result = self.sleeptime.on_workcell_complete(success=True)
                if consolidation_result and consolidation_result.success:
                    self.controller._report = self.controller._load_report()
            else:
                await self._handle_failure(issue, winner_result, winner_path)
                self.memory_bridge.on_workcell_end(winner_workcell_id, "failed")
                consolidation_result = self.sleeptime.on_workcell_complete(success=False)
                if consolidation_result and consolidation_result.success:
                    self.controller._report = self.controller._load_report()

            # Cleanup non-winners (keep logs only for the chosen candidate).
            for _, _, path in workcells:
                if path.name == winner_path.name:
                    continue
                self.workcell_manager.cleanup(path, keep_logs=False)

        finally:
            self._running_tasks.discard(issue.id)

    async def _handle_success(
        self,
        issue: Issue,
        result: DispatchResult,
        workcell_path: Path,
    ) -> None:
        """Handle successful workcell completion."""
        console.print(f"  [green]✓[/green] #{issue.id} completed")

        self._stats["issues_completed"] += 1
        self._stats["total_duration_ms"] += result.duration_ms

        # Dynamics: record successful transition
        workcell_id = workcell_path.name
        self._record_transition(workcell_id, issue, result, verified=True)

        if result.proof:
            # Apply patch (merge to main) unless explicitly disabled for this issue.
            if getattr(issue, "dk_apply_patch", True):
                self.dispatcher.apply_patch(result.proof, workcell_path)

        # Update Beads
        self.state_manager.update_issue_status(issue.id, "done")

        # Log event
        self.state_manager.add_event(
            issue.id,
            "workcell.completed",
            {
                "toolchain": result.toolchain,
                "duration_ms": result.duration_ms,
                "speculate_tag": result.speculate_tag,
            },
            workcell_id=workcell_id,
        )
        self.state_manager.add_event(
            issue.id,
            "issue.completed",
            {
                "toolchain": result.toolchain,
                "duration_ms": result.duration_ms,
                "speculate_tag": result.speculate_tag,
            },
        )

        # Cleanup workcell
        self.workcell_manager.cleanup(workcell_path, keep_logs=True)

    def _handle_workcell_create_failure(self, issue: Issue, error: Exception) -> None:
        """Handle failures that occur before a workcell is created."""
        error_summary = str(error)
        console.print(f"  [red]✗[/red] #{issue.id} workcell create failed: {error_summary}")

        current_attempts = self.state_manager.increment_attempts(issue.id)
        self.state_manager.add_event(
            issue.id,
            "workcell.create_failed",
            {
                "toolchain": getattr(issue, "dk_tool_hint", None),
                "error": error_summary,
                "attempt": current_attempts,
            },
        )

        if current_attempts >= issue.dk_max_attempts:
            self.state_manager.update_issue_status(issue.id, "escalated")
            console.print(f"  [yellow]⚠[/yellow] #{issue.id} escalated (max attempts reached)")
            self._create_escalation_issue(issue, None, error_summary=error_summary)
        else:
            self.state_manager.update_issue_status(issue.id, "ready")
            console.print(f"  [dim]Attempt {current_attempts}/{issue.dk_max_attempts}[/dim]")

    async def _handle_failure(
        self,
        issue: Issue,
        result: DispatchResult | None,
        workcell_path: Path,
    ) -> None:
        """Handle workcell failure."""
        console.print(f"  [red]✗[/red] #{issue.id} failed")

        self._stats["issues_failed"] += 1
        if result:
            self._stats["total_duration_ms"] += result.duration_ms

        # Dynamics: record failed transition
        workcell_id = workcell_path.name
        self._record_transition(workcell_id, issue, result, verified=False)

        # Update attempts
        current_attempts = self.state_manager.increment_attempts(issue.id)

        # Prefer verification context over generic dispatch errors.
        error_summary = None
        if result and result.error:
            error_summary = result.error
        elif result and result.proof and isinstance(result.proof.verification, dict):
            blocking = result.proof.verification.get("blocking_failures") or []
            if blocking:
                error_summary = f"Gate failures: {', '.join(blocking)}"

        # Log event
        self.state_manager.add_event(
            issue.id,
            "workcell.failed",
            {
                "toolchain": result.toolchain if result else "unknown",
                "error": error_summary or "Unknown error",
                "attempt": current_attempts,
            },
            workcell_id=workcell_id,
        )
        self.state_manager.add_event(
            issue.id,
            "issue.failed",
            {
                "toolchain": result.toolchain if result else "unknown",
                "error": error_summary or "Unknown error",
                "attempt": current_attempts,
            },
        )

        # If this is an asset issue and fab-* gates provided repair hints, persist them back
        # onto the issue description so the next attempt has concrete guidance.
        if result:
            self._maybe_update_issue_with_repair_hints(issue, result, current_attempts)

        # Check if should escalate
        if current_attempts >= issue.dk_max_attempts:
            self.state_manager.update_issue_status(issue.id, "escalated")
            console.print(f"  [yellow]⚠[/yellow] #{issue.id} escalated (max attempts reached)")

            # Create escalation issue
            self._create_escalation_issue(issue, result, error_summary)
        else:
            # Re-queue for another attempt; the scheduler already enforces max attempts.
            self.state_manager.update_issue_status(issue.id, "ready")
            console.print(f"  [dim]Attempt {current_attempts}/{issue.dk_max_attempts}[/dim]")

        # Cleanup workcell (keep logs for debugging)
        self.workcell_manager.cleanup(workcell_path, keep_logs=True)

    def _maybe_update_issue_with_repair_hints(
        self,
        issue: Issue,
        result: DispatchResult,
        attempt: int,
    ) -> None:
        """Write the latest fab gate repair hints back to the issue description."""
        if not any(t.startswith("asset:") for t in (issue.tags or [])):
            return

        if not result.proof or not isinstance(result.proof.verification, dict):
            return

        gates = result.proof.verification.get("gates")
        if not isinstance(gates, dict):
            return

        failing_with_actions: list[tuple[str, list[dict[str, Any]]]] = []
        for gate_name, gate_result in gates.items():
            if not isinstance(gate_result, dict):
                continue
            if gate_result.get("passed") is True:
                continue
            actions = gate_result.get("next_actions")
            if isinstance(actions, list) and actions:
                typed_actions = [a for a in actions if isinstance(a, dict)]
                if typed_actions:
                    failing_with_actions.append((str(gate_name), typed_actions))

        if not failing_with_actions:
            return

        start_marker = "<!-- DEV_KERNEL_AUTOGEN_REPAIR -->"
        end_marker = "<!-- /DEV_KERNEL_AUTOGEN_REPAIR -->"

        base = (issue.description or "").strip()
        if start_marker in base and end_marker in base:
            start = base.find(start_marker)
            end = base.find(end_marker, start)
            if end != -1:
                base = (base[:start] + base[end + len(end_marker) :]).strip()

        lines: list[str] = []
        lines.append(start_marker)
        lines.append(f"## Kernel Repair Hints (Attempt {attempt})")
        lines.append(
            "These instructions were generated from the most recent failed fab gate run."
        )
        lines.append("")

        for gate_name, actions in failing_with_actions:
            lines.append(f"### {gate_name}")
            for action in actions[:12]:
                priority = action.get("priority", 3)
                fail_code = action.get("fail_code", "UNKNOWN")
                instructions = str(action.get("instructions", "")).strip()
                if not instructions:
                    instructions = f"Fix {fail_code}"
                lines.append(f"- [P{priority}] `{fail_code}`: {instructions}")
            lines.append("")

        lines.append(end_marker)

        new_description = (base + "\n\n" + "\n".join(lines)).strip()
        try:
            self.state_manager.update_issue(issue.id, description=new_description)
        except Exception as e:
            logger.warning("Failed to update issue with repair hints", issue_id=issue.id, error=str(e))

    def _planner_universe_context(self) -> tuple[str, dict[str, Any], ActionSpace]:
        """
        Resolve universe defaults + swarm catalog for planner artifacts.

        Returns (universe_id, universe_defaults, action_space).
        """
        from cyntra.planner.action_space import action_space_for_swarms

        universe_id = self.universe_id or "unknown"
        universe_defaults: dict[str, Any] = {"swarm_id": None, "objective_id": None}
        swarm_ids: list[str] = ["serial_handoff", "speculate_vote"]

        if self.universe_config:
            universe_id = self.universe_config.universe_id

            defaults = self.universe_config.raw.get("defaults") if isinstance(self.universe_config.raw, dict) else {}
            if isinstance(defaults, dict):
                swarm_default = defaults.get("swarm_id")
                objective_default = defaults.get("objective_id")
                universe_defaults = {
                    "swarm_id": str(swarm_default) if isinstance(swarm_default, str) and swarm_default else None,
                    "objective_id": str(objective_default)
                    if isinstance(objective_default, str) and objective_default
                    else None,
                }

            swarms = self.universe_config.swarms
            if isinstance(swarms, dict):
                swarms_map = swarms.get("swarms")
                if isinstance(swarms_map, dict):
                    swarm_ids = sorted([str(k) for k in swarms_map.keys() if isinstance(k, str) and k])

        action_space = action_space_for_swarms(swarm_ids)
        return universe_id, universe_defaults, action_space

    def _create_escalation_issue(
        self,
        original_issue: Issue,
        result: DispatchResult | None,
        error_summary: str | None = None,
    ) -> None:
        """Create a new issue for human review after escalation."""
        if any(
            t in {"escalation", "needs-human", "@human-escalated", "human-escalated"}
            for t in (original_issue.tags or [])
        ) or original_issue.title.startswith("[ESCALATION]"):
            console.print(
                f"  [dim]Escalation suppressed for #{original_issue.id} (already escalated)[/dim]"
            )
            return

        error = error_summary or (result.error if result else None) or "Unknown error after max attempts"

        title = f"[ESCALATION] {original_issue.title}"
        description = (
            f"Automated processing failed after {original_issue.dk_max_attempts} attempts.\n\n"
            f"## Original Issue #{original_issue.id}\n"
            f"{original_issue.description or '(no description)'}\n\n"
            f"## Failure Details\n{error}\n\n"
            f"## Action Required\nManual review and intervention needed."
        )
        tags = sorted(set((original_issue.tags or []) + ["escalation", "needs-human"]))

        try:
            new_issue_id = self.state_manager.create_issue(
                title=title,
                description=description,
                priority=original_issue.dk_priority or "P2",
                tags=tags,
            )

            if new_issue_id:
                self.state_manager.update_issue(
                    new_issue_id,
                    dk_parent=original_issue.id,
                    status="escalated",
                )
                console.print(f"  [dim]Created escalation issue #{new_issue_id}[/dim]")
        except Exception as e:
            logger.error("Failed to create escalation issue", error=str(e))

    def _display_schedule(self, schedule: ScheduleResult) -> None:
        """Display the scheduling plan."""
        table = Table(title=f"Scheduled Work (Cycle {self._cycle_count})")
        table.add_column("Issue", style="cyan")
        table.add_column("Title")
        table.add_column("Priority")
        table.add_column("Risk")
        table.add_column("Mode")
        show_knobs = self.config.dry_run
        if show_knobs:
            table.add_column("Knobs")

        spec_ids = {i.id for i in schedule.speculate_issues}

        for issue in schedule.scheduled_lanes:
            mode = "[magenta]speculate[/magenta]" if issue.id in spec_ids else "single"
            row = [
                f"#{issue.id}",
                issue.title[:40] + ("..." if len(issue.title) > 40 else ""),
                issue.dk_priority or "P2",
                issue.dk_risk or "medium",
                mode,
            ]
            if show_knobs:
                decision = self.controller.decide(issue)
                parts: list[str] = []
                if decision.temperature is not None:
                    parts.append(f"temp={decision.temperature:.2f}")
                if decision.speculate_parallelism is not None:
                    parts.append(f"par={decision.speculate_parallelism}")
                if decision.mode:
                    parts.append(decision.mode)
                row.append(", ".join(parts) if parts else "default")
            table.add_row(*row)

        console.print(table)

        if schedule.skipped_issues:
            console.print(
                f"[dim]Skipped {len(schedule.skipped_issues)} issues "
                f"(slots/tokens)[/dim]"
            )

    def _display_summary(self) -> None:
        """Display run summary."""
        if self._stats["issues_completed"] > 0 or self._stats["issues_failed"] > 0:
            console.print("\n")
            summary = Panel(
                f"[green]Completed:[/green] {self._stats['issues_completed']}  "
                f"[red]Failed:[/red] {self._stats['issues_failed']}  "
                f"[dim]Cycles:[/dim] {self._cycle_count}  "
                f"[dim]Total Time:[/dim] {self._stats['total_duration_ms'] / 1000:.1f}s",
                title="Run Summary",
            )
            console.print(summary)

    def stop(self) -> None:
        """Stop the kernel loop."""
        self._running = False

    # ─────────────────────────────────────────────────────────────────
    # Dynamics Transition Tracking
    # ─────────────────────────────────────────────────────────────────

    def _build_from_state(
        self,
        issue: Issue,
        workcell_id: str,
        toolchain: str,
    ) -> dict:
        """Build the initial state before workcell execution."""
        domain = self._infer_domain(issue)
        job_type = issue.dk_tool_hint or "code"

        features = {
            "phase": "plan",
            "failing_gate": "none",
            "attempt": issue.dk_attempts,
            "risk": issue.dk_risk or "medium",
            "size": issue.dk_size or "medium",
        }

        policy_key = {"toolchain": toolchain}

        return build_state_t1(
            domain=domain,
            job_type=job_type,
            features=features,
            policy_key=policy_key,
        )

    def _build_to_state(
        self,
        issue: Issue,
        result: DispatchResult | None,
        verified: bool,
    ) -> dict:
        """Build the terminal state after workcell execution."""
        domain = self._infer_domain(issue)
        job_type = issue.dk_tool_hint or "code"

        # Determine phase based on outcome
        if verified:
            phase = "verified"
        elif result and result.success:
            phase = "edit"  # Made changes but didn't pass gates
        else:
            phase = "failed"

        # Extract failing gate info from proof
        failing_gate = "none"
        if result and result.proof and isinstance(result.proof.verification, dict):
            gates = result.proof.verification.get("gates", {})
            for gate_name, gate_result in gates.items():
                if isinstance(gate_result, dict) and not gate_result.get("passed", False):
                    failing_gate = gate_name
                    break

        features = {
            "phase": phase,
            "failing_gate": failing_gate,
            "attempt": issue.dk_attempts + 1,
            "risk": issue.dk_risk or "medium",
            "size": issue.dk_size or "medium",
        }

        policy_key = {"toolchain": result.toolchain if result else "unknown"}

        return build_state_t1(
            domain=domain,
            job_type=job_type,
            features=features,
            policy_key=policy_key,
        )

    def _record_transition(
        self,
        workcell_id: str,
        issue: Issue,
        result: DispatchResult | None,
        verified: bool,
    ) -> None:
        """Record the state transition to the dynamics database."""
        from_state = self._workcell_from_states.get(workcell_id)
        if not from_state:
            logger.debug("No from_state for transition", workcell_id=workcell_id)
            return

        to_state = self._build_to_state(issue, result, verified)

        import uuid
        transition_id = f"tr_{uuid.uuid4().hex[:12]}"

        transition = {
            "transition_id": transition_id,
            "rollout_id": None,
            "from_state": from_state,
            "to_state": to_state,
            "transition_kind": "workcell_complete",
            "timestamp": _utc_now().isoformat(),
            "context": {
                "workcell_id": workcell_id,
                "issue_id": issue.id,
                "job_type": issue.dk_tool_hint or "code",
                "toolchain": result.toolchain if result else "unknown",
            },
            "action_label": {
                "tool": result.toolchain if result else "unknown",
                "command_class": "dispatch",
                "domain": self._infer_domain(issue),
            },
            "observations": {
                "verified": verified,
                "duration_ms": result.duration_ms if result else 0,
                "confidence": result.proof.confidence if result and result.proof else 0,
            },
        }

        try:
            self.transition_db.insert_transition(transition)
            self.transition_db.conn.commit()
            logger.debug(
                "Recorded transition",
                transition_id=transition_id,
                from_state=from_state.get("state_id"),
                to_state=to_state.get("state_id"),
            )
        except Exception as e:
            logger.warning("Failed to record transition", error=str(e))

        # Cleanup from_state tracking
        self._workcell_from_states.pop(workcell_id, None)

    def _infer_domain(self, issue: Issue) -> str:
        """Infer domain from issue tags."""
        tags = issue.tags or []
        if "fab" in tags or "asset" in tags:
            return "fab_asset"
        if "world" in tags or "scene" in tags:
            return "fab_world"
        return "code"
