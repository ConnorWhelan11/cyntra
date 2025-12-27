"""
Structural Rhythm Critic - Validate Gothic architectural bay spacing.

Checks for consistent spacing of structural elements:
- Column/pier placement
- Bay rhythm (typically 6m for Gothic libraries)
- Symmetry in layout
"""

from pathlib import Path
from typing import Any

import numpy as np
import trimesh


class StructuralRhythmCritic:
    """Validates structural bay spacing in Gothic architecture."""

    def __init__(self, config: dict[str, Any]):
        """
        Initialize critic.

        Args:
            config: structural_rhythm section from gate config
        """
        self.config = config
        self.enabled = config.get("enabled", True)
        self.expected_bay_size = config.get("expected_bay_size", 6.0)  # meters
        self.tolerance = config.get("column_spacing_tolerance", 0.3)  # 30%

    def evaluate(self, glb_path: Path, *, scene: Any | None = None) -> dict[str, Any]:
        """
        Evaluate structural rhythm in the scene.

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

            # Detect columns/piers
            columns = self._detect_columns(loaded_scene)

            if len(columns) < 2:
                failures.append(
                    {
                        "code": "RHYTHM_NO_COLUMNS",
                        "message": f"Found only {len(columns)} columns, need at least 2 for rhythm analysis",
                        "severity": "warning",
                    }
                )
                return {
                    "pass": False,
                    "score": 0.5,
                    "metadata": {"column_count": len(columns)},
                    "failures": failures,
                }

            metadata["column_count"] = len(columns)
            metadata["column_positions"] = [c["position"] for c in columns]

            # Analyze spacing
            spacing_analysis = self._analyze_spacing(columns)

            metadata.update(spacing_analysis)

            # Check bay rhythm consistency
            mean_spacing = spacing_analysis.get("mean_spacing", 0)
            spacing_variance = spacing_analysis.get("spacing_variance", 0)

            # Expected range
            min_bay = self.expected_bay_size * (1 - self.tolerance)
            max_bay = self.expected_bay_size * (1 + self.tolerance)

            if not (min_bay <= mean_spacing <= max_bay):
                failures.append(
                    {
                        "code": "RHYTHM_BAY_SIZE_OFF",
                        "message": f"Mean bay spacing {mean_spacing:.1f}m outside expected range {min_bay:.1f}-{max_bay:.1f}m",
                        "severity": "warning",
                    }
                )

            # Check consistency (low variance = good rhythm)
            if spacing_variance > (self.expected_bay_size * 0.5):
                failures.append(
                    {
                        "code": "RHYTHM_INCONSISTENT",
                        "message": f"High spacing variance {spacing_variance:.1f}m indicates irregular rhythm",
                        "severity": "warning",
                    }
                )

            # Check symmetry
            symmetry_score = self._check_symmetry(columns)
            metadata["symmetry_score"] = symmetry_score

            if symmetry_score < 0.6:
                failures.append(
                    {
                        "code": "RHYTHM_ASYMMETRIC",
                        "message": f"Low symmetry score {symmetry_score:.2f}, Gothic architecture should be symmetric",
                        "severity": "info",
                    }
                )

            # Calculate score
            score = self._calculate_score(
                mean_spacing=mean_spacing,
                spacing_variance=spacing_variance,
                symmetry_score=symmetry_score,
                failures=failures,
            )

            return {
                "pass": len([f for f in failures if f["severity"] == "error"]) == 0,
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
                        "code": "RHYTHM_EVAL_ERROR",
                        "message": f"Failed to evaluate structural rhythm: {e}",
                        "severity": "error",
                    }
                ],
            }

    def _detect_columns(self, scene) -> list[dict[str, Any]]:
        """
        Detect column/pier objects in scene.

        Returns:
            List of {"name": str, "position": [x,y,z], "height": float}
        """
        columns = []

        # Patterns for detecting columns
        column_keywords = ["column", "pier", "pillar", "post", "support"]

        # Iterate through scene geometries
        geometries = scene.geometry if hasattr(scene, "geometry") else {"main": scene}

        for name, geometry in geometries.items():
            name_lower = name.lower()

            # Check for column keywords
            is_column = any(keyword in name_lower for keyword in column_keywords)

            # Also detect by geometry: tall, narrow objects
            if not is_column and hasattr(geometry, "bounds"):
                bounds = geometry.bounds
                dims = bounds[1] - bounds[0]
                height = dims[2]
                width = max(dims[0], dims[1])

                # Heuristic: height > 3m, width < 2m, aspect ratio > 3
                if height > 3.0 and width < 2.0 and height / width > 3:
                    is_column = True

            if is_column and hasattr(geometry, "bounds"):
                bounds = geometry.bounds
                center = (bounds[0] + bounds[1]) / 2
                height = bounds[1][2] - bounds[0][2]

                columns.append(
                    {
                        "name": name,
                        "position": center.tolist(),
                        "height": float(height),
                    }
                )

        return columns

    def _analyze_spacing(self, columns: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Analyze spacing between columns.

        Returns:
            {
                "mean_spacing": float,
                "spacing_variance": float,
                "spacings": List[float],
            }
        """
        if len(columns) < 2:
            return {
                "mean_spacing": 0.0,
                "spacing_variance": 0.0,
                "spacings": [],
            }

        # Get 2D positions (x, y) for plan view analysis
        positions_2d = np.array([[c["position"][0], c["position"][1]] for c in columns])

        # Sort by x-coordinate to get sequential spacing
        sorted_indices = np.argsort(positions_2d[:, 0])
        sorted_positions = positions_2d[sorted_indices]

        # Calculate distances between adjacent columns
        spacings = []
        for i in range(len(sorted_positions) - 1):
            dist = np.linalg.norm(sorted_positions[i + 1] - sorted_positions[i])
            spacings.append(float(dist))

        mean_spacing = np.mean(spacings) if spacings else 0.0
        spacing_variance = np.std(spacings) if spacings else 0.0

        return {
            "mean_spacing": float(mean_spacing),
            "spacing_variance": float(spacing_variance),
            "spacings": spacings,
        }

    def _check_symmetry(self, columns: list[dict[str, Any]]) -> float:
        """
        Check symmetry of column placement.

        Returns:
            Symmetry score 0-1 (1 = perfectly symmetric)
        """
        if len(columns) < 4:
            return 1.0  # Too few to check symmetry

        # Get 2D positions
        positions_2d = np.array([[c["position"][0], c["position"][1]] for c in columns])

        # Find center of mass
        center = np.mean(positions_2d, axis=0)

        # For each column, find nearest mirror across center
        symmetry_errors = []

        for pos in positions_2d:
            # Mirror position across center
            mirrored = 2 * center - pos

            # Find closest actual column to mirrored position
            distances = np.linalg.norm(positions_2d - mirrored, axis=1)
            min_dist = np.min(distances)

            symmetry_errors.append(min_dist)

        # Average error normalized by typical spacing
        mean_error = np.mean(symmetry_errors)
        typical_spacing = np.mean(np.linalg.norm(positions_2d - center, axis=1))

        if typical_spacing == 0:
            return 0.0

        # Score: 1 - (error / spacing), clamped to 0-1
        symmetry_score = max(0.0, 1.0 - (mean_error / typical_spacing))

        return float(symmetry_score)

    def _calculate_score(
        self,
        mean_spacing: float,
        spacing_variance: float,
        symmetry_score: float,
        failures: list[dict[str, Any]],
    ) -> float:
        """Calculate overall structural rhythm score."""
        # Spacing accuracy (how close to expected bay size)
        min_bay = self.expected_bay_size * (1 - self.tolerance)
        max_bay = self.expected_bay_size * (1 + self.tolerance)

        if min_bay <= mean_spacing <= max_bay:
            spacing_score = 1.0
        else:
            # Penalize deviation
            deviation = min(abs(mean_spacing - min_bay), abs(mean_spacing - max_bay))
            spacing_score = max(0.0, 1.0 - (deviation / self.expected_bay_size))

        # Consistency score (low variance = good)
        max_acceptable_variance = self.expected_bay_size * 0.3
        consistency_score = max(0.0, 1.0 - (spacing_variance / max_acceptable_variance))

        # Weighted combination
        score = spacing_score * 0.4 + consistency_score * 0.4 + symmetry_score * 0.2

        # Penalty for failures
        error_count = sum(1 for f in failures if f["severity"] == "error")
        warning_count = sum(1 for f in failures if f["severity"] == "warning")

        failure_penalty = (error_count * 0.3) + (warning_count * 0.1)

        final_score = max(0.0, min(1.0, score - failure_penalty))

        return final_score
