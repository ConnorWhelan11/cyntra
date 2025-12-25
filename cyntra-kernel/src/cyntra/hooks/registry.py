"""
Hook Registration System.

Manages registration and lookup of hooks by trigger type.
"""

from __future__ import annotations

from cyntra.hooks.types import HookDefinition, HookTrigger


class HookRegistry:
    """
    Registry for post-execution hooks.

    Hooks are stored by trigger type and sorted by priority.
    """

    _hooks: dict[HookTrigger, list[HookDefinition]] = {}

    @classmethod
    def register(cls, hook: HookDefinition) -> None:
        """
        Register a hook.

        Args:
            hook: Hook definition to register
        """
        if hook.trigger not in cls._hooks:
            cls._hooks[hook.trigger] = []

        # Avoid duplicate registration
        existing_names = [h.name for h in cls._hooks[hook.trigger]]
        if hook.name in existing_names:
            # Replace existing hook
            cls._hooks[hook.trigger] = [
                h for h in cls._hooks[hook.trigger] if h.name != hook.name
            ]

        cls._hooks[hook.trigger].append(hook)

        # Sort by priority (lower value = earlier)
        cls._hooks[hook.trigger].sort(key=lambda h: h.priority.value)

    @classmethod
    def unregister(cls, name: str, trigger: HookTrigger | None = None) -> bool:
        """
        Unregister a hook by name.

        Args:
            name: Hook name to remove
            trigger: Optional trigger to narrow search

        Returns:
            True if hook was found and removed
        """
        found = False
        triggers = [trigger] if trigger else list(cls._hooks.keys())

        for t in triggers:
            if t in cls._hooks:
                original_len = len(cls._hooks[t])
                cls._hooks[t] = [h for h in cls._hooks[t] if h.name != name]
                if len(cls._hooks[t]) < original_len:
                    found = True

        return found

    @classmethod
    def get_hooks(cls, trigger: HookTrigger) -> list[HookDefinition]:
        """
        Get all hooks for a trigger.

        Args:
            trigger: The trigger type

        Returns:
            List of hooks sorted by priority
        """
        return cls._hooks.get(trigger, [])

    @classmethod
    def get_all_hooks(cls) -> dict[HookTrigger, list[HookDefinition]]:
        """Get all registered hooks."""
        return dict(cls._hooks)

    @classmethod
    def clear(cls) -> None:
        """Clear all registered hooks (for testing)."""
        cls._hooks.clear()

    @classmethod
    def hook_count(cls) -> int:
        """Get total number of registered hooks."""
        return sum(len(hooks) for hooks in cls._hooks.values())
