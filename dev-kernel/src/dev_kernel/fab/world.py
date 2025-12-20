"""
Fab World CLI - Build deterministic 3D worlds.

Usage:
    fab-world build --world <path> --output <dir> [options]
    fab-world validate --world <path> --asset <glb>
    fab-world list
    fab-world inspect <world>
"""

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Optional
import time


def cmd_build(args):
    """Execute world build command."""
    from .world_runner import run_world

    # Parse parameter overrides
    param_overrides = {}
    if args.param:
        for param_str in args.param:
            if "=" not in param_str:
                print(f"✗ Invalid parameter format: {param_str}")
                print("  Expected: key=value or dotted.key=value")
                return 1

            key, value = param_str.split("=", 1)

            # Try to parse value as JSON for complex types
            try:
                import json
                value = json.loads(value)
            except:
                # Keep as string if not valid JSON
                pass

            param_overrides[key] = value

    # Ensure output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Run build
    success = run_world(
        world_path=Path(args.world),
        output_dir=output_dir,
        seed=args.seed,
        param_overrides=param_overrides,
        until_stage=args.until,
        prune_intermediates=getattr(args, "prune_intermediates", False),
    )

    return 0 if success else 1


def cmd_validate(args):
    """Execute validation command."""
    from .world_config import load_world_config
    from .stage_executor import execute_gate_stage

    try:
        world_config = load_world_config(Path(args.world))
    except Exception as e:
        print(f"✗ Failed to load world config: {e}")
        return 1

    asset_path = Path(args.asset)
    if not asset_path.exists():
        print(f"✗ Asset not found: {asset_path}")
        return 1

    gate_stage = None
    for stage in world_config.stages:
        if stage.get("type") == "gate":
            gate_stage = stage
            if stage.get("id") == "validate":
                break

    if gate_stage is None:
        print("✗ No gate stage configured in world.yaml")
        return 1

    # Default output: if validating a world run artifact, write alongside it.
    if args.output:
        run_dir = Path(args.output)
    else:
        inferred_run = None
        if asset_path.parent.name == "world":
            inferred_run = asset_path.parent.parent
        run_dir = inferred_run or (Path.cwd() / ".glia-fab" / "validate" / str(int(time.time())))

    stage_dir = run_dir / "stages" / "validate"

    result = execute_gate_stage(
        stage=gate_stage,
        world_config=world_config,
        run_dir=run_dir,
        stage_dir=stage_dir,
        asset_path=asset_path,
    )

    gates = (result.get("metadata") or {}).get("gates") or []
    print("\nValidation Results:\n")
    for gate in gates:
        name = gate.get("gate", "unknown")
        status = "PASS" if gate.get("passed") else "FAIL"
        print(f"  - {name}: {status}")

    if result.get("success"):
        print(f"\n✓ Validation passed (outputs in {stage_dir})")
        return 0

    print(f"\n✗ Validation failed (outputs in {stage_dir})")
    for err in result.get("errors") or []:
        print(f"  - {err}")
    return 2


def cmd_list(args):
    """List available worlds."""
    # Look for worlds in fab/worlds/
    repo_root = Path.cwd()
    worlds_dir = repo_root / "fab" / "worlds"

    if not worlds_dir.exists():
        print("No worlds directory found (fab/worlds/)")
        return 1

    print("Available worlds:\n")

    worlds_found = False
    for world_dir in worlds_dir.iterdir():
        if world_dir.is_dir():
            world_yaml = world_dir / "world.yaml"
            if world_yaml.exists():
                worlds_found = True

                # Load basic info
                try:
                    import yaml
                    with open(world_yaml) as f:
                        config = yaml.safe_load(f)

                    world_id = config.get("world_id", "unknown")
                    version = config.get("version", "unknown")
                    world_type = config.get("world_type", "unknown")
                    name = config.get("generator", {}).get("name", world_id)

                    print(f"  {world_id} (v{version})")
                    print(f"    Type: {world_type}")
                    print(f"    Name: {name}")
                    print(f"    Path: {world_dir}")
                    print()

                except Exception as e:
                    print(f"  {world_dir.name} - Error loading config: {e}")
                    print()

    if not worlds_found:
        print("  No worlds found in fab/worlds/")

    return 0


