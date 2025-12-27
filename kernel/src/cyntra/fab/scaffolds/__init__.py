"""
Fab Scaffolds - Procedural parametric asset generation.

This module provides:
1. Geometry Nodes-based parametric rigs (Blender native)
2. Sverchok-based advanced procedural tools (optional addon)
3. Parameter constraints and validation
4. Scaffold versioning and drift prevention
"""

from .base import ParameterType, ScaffoldBase, ScaffoldParameter, ScaffoldResult
from .car_scaffold import CarScaffold, CarScaffoldParams
from .registry import ScaffoldRegistry, get_registry, get_scaffold, list_scaffolds
from .study_pod import StudyPodScaffold, create_study_pod
from .sverchok import (
    MIN_SVERCHOK_VERSION,
    CarSverchokScaffold,
    SverchokConfig,
    SverchokNodeLibrary,
    SverchokNodeTree,
    SverchokScaffold,
    generate_sverchok_check_script,
)

__all__ = [
    # Base
    "ScaffoldBase",
    "ScaffoldParameter",
    "ScaffoldResult",
    "ParameterType",
    # Car scaffolds
    "CarScaffold",
    "CarScaffoldParams",
    # Study pod scaffold
    "StudyPodScaffold",
    "create_study_pod",
    # Registry
    "ScaffoldRegistry",
    "get_scaffold",
    "get_registry",
    "list_scaffolds",
    # Sverchok
    "SverchokScaffold",
    "SverchokConfig",
    "SverchokNodeTree",
    "CarSverchokScaffold",
    "SverchokNodeLibrary",
    "generate_sverchok_check_script",
    "MIN_SVERCHOK_VERSION",
]
