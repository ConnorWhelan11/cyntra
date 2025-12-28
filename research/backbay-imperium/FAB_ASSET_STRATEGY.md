# Backbay Imperium - Fab Asset Strategy

> How to use the Fab pipeline to generate all game assets
>
> **Vibe**: Civ 5 intellectual classical modern — museum-quality presentation,
> historically grounded, warm earth tones, elegant and sophisticated.

---

## 1. Art Direction: "Classical Modernism"

### Visual Identity

**Core Aesthetic**:
- Clean, sophisticated presentation like a well-designed history textbook
- Warm earth palette: terracotta, ochre, bronze, deep blue-greens
- Classical architecture influences (Greek columns, Roman arches, Persian domes)
- Modern polish: subtle gradients, clean edges, consistent lighting
- "Museum quality" — every asset should feel like a curated artifact

**Reference Games**:
- Civ 5's painterly clarity
- Old World's sophisticated UI
- Humankind's crisp hex rendering

**What to Avoid**:
- Civ 6's cartoony style
- Mobile game visual noise
- Generic fantasy aesthetic
- Oversaturated colors

### Color Palette

```yaml
palette:
  # Primary (used for key elements)
  gold: "#C9A227"          # Prosperity, wealth, achievements
  bronze: "#B87333"        # Military, strength
  deep_blue: "#1E3A5F"     # Science, naval

  # Earth tones (terrain, architecture)
  terracotta: "#CD5C5C"
  ochre: "#CC7722"
  sandstone: "#D2B48C"
  slate: "#708090"

  # Nature (vegetation, resources)
  forest_green: "#228B22"
  olive: "#808000"
  wheat: "#F5DEB3"

  # Water
  coast_blue: "#4682B4"
  deep_ocean: "#191970"

  # UI backgrounds
  parchment: "#F5F5DC"
  aged_paper: "#E8DCC4"
  ink: "#2F2F2F"
```

---

## 2. Asset Categories & Generation Approach

### 2.1 Terrain Tiles (Hex)

**What we need**: 3D hex tiles rendered from isometric view for each terrain type.

| Terrain | Base Appearance | Features |
|---------|-----------------|----------|
| Plains | Golden grassland | Gentle rolling |
| Grassland | Lush green meadow | Flowers, thick grass |
| Hills | Elevated terrain | Rocky outcrops |
| Mountains | Impassable peaks | Snow caps, dramatic |
| Coast | Sandy shores | Beach, tide pools |
| Ocean | Deep water | Wave patterns |
| Desert | Sandy dunes | Heat shimmer |
| Tundra | Frozen plains | Sparse vegetation |
| Forest | Dense trees | Deciduous mix |
| Jungle | Tropical thick | Vines, palms |

**Generation Pipeline**:
```
world: terrain_tiles
├── Stage 1: Generate 3D hex meshes (Hunyuan3D)
│   - Prompt: "{terrain_type} terrain, game asset, hex tile shape"
│   - Post-process: Ensure flat bottom, hex boundary
├── Stage 2: Render from isometric camera (Blender)
│   - 8 rotation variants (for visual variety)
│   - With/without snow overlay
│   - Dawn/noon/dusk lighting variants
├── Stage 3: Gate (geometry + alignment)
│   - Must read as terrain type from render
│   - Seamless edge matching
└── Stage 4: Atlas packing (sprite sheets)
```

**Lookdev Scene**: `terrain_hex_lookdev_v001.blend`
- Orthographic camera at 45° isometric
- Soft directional light (sun simulation)
- Neutral background for clean silhouettes

---

### 2.2 Tile Improvements

**What we need**: Small 3D props that sit on hex tiles.

| Improvement | Visual | Tiers |
|-------------|--------|-------|
| Farm | Cultivated fields, crops | 3 (small → large plots) |
| Mine | Pit entrance, ore carts | 3 (open pit → shaft) |
| Lumber Mill | Sawmill building | 3 (hut → mill → factory) |
| Trading Post | Market stalls | 3 (tent → shop → bazaar) |
| Quarry | Stone extraction | 2 |
| Plantation | Cash crop rows | 2 |
| Pasture | Fenced animals | 2 |
| Camp | Resource extraction | 1 |
| Fort | Defensive structure | 1 |
| Road | Paved path | 2 (dirt → stone) |

