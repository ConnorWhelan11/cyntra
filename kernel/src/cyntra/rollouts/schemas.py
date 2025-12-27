"""
Schema helpers for Cyntra rollouts.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SCHEMAS_ROOT = Path(__file__).resolve().parents[3] / "schemas" / "cyntra"
ROLLOUT_SCHEMA_PATH = SCHEMAS_ROOT / "rollout.schema.json"


def load_rollout_schema() -> dict[str, Any]:
    """Load the rollout JSON schema."""
    with open(ROLLOUT_SCHEMA_PATH) as f:
        return json.load(f)
