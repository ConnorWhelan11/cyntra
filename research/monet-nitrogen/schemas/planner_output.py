"""Pydantic models for Monet planner output."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ConstraintType(str, Enum):
    """Types of constraints the planner can output."""

    DO = "DO"
    DO_NOT = "DO_NOT"
    PREFER = "PREFER"
    AVOID_ZONE = "AVOID_ZONE"
    FOCUS_TARGET = "FOCUS_TARGET"
    MAX_RISK = "MAX_RISK"
    PRIORITIZE_OBJECTIVE = "PRIORITIZE_OBJECTIVE"


class ActionType(str, Enum):
    """Abstract action types that map to gamepad buttons."""

    SHOOT = "SHOOT"
    MOVE_FORWARD = "MOVE_FORWARD"
    MOVE_BACKWARD = "MOVE_BACKWARD"
    MOVE_LEFT = "MOVE_LEFT"
    MOVE_RIGHT = "MOVE_RIGHT"
    JUMP = "JUMP"
    DODGE = "DODGE"
    INTERACT = "INTERACT"
    AIM_AT_TARGET = "AIM_AT_TARGET"
    USE_ABILITY = "USE_ABILITY"
    SPRINT = "SPRINT"
    CROUCH = "CROUCH"


TargetType = Literal["enemy", "objective", "cover", "item", "none"]
SkillModeType = Literal["aggressive", "defensive", "stealth", "balanced"]


class Constraint(BaseModel):
    """A single constraint from the planner."""

    type: ConstraintType
    action: ActionType | None = None
    until_s: float | None = Field(None, ge=0, le=10.0)
    priority: float = Field(0.5, ge=0.0, le=1.0)
    reason: str = Field(..., max_length=100)
    zone_xy: tuple[float, float] | None = None
    zone_radius: float | None = Field(None, ge=0, le=1.0)

    @field_validator("zone_xy", mode="before")
    @classmethod
    def validate_zone_xy(cls, v: list[float] | tuple[float, float] | None) -> tuple[float, float] | None:
        if v is None:
            return None
        if isinstance(v, list):
            return (v[0], v[1])
        return v


class Target(BaseModel):
    """Target information from the planner."""

    type: TargetType
    ref: str = Field(..., max_length=100)
    screen_xy: tuple[float, float] = Field(..., description="Normalized 0-1 screen coordinates")

    @field_validator("screen_xy", mode="before")
    @classmethod
    def validate_screen_xy(cls, v: list[float] | tuple[float, float]) -> tuple[float, float]:
        if isinstance(v, list):
            return (v[0], v[1])
        return v

    @field_validator("screen_xy")
    @classmethod
    def validate_screen_xy_range(cls, v: tuple[float, float]) -> tuple[float, float]:
        x, y = v
        if not (0 <= x <= 1 and 0 <= y <= 1):
            # Clamp to valid range instead of raising
            x = max(0, min(1, x))
            y = max(0, min(1, y))
        return (x, y)


class SkillMode(BaseModel):
    """Skill mode parameters from the planner."""

    mode: SkillModeType
    aggression: float = Field(0.5, ge=0.0, le=1.0)
    stealth: float = Field(0.0, ge=0.0, le=1.0)


class PlannerOutput(BaseModel):
    """Complete output from the Monet planner."""

    timestamp_ms: int = Field(..., ge=0)
    intent: str = Field(..., max_length=200)
    target: Target
    constraints: list[Constraint] = Field(default_factory=list, max_length=5)
    skill: SkillMode
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_constraints(self) -> "PlannerOutput":
        """Ensure no conflicting DO/DO_NOT for same action."""
        actions_do = {c.action for c in self.constraints if c.type == ConstraintType.DO and c.action}
        actions_dont = {
            c.action for c in self.constraints if c.type == ConstraintType.DO_NOT and c.action
        }
        conflicts = actions_do & actions_dont
        if conflicts:
            # Remove lower priority conflicting constraints instead of raising
            filtered = []
            for c in self.constraints:
                if c.action in conflicts:
                    # Keep only the highest priority one
                    same_action = [
                        x for x in self.constraints if x.action == c.action
                    ]
                    if c == max(same_action, key=lambda x: x.priority):
                        filtered.append(c)
                else:
                    filtered.append(c)
            self.constraints = filtered
        return self

    def get_active_constraints(self, current_time_s: float, plan_time_s: float) -> list[Constraint]:
        """Get constraints that haven't expired."""
        elapsed = current_time_s - plan_time_s
        active = []
        for c in self.constraints:
            if c.until_s is None or elapsed < c.until_s:
                active.append(c)
        return active


# Safe fallback plan when planner times out or fails
SAFE_FALLBACK_PLAN = PlannerOutput(
    timestamp_ms=0,
    intent="fallback_safe_mode",
    target=Target(type="none", ref="", screen_xy=(0.5, 0.5)),
    constraints=[
        Constraint(
            type=ConstraintType.DO_NOT,
            action=ActionType.SHOOT,
            priority=1.0,
            reason="Plan expired - safety mode",
        ),
        Constraint(
            type=ConstraintType.PREFER,
            action=ActionType.DODGE,
            priority=0.8,
            reason="Defensive fallback",
        ),
    ],
    skill=SkillMode(mode="defensive", aggression=0.2, stealth=0.0),
    confidence=0.3,
)
