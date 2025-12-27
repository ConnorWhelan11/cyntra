"""
Hook Runner - Executes hooks in priority order.

Runs hooks synchronously or asynchronously based on configuration.
Supports configurable timeouts and per-hook settings.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

import structlog

from cyntra.hooks.registry import HookRegistry
from cyntra.hooks.types import (
    HookContext,
    HookDefinition,
    HookResult,
    HookTrigger,
)

if TYPE_CHECKING:
    from cyntra.kernel.config import KernelConfig, PostExecutionHooksConfig

logger = structlog.get_logger()

# Thread pool for running sync handlers in async context
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="hook-")


class HookRunner:
    """Runs hooks for a given trigger with configurable timeouts."""

    def __init__(self, config: KernelConfig) -> None:
        """
        Initialize hook runner.

        Args:
            config: Kernel configuration
        """
        self.config = config
        self.hooks_config: PostExecutionHooksConfig | None = getattr(
            config, "post_execution_hooks", None
        )
        self._default_timeout = self.hooks_config.timeout_seconds if self.hooks_config else 120

    def run_hooks(
        self,
        trigger: HookTrigger,
        context: HookContext,
    ) -> list[HookResult]:
        """
        Run all hooks for a trigger synchronously.

        Args:
            trigger: The trigger type
            context: Hook context with workcell info

        Returns:
            List of results from each hook
        """
        results: list[HookResult] = []
        hooks = HookRegistry.get_hooks(trigger)

        if not hooks:
            return results

        logger.info(
            "running_hooks",
            trigger=trigger.value,
            hook_count=len(hooks),
            workcell_id=context.workcell_id,
        )

        for hook in hooks:
            if not self._should_run(hook, context):
                logger.debug(
                    "hook_skipped",
                    hook=hook.name,
                    reason="filter_mismatch",
                )
                continue

            try:
                start_time = time.monotonic()

                if hook.async_handler:
                    # Run async handler - handle both sync and async calling contexts
                    result = self._run_async_handler_sync(hook.handler, context)
                else:
                    result = hook.handler(context)  # type: ignore

                result.duration_ms = int((time.monotonic() - start_time) * 1000)
                results.append(result)

                # Update context with hook output for chaining
                context.hook_outputs[hook.name] = result.output

                logger.info(
                    "hook_completed",
                    hook=hook.name,
                    success=result.success,
                    duration_ms=result.duration_ms,
                    recommendations=len(result.recommendations),
                )

            except Exception as e:
                logger.exception("hook_error", hook=hook.name, error=str(e))
                results.append(
                    HookResult(
                        hook_name=hook.name,
                        success=False,
                        error=str(e),
                    )
                )

        return results

    def _run_async_handler_sync(
        self,
        handler: Callable[[HookContext], Any],
        context: HookContext,
    ) -> HookResult:
        """
        Run an async handler from a sync context safely.

        Handles the case where we might already be in an event loop.
        """
        try:
            # Check if we're already in an event loop
            asyncio.get_running_loop()
            # We're in an async context - run in a new thread to avoid blocking
            future = _executor.submit(lambda: asyncio.run(handler(context)))
            return future.result(timeout=self._default_timeout)
        except RuntimeError:
            # No event loop running - safe to use asyncio.run()
            return asyncio.run(handler(context))  # type: ignore

    async def run_hooks_async(
        self,
        trigger: HookTrigger,
        context: HookContext,
    ) -> list[HookResult]:
        """
        Run all hooks for a trigger asynchronously.

        Args:
            trigger: The trigger type
            context: Hook context with workcell info

        Returns:
            List of results from each hook
        """
        results: list[HookResult] = []
        hooks = HookRegistry.get_hooks(trigger)

        if not hooks:
            return results

        logger.info(
            "running_hooks_async",
            trigger=trigger.value,
            hook_count=len(hooks),
            workcell_id=context.workcell_id,
        )

        for hook in hooks:
            if not self._should_run(hook, context):
                logger.debug(
                    "hook_skipped",
                    hook=hook.name,
                    reason="filter_mismatch",
                )
                continue

            try:
                start_time = time.monotonic()

                if hook.async_handler:
                    result = await hook.handler(context)  # type: ignore
                else:
                    # Run sync handler in thread pool executor
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        _executor,
                        hook.handler,
                        context,  # type: ignore
                    )

                result.duration_ms = int((time.monotonic() - start_time) * 1000)
                results.append(result)

                # Update context with hook output for chaining
                context.hook_outputs[hook.name] = result.output

                logger.info(
                    "hook_completed",
                    hook=hook.name,
                    success=result.success,
                    duration_ms=result.duration_ms,
                )

            except Exception as e:
                logger.exception("hook_error", hook=hook.name, error=str(e))
                results.append(
                    HookResult(
                        hook_name=hook.name,
                        success=False,
                        error=str(e),
                    )
                )

        return results

    def _should_run(self, hook: HookDefinition, context: HookContext) -> bool:
        """
        Check if hook should run based on filters and configuration.

        Args:
            hook: Hook definition
            context: Hook context

        Returns:
            True if hook should run
        """
        if not hook.enabled:
            return False

        # Check if hooks are globally disabled
        if self.hooks_config and not getattr(self.hooks_config, "enabled", True):
            return False

        # Check if this specific hook is disabled via config
        hook_config = self.get_hook_config(hook.name)
        if hook_config and not hook_config.get("enabled", True):
            return False

        # Check tag filters
        issue_tags = context.manifest.get("issue", {}).get("tags", [])

        if hook.match_tags and not any(t in issue_tags for t in hook.match_tags):
            return False

        if hook.exclude_tags and any(t in issue_tags for t in hook.exclude_tags):
            return False

        # Check status filter
        return not (hook.match_status and context.proof.status not in hook.match_status)

    def get_hook_config(self, hook_name: str) -> dict[str, Any]:
        """
        Get configuration for a specific hook.

        Looks up the hook config from PostExecutionHooksConfig.
        Hook names like "code-reviewer" are converted to "code_reviewer".

        Args:
            hook_name: Name of the hook (e.g., "code-reviewer")

        Returns:
            Configuration dict for the hook, or empty dict if not found
        """
        if not self.hooks_config:
            return {}

        # Convert hook name to Python attribute name
        attr_name = hook_name.replace("-", "_")

        # Get the config object (e.g., CodeReviewerHookConfig)
        hook_cfg = getattr(self.hooks_config, attr_name, None)

        if hook_cfg is None:
            return {}

        # Convert dataclass to dict if needed
        if hasattr(hook_cfg, "__dataclass_fields__"):
            return {k: getattr(hook_cfg, k) for k in hook_cfg.__dataclass_fields__}

        # Already a dict or dict-like
        if isinstance(hook_cfg, dict):
            return hook_cfg

        return {}
