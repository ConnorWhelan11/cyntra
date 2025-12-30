#!/usr/bin/env python3
"""
Visual QA Skill - Screenshot regression testing for Backbay Imperium.

Captures screenshots of game rendering and compares against baselines
using perceptual hashing to detect visual regressions.

Supports capture modes:
- basic: Standard regression captures (overview, zoom, corners, units)
- terrain: Terrain-specific captures for quality evaluation (water, mountains, etc.)
- all: Both basic and terrain captures
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


# Paths relative to project root
PROJECT_ROOT = Path(__file__).parents[2]
BACKBAY_DIR = PROJECT_ROOT / "research" / "backbay-imperium"
VISUAL_QA_SCRIPT = BACKBAY_DIR / "scripts" / "visual_qa" / "run_visual_qa.sh"
COMPARE_SCRIPT = BACKBAY_DIR / "scripts" / "visual_qa" / "compare.py"
CAPTURES_DIR = BACKBAY_DIR / "client" / "tests" / "visual_qa_captures"
BASELINES_DIR = BACKBAY_DIR / "client" / "tests" / "visual_qa_baselines"
OUTPUT_DIR = BACKBAY_DIR / "client" / "tests" / "visual_qa_output"
REPORT_PATH = OUTPUT_DIR / "visual_qa_report.json"

# Capture scene path
CAPTURE_SCENE = "res://tests/visual_qa_capture.tscn"


def _project_name() -> str:
    project_file = BACKBAY_DIR / "client" / "project.godot"
    if project_file.exists():
        for line in project_file.read_text().splitlines():
            if line.startswith("config/name="):
                return line.split("=", 1)[1].strip().strip('"')
    return "BackbayImperiumClient"


def _user_capture_dir() -> Path | None:
    project_name = _project_name()
    home = Path.home()
    candidates: list[Path] = []

    if sys.platform == "darwin":
        candidates.append(
            home / "Library/Application Support/Godot/app_userdata" / project_name
        )
    elif sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA")
        if appdata:
            candidates.append(Path(appdata) / "Godot" / "app_userdata" / project_name)
    else:
        xdg = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share"))
        candidates.append(xdg / "godot" / "app_userdata" / project_name)
        candidates.append(xdg / "Godot" / "app_userdata" / project_name)

    for base in candidates:
        candidate = base / "visual_qa"
        if candidate.exists():
            return candidate
    return None


def find_python() -> str:
    """Find Python with required packages."""
    kernel_py = PROJECT_ROOT / "kernel" / ".venv" / "bin" / "python"
    if kernel_py.exists():
        return str(kernel_py)
    return "python3"


def find_godot() -> str | None:
    """Find Godot binary."""
    mac_godot = Path("/Applications/Godot.app/Contents/MacOS/Godot")
    if mac_godot.exists():
        return str(mac_godot)

    # Try PATH
    result = subprocess.run(["which", "godot"], capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip()

    return None


def run_capture(capture_mode: str = "all") -> dict[str, Any]:
    """Run Godot to capture screenshots.

    Args:
        capture_mode: "basic", "terrain", or "all"
    """
    godot = find_godot()
    if not godot:
        return {
            "success": False,
            "error": "Godot not found. Install Godot 4.x.",
        }

    client_dir = BACKBAY_DIR / "client"

    if CAPTURES_DIR.exists():
        shutil.rmtree(CAPTURES_DIR)
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)

    args = [
        "--path",
        str(client_dir),
        "--scene",
        CAPTURE_SCENE,
        "--",
        f"--mode={capture_mode}",
        f"--output={CAPTURES_DIR}",
    ]

    def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,  # Increased timeout for terrain captures
            cwd=str(client_dir),
        )

    # Prefer GUI when available; fall back to headless for CI/servers.
    cmd = [godot, *args]
    result = _run(cmd)
    if result.returncode != 0:
        headless_cmd = [godot, "--headless", *args]
        result = _run(headless_cmd)

    if result.returncode != 0:
        return {
            "success": False,
            "error": "Godot capture failed",
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    if not CAPTURES_DIR.exists() or not list(CAPTURES_DIR.glob("*.png")):
        fallback_dir = _user_capture_dir()
        if fallback_dir:
            CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
            for file in fallback_dir.glob("*.png"):
                shutil.copy2(file, CAPTURES_DIR / file.name)
            manifest_src = fallback_dir / "manifest.json"
            if manifest_src.exists():
                shutil.copy2(manifest_src, CAPTURES_DIR / "manifest.json")

    if not CAPTURES_DIR.exists() or not list(CAPTURES_DIR.glob("*.png")):
        return {
            "success": False,
            "error": "No captures created",
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    captures = list(CAPTURES_DIR.glob("*.png"))

    # Load manifest for additional info
    manifest_path = CAPTURES_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:
            pass

    return {
        "success": True,
        "captures": [c.name for c in captures],
        "count": len(captures),
        "mode": manifest.get("mode", capture_mode),
        "basic_captures": manifest.get("basic_captures", 0),
        "terrain_captures": manifest.get("terrain_captures", 0),
    }


def run_compare(
    threshold: int = 10, strict: bool = False, compute_metrics: bool = False
) -> dict[str, Any]:
    """Run comparison against baselines.

    Args:
        threshold: Hash distance threshold
        strict: Use strict threshold
        compute_metrics: Compute terrain quality metrics
    """
    if not BASELINES_DIR.exists() or not list(BASELINES_DIR.glob("*.png")):
        return {
            "success": False,
            "error": "No baselines found. Run with mode=update first.",
        }

    if not CAPTURES_DIR.exists() or not list(CAPTURES_DIR.glob("*.png")):
        return {
            "success": False,
            "error": "No captures found. Run capture first.",
        }

    python = find_python()

    args = [
        python,
        str(COMPARE_SCRIPT),
        "--captures",
        str(CAPTURES_DIR),
        "--baselines",
        str(BASELINES_DIR),
        "--output",
        str(OUTPUT_DIR),
    ]

    if strict:
        args.append("--strict")
    else:
        args.extend(["--threshold", str(threshold)])

    if compute_metrics:
        args.append("--metrics")

    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )

    # Parse report if available
    if REPORT_PATH.exists():
        try:
            report = json.loads(REPORT_PATH.read_text())
            return {
                "success": True,
                "passed": report["summary"]["failed"] == 0,
                "total": report["summary"]["total"],
                "failed_count": report["summary"]["failed"],
                "basic_captures": report["summary"].get("basic_captures", 0),
                "terrain_captures": report["summary"].get("terrain_captures", 0),
                "category_summary": report.get("category_summary", {}),
                "results": report["results"],
                "report_path": str(REPORT_PATH),
            }
        except (json.JSONDecodeError, KeyError) as e:
            return {
                "success": False,
                "error": f"Failed to parse report: {e}",
            }

    # Fallback: parse stdout
    passed = result.returncode == 0
    return {
        "success": True,
        "passed": passed,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def run_update(capture_mode: str = "all") -> dict[str, Any]:
    """Update baselines from current captures.

    Args:
        capture_mode: "basic", "terrain", or "all"
    """
    # First run capture
    capture_result = run_capture(capture_mode)
    if not capture_result.get("success"):
        return capture_result

    python = find_python()

    result = subprocess.run(
        [
            python,
            str(COMPARE_SCRIPT),
            "--captures",
            str(CAPTURES_DIR),
            "--baselines",
            str(BASELINES_DIR),
            "--update-baselines",
        ],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )

    baselines = list(BASELINES_DIR.glob("*.png")) if BASELINES_DIR.exists() else []

    return {
        "success": result.returncode == 0,
        "baselines_updated": len(baselines),
        "files": [b.name for b in baselines],
        "mode": capture_mode,
    }


def execute(
    mode: str = "compare",
    threshold: int = 10,
    strict: bool = False,
    capture_mode: str = "all",
    compute_metrics: bool = False,
) -> dict[str, Any]:
    """
    Run visual QA for Backbay Imperium.

    Args:
        mode: capture, compare, or update
        threshold: Perceptual hash distance threshold (0-64)
        strict: Use strict threshold (5)
        capture_mode: "basic", "terrain", or "all"
        compute_metrics: Compute terrain quality metrics

    Returns:
        {
            "success": bool,
            "passed": bool,
            "total": int,
            "failed_count": int,
            "basic_captures": int,
            "terrain_captures": int,
            "category_summary": dict,
            "results": [...],
            "diff_images": [...],
            "report_path": str
        }
    """
    if mode == "capture":
        result = run_capture(capture_mode)
        return {
            "success": result.get("success", False),
            "passed": True,
            "total": result.get("count", 0),
            "failed_count": 0,
            "basic_captures": result.get("basic_captures", 0),
            "terrain_captures": result.get("terrain_captures", 0),
            "category_summary": {},
            "results": [],
            "diff_images": [],
            "report_path": "",
            "message": f"Captured {result.get('count', 0)} screenshots (mode={capture_mode})",
        }

    elif mode == "update":
        result = run_update(capture_mode)
        return {
            "success": result.get("success", False),
            "passed": True,
            "total": result.get("baselines_updated", 0),
            "failed_count": 0,
            "basic_captures": 0,
            "terrain_captures": 0,
            "category_summary": {},
            "results": [],
            "diff_images": [],
            "report_path": "",
            "message": f"Updated {result.get('baselines_updated', 0)} baselines (mode={capture_mode})",
        }

    else:  # compare (default)
        # Run capture first
        capture_result = run_capture(capture_mode)
        if not capture_result.get("success"):
            return {
                "success": False,
                "passed": False,
                "total": 0,
                "failed_count": 0,
                "basic_captures": 0,
                "terrain_captures": 0,
                "category_summary": {},
                "results": [],
                "diff_images": [],
                "report_path": "",
                "error": capture_result.get("error", "Capture failed"),
            }

        # Then compare
        compare_result = run_compare(threshold, strict, compute_metrics)
        if not compare_result.get("success"):
            return {
                "success": False,
                "passed": False,
                "total": 0,
                "failed_count": 0,
                "basic_captures": 0,
                "terrain_captures": 0,
                "category_summary": {},
                "results": [],
                "diff_images": [],
                "report_path": "",
                "error": compare_result.get("error", "Comparison failed"),
            }

        # Extract diff images
        diff_images = []
        if OUTPUT_DIR.exists():
            diffs_dir = OUTPUT_DIR / "diffs"
            if diffs_dir.exists():
                diff_images = [str(d) for d in diffs_dir.glob("*_diff.png")]

        results = compare_result.get("results", [])
        failed_count = sum(1 for r in results if not r.get("passed", True))

        return {
            "success": True,
            "passed": compare_result.get("passed", False),
            "total": compare_result.get("total", len(results)),
            "failed_count": failed_count,
            "basic_captures": compare_result.get("basic_captures", 0),
            "terrain_captures": compare_result.get("terrain_captures", 0),
            "category_summary": compare_result.get("category_summary", {}),
            "results": results,
            "diff_images": diff_images,
            "report_path": str(REPORT_PATH) if REPORT_PATH.exists() else "",
        }


def main() -> None:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Visual QA for Backbay Imperium")
    parser.add_argument(
        "--mode",
        default="compare",
        choices=["capture", "compare", "update"],
        help="Operation mode",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=10,
        help="Hash distance threshold (0=identical, 64=different)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Use strict threshold (5)",
    )
    parser.add_argument(
        "--capture-mode",
        default="all",
        choices=["basic", "terrain", "all"],
        help="Capture mode: basic (regression), terrain (quality), or all",
    )
    parser.add_argument(
        "--metrics",
        action="store_true",
        help="Compute terrain quality metrics for terrain captures",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file (default: stdout)",
    )

    args = parser.parse_args()

    result = execute(
        mode=args.mode,
        threshold=args.threshold,
        strict=args.strict,
        capture_mode=args.capture_mode,
        compute_metrics=args.metrics,
    )

    output = json.dumps(result, indent=2)
    if args.output:
        Path(args.output).write_text(output)
    else:
        print(output)

    # Exit with appropriate code
    if not result.get("success"):
        sys.exit(1)
    elif not result.get("passed", True):
        sys.exit(2)  # Visual regression detected
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
