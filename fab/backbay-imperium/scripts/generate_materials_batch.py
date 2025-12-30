#!/usr/bin/env python3
"""Generate all 45 PBR materials for Backbay Imperium."""

import json
import time
import urllib.request
import urllib.error
from pathlib import Path

COMFY_URL = "https://1plxkvbhkv0zd3-8188.proxy.runpod.net"
OUTPUT_DIR = Path("/Users/connor/Medica/glia-fab/fab/backbay-imperium/assets/materials")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# All 45 materials from materials.yaml
MATERIALS = [
    # Terrain Materials (15)
    ("mat_grass_lush", "lush green grass meadow, thick blades, natural color variation, some clovers"),
    ("mat_grass_dry", "dry yellow brown grass, autumn prairie, dead patches, hay-like"),
    ("mat_grass_wild", "wild meadow grass, mixed flowers, dandelions, natural overgrown"),
    ("mat_dirt_forest", "forest floor dirt, scattered leaves and twigs, dark brown humus"),
    ("mat_dirt_dry", "dry cracked earth, drought soil, parched ground, cracks"),
    ("mat_sand_beach", "fine beach sand, golden yellow, subtle ripples, wave patterns"),
    ("mat_sand_desert", "desert sand, golden dunes texture, windswept patterns, Sahara"),
    ("mat_gravel_path", "gravel path, mixed pebbles, gray and brown stones, pathway"),
    ("mat_rock_granite", "gray granite rock surface, natural cracks, rough texture"),
    ("mat_rock_limestone", "white limestone rock, sedimentary layers, fossil imprints"),
    ("mat_snow_fresh", "fresh white snow, powder texture, sparkly, pristine winter"),
    ("mat_snow_packed", "packed snow, compressed, ice crystals visible, footprint texture"),
    ("mat_mud_wet", "wet mud, dark brown, puddles, waterlogged soil"),
    ("mat_water_shallow", "shallow water surface, clear, sandy bottom visible, caustics"),
    ("mat_water_deep", "deep ocean water, dark blue, wave patterns, mysterious depths"),

    # Architecture Materials (10)
    ("mat_brick_red", "classic red brick wall, white mortar lines, slightly weathered"),
    ("mat_brick_ancient", "ancient mud brick, sun-baked clay, crumbling edges, Mesopotamian"),
    ("mat_stone_castle", "medieval castle stone blocks, large cut stones, moss in cracks"),
    ("mat_stone_roman", "Roman travertine stone, warm cream color, ancient architecture"),
    ("mat_marble_white", "white Carrara marble, elegant veining, polished, classical"),
    ("mat_marble_green", "verde antico marble, dark green with white veins, Roman"),
    ("mat_plaster_white", "white painted plaster wall, subtle texture, Mediterranean"),
    ("mat_stucco_terracotta", "terracotta stucco exterior, warm orange, Italian villa style"),
    ("mat_tiles_terracotta", "terracotta roof tiles, overlapping pattern, warm orange red"),
    ("mat_tiles_slate", "slate roof tiles, dark gray, layered pattern, traditional"),

    # Wood Materials (6)
    ("mat_wood_oak_planks", "oak wood floor planks, warm honey tone, visible grain pattern"),
    ("mat_wood_walnut", "dark walnut wood, rich brown, elegant grain, furniture quality"),
    ("mat_wood_pine", "fresh pine wood boards, light blonde color, visible knots"),
    ("mat_wood_weathered", "old weathered wood, gray patina, cracked and worn, driftwood"),
    ("mat_wood_painted", "white painted wood boards, slightly chipped, farmhouse style"),
    ("mat_bamboo_woven", "woven bamboo mat texture, natural tan color, tight weave"),

    # Metal Materials (6)
    ("mat_bronze_polished", "polished bronze metal, warm golden tone, ancient metalwork"),
    ("mat_bronze_patina", "aged bronze with green patina, verdigris oxidation, antique"),
    ("mat_iron_forged", "forged iron, dark gray, hammer marks, blacksmith work"),
    ("mat_iron_rust", "rusty corroded iron, orange and brown patina, industrial decay"),
    ("mat_gold_ornate", "ornate gold surface, engraved patterns, royal luxury, shiny"),
    ("mat_silver_tarnished", "tarnished silver, slightly oxidized, antique silverware look"),

    # Fabric Materials (5)
    ("mat_leather_brown", "brown leather texture, subtle grain, worn, saddle leather"),
    ("mat_linen_natural", "natural linen fabric, cream color, visible weave"),
    ("mat_silk_red", "red silk fabric, luxurious sheen, subtle folds, Chinese"),
    ("mat_wool_rough", "rough wool fabric, natural gray, handwoven texture"),
    ("mat_canvas_military", "military canvas, olive drab, heavy duty, tent material"),
]

