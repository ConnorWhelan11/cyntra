#!/usr/bin/env python3
"""
Backbay Imperium Quality Gate Runner

Run quality checks on generated assets based on gate configs.
This is a lightweight validator that checks basic criteria without requiring
the full ML models (CLIP, etc.) - those are checked in the full fab-gate.

Usage:
    python scripts/run_quality_gates.py --all
    python scripts/run_quality_gates.py --materials
    python scripts/run_quality_gates.py --buildings
    python scripts/run_quality_gates.py --terrain
"""

from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Asset directories
ASSETS_DIR = Path(__file__).parent.parent / "assets"
MATERIALS_DIR = ASSETS_DIR / "materials"
BUILDINGS_DIR = ASSETS_DIR / "buildings"
TERRAIN_DIR = ASSETS_DIR / "terrain"
OUTPUT_DIR = Path(__file__).parent.parent / "quality_reports"


@dataclass
class CheckResult:
    """Result of a single quality check."""
    name: str
    passed: bool
    score: float
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class AssetReport:
    """Quality report for a single asset."""
    asset_id: str
    asset_type: str
    file_path: str
    checks: list[CheckResult] = field(default_factory=list)
    overall_passed: bool = False
    overall_score: float = 0.0
    hard_fails: list[str] = field(default_factory=list)


def get_image_dimensions(path: Path) -> tuple[int, int] | None:
    """Get PNG image dimensions without PIL."""
    try:
        with open(path, "rb") as f:
            header = f.read(24)
            if header[:8] != b"\x89PNG\r\n\x1a\n":
                return None
            w, h = struct.unpack(">II", header[16:24])
            return (w, h)
    except Exception:
        return None


def check_material_set(mat_id: str) -> AssetReport:
    """Check a material has all required PBR maps."""
    report = AssetReport(
        asset_id=mat_id,
        asset_type="material",
        file_path=str(MATERIALS_DIR / f"{mat_id}_basecolor.png"),
    )

    # Required maps
    required = ["basecolor", "normal", "roughness", "height"]
    optional = ["metalness"]

    found_maps = []
    missing_maps = []

    for map_type in required:
        map_path = MATERIALS_DIR / f"{mat_id}_{map_type}.png"
        if map_path.exists() and map_path.stat().st_size > 10000:
            found_maps.append(map_type)
        else:
            missing_maps.append(map_type)

    # Completeness check
    completeness_score = len(found_maps) / len(required)
    report.checks.append(CheckResult(
        name="completeness",
        passed=len(missing_maps) == 0,
        score=completeness_score,
        message=f"Found {len(found_maps)}/{len(required)} required maps",
        details={"found": found_maps, "missing": missing_maps}
    ))

    if "basecolor" in missing_maps:
        report.hard_fails.append("MISSING_BASECOLOR")

    # Resolution check
    basecolor_path = MATERIALS_DIR / f"{mat_id}_basecolor.png"
    if basecolor_path.exists():
        dims = get_image_dimensions(basecolor_path)
        if dims:
            w, h = dims
            resolution_ok = w >= 1024 and h >= 1024
            report.checks.append(CheckResult(
                name="resolution",
                passed=resolution_ok,
                score=1.0 if resolution_ok else 0.5,
                message=f"Resolution: {w}x{h}",
                details={"width": w, "height": h, "min_required": 1024}
            ))
            if not resolution_ok:
                report.hard_fails.append("RESOLUTION_TOO_LOW")

    # File size check (proxy for quality)
    total_size = 0
    for map_type in found_maps:
        map_path = MATERIALS_DIR / f"{mat_id}_{map_type}.png"
        if map_path.exists():
            total_size += map_path.stat().st_size

    size_mb = total_size / (1024 * 1024)
    size_ok = size_mb > 1.0  # Expect at least 1MB total for quality textures
    report.checks.append(CheckResult(
        name="file_quality",
        passed=size_ok,
        score=min(1.0, size_mb / 2.0),
        message=f"Total size: {size_mb:.2f}MB",
        details={"total_bytes": total_size}
    ))

    # Calculate overall score
    if report.checks:
        report.overall_score = sum(c.score for c in report.checks) / len(report.checks)
        report.overall_passed = len(report.hard_fails) == 0 and report.overall_score >= 0.55

    return report


