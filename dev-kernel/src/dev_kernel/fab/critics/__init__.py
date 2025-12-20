"""
Fab Critics - Multi-signal evaluation for 3D assets.

Critics analyze renders and mesh data to produce structured scores and failure codes.
Each critic is deterministic, versioned, and produces auditable results.

Available Critics:
- CategoryCritic: Multi-view semantic classification (is it a car?)
- AlignmentCritic: Text-to-image similarity (does it match the prompt?)
- RealismCritic: Image quality and visual plausibility
- GeometryCritic: Mesh analysis and structural validation
- FurnitureCritic: (optional) Library furniture presence and distribution
- StructuralRhythmCritic: (optional) Gothic bay spacing and symmetry
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .alignment import AlignmentCritic, AlignmentResult
from .category import CategoryCritic, CategoryResult
from .geometry import GeometryCritic, GeometryResult
from .realism import RealismCritic, RealismResult

if TYPE_CHECKING:
    from .furniture import FurnitureCritic as FurnitureCritic
    from .structural_rhythm import StructuralRhythmCritic as StructuralRhythmCritic

try:
    from .furniture import FurnitureCritic
except ModuleNotFoundError:
    FurnitureCritic = None  # type: ignore[assignment]

try:
    from .structural_rhythm import StructuralRhythmCritic
except ModuleNotFoundError:
    StructuralRhythmCritic = None  # type: ignore[assignment]

__all__ = [
    # Category
    "CategoryCritic",
    "CategoryResult",
    # Alignment
    "AlignmentCritic",
    "AlignmentResult",
    # Realism
    "RealismCritic",
    "RealismResult",
    # Geometry
    "GeometryCritic",
    "GeometryResult",
]

if FurnitureCritic is not None:
    __all__.append("FurnitureCritic")
if StructuralRhythmCritic is not None:
    __all__.append("StructuralRhythmCritic")