def submit_material(mat_id: str, prompt: str, seed: int) -> str:
    """Submit a material generation job."""
    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncodeSDXL",
            "inputs": {
                "text_g": f"{prompt}, seamless tileable PBR material texture, top-down orthographic view, highly detailed, 8k",
                "text_l": f"{prompt}, seamless tileable texture, photorealistic",
                "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0,
                "target_width": 1024, "target_height": 1024,
                "clip": ["1", 1]
            }
        },
        "3": {
            "class_type": "CLIPTextEncodeSDXL",
            "inputs": {
                "text_g": "text, watermark, logo, seams visible, repetitive pattern, low quality, blurry, grainy",
                "text_l": "bad quality, distorted",
                "width": 1024, "height": 1024, "crop_w": 0, "crop_h": 0,
                "target_width": 1024, "target_height": 1024,
                "clip": ["1", 1]
            }
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                "latent_image": ["4", 0], "seed": seed, "steps": 25, "cfg": 7.0,
                "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": mat_id}
        }
    }

    data = json.dumps({"prompt": workflow}).encode('utf-8')
    req = urllib.request.Request(
        f"{COMFY_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get("prompt_id", "error")
    except Exception as e:
        return f"error: {e}"

def check_queue() -> tuple:
    """Check queue status."""
    try:
        with urllib.request.urlopen(f"{COMFY_URL}/queue", timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return len(data.get("queue_running", [])), len(data.get("queue_pending", []))
    except:
        return 0, 0

def download_material(mat_id: str) -> bool:
    """Download generated material."""
    filename = f"{mat_id}_00001_.png"
    url = f"{COMFY_URL}/view?filename={filename}&type=output"

    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            content = resp.read()
            if len(content) > 1000:
                output_path = OUTPUT_DIR / f"{mat_id}_basecolor.png"
                output_path.write_bytes(content)
                return True
    except:
        pass
    return False

def main():
    print(f"Generating {len(MATERIALS)} materials...")
    print(f"Output: {OUTPUT_DIR}")
    print()

    # Submit all jobs in batches of 10
    batch_size = 10

    for batch_start in range(0, len(MATERIALS), batch_size):
        batch = MATERIALS[batch_start:batch_start + batch_size]
        batch_num = batch_start // batch_size + 1
        total_batches = (len(MATERIALS) + batch_size - 1) // batch_size
        print(f"Batch {batch_num}/{total_batches}...")

        for i, (mat_id, prompt) in enumerate(batch):
            seed = 42000 + batch_start + i
            prompt_id = submit_material(mat_id, prompt, seed)
            status = prompt_id[:12] if not prompt_id.startswith("error") else "FAILED"
            print(f"  {mat_id}: {status}")

        # Wait for batch to complete
        print("  Waiting for batch to complete...")
        wait_count = 0
        while wait_count < 120:  # Max 10 min per batch
            running, pending = check_queue()
            if running == 0 and pending == 0:
                break
            time.sleep(5)
            wait_count += 1

        print(f"  Batch {batch_num} complete!")

    # Download all materials
    print()
    print("Downloading materials...")
    success = 0
    for mat_id, _ in MATERIALS:
        if download_material(mat_id):
            print(f"  {mat_id}: OK")
            success += 1
        else:
            print(f"  {mat_id}: FAILED")

    print()
    print(f"Complete: {success}/{len(MATERIALS)} materials generated")
    print(f"Output: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
