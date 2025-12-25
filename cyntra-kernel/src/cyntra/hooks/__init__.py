"""
Post-execution hooks system.

Hooks run in the same workcell after primary agent completion,
enabling lightweight agents like code-reviewer and debug-specialist.

Usage:
    from cyntra.hooks import HookRegistry, HookRunner, HookTrigger, HookContext

    # Register a hook
    HookRegistry.register(HookDefinition(
        name="my-hook",
        trigger=HookTrigger.POST_EXECUTION,
        handler=my_handler_function,
    ))

    # Run hooks
    runner = HookRunner(config)
    results = runner.run_hooks(HookTrigger.POST_EXECUTION, context)
"""

from cyntra.hooks.types import (
    HookTrigger,
    HookPriority,
    HookContext,
    HookResult,
    HookDefinition,
    HookHandler,
    AsyncHookHandler,
)
from cyntra.hooks.registry import HookRegistry
from cyntra.hooks.runner import HookRunner

__all__ = [
    # Types
    "HookTrigger",
    "HookPriority",
    "HookContext",
    "HookResult",
    "HookDefinition",
    "HookHandler",
    "AsyncHookHandler",
    # Registry
    "HookRegistry",
    # Runner
    "HookRunner",
]


def register_builtin_hooks() -> None:
    """
    Register built-in hooks.

    Called during kernel initialization to register:
    - code-reviewer: Reviews patches after primary agent
    - debug-specialist: Investigates gate failures
    """
    # Import here to avoid circular imports
    from cyntra.hooks.code_reviewer import CODE_REVIEWER_HOOK
    from cyntra.hooks.debug_specialist import DEBUG_SPECIALIST_HOOK

    HookRegistry.register(CODE_REVIEWER_HOOK)
    HookRegistry.register(DEBUG_SPECIALIST_HOOK)
