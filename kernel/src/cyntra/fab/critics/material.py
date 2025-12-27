"""
Material Critic - PBR texture quality validation.

Evaluates generated PBR texture sets for:
- Prompt alignment (CLIP-based semantic matching)
- Tileability (edge continuity when repeated)
- PBR value correctness (metalness 0/1, roughness range, etc.)
- Normal map validity (blue-dominant)
- Artifact detection (magenta, noise, flat regions)

Can also use Claude Vision for deeper quality assessment.

Usage:
    from cyntra.fab.critics.material import MaterialCritic

    critic = MaterialCritic()
    result = critic.evaluate(
        material_dir=Path("fab/materials/materials/terrain/grass_meadow"),
        prompt="lush green grass meadow, seamless tileable",
    )
    print(result.to_dict())
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class TileabilityScore:
    """Tileability check results."""

    horizontal_continuity: float  # 0-1, how well left/right edges match
    vertical_continuity: float  # 0-1, how well top/bottom edges match
    overall: float  # Combined score
    passed: bool


@dataclass
class PBRValidation:
    """PBR map validation results."""

    basecolor_valid: bool
    basecolor_brightness_range: tuple[float, float]
    basecolor_variance: float

    normal_valid: bool
    normal_blue_ratio: float  # Should be > 0.4 for valid normal map

    roughness_valid: bool
    roughness_range: tuple[float, float]
    roughness_variance: float

    metalness_valid: bool
    metalness_binary_ratio: float  # Ratio of pixels at 0 or 1

    height_valid: bool | None  # None if no height map


@dataclass
class MaterialCriticResult:
    """Result from material critic evaluation."""

    score: float  # Aggregate 0-1
    passed: bool
    material_id: str
    prompt: str | None

    tileability: TileabilityScore
    pbr_validation: PBRValidation
    artifact_score: float  # 0-1, higher = cleaner
    alignment_score: float | None  # CLIP similarity if available
    aesthetic_score: float | None  # LAION aesthetic score (1-10 scale, normalized to 0-1)

    fail_codes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "passed": self.passed,
            "material_id": self.material_id,
            "prompt": self.prompt,
            "tileability": {
                "horizontal_continuity": self.tileability.horizontal_continuity,
                "vertical_continuity": self.tileability.vertical_continuity,
                "overall": self.tileability.overall,
                "passed": self.tileability.passed,
            },
            "pbr_validation": {
                "basecolor_valid": self.pbr_validation.basecolor_valid,
                "basecolor_brightness_range": self.pbr_validation.basecolor_brightness_range,
                "basecolor_variance": self.pbr_validation.basecolor_variance,
                "normal_valid": self.pbr_validation.normal_valid,
                "normal_blue_ratio": self.pbr_validation.normal_blue_ratio,
                "roughness_valid": self.pbr_validation.roughness_valid,
                "roughness_range": self.pbr_validation.roughness_range,
                "roughness_variance": self.pbr_validation.roughness_variance,
                "metalness_valid": self.pbr_validation.metalness_valid,
                "metalness_binary_ratio": self.pbr_validation.metalness_binary_ratio,
                "height_valid": self.pbr_validation.height_valid,
            },
            "artifact_score": self.artifact_score,
            "alignment_score": self.alignment_score,
            "aesthetic_score": self.aesthetic_score,
            "fail_codes": self.fail_codes,
            "warnings": self.warnings,
        }


class MaterialCritic:
    """
    PBR material quality critic.

    Validates generated texture sets for game-ready quality.
    Includes CLIP alignment and LAION aesthetic scoring.
    """

    def __init__(
        self,
        tileability_threshold: float = 0.75,
        metalness_binary_threshold: float = 0.7,
        normal_blue_threshold: float = 0.4,
        use_clip: bool = True,
        clip_model: str = "ViT-L/14",
        use_aesthetic: bool = True,
        aesthetic_threshold: float = 0.5,  # Normalized 0-1 (raw score ~5.0)
    ):
        self.tileability_threshold = tileability_threshold
        self.metalness_binary_threshold = metalness_binary_threshold
        self.normal_blue_threshold = normal_blue_threshold
        self.use_clip = use_clip
        self.clip_model = clip_model
        self.use_aesthetic = use_aesthetic
        self.aesthetic_threshold = aesthetic_threshold

        self._clip_loaded = False
        self._model = None
        self._preprocess = None
        self._tokenizer = None

        self._aesthetic_loaded = False
        self._aesthetic_predictor = None

    def _load_clip(self):
        """Lazy load CLIP for alignment checking."""
        if self._clip_loaded or not self.use_clip:
            return

        try:
            import open_clip
            import torch

            model_name = self.clip_model.replace("/", "-")
            self._model, _, self._preprocess = open_clip.create_model_and_transforms(
                model_name, pretrained="openai", device="cpu"
            )
            self._tokenizer = open_clip.get_tokenizer(model_name)
            self._model.eval()
            self._torch = torch
            self._clip_loaded = True
            logger.info(f"Loaded CLIP model: {self.clip_model}")
        except ImportError:
            logger.warning("CLIP not available - skipping alignment check")
            self.use_clip = False
        except Exception as e:
            logger.error(f"Failed to load CLIP: {e}")
            self.use_clip = False

    def _load_aesthetic(self):
        """Lazy load LAION aesthetic predictor."""
        if self._aesthetic_loaded or not self.use_aesthetic:
            return

        try:
            from aesthetics_predictor import AestheticsPredictorV2Linear

            # Load the aesthetic predictor (uses CLIP ViT-L/14 internally)
            self._aesthetic_predictor = AestheticsPredictorV2Linear.from_pretrained(
                "shunk031/aesthetics-predictor-v2-sac-logos-ava1-l14-linearMSE"
            )
            self._aesthetic_predictor.eval()
            self._aesthetic_loaded = True
            logger.info("Loaded LAION Aesthetic Predictor V2")
        except ImportError:
            logger.warning("aesthetics-predictor not available - skipping aesthetic scoring")
            self.use_aesthetic = False
        except Exception as e:
            logger.error(f"Failed to load aesthetic predictor: {e}")
            self.use_aesthetic = False

    def compute_aesthetic(self, image_path: Path) -> float | None:
        """
        Compute LAION aesthetic score for an image.

        Returns score normalized to 0-1 (raw scores are typically 1-10).
        """
        if not self.use_aesthetic:
            return None

        self._load_aesthetic()

        if self._aesthetic_predictor is None:
            return None

        try:
            import torch
            from transformers import CLIPProcessor

            # Load CLIP processor for the predictor
            processor = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")

            img = Image.open(image_path).convert("RGB")
            inputs = processor(images=img, return_tensors="pt")

            with torch.no_grad():
                # The predictor expects pixel_values
                outputs = self._aesthetic_predictor(inputs["pixel_values"])
                # Output is a score typically between 1-10
                raw_score = outputs.logits.squeeze().item()

            # Normalize to 0-1 (assuming raw score range 1-10)
            normalized = max(0.0, min(1.0, (raw_score - 1.0) / 9.0))
            return normalized

        except Exception as e:
            logger.error(f"Aesthetic scoring failed: {e}")
            return None

    def check_tileability(self, image: Image.Image, edge_width: int = 16) -> TileabilityScore:
        """
        Check how well the texture tiles by comparing opposite edges.

        Uses normalized cross-correlation of edge strips.
        """
        arr = np.array(image.convert("RGB")).astype(np.float32) / 255.0

        h, w = arr.shape[:2]

        # Get edge strips
        left_strip = arr[:, :edge_width, :]
        right_strip = arr[:, -edge_width:, :]
        top_strip = arr[:edge_width, :, :]
        bottom_strip = arr[-edge_width:, :, :]

        def edge_similarity(strip1: np.ndarray, strip2: np.ndarray) -> float:
            """Compute similarity between two edge strips."""
            # Flatten and compute correlation
            s1 = strip1.flatten()
            s2 = strip2.flatten()

            # Normalized cross-correlation
            s1_norm = s1 - s1.mean()
            s2_norm = s2 - s2.mean()

            denom = np.sqrt(np.sum(s1_norm**2) * np.sum(s2_norm**2))
            if denom < 1e-6:
                return 1.0  # Both are flat = technically matching

            ncc = np.sum(s1_norm * s2_norm) / denom
            # Convert from [-1, 1] to [0, 1]
            return (ncc + 1) / 2

        h_cont = edge_similarity(left_strip, right_strip)
        v_cont = edge_similarity(top_strip, bottom_strip)
        overall = (h_cont + v_cont) / 2

        return TileabilityScore(
            horizontal_continuity=float(h_cont),
            vertical_continuity=float(v_cont),
            overall=float(overall),
            passed=overall >= self.tileability_threshold,
        )

    def validate_basecolor(self, path: Path) -> tuple[bool, tuple[float, float], float]:
        """Validate basecolor map."""
        try:
            img = Image.open(path).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0

            # Check brightness range (albedo should avoid pure black/white)
            brightness = arr.mean(axis=2)
            min_b, max_b = float(brightness.min()), float(brightness.max())

            # Check variance (not flat)
            variance = float(arr.var())

            # Valid if not too dark, not too bright, has some variance
            valid = min_b > 0.02 and max_b < 0.98 and variance > 0.001

            return valid, (min_b, max_b), variance
        except Exception as e:
            logger.error(f"Failed to validate basecolor: {e}")
            return False, (0.0, 0.0), 0.0

    def validate_normal(self, path: Path) -> tuple[bool, float]:
        """Validate normal map (should have dominant blue channel)."""
        try:
            img = Image.open(path).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0

            # Normal maps should have blue > 0.4 on average (pointing "up")
            blue_channel = arr[:, :, 2]
            blue_ratio = float(blue_channel.mean())

            # Also check it's not flat (all same color)
            variance = float(arr.var())

            valid = blue_ratio > self.normal_blue_threshold and variance > 0.0001

            return valid, blue_ratio
        except Exception as e:
            logger.error(f"Failed to validate normal: {e}")
            return False, 0.0

    def validate_roughness(self, path: Path) -> tuple[bool, tuple[float, float], float]:
        """Validate roughness map."""
        try:
            img = Image.open(path).convert("L")  # Grayscale
            arr = np.array(img).astype(np.float32) / 255.0

            min_r, max_r = float(arr.min()), float(arr.max())
            variance = float(arr.var())

            # Should have some range
            valid = (max_r - min_r) > 0.05 or variance > 0.001

            return valid, (min_r, max_r), variance
        except Exception as e:
            logger.error(f"Failed to validate roughness: {e}")
            return False, (0.0, 0.0), 0.0

    def validate_metalness(self, path: Path) -> tuple[bool, float]:
        """
        Validate metalness map.

        Metalness should be mostly 0 or 1 (binary).
        Mid-values indicate errors.
        """
        try:
            img = Image.open(path).convert("L")
            arr = np.array(img).astype(np.float32) / 255.0

            # Count pixels near 0 or near 1
            near_zero = (arr < 0.1).sum()
            near_one = (arr > 0.9).sum()
            total = arr.size

            binary_ratio = (near_zero + near_one) / total

            valid = binary_ratio >= self.metalness_binary_threshold

            return valid, float(binary_ratio)
        except Exception as e:
            logger.error(f"Failed to validate metalness: {e}")
            return False, 0.0

    def detect_artifacts(self, basecolor_path: Path) -> float:
        """
        Detect common artifacts in the basecolor.

        Returns score 0-1, higher = cleaner.
        """
        try:
            img = Image.open(basecolor_path).convert("RGB")
            arr = np.array(img).astype(np.float32) / 255.0

            score = 1.0

            # Check for magenta (pink) artifacts - missing texture indicator
            r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
            magenta_mask = (r > 0.8) & (g < 0.4) & (b > 0.8)
            magenta_ratio = magenta_mask.sum() / magenta_mask.size
            if magenta_ratio > 0.001:
                score -= min(0.5, magenta_ratio * 50)

            # Check for pure black patches (generation failure)
            black_mask = arr.max(axis=2) < 0.02
            black_ratio = black_mask.sum() / black_mask.shape[0] / black_mask.shape[1]
            if black_ratio > 0.1:
                score -= 0.3

            # Check for pure white patches (overexposed)
            white_mask = arr.min(axis=2) > 0.98
            white_ratio = white_mask.sum() / white_mask.shape[0] / white_mask.shape[1]
            if white_ratio > 0.1:
                score -= 0.2

            return max(0.0, score)
        except Exception as e:
            logger.error(f"Failed to detect artifacts: {e}")
            return 0.5

    def check_alignment(self, basecolor_path: Path, prompt: str) -> float | None:
        """
        Check CLIP alignment between texture and prompt.

        Returns similarity score 0-1, or None if CLIP not available.
        """
        if not self.use_clip:
            return None

        self._load_clip()

        if self._model is None:
            return None

        try:
            img = Image.open(basecolor_path).convert("RGB")
            img_tensor = self._preprocess(img).unsqueeze(0)

            # Encode image and text
            with self._torch.no_grad():
                img_features = self._model.encode_image(img_tensor)
                img_features = img_features / img_features.norm(dim=-1, keepdim=True)

                text_tokens = self._tokenizer([prompt])
                text_features = self._model.encode_text(text_tokens)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)

                similarity = (img_features @ text_features.T).item()

            # Convert from cosine similarity [-1, 1] to score [0, 1]
            return (similarity + 1) / 2

        except Exception as e:
            logger.error(f"CLIP alignment check failed: {e}")
            return None

    def evaluate(
        self,
        material_dir: Path,
        prompt: str | None = None,
        material_id: str | None = None,
    ) -> MaterialCriticResult:
        """
        Evaluate a material directory.

        Args:
            material_dir: Path to material directory containing PBR maps
            prompt: Optional prompt for alignment checking
            material_id: Optional material ID (inferred from dir name if not provided)

        Returns:
            MaterialCriticResult with all validation scores
        """
        material_dir = Path(material_dir)
        if material_id is None:
            material_id = material_dir.name

        fail_codes = []
        warnings = []

        # Find PBR maps
        basecolor_path = material_dir / "basecolor.png"
        normal_path = material_dir / "normal.png"
        roughness_path = material_dir / "roughness.png"
        metalness_path = material_dir / "metalness.png"
        height_path = material_dir / "height.png"

        # Validate basecolor (required)
        if not basecolor_path.exists():
            fail_codes.append("MISSING_BASECOLOR")
            bc_valid, bc_range, bc_var = False, (0.0, 0.0), 0.0
        else:
            bc_valid, bc_range, bc_var = self.validate_basecolor(basecolor_path)
            if not bc_valid:
                warnings.append("BASECOLOR_RANGE_WARNING")

        # Validate normal (required)
        if not normal_path.exists():
            fail_codes.append("MISSING_NORMAL")
            normal_valid, normal_blue = False, 0.0
        else:
            normal_valid, normal_blue = self.validate_normal(normal_path)
            if not normal_valid:
                fail_codes.append("INVALID_NORMAL_MAP")

        # Validate roughness (required)
        if not roughness_path.exists():
            fail_codes.append("MISSING_ROUGHNESS")
            rough_valid, rough_range, rough_var = False, (0.0, 0.0), 0.0
        else:
            rough_valid, rough_range, rough_var = self.validate_roughness(roughness_path)
            if not rough_valid:
                warnings.append("FLAT_ROUGHNESS")

        # Validate metalness (required)
        if not metalness_path.exists():
            fail_codes.append("MISSING_METALNESS")
            metal_valid, metal_binary = False, 0.0
        else:
            metal_valid, metal_binary = self.validate_metalness(metalness_path)
            if not metal_valid:
                warnings.append("NON_BINARY_METALNESS")

        # Validate height (optional)
        height_valid = None
        if height_path.exists():
            # Just check it exists and has variance
            try:
                img = Image.open(height_path).convert("L")
                arr = np.array(img)
                height_valid = arr.var() > 0
            except Exception:
                height_valid = False

        # Check tileability on basecolor
        if basecolor_path.exists():
            try:
                basecolor_img = Image.open(basecolor_path)
                tileability = self.check_tileability(basecolor_img)
                if not tileability.passed:
                    warnings.append("POOR_TILEABILITY")
            except Exception:
                tileability = TileabilityScore(0.0, 0.0, 0.0, False)
                fail_codes.append("TILEABILITY_CHECK_FAILED")
        else:
            tileability = TileabilityScore(0.0, 0.0, 0.0, False)

        # Detect artifacts
        if basecolor_path.exists():
            artifact_score = self.detect_artifacts(basecolor_path)
            if artifact_score < 0.7:
                warnings.append("ARTIFACTS_DETECTED")
        else:
            artifact_score = 0.0

        # Check prompt alignment
        alignment_score = None
        if prompt and basecolor_path.exists():
            alignment_score = self.check_alignment(basecolor_path, prompt)
            if alignment_score is not None and alignment_score < 0.3:
                warnings.append("LOW_PROMPT_ALIGNMENT")

        # Compute aesthetic score
        aesthetic_score = None
        if basecolor_path.exists():
            aesthetic_score = self.compute_aesthetic(basecolor_path)
            if aesthetic_score is not None and aesthetic_score < self.aesthetic_threshold:
                warnings.append("LOW_AESTHETIC_SCORE")

        # Build PBR validation result
        pbr_validation = PBRValidation(
            basecolor_valid=bc_valid,
            basecolor_brightness_range=bc_range,
            basecolor_variance=bc_var,
            normal_valid=normal_valid,
            normal_blue_ratio=normal_blue,
            roughness_valid=rough_valid,
            roughness_range=rough_range,
            roughness_variance=rough_var,
            metalness_valid=metal_valid,
            metalness_binary_ratio=metal_binary,
            height_valid=height_valid,
        )

        # Compute overall score
        scores = []
        if bc_valid:
            scores.append(1.0)
        if normal_valid:
            scores.append(1.0)
        if rough_valid:
            scores.append(0.8)  # Less critical
        if metal_valid:
            scores.append(0.9)
        scores.append(tileability.overall)
        scores.append(artifact_score)
        if alignment_score is not None:
            scores.append(alignment_score)
        if aesthetic_score is not None:
            scores.append(aesthetic_score)

        overall_score = sum(scores) / len(scores) if scores else 0.0

        # Pass if no hard failures and score is decent
        passed = len(fail_codes) == 0 and overall_score >= 0.6

        return MaterialCriticResult(
            score=overall_score,
            passed=passed,
            material_id=material_id,
            prompt=prompt,
            tileability=tileability,
            pbr_validation=pbr_validation,
            artifact_score=artifact_score,
            alignment_score=alignment_score,
            aesthetic_score=aesthetic_score,
            fail_codes=fail_codes,
            warnings=warnings,
        )


def validate_material_library(
    library_root: Path,
    output_path: Path | None = None,
) -> dict[str, Any]:
    """
    Validate all materials in a library.

    Args:
        library_root: Root of material library (containing manifest.json)
        output_path: Optional path to write JSON report

    Returns:
        Dict with validation results for all materials
    """
    critic = MaterialCritic()

    # Load manifest
    manifest_path = library_root / "manifest.json"
    if not manifest_path.exists():
        return {"error": "No manifest.json found", "materials": {}}

    with open(manifest_path) as f:
        manifest = json.load(f)

    results = {}
    passed_count = 0
    failed_count = 0

    for mat_id, mat_info in manifest.get("materials", {}).items():
        mat_path = Path(mat_info.get("library_path", ""))
        prompt = mat_info.get("metadata", {}).get("prompt", "")

        if mat_path.exists():
            result = critic.evaluate(mat_path, prompt=prompt, material_id=mat_id)
            results[mat_id] = result.to_dict()
            if result.passed:
                passed_count += 1
            else:
                failed_count += 1
        else:
            results[mat_id] = {"error": f"Path not found: {mat_path}"}
            failed_count += 1

    summary = {
        "total": len(results),
        "passed": passed_count,
        "failed": failed_count,
        "pass_rate": passed_count / len(results) if results else 0,
        "materials": results,
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(summary, f, indent=2)
        logger.info(f"Wrote validation report to {output_path}")

    return summary


def _json_serialize(obj):
    """Convert numpy types to Python types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _json_serialize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_json_serialize(v) for v in obj]
    elif isinstance(obj, (np.bool_, np.integer)):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m cyntra.fab.critics.material <material_dir> [prompt]")
        sys.exit(1)

    material_dir = Path(sys.argv[1])
    prompt = sys.argv[2] if len(sys.argv) > 2 else None

    critic = MaterialCritic()
    result = critic.evaluate(material_dir, prompt=prompt)

    print(json.dumps(_json_serialize(result.to_dict()), indent=2))
    sys.exit(0 if result.passed else 1)
