#!/usr/bin/env python3
"""
Deterministic World Builder Skill

Run fab-world with SHA manifest generation for full reproducibility.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[2]
kernel_src = repo_root / "kernel" / "src"
if kernel_src.exists():
    sys.path.insert(0, str(kernel_src))


def execute(
    world_recipe_path: str | Path,
    output_dir: str | Path,
    seed: int = 42,
    validate: bool = True,
) -> dict[str, Any]:
    """
    Build world deterministically.

    Args:
        world_recipe_path: Path to world.yaml recipe
        output_dir: Output directory for run
        seed: Master seed
        validate: Run validation gates after build

    Returns:
        {
            "manifest_path": str,
            "glb_path": str,
            "validation_results": {...},
            "sha256": str
        }
    """
    world_recipe_path = Path(world_recipe_path)
    output_dir = Path(output_dir)

    if not world_recipe_path.exists():
        return {
            "success": False,
            "error": f"World recipe not found: {world_recipe_path}",
        }

    # Load world config
    try:
        from cyntra.fab.world_config import load_world_config

        world_config = load_world_config(world_recipe_path)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to load world config: {e}",
        }

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        from cyntra.fab.world_runner import WorldRunner

        # Run world builder
        runner = WorldRunner(
            world_config=world_config,
            output_dir=output_dir,
            seed=seed,
        )

        manifest = runner.run()

        # Get paths from manifest
        manifest_path = output_dir / "manifest.json"
        glb_path = manifest.get("export", {}).get("glb_path")

        # Compute overall SHA256
        import hashlib

        sha256_hash = hashlib.sha256()

        if glb_path and Path(glb_path).exists():
            with open(glb_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)

        sha256 = sha256_hash.hexdigest()

        # Run validation if requested
        validation_results = None
        if validate and glb_path:
            # Run godot integration validator
            # This would typically use fab-gate or godot validation
            validation_results = {
                "validated": False,
                "note": "Validation not yet implemented in skill",
            }

        return {
            "success": True,
            "manifest_path": str(manifest_path),
            "glb_path": str(glb_path) if glb_path else None,
            "validation_results": validation_results,
            "sha256": sha256,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"World build failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Build world deterministically")
    parser.add_argument("world_recipe", help="Path to world.yaml")
    parser.add_argument("output_dir", help="Output directory")
    parser.add_argument("--seed", type=int, default=42, help="Master seed")
    parser.add_argument("--no-validate", action="store_true", help="Skip validation")

    args = parser.parse_args()

    result = execute(
        world_recipe_path=args.world_recipe,
        output_dir=args.output_dir,
        seed=args.seed,
        validate=not args.no_validate,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