def cmd_publish(args):
    """Publish world build to viewer or release directory."""
    from pathlib import Path
    import shutil
    import json

    # Load manifest from run
    run_dir = Path(args.run)
    manifest_path = run_dir / "manifest.json"

    if not manifest_path.exists():
        print(f"✗ Manifest not found: {manifest_path}")
        print("  Run directory may be incomplete or build failed")
        return 1

    with open(manifest_path) as f:
        manifest = json.load(f)

    world_id = manifest.get("world_id", "unknown")
    run_id = manifest.get("run_id", "unknown")

    print(f"\nPublishing: {world_id}")
    print(f"Run ID: {run_id}\n")

    # Determine publish mode
    if args.viewer:
        # Publish to viewer
        viewer_base = Path(args.viewer)

        # Copy main GLB
        main_glb = run_dir / "world" / f"{world_id}.glb"
        if main_glb.exists():
            viewer_glb_dir = viewer_base / "assets" / "exports"
            viewer_glb_dir.mkdir(parents=True, exist_ok=True)
            dest_glb = viewer_glb_dir / f"{world_id}.glb"

            shutil.copy2(main_glb, dest_glb)
            print(f"✓ Published GLB: {dest_glb}")
        else:
            print(f"⚠ Main GLB not found: {main_glb}")

        # Copy Godot game build
        godot_index = run_dir / "godot" / "index.html"
        if godot_index.exists():
            viewer_game_dir = viewer_base / "assets" / "games" / world_id
            viewer_game_dir.mkdir(parents=True, exist_ok=True)

            # Copy entire godot directory
            godot_src = run_dir / "godot"
            for item in godot_src.iterdir():
                if item.is_file():
                    shutil.copy2(item, viewer_game_dir / item.name)
                elif item.is_dir():
                    shutil.copytree(item, viewer_game_dir / item.name, dirs_exist_ok=True)

            print(f"✓ Published Godot game: {viewer_game_dir}")
        else:
            print(f"⚠ Godot export not found (optional)")

        print(f"\nViewer updated: {viewer_base}")

    elif args.export:
        # Publish to export/release directory
        export_dir = Path(args.export)
        export_dir.mkdir(parents=True, exist_ok=True)

        # Copy main GLB
        main_glb = run_dir / "world" / f"{world_id}.glb"
        if main_glb.exists():
            dest_glb = export_dir / f"{world_id}_v{manifest['world_version']}.glb"
            shutil.copy2(main_glb, dest_glb)
            print(f"✓ Published GLB: {dest_glb}")

        # Copy manifest as metadata
        metadata_path = export_dir / f"{world_id}_v{manifest['world_version']}_metadata.json"
        shutil.copy2(manifest_path, metadata_path)
        print(f"✓ Published metadata: {metadata_path}")

        # Copy preview renders
        beauty_dir = run_dir / "render" / "beauty"
        if beauty_dir.exists():
            renders = list(beauty_dir.glob("*.png"))
            if renders:
                render_export = export_dir / "previews"
                render_export.mkdir(exist_ok=True)

                for render in renders:
                    shutil.copy2(render, render_export / render.name)

                print(f"✓ Published {len(renders)} preview renders")

        print(f"\nExport complete: {export_dir}")

    else:
        print("✗ Must specify either --viewer or --export destination")
        return 1

    return 0


