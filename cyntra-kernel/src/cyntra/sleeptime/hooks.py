"""
Sleeptime Hooks - Integration points with the kernel scheduler.

Provides hook functions to be called from:
- Dispatcher.on_workcell_complete()
- Runner.on_run_finish()
- Main loop idle detection
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from cyntra.kernel.config import KernelConfig
    from cyntra.sleeptime.orchestrator import SleeptimeOrchestrator, ConsolidationResult

logger = logging.getLogger(__name__)

# Global orchestrator instance (initialized lazily)
_orchestrator: SleeptimeOrchestrator | None = None


def get_orchestrator(config: KernelConfig) -> SleeptimeOrchestrator | None:
    """Get or create the global sleeptime orchestrator."""
    global _orchestrator

    if _orchestrator is not None:
        return _orchestrator

    # Check if sleeptime is configured
    sleeptime_config = getattr(config, "sleeptime", None)
    if sleeptime_config is None or not sleeptime_config.enabled:
        return None

    from cyntra.sleeptime.orchestrator import SleeptimeOrchestrator

    _orchestrator = SleeptimeOrchestrator(
        config=sleeptime_config,
        repo_root=config.repo_root,
    )

    return _orchestrator


def on_workcell_complete(
    config: KernelConfig,
    success: bool,
    run_id: str | None = None,
) -> ConsolidationResult | None:
    """
    Hook to call when a workcell completes.

    Usage in dispatcher.py:
        from cyntra.sleeptime.hooks import on_workcell_complete
        ...
        result = on_workcell_complete(self.config, success=run_success, run_id=run_id)
        if result:
            logger.info(f"Sleeptime consolidation: {result.patterns_found} patterns")
    """
    orchestrator = get_orchestrator(config)
    if orchestrator is None:
        return None

    return orchestrator.on_workcell_complete(success=success)


async def on_workcell_complete_async(
    config: KernelConfig,
    success: bool,
    run_id: str | None = None,
) -> ConsolidationResult | None:
    """
    Async version that runs consolidation in background.

    Usage:
        asyncio.create_task(on_workcell_complete_async(config, success))
    """
    orchestrator = get_orchestrator(config)
    if orchestrator is None:
        return None

    # Check trigger without blocking
    if not orchestrator.should_trigger():
        orchestrator.on_workcell_complete(success)  # Just update counters
        return None

    # Run consolidation in thread pool
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        orchestrator.consolidate,
    )


def on_idle(config: KernelConfig) -> ConsolidationResult | None:
    """
    Hook to call during idle periods.

    Usage in main loop:
        if no_work_available:
            from cyntra.sleeptime.hooks import on_idle
            on_idle(self.config)
            time.sleep(poll_interval)
    """
    orchestrator = get_orchestrator(config)
    if orchestrator is None:
        return None

    if orchestrator.should_trigger():
        return orchestrator.consolidate()

    return None


def inject_learned_context(
    config: KernelConfig,
    prompt: str,
) -> str:
    """
    Inject learned context into an agent's prompt.

    Usage in adapter:
        prompt = inject_learned_context(config, base_prompt)
    """
    orchestrator = get_orchestrator(config)
    if orchestrator is None:
        return prompt

    return orchestrator.inject_context_prompt(prompt)


def get_learned_context_blocks(
    config: KernelConfig,
    block_names: list[str] | None = None,
) -> dict[str, str]:
    """
    Get raw learned context blocks.

    Usage:
        context = get_learned_context_blocks(config, ["failure_modes"])
        if "failure_modes" in context:
            # Include in tool hints or system prompt
    """
    orchestrator = get_orchestrator(config)
    if orchestrator is None:
        return {}

    return orchestrator.get_learned_context(block_names)


# Background task for continuous idle monitoring
_idle_task: asyncio.Task | None = None


async def start_idle_monitor(
    config: KernelConfig,
    check_interval: float = 60.0,
    on_consolidation: Callable[[ConsolidationResult], None] | None = None,
) -> None:
    """
    Start background task that checks for idle consolidation.

    Usage:
        asyncio.create_task(start_idle_monitor(config))
    """
    global _idle_task

    if _idle_task is not None:
        return

    async def monitor():
        while True:
            try:
                result = on_idle(config)
                if result and on_consolidation:
                    on_consolidation(result)
            except Exception as e:
                logger.exception("Idle monitor error")

            await asyncio.sleep(check_interval)

    _idle_task = asyncio.create_task(monitor())


def stop_idle_monitor() -> None:
    """Stop the idle monitor background task."""
    global _idle_task
    if _idle_task:
        _idle_task.cancel()
        _idle_task = None