**Generation Pipeline**:
```
world: improvements
├── Stage 1: Generate base 3D mesh (Hunyuan3D)
│   - Prompt: "{improvement} tier {n}, ancient/medieval/industrial style"
├── Stage 2: Place on hex tile and render (Blender)
│   - Combine with terrain tile underneath
│   - Multiple rotation variants
├── Stage 3: Gate (recognizability)
│   - CLIP must identify improvement type
└── Stage 4: Export as sprite + GLB
```

---

### 2.3 Resources

**What we need**: Small icon-sized 3D renders of resources.

**Strategic Resources** (military unlocks):
- Iron (ingots)
- Horses (horse head)
- Coal (black lumps)
- Oil (derrick/barrel)
- Uranium (glowing rods)

**Luxury Resources** (happiness):
- Gold (nuggets)
- Silver (bars)
- Gems (cut stones)
- Silk (fabric rolls)
- Spices (jars)
- Wine (amphorae)
- Incense (smoking burner)
- Ivory (tusks)
- Furs (pelts)
- Dyes (colored powders)

**Bonus Resources** (yields):
- Wheat (sheaves)
- Cattle (cow head)
- Fish (fish pile)
- Deer (antlers)
- Bananas (bunch)
- Stone (blocks)

**Generation Pipeline**:
```
world: resources
├── Stage 1: Generate 3D model (Hunyuan3D)
│   - Prompt: "{resource}, isolated object, clean background"
├── Stage 2: Render icon (Blender)
│   - Small turntable, soft lighting
│   - 64x64, 128x128, 256x256 sizes
├── Stage 3: Gate
│   - Recognizable at smallest size
└── Stage 4: Export as icon set
```

---

### 2.4 Units

**What we need**: 3D unit models rendered to sprite sheets.

**Military Units**:
| Unit | Era | Visual |
|------|-----|--------|
| Warrior | Ancient | Club, basic armor |
| Scout | Ancient | Light, fast |
| Archer | Ancient | Bow, leather |
| Spearman | Ancient | Spear, shield |
| Swordsman | Classical | Gladius, lorica |
| Horseman | Classical | Mounted, javelin |
| Catapult | Classical | Siege engine |
| Crossbowman | Medieval | Heavy crossbow |
| Knight | Medieval | Full plate, lance |
| Pikeman | Medieval | Pike formation |
| Musketman | Renaissance | Musket, uniform |
| Cavalry | Industrial | Saber, cavalry |
| Cannon | Industrial | Artillery |
| Infantry | Modern | Rifle, helmet |
| Tank | Modern | Armored vehicle |

**Civilian Units**:
- Settler (wagon, supplies)
- Worker (tools, cart)
- Great Person (robed figure with symbol)

**Generation Pipeline**:
```
world: units
├── Stage 1: Generate 3D character (Hunyuan3D)
│   - Prompt: "{unit_name}, {era} era soldier, game character"
│   - Separate prompt for weapon/equipment
├── Stage 2: Rig (Blender)
│   - Basic armature for poses
├── Stage 3: Render sprite sheet (Blender)
│   - 8 directions (N, NE, E, SE, S, SW, W, NW)
│   - 3 states: idle, move, attack
│   - 24 sprites per unit
├── Stage 4: Gate
│   - Unit type recognizable
│   - Era-appropriate
│   - Consistent style
└── Stage 5: Export sprite sheet + metadata
```

**Unit Lookdev Scene**: `unit_sprite_lookdev_v001.blend`
- Orthographic camera
- Rim light for silhouette clarity
- Neutral ground plane

---

### 2.5 Buildings (City Improvements)

**What we need**: 3D building icons for city screen.

