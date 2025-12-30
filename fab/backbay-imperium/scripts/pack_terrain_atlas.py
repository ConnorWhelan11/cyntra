#!/usr/bin/env python3
"""
Pack terrain sprites into an atlas with metadata.
"""

import os
import sys
import json
import yaml
from pathlib import Path
from PIL import Image
from dataclasses import dataclass
from typing import List, Dict, Tuple


@dataclass
class SpriteInfo:
    """Information about a sprite in the atlas."""
    name: str
    terrain_type: str
    variant: int
    rotation: int
    lighting: str
    x: int
    y: int
    width: int
    height: int


def find_sprites(sprite_dir: Path) -> List[Path]:
    """Find all sprite PNG files."""
    return sorted(sprite_dir.glob("*.png"))


def parse_sprite_name(name: str) -> Dict:
    """Parse sprite filename to extract metadata."""
    # Expected format: terrain_plains_v00_day_rot00.png
    parts = name.replace(".png", "").split("_")

    result = {
        "terrain_type": "unknown",
        "variant": 0,
        "lighting": "day",
        "rotation": 0,
    }

    for i, part in enumerate(parts):
        if part.startswith("v") and part[1:].isdigit():
            result["variant"] = int(part[1:])
        elif part.startswith("rot") and part[3:].isdigit():
            result["rotation"] = int(part[3:])
        elif part in ["day", "dusk", "night"]:
            result["lighting"] = part
        elif part not in ["terrain", "feature"]:
            if result["terrain_type"] == "unknown":
                result["terrain_type"] = part

    return result


def create_atlas(
    sprites: List[Path],
    output_path: Path,
    sprite_size: Tuple[int, int] = (256, 256),
    atlas_size: int = 4096
) -> Tuple[Image.Image, List[SpriteInfo]]:
    """Create atlas from sprites."""

    cols = atlas_size // sprite_size[0]
    rows = (len(sprites) + cols - 1) // cols
    actual_height = rows * sprite_size[1]

    # Create atlas image
    atlas = Image.new('RGBA', (atlas_size, actual_height), (0, 0, 0, 0))

    sprite_infos = []

    for i, sprite_path in enumerate(sprites):
        col = i % cols
        row = i // cols
        x = col * sprite_size[0]
        y = row * sprite_size[1]

        # Load and resize sprite
        sprite = Image.open(sprite_path).convert('RGBA')
        if sprite.size != sprite_size:
            sprite = sprite.resize(sprite_size, Image.Resampling.LANCZOS)

        # Paste into atlas
        atlas.paste(sprite, (x, y))

        # Parse metadata
        meta = parse_sprite_name(sprite_path.name)

        info = SpriteInfo(
            name=sprite_path.stem,
            terrain_type=meta["terrain_type"],
            variant=meta["variant"],
            rotation=meta["rotation"],
            lighting=meta["lighting"],
            x=x,
            y=y,
            width=sprite_size[0],
            height=sprite_size[1],
        )
        sprite_infos.append(info)

    # Save atlas
    atlas.save(output_path)

    return atlas, sprite_infos


def generate_manifest(
    sprite_infos: List[SpriteInfo],
    atlas_path: Path,
    sprite_size: Tuple[int, int],
    output_path: Path
):
    """Generate manifest YAML for the atlas."""

    # Group by terrain type
    terrain_data = {}
    for info in sprite_infos:
        if info.terrain_type not in terrain_data:
            terrain_data[info.terrain_type] = {
                "sprites": [],
                "variants": set(),
                "rotations": set(),
            }

        terrain_data[info.terrain_type]["sprites"].append({
            "name": info.name,
            "variant": info.variant,
            "rotation": info.rotation,
            "lighting": info.lighting,
            "uv": {
                "x": info.x,
                "y": info.y,
                "w": info.width,
                "h": info.height,
            }
        })
        terrain_data[info.terrain_type]["variants"].add(info.variant)
        terrain_data[info.terrain_type]["rotations"].add(info.rotation)

    # Convert sets to lists for YAML
    for t in terrain_data:
        terrain_data[t]["variants"] = sorted(terrain_data[t]["variants"])
        terrain_data[t]["rotations"] = sorted(terrain_data[t]["rotations"])

    manifest = {
        "version": "1.0.0",
        "atlas": {
            "file": atlas_path.name,
            "width": sprite_size[0] * 16,  # Approximate
            "height": len(sprite_infos) // 16 * sprite_size[1],
        },
        "sprite_size": {
            "width": sprite_size[0],
            "height": sprite_size[1],
        },
        "terrain_types": terrain_data,
    }

    with open(output_path, 'w') as f:
        yaml.dump(manifest, f, default_flow_style=False)

    return manifest


def main():
    if len(sys.argv) < 3:
        print("Usage: python pack_terrain_atlas.py <sprite_dir> <output_dir>")
        sys.exit(1)

    sprite_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Scanning sprites in: {sprite_dir}")
    sprites = find_sprites(sprite_dir)
    print(f"Found {len(sprites)} sprites")

    if not sprites:
        print("No sprites found!")
        sys.exit(1)

    # Create atlas
    atlas_path = output_dir / "terrain_atlas.png"
    print(f"Creating atlas: {atlas_path}")

    atlas, sprite_infos = create_atlas(sprites, atlas_path)
    print(f"Atlas size: {atlas.size}")

    # Generate manifest
    manifest_path = output_dir / "terrain_manifest.yaml"
    print(f"Generating manifest: {manifest_path}")

    manifest = generate_manifest(sprite_infos, atlas_path, (256, 256), manifest_path)

    print(f"\nSummary:")
    print(f"  Terrain types: {len(manifest['terrain_types'])}")
    print(f"  Total sprites: {len(sprite_infos)}")
    print(f"  Atlas: {atlas_path}")
    print(f"  Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
