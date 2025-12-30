"""
Research Scheduler - Evaluate schedules and determine which programs are due.

Features:
- Cron expression evaluation
- Budget checking (per-run, daily, weekly limits)
- Priority ranking with dependency resolution
- Backoff for repeated failures
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cyntra.research.models import ResearchProgram
    from cyntra.research.registry import Registry

logger = logging.getLogger(__name__)


# =============================================================================
# Cron Expression Parser
# =============================================================================


@dataclass
class CronField:
    """A single field in a cron expression."""

    values: set[int]
    min_val: int
    max_val: int

    @classmethod
    def parse(cls, expr: str, min_val: int, max_val: int) -> CronField:
        """Parse a cron field expression."""
        values: set[int] = set()

        for part in expr.split(","):
            part = part.strip()

            if part == "*":
                # Wildcard - all values
                values.update(range(min_val, max_val + 1))
            elif "/" in part:
                # Step value (e.g., */5, 0-30/5)
                range_part, step_str = part.split("/", 1)
                step = int(step_str)

                if range_part == "*":
                    start, end = min_val, max_val
                elif "-" in range_part:
                    start_str, end_str = range_part.split("-", 1)
                    start, end = int(start_str), int(end_str)
                else:
                    start = int(range_part)
                    end = max_val

                values.update(range(start, end + 1, step))
            elif "-" in part:
                # Range (e.g., 1-5)
                start_str, end_str = part.split("-", 1)
                start, end = int(start_str), int(end_str)
                values.update(range(start, end + 1))
            else:
                # Single value
                values.add(int(part))

        # Clamp to valid range
        values = {v for v in values if min_val <= v <= max_val}

        return cls(values=values, min_val=min_val, max_val=max_val)

    def matches(self, value: int) -> bool:
        """Check if a value matches this field."""
        return value in self.values

    def next_value(self, current: int) -> int | None:
        """Get the next matching value >= current, or None if none in range."""
        for v in sorted(self.values):
            if v >= current:
                return v
        return None

    def first_value(self) -> int:
        """Get the smallest matching value."""
        return min(self.values)


@dataclass
class CronExpression:
    """
    A parsed cron expression.

    Format: minute hour day-of-month month day-of-week

    Examples:
    - "0 8 * * 1" = Every Monday at 8:00 AM
    - "0 0 1,15 * *" = 1st and 15th of each month at midnight
    - "*/15 * * * *" = Every 15 minutes
    """

    minute: CronField
    hour: CronField
    day_of_month: CronField
    month: CronField
    day_of_week: CronField

    @classmethod
    def parse(cls, expr: str) -> CronExpression:
        """Parse a cron expression string."""
        parts = expr.strip().split()
        if len(parts) != 5:
            raise ValueError(f"Cron expression must have 5 parts, got {len(parts)}: {expr}")

        return cls(
            minute=CronField.parse(parts[0], 0, 59),
            hour=CronField.parse(parts[1], 0, 23),
            day_of_month=CronField.parse(parts[2], 1, 31),
            month=CronField.parse(parts[3], 1, 12),
            day_of_week=CronField.parse(parts[4], 0, 6),  # 0=Sunday
        )

    def matches(self, dt: datetime) -> bool:
        """Check if a datetime matches this cron expression."""
        # Day matching is OR: either day_of_month OR day_of_week must match
        # (unless both are specific values, then both must match)
        dom_is_wildcard = self.day_of_month.values == set(range(1, 32))
        dow_is_wildcard = self.day_of_week.values == set(range(0, 7))

        minute_match = self.minute.matches(dt.minute)
        hour_match = self.hour.matches(dt.hour)
        month_match = self.month.matches(dt.month)
        dom_match = self.day_of_month.matches(dt.day)
        dow_match = self.day_of_week.matches(dt.weekday())  # Monday=0 in Python

        # Convert Python weekday (Monday=0) to cron weekday (Sunday=0)
        cron_weekday = (dt.weekday() + 1) % 7
        dow_match = self.day_of_week.matches(cron_weekday)

        if dom_is_wildcard and dow_is_wildcard:
            day_match = True
        elif dom_is_wildcard:
            day_match = dow_match
        elif dow_is_wildcard:
            day_match = dom_match
        else:
            # Both specified - use OR semantics (standard cron behavior)
            day_match = dom_match or dow_match

        return minute_match and hour_match and month_match and day_match

    def next_run(self, after: datetime, max_iterations: int = 1000000) -> datetime | None:
        """
        Calculate the next run time after the given datetime.

        Returns None if no match found within max_iterations minutes.
        """
        # Start from the next minute
        current = after.replace(second=0, microsecond=0) + timedelta(minutes=1)

        for _ in range(max_iterations):
            if self.matches(current):
                return current
            current += timedelta(minutes=1)

        return None

    def is_due(self, now: datetime, last_run: datetime | None, min_interval_hours: int = 1) -> bool:
        """
        Check if the schedule is due to run.

        Args:
            now: Current time
            last_run: Time of last run (None if never run)
            min_interval_hours: Minimum hours between runs
        """
        # If never run, it's due if we match now
        if last_run is None:
            return self.matches(now)

        # Check minimum interval
        min_interval = timedelta(hours=min_interval_hours)
        if now - last_run < min_interval:
            return False

        # Check if we've passed a scheduled time since last run
        next_after_last = self.next_run(last_run)
        if next_after_last is None:
            return False

        return now >= next_after_last


# =============================================================================
# Budget Tracker
# =============================================================================


@dataclass
class BudgetUsage:
    """Track budget usage over time."""

    program_id: str
    today_cost: Decimal = Decimal("0")
    today_date: datetime | None = None
    week_cost: Decimal = Decimal("0")
    week_start: datetime | None = None


class BudgetTracker:
    """Track and enforce budget limits across programs."""

    def __init__(self, registry: Registry):
        self.registry = registry
        self._usage: dict[str, BudgetUsage] = {}

    def _get_usage(self, program_id: str) -> BudgetUsage:
        """Get or create usage tracker for a program."""
        if program_id not in self._usage:
            self._usage[program_id] = BudgetUsage(program_id=program_id)
        return self._usage[program_id]

    def _reset_if_needed(self, usage: BudgetUsage, now: datetime) -> None:
        """Reset daily/weekly counters if period has passed."""
        today = now.date()

        # Reset daily
        if usage.today_date is None or usage.today_date.date() != today:
            usage.today_cost = Decimal("0")
            usage.today_date = now

        # Reset weekly (week starts Monday)
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        if usage.week_start is None or usage.week_start < week_start:
            usage.week_cost = Decimal("0")
            usage.week_start = week_start

    def check_budget(
        self,
        program: ResearchProgram,
        now: datetime | None = None,
    ) -> tuple[bool, str | None]:
        """
        Check if a program is within budget limits.

        Returns:
            (allowed, reason) - True if allowed, False with reason if denied
        """
        now = now or datetime.now(UTC)
        usage = self._get_usage(program.program_id)
        self._reset_if_needed(usage, now)

        budgets = program.budgets

        # Check daily limit
        if usage.today_cost >= Decimal(str(budgets.max_cost_per_day)):
            return (
                False,
                f"Daily budget exhausted (${usage.today_cost:.2f} >= ${budgets.max_cost_per_day:.2f})",
            )

        # Check weekly limit
        if usage.week_cost >= Decimal(str(budgets.max_cost_per_week)):
            return (
                False,
                f"Weekly budget exhausted (${usage.week_cost:.2f} >= ${budgets.max_cost_per_week:.2f})",
            )

        # Check if single run would exceed limits
        max_run_cost = Decimal(str(budgets.max_cost_per_run))
        if usage.today_cost + max_run_cost > Decimal(str(budgets.max_cost_per_day)):
            return False, "Run would exceed daily budget"

        return True, None

    def record_cost(self, program_id: str, cost: float, now: datetime | None = None) -> None:
        """Record cost incurred by a program."""
        now = now or datetime.now(UTC)
        usage = self._get_usage(program_id)
        self._reset_if_needed(usage, now)

        cost_decimal = Decimal(str(cost))
        usage.today_cost += cost_decimal
        usage.week_cost += cost_decimal

    def get_remaining_budget(
        self, program: ResearchProgram, now: datetime | None = None
    ) -> dict[str, float]:
        """Get remaining budget for a program."""
        now = now or datetime.now(UTC)
        usage = self._get_usage(program.program_id)
        self._reset_if_needed(usage, now)

        budgets = program.budgets
        return {
            "daily_remaining": float(Decimal(str(budgets.max_cost_per_day)) - usage.today_cost),
            "weekly_remaining": float(Decimal(str(budgets.max_cost_per_week)) - usage.week_cost),
            "per_run_limit": budgets.max_cost_per_run,
        }


# =============================================================================
# Priority Ranker
# =============================================================================


@dataclass
class RankedProgram:
    """A program with its priority score."""

    program: ResearchProgram
    priority_score: float
    reasons: list[str] = field(default_factory=list)


class PriorityRanker:
    """Rank programs by priority for execution."""

    def __init__(self, registry: Registry):
        self.registry = registry

    def rank_programs(
        self,
        programs: list[ResearchProgram],
        now: datetime | None = None,
    ) -> list[RankedProgram]:
        """
        Rank programs by priority.

        Priority factors:
        1. Explicit priority (from config if present)
        2. Time since last run (staleness)
        3. Consecutive failures (lower priority to avoid thrashing)
        4. Output type (radar > deep_dive for quick value)
        """
        now = now or datetime.now(UTC)
        ranked = []

        for program in programs:
            score, reasons = self._calculate_priority(program, now)
            ranked.append(RankedProgram(program=program, priority_score=score, reasons=reasons))

        # Sort by score descending
        ranked.sort(key=lambda r: r.priority_score, reverse=True)
        return ranked

    def _calculate_priority(
        self,
        program: ResearchProgram,
        now: datetime,
    ) -> tuple[float, list[str]]:
        """Calculate priority score for a program."""
        score = 50.0  # Base score
        reasons: list[str] = []

        # Get schedule state
        state = self.registry.schedule_state.get_program_state(program.program_id)

        # Factor 1: Staleness (time since last run)
        if state.last_run_at:
            hours_since = (now - state.last_run_at).total_seconds() / 3600
            staleness_bonus = min(hours_since / 24, 20)  # Cap at 20 points
            score += staleness_bonus
            reasons.append(f"staleness: +{staleness_bonus:.1f}")
        else:
            # Never run - high priority
            score += 25
            reasons.append("never_run: +25")

        # Factor 2: Consecutive failures (penalty)
        if state.consecutive_failures > 0:
            failure_penalty = min(state.consecutive_failures * 10, 40)  # Cap at 40
            score -= failure_penalty
            reasons.append(f"failures({state.consecutive_failures}): -{failure_penalty}")

        # Factor 3: Output type
        if program.output.type.value == "radar":
            score += 5
            reasons.append("radar_type: +5")
        else:
            # deep_dive takes longer, slightly lower priority
            score -= 5
            reasons.append("deep_dive_type: -5")

        # Factor 4: Budget efficiency (lower max_cost = higher priority)
        budget_efficiency = 10 - min(program.budgets.max_cost_per_run, 10)
        score += budget_efficiency
        reasons.append(f"budget_efficiency: +{budget_efficiency:.1f}")

        return score, reasons

    def resolve_dependencies(
        self,
        programs: list[ResearchProgram],
    ) -> list[ResearchProgram]:
        """
        Order programs respecting dependencies.

        Programs with `dependencies.requires` must run after their dependencies.
        """
        # Build dependency graph
        program_map = {p.program_id: p for p in programs}
        resolved: list[ResearchProgram] = []
        pending = set(program_map.keys())
        satisfied: set[str] = set()

        max_iterations = len(programs) * 2
        iteration = 0

        while pending and iteration < max_iterations:
            iteration += 1
            made_progress = False

            for program_id in list(pending):
                program = program_map[program_id]
                requires = program.dependencies.get("requires", [])

                # Check if all dependencies are satisfied or not in pending
                deps_satisfied = all(dep in satisfied or dep not in program_map for dep in requires)

                if deps_satisfied:
                    resolved.append(program)
                    satisfied.add(program_id)
                    pending.remove(program_id)
                    made_progress = True

            if not made_progress and pending:
                # Circular dependency or missing deps - add remaining in original order
                logger.warning(f"Possible circular dependency in: {pending}")
                for program_id in list(pending):
                    resolved.append(program_map[program_id])
                    pending.remove(program_id)

        return resolved


# =============================================================================
# Main Scheduler
# =============================================================================


@dataclass
class ScheduleDecision:
    """Decision about whether to run a program."""

    program_id: str
    should_run: bool
    reason: str
    next_run_at: datetime | None = None
    priority_score: float = 0.0


class Scheduler:
    """
    Main research scheduler.

    Determines which programs are due to run based on:
    - Cron schedule
    - Budget limits
    - Priority ranking
    - Failure backoff
    """

    def __init__(self, registry: Registry):
        self.registry = registry
        self.budget_tracker = BudgetTracker(registry)
        self.priority_ranker = PriorityRanker(registry)
        self._cron_cache: dict[str, CronExpression] = {}

    def _get_cron(self, program: ResearchProgram) -> CronExpression:
        """Get cached cron expression for a program."""
        if program.program_id not in self._cron_cache:
            self._cron_cache[program.program_id] = CronExpression.parse(program.schedule.cadence)
        return self._cron_cache[program.program_id]

    def is_due(self, program: ResearchProgram, now: datetime | None = None) -> ScheduleDecision:
        """
        Check if a program is due to run.

        Returns a ScheduleDecision with the result.
        """
        now = now or datetime.now(UTC)

        # Check if enabled
        if not program.schedule.enabled:
            return ScheduleDecision(
                program_id=program.program_id,
                should_run=False,
                reason="Program is disabled",
            )

        # Get schedule state
        state = self.registry.schedule_state.get_program_state(program.program_id)

        # Check cron schedule
        cron = self._get_cron(program)
        is_scheduled = cron.is_due(
            now,
            state.last_run_at,
            program.schedule.min_interval_hours,
        )

        if not is_scheduled:
            next_run = cron.next_run(now)
            return ScheduleDecision(
                program_id=program.program_id,
                should_run=False,
                reason="Not scheduled yet",
                next_run_at=next_run,
            )

        # Check skip_if_running (would need to check workcell state)
        # For now, assume not running

        # Check budget
        budget_ok, budget_reason = self.budget_tracker.check_budget(program, now)
        if not budget_ok:
            return ScheduleDecision(
                program_id=program.program_id,
                should_run=False,
                reason=f"Budget limit: {budget_reason}",
            )

        # Check failure backoff
        if state.consecutive_failures >= 3:
            # Exponential backoff: 1h, 2h, 4h, 8h...
            backoff_hours = min(2 ** (state.consecutive_failures - 3), 24)
            if state.last_run_at:
                backoff_until = state.last_run_at + timedelta(hours=backoff_hours)
                if now < backoff_until:
                    return ScheduleDecision(
                        program_id=program.program_id,
                        should_run=False,
                        reason=f"Backoff after {state.consecutive_failures} failures (until {backoff_until.isoformat()})",
                        next_run_at=backoff_until,
                    )

        return ScheduleDecision(
            program_id=program.program_id,
            should_run=True,
            reason="Scheduled and within budget",
        )

    def get_due_programs(self, now: datetime | None = None) -> list[RankedProgram]:
        """
        Get all programs that are due to run, ranked by priority.

        Returns programs in priority order with dependency resolution.
        """
        now = now or datetime.now(UTC)
        due_programs: list[ResearchProgram] = []

        for program in self.registry.list_programs(enabled_only=True):
            decision = self.is_due(program, now)
            if decision.should_run:
                due_programs.append(program)

        if not due_programs:
            return []

        # Resolve dependencies
        ordered = self.priority_ranker.resolve_dependencies(due_programs)

        # Rank by priority
        return self.priority_ranker.rank_programs(ordered, now)

    def get_next_run_times(self, now: datetime | None = None) -> list[tuple[str, datetime | None]]:
        """Get next run time for all programs."""
        now = now or datetime.now(UTC)
        results: list[tuple[str, datetime | None]] = []

        for program in self.registry.list_programs():
            if not program.schedule.enabled:
                results.append((program.program_id, None))
                continue

            cron = self._get_cron(program)
            state = self.registry.schedule_state.get_program_state(program.program_id)

            # If never run or last run was a while ago, next run might be now
            if state.last_run_at:
                next_run = cron.next_run(state.last_run_at)
            else:
                next_run = cron.next_run(now - timedelta(minutes=1))

            results.append((program.program_id, next_run))

        return results

    def get_schedule_summary(self, now: datetime | None = None) -> list[dict]:
        """Get a summary of all program schedules."""
        now = now or datetime.now(UTC)
        summaries = []

        for program in self.registry.list_programs():
            state = self.registry.schedule_state.get_program_state(program.program_id)
            decision = self.is_due(program, now)

            cron = self._get_cron(program)
            next_run = cron.next_run(now)

            budget_remaining = self.budget_tracker.get_remaining_budget(program, now)

            summaries.append(
                {
                    "program_id": program.program_id,
                    "name": program.name,
                    "enabled": program.schedule.enabled,
                    "cadence": program.schedule.cadence,
                    "last_run_at": state.last_run_at.isoformat() if state.last_run_at else None,
                    "last_run_id": state.last_run_id,
                    "next_run_at": next_run.isoformat() if next_run else None,
                    "is_due": decision.should_run,
                    "due_reason": decision.reason,
                    "consecutive_failures": state.consecutive_failures,
                    "last_error": state.last_error,
                    "budget_daily_remaining": budget_remaining["daily_remaining"],
                    "budget_weekly_remaining": budget_remaining["weekly_remaining"],
                }
            )

        return summaries


# =============================================================================
# Helper Functions
# =============================================================================


def parse_cron(expr: str) -> CronExpression:
    """Parse a cron expression."""
    return CronExpression.parse(expr)


def next_cron_time(expr: str, after: datetime | None = None) -> datetime | None:
    """Get the next time a cron expression will trigger."""
    after = after or datetime.now(UTC)
    cron = CronExpression.parse(expr)
    return cron.next_run(after)


def is_cron_due(
    expr: str,
    now: datetime | None = None,
    last_run: datetime | None = None,
    min_interval_hours: int = 1,
) -> bool:
    """Check if a cron expression is due."""
    now = now or datetime.now(UTC)
    cron = CronExpression.parse(expr)
    return cron.is_due(now, last_run, min_interval_hours)
