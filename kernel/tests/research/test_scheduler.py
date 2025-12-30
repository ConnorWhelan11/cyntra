"""
Unit tests for the research scheduler.

Tests:
- Cron expression parsing and evaluation
- Budget tracking and enforcement
- Priority ranking with dependency resolution
- Main scheduler decision logic
"""

from datetime import UTC, datetime, timedelta

import pytest

from cyntra.research.models import (
    BudgetConfig,
    OutputConfig,
    OutputType,
    ResearchProgram,
    ScheduleConfig,
)
from cyntra.research.scheduler import (
    BudgetTracker,
    CronExpression,
    CronField,
    PriorityRanker,
    RankedProgram,
    Scheduler,
    is_cron_due,
    next_cron_time,
    parse_cron,
)

# =============================================================================
# CronField Tests
# =============================================================================


class TestCronField:
    """Tests for CronField parsing."""

    def test_wildcard(self):
        """Wildcard should match all values in range."""
        field = CronField.parse("*", 0, 59)
        assert field.values == set(range(0, 60))
        assert field.matches(0)
        assert field.matches(30)
        assert field.matches(59)

    def test_single_value(self):
        """Single value should match only that value."""
        field = CronField.parse("5", 0, 59)
        assert field.values == {5}
        assert field.matches(5)
        assert not field.matches(4)
        assert not field.matches(6)

    def test_range(self):
        """Range should match all values in range."""
        field = CronField.parse("1-5", 0, 59)
        assert field.values == {1, 2, 3, 4, 5}
        assert field.matches(1)
        assert field.matches(5)
        assert not field.matches(0)
        assert not field.matches(6)

    def test_list(self):
        """List should match all listed values."""
        field = CronField.parse("1,5,10,15", 0, 59)
        assert field.values == {1, 5, 10, 15}
        assert field.matches(1)
        assert field.matches(15)
        assert not field.matches(2)

    def test_step(self):
        """Step should match values at step intervals."""
        field = CronField.parse("*/15", 0, 59)
        assert field.values == {0, 15, 30, 45}
        assert field.matches(0)
        assert field.matches(15)
        assert not field.matches(10)

    def test_range_with_step(self):
        """Range with step should work correctly."""
        field = CronField.parse("0-30/10", 0, 59)
        assert field.values == {0, 10, 20, 30}

    def test_combined_expressions(self):
        """Combined expressions should merge values."""
        field = CronField.parse("0,30,*/20", 0, 59)
        assert 0 in field.values
        assert 30 in field.values
        assert 20 in field.values
        assert 40 in field.values

    def test_out_of_range_clamped(self):
        """Values outside range should be clamped."""
        field = CronField.parse("100", 0, 59)
        assert len(field.values) == 0  # 100 is out of range

    def test_next_value(self):
        """next_value should return next matching value."""
        field = CronField.parse("0,15,30,45", 0, 59)
        assert field.next_value(0) == 0
        assert field.next_value(1) == 15
        assert field.next_value(16) == 30
        assert field.next_value(46) is None  # No more matches

    def test_first_value(self):
        """first_value should return smallest matching value."""
        field = CronField.parse("30,15,45", 0, 59)
        assert field.first_value() == 15


# =============================================================================
# CronExpression Tests
# =============================================================================