def check_building_mesh(building_id: str) -> AssetReport:
    """Check a building 3D mesh."""
    mesh_path = BUILDINGS_DIR / "meshes" / f"{building_id}.glb"
    ref_path = BUILDINGS_DIR / f"{building_id}_ref.png"

    report = AssetReport(
        asset_id=building_id,
        asset_type="building_mesh",
        file_path=str(mesh_path),
    )

    # File exists check
    if not mesh_path.exists():
        report.checks.append(CheckResult(
            name="file_exists",
            passed=False,
            score=0.0,
            message="GLB file not found"
        ))
        report.hard_fails.append("MESH_MISSING")
        return report

    # File size check (minimum 3KB for valid mesh)
    file_size = mesh_path.stat().st_size
    size_ok = file_size >= 3000
    report.checks.append(CheckResult(
        name="file_size",
        passed=size_ok,
        score=1.0 if size_ok else 0.2,
        message=f"File size: {file_size} bytes",
        details={"size_bytes": file_size, "min_required": 3000}
    ))

    if not size_ok:
        report.hard_fails.append("FILE_TOO_SMALL")

    # Quality tier based on size
    if file_size > 100000:
        quality_tier = "high"
        quality_score = 1.0
    elif file_size > 20000:
        quality_tier = "medium"
        quality_score = 0.7
    elif file_size > 5000:
        quality_tier = "low"
        quality_score = 0.5
    else:
        quality_tier = "minimal"
        quality_score = 0.2

    report.checks.append(CheckResult(
        name="mesh_quality",
        passed=quality_tier in ["high", "medium"],
        score=quality_score,
        message=f"Quality tier: {quality_tier}",
        details={"tier": quality_tier, "size_bytes": file_size}
    ))

    # Reference image check
    ref_exists = ref_path.exists()
    report.checks.append(CheckResult(
        name="reference_exists",
        passed=ref_exists,
        score=1.0 if ref_exists else 0.0,
        message=f"Reference image: {'found' if ref_exists else 'missing'}"
    ))

    # Calculate overall
    if report.checks:
        report.overall_score = sum(c.score for c in report.checks) / len(report.checks)
        report.overall_passed = len(report.hard_fails) == 0 and report.overall_score >= 0.55

    return report


def check_terrain_sprites(terrain_id: str) -> AssetReport:
    """Check terrain sprite set (8 angles)."""
    sprites_dir = TERRAIN_DIR / "sprites"
    angles = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]

    report = AssetReport(
        asset_id=terrain_id,
        asset_type="terrain_sprite",
        file_path=str(sprites_dir / f"{terrain_id}_north.png"),
    )

    # Check all 8 angles
    found_angles = []
    missing_angles = []
    total_size = 0

    for angle in angles:
        sprite_path = sprites_dir / f"{terrain_id}_{angle}.png"
        if sprite_path.exists() and sprite_path.stat().st_size > 10000:
            found_angles.append(angle)
            total_size += sprite_path.stat().st_size
        else:
            missing_angles.append(angle)

    completeness_score = len(found_angles) / len(angles)
    report.checks.append(CheckResult(
        name="completeness",
        passed=len(missing_angles) == 0,
        score=completeness_score,
        message=f"Found {len(found_angles)}/8 angles",
        details={"found": found_angles, "missing": missing_angles}
    ))

    if len(missing_angles) > 0:
        report.hard_fails.append("MISSING_ANGLES")

    # Resolution check on first found sprite
    if found_angles:
        first_sprite = sprites_dir / f"{terrain_id}_{found_angles[0]}.png"
        dims = get_image_dimensions(first_sprite)
        if dims:
            w, h = dims
            resolution_ok = w >= 512 and h >= 512
            report.checks.append(CheckResult(
                name="resolution",
                passed=resolution_ok,
                score=1.0 if resolution_ok else 0.5,
                message=f"Resolution: {w}x{h}",
                details={"width": w, "height": h}
            ))

    # Average size check
    if found_angles:
        avg_size = total_size / len(found_angles)
        size_ok = avg_size > 50000
        report.checks.append(CheckResult(
            name="sprite_quality",
            passed=size_ok,
            score=min(1.0, avg_size / 100000),
            message=f"Avg sprite size: {avg_size/1024:.1f}KB"
        ))

    # Calculate overall
    if report.checks:
        report.overall_score = sum(c.score for c in report.checks) / len(report.checks)
        report.overall_passed = len(report.hard_fails) == 0 and report.overall_score >= 0.55

    return report


def run_material_gates() -> list[AssetReport]:
    """Run quality gates on all materials."""
    reports = []

    # Find all unique material IDs from basecolor files
    basecolor_files = list(MATERIALS_DIR.glob("*_basecolor.png"))
    mat_ids = sorted(set(f.stem.replace("_basecolor", "") for f in basecolor_files))

    print(f"\n=== MATERIAL QUALITY GATES ({len(mat_ids)} materials) ===\n")

    passed = 0
    for mat_id in mat_ids:
        report = check_material_set(mat_id)
        reports.append(report)

        status = "PASS" if report.overall_passed else "FAIL"
        if report.overall_passed:
            passed += 1
        print(f"  {mat_id}: {status} (score: {report.overall_score:.2f})")
        if report.hard_fails:
            print(f"    Hard fails: {', '.join(report.hard_fails)}")

    print(f"\n  Summary: {passed}/{len(mat_ids)} passed\n")
    return reports


