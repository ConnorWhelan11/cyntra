# Backbay Imperium - Asset Pipeline

> Fab pipeline configuration for generating all game assets for Backbay Imperium,
> a Civ 5-style 4X strategy game.

## Quick Start

```bash
# Set your RunPod API key
export RUNPOD_API_KEY="rpa_7UZ1DB6HZ3QMTGSZRY47CO6T6DYUA6EAYZIWJACE1p2ofd"

# Run full asset generation (~$2, ~5 days)
python scripts/orchestrate.py --phase all

# Or run individual phases
python scripts/orchestrate.py --phase materials  # 6h, $0.06
python scripts/orchestrate.py --phase terrain    # 12h, $0.36
python scripts/orchestrate.py --phase units      # 16h, $0.48
python scripts/orchestrate.py --phase buildings  # 14h, $0.42
python scripts/orchestrate.py --phase leaders    # 6h, $0.06
python scripts/orchestrate.py --phase resources  # 4h, $0.04
```

## Directory Structure

```
backbay-imperium/
├── worlds/              # Asset generation configs
│   ├── terrain.yaml     # 58 hex terrain meshes
│   ├── units.yaml       # 32 unit types
│   ├── buildings.yaml   # 27 buildings + 12 wonders
│   ├── leaders.yaml     # 12 leader portraits
│   ├── materials.yaml   # 45 PBR materials
│   └── resources.yaml   # 30 resource icons
├── gates/               # Quality validation configs
│   ├── terrain_v001.yaml
│   ├── unit_v001.yaml
│   ├── portrait_v001.yaml
│   └── material_v001.yaml
├── workflows/           # ComfyUI workflow JSONs
│   ├── hunyuan3d_hex_terrain.json
│   ├── hunyuan3d_character.json
│   ├── sdxl_portrait.json
│   └── chord_material.json
├── scripts/             # Pipeline scripts
│   ├── orchestrate.py   # Main orchestrator
│   ├── render_hex_sprites.py
│   ├── render_unit_sprites.py
│   └── pack_terrain_atlas.py
├── data/                # Game data definitions
│   ├── civilizations.yaml
│   └── technologies.yaml
└── assets/              # Generated output
    ├── terrain/
    ├── units/
    ├── buildings/
    ├── wonders/
    ├── leaders/
    ├── materials/
    └── resources/
```

## Asset Summary

| Category | Count | Format | Resolution |
|----------|-------|--------|------------|
| Terrain tiles | 58 × 8 rot × 2 light = 928 | PNG sprites | 256×256 |
| Units | 32 × 8 dir × 9 frames = 2304 | PNG sprites | 64×64 |
| Buildings | 27 | PNG icons | 128×128 |
| Wonders | 12 | PNG hero images | 1920×1080 |
| Leaders | 12 × 5 variants = 60 | PNG portraits | 512×512 |
| Materials | 45 × 5 maps = 225 | PNG PBR maps | 2048×2048 |
| Resources | 30 | PNG icons | 64×64 |
| **Total** | **~3,600 files** | | |

## RunPod Infrastructure

| Pod | GPU | Role | Hourly |
|-----|-----|------|--------|
| nitrogen-172227 | H100 SXM | Hunyuan3D (terrain, buildings) | $0.03 |
| nitrogen-171140 | H100 SXM | Hunyuan3D (units) | $0.03 |
| healthy_gold_sturgeon | H100 PCIe | SDXL (portraits) | $0.01 |
| galliform-migration | RTX 4090 | CHORD (materials) | $0.01 |
| galliform | RTX 4090 | Blender (rendering) | $0.01 |

## Art Direction

**Style**: Classical Modernism - museum-quality presentation, historically grounded,
warm earth tones, elegant and sophisticated.

**Color Palette**:
- Gold: `#C9A227` (prosperity, achievements)
- Bronze: `#B87333` (military, strength)
- Deep Blue: `#1E3A5F` (science, naval)
- Terracotta: `#CD5C5C` (architecture)
- Forest Green: `#228B22` (nature)

**Reference**: Think Civ 5's painterly clarity meets Old World's sophisticated UI.

## Quality Gates

Each asset type runs through validation gates:

- **Terrain**: Hex shape conformance, seamless edges, terrain type recognition
- **Units**: Era-appropriate equipment, silhouette readability, humanoid proportions
- **Portraits**: Face quality, historical costume accuracy, classical painting style
- **Materials**: Seamless tiling, PBR physical correctness, style consistency

Failed assets are flagged for regeneration with repair instructions.

## Integration

Generated assets include manifests for loading into Godot/Rust:

```yaml
# terrain/manifest.yaml
terrain_types:
  plains:
    sprites: [plains_day_rot00.png, ...]
    variants: 4
    yields: { food: 1, production: 1 }
```

## Development

```bash
# Test single asset generation
python scripts/orchestrate.py --phase terrain --assets terrain_plains

# Validate existing assets
fab-gate --config gates/terrain_v001.yaml --assets assets/terrain/

# Pack sprites into atlas
python scripts/pack_terrain_atlas.py assets/terrain/sprites assets/terrain/
```

## License

Assets generated for Backbay Imperium project.