| Building | Visual |
|----------|--------|
| Monument | Obelisk/statue |
| Granary | Storage building |
| Library | Scrolls/books |
| Barracks | Military structure |
| Walls | Fortification |
| Market | Bazaar stalls |
| Temple | Religious building |
| University | Academy |
| Factory | Smokestacks |
| Hospital | Red cross |

**Generation Pipeline**:
```
world: buildings
├── Stage 1: Generate 3D building (Hunyuan3D)
│   - Prompt: "{building_name}, ancient/medieval style, game icon"
├── Stage 2: Render icon (Blender)
│   - 3/4 view, dramatic lighting
│   - 128x128, 256x256 sizes
├── Stage 3: Gate
│   - Building function recognizable
└── Stage 4: Export icons
```

---

### 2.6 Wonders

**What we need**: Hero images of world wonders for construction and completion screens.

**Ancient Wonders**:
- Great Library (Alexandria)
- Pyramids (Giza)
- Stonehenge
- Oracle (Delphi)
- Colosseum (Rome)

**Medieval Wonders**:
- Notre Dame
- Forbidden Palace
- Machu Picchu
- Alhambra

**Generation Pipeline**:
```
world: wonders
├── Stage 1: Generate 3D wonder (Hunyuan3D)
│   - Prompt: detailed, "{wonder_name}, magnificent architecture"
├── Stage 2: Render hero shot (Blender)
│   - Dramatic golden hour lighting
│   - High resolution (1920x1080)
│   - Beauty pass + depth for parallax
├── Stage 3: Gate (architecture_realism)
│   - Must be recognizable as the wonder
│   - High aesthetic score
└── Stage 4: Export images + normal maps
```

---

### 2.7 Civilizations

**What we need**:
- Leader portraits (512x512 for diplomacy screen)
- Civ emblems (vector-style icons)
- Unique unit/building variants

**Leaders** (8-12 for launch):
| Civ | Leader | Visual Style |
|-----|--------|--------------|
| Rome | Trajan | Imperial toga, laurel |
| Greece | Pericles | Himation, beard |
| Egypt | Cleopatra | Royal headdress |
| Persia | Cyrus | Beard, crown |
| China | Wu Zetian | Imperial robes |
| England | Elizabeth | Tudor dress |
| Arabia | Harun | Caliph robes |
| Aztec | Montezuma | Feathered headdress |

**Generation Pipeline**:
```
world: civilizations
├── Stage 1: Generate leader portrait (SDXL)
│   - Style: Classical oil painting
│   - Prompt: "{leader_name}, {civ} ruler, dignified portrait"
├── Stage 2: Post-process (Blender compositing)
│   - Consistent lighting
│   - Background treatment
├── Stage 3: Gate (portrait quality)
│   - Face clearly visible
│   - Era-appropriate costume
│   - Dignified expression
└── Stage 4: Export portraits + background variants
```

---

### 2.8 UI Elements

**What we need**:
- Yield icons (food, production, gold, science, culture, faith)
- Tech icons (60-80 technologies)
- Policy icons
- Status icons (happiness, health, etc.)

**Generation Pipeline**:
```
world: ui_elements
├── Stage 1: Generate 3D objects (Hunyuan3D)
│   - Yield icons as symbolic objects
├── Stage 2: Render clean icons (Blender)
│   - 48x48, 64x64 sizes
│   - Consistent style
├── Stage 3: Gate
│   - Readable at small size
│   - Color consistency
└── Stage 4: Export icon atlas
```

---

## 3. World Configurations

### 3.1 `backbay_terrain.yaml`

