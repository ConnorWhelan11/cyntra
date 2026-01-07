"""
Fab Asset State - Formal state representation for dynamics tracking.

Based on: "Detailed balance in LLM-driven agents" (arXiv:2512.10047)

This module provides a formal, hashable state representation for fab assets
that enables transition logging and detailed balance analysis.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .gate import GateResult


def _compute_mesh_fingerprint(asset_path: Path | None) -> str:
    """
    Compute a geometry fingerprint from asset file.

    Uses first 4KB of file content for speed.
    """
    if not asset_path or not asset_path.exists():
        return "no_asset"

    try:
        with open(asset_path, "rb") as f:
            content = f.read(4096)
        return hashlib.sha256(content).hexdigest()[:16]
    except OSError:
        return "read_error"


def bucket_score(score: float, num_buckets: int = 5) -> int:
    """
    Bucket a 0-1 score into discrete levels.

    Default 5 buckets: [0-0.2), [0.2-0.4), [0.4-0.6), [0.6-0.8), [0.8-1.0]
    """
    if score < 0:
        return 0
    if score >= 1.0:
        return num_buckets - 1
    return min(num_buckets - 1, int(score * num_buckets))


def bucket_iteration(iteration: int) -> str:
    """Bucket iteration index for state space compression."""
    if iteration == 0:
        return "initial"
    if iteration <= 2:
        return "early"
    if iteration <= 4:
        return "mid"
    return "late"


@dataclass(frozen=True)
class FabAssetState:
    """
    Formal state representation for fab asset dynamics tracking.

    Immutable and hashable for use as dict keys and set members.
    Designed to compress the state space while preserving meaningful distinctions.

    Attributes:
        asset_hash: SHA256 prefix of asset file content
        mesh_fingerprint: Geometry fingerprint (tri count, bounds hash)
        score_bucket: Tuple of bucketed critic scores (category, alignment, realism, geometry)
        fail_codes: Frozen set of current failure codes
        iteration_bucket: Bucketed iteration index
        verdict: Gate verdict (pass/fail/escalate)
        domain: Asset domain (car, furniture, interior, etc.)
    """

    asset_hash: str
    mesh_fingerprint: str
    score_bucket: tuple[int, ...]
    fail_codes: frozenset[str]
    iteration_bucket: str
    verdict: str
    domain: str = "unknown"

    @property
    def state_id(self) -> str:
        """
        Compute deterministic state identifier.

        Format: fab_<sha256_prefix>
        """
        payload = {
            "asset_hash": self.asset_hash,
            "mesh_fingerprint": self.mesh_fingerprint,
            "score_bucket": list(self.score_bucket),
            "fail_codes": sorted(self.fail_codes),
            "iteration_bucket": self.iteration_bucket,
            "verdict": self.verdict,
            "domain": self.domain,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return f"fab_{hashlib.sha256(canonical.encode()).hexdigest()[:16]}"

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "state_id": self.state_id,
            "schema_version": "cyntra.fab_state.v1",
            "asset_hash": self.asset_hash,
            "mesh_fingerprint": self.mesh_fingerprint,
            "score_bucket": list(self.score_bucket),
            "fail_codes": sorted(self.fail_codes),
            "iteration_bucket": self.iteration_bucket,
            "verdict": self.verdict,
            "domain": self.domain,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FabAssetState:
        """Create from dictionary."""
        return cls(
            asset_hash=data.get("asset_hash", "unknown"),
            mesh_fingerprint=data.get("mesh_fingerprint", "unknown"),
            score_bucket=tuple(data.get("score_bucket", [0, 0, 0, 0])),
            fail_codes=frozenset(data.get("fail_codes", [])),
            iteration_bucket=data.get("iteration_bucket", "initial"),
            verdict=data.get("verdict", "unknown"),
            domain=data.get("domain", "unknown"),
        )

    @classmethod
    def from_gate_result(
        cls,
        result: GateResult,
        asset_path: Path | None,
        iteration_index: int,
        domain: str = "unknown",
        num_buckets: int = 5,
    ) -> FabAssetState:
        """
        Build state from gate evaluation result.

        Args:
            result: GateResult from gate evaluation
            asset_path: Path to the asset file
            iteration_index: Current iteration number
            domain: Asset domain (car, furniture, etc.)
            num_buckets: Number of buckets for score discretization

        Returns:
            FabAssetState instance
        """
        scores = result.scores or {}

        # Bucket scores for state space compression
        # Order: category, alignment, realism, geometry
        score_bucket = tuple(
            bucket_score(scores.get(critic, 0.0), num_buckets)
            for critic in ["category", "alignment", "realism", "geometry"]
        )

        # Combine hard and soft failures
        failures = result.failures or {}
        all_fails = set(failures.get("hard", [])) | set(failures.get("soft", []))

        return cls(
            asset_hash=result.asset_id,
            mesh_fingerprint=_compute_mesh_fingerprint(asset_path),
            score_bucket=score_bucket,
            fail_codes=frozenset(all_fails),
            iteration_bucket=bucket_iteration(iteration_index),
            verdict=result.verdict,
            domain=domain,
        )

    @classmethod
    def initial_state(cls, domain: str = "unknown") -> FabAssetState:
        """Create an initial/empty state for the start of a pipeline."""
        return cls(
            asset_hash="initial",
            mesh_fingerprint="none",
            score_bucket=(0, 0, 0, 0),
            fail_codes=frozenset(),
            iteration_bucket="initial",
            verdict="pending",
            domain=domain,
        )

    def potential_features(self) -> dict[str, Any]:
        """
        Extract features for potential function estimation.

        These features can be used by IdeaSearch-style discovery
        to find explicit potential function forms.
        """
        return {
            "num_failures": len(self.fail_codes),
            "has_hard_fail": any(
                code.startswith(("CAT_", "GEO_", "ASSET_"))
                for code in self.fail_codes
            ),
            "avg_score_bucket": sum(self.score_bucket) / len(self.score_bucket) if self.score_bucket else 0,
            "min_score_bucket": min(self.score_bucket) if self.score_bucket else 0,
            "max_score_bucket": max(self.score_bucket) if self.score_bucket else 0,
            "is_passing": self.verdict == "pass",
            "iteration_stage": self.iteration_bucket,
        }


@dataclass
class FabTransition:
    """
    A state transition in the fab pipeline.

    Records the from_state, to_state, action taken, and context.
    """

    transition_id: str
    from_state: FabAssetState
    to_state: FabAssetState
    action: dict[str, Any]
    context: dict[str, Any]
    timestamp: str

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for database storage."""
        return {
            "transition_id": self.transition_id,
            "schema_version": "cyntra.fab_transition.v1",
            "from_state": self.from_state.to_dict(),
            "to_state": self.to_state.to_dict(),
            "transition_kind": "fab_gate",
            "action_label": self.action,
            "context": self.context,
            "timestamp": self.timestamp,
        }


def compute_state_distance(state_a: FabAssetState, state_b: FabAssetState) -> float:
    """
    Compute a simple distance metric between two states.

    Used for finding similar states in the transition database.
    """
    # Score bucket distance (L1 norm)
    score_dist = sum(
        abs(a - b) for a, b in zip(state_a.score_bucket, state_b.score_bucket)
    )

    # Failure code Jaccard distance
    if state_a.fail_codes or state_b.fail_codes:
        intersection = len(state_a.fail_codes & state_b.fail_codes)
        union = len(state_a.fail_codes | state_b.fail_codes)
        jaccard_dist = 1.0 - (intersection / union) if union > 0 else 0.0
    else:
        jaccard_dist = 0.0

    # Verdict distance
    verdict_dist = 0.0 if state_a.verdict == state_b.verdict else 1.0

    # Weighted combination
    return 0.5 * score_dist + 0.3 * jaccard_dist + 0.2 * verdict_dist
