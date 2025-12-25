"""
Schema helpers for planner artifacts.

Planner schemas live under `cyntra-kernel/schemas/cyntra/`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SCHEMAS_ROOT = Path(__file__).resolve().parents[3] / "schemas" / "cyntra"
PLANNER_INPUT_SCHEMA_PATH = SCHEMAS_ROOT / "planner_input.schema.json"
PLANNER_ACTION_SCHEMA_PATH = SCHEMAS_ROOT / "planner_action.schema.json"
EXECUTED_PLAN_SCHEMA_PATH = SCHEMAS_ROOT / "executed_plan.schema.json"


def load_planner_input_schema() -> dict[str, Any]:
    with open(PLANNER_INPUT_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_planner_action_schema() -> dict[str, Any]:
    with open(PLANNER_ACTION_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_executed_plan_schema() -> dict[str, Any]:
    with open(EXECUTED_PLAN_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)