def cmd_inspect(args):
    """Inspect world configuration."""
    from .world_config import load_world_config

    try:
        world_config = load_world_config(Path(args.world))
    except Exception as e:
        print(f"✗ Failed to load world config: {e}")
        return 1

    if args.json:
        # Output as JSON
        import json
        print(json.dumps(world_config.raw_config, indent=2))
        return 0

    # Human-readable output
    print(f"\nWorld: {world_config.world_id}")
    print(f"Version: {world_config.version}")
    print(f"Type: {world_config.world_type}")
    print(f"Schema: {world_config.schema_version}")

    if world_config.generator:
        gen = world_config.generator
        print(f"\nGenerator:")
        print(f"  Name: {gen.get('name', 'N/A')}")
        print(f"  Author: {gen.get('author', 'N/A')}")

        if gen.get("required_addons"):
            print(f"  Required Addons:")
            for addon in gen["required_addons"]:
                req = "required" if addon.get("required") else "optional"
                print(f"    - {addon['id']} ({req})")

    # Build settings
    build = world_config.build
    print(f"\nBuild:")
    print(f"  Template: {build.get('template_blend', 'N/A')}")
    if "blender_version_min" in build:
        print(f"  Min Blender: {build['blender_version_min']}")

    det = world_config.get_determinism_config()
    print(f"  Determinism:")
    print(f"    Seed: {det.get('seed')}")
    print(f"    Python Hash Seed: {det.get('pythonhashseed')}")

    # Parameters
    params = world_config.parameters.get("defaults", {})
    if params:
        print(f"\nParameters ({len(params)} groups):")
        for group, values in params.items():
            print(f"  {group}:")
            if isinstance(values, dict):
                for key, value in values.items():
                    print(f"    {key}: {value}")
            else:
                print(f"    {values}")

    # Stages
    print(f"\nStages ({len(world_config.stages)}):")
    stage_order = world_config.get_stage_order()
    for i, stage_id in enumerate(stage_order, 1):
        stage = world_config.get_stage(stage_id)
        stage_type = stage["type"]
        deps = stage.get("requires", [])
        deps_str = f" (requires: {', '.join(deps)})" if deps else ""
        print(f"  {i}. {stage_id} [{stage_type}]{deps_str}")

    # Budgets
    if world_config.budgets:
        print(f"\nBudgets:")
        for category, limits in world_config.budgets.items():
            print(f"  {category}:")
            for key, value in limits.items():
                print(f"    {key}: {value:,}")

    print()
    return 0


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Fab World - Build deterministic 3D worlds",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Build command
    build_parser = subparsers.add_parser(
        "build",
        help="Build a world",
    )
    build_parser.add_argument(
        "--world",
        required=True,
        help="Path to world directory or world.yaml",
    )
    build_parser.add_argument(
        "--output",
        required=True,
        help="Output directory for build",
    )
    build_parser.add_argument(
        "--seed",
        type=int,
        help="Random seed override",
    )
    build_parser.add_argument(
        "--param",
        action="append",
        help="Parameter override (key=value, supports dot-path like lighting.preset=cosmic)",
    )
    build_parser.add_argument(
        "--until",
        help="Stop after this stage (for incremental builds)",
    )
    build_parser.add_argument(
        "--prune-intermediates",
        dest="prune_intermediates",
        action="store_true",
        help="Delete intermediate stage directories after they are no longer needed",
    )

    # Validate command
    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate an asset against world gates",
    )
    validate_parser.add_argument(
        "--world",
        required=True,
        help="Path to world directory",
    )
    validate_parser.add_argument(
        "--asset",
        required=True,
        help="Path to asset file (GLB)",
    )
    validate_parser.add_argument(
        "--output",
        help="Optional output directory for validation artifacts",
    )

    # List command
    list_parser = subparsers.add_parser(
        "list",
        help="List available worlds",
    )

    # Inspect command
    inspect_parser = subparsers.add_parser(
        "inspect",
        help="Inspect world configuration",
    )
    inspect_parser.add_argument(
        "world",
        help="Path to world directory or world.yaml",
    )
    inspect_parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON",
    )

    # Publish command
    publish_parser = subparsers.add_parser(
        "publish",
        help="Publish world build outputs",
    )
    publish_parser.add_argument(
        "--run",
        required=True,
        help="Path to run directory (e.g., .glia-fab/runs/run_001)",
    )
    publish_parser.add_argument(
        "--viewer",
        help="Publish to viewer directory",
    )
    publish_parser.add_argument(
        "--export",
        help="Publish to export/release directory",
    )

    # Parse args
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    # Dispatch to command handler
    if args.command == "build":
        return cmd_build(args)
    elif args.command == "validate":
        return cmd_validate(args)
    elif args.command == "list":
        return cmd_list(args)
    elif args.command == "inspect":
        return cmd_inspect(args)
    elif args.command == "publish":
        return cmd_publish(args)
    else:
        print(f"Unknown command: {args.command}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
