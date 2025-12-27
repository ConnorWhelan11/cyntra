"""
Furniture Presence Critic - Validate furniture in library interiors.

Checks for presence and distribution of library furniture:
- Desks/tables for study
- Chairs for seating
- Shelves/bookcases for storage
"""

from pathlib import Path
from typing import Any

import numpy as np
import trimesh


class FurnitureCritic:
    """Validates furniture presence and placement in library scenes."""

    def __init__(self, config: dict[str, Any]):
        """
        Initialize critic.

        Args:
            config: furniture_presence section from gate config
        """
        self.config = config
        self.enabled = config.get("enabled", True)
        self.required_types = config.get("required_types", ["desk", "chair", "shelf"])
        self.min_furniture_count = config.get("min_furniture_count", 5)

    def evaluate(self, glb_path: Path, *, scene: Any | None = None) -> dict[str, Any]:
        """
        Evaluate furniture presence in the scene.

        Args:
            glb_path: Path to GLB file

        Returns:
            {
                "pass": bool,
                "score": float (0-1),
                "metadata": {...},
                "failures": [...],
            }
        """
        if not self.enabled:
            return {
                "pass": True,
                "score": 1.0,
                "metadata": {"skipped": True},
                "failures": [],
            }

        failures = []
        metadata = {}

        try:
            loaded_scene = scene or trimesh.load(str(glb_path), force="scene")

            # Extract furniture objects by name patterns
            furniture_objects = self._detect_furniture(loaded_scene)

            metadata["total_furniture"] = len(furniture_objects)
            metadata["furniture_by_type"] = {
                ftype: len([f for f in furniture_objects if f["type"] == ftype])
                for ftype in self.required_types
            }

            # Check minimum count
            if len(furniture_objects) < self.min_furniture_count:
                failures.append(
                    {
                        "code": "FURNITURE_TOO_FEW",
                        "message": f"Only {len(furniture_objects)} furniture objects found, need {self.min_furniture_count}",
                        "severity": "error",
                    }
                )

            # Check for required types
            found_types = {f["type"] for f in furniture_objects}
            missing_types = set(self.required_types) - found_types

            if missing_types:
                failures.append(
                    {
                        "code": "FURNITURE_TYPE_MISSING",
                        "message": f"Missing furniture types: {', '.join(missing_types)}",
                        "severity": "warning",
                    }
                )

            # Check spatial distribution (avoid clustering)
            if len(furniture_objects) >= 3:
                distribution_score = self._check_distribution(furniture_objects)
                metadata["spatial_distribution"] = distribution_score

                if distribution_score < 0.3:
                    failures.append(
                        {
                            "code": "FURNITURE_CLUSTERED",
                            "message": "Furniture is too clustered, should be distributed",
                            "severity": "warning",
                        }
                    )

            # Calculate score
            score = self._calculate_score(
                furniture_count=len(furniture_objects),
                found_types=found_types,
                failures=failures,
            )

            metadata["furniture_objects"] = furniture_objects[:10]  # Sample

            return {
                "pass": len(failures) == 0 or all(f["severity"] != "error" for f in failures),
                "score": score,
                "metadata": metadata,
                "failures": failures,
            }

        except Exception as e:
            return {
                "pass": False,
                "score": 0.0,
                "metadata": {"error": str(e)},
                "failures": [
                    {
                        "code": "FURNITURE_EVAL_ERROR",
                        "message": f"Failed to evaluate furniture: {e}",
                        "severity": "error",
                    }
                ],
            }

    def _detect_furniture(self, scene) -> list[dict[str, Any]]:
        """
        Detect furniture objects in scene by name patterns.

        Returns:
            List of {"name": str, "type": str, "bounds": bbox, "center": xyz}
        """
        furniture = []

        # Patterns for detecting furniture types
        patterns = {
            "desk": ["desk", "table", "workstation", "study"],
            "chair": ["chair", "seat", "stool", "bench"],
            "shelf": ["shelf", "bookcase", "bookshelf", "cabinet"],
        }

        # Iterate through scene geometries
        geometries = scene.geometry if hasattr(scene, "geometry") else {"main": scene}

        for name, geometry in geometries.items():
            name_lower = name.lower()

            # Check against patterns
            furniture_type = None
            for ftype, keywords in patterns.items():
                if any(keyword in name_lower for keyword in keywords):
                    furniture_type = ftype
                    break

            if furniture_type and hasattr(geometry, "bounds"):
                bounds = geometry.bounds
                center = (bounds[0] + bounds[1]) / 2

                furniture.append(
                    {
                        "name": name,
                        "type": furniture_type,
                        "bounds": bounds.tolist(),
                        "center": center.tolist(),
                    }
                )

        return furniture

    def _check_distribution(self, furniture_objects: list[dict[str, Any]]) -> float:
        """
        Check spatial distribution of furniture.

        Returns:
            Score 0-1 (1 = well distributed, 0 = clustered)
        """
        if len(furniture_objects) < 3:
            return 1.0

        # Get centers
        centers = np.array([f["center"] for f in furniture_objects])

        # Calculate pairwise distances
        from scipy.spatial.distance import pdist

        distances = pdist(centers)

        if len(distances) == 0:
            return 1.0

        # Check coefficient of variation (low = clustered, high = distributed)
        mean_dist = np.mean(distances)
        std_dist = np.std(distances)

        if mean_dist == 0:
            return 0.0

        cv = std_dist / mean_dist

        # Normalize CV to 0-1 score (cv > 0.5 is good distribution)
        score = min(1.0, cv / 0.5)

        return score

    def _calculate_score(
        self,
        furniture_count: int,
        found_types: set,
        failures: list[dict[str, Any]],
    ) -> float:
        """Calculate overall score."""
        # Base score from count (0-1 normalized)
        count_score = min(1.0, furniture_count / (self.min_furniture_count * 2))

        # Type coverage score
        type_score = len(found_types) / len(self.required_types) if self.required_types else 1.0

        # Penalty for failures
        error_count = sum(1 for f in failures if f["severity"] == "error")
        warning_count = sum(1 for f in failures if f["severity"] == "warning")

        failure_penalty = (error_count * 0.3) + (warning_count * 0.1)

        score = (count_score * 0.5 + type_score * 0.5) - failure_penalty

        return max(0.0, min(1.0, score))