```yaml
schema_version: "1.0"
world_id: backbay_terrain
world_type: hex_tiles
version: "1.0.0"

generator:
  name: "Backbay Imperium - Terrain Tiles"
  description: "Hex terrain tiles for 4X strategy game"

build:
  determinism:
    seed: 42
    pythonhashseed: 42

parameters:
  defaults:
    hex_radius: 1.0
    render_resolution: 256
    isometric_angle: 45

meshes:
  # Core terrain types
  - id: terrain_plains
    prompt: "flat grassland terrain, hex tile shape, golden wheat grass, top-down game asset, clean edges"
    category: terrain
    variants: 4
    tags: [terrain, plains, base]

  - id: terrain_grassland
    prompt: "lush green grassland hex tile, thick grass, wildflowers, top-down game asset"
    category: terrain
    variants: 4
    tags: [terrain, grassland, base]

  - id: terrain_hills
    prompt: "hilly terrain hex tile, elevated rocky outcrop, grass covered, top-down game asset"
    category: terrain
    variants: 4
    tags: [terrain, hills, base]

  - id: terrain_mountains
    prompt: "mountain peak hex tile, snow capped, dramatic rocky, top-down game asset, impassable"
    category: terrain
    variants: 4
    tags: [terrain, mountains, base]

  - id: terrain_coast
    prompt: "coastal beach hex tile, sandy shore, gentle waves, top-down game asset"
    category: terrain
    variants: 4
    tags: [terrain, coast, water]

  - id: terrain_ocean
    prompt: "deep ocean hex tile, dark blue water, wave texture, top-down game asset"
    category: terrain
    variants: 4
    tags: [terrain, ocean, water]

  - id: terrain_desert
    prompt: "sandy desert hex tile, golden dunes, arid, top-down game asset"
    category: terrain
    variants: 4
    tags: [terrain, desert, base]

  - id: terrain_tundra
    prompt: "frozen tundra hex tile, snow patches, sparse vegetation, top-down game asset"
    category: terrain
    variants: 4
    tags: [terrain, tundra, base]

stages:
  - id: generate_terrain
    type: comfyui_batch
    workflow: fab/workflows/comfyui/hunyuan3d_hex.json
    outputs: ["mesh.glb"]

  - id: render_tiles
    type: blender
    requires: [generate_terrain]
    script: fab/backbay-imperium/scripts/render_hex_tiles.py
    settings:
      camera: orthographic_45
      resolution: [256, 256]
      variants_per_tile: 8
      lighting_modes: [day, dusk]

  - id: validate_terrain
    type: gate
    requires: [render_tiles]
    gates:
      - fab/gates/backbay_terrain_v001.yaml

  - id: pack_atlas
    type: python
    requires: [validate_terrain]
    script: fab/backbay-imperium/scripts/pack_terrain_atlas.py

publish:
  sprites:
    path: fab/backbay-imperium/assets/terrain/sprites
  meshes:
    path: fab/backbay-imperium/assets/terrain/meshes
  atlas:
    path: fab/backbay-imperium/assets/terrain/atlas.png
```

### 3.2 `backbay_units.yaml`

```yaml
schema_version: "1.0"
world_id: backbay_units
world_type: characters
version: "1.0.0"

generator:
  name: "Backbay Imperium - Unit Sprites"
  description: "Military and civilian unit sprite sheets"

parameters:
  defaults:
    sprite_size: 64
    directions: 8
    animation_frames: 3

meshes:
  # Ancient Era
  - id: unit_warrior
    prompt: "ancient warrior, club weapon, leather armor, barbaric, game character"
    category: military
    era: ancient
    tags: [melee, basic]

  - id: unit_scout
    prompt: "ancient scout, light leather, bow on back, fast runner, game character"
    category: military
    era: ancient
    tags: [recon, fast]

  - id: unit_archer
    prompt: "ancient archer, short bow, leather tunic, quiver of arrows, game character"
    category: military
    era: ancient
    tags: [ranged, basic]

  - id: unit_spearman
    prompt: "ancient spearman, bronze spear, round shield, leather armor, game character"
    category: military
    era: ancient
    tags: [melee, anti-cavalry]

  # Classical Era
  - id: unit_swordsman
    prompt: "roman legionary, gladius sword, rectangular scutum shield, lorica armor, game character"
    category: military
    era: classical
    tags: [melee, heavy]

  - id: unit_horseman
    prompt: "ancient cavalry, mounted warrior, javelin, light armor, horse, game character"
    category: military
    era: classical
    tags: [mounted, fast]

  # Civilian
  - id: unit_settler
    prompt: "settler, covered wagon, pioneer family, supplies, game character group"
    category: civilian
    era: ancient
    tags: [civilian, founder]

  - id: unit_worker
    prompt: "ancient worker, simple tunic, carrying tools, shovel pickaxe, game character"
    category: civilian
    era: ancient
    tags: [civilian, builder]

stages:
  - id: generate_units
    type: comfyui_batch
    workflow: fab/workflows/comfyui/hunyuan3d_character.json

  - id: rig_units
    type: blender
    requires: [generate_units]
    script: fab/backbay-imperium/scripts/rig_unit.py

  - id: render_sprites
    type: blender
    requires: [rig_units]
    script: fab/backbay-imperium/scripts/render_unit_sprites.py
    settings:
      directions: 8
      animations: [idle, walk, attack]
      frames_per_animation: 3

  - id: validate_units
    type: gate
    requires: [render_sprites]
    gates:
      - fab/gates/backbay_unit_v001.yaml

  - id: pack_spritesheets
    type: python
    requires: [validate_units]
    script: fab/backbay-imperium/scripts/pack_unit_spritesheet.py

publish:
  sprites:
    path: fab/backbay-imperium/assets/units/sprites
  spritesheets:
    path: fab/backbay-imperium/assets/units/sheets
```

