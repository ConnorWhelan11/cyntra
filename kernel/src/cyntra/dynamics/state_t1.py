"""
Tier-1 state representation and hashing.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def bucket_diff_lines(diff_lines: int) -> str:
    if diff_lines <= 0:
        return "0"
    if diff_lines <= 20:
        return "1-20"
    if diff_lines <= 100:
        return "21-100"
    if diff_lines <= 500:
        return "101-500"
    return ">500"


def bucket_files_touched(files_touched: int) -> str:
    if files_touched <= 0:
        return "0"
    if files_touched <= 5:
        return "1-5"
    if files_touched <= 20:
        return "6-20"
    return ">20"


def _state_hash_payload(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_state_t1(
    *,
    domain: str,
    job_type: str,
    features: dict[str, Any],
    policy_key: dict[str, Any] | None = None,
    artifact_digests: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build a Tier-1 state and compute its deterministic ID.
    """
    policy_key = policy_key or {}
    artifact_digests = artifact_digests or {}

    payload = {
        "schema_version": "cyntra.state_t1.v1",
        "domain": domain,
        "job_type": job_type,
        "features": features,
        "policy_key": policy_key,
        "artifact_digests": artifact_digests,
    }
    state_id = f"st1_{_state_hash_payload(payload)}"
    return {**payload, "state_id": state_id}
