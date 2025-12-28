# Backbay Imperium - Asset Generation Execution Plan

> Comprehensive plan for generating all game assets using RunPod GPU infrastructure.

---

## 1. Infrastructure Overview

### Available RunPod Instances

| Pod Name | ID | GPU | Cost | Best For |
|----------|-----|-----|------|----------|
| nitrogen-server-172227 | a7ngyriuo51nw | H100 SXM | $0.03/hr | Hunyuan3D (3D mesh generation) |
| nitrogen-server-171140 | 5dnmft0dzhevu9 | H100 SXM | $0.03/hr | Hunyuan3D (parallel batch) |
| healthy_gold_sturgeon | xyi9t1kbl7ll36 | H100 PCIe | $0.01/hr | SDXL (portraits, textures) |
| sympathetic_amethyst_galliform-migration | 1plxkvbhkv0zd3 | RTX 4090 | $0.01/hr | CHORD (materials) |
| sympathetic_amethyst_galliform | knzczmzw8ezt1c | RTX 4090 | $0.01/hr | Blender rendering |

### Pod Assignment Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│  H100 SXM #1 (nitrogen-172227)         H100 SXM #2 (nitrogen-171140)    │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐   │
│  │ ComfyUI + Hunyuan3D v2.0    │      │ ComfyUI + Hunyuan3D v2.0    │   │
│  │ - Terrain meshes            │      │ - Unit meshes               │   │
│  │ - Improvement meshes        │      │ - Building meshes           │   │
│  │ - Resource meshes           │      │ - Wonder meshes             │   │
│  └─────────────────────────────┘      └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  H100 PCIe (healthy_gold)              RTX 4090 #1 (galliform-migration)│
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐   │
│  │ ComfyUI + SDXL              │      │ ComfyUI + CHORD Turbo       │   │
│  │ - Leader portraits          │      │ - PBR materials             │   │
│  │ - Wonder hero images        │      │ - Terrain textures          │   │
│  │ - Tech tree icons           │      │ - UI elements               │   │
│  └─────────────────────────────┘      └─────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  RTX 4090 #2 (galliform)                                                │
│  ┌─────────────────────────────┐                                        │
│  │ Blender + Cycles GPU        │                                        │
│  │ - Sprite rendering          │                                        │
│  │ - Icon rendering            │                                        │
│  │ - Atlas generation          │                                        │
│  └─────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Software Stack Setup

### 2.1 ComfyUI Pods (H100 SXM, H100 PCIe, RTX 4090 #1)

**Base Template**: `runpod/pytorch:2.1.0-py3.10-cuda12.1.0-devel-ubuntu22.04`

**Required Models**:
```yaml
models:
  hunyuan3d:
    - tencent/Hunyuan3D-2
    - weights/hunyuan3d_v2.0.safetensors
  sdxl:
    - stabilityai/stable-diffusion-xl-base-1.0
    - stabilityai/stable-diffusion-xl-refiner-1.0
  chord:
    - chord/material_generator_turbo
  clip:
    - openai/clip-vit-large-patch14
  controlnet:
    - controlnet/canny
    - controlnet/depth
```

**Setup Script** (`setup_comfyui.sh`):
```bash
#!/bin/bash
set -e

# Install ComfyUI
cd /workspace
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt

# Install custom nodes
cd custom_nodes
git clone https://github.com/Tencent/Hunyuan3D-2
git clone https://github.com/ltdrdata/ComfyUI-Manager
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus

# Download models
cd /workspace/ComfyUI/models
huggingface-cli download tencent/Hunyuan3D-2 --local-dir ./hunyuan3d
huggingface-cli download stabilityai/stable-diffusion-xl-base-1.0 --local-dir ./checkpoints/sdxl

# Start ComfyUI
cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

### 2.2 Blender Pod (RTX 4090 #2)

**Base Template**: `linuxserver/blender:4.2.0`

**Setup Script** (`setup_blender.sh`):
```bash
#!/bin/bash
set -e