### 3.3 `backbay_leaders.yaml`

```yaml
schema_version: "1.0"
world_id: backbay_leaders
world_type: portraits
version: "1.0.0"

generator:
  name: "Backbay Imperium - Leader Portraits"
  description: "Civilization leader portraits for diplomacy"

parameters:
  defaults:
    style: "classical oil painting, dignified portrait, warm lighting"
    resolution: 512

leaders:
  - id: leader_rome_trajan
    civ: rome
    name: "Trajan"
    prompt: "Emperor Trajan portrait, Roman emperor, imperial purple toga, golden laurel wreath, dignified expression, classical oil painting style, warm museum lighting"
    background: "marble columns, roman eagle standard"

  - id: leader_greece_pericles
    civ: greece
    name: "Pericles"
    prompt: "Pericles portrait, Athenian statesman, white himation robe, distinguished beard, thoughtful expression, classical oil painting, Parthenon background"
    background: "greek columns, olive branch"

  - id: leader_egypt_cleopatra
    civ: egypt
    name: "Cleopatra"
    prompt: "Cleopatra VII portrait, Egyptian queen, golden uraeus crown, kohl eyes, elegant, classical oil painting style, luxurious"
    background: "hieroglyphics, Nile river"

  - id: leader_persia_cyrus
    civ: persia
    name: "Cyrus"
    prompt: "Cyrus the Great portrait, Persian emperor, ornate crown, royal robes, noble bearing, classical oil painting style"
    background: "persian architecture, lion motif"

  - id: leader_china_wu
    civ: china
    name: "Wu Zetian"
    prompt: "Empress Wu Zetian portrait, Tang dynasty ruler, imperial dragon robes, phoenix crown, regal, classical oil painting style"
    background: "chinese palace, dragon imagery"

  - id: leader_england_elizabeth
    civ: england
    name: "Elizabeth I"
    prompt: "Queen Elizabeth I portrait, Tudor monarch, ornate ruff collar, pearl jewelry, commanding presence, classical oil painting"
    background: "english rose, royal seal"

  - id: leader_arabia_harun
    civ: arabia
    name: "Harun al-Rashid"
    prompt: "Caliph Harun al-Rashid portrait, Abbasid ruler, ornate turban, flowing robes, wise expression, classical oil painting"
    background: "islamic geometric patterns, crescent moon"

  - id: leader_aztec_montezuma
    civ: aztec
    name: "Montezuma"
    prompt: "Emperor Montezuma portrait, Aztec ruler, elaborate quetzal feather headdress, jade jewelry, fierce dignity, classical oil painting"
    background: "aztec pyramid, jaguar warrior"

stages:
  - id: generate_portraits
    type: comfyui_batch
    workflow: fab/workflows/comfyui/sdxl_portrait.json
    settings:
      resolution: [512, 512]
      steps: 30
      cfg: 7.5

  - id: composite_backgrounds
    type: blender
    requires: [generate_portraits]
    script: fab/backbay-imperium/scripts/composite_leader.py

  - id: validate_portraits
    type: gate
    requires: [composite_backgrounds]
    gates:
      - fab/gates/backbay_portrait_v001.yaml

publish:
  portraits:
    path: fab/backbay-imperium/assets/leaders
    variants: [full, bust, icon]
```