def run_building_gates() -> list[AssetReport]:
    """Run quality gates on all building meshes."""
    reports = []

    # Find all reference images
    ref_files = list(BUILDINGS_DIR.glob("*_ref.png"))
    building_ids = sorted(set(f.stem.replace("_ref", "") for f in ref_files))

    print(f"\n=== BUILDING QUALITY GATES ({len(building_ids)} buildings) ===\n")

    passed = 0
    for building_id in building_ids:
        report = check_building_mesh(building_id)
        reports.append(report)

        status = "PASS" if report.overall_passed else "FAIL"
        if report.overall_passed:
            passed += 1
        print(f"  {building_id}: {status} (score: {report.overall_score:.2f})")
        if report.hard_fails:
            print(f"    Hard fails: {', '.join(report.hard_fails)}")

    print(f"\n  Summary: {passed}/{len(building_ids)} passed\n")
    return reports


def run_terrain_gates() -> list[AssetReport]:
    """Run quality gates on all terrain sprites."""
    reports = []

    # Find all terrain types from sprites
    sprites_dir = TERRAIN_DIR / "sprites"
    if not sprites_dir.exists():
        print("\n=== TERRAIN SPRITE QUALITY GATES ===")
        print("  No sprites directory found")
        return reports

    # Get unique terrain IDs
    sprite_files = list(sprites_dir.glob("*.png"))
    terrain_ids = set()
    for f in sprite_files:
        # Extract terrain_id from filename like "terrain_plains_north.png"
        parts = f.stem.rsplit("_", 1)
        if len(parts) == 2:
            terrain_ids.add(parts[0])

    terrain_ids = sorted(terrain_ids)

    print(f"\n=== TERRAIN SPRITE QUALITY GATES ({len(terrain_ids)} terrains) ===\n")

    passed = 0
    for terrain_id in terrain_ids:
        report = check_terrain_sprites(terrain_id)
        reports.append(report)

        status = "PASS" if report.overall_passed else "FAIL"
        if report.overall_passed:
            passed += 1
        print(f"  {terrain_id}: {status} (score: {report.overall_score:.2f})")
        if report.hard_fails:
            print(f"    Hard fails: {', '.join(report.hard_fails)}")

    print(f"\n  Summary: {passed}/{len(terrain_ids)} passed\n")
    return reports


def save_reports(reports: list[AssetReport], filename: str):
    """Save reports to JSON."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    data = []
    for r in reports:
        data.append({
            "asset_id": r.asset_id,
            "asset_type": r.asset_type,
            "file_path": r.file_path,
            "overall_passed": r.overall_passed,
            "overall_score": r.overall_score,
            "hard_fails": r.hard_fails,
            "checks": [
                {
                    "name": c.name,
                    "passed": c.passed,
                    "score": c.score,
                    "message": c.message,
                    "details": c.details
                }
                for c in r.checks
            ]
        })

    report_path = OUTPUT_DIR / filename
    with open(report_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Report saved: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="Run quality gates on Backbay Imperium assets")
    parser.add_argument("--all", action="store_true", help="Run all gates")
    parser.add_argument("--materials", action="store_true", help="Run material gates")
    parser.add_argument("--buildings", action="store_true", help="Run building gates")
    parser.add_argument("--terrain", action="store_true", help="Run terrain gates")
    parser.add_argument("--save", action="store_true", help="Save reports to JSON")

    args = parser.parse_args()

    # Default to all if nothing specified
    if not any([args.all, args.materials, args.buildings, args.terrain]):
        args.all = True

    print("=" * 60)
    print("BACKBAY IMPERIUM QUALITY GATES")
    print("=" * 60)

    all_reports = []

    if args.all or args.materials:
        reports = run_material_gates()
        all_reports.extend(reports)
        if args.save:
            save_reports(reports, "material_report.json")

    if args.all or args.buildings:
        reports = run_building_gates()
        all_reports.extend(reports)
        if args.save:
            save_reports(reports, "building_report.json")

    if args.all or args.terrain:
        reports = run_terrain_gates()
        all_reports.extend(reports)
        if args.save:
            save_reports(reports, "terrain_report.json")

    # Summary
    print("=" * 60)
    print("OVERALL SUMMARY")
    print("=" * 60)

    total = len(all_reports)
    passed = sum(1 for r in all_reports if r.overall_passed)
    failed = total - passed
    avg_score = sum(r.overall_score for r in all_reports) / total if total > 0 else 0

    print(f"  Total assets: {total}")
    print(f"  Passed: {passed} ({100*passed/total:.1f}%)" if total > 0 else "  Passed: 0")
    print(f"  Failed: {failed}")
    print(f"  Average score: {avg_score:.2f}")
    print("=" * 60)

    if args.save:
        save_reports(all_reports, "all_reports.json")


if __name__ == "__main__":
    main()
