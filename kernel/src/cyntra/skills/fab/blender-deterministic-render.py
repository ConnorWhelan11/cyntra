#!/usr/bin/env python3
"""
Blender Deterministic Render Skill

Invoke Blender with fixed seeds, CPU-only, factory startup for reproducible renders.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(repo_root / "kernel" / "src"))


def execute(
    blend_file: str | Path,
    output_dir: str | Path,
    seed: int = 42,
    camera_rig: str | None = None,
    resolution: list[int] | None = None,
    samples: int = 128,
) -> dict[str, Any]:
    """
    Render Blender file deterministically.

    Args:
        blend_file: Path to .blend file
        output_dir: Directory for render outputs
        seed: Random seed
        camera_rig: Camera rig name (optional)
        resolution: [width, height] in pixels
        samples: Render samples

    Returns:
        {
            "renders": [...],
            "manifest_path": str,
            "duration_ms": int
        }
    """
    blend_file = Path(blend_file)
    output_dir = Path(output_dir)

    if not blend_file.exists():
        return {
            "success": False,
            "error": f"Blend file not found: {blend_file}",
        }

    if resolution is None:
        resolution = [1920, 1080]

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build Blender command
    # Use factory startup and set PYTHONHASHSEED for determinism
    env_vars = {
        "PYTHONHASHSEED": "0",
    }

    # Create Python script to execute in Blender
    script_lines = [
        "import bpy",
        "import random",
        f"random.seed({seed})",
        "",
        "# Set render settings",
        f"bpy.context.scene.render.resolution_x = {resolution[0]}",
        f"bpy.context.scene.render.resolution_y = {resolution[1]}",
        f"bpy.context.scene.cycles.samples = {samples}",
        "bpy.context.scene.cycles.device = 'CPU'",
        "bpy.context.scene.render.threads = 1",
        "",
        "# Set output path",
        f"bpy.context.scene.render.filepath = '{str(output_dir / 'render_####.png')}'",
        "",
        "# Render",
        "bpy.ops.render.render(write_still=True)",
    ]

    script = "\n".join(script_lines)
    script_path = output_dir / "render_script.py"
    script_path.write_text(script)

    # Build command
    blender_cmd = [
        "blender",
        "--factory-startup",
        "--background",
        str(blend_file),
        "--python",
        str(script_path),
    ]

    start_time = time.time()

    try:
        result = subprocess.run(
            blender_cmd,
            capture_output=True,
            text=True,
            env={**subprocess.os.environ, **env_vars},
            timeout=600,  # 10 minute timeout
        )

        duration_ms = int((time.time() - start_time) * 1000)

        if result.returncode != 0:
            return {
                "success": False,
                "error": "Blender render failed",
                "exit_code": result.returncode,
                "stderr": result.stderr,
                "duration_ms": duration_ms,
            }

        # Find rendered images
        renders = sorted(output_dir.glob("render_*.png"))

        # Create manifest
        manifest = {
            "blend_file": str(blend_file),
            "seed": seed,
            "resolution": resolution,
            "samples": samples,
            "camera_rig": camera_rig,
            "device": "CPU",
            "threads": 1,
            "factory_startup": True,
            "renders": [str(r) for r in renders],
            "duration_ms": duration_ms,
        }

        manifest_path = output_dir / "render_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        return {
            "success": True,
            "renders": [str(r) for r in renders],
            "manifest_path": str(manifest_path),
            "duration_ms": duration_ms,
        }

    except subprocess.TimeoutExpired:
        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "error": "Render timeout (10 minutes)",
            "duration_ms": duration_ms,
        }
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "error": f"Render failed: {e}",
            "duration_ms": duration_ms,
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Deterministic Blender render")
    parser.add_argument("blend_file", help="Path to .blend file")
    parser.add_argument("output_dir", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--samples", type=int, default=128, help="Render samples")
    parser.add_argument(
        "--resolution", nargs=2, type=int, default=[1920, 1080], help="Width height"
    )

    args = parser.parse_args()

    result = execute(
        blend_file=args.blend_file,
        output_dir=args.output_dir,
        seed=args.seed,
        resolution=args.resolution,
        samples=args.samples,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