---

## 4. Gate Configurations

### 4.1 `backbay_terrain_v001.yaml`

```yaml
gate_config_id: backbay_terrain_v001
category: hex_terrain
schema_version: "1.0"

render:
  engine: CYCLES
  device: CPU
  resolution: [256, 256]
  samples: 64
  seed: 1337

critics:
  category:
    enabled: true
    per_view_conf_min: 0.5
    target_classes:
      - terrain
      - landscape
      - ground
      - nature
    excluded_classes:
      - building
      - vehicle
      - person

  alignment:
    enabled: true
    clip_model: "ViT-L/14"
    margin_min: 0.05

  geometry:
    enabled: true
    bounds_m:
      width: [0.9, 1.1]   # Hex should be ~1m
      height: [0.01, 0.5]  # Low profile
    hex_conformance:
      enabled: true
      tolerance: 0.05     # 5% deviation from hex shape
    edge_seamless:
      enabled: true
      max_gap: 0.01

decision:
  weights:
    category: 0.30
    alignment: 0.30
    geometry: 0.40
  overall_pass_min: 0.65

hard_fail_codes:
  - IMPORT_FAILED
  - NOT_HEX_SHAPE
  - EDGES_NOT_SEAMLESS
```

### 4.2 `backbay_unit_v001.yaml`

```yaml
gate_config_id: backbay_unit_v001
category: game_character
schema_version: "1.0"

render:
  engine: CYCLES
  device: CPU
  resolution: [64, 64]
  samples: 32
  seed: 1337

critics:
  category:
    enabled: true
    per_view_conf_min: 0.4
    target_classes:
      - soldier
      - warrior
      - person
      - character
    excluded_classes:
      - vehicle
      - building
      - landscape

  alignment:
    enabled: true
    clip_model: "ViT-L/14"
    # Check era-appropriate
    era_consistency:
      enabled: true
      allowed_anachronisms: 0

  silhouette:
    enabled: true
    readability_at_64px: 0.7
    distinct_from_other_units: 0.3

  animation:
    enabled: true
    frame_consistency: 0.9
    movement_smoothness: 0.8

decision:
  weights:
    category: 0.25
    alignment: 0.25
    silhouette: 0.30
    animation: 0.20
  overall_pass_min: 0.60

repair_playbook:
  SILHOUETTE_TOO_SIMILAR:
    priority: 1
    instructions: |
      Make unit more visually distinct:
      - Exaggerate weapon/shield shape
      - Add more era-specific details
      - Adjust pose for clearer silhouette
```

---

## 5. Lookdev Scenes

### 5.1 Terrain Hex Lookdev

```python
# fab/backbay-imperium/lookdev/terrain_hex_lookdev_v001.py
"""
Blender scene setup for hex terrain tile rendering.
Orthographic isometric view with soft lighting.
"""

import bpy
import math

def setup_scene():
    # Clear default scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Create orthographic camera at 45° isometric
    bpy.ops.object.camera_add(location=(5, -5, 5))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.0
    camera.rotation_euler = (math.radians(54.736), 0, math.radians(45))
    bpy.context.scene.camera = camera

    # Sun light (key light)
    bpy.ops.object.light_add(type='SUN', location=(10, -10, 20))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(45), math.radians(15), 0)

    # Fill light (soft)
    bpy.ops.object.light_add(type='AREA', location=(-5, 5, 8))
    fill = bpy.context.object
    fill.data.energy = 50.0
    fill.data.size = 10.0

    # Render settings
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.device = 'CPU'
    bpy.context.scene.cycles.samples = 64
    bpy.context.scene.render.resolution_x = 256
    bpy.context.scene.render.resolution_y = 256
    bpy.context.scene.render.film_transparent = True

    # Deterministic seed
    bpy.context.scene.cycles.seed = 1337

if __name__ == "__main__":
    setup_scene()
```