# Install Blender
apt-get update
apt-get install -y blender python3-pip

# Install Python dependencies
pip install bpy mathutils numpy pillow pyyaml

# Clone asset scripts
cd /workspace
git clone https://github.com/your-org/backbay-imperium-fab.git
cd backbay-imperium-fab

# Enable GPU rendering
blender -b --python-expr "
import bpy
prefs = bpy.context.preferences
prefs.addons['cycles'].preferences.compute_device_type = 'CUDA'
prefs.addons['cycles'].preferences.get_devices()
for device in prefs.addons['cycles'].preferences.devices:
    device.use = True
bpy.ops.wm.save_userpref()
"
```

---

## 3. Asset Generation Phases

### Phase 1: Materials & Textures (Day 1)

**Pod**: RTX 4090 #1 (CHORD Turbo)
**Estimated Time**: 4-6 hours
**Cost**: ~$0.06

**Assets to Generate**:
```yaml
materials:
  terrain:
    - grass_meadow
    - grass_dry
    - dirt_forest
    - sand_beach
    - gravel_path
    - rock_granite
    - snow_fresh
    - mud_wet
  architecture:
    - brick_red
    - brick_weathered
    - stone_castle
    - marble_white
    - plaster_cream
    - wood_planks
    - thatch_roof
    - slate_roof
  metal:
    - bronze_polished
    - bronze_patina
    - iron_forged
    - gold_ornate
    - silver_tarnished
  organic:
    - bark_oak
    - leaves_green
    - leaves_autumn
    - water_surface

total_materials: 28
time_per_material: ~10 minutes
```

**Command**:
```bash
# On local machine
python -m cyntra.fab.world \
  --world backbay_materials \
  --run-id materials_v1 \
  --comfyui-host nitrogen-172227.runpod.io \
  --comfyui-port 8188
```

### Phase 2: Terrain Hex Meshes (Day 1-2)

**Pod**: H100 SXM #1 (Hunyuan3D)
**Estimated Time**: 8-12 hours
**Cost**: ~$0.36

**Assets to Generate**:
```yaml
terrain_meshes:
  base_types:
    - plains (4 variants)
    - grassland (4 variants)
    - hills (4 variants)
    - mountains (4 variants)
    - coast (4 variants)
    - ocean (4 variants)
    - desert (4 variants)
    - tundra (4 variants)
    - marsh (4 variants)
    - jungle (4 variants)

  features:
    - forest_deciduous (3 variants)
    - forest_conifer (3 variants)
    - jungle_dense (3 variants)
    - river_segment (4 variants)
    - oasis (2 variants)
    - volcanic (2 variants)

total_meshes: 58
time_per_mesh: ~8-12 minutes (Hunyuan3D)
```

**Workflow**: `hunyuan3d_hex_terrain.json`
```json
{
  "nodes": {
    "text_prompt": {
      "class": "CLIPTextEncode",
      "inputs": {
        "text": "{terrain_type} terrain, hexagonal tile, game asset, top-down view, clean edges, {style}"
      }
    },
    "hunyuan3d": {
      "class": "Hunyuan3DGenerate",
      "inputs": {
        "prompt": "{{text_prompt}}",
        "steps": 50,
        "guidance": 5.5,
        "seed": "{{seed}}"
      }
    },
    "postprocess": {
      "class": "MeshPostProcess",
      "inputs": {
        "mesh": "{{hunyuan3d}}",
        "target_triangles": 5000,
        "smooth_iterations": 2
      }
    },
    "export": {
      "class": "ExportGLB",
      "inputs": {
        "mesh": "{{postprocess}}",
        "filename": "terrain_{{terrain_type}}_{{variant}}.glb"
      }
    }
  }
}
```

### Phase 3: Unit Meshes (Day 2-3)

**Pod**: H100 SXM #2 (Hunyuan3D)
**Estimated Time**: 12-16 hours
**Cost**: ~$0.48

**Assets to Generate**:
```yaml
unit_meshes:
  ancient_era:
    - warrior
    - scout
    - archer
    - spearman
    - settler_wagon
    - worker
    - galley

  classical_era:
    - swordsman
    - horseman
    - catapult
    - trireme

  medieval_era:
    - crossbowman
    - knight
    - pikeman
    - trebuchet
    - caravel

  renaissance_era:
    - musketman
    - lancer
    - cannon
    - frigate

  industrial_era:
    - rifleman
    - cavalry
    - artillery
    - ironclad

  modern_era:
    - infantry
    - tank
    - fighter_plane
    - battleship