class TestCronExpression:
    """Tests for CronExpression parsing and evaluation."""

    def test_parse_basic(self):
        """Basic cron expression should parse correctly."""
        cron = CronExpression.parse("0 8 * * 1")
        assert 0 in cron.minute.values
        assert 8 in cron.hour.values
        assert cron.day_of_month.values == set(range(1, 32))
        assert cron.month.values == set(range(1, 13))
        assert 1 in cron.day_of_week.values  # Monday

    def test_parse_invalid_parts(self):
        """Invalid part count should raise error."""
        with pytest.raises(ValueError) as exc_info:
            CronExpression.parse("0 8 * *")  # Missing day-of-week
        assert "5 parts" in str(exc_info.value)

    def test_matches_exact(self):
        """matches should work for exact time."""
        cron = CronExpression.parse("30 14 15 6 *")  # 14:30 on June 15th
        dt = datetime(2025, 6, 15, 14, 30, 0, tzinfo=UTC)
        assert cron.matches(dt)

        # Wrong minute
        dt2 = datetime(2025, 6, 15, 14, 31, 0, tzinfo=UTC)
        assert not cron.matches(dt2)

    def test_matches_day_of_week(self):
        """Day of week matching should work correctly."""
        # Every Monday at 8:00
        cron = CronExpression.parse("0 8 * * 1")

        # Monday (2025-01-27 is a Monday)
        monday = datetime(2025, 1, 27, 8, 0, 0, tzinfo=UTC)
        assert cron.matches(monday)

        # Tuesday
        tuesday = datetime(2025, 1, 28, 8, 0, 0, tzinfo=UTC)
        assert not cron.matches(tuesday)

    def test_matches_every_15_minutes(self):
        """Every 15 minutes pattern should match correctly."""
        cron = CronExpression.parse("*/15 * * * *")

        assert cron.matches(datetime(2025, 1, 1, 10, 0, tzinfo=UTC))
        assert cron.matches(datetime(2025, 1, 1, 10, 15, tzinfo=UTC))
        assert cron.matches(datetime(2025, 1, 1, 10, 30, tzinfo=UTC))
        assert cron.matches(datetime(2025, 1, 1, 10, 45, tzinfo=UTC))
        assert not cron.matches(datetime(2025, 1, 1, 10, 10, tzinfo=UTC))

    def test_next_run(self):
        """next_run should find the next matching time."""
        cron = CronExpression.parse("0 8 * * *")  # Every day at 8:00

        after = datetime(2025, 1, 15, 7, 30, 0, tzinfo=UTC)
        next_time = cron.next_run(after)

        assert next_time is not None
        assert next_time.hour == 8
        assert next_time.minute == 0
        assert next_time.day == 15

    def test_next_run_rolls_to_next_day(self):
        """next_run should roll to next day if needed."""
        cron = CronExpression.parse("0 8 * * *")

        after = datetime(2025, 1, 15, 9, 0, 0, tzinfo=UTC)
        next_time = cron.next_run(after)

        assert next_time is not None
        assert next_time.day == 16
        assert next_time.hour == 8

    def test_is_due_never_run(self):
        """is_due should trigger if never run and time matches."""
        cron = CronExpression.parse("*/15 * * * *")

        now = datetime(2025, 1, 15, 10, 15, 0, tzinfo=UTC)
        assert cron.is_due(now, last_run=None)

    def test_is_due_respects_min_interval(self):
        """is_due should respect minimum interval."""
        cron = CronExpression.parse("* * * * *")  # Every minute

        now = datetime(2025, 1, 15, 10, 30, 0, tzinfo=UTC)
        last_run = datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC)

        # Only 30 min since last run, min_interval is 1 hour
        assert not cron.is_due(now, last_run, min_interval_hours=1)

        # With 24-hour minimum, definitely not due
        assert not cron.is_due(now, last_run, min_interval_hours=24)

    def test_is_due_after_interval(self):
        """is_due should trigger after minimum interval."""
        cron = CronExpression.parse("0 * * * *")  # Every hour on the hour

        now = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        last_run = datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC)

        assert cron.is_due(now, last_run, min_interval_hours=1)


# =============================================================================
# BudgetTracker Tests
# =============================================================================