### 5.2 Unit Sprite Lookdev

```python
# fab/backbay-imperium/lookdev/unit_sprite_lookdev_v001.py
"""
Blender scene setup for unit sprite rendering.
8-direction orthographic with rim lighting for clear silhouettes.
"""

import bpy
import math

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Orthographic camera (top-down angled)
    bpy.ops.object.camera_add(location=(0, -3, 2))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.5
    camera.rotation_euler = (math.radians(60), 0, 0)
    bpy.context.scene.camera = camera

    # Key light
    bpy.ops.object.light_add(type='SUN', location=(5, -5, 10))
    key = bpy.context.object
    key.data.energy = 2.5
    key.rotation_euler = (math.radians(50), math.radians(20), 0)

    # Rim light (for silhouette clarity)
    bpy.ops.object.light_add(type='SPOT', location=(-3, 3, 4))
    rim = bpy.context.object
    rim.data.energy = 200.0
    rim.data.spot_size = math.radians(60)
    rim.rotation_euler = (math.radians(45), 0, math.radians(-135))

    # Render settings
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.samples = 32
    bpy.context.scene.render.resolution_x = 64
    bpy.context.scene.render.resolution_y = 64
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.cycles.seed = 1337

def render_8_directions(unit_obj, output_dir):
    """Render unit from 8 compass directions."""
    directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for i, direction in enumerate(directions):
        unit_obj.rotation_euler.z = math.radians(i * 45)
        bpy.context.scene.render.filepath = f"{output_dir}/{direction}.png"
        bpy.ops.render.render(write_still=True)
```

---

## 6. Directory Structure

```
fab/backbay-imperium/
├── worlds/
│   ├── terrain/world.yaml
│   ├── improvements/world.yaml
│   ├── resources/world.yaml
│   ├── units/world.yaml
│   ├── buildings/world.yaml
│   ├── wonders/world.yaml
│   ├── leaders/world.yaml
│   └── ui/world.yaml
├── gates/
│   ├── terrain_v001.yaml
│   ├── unit_v001.yaml
│   ├── portrait_v001.yaml
│   └── icon_v001.yaml
├── lookdev/
│   ├── terrain_hex_lookdev_v001.blend
│   ├── unit_sprite_lookdev_v001.blend
│   ├── building_icon_lookdev_v001.blend
│   └── portrait_lookdev_v001.blend
├── scripts/
│   ├── render_hex_tiles.py
│   ├── render_unit_sprites.py
│   ├── pack_terrain_atlas.py
│   ├── pack_unit_spritesheet.py
│   └── composite_leader.py
├── assets/              # Generated output
│   ├── terrain/
│   │   ├── sprites/
│   │   ├── meshes/
│   │   └── atlas.png
│   ├── units/
│   │   ├── sprites/
│   │   └── sheets/
│   ├── buildings/
│   ├── wonders/
│   ├── leaders/
│   └── ui/
└── data/               # Source definitions
    ├── terrains.yaml
    ├── units.yaml
    ├── buildings.yaml
    ├── techs.yaml
    └── civs.yaml
```

---

## 7. Generation Commands

```bash
# Generate all terrain tiles
python -m cyntra.fab.world --world backbay_terrain --run-id terrain_v1

# Generate all units
python -m cyntra.fab.world --world backbay_units --run-id units_v1

# Generate leader portraits
python -m cyntra.fab.world --world backbay_leaders --run-id leaders_v1

# Generate everything (full asset pipeline)
python -m cyntra.fab.world \
  --world backbay_terrain \
  --world backbay_improvements \
  --world backbay_resources \
  --world backbay_units \
  --world backbay_buildings \
  --world backbay_wonders \
  --world backbay_leaders \
  --world backbay_ui \
  --run-id full_v1

# Validate existing assets against gates
fab-gate --config fab/gates/backbay_terrain_v001.yaml \
  --asset fab/backbay-imperium/assets/terrain/meshes/*.glb
```

