"""
Dynamics report builder for Cyntra.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cyntra.dynamics.action import compute_action_summary
from cyntra.dynamics.potential import estimate_potential
from cyntra.dynamics.transition_db import TransitionDB


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _time_window(timestamps: list[str]) -> dict[str, Any]:
    parsed = [t for t in (_parse_timestamp(ts) for ts in timestamps) if t is not None]
    if not parsed:
        return {"since": None, "until": None}
    since = min(parsed).isoformat().replace("+00:00", "Z")
    until = max(parsed).isoformat().replace("+00:00", "Z")
    return {"since": since, "until": until}


def build_report(
    db_path: Path,
    *,
    smoothing_alpha: float = 1.0,
    action_low: float = 0.1,
    delta_v_low: float = 0.05,
) -> dict[str, Any]:
    db = TransitionDB(db_path)
    counts = db.transition_counts()
    state_meta = db.load_states()
    timestamps = db.list_transition_timestamps()

    state_ids = set(state_meta.keys())
    for row in counts:
        if row.get("from_state"):
            state_ids.add(row["from_state"])
        if row.get("to_state"):
            state_ids.add(row["to_state"])

    potentials, stderr_by_state, fit = estimate_potential(
        counts, state_ids, alpha=smoothing_alpha
    )

    action_summary = compute_action_summary(
        counts,
        potentials,
        state_meta,
        action_low=action_low,
        delta_v_low=delta_v_low,
    )

    potential_rows = []
    for state_id in sorted(state_ids):
        potential_rows.append(
            {
                "state_id": state_id,
                "V": potentials.get(state_id, 0.0),
                "stderr": stderr_by_state.get(state_id, 0.0),
            }
        )
    potential_rows.sort(key=lambda row: row["V"], reverse=True)

    report = {
        "schema_version": "cyntra.dynamics_report.v1",
        "generated_at": _utc_now(),
        "estimation": {
            "window": _time_window(timestamps),
            "smoothing_alpha": smoothing_alpha,
            "fit": fit,
        },
        "potential": potential_rows,
        "action_summary": action_summary,
        "controller_recommendations": {},
    }

    db.close()
    return report


def write_report(
    db_path: Path,
    output_path: Path,
    *,
    smoothing_alpha: float = 1.0,
    action_low: float = 0.1,
    delta_v_low: float = 0.05,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report = build_report(
        db_path,
        smoothing_alpha=smoothing_alpha,
        action_low=action_low,
        delta_v_low=delta_v_low,
    )
    output_path.write_text(json.dumps(report, indent=2))
    return output_path