class TestBudgetTracker:
    """Tests for BudgetTracker."""

    @pytest.fixture
    def mock_registry(self, tmp_path):
        """Create a mock registry for testing."""
        from cyntra.research.registry import Registry

        # Create minimal registry structure
        (tmp_path / "knowledge" / "research" / "programs").mkdir(parents=True)
        (tmp_path / "knowledge" / "research" / "domains").mkdir(parents=True)
        (tmp_path / ".cyntra" / "research").mkdir(parents=True)

        registry = Registry(repo_root=tmp_path)
        return registry

    @pytest.fixture
    def test_program(self):
        """Create a test program with budget limits."""
        return ResearchProgram(
            program_id="test_program",
            name="Test Program",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
            budgets=BudgetConfig(
                max_cost_per_run=0.50,
                max_cost_per_day=2.0,
                max_cost_per_week=10.0,
            ),
        )

    def test_check_budget_within_limits(self, mock_registry, test_program):
        """Budget check should pass when within limits."""
        tracker = BudgetTracker(mock_registry)
        allowed, reason = tracker.check_budget(test_program)
        assert allowed is True
        assert reason is None

    def test_check_budget_daily_exceeded(self, mock_registry, test_program):
        """Budget check should fail when daily limit exceeded."""
        tracker = BudgetTracker(mock_registry)
        now = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)

        # Record costs that exceed daily limit
        tracker.record_cost("test_program", 2.50, now)

        allowed, reason = tracker.check_budget(test_program, now)
        assert allowed is False
        assert "Daily budget exhausted" in reason

    def test_check_budget_weekly_exceeded(self, mock_registry, test_program):
        """Budget check should fail when weekly limit exceeded."""
        tracker = BudgetTracker(mock_registry)

        # Spread costs across multiple days to exceed weekly limit without exceeding daily
        # Week starts Monday. Record costs on Mon, Tue, Wed, Thu, Fri (5 days)
        for day_offset in range(5):
            day = datetime(2025, 1, 13 + day_offset, 10, 0, tzinfo=UTC)
            tracker.record_cost("test_program", 1.9, day)  # 1.9 * 5 = 9.5

        # On the 6th day (Saturday), add a bit more - still within daily but over weekly
        now = datetime(2025, 1, 18, 10, 0, tzinfo=UTC)
        tracker.record_cost("test_program", 1.0, now)  # Total: 10.5 > 10.0 weekly

        allowed, reason = tracker.check_budget(test_program, now)
        assert allowed is False
        assert "Weekly budget exhausted" in reason

    def test_check_budget_run_would_exceed(self, mock_registry, test_program):
        """Budget check should fail if run would exceed daily limit."""
        tracker = BudgetTracker(mock_registry)
        now = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)

        # Record costs close to daily limit
        tracker.record_cost("test_program", 1.80, now)

        # Run would cost 0.50, exceeding 2.0 daily limit
        allowed, reason = tracker.check_budget(test_program, now)
        assert allowed is False
        assert "exceed daily" in reason

    def test_daily_reset(self, mock_registry, test_program):
        """Daily budget should reset on new day."""
        tracker = BudgetTracker(mock_registry)

        # Record costs on day 1
        day1 = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)
        tracker.record_cost("test_program", 1.50, day1)

        # Check on day 2 - should be reset
        day2 = datetime(2025, 1, 16, 10, 0, tzinfo=UTC)
        remaining = tracker.get_remaining_budget(test_program, day2)

        assert remaining["daily_remaining"] == 2.0  # Full daily budget

    def test_weekly_reset(self, mock_registry, test_program):
        """Weekly budget should reset on new week."""
        tracker = BudgetTracker(mock_registry)

        # Record costs in week 1 (Wednesday)
        week1 = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)  # Wednesday
        tracker.record_cost("test_program", 8.0, week1)

        # Check in week 2 (next Monday)
        week2 = datetime(2025, 1, 20, 10, 0, tzinfo=UTC)  # Monday
        remaining = tracker.get_remaining_budget(test_program, week2)

        assert remaining["weekly_remaining"] == 10.0  # Full weekly budget

    def test_get_remaining_budget(self, mock_registry, test_program):
        """get_remaining_budget should return correct values."""
        tracker = BudgetTracker(mock_registry)
        now = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)

        tracker.record_cost("test_program", 0.75, now)
        remaining = tracker.get_remaining_budget(test_program, now)

        assert remaining["daily_remaining"] == pytest.approx(1.25)
        assert remaining["weekly_remaining"] == pytest.approx(9.25)
        assert remaining["per_run_limit"] == 0.50


# =============================================================================
# PriorityRanker Tests
# =============================================================================


