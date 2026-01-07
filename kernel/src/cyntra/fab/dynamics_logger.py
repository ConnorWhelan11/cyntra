"""
Fab Dynamics Logger - Log state transitions for detailed balance analysis.

Based on: "Detailed balance in LLM-driven agents" (arXiv:2512.10047)

This module provides utilities for logging fab asset state transitions
to enable potential function estimation and trap detection.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .config import DynamicsConfig, GateConfig
    from .gate import GateResult
    from .state import FabAssetState

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _generate_transition_id(
    rollout_id: str,
    from_state_id: str,
    to_state_id: str,
    timestamp: str,
    index: int = 0,
) -> str:
    """Generate deterministic transition ID."""
    seed = json.dumps(
        {
            "rollout_id": rollout_id,
            "from": from_state_id,
            "to": to_state_id,
            "timestamp": timestamp,
            "index": index,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return f"tr_{hashlib.sha256(seed.encode('utf-8')).hexdigest()}"


class FabDynamicsLogger:
    """
    Logger for fab asset state transitions.

    Tracks state changes during asset generation/repair cycles
    and logs them to the dynamics database for analysis.
    """

    def __init__(
        self,
        config: DynamicsConfig,
        workcell_id: str | None = None,
        issue_id: str | None = None,
        rollout_id: str | None = None,
    ):
        """
        Initialize dynamics logger.

        Args:
            config: Dynamics configuration
            workcell_id: Workcell ID for context
            issue_id: Issue ID for context
            rollout_id: Rollout ID (generated if not provided)
        """
        self.config = config
        self.workcell_id = workcell_id
        self.issue_id = issue_id
        self.rollout_id = rollout_id or f"fab_{workcell_id or 'anon'}_{_utc_now()}"

        self._db = None
        self._transitions: list[dict[str, Any]] = []
        self._transition_index = 0

    @property
    def db(self):
        """Lazy-load the transition database."""
        if self._db is None and self.config.log_to_db:
            from cyntra.dynamics.transition_db import TransitionDB

            db_path = self.config.db_path
            if not db_path:
                # Default path
                db_path = ".cyntra/dynamics/fab_transitions.db"

            self._db = TransitionDB(Path(db_path))

        return self._db

    def log_transition(
        self,
        from_state: FabAssetState,
        to_state: FabAssetState,
        action: dict[str, Any],
        context: dict[str, Any] | None = None,
        observations: dict[str, Any] | None = None,
    ) -> str:
        """
        Log a state transition.

        Args:
            from_state: State before action
            to_state: State after action
            action: Action that caused the transition
            context: Additional context (issue_id, workcell_id, etc.)
            observations: Observable outcomes (scores, verdicts, etc.)

        Returns:
            Transition ID
        """
        timestamp = _utc_now()

        # Build context with defaults
        full_context = {
            "issue_id": self.issue_id,
            "workcell_id": self.workcell_id,
            "job_type": "fab_gate",
            "toolchain": context.get("toolchain") if context else None,
            **(context or {}),
        }

        # Build transition record
        transition_id = _generate_transition_id(
            rollout_id=self.rollout_id,
            from_state_id=from_state.state_id,
            to_state_id=to_state.state_id,
            timestamp=timestamp,
            index=self._transition_index,
        )

        transition = {
            "transition_id": transition_id,
            "schema_version": "cyntra.fab_transition.v1",
            "rollout_id": self.rollout_id,
            "from_state": from_state.to_dict(),
            "to_state": to_state.to_dict(),
            "transition_kind": "fab_gate",
            "action_label": action,
            "context": full_context,
            "timestamp": timestamp,
            "observations": observations or {},
        }

        self._transitions.append(transition)
        self._transition_index += 1

        # Write to database if enabled
        if self.db:
            try:
                self.db.insert_transition(transition)
                self.db.conn.commit()
                logger.debug(f"Logged transition {transition_id}")
            except Exception as e:
                logger.warning(f"Failed to log transition to DB: {e}")

        return transition_id

    def log_gate_evaluation(
        self,
        result: GateResult,
        asset_path: Path | None,
        iteration_index: int,
        domain: str,
        previous_state: FabAssetState | None = None,
        action_description: str | None = None,
    ) -> str | None:
        """
        Log a gate evaluation as a state transition.

        Convenience method that builds states from gate result.

        Args:
            result: Gate evaluation result
            asset_path: Path to the asset file
            iteration_index: Current iteration number
            domain: Asset domain (car, furniture, etc.)
            previous_state: Previous state (or initial state if None)
            action_description: Description of the action taken

        Returns:
            Transition ID or None if logging disabled
        """
        if not self.config.enabled:
            return None

        from .state import FabAssetState

        # Build current state from gate result
        current_state = FabAssetState.from_gate_result(
            result=result,
            asset_path=asset_path,
            iteration_index=iteration_index,
            domain=domain,
            num_buckets=self.config.score_buckets,
        )

        # Use initial state if no previous state provided
        if previous_state is None:
            previous_state = FabAssetState.initial_state(domain=domain)

        # Build action label
        action = {
            "tool": "fab_gate",
            "command_class": "evaluate",
            "domain": domain,
            "iteration": iteration_index,
            "description": action_description or f"Gate evaluation iteration {iteration_index}",
        }

        # Build observations from gate result
        observations = {
            "verdict": result.verdict,
            "scores": result.scores,
            "hard_fails": result.failures.get("hard", []),
            "soft_fails": result.failures.get("soft", []),
            "run_id": result.run_id,
        }

        return self.log_transition(
            from_state=previous_state,
            to_state=current_state,
            action=action,
            context={
                "gate_config_id": result.gate_config_id,
                "iteration_index": iteration_index,
            },
            observations=observations,
        )

    def log_repair_action(
        self,
        from_state: FabAssetState,
        to_state: FabAssetState,
        repair_type: str,
        fail_codes: list[str],
    ) -> str | None:
        """
        Log a repair action transition.

        Args:
            from_state: State before repair
            to_state: State after repair
            repair_type: Type of repair (regenerate, fix_texture, etc.)
            fail_codes: Failure codes being addressed

        Returns:
            Transition ID or None if logging disabled
        """
        if not self.config.enabled:
            return None

        action = {
            "tool": "fab_repair",
            "command_class": repair_type,
            "domain": from_state.domain,
            "fail_codes": fail_codes,
        }

        return self.log_transition(
            from_state=from_state,
            to_state=to_state,
            action=action,
            observations={"repair_type": repair_type, "addressed_codes": fail_codes},
        )

    def get_transitions(self) -> list[dict[str, Any]]:
        """Get all logged transitions for this session."""
        return self._transitions.copy()

    def close(self) -> None:
        """Close database connection."""
        if self._db is not None:
            self._db.close()
            self._db = None


def create_dynamics_logger(
    gate_config: GateConfig,
    workcell_id: str | None = None,
    issue_id: str | None = None,
) -> FabDynamicsLogger | None:
    """
    Create a dynamics logger from gate config.

    Returns None if dynamics tracking is disabled.

    Args:
        gate_config: Gate configuration with dynamics settings
        workcell_id: Workcell ID for context
        issue_id: Issue ID for context

    Returns:
        FabDynamicsLogger or None if disabled
    """
    if not gate_config.dynamics.enabled:
        return None

    return FabDynamicsLogger(
        config=gate_config.dynamics,
        workcell_id=workcell_id,
        issue_id=issue_id,
    )


def log_fab_transition(
    gate_config: GateConfig,
    result: GateResult,
    asset_path: Path | None,
    iteration_index: int,
    domain: str,
    workcell_id: str | None = None,
    issue_id: str | None = None,
    previous_state: FabAssetState | None = None,
) -> str | None:
    """
    Convenience function to log a single gate evaluation transition.

    Creates a logger, logs the transition, and closes the connection.

    Args:
        gate_config: Gate configuration
        result: Gate evaluation result
        asset_path: Path to asset file
        iteration_index: Current iteration number
        domain: Asset domain
        workcell_id: Workcell ID for context
        issue_id: Issue ID for context
        previous_state: Previous state (or None for initial)

    Returns:
        Transition ID or None if logging disabled
    """
    if not gate_config.dynamics.enabled:
        return None

    dynamics_logger = FabDynamicsLogger(
        config=gate_config.dynamics,
        workcell_id=workcell_id,
        issue_id=issue_id,
    )

    try:
        return dynamics_logger.log_gate_evaluation(
            result=result,
            asset_path=asset_path,
            iteration_index=iteration_index,
            domain=domain,
            previous_state=previous_state,
        )
    finally:
        dynamics_logger.close()
