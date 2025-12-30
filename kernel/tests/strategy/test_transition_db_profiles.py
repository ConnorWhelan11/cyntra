"""Integration tests for strategy profile storage in TransitionDB."""

import tempfile
from pathlib import Path

import pytest

from cyntra.dynamics.transition_db import TransitionDB
from cyntra.strategy.profile import DimensionValue, StrategyProfile


class TestTransitionDBProfiles:
    """Tests for strategy profile storage in TransitionDB."""

    @pytest.fixture
    def db(self):
        """Create a temporary database for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = TransitionDB(db_path)
            yield db
            db.close()

    @pytest.fixture
    def sample_profile(self):
        """Create a sample strategy profile."""
        return StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions={
                "analytical_perspective": DimensionValue(
                    value="top_down", confidence=0.85, evidence="Started with overview"
                ),
                "scope_approach": DimensionValue(value="local", confidence=0.7),
                "reasoning_type": DimensionValue(value="deductive", confidence=0.9),
            },
            workcell_id="wc-001",
            issue_id="issue-123",
            model="claude-opus",
            toolchain="claude",
            extraction_method="self_report",
        )

    def test_insert_profile(self, db, sample_profile):
        """Test inserting a profile."""
        profile_id = db.insert_profile(sample_profile, rollout_id="run-001", outcome="passed")
        assert profile_id is not None
        assert len(profile_id) == 36  # UUID format

    def test_insert_and_retrieve_profile(self, db, sample_profile):
        """Test inserting and retrieving a profile."""
        profile_id = db.insert_profile(sample_profile, rollout_id="run-001", outcome="passed")

        record = db.get_profile_by_id(profile_id)
        assert record is not None
        assert record["profile_id"] == profile_id
        assert record["workcell_id"] == "wc-001"
        assert record["issue_id"] == "issue-123"
        assert record["toolchain"] == "claude"
        assert record["outcome"] == "passed"
        assert record["rubric_version"] == "cyntra-v1"
        assert record["extraction_method"] == "self_report"

    def test_get_profiles_by_workcell(self, db, sample_profile):
        """Test querying profiles by workcell_id."""
        db.insert_profile(sample_profile, outcome="passed")

        profiles = db.get_profiles(workcell_id="wc-001")
        assert len(profiles) == 1
        assert profiles[0]["workcell_id"] == "wc-001"

    def test_get_profiles_by_issue(self, db, sample_profile):
        """Test querying profiles by issue_id."""
        db.insert_profile(sample_profile, outcome="passed")

        profiles = db.get_profiles(issue_id="issue-123")
        assert len(profiles) == 1
        assert profiles[0]["issue_id"] == "issue-123"

    def test_get_profiles_by_toolchain(self, db, sample_profile):
        """Test querying profiles by toolchain."""
        db.insert_profile(sample_profile, outcome="passed")

        profiles = db.get_profiles(toolchain="claude")
        assert len(profiles) == 1
        assert profiles[0]["toolchain"] == "claude"

    def test_get_profiles_by_outcome(self, db, sample_profile):
        """Test querying profiles by outcome."""
        db.insert_profile(sample_profile, outcome="passed")

        passed = db.get_profiles(outcome="passed")
        assert len(passed) == 1

        failed = db.get_profiles(outcome="failed")
        assert len(failed) == 0

    def test_get_profiles_with_limit(self, db):
        """Test limiting profile results."""
        # Insert multiple profiles
        for i in range(5):
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value="top_down")},
                workcell_id=f"wc-{i:03d}",
            )
            db.insert_profile(profile)

        profiles = db.get_profiles(limit=3)
        assert len(profiles) == 3

    def test_get_profiles_ordered_by_time(self, db):
        """Test that profiles are ordered by extracted_at DESC."""
        for i in range(3):
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value="top_down")},
                workcell_id=f"wc-{i:03d}",
            )
            db.insert_profile(profile)

        profiles = db.get_profiles()
        assert len(profiles) == 3
        # Most recent should be first
        assert profiles[0]["workcell_id"] == "wc-002"

    def test_profile_count(self, db, sample_profile):
        """Test counting profiles."""
        assert db.profile_count() == 0

        db.insert_profile(sample_profile, outcome="passed")
        assert db.profile_count() == 1

        db.insert_profile(sample_profile, outcome="failed")
        assert db.profile_count() == 2

        assert db.profile_count(outcome="passed") == 1
        assert db.profile_count(outcome="failed") == 1
        assert db.profile_count(toolchain="claude") == 2

    def test_dimension_values_stored(self, db, sample_profile):
        """Test that dimension values are stored in normalized table."""
        db.insert_profile(sample_profile, outcome="passed")

        # Check dimension distribution
        dist = db.get_dimension_distribution("analytical_perspective")
        assert dist == {"top_down": 1}

        dist = db.get_dimension_distribution("scope_approach")
        assert dist == {"local": 1}

    def test_get_dimension_distribution_multiple_profiles(self, db):
        """Test dimension distribution with multiple profiles."""
        # Insert profiles with different patterns
        for pattern in ["top_down", "top_down", "bottom_up"]:
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value=pattern)},
            )
            db.insert_profile(profile, outcome="passed")

        dist = db.get_dimension_distribution("analytical_perspective")
        assert dist == {"top_down": 2, "bottom_up": 1}

    def test_get_dimension_distribution_by_outcome(self, db):
        """Test dimension distribution filtered by outcome."""
        # Insert passed profiles
        for _ in range(3):
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value="top_down")},
            )
            db.insert_profile(profile, outcome="passed")

        # Insert failed profile
        profile = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions={"analytical_perspective": DimensionValue(value="bottom_up")},
        )
        db.insert_profile(profile, outcome="failed")

        passed_dist = db.get_dimension_distribution("analytical_perspective", outcome="passed")
        assert passed_dist == {"top_down": 3}

        failed_dist = db.get_dimension_distribution("analytical_perspective", outcome="failed")
        assert failed_dist == {"bottom_up": 1}

    def test_get_optimal_strategy_for(self, db):
        """Test computing optimal strategy from successful runs."""
        # Insert successful profiles with varying patterns
        patterns = [
            {"analytical_perspective": "top_down", "scope_approach": "local"},
            {"analytical_perspective": "top_down", "scope_approach": "local"},
            {"analytical_perspective": "bottom_up", "scope_approach": "local"},
        ]
        for p in patterns:
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={
                    k: DimensionValue(value=v, confidence=0.8)
                    for k, v in p.items()
                },
            )
            db.insert_profile(profile, outcome="passed")

        optimal = db.get_optimal_strategy_for(outcome="passed")
        assert optimal["analytical_perspective"] == "top_down"  # 2 vs 1
        assert optimal["scope_approach"] == "local"  # 3 vs 0

    def test_get_optimal_strategy_by_toolchain(self, db):
        """Test optimal strategy filtered by toolchain."""
        # Claude profiles prefer top_down
        for _ in range(3):
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value="top_down", confidence=0.8)},
                toolchain="claude",
            )
            db.insert_profile(profile, outcome="passed")

        # Codex profiles prefer bottom_up
        for _ in range(2):
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value="bottom_up", confidence=0.8)},
                toolchain="codex",
            )
            db.insert_profile(profile, outcome="passed")

        claude_optimal = db.get_optimal_strategy_for(toolchain="claude")
        assert claude_optimal["analytical_perspective"] == "top_down"

        codex_optimal = db.get_optimal_strategy_for(toolchain="codex")
        assert codex_optimal["analytical_perspective"] == "bottom_up"

    def test_get_optimal_strategy_respects_confidence(self, db):
        """Test that optimal strategy respects confidence threshold."""
        # Low confidence profile
        low_conf = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions={"analytical_perspective": DimensionValue(value="bottom_up", confidence=0.3)},
        )
        db.insert_profile(low_conf, outcome="passed")

        # High confidence profile
        high_conf = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions={"analytical_perspective": DimensionValue(value="top_down", confidence=0.9)},
        )
        db.insert_profile(high_conf, outcome="passed")

        # With min_confidence=0.5, only high_conf should count
        optimal = db.get_optimal_strategy_for(min_confidence=0.5)
        assert optimal["analytical_perspective"] == "top_down"

    def test_profile_json_contains_full_data(self, db, sample_profile):
        """Test that profile_json contains all profile data."""
        profile_id = db.insert_profile(sample_profile, outcome="passed")
        record = db.get_profile_by_id(profile_id)

        profile_data = record["profile"]
        assert profile_data["rubric_version"] == "cyntra-v1"
        assert "profile" in profile_data
        assert "analytical_perspective" in profile_data["profile"]
        assert profile_data["profile"]["analytical_perspective"]["value"] == "top_down"

    def test_get_nonexistent_profile(self, db):
        """Test querying a non-existent profile."""
        record = db.get_profile_by_id("nonexistent-id")
        assert record is None

    def test_empty_profiles_query(self, db):
        """Test querying when no profiles exist."""
        profiles = db.get_profiles()
        assert profiles == []

        profiles = db.get_profiles(workcell_id="nonexistent")
        assert profiles == []

    def test_empty_dimension_distribution(self, db):
        """Test dimension distribution with no profiles."""
        dist = db.get_dimension_distribution("analytical_perspective")
        assert dist == {}

    def test_empty_optimal_strategy(self, db):
        """Test optimal strategy with no profiles."""
        optimal = db.get_optimal_strategy_for()
        assert optimal == {}

    def test_multiple_inserts_same_profile(self, db, sample_profile):
        """Test inserting the same profile multiple times creates multiple records."""
        id1 = db.insert_profile(sample_profile)
        id2 = db.insert_profile(sample_profile)
        assert id1 != id2
        assert db.profile_count() == 2

    def test_combined_filters(self, db):
        """Test combining multiple filters."""
        # Insert varied profiles
        profiles_data = [
            ("wc-001", "claude", "passed"),
            ("wc-001", "claude", "failed"),
            ("wc-002", "codex", "passed"),
        ]
        for wc, tc, outcome in profiles_data:
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions={"analytical_perspective": DimensionValue(value="top_down")},
                workcell_id=wc,
                toolchain=tc,
            )
            db.insert_profile(profile, outcome=outcome)

        # Combined filter
        results = db.get_profiles(workcell_id="wc-001", toolchain="claude", outcome="passed")
        assert len(results) == 1
        assert results[0]["workcell_id"] == "wc-001"
        assert results[0]["toolchain"] == "claude"
        assert results[0]["outcome"] == "passed"