total_units: 28
poses_per_unit: 3 (idle, move, attack)
total_meshes: 84
time_per_mesh: ~10 minutes
```

**Workflow**: `hunyuan3d_character.json`
```json
{
  "nodes": {
    "reference_image": {
      "class": "LoadImage",
      "inputs": {
        "image": "references/{{unit_type}}_reference.png"
      }
    },
    "hunyuan3d": {
      "class": "Hunyuan3DImageTo3D",
      "inputs": {
        "image": "{{reference_image}}",
        "steps": 50,
        "guidance": 6.0,
        "seed": "{{seed}}"
      }
    },
    "rig_export": {
      "class": "ExportGLB",
      "inputs": {
        "mesh": "{{hunyuan3d}}",
        "filename": "unit_{{unit_type}}_{{pose}}.glb"
      }
    }
  }
}
```

### Phase 4: Building & Wonder Meshes (Day 3-4)

**Pod**: H100 SXM #1 (Hunyuan3D) - running in parallel with Phase 3
**Estimated Time**: 10-14 hours
**Cost**: ~$0.42

**Assets to Generate**:
```yaml
building_meshes:
  city_improvements:
    - monument
    - granary
    - library
    - barracks
    - walls
    - market
    - temple
    - aqueduct
    - university
    - factory
    - hospital
    - bank
    - arsenal
    - theater
    - stadium

  wonders:
    - great_library
    - pyramids
    - stonehenge
    - oracle
    - colosseum
    - petra
    - notre_dame
    - forbidden_palace
    - sistine_chapel
    - big_ben
    - statue_of_liberty
    - eiffel_tower

total_buildings: 27
total_wonders: 12
time_per_asset: ~12-15 minutes
```

### Phase 5: Leader Portraits (Day 2)

**Pod**: H100 PCIe (SDXL)
**Estimated Time**: 4-6 hours
**Cost**: ~$0.06

**Assets to Generate**:
```yaml
leader_portraits:
  civilizations:
    - rome_trajan
    - greece_pericles
    - egypt_cleopatra
    - persia_cyrus
    - china_wu_zetian
    - england_elizabeth
    - arabia_harun
    - aztec_montezuma
    - india_gandhi
    - japan_tokugawa
    - russia_catherine
    - germany_bismarck

variants_per_leader:
  - full_portrait (512x768)
  - bust (512x512)
  - icon (128x128)
  - background_variants: 3

total_images: 12 leaders × 5 variants = 60
time_per_image: ~3-4 minutes
```

**SDXL Prompt Template**:
```
{leader_name}, {civilization} ruler, dignified portrait,
classical oil painting style, museum quality, warm lighting,
{era}-appropriate clothing, {distinctive_features},
detailed face, noble expression, historical accuracy
--negative cartoon, anime, modern clothing, blurry,
low quality, watermark
```

### Phase 6: Sprite Rendering (Day 4-5)

**Pod**: RTX 4090 #2 (Blender)
**Estimated Time**: 16-20 hours
**Cost**: ~$0.20

**Assets to Render**:
```yaml
sprite_rendering:
  terrain_tiles:
    - 58 terrain meshes × 8 rotations = 464 sprites
    - Resolution: 256×256
    - Lighting: day, dusk
    - Total: 928 sprites

  unit_sprites:
    - 28 units × 8 directions × 3 animations × 3 frames = 2016 sprites
    - Resolution: 64×64
    - Total: 2016 sprites

  building_icons:
    - 27 buildings × 1 angle = 27 icons
    - Resolution: 128×128
    - Total: 27 icons

  wonder_renders:
    - 12 wonders × 1 hero shot = 12 images
    - Resolution: 1920×1080
    - Total: 12 images

  resource_icons:
    - 25 resources × 1 angle = 25 icons
    - Resolution: 64×64
    - Total: 25 icons

