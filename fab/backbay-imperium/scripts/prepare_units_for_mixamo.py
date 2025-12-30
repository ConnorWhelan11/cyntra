#!/usr/bin/env python3
"""
Prepare humanoid unit meshes for Mixamo auto-rigging.

This script:
1. Categorizes units by type (humanoid, mounted, vehicle, etc.)
2. Converts GLB to FBX format for Mixamo upload
3. Optionally uploads to Mixamo if API token is available
4. Downloads rigged characters and applies animations

Usage:
    python prepare_units_for_mixamo.py --prepare   # Convert to FBX
    python prepare_units_for_mixamo.py --upload    # Upload to Mixamo (needs token)
    python prepare_units_for_mixamo.py --download  # Download rigged characters
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
import argparse

# Unit categorization
HUMANOID_UNITS = [
    "warrior", "archer", "spearman", "slinger", "legion", "pikeman",
    "crossbowman", "longbowman", "landsknecht", "musketeer", "rifleman",
    "infantry", "settler", "worker", "missionary", "great_general"
]

MOUNTED_UNITS = ["horseman", "cavalry", "conquistador", "knight"]

VEHICLE_UNITS = ["chariot", "tank", "fighter"]

NAVAL_UNITS = ["galley", "trireme", "caravel", "frigate", "ironclad", "battleship"]

SIEGE_UNITS = ["catapult", "trebuchet", "mangonel", "cannon", "artillery"]

# Animation presets to apply
ANIMATION_PRESETS = {
    "infantry": ["idle", "walk", "run", "attack_melee", "death", "victory"],
    "ranged": ["idle", "walk", "run", "attack_ranged", "death", "victory"],
    "mounted": ["idle", "walk", "gallop", "attack_mounted", "death"],
    "civilian": ["idle", "walk", "working", "praying"],
}

# Paths
SCRIPT_DIR = Path(__file__).parent
ASSETS_DIR = SCRIPT_DIR.parent / "assets"
UNITS_DIR = ASSETS_DIR / "units" / "meshes"
RIGGED_DIR = ASSETS_DIR / "units" / "rigged"
FBX_DIR = ASSETS_DIR / "units" / "fbx_for_mixamo"


@dataclass
class UnitInfo:
    name: str
    category: str
    glb_path: Path
    fbx_path: Optional[Path] = None
    rigged_path: Optional[Path] = None
    animations: list = None


def get_unit_category(unit_name: str) -> str:
    """Determine unit category for rigging."""
    name = unit_name.lower().replace("unit_", "")

    if name in HUMANOID_UNITS:
        return "humanoid"
    elif name in MOUNTED_UNITS:
        return "mounted"
    elif name in VEHICLE_UNITS:
        return "vehicle"
    elif name in NAVAL_UNITS:
        return "naval"
    elif name in SIEGE_UNITS:
        return "siege"
    return "unknown"


def get_animation_preset(unit_name: str) -> list:
    """Get animation preset for unit type."""
    name = unit_name.lower().replace("unit_", "")

    if name in ["archer", "crossbowman", "longbowman", "slinger", "musketeer", "rifleman"]:
        return ANIMATION_PRESETS["ranged"]
    elif name in MOUNTED_UNITS:
        return ANIMATION_PRESETS["mounted"]
    elif name in ["settler", "worker", "missionary"]:
        return ANIMATION_PRESETS["civilian"]
    else:
        return ANIMATION_PRESETS["infantry"]


def scan_units() -> list[UnitInfo]:
    """Scan for all unit GLB files."""
    units = []

    for glb_file in UNITS_DIR.glob("unit_*.glb"):
        name = glb_file.stem
        category = get_unit_category(name)

        unit = UnitInfo(
            name=name,
            category=category,
            glb_path=glb_file,
            animations=get_animation_preset(name)
        )
        units.append(unit)

    return sorted(units, key=lambda u: (u.category, u.name))


def convert_glb_to_fbx(glb_path: Path, fbx_path: Path) -> bool:
    """Convert GLB to FBX using Blender."""
    script = f'''
import bpy

# Clear scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import GLB
bpy.ops.import_scene.gltf(filepath="{glb_path}")

# Select all mesh objects
for obj in bpy.data.objects:
    if obj.type in ['MESH', 'ARMATURE']:
        obj.select_set(True)

# Export as FBX
bpy.ops.export_scene.fbx(
    filepath="{fbx_path}",
    use_selection=True,
    apply_scale_options='FBX_SCALE_ALL',
    bake_space_transform=True,
    mesh_smooth_type='FACE'
)
print("Exported: {fbx_path}")
'''

    try:
        result = subprocess.run(
            ["blender", "--background", "--python-expr", script],
            capture_output=True,
            text=True,
            timeout=60
        )
        return fbx_path.exists()
    except Exception as e:
        print(f"  Error converting {glb_path.name}: {e}")
        return False


def prepare_for_mixamo(units: list[UnitInfo]) -> list[UnitInfo]:
    """Convert humanoid units to FBX for Mixamo upload."""
    FBX_DIR.mkdir(parents=True, exist_ok=True)

    prepared = []
    for unit in units:
        if unit.category != "humanoid":
            continue

        fbx_path = FBX_DIR / f"{unit.name}.fbx"
        print(f"Converting {unit.name}...")

        if convert_glb_to_fbx(unit.glb_path, fbx_path):
            unit.fbx_path = fbx_path
            prepared.append(unit)
            print(f"  OK: {fbx_path}")
        else:
            print(f"  FAILED")

    return prepared


def upload_to_mixamo(units: list[UnitInfo], token: str) -> dict:
    """Upload units to Mixamo for auto-rigging."""
    import requests

    results = {}
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {token}"
    session.headers["X-Api-Key"] = "mixamo2"

    for unit in units:
        if not unit.fbx_path or not unit.fbx_path.exists():
            continue

        print(f"Uploading {unit.name}...")

        try:
            # Upload character
            with open(unit.fbx_path, "rb") as f:
                response = session.post(
                    "https://www.mixamo.com/api/v1/characters",
                    files={"file": (unit.fbx_path.name, f, "application/octet-stream")}
                )

            if response.status_code == 200:
                data = response.json()
                results[unit.name] = {
                    "character_id": data.get("character_id"),
                    "status": "uploaded"
                }
                print(f"  Uploaded: {data.get('character_id')}")
            else:
                results[unit.name] = {"status": "failed", "error": response.text}
                print(f"  Failed: {response.status_code}")

        except Exception as e:
            results[unit.name] = {"status": "error", "error": str(e)}
            print(f"  Error: {e}")

    return results


def generate_mixamo_batch_file(units: list[UnitInfo]) -> Path:
    """Generate a batch file listing all units for manual Mixamo upload."""
    batch_file = FBX_DIR / "mixamo_batch.json"

    batch_data = {
        "units": [],
        "animations_to_apply": {
            "idle": "Breathing Idle",
            "walk": "Walking",
            "run": "Running",
            "attack_melee": "Great Sword Slash",
            "attack_ranged": "Standing Aim Bow Draw",
            "death": "Falling Back Death",
            "victory": "Victory",
            "working": "Digging",
            "praying": "Praying",
        },
        "instructions": [
            "1. Go to https://www.mixamo.com",
            "2. Sign in with Adobe account",
            "3. Click 'Upload Character' for each FBX file",
            "4. Wait for auto-rigging to complete",
            "5. Apply animations from the list above",
            "6. Download as FBX with skin",
            "7. Place in assets/units/rigged/"
        ]
    }

    for unit in units:
        if unit.fbx_path and unit.fbx_path.exists():
            batch_data["units"].append({
                "name": unit.name,
                "fbx_file": str(unit.fbx_path),
                "animations": unit.animations
            })

    with open(batch_file, "w") as f:
        json.dump(batch_data, f, indent=2)

    print(f"\nBatch file written: {batch_file}")
    return batch_file


def main():
    parser = argparse.ArgumentParser(description="Prepare units for Mixamo rigging")
    parser.add_argument("--prepare", action="store_true", help="Convert GLB to FBX")
    parser.add_argument("--upload", action="store_true", help="Upload to Mixamo")
    parser.add_argument("--list", action="store_true", help="List units by category")
    parser.add_argument("--token", type=str, help="Mixamo API token")
    args = parser.parse_args()

    # Scan units
    units = scan_units()

    if args.list or (not args.prepare and not args.upload):
        print("\n=== UNITS BY CATEGORY ===\n")

        current_category = None
        for unit in units:
            if unit.category != current_category:
                current_category = unit.category
                print(f"\n{current_category.upper()}:")

            size = unit.glb_path.stat().st_size // 1024
            print(f"  {unit.name}: {size}KB")

        humanoid_count = sum(1 for u in units if u.category == "humanoid")
        print(f"\n{humanoid_count} humanoid units ready for Mixamo rigging")
        return

    if args.prepare:
        print("\n=== PREPARING HUMANOID UNITS FOR MIXAMO ===\n")
        prepared = prepare_for_mixamo(units)

        print(f"\n{len(prepared)} units converted to FBX")

        # Generate batch file
        generate_mixamo_batch_file(prepared)

    if args.upload:
        token = args.token or os.environ.get("MIXAMO_TOKEN")
        if not token:
            print("Error: Mixamo token required. Set MIXAMO_TOKEN or use --token")
            sys.exit(1)

        humanoid_units = [u for u in units if u.category == "humanoid"]
        upload_to_mixamo(humanoid_units, token)


if __name__ == "__main__":
    main()
