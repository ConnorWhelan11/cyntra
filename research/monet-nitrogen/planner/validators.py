"""Validation and sanitization for planner outputs."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator, ValidationError

from schemas.planner_output import PlannerOutput, Constraint, ConstraintType

logger = logging.getLogger(__name__)

# Load JSON schema
_SCHEMA_PATH = Path(__file__).parent.parent / "configs" / "planner_schema.json"
_SCHEMA: dict | None = None


def _get_schema() -> dict:
    """Load and cache the JSON schema."""
    global _SCHEMA
    if _SCHEMA is None:
        if _SCHEMA_PATH.exists():
            _SCHEMA = json.loads(_SCHEMA_PATH.read_text())
        else:
            # Fallback minimal schema
            _SCHEMA = {"type": "object"}
    return _SCHEMA


def validate_plan(data: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate plan data against JSON schema.

    Args:
        data: Plan data dict

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    schema = _get_schema()
    validator = Draft7Validator(schema)

    errors = list(validator.iter_errors(data))
    if not errors:
        return True, []

    messages = []
    for error in errors:
        path = ".".join(str(p) for p in error.path) if error.path else "root"
        messages.append(f"{path}: {error.message}")

    return False, messages


def sanitize_plan(data: dict[str, Any]) -> dict[str, Any]:
    """Sanitize and fix common issues in plan data.

    Attempts to fix:
    - Missing optional fields
    - Out-of-range values (clamp to valid range)
    - Invalid enum values (use defaults)
    - Excess constraints (truncate)

    Args:
        data: Raw plan data dict

    Returns:
        Sanitized data dict
    """
    sanitized = data.copy()

    # Ensure required structure
    if "target" not in sanitized:
        sanitized["target"] = {"type": "none", "ref": "", "screen_xy": [0.5, 0.5]}

    if "skill" not in sanitized:
        sanitized["skill"] = {"mode": "balanced", "aggression": 0.5, "stealth": 0.0}

    if "constraints" not in sanitized:
        sanitized["constraints"] = []

    if "confidence" not in sanitized:
        sanitized["confidence"] = 0.5

    if "intent" not in sanitized:
        sanitized["intent"] = "unknown"

    # Clamp confidence to valid range
    sanitized["confidence"] = max(0.0, min(1.0, float(sanitized["confidence"])))

    # Sanitize target
    target = sanitized["target"]
    if "screen_xy" in target:
        xy = target["screen_xy"]
        if isinstance(xy, (list, tuple)) and len(xy) >= 2:
            target["screen_xy"] = [
                max(0.0, min(1.0, float(xy[0]))),
                max(0.0, min(1.0, float(xy[1]))),
            ]
        else:
            target["screen_xy"] = [0.5, 0.5]

    # Validate target type
    valid_target_types = {"enemy", "objective", "cover", "item", "none"}
    if target.get("type") not in valid_target_types:
        target["type"] = "none"

    # Sanitize skill
    skill = sanitized["skill"]
    valid_modes = {"aggressive", "defensive", "stealth", "balanced"}
    if skill.get("mode") not in valid_modes:
        skill["mode"] = "balanced"
    skill["aggression"] = max(0.0, min(1.0, float(skill.get("aggression", 0.5))))
    skill["stealth"] = max(0.0, min(1.0, float(skill.get("stealth", 0.0))))

    # Sanitize constraints
    constraints = sanitized["constraints"]
    if len(constraints) > 5:
        # Keep highest priority constraints
        constraints.sort(key=lambda c: c.get("priority", 0), reverse=True)
        constraints = constraints[:5]
        logger.info(f"Truncated constraints to 5 (was {len(sanitized['constraints'])})")

    valid_constraint_types = {"DO", "DO_NOT", "PREFER", "AVOID_ZONE", "FOCUS_TARGET", "MAX_RISK", "PRIORITIZE_OBJECTIVE"}
    valid_actions = {
        "SHOOT", "MOVE_FORWARD", "MOVE_BACKWARD", "MOVE_LEFT", "MOVE_RIGHT",
        "JUMP", "DODGE", "INTERACT", "AIM_AT_TARGET", "USE_ABILITY", "SPRINT", "CROUCH", None
    }

    sanitized_constraints = []
    for c in constraints:
        if c.get("type") not in valid_constraint_types:
            continue  # Skip invalid constraint type

        if c.get("action") not in valid_actions:
            c["action"] = None

        c["priority"] = max(0.0, min(1.0, float(c.get("priority", 0.5))))

        if "until_s" in c and c["until_s"] is not None:
            c["until_s"] = max(0.0, min(10.0, float(c["until_s"])))

        if "reason" not in c:
            c["reason"] = "no reason provided"

        sanitized_constraints.append(c)

    sanitized["constraints"] = sanitized_constraints

    return sanitized


def create_safe_plan_from_partial(data: dict[str, Any]) -> PlannerOutput:
    """Create a valid PlannerOutput from potentially incomplete data.

    Args:
        data: Partial plan data

    Returns:
        Valid PlannerOutput (uses defaults for missing/invalid fields)
    """
    import time

    sanitized = sanitize_plan(data)

    if "timestamp_ms" not in sanitized:
        sanitized["timestamp_ms"] = int(time.time() * 1000)

    try:
        return PlannerOutput(**sanitized)
    except Exception as e:
        logger.error(f"Failed to create plan even after sanitization: {e}")
        # Return absolute fallback
        from schemas.planner_output import SAFE_FALLBACK_PLAN
        return SAFE_FALLBACK_PLAN