total_renders: ~3000 images
```

**Blender Batch Script** (`render_sprites.py`):
```python
import bpy
import os
import math
import sys

def setup_isometric_camera():
    bpy.ops.object.camera_add(location=(5, -5, 5))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.0
    cam.rotation_euler = (math.radians(54.736), 0, math.radians(45))
    bpy.context.scene.camera = cam
    return cam

def render_all_rotations(mesh_path, output_dir, rotations=8):
    # Import mesh
    bpy.ops.import_scene.gltf(filepath=mesh_path)
    obj = bpy.context.selected_objects[0]

    # Render each rotation
    for i in range(rotations):
        angle = (360 / rotations) * i
        obj.rotation_euler.z = math.radians(angle)

        output_path = os.path.join(output_dir, f"rot_{i:03d}.png")
        bpy.context.scene.render.filepath = output_path
        bpy.ops.render.render(write_still=True)

    # Clean up
    bpy.ops.object.delete()

def batch_render_directory(input_dir, output_base):
    for mesh_file in os.listdir(input_dir):
        if mesh_file.endswith('.glb'):
            mesh_path = os.path.join(input_dir, mesh_file)
            mesh_name = os.path.splitext(mesh_file)[0]
            output_dir = os.path.join(output_base, mesh_name)
            os.makedirs(output_dir, exist_ok=True)
            render_all_rotations(mesh_path, output_dir)

if __name__ == "__main__":
    setup_isometric_camera()
    batch_render_directory(sys.argv[-2], sys.argv[-1])
```

### Phase 7: UI Elements & Icons (Day 5)

**Pod**: RTX 4090 #1 (CHORD + manual)
**Estimated Time**: 4-6 hours
**Cost**: ~$0.06

**Assets to Generate**:
```yaml
ui_icons:
  yield_icons:
    - food (wheat sheaf)
    - production (hammer/gear)
    - gold (coins)
    - science (beaker/scroll)
    - culture (harp/mask)
    - faith (dove/flame)

  tech_icons:
    - 70 technology icons
    - Resolution: 48×48, 64×64

  status_icons:
    - happiness (smile)
    - health (heart)
    - unhappy (frown)
    - war (crossed swords)
    - peace (olive branch)
    - golden_age (sun)

  resource_map_icons:
    - 25 resource icons for map overlay
    - Resolution: 32×32

total_icons: ~120
```

### Phase 8: Atlas Packing & Export (Day 5-6)

**Pod**: Local or any available
**Estimated Time**: 2-4 hours
**Cost**: ~$0.00 (can run locally)

**Tasks**:
```yaml
atlas_generation:
  terrain_atlas:
    - Combine 928 terrain sprites
    - Output: terrain_atlas.png (4096×4096)
    - Generate terrain_atlas.json (UV coords)

  unit_spritesheets:
    - 28 unit spritesheets
    - Each: 512×512 (8 directions × 9 frames)
    - Generate animation metadata

  icon_atlas:
    - Combine all icons
    - Output: icons_atlas.png (1024×1024)

  manifest_generation:
    - Generate assets/manifest.yaml
    - Include all paths, sizes, UV coords