class TestPriorityRanker:
    """Tests for PriorityRanker."""

    @pytest.fixture
    def mock_registry(self, tmp_path):
        """Create a mock registry for testing."""
        from cyntra.research.registry import Registry

        (tmp_path / "knowledge" / "research" / "programs").mkdir(parents=True)
        (tmp_path / "knowledge" / "research" / "domains").mkdir(parents=True)
        (tmp_path / ".cyntra" / "research").mkdir(parents=True)

        registry = Registry(repo_root=tmp_path)
        return registry

    def test_never_run_gets_bonus(self, mock_registry):
        """Programs that never ran should get priority bonus."""
        ranker = PriorityRanker(mock_registry)

        program = ResearchProgram(
            program_id="new_program",
            name="New",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        ranked = ranker.rank_programs([program])
        assert len(ranked) == 1
        assert "never_run: +25" in ranked[0].reasons

    def test_staleness_bonus(self, mock_registry):
        """Programs not run recently should get staleness bonus."""
        ranker = PriorityRanker(mock_registry)
        now = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)

        program = ResearchProgram(
            program_id="stale_program",
            name="Stale",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        # Set last run to 48 hours ago
        state = mock_registry.schedule_state.get_program_state("stale_program")
        state.last_run_at = now - timedelta(hours=48)

        ranked = ranker.rank_programs([program], now)
        assert len(ranked) == 1
        # Should have staleness bonus (48 hours = 2 days = 2 points, but capped calculation)
        assert any("staleness" in r for r in ranked[0].reasons)

    def test_failure_penalty(self, mock_registry):
        """Programs with consecutive failures should get penalty."""
        ranker = PriorityRanker(mock_registry)
        now = datetime(2025, 1, 15, 10, 0, tzinfo=UTC)

        program = ResearchProgram(
            program_id="failing_program",
            name="Failing",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        state = mock_registry.schedule_state.get_program_state("failing_program")
        state.consecutive_failures = 3
        state.last_run_at = now - timedelta(hours=1)

        ranked = ranker.rank_programs([program], now)
        assert any("failures(3)" in r for r in ranked[0].reasons)

    def test_radar_vs_deep_dive(self, mock_registry):
        """Radar type should have higher priority than deep_dive."""
        ranker = PriorityRanker(mock_registry)

        radar_program = ResearchProgram(
            program_id="radar_prog",
            name="Radar",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
            output=OutputConfig(type=OutputType.RADAR),
        )

        deep_dive_program = ResearchProgram(
            program_id="deep_dive_prog",
            name="Deep Dive",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
            output=OutputConfig(type=OutputType.DEEP_DIVE),
        )

        ranked = ranker.rank_programs([deep_dive_program, radar_program])

        # Radar should be first (higher priority)
        assert ranked[0].program.program_id == "radar_prog"
        assert ranked[1].program.program_id == "deep_dive_prog"

    def test_resolve_dependencies_simple(self, mock_registry):
        """Simple dependency chain should resolve correctly."""
        ranker = PriorityRanker(mock_registry)

        program_a = ResearchProgram(
            program_id="prog_a",
            name="A",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        program_b = ResearchProgram(
            program_id="prog_b",
            name="B",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
            dependencies={"requires": ["prog_a"]},
        )

        # B depends on A, so A should come first
        resolved = ranker.resolve_dependencies([program_b, program_a])
        ids = [p.program_id for p in resolved]

        assert ids.index("prog_a") < ids.index("prog_b")

    def test_resolve_dependencies_multiple(self, mock_registry):
        """Multiple dependencies should all be resolved."""
        ranker = PriorityRanker(mock_registry)

        program_a = ResearchProgram(
            program_id="prog_a",
            name="A",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        program_b = ResearchProgram(
            program_id="prog_b",
            name="B",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        program_c = ResearchProgram(
            program_id="prog_c",
            name="C",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
            dependencies={"requires": ["prog_a", "prog_b"]},
        )

        resolved = ranker.resolve_dependencies([program_c, program_b, program_a])
        ids = [p.program_id for p in resolved]

        assert ids.index("prog_a") < ids.index("prog_c")
        assert ids.index("prog_b") < ids.index("prog_c")


# =============================================================================
# Scheduler Tests
# =============================================================================


class TestScheduler:
    """Tests for main Scheduler class."""

    @pytest.fixture
    def test_registry(self, tmp_path):
        """Create a test registry with a program."""
        from cyntra.research.registry import Registry

        programs_dir = tmp_path / "knowledge" / "research" / "programs"
        domains_dir = tmp_path / "knowledge" / "research" / "domains"
        state_dir = tmp_path / ".cyntra" / "research"

        programs_dir.mkdir(parents=True)
        domains_dir.mkdir(parents=True)
        state_dir.mkdir(parents=True)

        # Write a test program YAML file
        (programs_dir / "test_program.yaml").write_text(
            """
program_id: test_program
name: Test Program
description: Test
owner: "@test"
scope: test
schedule:
  cadence: "0 8 * * *"
  min_interval_hours: 1
budgets:
  max_cost_per_run: 0.50
  max_cost_per_day: 2.0
  max_cost_per_week: 10.0
"""
        )

        registry = Registry.load(tmp_path)
        return registry

    def test_is_due_disabled_program(self, test_registry):
        """Disabled programs should not be due."""
        scheduler = Scheduler(test_registry)

        # Disable the program
        program = test_registry.get_program("test_program")
        program.schedule.enabled = False

        decision = scheduler.is_due(program)
        assert decision.should_run is False
        assert "disabled" in decision.reason.lower()

    def test_is_due_not_scheduled(self, test_registry):
        """Programs not at scheduled time should not be due."""
        scheduler = Scheduler(test_registry)
        program = test_registry.get_program("test_program")

        # Check at 7:00 (scheduled for 8:00)
        now = datetime(2025, 1, 15, 7, 0, 0, tzinfo=UTC)
        decision = scheduler.is_due(program, now)

        assert decision.should_run is False
        assert decision.next_run_at is not None
        assert decision.next_run_at.hour == 8

    def test_is_due_scheduled_time(self, test_registry):
        """Programs at scheduled time should be due."""
        scheduler = Scheduler(test_registry)
        program = test_registry.get_program("test_program")

        # Check at 8:00 (scheduled for 8:00, never run before)
        now = datetime(2025, 1, 15, 8, 0, 0, tzinfo=UTC)
        decision = scheduler.is_due(program, now)

        assert decision.should_run is True
        assert "within budget" in decision.reason.lower()

    def test_is_due_budget_exceeded(self, test_registry):
        """Programs over budget should not be due."""
        scheduler = Scheduler(test_registry)
        program = test_registry.get_program("test_program")

        now = datetime(2025, 1, 15, 8, 0, 0, tzinfo=UTC)

        # Exhaust daily budget
        scheduler.budget_tracker.record_cost("test_program", 2.50, now)

        decision = scheduler.is_due(program, now)
        assert decision.should_run is False
        assert "budget" in decision.reason.lower()

    def test_is_due_failure_backoff(self, test_registry):
        """Programs with repeated failures should be backed off."""
        scheduler = Scheduler(test_registry)
        program = test_registry.get_program("test_program")

        # The schedule is "0 8 * * *" with min_interval_hours=1
        # With 5 consecutive failures:
        # - Backoff kicks in at >= 3 failures
        # - Backoff hours = 2^(5-3) = 4 hours
        # - So backoff_until = last_run + 4 hours

        # Last run was at 7:00 today (1 hour ago) - schedule would fire at 8:00
        # Now is 8:00 - exactly at scheduled time, satisfies min_interval (1 hour)
        # But backoff_until = 7:00 + 4 hours = 11:00, so 8:00 < 11:00 = backoff
        now = datetime(2025, 1, 16, 8, 0, 0, tzinfo=UTC)

        state = test_registry.schedule_state.get_program_state("test_program")
        state.consecutive_failures = 5
        state.last_run_at = datetime(2025, 1, 16, 7, 0, 0, tzinfo=UTC)

        decision = scheduler.is_due(program, now)
        assert decision.should_run is False
        assert "backoff" in decision.reason.lower()

    def test_get_due_programs_returns_ranked(self, test_registry):
        """get_due_programs should return ranked list."""
        scheduler = Scheduler(test_registry)

        # Add a second program via internal dict
        program2 = ResearchProgram(
            program_id="test_program_2",
            name="Test Program 2",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 8 * * *", min_interval_hours=1),
            output=OutputConfig(type=OutputType.RADAR),
        )
        test_registry._programs["test_program_2"] = program2

        now = datetime(2025, 1, 15, 8, 0, 0, tzinfo=UTC)
        due = scheduler.get_due_programs(now)

        assert len(due) == 2
        assert all(isinstance(p, RankedProgram) for p in due)
        # Should be ordered by priority
        assert due[0].priority_score >= due[1].priority_score

    def test_get_schedule_summary(self, test_registry):
        """get_schedule_summary should return complete info."""
        scheduler = Scheduler(test_registry)
        now = datetime(2025, 1, 15, 10, 0, 0, tzinfo=UTC)

        summaries = scheduler.get_schedule_summary(now)

        assert len(summaries) == 1
        summary = summaries[0]

        assert summary["program_id"] == "test_program"
        assert summary["name"] == "Test Program"
        assert summary["enabled"] is True
        assert summary["cadence"] == "0 8 * * *"
        assert "next_run_at" in summary
        assert "budget_daily_remaining" in summary
        assert "budget_weekly_remaining" in summary

    def test_get_next_run_times(self, test_registry):
        """get_next_run_times should return times for all programs."""
        scheduler = Scheduler(test_registry)
        now = datetime(2025, 1, 15, 7, 0, 0, tzinfo=UTC)

        next_runs = scheduler.get_next_run_times(now)

        assert len(next_runs) == 1
        program_id, next_time = next_runs[0]

        assert program_id == "test_program"
        assert next_time is not None
        assert next_time.hour == 8

    def test_get_next_run_times_disabled(self, test_registry):
        """Disabled programs should have None next run time."""
        scheduler = Scheduler(test_registry)
        program = test_registry.get_program("test_program")
        program.schedule.enabled = False

        next_runs = scheduler.get_next_run_times()

        assert len(next_runs) == 1
        _, next_time = next_runs[0]
        assert next_time is None


# =============================================================================
# Helper Function Tests
# =============================================================================


class TestHelperFunctions:
    """Tests for module-level helper functions."""

    def test_parse_cron(self):
        """parse_cron should return CronExpression."""
        cron = parse_cron("0 8 * * 1")
        assert isinstance(cron, CronExpression)
        assert 8 in cron.hour.values
        assert 1 in cron.day_of_week.values

    def test_next_cron_time(self):
        """next_cron_time should return next matching time."""
        after = datetime(2025, 1, 15, 7, 30, 0, tzinfo=UTC)
        next_time = next_cron_time("0 8 * * *", after)

        assert next_time is not None
        assert next_time.hour == 8
        assert next_time.minute == 0
        assert next_time.day == 15

    def test_is_cron_due_true(self):
        """is_cron_due should return True when due."""
        now = datetime(2025, 1, 15, 8, 0, 0, tzinfo=UTC)
        assert is_cron_due("0 8 * * *", now, last_run=None)

    def test_is_cron_due_false(self):
        """is_cron_due should return False when not due."""
        now = datetime(2025, 1, 15, 7, 30, 0, tzinfo=UTC)
        assert not is_cron_due("0 8 * * *", now, last_run=None)

    def test_is_cron_due_with_interval(self):
        """is_cron_due should respect min_interval_hours."""
        now = datetime(2025, 1, 15, 9, 0, 0, tzinfo=UTC)
        last_run = datetime(2025, 1, 15, 8, 0, 0, tzinfo=UTC)

        # Only 1 hour since last run, min interval is 24 hours
        assert not is_cron_due("0 * * * *", now, last_run, min_interval_hours=24)