---

## 8. Integration with Game

### 8.1 Asset Manifest

The Fab pipeline generates a manifest that the Rust core can load:

```yaml
# fab/backbay-imperium/assets/manifest.yaml
version: "1.0.0"
generated_at: "2024-12-27T10:00:00Z"

terrain:
  atlas: "terrain/atlas.png"
  tile_size: [256, 256]
  tiles:
    plains:
      index: 0
      variants: 4
    grassland:
      index: 4
      variants: 4
    # ...

units:
  sheets:
    warrior:
      file: "units/sheets/warrior.png"
      frame_size: [64, 64]
      directions: 8
      animations:
        idle: [0, 1, 2]
        walk: [3, 4, 5]
        attack: [6, 7, 8]
    # ...

leaders:
  portraits:
    rome_trajan:
      full: "leaders/rome_trajan_full.png"
      bust: "leaders/rome_trajan_bust.png"
      icon: "leaders/rome_trajan_icon.png"
    # ...
```

### 8.2 Godot Resource Loading

```gdscript
# assets/scripts/asset_loader.gd
extends Node

var manifest: Dictionary
var terrain_atlas: Texture2D
var unit_sheets: Dictionary = {}

func _ready():
    load_manifest()
    load_terrain()
    load_units()

func load_manifest():
    var file = FileAccess.open("res://assets/manifest.yaml", FileAccess.READ)
    manifest = parse_yaml(file.get_as_text())

func load_terrain():
    terrain_atlas = load(manifest.terrain.atlas)

func get_terrain_region(terrain_type: String, variant: int = 0) -> Rect2:
    var tile_data = manifest.terrain.tiles[terrain_type]
    var index = tile_data.index + (variant % tile_data.variants)
    var tile_size = manifest.terrain.tile_size
    var cols = terrain_atlas.get_width() / tile_size[0]
    var row = index / cols
    var col = index % cols
    return Rect2(col * tile_size[0], row * tile_size[1], tile_size[0], tile_size[1])

func get_unit_frame(unit_type: String, direction: int, animation: String, frame: int) -> Rect2:
    var sheet_data = manifest.units.sheets[unit_type]
    var frame_size = sheet_data.frame_size
    var anim_frames = sheet_data.animations[animation]
    var anim_frame = anim_frames[frame % anim_frames.size()]
    var col = direction + (anim_frame * 8)  # 8 directions per row
    return Rect2(col * frame_size[0], 0, frame_size[0], frame_size[1])
```

---

## 9. Style Consistency System

To ensure all assets feel cohesive, use a **style transfer gate** that compares generated assets against reference images.

### 9.1 Style Reference Pack

Create a small pack of hand-curated reference images that define the "Backbay Imperium look":

```yaml
# fab/backbay-imperium/style_reference/manifest.yaml
style_id: backbay_classical_modern_v001

references:
  terrain:
    - reference_plains_01.png
    - reference_coast_01.png
  units:
    - reference_roman_soldier_01.png
    - reference_medieval_knight_01.png
  buildings:
    - reference_library_01.png
    - reference_temple_01.png
  portraits:
    - reference_roman_emperor_01.png
    - reference_egyptian_queen_01.png

style_features:
  color_temperature: warm
  saturation: moderate
  contrast: medium-high
  detail_level: refined
  rendering_style: painterly_realistic
```

### 9.2 Style Gate

```yaml
# fab/gates/backbay_style_v001.yaml
gate_config_id: backbay_style_v001
category: style_consistency

critics:
  style_transfer:
    enabled: true
    reference_pack: fab/backbay-imperium/style_reference/manifest.yaml
    embedding_model: "ViT-L/14"
    min_similarity: 0.65

  color_analysis:
    enabled: true
    palette_adherence: 0.7
    temperature_range: [4500, 6500]  # Warm daylight

  detail_consistency:
    enabled: true
    edge_density_range: [0.02, 0.08]
    texture_complexity_range: [0.3, 0.7]
```

---

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2024-12-27 | Initial strategy document |