```

---

## 4. Execution Timeline

```
DAY 1 (8-10 hours)
├─ 00:00 - 01:00  Setup: Deploy ComfyUI to all pods
├─ 01:00 - 07:00  Phase 1: Materials (RTX 4090 #1)
├─ 01:00 - 12:00  Phase 2: Terrain meshes (H100 SXM #1)
└─ Monitor & quality check batches

DAY 2 (12-14 hours)
├─ 00:00 - 04:00  Phase 5: Leader portraits (H100 PCIe)
├─ 00:00 - 16:00  Phase 3: Unit meshes (H100 SXM #2)
├─ 12:00 - 24:00  Phase 2 continued: Terrain variants
└─ Quality gates on completed terrain

DAY 3 (12-14 hours)
├─ 00:00 - 14:00  Phase 4: Buildings & Wonders (H100 SXM #1)
├─ 00:00 - 16:00  Phase 3 continued: Unit mesh completion
├─ 14:00 - 20:00  Setup Blender pod, test rendering
└─ Quality gates on completed units

DAY 4 (16-20 hours)
├─ 00:00 - 20:00  Phase 6: Sprite rendering (RTX 4090 #2)
│   ├─ Terrain tiles (8 hours)
│   ├─ Unit sprites (10 hours)
│   └─ Building/wonder renders (2 hours)
└─ Parallel: Fix any failed generations

DAY 5 (8-10 hours)
├─ 00:00 - 06:00  Phase 7: UI elements (RTX 4090 #1)
├─ 06:00 - 10:00  Phase 8: Atlas packing
├─ 10:00 - 12:00  Manifest generation
└─ Final quality review

BUFFER (Day 6)
├─ Regenerate any failed assets
├─ Style consistency pass
└─ Final export & documentation
```

---

## 5. Cost Estimate

| Phase | Pod | Hours | Cost/hr | Total |
|-------|-----|-------|---------|-------|
| Phase 1: Materials | RTX 4090 #1 | 6 | $0.01 | $0.06 |
| Phase 2: Terrain | H100 SXM #1 | 12 | $0.03 | $0.36 |
| Phase 3: Units | H100 SXM #2 | 16 | $0.03 | $0.48 |
| Phase 4: Buildings | H100 SXM #1 | 14 | $0.03 | $0.42 |
| Phase 5: Portraits | H100 PCIe | 6 | $0.01 | $0.06 |
| Phase 6: Rendering | RTX 4090 #2 | 20 | $0.01 | $0.20 |
| Phase 7: UI | RTX 4090 #1 | 6 | $0.01 | $0.06 |
| **TOTAL** | | **80 hrs** | | **$1.64** |

**With 25% buffer for reruns**: ~$2.05

---

## 6. Quality Gate Checkpoints

### Checkpoint 1: Materials Complete (End of Phase 1)
```yaml
validation:
  - All 28 materials have 5 PBR maps each
  - Seamless tiling verified
  - Color temperature within palette range
  - No obvious AI artifacts
```

### Checkpoint 2: Meshes Complete (End of Phase 4)
```yaml
validation:
  - All meshes import cleanly to Blender
  - Triangle counts within budget (terrain: 5k, units: 10k, buildings: 20k)
  - No non-manifold geometry
  - Scale consistency (1 unit = 1 meter)
```

### Checkpoint 3: Portraits Complete (End of Phase 5)
```yaml
validation:
  - All leaders recognizable and dignified
  - Style consistency across all portraits
  - No anachronistic elements
  - Face quality score > 0.8
```

### Checkpoint 4: Sprites Complete (End of Phase 6)
```yaml
validation:
  - All sprites at correct resolution
  - Transparent backgrounds clean
  - Unit silhouettes readable at 64px
  - Animation frame consistency
```

### Checkpoint 5: Final Export (End of Phase 8)
```yaml
validation:
  - Manifest references all assets correctly
  - Atlas UV coordinates validated
  - Total file size within budget
  - Test load in Godot successful
```

---

## 7. Orchestration Scripts

### 7.1 Master Orchestrator

```python
# orchestrate_asset_gen.py
"""
Master orchestration script for Backbay Imperium asset generation.
Coordinates work across multiple RunPod instances.
"""

import asyncio
import os
from dataclasses import dataclass
from enum import Enum
from typing import List, Dict
import httpx
import yaml

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY")

class PodRole(Enum):
    HUNYUAN3D_PRIMARY = "hunyuan3d_primary"
    HUNYUAN3D_SECONDARY = "hunyuan3d_secondary"
    SDXL = "sdxl"
    CHORD = "chord"
    BLENDER = "blender"

@dataclass
class Pod:
    id: str
    name: str
    role: PodRole
    host: str
    port: int = 8188

PODS = {
    PodRole.HUNYUAN3D_PRIMARY: Pod(
        id="a7ngyriuo51nw",
        name="nitrogen-server-172227",
        role=PodRole.HUNYUAN3D_PRIMARY,
        host="a7ngyriuo51nw.runpod.io"
    ),
    PodRole.HUNYUAN3D_SECONDARY: Pod(
        id="5dnmft0dzhevu9",
        name="nitrogen-server-171140",
        role=PodRole.HUNYUAN3D_SECONDARY,
        host="5dnmft0dzhevu9.runpod.io"
    ),
    PodRole.SDXL: Pod(
        id="xyi9t1kbl7ll36",
        name="healthy_gold_sturgeon",
        role=PodRole.SDXL,
        host="xyi9t1kbl7ll36.runpod.io"
    ),
    PodRole.CHORD: Pod(
        id="1plxkvbhkv0zd3",
        name="sympathetic_amethyst_galliform-migration",
        role=PodRole.CHORD,
        host="1plxkvbhkv0zd3.runpod.io"
    ),
    PodRole.BLENDER: Pod(
        id="knzczmzw8ezt1c",
        name="sympathetic_amethyst_galliform",
        role=PodRole.BLENDER,
        host="knzczmzw8ezt1c.runpod.io"
    ),
}

class AssetOrchestrator:
    def __init__(self, config_path: str):
        with open(config_path) as f:
            self.config = yaml.safe_load(f)
        self.completed = set()
        self.failed = []

    async def start_pod(self, pod: Pod):
        """Start a serverless pod if not running."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://api.runpod.io/v2/{pod.id}/run",
                headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
                json={"input": {"command": "start"}}
            )
            return resp.json()

    async def submit_comfyui_job(self, pod: Pod, workflow: dict, params: dict):
        """Submit a job to ComfyUI on the specified pod."""
        url = f"https://{pod.host}:{pod.port}/prompt"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={
                "prompt": workflow,
                "extra_data": params
            })
            return resp.json()

    async def run_phase(self, phase_name: str, pod_role: PodRole, assets: List[dict]):
        """Run a generation phase on specified pod."""
        pod = PODS[pod_role]
        print(f"Starting {phase_name} on {pod.name}")

        # Start pod if needed
        await self.start_pod(pod)

        # Load workflow template
        workflow_path = self.config["phases"][phase_name]["workflow"]
        with open(workflow_path) as f:
            workflow_template = yaml.safe_load(f)

        # Submit jobs
        tasks = []
        for asset in assets:
            workflow = self._interpolate_workflow(workflow_template, asset)
            task = self.submit_comfyui_job(pod, workflow, asset)
            tasks.append(task)

        # Wait for completion with progress
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Track results
        for asset, result in zip(assets, results):
            if isinstance(result, Exception):
                self.failed.append((asset, str(result)))
            else:
                self.completed.add(asset["id"])

        print(f"Phase {phase_name}: {len(self.completed)} succeeded, {len(self.failed)} failed")

    def _interpolate_workflow(self, template: dict, params: dict) -> dict:
        """Replace {{param}} placeholders in workflow."""
        import json
        template_str = json.dumps(template)
        for key, value in params.items():
            template_str = template_str.replace(f"{{{{{key}}}}}", str(value))
        return json.loads(template_str)

    async def run_all(self):
        """Execute all phases in order with parallelization."""
        # Phase 1 & 2 in parallel
        await asyncio.gather(
            self.run_phase("materials", PodRole.CHORD, self.config["materials"]),
            self.run_phase("terrain", PodRole.HUNYUAN3D_PRIMARY, self.config["terrain"]),
        )

        # Phase 3, 4, 5 in parallel
        await asyncio.gather(
            self.run_phase("units", PodRole.HUNYUAN3D_SECONDARY, self.config["units"]),
            self.run_phase("buildings", PodRole.HUNYUAN3D_PRIMARY, self.config["buildings"]),
            self.run_phase("portraits", PodRole.SDXL, self.config["leaders"]),
        )

        # Phase 6: Sprite rendering (sequential on Blender pod)
        await self.run_phase("sprites", PodRole.BLENDER, self.config["sprites"])

        # Phase 7 & 8
        await self.run_phase("ui", PodRole.CHORD, self.config["ui"])
        await self.run_phase("atlas", PodRole.BLENDER, self.config["atlas"])

        # Report
        print(f"\n=== GENERATION COMPLETE ===")
        print(f"Succeeded: {len(self.completed)}")
        print(f"Failed: {len(self.failed)}")
        if self.failed:
            print("\nFailed assets:")
            for asset, error in self.failed:
                print(f"  - {asset['id']}: {error}")

if __name__ == "__main__":
    orchestrator = AssetOrchestrator("backbay_asset_config.yaml")
    asyncio.run(orchestrator.run_all())
```

### 7.2 Pod Health Monitor

```python
# monitor_pods.py
"""
Real-time monitoring of RunPod instances during generation.
"""

import asyncio
import httpx
from rich.console import Console
from rich.table import Table
from rich.live import Live

RUNPOD_API_KEY = "rpa_7UZ1DB6HZ3QMTGSZRY47CO6T6DYUA6EAYZIWJACE1p2ofd"

async def get_pod_status():
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.runpod.io/v2/pods",
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"}
        )
        return resp.json()

def create_status_table(pods):
    table = Table(title="RunPod Status")
    table.add_column("Name", style="cyan")
    table.add_column("GPU", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("Utilization", style="magenta")
    table.add_column("Queue", style="blue")

    for pod in pods:
        status_color = "green" if pod["status"] == "RUNNING" else "red"
        table.add_row(
            pod["name"][:30],
            pod["gpu_type"],
            f"[{status_color}]{pod['status']}[/{status_color}]",
            f"{pod.get('gpu_utilization', 0):.0f}%",
            str(pod.get('queue_depth', 0))
        )
    return table

async def monitor_loop():
    console = Console()
    with Live(console=console, refresh_per_second=0.5) as live:
        while True:
            pods = await get_pod_status()
            table = create_status_table(pods.get("pods", []))
            live.update(table)
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(monitor_loop())
```

---

## 8. Asset Definition Files

### 8.1 `backbay_asset_config.yaml`

```yaml
# Master configuration for asset generation

version: "1.0"
project: backbay_imperium
output_dir: fab/backbay-imperium/assets

# Style reference for consistency
style:
  reference_pack: fab/backbay-imperium/style_reference
  color_temperature: warm
  rendering_style: painterly_realistic

phases:
  materials:
    workflow: fab/workflows/comfyui/chord_material.json
    pod: chord
    batch_size: 5

  terrain:
    workflow: fab/workflows/comfyui/hunyuan3d_hex.json
    pod: hunyuan3d_primary
    batch_size: 4

  units:
    workflow: fab/workflows/comfyui/hunyuan3d_character.json
    pod: hunyuan3d_secondary
    batch_size: 3

  buildings:
    workflow: fab/workflows/comfyui/hunyuan3d_architecture.json
    pod: hunyuan3d_primary
    batch_size: 2

  portraits:
    workflow: fab/workflows/comfyui/sdxl_portrait.json
    pod: sdxl
    batch_size: 4

  sprites:
    workflow: fab/blender/render_sprites.py
    pod: blender
    batch_size: 20

# Asset definitions
materials:
  - id: grass_meadow
    prompt: "lush green grass meadow, natural color variation, seamless tileable"
    category: terrain
  - id: grass_dry
    prompt: "dry yellow brown grass, autumn meadow, seamless tileable"
    category: terrain
  # ... (28 total)

terrain:
  - id: plains
    prompt: "flat grassland terrain, hex tile shape, golden wheat grass, game asset"
    variants: 4
  - id: grassland
    prompt: "lush green grassland hex tile, thick grass, wildflowers, game asset"
    variants: 4
  # ... (58 total with variants)

units:
  - id: warrior
    prompt: "ancient warrior, club weapon, leather armor, barbaric, game character"
    era: ancient
    poses: [idle, walk, attack]
  - id: scout
    prompt: "ancient scout, light leather, bow on back, fast runner, game character"
    era: ancient
    poses: [idle, walk, attack]
  # ... (28 total)

buildings:
  - id: monument
    prompt: "stone monument, obelisk style, ancient architecture, game asset"
    era: ancient
  - id: granary
    prompt: "grain storage building, ancient style, wooden and stone, game asset"
    era: ancient
  # ... (27 total)

leaders:
  - id: rome_trajan
    prompt: "Emperor Trajan portrait, Roman emperor, imperial purple toga, classical oil painting"
    civ: rome
  - id: greece_pericles
    prompt: "Pericles portrait, Athenian statesman, white himation, classical oil painting"
    civ: greece
  # ... (12 total)
```

---

## 9. Quick Start Commands

```bash
# 1. Set up environment
export RUNPOD_API_KEY="rpa_7UZ1DB6HZ3QMTGSZRY47CO6T6DYUA6EAYZIWJACE1p2ofd"

# 2. Start all pods
python -m cyntra.runpod start-all --config backbay_pods.yaml

# 3. Deploy ComfyUI to generation pods
python -m cyntra.runpod deploy-comfyui \
  --pods a7ngyriuo51nw,5dnmft0dzhevu9,xyi9t1kbl7ll36,1plxkvbhkv0zd3

# 4. Deploy Blender to rendering pod
python -m cyntra.runpod deploy-blender --pod knzczmzw8ezt1c

# 5. Run full generation pipeline
python orchestrate_asset_gen.py --config backbay_asset_config.yaml

# 6. Monitor progress
python monitor_pods.py

# 7. Validate generated assets
fab-gate --config fab/gates/backbay_terrain_v001.yaml \
  --assets fab/backbay-imperium/assets/terrain/

# 8. Generate final manifest
python -m cyntra.fab.manifest --assets fab/backbay-imperium/assets/
```

---

## 10. Contingency Plans

### If Hunyuan3D fails on complex meshes:
```yaml
fallback:
  action: simplify_prompt
  max_retries: 3
  alternative: use_reference_image_to_3d
```

### If SDXL portraits lack consistency:
```yaml
fallback:
  action: use_controlnet_pose
  reference: portrait_reference_poses.zip
  strength: 0.7
```

### If sprite rendering is too slow:
```yaml
optimization:
  reduce_samples: 32 -> 16
  use_eevee: true  # Real-time renderer instead of Cycles
  batch_parallel: 4
```

### If pods become unavailable:
```yaml
pod_redundancy:
  hunyuan3d_backup: rent_on_demand_h100
  sdxl_backup: local_mac_m2_ultra  # Slower but works
  blender_backup: local_cpu_render
```

---

## 11. Success Criteria

**Generation is COMPLETE when**:

1. **All meshes generated**: 58 terrain + 84 units + 39 buildings = 181 GLB files
2. **All sprites rendered**: ~3000 PNG files
3. **All portraits complete**: 60 PNG files (12 leaders × 5 variants)
4. **All materials ready**: 28 materials × 5 maps = 140 PNG files
5. **Manifest valid**: `manifest.yaml` references all assets with correct paths
6. **Quality gates pass**: All checkpoints validated
7. **Test load succeeds**: Assets load correctly in Godot test project

**Total Asset Count**: ~3,400 files
**Total Estimated Cost**: ~$2.00
**Total Estimated Time**: 5-6 days (with parallelization)
