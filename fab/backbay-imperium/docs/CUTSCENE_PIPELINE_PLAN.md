# Backbay Imperium: Cutscene & Story Mode Pipeline

## Executive Summary

This document outlines a comprehensive pipeline for creating hyper-realistic 3D cutscenes and story mode elements for Backbay Imperium using Blender and Godot. The pipeline leverages our existing 387 generated assets and extends them with rigging, animation, and cinematic systems.

---

## Table of Contents

1. [Pipeline Architecture](#1-pipeline-architecture)
2. [Asset Preparation Phase](#2-asset-preparation-phase)
3. [Character Rigging System](#3-character-rigging-system)
4. [Animation Library](#4-animation-library)
5. [Environment & Scene Building](#5-environment--scene-building)
6. [Blender Cinematics Pipeline](#6-blender-cinematics-pipeline)
7. [Godot Cutscene System](#7-godot-cutscene-system)
8. [Audio Pipeline](#8-audio-pipeline)
9. [Story & Narrative Tools](#9-story--narrative-tools)
10. [Automation & Tooling](#10-automation--tooling)
11. [Implementation Phases](#11-implementation-phases)
12. [Technical Specifications](#12-technical-specifications)

---

## 1. Pipeline Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ASSET FOUNDATION                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Unit Meshes │  │  Buildings  │  │   Leaders   │  │  Terrains   │        │
│  │   (34 GLB)  │  │  (36 GLB)   │  │  (12 PNG)   │  │ (128 sprites)│       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BLENDER PROCESSING                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Auto-Rig   │  │   LOD Gen   │  │  3D Leader  │  │   Terrain   │        │
│  │  (Mixamo)   │  │  & Optimize │  │  Generation │  │   Builder   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         ▼                ▼                ▼                ▼                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Animation  │  │   Scene     │  │   Facial    │  │ Environment │        │
│  │   Library   │  │  Assembly   │  │    Rig      │  │   Scenes    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CINEMATICS CREATION                                   │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                     BLENDER SEQUENCE EDITOR                       │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │      │
│  │  │ Storyboard│  │  Camera  │  │ Lighting │  │  Render  │         │      │
│  │  │   Import │  │   Rigs   │  │  Presets │  │  Output  │         │      │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │      │
│  └──────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│     PRE-RENDERED VIDEO       │  │    REAL-TIME (GODOT)         │
│  ┌────────────────────────┐  │  │  ┌────────────────────────┐  │
│  │  • Intro Cinematic     │  │  │  │  • In-game cutscenes   │  │
│  │  • Victory/Defeat      │  │  │  │  • Diplomacy scenes    │  │
│  │  • Era Transitions     │  │  │  │  • Wonder completions  │  │
│  │  • Campaign Story      │  │  │  │  • Interactive events  │  │
│  └────────────────────────┘  │  │  └────────────────────────┘  │
└──────────────────────────────┘  └──────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUDIO INTEGRATION                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Voice     │  │    Music    │  │    SFX      │  │  Ambience   │        │
│  │ (ElevenLabs)│  │ (Suno/Udio) │  │  Library    │  │   Tracks    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| 3D Modeling | Blender 4.x | Asset processing, rigging, rendering |
| Game Engine | Godot 4.x | Real-time cutscenes, game integration |
| Auto-Rigging | Mixamo | Humanoid character rigging |
| Animation | Mixamo + Cascadeur | Motion library + custom animation |
| Voice | ElevenLabs | AI voice synthesis for dialogue |
| Music | Suno AI | Dynamic soundtrack generation |
| Video Editing | DaVinci Resolve | Final cut assembly |
| Scripting | Python + GDScript | Automation and tooling |

---

## 2. Asset Preparation Phase

### 2.1 Current Asset Inventory

```
assets/
├── units/meshes/           # 34 unit GLBs (need rigging)
│   ├── unit_warrior.glb
│   ├── unit_knight.glb
│   └── ...
├── buildings/meshes/       # 36 building GLBs (static, need LOD)
├── leaders/                # 12 portrait PNGs (need 3D versions)
├── natural_wonders/meshes/ # 10 wonder GLBs (environment pieces)
├── improvements/meshes/    # 15 improvement GLBs (props)
├── terrain/sprites/        # 128 terrain sprites (need 3D terrain)
├── resources/              # 30 resource icons
├── tech/                   # 66 tech icons
└── civs/                   # 12 civ emblems
```

### 2.2 Asset Categories for Cinematics

| Category | Assets | Processing Needed |
|----------|--------|-------------------|
| **Humanoid Units** | warrior, archer, spearman, legion, knight, crossbowman, musketeer, rifleman, infantry, settler, worker, missionary, great_general | Full skeletal rig + animations |
| **Mounted Units** | horseman, knight, cavalry, conquistador | Two-part rig (rider + mount) |
| **Vehicles** | chariot, tank, fighter | Mechanical rig |
| **Naval** | galley, trireme, caravel, frigate, ironclad, battleship | Float/wave animation |
| **Siege** | catapult, trebuchet, cannon, artillery | Mechanical + projectile |
| **Buildings** | All 36 | LOD generation, destruction states |
| **Leaders** | 12 portraits | Generate 3D busts, facial rig |
| **Environment** | Terrain, wonders, improvements | Scene assembly, lighting |

### 2.3 Asset Enhancement Pipeline

```python
# fab/cinematics/asset_processor.py

class AssetProcessor:
    """Process raw GLB assets for cinematic use."""

    def process_unit(self, glb_path: Path) -> ProcessedUnit:
        """
        1. Import GLB to Blender
        2. Analyze mesh topology
        3. Auto-detect unit type (humanoid/mounted/vehicle)
        4. Apply appropriate rig
        5. Retarget animations
        6. Generate LODs
        7. Export as cinematic-ready asset
        """
        pass

    def process_building(self, glb_path: Path) -> ProcessedBuilding:
        """
        1. Import GLB
        2. Generate LOD0, LOD1, LOD2
        3. Create destruction sequence meshes
        4. Bake lighting for different times of day
        5. Export with metadata
        """
        pass

    def generate_3d_leader(self, portrait_path: Path) -> Leader3D:
        """
        1. Use portrait as reference
        2. Generate 3D bust via AI (Hunyuan3D or similar)
        3. Apply facial rig (ARKit compatible)
        4. Set up blend shapes for expressions
        5. Create animation presets (happy, angry, neutral, etc.)
        """
        pass
```

---

## 3. Character Rigging System

### 3.1 Rigging Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHARACTER RIGGING PIPELINE                    │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   HUMANOID    │    │    MOUNTED    │    │   VEHICLE     │
│               │    │               │    │               │
│ • Mixamo Auto │    │ • Dual Rig    │    │ • Bone Chain  │
│ • 65 bones    │    │ • Rider IK    │    │ • Constraints │
│ • IK/FK blend │    │ • Mount sync  │    │ • Drivers     │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  ANIMATIONS   │    │  ANIMATIONS   │    │  ANIMATIONS   │
│               │    │               │    │               │
│ • Walk/Run    │    │ • Ride Idle   │    │ • Move        │
│ • Attack      │    │ • Ride Move   │    │ • Fire        │
│ • Death       │    │ • Charge      │    │ • Destroyed   │
│ • Idle        │    │ • Dismount    │    │ • Idle        │
└───────────────┘    └───────────────┘    └───────────────┘
```

### 3.2 Mixamo Integration Script

```python
# fab/cinematics/rigging/mixamo_batch.py

"""
Batch auto-rigging via Mixamo API.
Uploads mesh → receives rigged FBX → converts to Blender armature.
"""

import requests
from pathlib import Path

MIXAMO_API = "https://www.mixamo.com/api/v1"

class MixamoBatchRigger:
    def __init__(self, auth_token: str):
        self.token = auth_token
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {auth_token}"

    def rig_character(self, glb_path: Path) -> Path:
        """
        1. Upload GLB to Mixamo
        2. Auto-detect skeleton placement
        3. Download rigged FBX
        4. Convert to Blender format
        """
        # Upload
        character_id = self._upload_character(glb_path)

        # Wait for auto-rig
        self._wait_for_rig(character_id)

        # Download
        rigged_fbx = self._download_rigged(character_id)

        return rigged_fbx

    def apply_animation(self, character_id: str, anim_id: str) -> Path:
        """Apply Mixamo animation to rigged character."""
        pass

    ANIMATION_PRESETS = {
        "idle": "anim_idle_breathing",
        "walk": "anim_walking",
        "run": "anim_running",
        "attack_melee": "anim_sword_slash",
        "attack_ranged": "anim_bow_shoot",
        "death": "anim_death_backward",
        "victory": "anim_victory_cheer",
        "defeat": "anim_defeat_kneel",
    }
```

### 3.3 Blender Rigging Automation

```python
# fab/cinematics/rigging/blender_rig.py

"""
Blender Python script for automated rigging operations.
Run via: blender --background --python blender_rig.py
"""

import bpy
from pathlib import Path

class BlenderRigger:

    @staticmethod
    def import_mixamo_fbx(fbx_path: Path):
        """Import Mixamo FBX and clean up armature."""
        bpy.ops.import_scene.fbx(filepath=str(fbx_path))

        # Rename armature to standard convention
        armature = bpy.context.active_object
        armature.name = fbx_path.stem + "_rig"

        # Apply transforms
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        return armature

    @staticmethod
    def setup_ik_controls(armature):
        """Add IK controls for easier animation."""
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode='POSE')

        # Add IK constraints to legs
        for side in ['Left', 'Right']:
            foot = armature.pose.bones.get(f"mixamorig:{side}Foot")
            if foot:
                ik = foot.constraints.new('IK')
                ik.chain_count = 2
                ik.target = armature
                # Create IK target bone...

        bpy.ops.object.mode_set(mode='OBJECT')

    @staticmethod
    def create_animation_actions(armature, animations_dir: Path):
        """Import all animations as separate actions."""
        actions = {}

        for anim_fbx in animations_dir.glob("*.fbx"):
            # Import animation
            bpy.ops.import_scene.fbx(
                filepath=str(anim_fbx),
                use_anim=True,
                ignore_leaf_bones=True
            )

            # Get the action
            action = bpy.data.actions[-1]
            action.name = anim_fbx.stem
            actions[anim_fbx.stem] = action

        return actions
```

### 3.4 Facial Rigging for Leaders

```python
# fab/cinematics/rigging/facial_rig.py

"""
Facial rigging system for leader characters.
Uses ARKit-compatible blend shapes for lip-sync and expressions.
"""

ARKIT_BLENDSHAPES = [
    # Mouth
    "jawOpen", "jawForward", "jawLeft", "jawRight",
    "mouthClose", "mouthFunnel", "mouthPucker",
    "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight", "mouthDimpleLeft", "mouthDimpleRight",
    "mouthStretchLeft", "mouthStretchRight", "mouthRollLower", "mouthRollUpper",
    "mouthShrugLower", "mouthShrugUpper", "mouthPressLeft", "mouthPressRight",
    "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight",

    # Eyes
    "eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight",
    "eyeWideLeft", "eyeWideRight", "eyeLookDownLeft", "eyeLookDownRight",
    "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
    "eyeLookUpLeft", "eyeLookUpRight",

    # Brow
    "browDownLeft", "browDownRight", "browInnerUp",
    "browOuterUpLeft", "browOuterUpRight",

    # Cheek
    "cheekPuff", "cheekSquintLeft", "cheekSquintRight",

    # Nose
    "noseSneerLeft", "noseSneerRight",
]

EXPRESSION_PRESETS = {
    "neutral": {},
    "happy": {
        "mouthSmileLeft": 0.8,
        "mouthSmileRight": 0.8,
        "cheekSquintLeft": 0.3,
        "cheekSquintRight": 0.3,
    },
    "angry": {
        "browDownLeft": 0.9,
        "browDownRight": 0.9,
        "mouthFrownLeft": 0.6,
        "mouthFrownRight": 0.6,
        "noseSneerLeft": 0.4,
        "noseSneerRight": 0.4,
    },
    "surprised": {
        "eyeWideLeft": 0.9,
        "eyeWideRight": 0.9,
        "browInnerUp": 0.8,
        "browOuterUpLeft": 0.7,
        "browOuterUpRight": 0.7,
        "jawOpen": 0.5,
    },
    "thinking": {
        "browInnerUp": 0.4,
        "eyeLookUpLeft": 0.6,
        "eyeLookUpRight": 0.6,
        "mouthPucker": 0.2,
    },
    "threatening": {
        "browDownLeft": 0.7,
        "browDownRight": 0.7,
        "eyeSquintLeft": 0.5,
        "eyeSquintRight": 0.5,
        "mouthSmileLeft": 0.3,  # Sinister smile
        "mouthSmileRight": 0.3,
    },
}
```

---

## 4. Animation Library

### 4.1 Animation Categories

```
animations/
├── locomotion/
│   ├── idle_breathing.fbx
│   ├── idle_look_around.fbx
│   ├── walk_forward.fbx
│   ├── walk_backward.fbx
│   ├── run_forward.fbx
│   ├── turn_left_90.fbx
│   ├── turn_right_90.fbx
│   └── ...
├── combat/
│   ├── attack_sword_slash.fbx
│   ├── attack_sword_stab.fbx
│   ├── attack_bow_draw.fbx
│   ├── attack_bow_release.fbx
│   ├── attack_spear_thrust.fbx
│   ├── block_shield.fbx
│   ├── dodge_roll.fbx
│   ├── hit_reaction_front.fbx
│   ├── hit_reaction_back.fbx
│   ├── death_forward.fbx
│   ├── death_backward.fbx
│   └── ...
├── emotes/
│   ├── victory_cheer.fbx
│   ├── defeat_kneel.fbx
│   ├── salute.fbx
│   ├── bow.fbx
│   ├── wave.fbx
│   ├── point_forward.fbx
│   └── ...
├── mounted/
│   ├── horse_idle.fbx
│   ├── horse_walk.fbx
│   ├── horse_gallop.fbx
│   ├── horse_rear.fbx
│   ├── rider_idle.fbx
│   ├── rider_attack_sword.fbx
│   ├── rider_attack_lance.fbx
│   └── ...
├── civilian/
│   ├── working_hammer.fbx
│   ├── working_shovel.fbx
│   ├── carrying_crate.fbx
│   ├── praying.fbx
│   ├── speaking_gesture.fbx
│   └── ...
└── cinematic/
    ├── dramatic_entrance.fbx
    ├── throne_sit.fbx
    ├── map_examine.fbx
    ├── sword_draw_dramatic.fbx
    └── ...
```

### 4.2 Animation Retargeting System

```python
# fab/cinematics/animation/retarget.py

"""
Animation retargeting system to apply Mixamo animations
to our custom-proportioned characters.
"""

class AnimationRetargeter:
    """Retarget animations between different armatures."""

    BONE_MAPPING = {
        # Mixamo -> Standard naming
        "mixamorig:Hips": "hips",
        "mixamorig:Spine": "spine",
        "mixamorig:Spine1": "spine.001",
        "mixamorig:Spine2": "spine.002",
        "mixamorig:Neck": "neck",
        "mixamorig:Head": "head",
        "mixamorig:LeftShoulder": "shoulder.L",
        "mixamorig:LeftArm": "upper_arm.L",
        "mixamorig:LeftForeArm": "forearm.L",
        "mixamorig:LeftHand": "hand.L",
        "mixamorig:RightShoulder": "shoulder.R",
        "mixamorig:RightArm": "upper_arm.R",
        "mixamorig:RightForeArm": "forearm.R",
        "mixamorig:RightHand": "hand.R",
        "mixamorig:LeftUpLeg": "thigh.L",
        "mixamorig:LeftLeg": "shin.L",
        "mixamorig:LeftFoot": "foot.L",
        "mixamorig:RightUpLeg": "thigh.R",
        "mixamorig:RightLeg": "shin.R",
        "mixamorig:RightFoot": "foot.R",
    }

    def retarget(self, source_action, target_armature):
        """
        Retarget animation from source to target armature.
        Handles different bone proportions and orientations.
        """
        pass
```

### 4.3 Procedural Animation

```python
# fab/cinematics/animation/procedural.py

"""
Procedural animation systems for dynamic content.
"""

class ProceduralAnimator:
    """Generate animations procedurally."""

    def create_crowd_variation(self, base_anim, variation_seed: int):
        """
        Create crowd variations of base animation.
        Adds timing offsets, amplitude variations, noise.
        """
        pass

    def create_look_at(self, character, target):
        """Procedural head/eye tracking."""
        pass

    def create_breathing(self, character, intensity: float = 1.0):
        """Subtle breathing animation layer."""
        pass

    def create_wind_reaction(self, character, wind_direction, wind_strength):
        """Hair/cloth reaction to wind."""
        pass


class NavalAnimator:
    """Procedural animation for ships."""

    def create_wave_motion(self, ship, wave_height, wave_frequency):
        """Rock ship on waves."""
        pass

    def create_sail_billow(self, ship, wind_direction):
        """Animate sails based on wind."""
        pass


class SiegeAnimator:
    """Procedural animation for siege weapons."""

    def create_trebuchet_fire(self, trebuchet, target_position):
        """
        Full trebuchet firing animation:
        1. Winch pullback
        2. Load projectile
        3. Release
        4. Arm swing
        5. Projectile arc
        """
        pass
```

---

## 5. Environment & Scene Building

### 5.1 Terrain System

```python
# fab/cinematics/environment/terrain.py

"""
Procedural terrain generation for cinematic environments.
"""

class CinematicTerrain:
    """Generate 3D terrain from game map data."""

    BIOME_MATERIALS = {
        "grassland": {"color": "#4a7c2f", "roughness": 0.8},
        "plains": {"color": "#8b7355", "roughness": 0.7},
        "desert": {"color": "#c4a35a", "roughness": 0.6},
        "tundra": {"color": "#a8b5a0", "roughness": 0.75},
        "snow": {"color": "#f0f0f0", "roughness": 0.3},
        "coast": {"color": "#c2b280", "roughness": 0.5},
        "ocean": {"color": "#1a5276", "roughness": 0.1},
    }

    def generate_terrain_mesh(self, map_data, resolution: int = 128):
        """
        Generate 3D terrain mesh from heightmap.

        Args:
            map_data: 2D array of terrain types and heights
            resolution: Vertices per tile

        Returns:
            Blender mesh object with materials
        """
        pass

    def add_terrain_details(self, terrain, detail_level: str = "high"):
        """
        Add detail objects to terrain:
        - Grass/vegetation
        - Rocks
        - Trees (from our assets)
        - Water effects
        """
        pass
```

### 5.2 Scene Assembly

```python
# fab/cinematics/environment/scene_builder.py

"""
Automated scene assembly from game state.
"""

class SceneBuilder:
    """Build complete scenes from game data."""

    def build_city_scene(self, city_data: dict) -> Scene:
        """
        Build a city scene with:
        - Central city buildings
        - Surrounding improvements
        - Units stationed
        - Terrain and props
        """
        scene = Scene()

        # Place terrain
        terrain = self.terrain_generator.generate(city_data["tiles"])
        scene.add(terrain)

        # Place city center
        for building in city_data["buildings"]:
            mesh = self.load_building(building["type"])
            mesh.location = building["position"]
            scene.add(mesh)

        # Place improvements
        for improvement in city_data["improvements"]:
            mesh = self.load_improvement(improvement["type"])
            mesh.location = improvement["position"]
            scene.add(mesh)

        # Place units
        for unit in city_data["garrison"]:
            character = self.load_rigged_unit(unit["type"])
            character.location = unit["position"]
            character.play_animation("idle")
            scene.add(character)

        return scene

    def build_battle_scene(self, battle_data: dict) -> Scene:
        """Build a battle scene with opposing armies."""
        pass

    def build_wonder_scene(self, wonder_type: str) -> Scene:
        """Build a scene showcasing a wonder."""
        pass

    def build_diplomacy_scene(self, leader1: str, leader2: str) -> Scene:
        """Build a diplomacy meeting scene."""
        pass
```

### 5.3 Lighting Presets

```python
# fab/cinematics/environment/lighting.py

"""
Cinematic lighting presets.
"""

LIGHTING_PRESETS = {
    "dawn": {
        "sun_angle": 15,
        "sun_color": "#ffad5e",
        "sun_intensity": 3.0,
        "ambient_color": "#4a6080",
        "ambient_intensity": 0.3,
        "fog_density": 0.02,
        "fog_color": "#ffe4c4",
    },
    "midday": {
        "sun_angle": 75,
        "sun_color": "#fffef0",
        "sun_intensity": 5.0,
        "ambient_color": "#87ceeb",
        "ambient_intensity": 0.5,
        "fog_density": 0.0,
    },
    "sunset": {
        "sun_angle": 10,
        "sun_color": "#ff6b35",
        "sun_intensity": 2.5,
        "ambient_color": "#4a3050",
        "ambient_intensity": 0.4,
        "fog_density": 0.015,
        "fog_color": "#ff9966",
    },
    "night": {
        "sun_angle": -30,
        "moon_color": "#b4c5e4",
        "moon_intensity": 0.5,
        "ambient_color": "#1a1a2e",
        "ambient_intensity": 0.1,
        "stars": True,
    },
    "dramatic": {
        "sun_angle": 25,
        "sun_color": "#ffd700",
        "sun_intensity": 4.0,
        "ambient_color": "#2c2c54",
        "ambient_intensity": 0.2,
        "volumetric": True,
        "god_rays": True,
    },
    "battle": {
        "sun_angle": 45,
        "sun_color": "#ff8c42",
        "sun_intensity": 3.5,
        "ambient_color": "#3d3d3d",
        "ambient_intensity": 0.3,
        "dust_particles": True,
        "smoke_effects": True,
    },
}
```

---

## 6. Blender Cinematics Pipeline

### 6.1 Camera System

```python
# fab/cinematics/camera/camera_rigs.py

"""
Professional camera rigs for cinematic shots.
"""

class CameraRig:
    """Base camera rig with common functionality."""

    def __init__(self):
        self.camera = None
        self.target = None
        self.constraints = []

    def look_at(self, target):
        """Point camera at target."""
        pass

    def set_focal_length(self, mm: float):
        """Set lens focal length."""
        pass

    def set_dof(self, focus_distance: float, aperture: float):
        """Set depth of field."""
        pass


class DollyRig(CameraRig):
    """Camera dolly for tracking shots."""

    def create_track(self, points: list, duration: float):
        """Create dolly track along points."""
        pass

    def animate_along_track(self, start_frame: int, end_frame: int):
        """Animate camera along track."""
        pass


class CraneRig(CameraRig):
    """Camera crane for sweeping shots."""

    def __init__(self, arm_length: float = 5.0):
        super().__init__()
        self.arm_length = arm_length
        self.boom_angle = 0
        self.swing_angle = 0

    def animate_crane_move(self, start_pos, end_pos, frames: int):
        """Animate crane movement."""
        pass


class OrbitRig(CameraRig):
    """Orbital camera for rotating around subject."""

    def orbit(self, center, radius: float, start_angle: float, end_angle: float, frames: int):
        """Create orbital camera movement."""
        pass


class HandheldRig(CameraRig):
    """Simulated handheld camera with natural shake."""

    def add_shake(self, intensity: float = 1.0, frequency: float = 1.0):
        """Add procedural camera shake."""
        pass


# Cinematic shot presets
SHOT_PRESETS = {
    "establishing_wide": {
        "rig": "crane",
        "focal_length": 24,
        "movement": "slow_push_in",
        "duration": 5.0,
    },
    "character_intro": {
        "rig": "dolly",
        "focal_length": 50,
        "movement": "circle_reveal",
        "duration": 3.0,
    },
    "dialogue_over_shoulder": {
        "rig": "static",
        "focal_length": 85,
        "dof": {"aperture": 2.8},
    },
    "action_tracking": {
        "rig": "handheld",
        "focal_length": 35,
        "shake_intensity": 0.3,
    },
    "epic_reveal": {
        "rig": "crane",
        "focal_length": 24,
        "movement": "boom_up_reveal",
        "duration": 4.0,
    },
}
```

### 6.2 Storyboard Integration

```python
# fab/cinematics/storyboard/parser.py

"""
Parse storyboard documents into Blender scene setup.
"""

from dataclasses import dataclass
from typing import List, Optional

@dataclass
class Shot:
    """Single shot definition."""
    id: str
    description: str
    duration: float  # seconds
    camera_type: str
    camera_movement: Optional[str]
    subjects: List[str]
    location: str
    lighting: str
    audio_cue: Optional[str]
    dialogue: Optional[str]
    notes: Optional[str]

@dataclass
class Sequence:
    """Sequence of shots."""
    id: str
    name: str
    shots: List[Shot]

class StoryboardParser:
    """Parse storyboard YAML into shot definitions."""

    def parse(self, yaml_path: str) -> List[Sequence]:
        """Parse storyboard YAML file."""
        pass

    def to_blender_timeline(self, sequences: List[Sequence]):
        """Convert sequences to Blender timeline markers and strips."""
        pass


# Example storyboard YAML format:
"""
sequences:
  - id: intro_01
    name: "Game Introduction"
    shots:
      - id: shot_001
        description: "Aerial view of ancient world map"
        duration: 5.0
        camera:
          type: crane
          movement: slow_descent
          focal_length: 24
        location: world_map
        lighting: dawn
        audio:
          music: epic_intro_theme

      - id: shot_002
        description: "Close-up of Roman legion marching"
        duration: 3.0
        camera:
          type: dolly
          movement: tracking_right
          focal_length: 50
        subjects:
          - unit_legion (count: 20, formation: column)
        location: roman_road
        lighting: midday
        audio:
          sfx: marching_feet
          music: continues

      - id: shot_003
        description: "Leader Trajan addresses troops"
        duration: 4.0
        camera:
          type: static
          focal_length: 85
        subjects:
          - leader_caesar (animation: speaking_gesture)
        location: military_camp
        lighting: dramatic
        dialogue:
          speaker: caesar
          text: "The glory of Rome shall echo through eternity!"
"""
```

### 6.3 Render Pipeline

```python
# fab/cinematics/render/render_manager.py

"""
Render management for cinematic sequences.
"""

class RenderManager:
    """Manage rendering of cinematic sequences."""

    QUALITY_PRESETS = {
        "preview": {
            "resolution": (1280, 720),
            "samples": 32,
            "denoiser": "OPTIX",
            "motion_blur": False,
        },
        "production": {
            "resolution": (1920, 1080),
            "samples": 256,
            "denoiser": "OPTIX",
            "motion_blur": True,
            "motion_blur_shutter": 0.5,
        },
        "cinematic_4k": {
            "resolution": (3840, 2160),
            "samples": 512,
            "denoiser": "OPTIX",
            "motion_blur": True,
            "motion_blur_shutter": 0.5,
            "film_grain": 0.1,
        },
    }

    def render_sequence(self, sequence: Sequence, quality: str = "production"):
        """Render complete sequence."""
        settings = self.QUALITY_PRESETS[quality]

        for shot in sequence.shots:
            self.render_shot(shot, settings)

    def render_shot(self, shot: Shot, settings: dict):
        """Render single shot."""
        pass

    def setup_render_farm(self, farm_config: dict):
        """Configure distributed rendering."""
        pass
```

---

## 7. Godot Cutscene System

### 7.1 Architecture

```
godot_project/
├── addons/
│   └── cinematic_system/
│       ├── plugin.gd
│       ├── cutscene_player.gd
│       ├── dialogue_system.gd
│       ├── camera_director.gd
│       └── ...
├── cinematics/
│   ├── sequences/
│   │   ├── intro.tscn
│   │   ├── wonder_pyramids.tscn
│   │   ├── victory_domination.tscn
│   │   └── ...
│   ├── dialogue/
│   │   ├── diplomacy_greetings.json
│   │   ├── declarations_of_war.json
│   │   └── ...
│   └── cameras/
│       ├── camera_presets.tres
│       └── ...
└── characters/
    ├── rigged/
    │   ├── unit_warrior.glb
    │   └── ...
    └── leaders/
        ├── leader_caesar.glb
        └── ...
```

### 7.2 Cutscene Player

```gdscript
# addons/cinematic_system/cutscene_player.gd

class_name CutscenePlayer
extends Node

signal cutscene_started(cutscene_name: String)
signal cutscene_finished(cutscene_name: String)
signal dialogue_started(speaker: String, text: String)
signal choice_presented(choices: Array)

@export var skip_enabled: bool = true
@export var letterbox_enabled: bool = true

var current_cutscene: CutsceneData
var is_playing: bool = false
var current_shot_index: int = 0

@onready var camera_director: CameraDirector = $CameraDirector
@onready var dialogue_system: DialogueSystem = $DialogueSystem
@onready var audio_manager: AudioManager = $AudioManager
@onready var letterbox: Control = $UI/Letterbox


func play_cutscene(cutscene_path: String) -> void:
    """Play a cutscene from file."""
    current_cutscene = load(cutscene_path)
    is_playing = true
    current_shot_index = 0

    # Setup
    _show_letterbox()
    _disable_game_input()

    emit_signal("cutscene_started", cutscene_path)

    # Play sequence
    await _play_sequence()

    # Cleanup
    _hide_letterbox()
    _enable_game_input()

    is_playing = false
    emit_signal("cutscene_finished", cutscene_path)


func _play_sequence() -> void:
    """Play all shots in sequence."""
    for shot in current_cutscene.shots:
        await _play_shot(shot)


func _play_shot(shot: ShotData) -> void:
    """Play a single shot."""
    # Setup camera
    camera_director.execute_shot(shot.camera_data)

    # Setup audio
    if shot.music:
        audio_manager.play_music(shot.music)
    if shot.sfx:
        audio_manager.play_sfx(shot.sfx)

    # Play animations
    for actor in shot.actors:
        actor.node.play_animation(actor.animation)

    # Handle dialogue
    if shot.dialogue:
        await dialogue_system.show_dialogue(shot.dialogue)
    else:
        await get_tree().create_timer(shot.duration).timeout

    current_shot_index += 1


func skip_cutscene() -> void:
    """Skip to end of cutscene."""
    if skip_enabled and is_playing:
        # Fast-forward to end
        pass
```

### 7.3 Camera Director

```gdscript
# addons/cinematic_system/camera_director.gd

class_name CameraDirector
extends Node3D

@export var cinematic_camera: Camera3D
@export var transition_curve: Curve

var active_shot: ShotData
var shot_tween: Tween


func execute_shot(shot_data: ShotData) -> void:
    """Execute a camera shot."""
    active_shot = shot_data

    match shot_data.type:
        "static":
            _setup_static_shot(shot_data)
        "dolly":
            _setup_dolly_shot(shot_data)
        "orbit":
            _setup_orbit_shot(shot_data)
        "crane":
            _setup_crane_shot(shot_data)
        "handheld":
            _setup_handheld_shot(shot_data)


func _setup_static_shot(data: ShotData) -> void:
    """Setup static camera."""
    cinematic_camera.global_position = data.position
    cinematic_camera.look_at(data.look_at)
    cinematic_camera.fov = _focal_length_to_fov(data.focal_length)


func _setup_dolly_shot(data: ShotData) -> void:
    """Setup dolly tracking shot."""
    var path = data.path as Path3D
    var path_follow = PathFollow3D.new()
    path.add_child(path_follow)
    path_follow.add_child(cinematic_camera)

    # Animate along path
    shot_tween = create_tween()
    shot_tween.tween_property(path_follow, "progress_ratio", 1.0, data.duration)


func _setup_orbit_shot(data: ShotData) -> void:
    """Setup orbital camera."""
    var pivot = Node3D.new()
    pivot.global_position = data.orbit_center
    add_child(pivot)
    pivot.add_child(cinematic_camera)

    cinematic_camera.position = Vector3(0, 0, data.orbit_radius)

    shot_tween = create_tween()
    shot_tween.tween_property(pivot, "rotation_degrees:y", data.orbit_end_angle, data.duration)


func _focal_length_to_fov(focal_length_mm: float) -> float:
    """Convert focal length to FOV."""
    # Assuming 36mm sensor (full frame)
    return rad_to_deg(2 * atan(36.0 / (2 * focal_length_mm)))
```

### 7.4 Dialogue System

```gdscript
# addons/cinematic_system/dialogue_system.gd

class_name DialogueSystem
extends CanvasLayer

signal dialogue_complete
signal choice_made(choice_index: int)

@export var typewriter_speed: float = 0.03
@export var voice_enabled: bool = true

@onready var dialogue_box: PanelContainer = $DialogueBox
@onready var speaker_label: Label = $DialogueBox/VBox/Speaker
@onready var text_label: RichTextLabel = $DialogueBox/VBox/Text
@onready var portrait: TextureRect = $DialogueBox/Portrait
@onready var choices_container: VBoxContainer = $ChoicesContainer
@onready var audio_player: AudioStreamPlayer = $VoicePlayer

var current_dialogue: DialogueData
var is_typing: bool = false


func show_dialogue(dialogue: DialogueData) -> void:
    """Display dialogue with typewriter effect."""
    current_dialogue = dialogue

    # Setup visuals
    dialogue_box.show()
    speaker_label.text = dialogue.speaker
    portrait.texture = load(dialogue.portrait_path)

    # Play voice if available
    if voice_enabled and dialogue.voice_clip:
        audio_player.stream = load(dialogue.voice_clip)
        audio_player.play()

    # Typewriter effect
    await _typewriter_text(dialogue.text)

    # Wait for input or auto-advance
    if dialogue.choices.size() > 0:
        await _show_choices(dialogue.choices)
    else:
        await _wait_for_advance()

    dialogue_box.hide()
    emit_signal("dialogue_complete")


func _typewriter_text(text: String) -> void:
    """Animate text with typewriter effect."""
    is_typing = true
    text_label.text = ""
    text_label.visible_characters = 0
    text_label.text = text

    for i in range(text.length()):
        if not is_typing:
            text_label.visible_characters = -1
            return
        text_label.visible_characters = i + 1
        await get_tree().create_timer(typewriter_speed).timeout

    is_typing = false


func _show_choices(choices: Array) -> void:
    """Display dialogue choices."""
    choices_container.show()

    for i in range(choices.size()):
        var button = Button.new()
        button.text = choices[i].text
        button.pressed.connect(_on_choice_selected.bind(i))
        choices_container.add_child(button)

    # Wait for selection
    await choice_made

    # Cleanup
    for child in choices_container.get_children():
        child.queue_free()
    choices_container.hide()
```

### 7.5 Animation Integration

```gdscript
# addons/cinematic_system/cinematic_actor.gd

class_name CinematicActor
extends Node3D

@export var animation_player: AnimationPlayer
@export var animation_tree: AnimationTree

var current_animation: String


func play_animation(anim_name: String, blend_time: float = 0.2) -> void:
    """Play animation with blending."""
    if animation_tree:
        # Use animation tree for complex blending
        var state_machine = animation_tree.get("parameters/playback")
        state_machine.travel(anim_name)
    else:
        # Simple animation player
        animation_player.play(anim_name, blend_time)

    current_animation = anim_name


func play_one_shot(anim_name: String) -> void:
    """Play animation once then return to idle."""
    play_animation(anim_name)
    await animation_player.animation_finished
    play_animation("idle")


func set_expression(expression: String) -> void:
    """Set facial expression blend shapes."""
    var mesh = get_node("MeshInstance3D") as MeshInstance3D
    if mesh and mesh.mesh:
        match expression:
            "happy":
                mesh.set_blend_shape_value(mesh.find_blend_shape_by_name("mouthSmile"), 0.8)
            "angry":
                mesh.set_blend_shape_value(mesh.find_blend_shape_by_name("browDown"), 0.9)
            # ... etc
```

---

## 8. Audio Pipeline

### 8.1 Voice Generation (ElevenLabs)

```python
# fab/cinematics/audio/voice_generator.py

"""
AI voice generation for character dialogue.
"""

from elevenlabs import generate, Voice, VoiceSettings
from pathlib import Path

class VoiceGenerator:
    """Generate character voices using ElevenLabs."""

    # Voice profiles for each leader
    LEADER_VOICES = {
        "caesar": {
            "voice_id": "pNInz6obpgDQGcFmaJgB",  # Adam
            "settings": VoiceSettings(
                stability=0.7,
                similarity_boost=0.8,
                style=0.5,
            )
        },
        "cleopatra": {
            "voice_id": "EXAVITQu4vr4xnSDxMaL",  # Bella
            "settings": VoiceSettings(
                stability=0.6,
                similarity_boost=0.85,
            )
        },
        "washington": {
            "voice_id": "VR6AewLTigWG4xSOukaG",  # Arnold
            "settings": VoiceSettings(
                stability=0.8,
                similarity_boost=0.75,
            )
        },
        # ... more leaders
    }

    def generate_dialogue(self, leader: str, text: str, output_path: Path) -> Path:
        """Generate voice audio for dialogue."""
        voice_config = self.LEADER_VOICES[leader]

        audio = generate(
            text=text,
            voice=Voice(
                voice_id=voice_config["voice_id"],
                settings=voice_config["settings"]
            ),
            model="eleven_multilingual_v2"
        )

        with open(output_path, "wb") as f:
            f.write(audio)

        return output_path

    def generate_batch(self, dialogues: list[dict]) -> list[Path]:
        """Generate multiple dialogue clips."""
        outputs = []
        for d in dialogues:
            path = self.generate_dialogue(d["speaker"], d["text"], d["output"])
            outputs.append(path)
        return outputs
```

### 8.2 Music Generation (Suno/Udio)

```python
# fab/cinematics/audio/music_generator.py

"""
AI music generation for cinematics.
"""

class MusicGenerator:
    """Generate soundtrack using AI music services."""

    STYLE_PRESETS = {
        "epic_orchestral": {
            "genre": "orchestral cinematic",
            "mood": "epic heroic triumphant",
            "instruments": "full orchestra brass strings percussion choir",
        },
        "ancient_ambient": {
            "genre": "ambient world music",
            "mood": "mysterious ancient mystical",
            "instruments": "ethnic flutes drums strings",
        },
        "battle_intense": {
            "genre": "action orchestral",
            "mood": "intense aggressive urgent",
            "instruments": "percussion brass low strings",
        },
        "peaceful_pastoral": {
            "genre": "classical pastoral",
            "mood": "peaceful calm serene",
            "instruments": "strings woodwinds harp",
        },
        "victory_triumphant": {
            "genre": "orchestral fanfare",
            "mood": "triumphant celebratory majestic",
            "instruments": "brass full orchestra choir timpani",
        },
        "defeat_somber": {
            "genre": "orchestral dramatic",
            "mood": "somber melancholic tragic",
            "instruments": "strings piano solo cello",
        },
    }

    ERA_MODIFIERS = {
        "ancient": "ancient greek roman egyptian style",
        "classical": "classical antiquity hellenistic",
        "medieval": "medieval renaissance european",
        "industrial": "romantic era late classical",
        "modern": "modern cinematic contemporary",
    }

    def generate_track(self, style: str, era: str, duration: int = 60) -> Path:
        """Generate music track."""
        preset = self.STYLE_PRESETS[style]
        era_mod = self.ERA_MODIFIERS[era]

        prompt = f"{preset['genre']}, {preset['mood']}, {preset['instruments']}, {era_mod}"

        # Call Suno/Udio API
        # ...
        pass
```

### 8.3 Audio Synchronization

```python
# fab/cinematics/audio/sync.py

"""
Audio synchronization for lip-sync and timing.
"""

class AudioSync:
    """Synchronize audio with animations."""

    def analyze_speech(self, audio_path: Path) -> list[dict]:
        """
        Analyze speech audio and return phoneme timings.
        Returns list of {phoneme, start_time, end_time, intensity}
        """
        pass

    def generate_lipsync_data(self, phoneme_data: list[dict]) -> dict:
        """
        Convert phoneme data to blend shape keyframes.
        Maps phonemes to ARKit blend shapes.
        """
        PHONEME_TO_BLENDSHAPE = {
            "AA": {"jawOpen": 0.6, "mouthFunnel": 0.2},
            "AE": {"jawOpen": 0.5, "mouthStretchLeft": 0.3, "mouthStretchRight": 0.3},
            "AH": {"jawOpen": 0.4, "mouthFunnel": 0.1},
            "AO": {"jawOpen": 0.5, "mouthFunnel": 0.4},
            "EH": {"jawOpen": 0.3, "mouthSmileLeft": 0.2, "mouthSmileRight": 0.2},
            "IH": {"jawOpen": 0.2, "mouthSmileLeft": 0.3, "mouthSmileRight": 0.3},
            "IY": {"jawOpen": 0.1, "mouthSmileLeft": 0.5, "mouthSmileRight": 0.5},
            "OW": {"jawOpen": 0.4, "mouthFunnel": 0.6},
            "UH": {"jawOpen": 0.3, "mouthFunnel": 0.3},
            "UW": {"jawOpen": 0.2, "mouthPucker": 0.7},
            "M": {"mouthClose": 0.9, "mouthPressLeft": 0.3, "mouthPressRight": 0.3},
            "N": {"jawOpen": 0.1, "mouthClose": 0.5},
            "F": {"mouthFunnel": 0.3, "mouthLowerDownLeft": 0.4, "mouthLowerDownRight": 0.4},
            "TH": {"jawOpen": 0.2, "mouthFunnel": 0.1},
            "S": {"mouthSmileLeft": 0.2, "mouthSmileRight": 0.2},
            "SH": {"mouthPucker": 0.4, "mouthFunnel": 0.3},
        }
        pass

    def export_to_blender(self, lipsync_data: dict, output_path: Path):
        """Export lip-sync as Blender animation."""
        pass

    def export_to_godot(self, lipsync_data: dict, output_path: Path):
        """Export lip-sync as Godot AnimationPlayer resource."""
        pass
```

---

## 9. Story & Narrative Tools

### 9.1 Screenplay Format

```yaml
# cinematics/scripts/intro_cinematic.yaml

metadata:
  title: "Backbay Imperium - Introduction"
  author: "Game Team"
  version: "1.0"
  duration_estimate: "3:30"

settings:
  default_transition: "crossfade"
  transition_duration: 0.5
  letterbox_ratio: 2.35

sequences:
  - id: "seq_01_world_awakens"
    name: "The World Awakens"

    shots:
      - id: "shot_001"
        type: "establishing"
        description: |
          FADE IN from black. Aerial view of a vast, untamed world.
          Mountains rise in the distance, rivers snake through valleys,
          forests blanket the hills.

        camera:
          type: "crane"
          start_position: [0, 500, 0]
          end_position: [0, 100, 200]
          focal_length: 24
          movement: "slow_descent"
          duration: 8.0

        environment:
          location: "world_overview"
          time_of_day: "dawn"
          weather: "clear"
          fog: 0.02

        audio:
          music:
            track: "epic_intro_theme"
            fade_in: 2.0
          ambience: "wind_mountain"

        voiceover:
          text: |
            In the beginning, the world lay untouched...
            waiting for those bold enough to shape its destiny.
          voice: "narrator"

      - id: "shot_002"
        type: "detail"
        description: |
          Cut to a small settlement. Primitive huts cluster around a fire.
          Villagers go about their daily tasks.

        camera:
          type: "dolly"
          path: "village_reveal_path"
          focal_length: 35
          duration: 5.0

        actors:
          - type: "unit_worker"
            count: 5
            formation: "scattered"
            animation: "working_various"
          - type: "unit_settler"
            count: 1
            position: [0, 0, 0]
            animation: "examining_map"

        environment:
          location: "primitive_village"
          time_of_day: "morning"

        audio:
          sfx: "village_ambience"
          music: "continues"

      - id: "shot_003"
        type: "character_intro"
        description: |
          Close-up of a leader figure. They look to the horizon
          with determination in their eyes.

        camera:
          type: "static"
          position: [2, 1.6, 3]
          look_at: "leader_face"
          focal_length: 85
          dof:
            focus_distance: 3
            aperture: 2.8
          duration: 4.0

        actors:
          - type: "leader_placeholder"
            animation: "look_horizon"
            expression: "determined"

        audio:
          music: "swell"

        dialogue:
          speaker: "leader"
          text: "This land... it shall be ours to forge."
          emotion: "determined"

  - id: "seq_02_ages_pass"
    name: "Through the Ages"

    shots:
      - id: "shot_004"
        type: "montage"
        description: |
          MONTAGE: Quick cuts showing the progress of civilization.
          - Ancient warriors training
          - Classical buildings rising
          - Medieval knights charging
          - Industrial factories smoking
          - Modern cities gleaming

        sub_shots:
          - environment: "ancient_training_grounds"
            duration: 2.0
            actors: [{type: "unit_warrior", animation: "combat_training"}]

          - environment: "classical_construction"
            duration: 2.0
            actors: [{type: "unit_worker", animation: "building"}]
            camera_movement: "quick_pan_right"

          - environment: "medieval_battlefield"
            duration: 2.0
            actors: [{type: "unit_knight", count: 10, animation: "charge"}]
            camera_movement: "tracking"

          - environment: "industrial_city"
            duration: 2.0
            camera_movement: "tilt_up"

          - environment: "modern_metropolis"
            duration: 2.0
            camera_movement: "aerial_orbit"

        audio:
          music: "time_passage_theme"
          transitions: "whoosh"

        voiceover:
          text: |
            Empires rose and fell. Knowledge accumulated.
            Each generation built upon the last.
          voice: "narrator"

  - id: "seq_03_your_turn"
    name: "Your Legacy Awaits"

    shots:
      - id: "shot_005"
        type: "call_to_action"
        description: |
          Pull back to reveal a game map with multiple civilizations.
          Their borders glow with their colors.

        camera:
          type: "crane"
          movement: "pull_back_rise"
          duration: 6.0

        environment:
          location: "strategic_map"
          style: "game_board"
          civilization_markers: true

        audio:
          music: "building_crescendo"

        voiceover:
          text: |
            Now, a new chapter begins. Your chapter.
            Will you lead your people to glory... or oblivion?
          voice: "narrator"

      - id: "shot_006"
        type: "title_card"
        description: |
          Game logo materializes with dramatic flourish.

        camera:
          type: "static"
          duration: 4.0

        graphics:
          logo: "backbay_imperium_logo"
          animation: "dramatic_reveal"
          tagline: "Build Your Empire"

        audio:
          music: "final_hit"
          sfx: "dramatic_boom"
```

### 9.2 Branching Narrative System

```python
# fab/cinematics/narrative/story_graph.py

"""
Branching narrative system for story mode.
"""

from dataclasses import dataclass
from typing import Optional, Callable
from enum import Enum

class NodeType(Enum):
    CUTSCENE = "cutscene"
    DIALOGUE = "dialogue"
    CHOICE = "choice"
    BATTLE = "battle"
    CONDITION = "condition"

@dataclass
class StoryNode:
    id: str
    type: NodeType
    content: dict
    next_nodes: list[str]
    conditions: Optional[dict] = None

@dataclass
class StoryChoice:
    text: str
    next_node: str
    requirements: Optional[dict] = None  # e.g., {"relation_rome": ">= 50"}
    effects: Optional[dict] = None  # e.g., {"relation_rome": -20}

class StoryGraph:
    """Directed graph of story nodes."""

    def __init__(self):
        self.nodes: dict[str, StoryNode] = {}
        self.current_node: Optional[str] = None
        self.game_state: dict = {}

    def load_campaign(self, campaign_path: str):
        """Load campaign story graph from file."""
        pass

    def advance(self, choice_index: Optional[int] = None) -> StoryNode:
        """Advance to next story node."""
        current = self.nodes[self.current_node]

        if current.type == NodeType.CHOICE:
            # Player made a choice
            choice = current.content["choices"][choice_index]
            self._apply_effects(choice.effects)
            self.current_node = choice.next_node

        elif current.type == NodeType.CONDITION:
            # Evaluate condition
            for branch in current.content["branches"]:
                if self._evaluate_condition(branch["condition"]):
                    self.current_node = branch["next_node"]
                    break

        else:
            # Linear progression
            self.current_node = current.next_nodes[0]

        return self.nodes[self.current_node]

    def _evaluate_condition(self, condition: dict) -> bool:
        """Evaluate a story condition against game state."""
        pass

    def _apply_effects(self, effects: dict):
        """Apply story choice effects to game state."""
        pass


# Example campaign structure
ROME_CAMPAIGN = {
    "start": StoryNode(
        id="start",
        type=NodeType.CUTSCENE,
        content={"cutscene": "rome_intro"},
        next_nodes=["first_choice"]
    ),
    "first_choice": StoryNode(
        id="first_choice",
        type=NodeType.CHOICE,
        content={
            "dialogue": "The Senate awaits your decision, Caesar.",
            "choices": [
                StoryChoice(
                    text="March on Gaul immediately",
                    next_node="aggressive_path",
                    effects={"military_reputation": +10, "senate_approval": -5}
                ),
                StoryChoice(
                    text="Strengthen our borders first",
                    next_node="defensive_path",
                    effects={"military_reputation": -5, "senate_approval": +10}
                ),
                StoryChoice(
                    text="Seek diplomatic solutions",
                    next_node="diplomatic_path",
                    requirements={"charisma": ">= 7"},
                    effects={"diplomatic_reputation": +15}
                ),
            ]
        },
        next_nodes=[]
    ),
    # ... more nodes
}
```

---

## 10. Automation & Tooling

### 10.1 CLI Tools

```python
# fab/cinematics/cli.py

"""
Command-line tools for cinematic pipeline.
"""

import click
from pathlib import Path

@click.group()
def cli():
    """Backbay Imperium Cinematics Pipeline"""
    pass

@cli.command()
@click.argument('glb_path', type=click.Path(exists=True))
@click.option('--output', '-o', type=click.Path(), help='Output directory')
def rig_character(glb_path: str, output: str):
    """Auto-rig a character mesh using Mixamo."""
    from .rigging import MixamoBatchRigger

    rigger = MixamoBatchRigger()
    result = rigger.rig_character(Path(glb_path))
    click.echo(f"Rigged character saved to: {result}")

@cli.command()
@click.argument('character_path', type=click.Path(exists=True))
@click.option('--animations', '-a', multiple=True, help='Animation names to apply')
def apply_animations(character_path: str, animations: tuple):
    """Apply animations to rigged character."""
    pass

@cli.command()
@click.argument('storyboard_path', type=click.Path(exists=True))
@click.option('--quality', type=click.Choice(['preview', 'production', '4k']), default='preview')
def render_sequence(storyboard_path: str, quality: str):
    """Render a cinematic sequence from storyboard."""
    pass

@cli.command()
@click.argument('script_path', type=click.Path(exists=True))
@click.option('--output-dir', '-o', type=click.Path(), required=True)
def generate_voices(script_path: str, output_dir: str):
    """Generate voice acting from dialogue script."""
    pass

@cli.command()
def batch_process_assets():
    """Process all game assets for cinematic use."""
    pass

if __name__ == '__main__':
    cli()
```

### 10.2 Blender Addon

```python
# fab/cinematics/blender_addon/__init__.py

"""
Blender addon for Backbay Imperium cinematics.
"""

bl_info = {
    "name": "Backbay Imperium Cinematics",
    "author": "Game Team",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Cinematics",
    "description": "Tools for creating game cinematics",
    "category": "Animation",
}

import bpy
from bpy.types import Panel, Operator, PropertyGroup
from bpy.props import StringProperty, EnumProperty, FloatProperty

class CINEMATICS_PT_main_panel(Panel):
    bl_label = "Backbay Cinematics"
    bl_idname = "CINEMATICS_PT_main"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Cinematics"

    def draw(self, context):
        layout = self.layout

        # Asset Import Section
        box = layout.box()
        box.label(text="Asset Import", icon='IMPORT')
        box.operator("cinematics.import_unit")
        box.operator("cinematics.import_building")
        box.operator("cinematics.import_leader")

        # Rigging Section
        box = layout.box()
        box.label(text="Rigging", icon='ARMATURE_DATA')
        box.operator("cinematics.auto_rig")
        box.operator("cinematics.apply_animations")

        # Scene Section
        box = layout.box()
        box.label(text="Scene Setup", icon='SCENE_DATA')
        box.prop(context.scene, "cinematic_lighting_preset")
        box.operator("cinematics.setup_lighting")
        box.operator("cinematics.setup_camera_rig")

        # Render Section
        box = layout.box()
        box.label(text="Render", icon='RENDER_ANIMATION')
        box.prop(context.scene, "cinematic_quality_preset")
        box.operator("cinematics.render_shot")


class CINEMATICS_OT_import_unit(Operator):
    bl_idname = "cinematics.import_unit"
    bl_label = "Import Unit"

    unit_type: EnumProperty(
        name="Unit Type",
        items=[
            ('warrior', 'Warrior', ''),
            ('archer', 'Archer', ''),
            ('knight', 'Knight', ''),
            # ... etc
        ]
    )

    def execute(self, context):
        # Import unit mesh
        return {'FINISHED'}


def register():
    bpy.utils.register_class(CINEMATICS_PT_main_panel)
    bpy.utils.register_class(CINEMATICS_OT_import_unit)
    # ... register more classes

def unregister():
    bpy.utils.unregister_class(CINEMATICS_PT_main_panel)
    bpy.utils.unregister_class(CINEMATICS_OT_import_unit)
    # ... unregister more classes
```

### 10.3 Asset Pipeline Integration

```yaml
# .github/workflows/cinematics-pipeline.yml

name: Cinematics Asset Pipeline

on:
  push:
    paths:
      - 'assets/**/*.glb'
      - 'cinematics/scripts/**/*.yaml'
  workflow_dispatch:

jobs:
  process-assets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Blender
        uses: nytimes/blender-action@v1
        with:
          blender_version: "4.0.0"

      - name: Process New Assets
        run: |
          python -m fab.cinematics.cli batch_process_assets

      - name: Generate LODs
        run: |
          blender --background --python scripts/generate_lods.py

      - name: Upload Processed Assets
        uses: actions/upload-artifact@v4
        with:
          name: processed-cinematics
          path: assets/processed/

  render-previews:
    needs: process-assets
    runs-on: [self-hosted, gpu]
    steps:
      - name: Render Preview Frames
        run: |
          python -m fab.cinematics.cli render_previews --quality preview
```

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
```
□ Set up Blender Python environment
□ Create asset import/export scripts
□ Implement Mixamo integration for auto-rigging
□ Build basic camera rig system
□ Create lighting presets
```

### Phase 2: Character Pipeline (Week 3-4)
```
□ Batch rig all humanoid units
□ Set up mounted unit dual rigs
□ Create vehicle/siege mechanical rigs
□ Import and organize animation library
□ Build animation retargeting system
```

### Phase 3: Environment System (Week 5-6)
```
□ Create terrain generation system
□ Build scene assembly tools
□ Implement prop placement system
□ Set up weather/atmosphere effects
□ Create destruction state variants
```

### Phase 4: Godot Integration (Week 7-8)
```
□ Build CutscenePlayer addon
□ Implement DialogueSystem
□ Create CameraDirector
□ Set up AnimationTree for characters
□ Build cinematic trigger system
```

### Phase 5: Audio Pipeline (Week 9-10)
```
□ Set up ElevenLabs voice generation
□ Create leader voice profiles
□ Build lip-sync generation system
□ Implement music generation pipeline
□ Create audio synchronization tools
```

### Phase 6: Content Creation (Week 11-12)
```
□ Write intro cinematic storyboard
□ Create wonder completion cinematics
□ Build diplomacy scene templates
□ Produce era transition sequences
□ Create victory/defeat cinematics
```

### Phase 7: Polish & Integration (Week 13-14)
```
□ Quality assurance pass
□ Performance optimization
□ Final renders at production quality
□ Integration testing with game
□ Documentation and handoff
```

---

## 12. Technical Specifications

### 12.1 Asset Specifications

| Asset Type | Poly Count | Texture Resolution | Format |
|------------|------------|-------------------|--------|
| Hero Character (close-up) | 50,000 | 4K | GLB + separate textures |
| Standard Unit | 5,000 | 2K | GLB |
| Building LOD0 | 10,000 | 2K | GLB |
| Building LOD1 | 3,000 | 1K | GLB |
| Environment Prop | 1,000 | 1K | GLB |

### 12.2 Animation Specifications

| Type | Framerate | Length | Loop |
|------|-----------|--------|------|
| Idle | 30 fps | 2-4 sec | Yes |
| Locomotion | 30 fps | 1-2 sec | Yes |
| Combat | 30 fps | 0.5-2 sec | No |
| Cinematic | 24 fps | Variable | No |

### 12.3 Render Specifications

| Quality | Resolution | Samples | Output Format |
|---------|------------|---------|---------------|
| Preview | 1280x720 | 32 | MP4 (H.264) |
| Production | 1920x1080 | 256 | ProRes 422 |
| Cinematic 4K | 3840x2160 | 512 | ProRes 4444 |

### 12.4 Audio Specifications

| Type | Sample Rate | Bit Depth | Format |
|------|-------------|-----------|--------|
| Voice | 44.1 kHz | 24-bit | WAV |
| Music | 48 kHz | 24-bit | WAV |
| SFX | 48 kHz | 24-bit | WAV |
| Final Mix | 48 kHz | 24-bit | AAC/OGG |

---

## Appendix A: File Structure

```
fab/
├── cinematics/
│   ├── __init__.py
│   ├── cli.py
│   ├── asset_processor.py
│   ├── rigging/
│   │   ├── __init__.py
│   │   ├── mixamo_batch.py
│   │   ├── blender_rig.py
│   │   └── facial_rig.py
│   ├── animation/
│   │   ├── __init__.py
│   │   ├── retarget.py
│   │   └── procedural.py
│   ├── environment/
│   │   ├── __init__.py
│   │   ├── terrain.py
│   │   ├── scene_builder.py
│   │   └── lighting.py
│   ├── camera/
│   │   ├── __init__.py
│   │   └── camera_rigs.py
│   ├── audio/
│   │   ├── __init__.py
│   │   ├── voice_generator.py
│   │   ├── music_generator.py
│   │   └── sync.py
│   ├── narrative/
│   │   ├── __init__.py
│   │   └── story_graph.py
│   ├── storyboard/
│   │   ├── __init__.py
│   │   └── parser.py
│   ├── render/
│   │   ├── __init__.py
│   │   └── render_manager.py
│   └── blender_addon/
│       ├── __init__.py
│       └── operators.py
│
├── backbay-imperium/
│   ├── assets/                    # (existing)
│   ├── cinematics/
│   │   ├── scripts/               # Storyboard YAML files
│   │   ├── sequences/             # Rendered sequences
│   │   ├── audio/
│   │   │   ├── voice/
│   │   │   ├── music/
│   │   │   └── sfx/
│   │   └── renders/
│   └── godot_project/
│       └── addons/
│           └── cinematic_system/
│
└── docs/
    └── CUTSCENE_PIPELINE_PLAN.md  # This document
```

---

## Appendix B: External Dependencies

### Python Packages
```
elevenlabs>=0.2.0
requests>=2.31.0
pyyaml>=6.0
numpy>=1.24.0
scipy>=1.10.0
librosa>=0.10.0  # Audio analysis
praat-parselmouth>=0.4.0  # Phoneme extraction
```

### Blender Addons
```
- Rigify (built-in)
- Animation Nodes (optional, for procedural)
- FLIP Fluids (optional, for water)
```

### External Services
```
- Mixamo (free, Adobe account required)
- ElevenLabs (API key required, ~$5/month for indie)
- Suno AI (API access)
```

---

*Document Version: 1.0*
*Last Updated: December 2024*
