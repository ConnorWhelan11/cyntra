"""
Memory Importance Scoring - Run-based decay calculation.

Adapted from Mira OS's scoring formula with run-based decay instead of
calendar-based activity days.

The core philosophy: memories must earn their keep through demonstrated relevance.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from .models import AgentMemory


@dataclass
class ScoringConstants:
    """Tunable constants for importance scoring."""

    # Access rate baseline (1 access per 50 runs is "average")
    BASELINE_ACCESS_RATE: float = 0.02

    # Momentum decay rate (5% fade per run since last access)
    MOMENTUM_DECAY_RATE: float = 0.95

    # Minimum age in runs (prevents spikes for new memories)
    MIN_AGE_RUNS: int = 7

    # Sigmoid center (maps average memories to ~0.5 importance)
    SIGMOID_CENTER: float = 2.0

    # Newness boost decay (15 runs grace period)
    NEWNESS_BOOST_DECAY_RUNS: int = 15

    # Recency decay rate (half-life of ~67 runs)
    RECENCY_DECAY_RATE: float = 0.015

    # Hub score thresholds
    HUB_LINEAR_THRESHOLD: int = 10
    HUB_LINEAR_RATE: float = 0.04
    HUB_DIMINISHING_RATE: float = 0.02
    HUB_DIMINISHING_FACTOR: float = 0.05

    # Mention score thresholds
    MENTION_LINEAR_THRESHOLD: int = 5
    MENTION_LINEAR_RATE: float = 0.08
    MENTION_LOG_RATE: float = 0.1

    # Temporal decay (calendar-based for real deadlines)
    TEMPORAL_DECAY_DAYS: int = 45
    TEMPORAL_FLOOR: float = 0.4

    # Expiration trailoff (5-day grace period after expires_at)
    EXPIRATION_TRAILOFF_DAYS: int = 5

    # Archival threshold
    ARCHIVAL_THRESHOLD: float = 0.001


# Default constants
DEFAULT_CONSTANTS = ScoringConstants()


def calculate_importance(
    memory: AgentMemory,
    current_runs: int,
    constants: ScoringConstants = DEFAULT_CONSTANTS,
) -> float:
    """
    Calculate memory importance score using run-based decay.

    Formula adapted from Mira OS:
    1. Value Score = access momentum with decay
    2. Hub Score = inbound links with diminishing returns
    3. Mention Score = explicit LLM references
    4. Newness Boost = grace period for new memories
    5. Recency Boost = gentle transition to cold storage
    6. Temporal Multiplier = happens_at proximity boost
    7. Expiration Multiplier = trailoff after expires_at
    8. Sigmoid Transform = normalize to 0-1 range

    Args:
        memory: AgentMemory to score
        current_runs: Current run count for the agent
        constants: Scoring constants (use defaults if not provided)

    Returns:
        Importance score between 0.0 and 1.0
    """
    c = constants

    # Hard zero if expired more than 5 days ago
    if memory.expires_at:
        days_past_expiry = (datetime.utcnow() - memory.expires_at).total_seconds() / 86400
        if days_past_expiry > c.EXPIRATION_TRAILOFF_DAYS:
            return 0.0

    # Calculate run deltas
    runs_at_creation = memory.runs_at_creation or 0
    runs_at_last_access = memory.runs_at_last_access or runs_at_creation
    runs_since_creation = max(0, current_runs - runs_at_creation)
    runs_since_access = max(0, current_runs - runs_at_last_access)

    # VALUE SCORE: access rate with momentum decay
    effective_access = memory.access_count * (c.MOMENTUM_DECAY_RATE ** runs_since_access)
    access_rate = effective_access / max(c.MIN_AGE_RUNS, runs_since_creation)
    value_score = math.log(1 + access_rate / c.BASELINE_ACCESS_RATE) * 0.8

    # HUB SCORE: diminishing returns after threshold
    inbound_count = len(memory.inbound_links)
    if inbound_count == 0:
        hub_score = 0.0
    elif inbound_count <= c.HUB_LINEAR_THRESHOLD:
        hub_score = inbound_count * c.HUB_LINEAR_RATE
    else:
        excess = inbound_count - c.HUB_LINEAR_THRESHOLD
        hub_score = (c.HUB_LINEAR_THRESHOLD * c.HUB_LINEAR_RATE) + \
                    (excess * c.HUB_DIMINISHING_RATE) / (1 + excess * c.HUB_DIMINISHING_FACTOR)

    # MENTION SCORE: explicit LLM references (strongest signal)
    mention_count = memory.mention_count
    if mention_count == 0:
        mention_score = 0.0
    elif mention_count <= c.MENTION_LINEAR_THRESHOLD:
        mention_score = mention_count * c.MENTION_LINEAR_RATE
    else:
        excess = mention_count - c.MENTION_LINEAR_THRESHOLD
        mention_score = (c.MENTION_LINEAR_THRESHOLD * c.MENTION_LINEAR_RATE) + \
                        math.log(1 + excess) * c.MENTION_LOG_RATE

    # NEWNESS BOOST: grace period for new memories
    newness_boost = max(0.0, 2.0 - (runs_since_creation * (2.0 / c.NEWNESS_BOOST_DECAY_RUNS)))

    # RAW SCORE
    raw_score = value_score + hub_score + mention_score + newness_boost

    # RECENCY BOOST: gentle transition to cold storage
    recency_boost = 1.0 / (1.0 + runs_since_access * c.RECENCY_DECAY_RATE)

    # TEMPORAL MULTIPLIER: happens_at proximity boost (calendar-based)
    temporal_multiplier = _calculate_temporal_multiplier(memory.happens_at, c)

    # EXPIRATION MULTIPLIER: trailoff after expires_at
    expiration_multiplier = _calculate_expiration_multiplier(memory.expires_at, c)

    # SIGMOID TRANSFORM
    combined = raw_score * recency_boost * temporal_multiplier * expiration_multiplier
    final_score = 1.0 / (1.0 + math.exp(-(combined - c.SIGMOID_CENTER)))

    return round(final_score, 3)


def _calculate_temporal_multiplier(
    happens_at: Optional[datetime],
    constants: ScoringConstants,
) -> float:
    """Calculate temporal multiplier for happens_at events."""
    if not happens_at:
        return 1.0

    now = datetime.utcnow()
    delta_seconds = (happens_at - now).total_seconds()
    delta_days = delta_seconds / 86400

    if delta_days < 0:
        # Event has passed
        days_past = abs(delta_days)
        if days_past <= constants.TEMPORAL_DECAY_DAYS:
            # Gradual decay from 0.8 to 0.4
            decay_progress = days_past / constants.TEMPORAL_DECAY_DAYS
            return constants.TEMPORAL_FLOOR * (1.0 - decay_progress) + constants.TEMPORAL_FLOOR
        else:
            return constants.TEMPORAL_FLOOR
    else:
        # Event upcoming
        if delta_days <= 1:
            return 2.0
        elif delta_days <= 7:
            return 1.5
        elif delta_days <= 14:
            return 1.2
        else:
            return 1.0


def _calculate_expiration_multiplier(
    expires_at: Optional[datetime],
    constants: ScoringConstants,
) -> float:
    """Calculate expiration multiplier (5-day trailoff after expires_at)."""
    if not expires_at:
        return 1.0

    now = datetime.utcnow()
    if expires_at >= now:
        return 1.0

    days_past = (now - expires_at).total_seconds() / 86400
    if days_past <= constants.EXPIRATION_TRAILOFF_DAYS:
        return max(0.0, 1.0 - (days_past / constants.EXPIRATION_TRAILOFF_DAYS))
    return 0.0


async def recalculate_all_scores(
    store,  # MemoryStore
    agent_id: str,
    constants: ScoringConstants = DEFAULT_CONSTANTS,
) -> int:
    """
    Bulk score recalculation for sleeptime.

    Args:
        store: MemoryStore instance
        agent_id: Agent identifier
        constants: Scoring constants

    Returns:
        Number of memories updated
    """
    # Use SQL function for efficiency
    return await store.recalculate_scores(agent_id)


async def get_archival_candidates(
    store,  # MemoryStore
    agent_id: str,
    threshold: float = DEFAULT_CONSTANTS.ARCHIVAL_THRESHOLD,
    limit: int = 100,
) -> List[UUID]:
    """
    Find memories below archival threshold.

    Args:
        store: MemoryStore instance
        agent_id: Agent identifier
        threshold: Importance threshold (default 0.001)
        limit: Maximum candidates

    Returns:
        List of memory IDs for archival
    """
    return await store.get_archival_candidates(agent_id, threshold, limit)


def estimate_decay_time(
    memory: AgentMemory,
    current_runs: int,
    target_score: float = 0.1,
    constants: ScoringConstants = DEFAULT_CONSTANTS,
) -> int:
    """
    Estimate runs until memory reaches target score.

    Useful for predicting when memories will fade.

    Args:
        memory: AgentMemory to analyze
        current_runs: Current run count
        target_score: Target importance score
        constants: Scoring constants

    Returns:
        Estimated runs until target score reached (-1 if already below)
    """
    current_score = calculate_importance(memory, current_runs, constants)
    if current_score <= target_score:
        return -1

    # Binary search for run count
    low, high = 0, 500
    while low < high:
        mid = (low + high) // 2
        future_runs = current_runs + mid

        # Temporarily modify runs_at_creation to keep runs_since_access constant
        test_memory = AgentMemory(
            id=memory.id,
            agent_id=memory.agent_id,
            text=memory.text,
            memory_type=memory.memory_type,
            access_count=memory.access_count,
            mention_count=memory.mention_count,
            inbound_links=memory.inbound_links,
            outbound_links=memory.outbound_links,
            runs_at_creation=memory.runs_at_creation,
            runs_at_last_access=memory.runs_at_last_access,
            confidence=memory.confidence,
            created_at=memory.created_at,
            happens_at=memory.happens_at,
            expires_at=memory.expires_at,
        )

        future_score = calculate_importance(test_memory, future_runs, constants)
        if future_score <= target_score:
            high = mid
        else:
            low = mid + 1

    return low
