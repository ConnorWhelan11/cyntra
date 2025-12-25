"""Tests for importance scoring module."""

import pytest
from datetime import datetime
from uuid import uuid4

from cyntra.memory.scoring import (
    ScoringConstants,
    calculate_importance,
    estimate_decay_time,
)
from cyntra.memory.models import AgentMemory, MemoryType, MemoryScope


class TestScoringConstants:
    """Tests for ScoringConstants configuration."""

    def test_default_constants(self):
        """Test default constant values."""
        constants = ScoringConstants()

        assert constants.value_weight == 0.35
        assert constants.hub_weight == 0.25
        assert constants.mention_weight == 0.20
        assert constants.recency_weight == 0.20
        assert constants.decay_rate == 0.03
        assert constants.newness_bonus == 0.20
        assert constants.newness_runs == 5

    def test_weights_sum_to_one(self):
        """Test that weights sum to 1.0."""
        constants = ScoringConstants()
        total = (
            constants.value_weight
            + constants.hub_weight
            + constants.mention_weight
            + constants.recency_weight
        )
        assert abs(total - 1.0) < 0.01


class TestCalculateImportance:
    """Tests for calculate_importance function."""

    def test_high_value_memory(self):
        """Test scoring for high-value memory."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Critical pattern for API calls",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.0,  # Will be calculated
            confidence=0.95,
            access_count=10,
            mention_count=5,
            runs_at_creation=1,
            runs_at_last_access=10,
            created_at=datetime.utcnow(),
        )

        # Current runs count
        current_runs = 12

        score = calculate_importance(
            memory=memory,
            current_runs=current_runs,
            inbound_links=5,
            outbound_links=3,
        )

        # Should have high score due to high access and mentions
        assert score > 0.3

    def test_new_memory_bonus(self):
        """Test that new memories get a bonus."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="New pattern",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.0,
            confidence=0.8,
            access_count=1,
            mention_count=0,
            runs_at_creation=10,
            runs_at_last_access=10,
            created_at=datetime.utcnow(),
        )

        # Memory created 2 runs ago (within newness window)
        score_new = calculate_importance(memory, current_runs=12)

        # Simulate older memory
        memory_old = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Old pattern",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.0,
            confidence=0.8,
            access_count=1,
            mention_count=0,
            runs_at_creation=1,
            runs_at_last_access=1,
            created_at=datetime.utcnow(),
        )

        score_old = calculate_importance(memory_old, current_runs=12)

        # New memory should score higher due to newness bonus
        assert score_new > score_old

    def test_decay_over_runs(self):
        """Test that importance decays with runs since access."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Pattern that decays",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.0,
            confidence=0.8,
            access_count=5,
            mention_count=2,
            runs_at_creation=1,
            runs_at_last_access=50,  # Last accessed 50 runs ago
            created_at=datetime.utcnow(),
        )

        # Score at current runs = 60 (10 runs since access)
        score_recent = calculate_importance(memory, current_runs=60)

        # Score at current runs = 150 (100 runs since access)
        score_old = calculate_importance(memory, current_runs=150)

        # More recent access should have higher score
        assert score_recent > score_old

    def test_hub_score_contribution(self):
        """Test that links contribute to hub score."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Hub memory with links",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.0,
            confidence=0.8,
            access_count=2,
            mention_count=1,
            runs_at_creation=1,
            runs_at_last_access=10,
            created_at=datetime.utcnow(),
        )

        # Score with no links
        score_no_links = calculate_importance(
            memory, current_runs=12, inbound_links=0, outbound_links=0
        )

        # Score with links
        score_with_links = calculate_importance(
            memory, current_runs=12, inbound_links=5, outbound_links=5
        )

        assert score_with_links > score_no_links

    def test_score_bounded(self):
        """Test that scores are bounded between 0 and 1."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test memory",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.0,
            confidence=0.99,
            access_count=1000,
            mention_count=500,
            runs_at_creation=1,
            runs_at_last_access=10,
            created_at=datetime.utcnow(),
        )

        score = calculate_importance(
            memory, current_runs=12, inbound_links=100, outbound_links=100
        )

        assert 0.0 <= score <= 1.0


class TestEstimateDecayTime:
    """Tests for estimate_decay_time function."""

    def test_decay_time_estimation(self):
        """Test decay time estimation."""
        # High importance memory should take longer to decay
        high_importance = estimate_decay_time(
            current_importance=0.8,
            target_importance=0.1,
        )

        low_importance = estimate_decay_time(
            current_importance=0.3,
            target_importance=0.1,
        )

        assert high_importance > low_importance

    def test_decay_already_below_target(self):
        """Test when already below target."""
        runs = estimate_decay_time(
            current_importance=0.05,
            target_importance=0.1,
        )

        assert runs == 0
