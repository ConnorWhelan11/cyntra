"""
Mesh Critic - Quality validation for 3D game assets.

Evaluates meshes for game-readiness including geometry quality,
polygon budgets, UV coverage, and file size constraints.
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class MeshQualityConfig:
    """Configuration for mesh quality thresholds."""

    # Polygon budgets (game-ready targets)
    min_vertices: int = 100
    max_vertices: int = 50000  # For detailed props
    max_vertices_mobile: int = 10000
    max_faces: int = 25000
    max_faces_mobile: int = 5000

    # File size limits (MB)
    max_file_size_mb: float = 10.0
    max_file_size_mb_mobile: float = 2.0

    # Geometry quality
    min_volume: float = 0.0001  # Minimum volume (avoid flat/degenerate meshes)
    max_aspect_ratio: float = 50.0  # Max bounding box aspect ratio

    # Scale (assuming 1 unit = 1 meter)
    min_dimension: float = 0.01  # 1cm minimum
    max_dimension: float = 100.0  # 100m maximum for most assets

    # Quality score weights
    weight_geometry: float = 0.3
    weight_budget: float = 0.3
    weight_scale: float = 0.2
    weight_uvs: float = 0.2


@dataclass
class MeshCritiqueResult:
    """Result of mesh quality evaluation."""

    mesh_path: Path
    overall_score: float  # 0.0 to 1.0
    passed: bool

    # Individual scores (0.0 to 1.0)
    geometry_score: float = 0.0
    budget_score: float = 0.0
    scale_score: float = 0.0
    uv_score: float = 0.0

    # Mesh statistics
    vertices: int = 0
    faces: int = 0
    file_size_bytes: int = 0
    has_uvs: bool = False
    is_manifold: bool = False
    bounds: tuple[float, float, float] = (0.0, 0.0, 0.0)
    volume: float = 0.0

    # Issues found
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mesh_path": str(self.mesh_path),
            "overall_score": round(self.overall_score, 3),
            "passed": self.passed,
            "scores": {
                "geometry": round(self.geometry_score, 3),
                "budget": round(self.budget_score, 3),
                "scale": round(self.scale_score, 3),
                "uvs": round(self.uv_score, 3),
            },
            "stats": {
                "vertices": self.vertices,
                "faces": self.faces,
                "file_size_bytes": self.file_size_bytes,
                "has_uvs": self.has_uvs,
                "is_manifold": self.is_manifold,
                "bounds": self.bounds,
                "volume": round(self.volume, 6),
            },
            "issues": self.issues,
            "warnings": self.warnings,
        }


class MeshCritic:
    """
    Evaluates 3D meshes for game-readiness.

    Checks:
    - Geometry quality (manifold, no degenerate faces)
    - Polygon budget (vertices/faces within limits)
    - Scale/dimensions (reasonable for game use)
    - UV coverage (has UVs for texturing)
    - File size (within budget for target platform)

    Example:
        critic = MeshCritic(MeshQualityConfig())
        result = critic.evaluate(Path("asset.glb"))
        if result.passed:
            print(f"Quality score: {result.overall_score}")
        else:
            print(f"Issues: {result.issues}")
    """

    def __init__(
        self,
        config: MeshQualityConfig | None = None,
        target_platform: str = "desktop",
        passing_threshold: float = 0.6,
    ):
        self.config = config or MeshQualityConfig()
        self.target_platform = target_platform
        self.passing_threshold = passing_threshold

        # Select budget based on platform
        if target_platform == "mobile":
            self._max_vertices = self.config.max_vertices_mobile
            self._max_faces = self.config.max_faces_mobile
            self._max_file_size = self.config.max_file_size_mb_mobile * 1024 * 1024
        else:
            self._max_vertices = self.config.max_vertices
            self._max_faces = self.config.max_faces
            self._max_file_size = self.config.max_file_size_mb * 1024 * 1024

    def evaluate(self, mesh_path: Path) -> MeshCritiqueResult:
        """
        Evaluate a mesh file for quality.

        Args:
            mesh_path: Path to GLB/GLTF file

        Returns:
            MeshCritiqueResult with scores and issues
        """
        result = MeshCritiqueResult(
            mesh_path=mesh_path,
            overall_score=0.0,
            passed=False,
        )

        if not mesh_path.exists():
            result.issues.append(f"File not found: {mesh_path}")
            return result

        # Get file size
        result.file_size_bytes = mesh_path.stat().st_size

        try:
            import trimesh

            mesh = trimesh.load(str(mesh_path))
            result = self._evaluate_with_trimesh(mesh, result)

            # Fallback: check GLTF structure directly for UVs
            # (trimesh sometimes doesn't load UVs correctly)
            if not result.has_uvs and mesh_path.suffix.lower() in [".glb", ".gltf"]:
                result.has_uvs = self._check_gltf_uvs(mesh_path)
                if result.has_uvs:
                    # Recalculate UV score and remove false warning
                    result.uv_score = 1.0
                    result.warnings = [w for w in result.warnings if "UV coordinates" not in w]

        except ImportError:
            logger.warning("trimesh not installed - using basic evaluation")
            result = self._evaluate_basic(result)

        except Exception as e:
            result.issues.append(f"Failed to load mesh: {e}")
            logger.error("Mesh evaluation failed", path=str(mesh_path), error=str(e))

        # Calculate overall score
        result.overall_score = (
            result.geometry_score * self.config.weight_geometry
            + result.budget_score * self.config.weight_budget
            + result.scale_score * self.config.weight_scale
            + result.uv_score * self.config.weight_uvs
        )

        result.passed = result.overall_score >= self.passing_threshold and len(result.issues) == 0

        logger.info(
            "Mesh evaluation complete",
            path=str(mesh_path),
            score=round(result.overall_score, 3),
            passed=result.passed,
            vertices=result.vertices,
            faces=result.faces,
        )

        return result

    def _evaluate_with_trimesh(self, mesh: Any, result: MeshCritiqueResult) -> MeshCritiqueResult:
        """Evaluate mesh using trimesh library."""
        import numpy as np

        # Handle scene vs single mesh
        if hasattr(mesh, "geometry"):
            # Scene with multiple meshes - combine stats
            all_verts = 0
            all_faces = 0
            combined_bounds_min = np.array([np.inf, np.inf, np.inf])
            combined_bounds_max = np.array([-np.inf, -np.inf, -np.inf])
            has_uvs = False
            is_manifold = True
            total_volume = 0.0

            for geom in mesh.geometry.values():
                if hasattr(geom, "vertices"):
                    all_verts += len(geom.vertices)
                if hasattr(geom, "faces"):
                    all_faces += len(geom.faces)
                if hasattr(geom, "bounds") and geom.bounds is not None:
                    combined_bounds_min = np.minimum(combined_bounds_min, geom.bounds[0])
                    combined_bounds_max = np.maximum(combined_bounds_max, geom.bounds[1])
                if (
                    hasattr(geom, "visual")
                    and hasattr(geom.visual, "uv")
                    and geom.visual.uv is not None
                ):
                    has_uvs = True
                if hasattr(geom, "is_watertight") and not geom.is_watertight:
                    is_manifold = False
                if hasattr(geom, "volume"):
                    with contextlib.suppress(Exception):
                        total_volume += abs(geom.volume)

            result.vertices = all_verts
            result.faces = all_faces
            bounds_size = combined_bounds_max - combined_bounds_min
            result.bounds = tuple(bounds_size.tolist())
            result.has_uvs = has_uvs
            result.is_manifold = is_manifold
            result.volume = total_volume

        else:
            # Single mesh
            result.vertices = len(mesh.vertices) if hasattr(mesh, "vertices") else 0
            result.faces = len(mesh.faces) if hasattr(mesh, "faces") else 0

            if hasattr(mesh, "bounds") and mesh.bounds is not None:
                bounds_size = mesh.bounds[1] - mesh.bounds[0]
                result.bounds = tuple(bounds_size.tolist())

            if hasattr(mesh, "visual") and hasattr(mesh.visual, "uv"):
                result.has_uvs = mesh.visual.uv is not None

            if hasattr(mesh, "is_watertight"):
                result.is_manifold = mesh.is_watertight

            if hasattr(mesh, "volume"):
                try:
                    result.volume = abs(mesh.volume)
                except Exception:
                    result.volume = 0.0

        # Score geometry quality
        result.geometry_score = self._score_geometry(result)

        # Score polygon budget
        result.budget_score = self._score_budget(result)

        # Score scale/dimensions
        result.scale_score = self._score_scale(result)

        # Score UV coverage
        result.uv_score = self._score_uvs(result)

        return result

    def _check_gltf_uvs(self, mesh_path: Path) -> bool:
        """Check if GLB/GLTF file has UV coordinates by parsing structure."""
        import json
        import struct

        try:
            with open(mesh_path, "rb") as f:
                # GLB header
                magic = f.read(4)
                if magic != b"glTF":
                    return False

                _version = struct.unpack("<I", f.read(4))[0]
                _length = struct.unpack("<I", f.read(4))[0]

                # First chunk (JSON)
                chunk_length = struct.unpack("<I", f.read(4))[0]
                _chunk_type = f.read(4)
                json_data = f.read(chunk_length)

                gltf = json.loads(json_data)

                # Check mesh primitives for TEXCOORD_0
                for mesh in gltf.get("meshes", []):
                    for prim in mesh.get("primitives", []):
                        attrs = prim.get("attributes", {})
                        if "TEXCOORD_0" in attrs:
                            return True

        except Exception:
            pass

        return False

    def _evaluate_basic(self, result: MeshCritiqueResult) -> MeshCritiqueResult:
        """Basic evaluation without trimesh (file size only)."""
        result.warnings.append("Detailed mesh analysis unavailable (trimesh not installed)")

        # Score based on file size only
        if result.file_size_bytes > self._max_file_size:
            result.issues.append(
                f"File size ({result.file_size_bytes / 1024 / 1024:.1f}MB) "
                f"exceeds limit ({self._max_file_size / 1024 / 1024:.1f}MB)"
            )
            result.budget_score = 0.5
        else:
            # Score based on how close to limit
            ratio = result.file_size_bytes / self._max_file_size
            result.budget_score = 1.0 - (ratio * 0.5)  # 50% at limit, 100% at 0

        # Default scores for unknown aspects
        result.geometry_score = 0.5  # Unknown
        result.scale_score = 0.5  # Unknown
        result.uv_score = 0.5  # Unknown

        return result

    def _score_geometry(self, result: MeshCritiqueResult) -> float:
        """Score geometry quality (0.0 to 1.0)."""
        score = 1.0

        # Penalize non-manifold meshes
        if not result.is_manifold:
            score -= 0.3
            result.warnings.append("Mesh is not watertight (non-manifold)")

        # Check for degenerate mesh (very low vertex count)
        if result.vertices < self.config.min_vertices:
            score -= 0.4
            result.issues.append(
                f"Too few vertices ({result.vertices}) - minimum is {self.config.min_vertices}"
            )

        # Check volume (avoid flat meshes)
        if result.volume < self.config.min_volume:
            score -= 0.2
            result.warnings.append("Mesh has very low volume (may be flat or degenerate)")

        # Check aspect ratio
        if result.bounds:
            dims = sorted(result.bounds)
            if dims[0] > 0:
                aspect = dims[2] / dims[0]
                if aspect > self.config.max_aspect_ratio:
                    score -= 0.1
                    result.warnings.append(f"High aspect ratio ({aspect:.1f})")

        return max(0.0, score)

    def _score_budget(self, result: MeshCritiqueResult) -> float:
        """Score polygon budget compliance (0.0 to 1.0)."""
        score = 1.0

        # Check vertex count
        if result.vertices > self._max_vertices:
            excess = (result.vertices - self._max_vertices) / self._max_vertices
            score -= min(0.5, excess * 0.5)
            result.issues.append(
                f"Vertex count ({result.vertices}) exceeds limit ({self._max_vertices})"
            )
        elif result.vertices > self._max_vertices * 0.8:
            result.warnings.append(
                f"Vertex count ({result.vertices}) approaching limit ({self._max_vertices})"
            )

        # Check face count
        if result.faces > self._max_faces:
            excess = (result.faces - self._max_faces) / self._max_faces
            score -= min(0.5, excess * 0.5)
            result.issues.append(f"Face count ({result.faces}) exceeds limit ({self._max_faces})")

        # Check file size
        if result.file_size_bytes > self._max_file_size:
            excess = (result.file_size_bytes - self._max_file_size) / self._max_file_size
            score -= min(0.3, excess * 0.3)
            size_mb = result.file_size_bytes / 1024 / 1024
            limit_mb = self._max_file_size / 1024 / 1024
            result.issues.append(f"File size ({size_mb:.1f}MB) exceeds limit ({limit_mb:.1f}MB)")

        return max(0.0, score)

    def _score_scale(self, result: MeshCritiqueResult) -> float:
        """Score scale/dimensions (0.0 to 1.0)."""
        score = 1.0

        if not result.bounds or all(d == 0 for d in result.bounds):
            result.warnings.append("Could not determine mesh bounds")
            return 0.5

        max_dim = max(result.bounds)
        min_dim = min(d for d in result.bounds if d > 0) if any(d > 0 for d in result.bounds) else 0

        # Check minimum dimension
        if min_dim < self.config.min_dimension:
            score -= 0.2
            result.warnings.append(
                f"Very small dimension ({min_dim:.4f}m) - may be too small for games"
            )

        # Check maximum dimension
        if max_dim > self.config.max_dimension:
            score -= 0.3
            result.warnings.append(f"Very large dimension ({max_dim:.1f}m) - may need scaling")

        return max(0.0, score)

    def _score_uvs(self, result: MeshCritiqueResult) -> float:
        """Score UV coverage (0.0 to 1.0)."""
        if result.has_uvs:
            return 1.0
        else:
            result.warnings.append("Mesh does not have UV coordinates (cannot be textured)")
            return 0.3  # Untextured meshes can still be valid for some uses


def evaluate_mesh(
    mesh_path: Path,
    target_platform: str = "desktop",
    passing_threshold: float = 0.6,
) -> MeshCritiqueResult:
    """
    Convenience function to evaluate a mesh.

    Args:
        mesh_path: Path to GLB/GLTF file
        target_platform: "desktop" or "mobile"
        passing_threshold: Minimum score to pass (0.0 to 1.0)

    Returns:
        MeshCritiqueResult with scores and issues
    """
    critic = MeshCritic(target_platform=target_platform, passing_threshold=passing_threshold)
    return critic.evaluate(mesh_path)
