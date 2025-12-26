"""
Adapters - Toolchain integrations.

This module intentionally uses lazy imports so that optional / external-tool
adapters (e.g. OpenCode, Crush) cannot break importing Cyntra as a whole.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cyntra.adapters.base import CostEstimate, PatchProof, ToolchainAdapter
    from cyntra.adapters.blender import (
        BlenderAgentAdapter,
        BlenderAgentConfig,
        BlenderTaskManifest,
        BlenderTaskResult,
        create_blender_adapter,
    )
    from cyntra.adapters.claude import ClaudeAdapter
    from cyntra.adapters.codex import CodexAdapter
    from cyntra.adapters.comfyui import ComfyUIAdapter
    from cyntra.adapters.crush import CrushAdapter
    from cyntra.adapters.fab_world import FabWorldAdapter
    from cyntra.adapters.opencode import OpenCodeAdapter
    from cyntra.adapters.outora import (
        LibraryValidationResult,
        OutoraLibraryAdapter,
        PodPlacement,
        create_outora_adapter,
    )
    from cyntra.adapters.router import ToolchainRouter, RoutingDecision
    from cyntra.adapters.test_architect import TestArchitectAdapter

__all__ = [
    # Code adapters
    "ToolchainAdapter",
    "PatchProof",
    "CostEstimate",
    "CodexAdapter",
    "ClaudeAdapter",
    "CrushAdapter",
    "OpenCodeAdapter",
    "ToolchainRouter",
    "RoutingDecision",
    # Blender adapter
    "BlenderAgentAdapter",
    "BlenderAgentConfig",
    "BlenderTaskManifest",
    "BlenderTaskResult",
    "create_blender_adapter",
    # Outora adapter
    "OutoraLibraryAdapter",
    "PodPlacement",
    "LibraryValidationResult",
    "create_outora_adapter",
    # Fab World adapter
    "FabWorldAdapter",
    # ComfyUI adapter
    "ComfyUIAdapter",
    # Test Architect adapter
    "TestArchitectAdapter",
    # Registry helpers
    "get_adapter",
    "get_available_adapters",
]


_LAZY_EXPORTS: dict[str, tuple[str, str]] = {
    # base
    "ToolchainAdapter": ("cyntra.adapters.base", "ToolchainAdapter"),
    "PatchProof": ("cyntra.adapters.base", "PatchProof"),
    "CostEstimate": ("cyntra.adapters.base", "CostEstimate"),
    # core adapters
    "CodexAdapter": ("cyntra.adapters.codex", "CodexAdapter"),
    "ClaudeAdapter": ("cyntra.adapters.claude", "ClaudeAdapter"),
    "CrushAdapter": ("cyntra.adapters.crush", "CrushAdapter"),
    "OpenCodeAdapter": ("cyntra.adapters.opencode", "OpenCodeAdapter"),
    "FabWorldAdapter": ("cyntra.adapters.fab_world", "FabWorldAdapter"),
    "ComfyUIAdapter": ("cyntra.adapters.comfyui", "ComfyUIAdapter"),
    "TestArchitectAdapter": ("cyntra.adapters.test_architect", "TestArchitectAdapter"),
    # router
    "ToolchainRouter": ("cyntra.adapters.router", "ToolchainRouter"),
    "RoutingDecision": ("cyntra.adapters.router", "RoutingDecision"),
    # blender adapter
    "BlenderAgentAdapter": ("cyntra.adapters.blender", "BlenderAgentAdapter"),
    "BlenderAgentConfig": ("cyntra.adapters.blender", "BlenderAgentConfig"),
    "BlenderTaskManifest": ("cyntra.adapters.blender", "BlenderTaskManifest"),
    "BlenderTaskResult": ("cyntra.adapters.blender", "BlenderTaskResult"),
    "create_blender_adapter": ("cyntra.adapters.blender", "create_blender_adapter"),
    # outora adapter
    "OutoraLibraryAdapter": ("cyntra.adapters.outora", "OutoraLibraryAdapter"),
    "PodPlacement": ("cyntra.adapters.outora", "PodPlacement"),
    "LibraryValidationResult": ("cyntra.adapters.outora", "LibraryValidationResult"),
    "create_outora_adapter": ("cyntra.adapters.outora", "create_outora_adapter"),
}


def __getattr__(name: str):  # type: ignore[override]
    if name in _LAZY_EXPORTS:
        import importlib

        module_name, attr_name = _LAZY_EXPORTS[name]
        module = importlib.import_module(module_name)
        value = getattr(module, attr_name)
        globals()[name] = value
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_adapter(name: str, config: dict | None = None):  # -> ToolchainAdapter | None
    """
    Get an adapter by name.

    Args:
        name: Adapter name (codex, claude, opencode, crush, fab-world)
        config: Optional adapter configuration

    Returns:
        Adapter instance or None if not found / import failed.
    """
    import importlib

    adapters: dict[str, tuple[str, str]] = {
        "codex": ("cyntra.adapters.codex", "CodexAdapter"),
        "claude": ("cyntra.adapters.claude", "ClaudeAdapter"),
        "opencode": ("cyntra.adapters.opencode", "OpenCodeAdapter"),
        "crush": ("cyntra.adapters.crush", "CrushAdapter"),
        "fab-world": ("cyntra.adapters.fab_world", "FabWorldAdapter"),
        "comfyui": ("cyntra.adapters.comfyui", "ComfyUIAdapter"),
        "test-architect": ("cyntra.adapters.test_architect", "TestArchitectAdapter"),
    }

    key = name.lower()
    if key not in adapters:
        return None

    module_name, class_name = adapters[key]
    try:
        cls = getattr(importlib.import_module(module_name), class_name)
    except Exception:
        return None
    return cls(config)


def get_available_adapters() -> list[str]:
    """Get list of available (installed) adapters."""
    available: list[str] = []
    for name in ("codex", "claude", "crush", "opencode"):
        adapter = get_adapter(name)
        if adapter is not None and getattr(adapter, "available", False):
            available.append(name)
    return available

