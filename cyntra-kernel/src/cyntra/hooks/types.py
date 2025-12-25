"""
Hook type definitions for post-execution hooks.

These hooks run in the same workcell after primary agent completion,
enabling lightweight agents like code-reviewer and debug-specialist.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any, Awaitable, Callable

if TYPE_CHECKING:
    from cyntra.adapters.base import PatchProof


class HookTrigger(Enum):
    """When hooks fire."""

    POST_EXECUTION = "post_execution"  # After primary agent completes
    POST_VERIFICATION = "post_verification"  # After gates run
    ON_GATE_FAILURE = "on_gate_failure"  # When gates fail
    ON_SUCCESS = "on_success"  # When verification passes


class HookPriority(Enum):
    """Execution order for multiple hooks."""

    EARLY = 10
    NORMAL = 50
    LATE = 90


@dataclass
class HookContext:
    """Context passed to hook functions."""

    workcell_path: Path
    workcell_id: str
    issue_id: str
    proof: PatchProof
    manifest: dict[str, Any]
    verification_result: dict[str, Any] | None = None
    gate_failures: list[str] = field(default_factory=list)

    # For hooks to pass data forward
    hook_outputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class HookResult:
    """Result from a hook execution."""

    hook_name: str
    success: bool
    output: dict[str, Any] = field(default_factory=dict)
    modified_proof: PatchProof | None = None
    recommendations: list[str] = field(default_factory=list)
    duration_ms: int = 0
    error: str | None = None


# Type alias for hook handlers
HookHandler = Callable[[HookContext], HookResult]
AsyncHookHandler = Callable[[HookContext], Awaitable[HookResult]]


@dataclass
class HookDefinition:
    """Registered hook definition."""

    name: str
    trigger: HookTrigger
    handler: HookHandler | AsyncHookHandler
    priority: HookPriority = HookPriority.NORMAL
    async_handler: bool = False
    enabled: bool = True
    config: dict[str, Any] = field(default_factory=dict)

    # Filtering
    match_tags: list[str] | None = None  # Only run for issues with these tags
    exclude_tags: list[str] | None = None
    match_status: list[str] | None = None  # Only run for these proof statuses
