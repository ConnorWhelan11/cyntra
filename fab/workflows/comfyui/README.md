# ComfyUI Workflows

This directory contains ComfyUI workflow templates for the glia-fab asset pipeline.

## Usage

Workflows are invoked via the `comfyui` stage type in `world.yaml`:

```yaml
stages:
  - id: texture_gen
    type: comfyui
    workflow: fab/workflows/comfyui/txt2img_sdxl.json
    comfyui_params:
      positive_prompt: "seamless wood texture, 4k, pbr material"
      negative_prompt: "blurry, watermark, text"
      steps: 30
      cfg: 7.5
    settings:
      host: localhost
      port: 8188
      timeout_seconds: 300
```

## Seed Injection

All workflows automatically have their random seeds replaced with the manifest's deterministic seed. This ensures reproducible generation across runs.

Supported sampler node types:
- KSampler
- KSamplerAdvanced
- SamplerCustom
- SamplerCustomAdvanced
- RandomNoise
- Noise_RandomNoise

## Parameter Injection

The `comfyui_params` dict can inject values into workflow nodes. Parameters are matched by key name to node input fields:
- `positive_prompt` → CLIPTextEncode positive text
- `negative_prompt` → CLIPTextEncode negative text
- `steps` → KSampler steps
- `cfg` → KSampler cfg
- `width`, `height` → EmptyLatentImage dimensions

---

## Available Workflows

### txt2img_sdxl.json
Basic SDXL text-to-image generation.

**Required Models:**
- `sd_xl_base_1.0.safetensors` (checkpoint)

**Parameters:**
- `positive_prompt`: Text description of desired image
- `negative_prompt`: Things to avoid
- `steps`: Sampling steps (default: 30)
- `cfg`: Classifier-free guidance scale (default: 7.5)

---

### chord_image_to_material.json ⭐
**Ubisoft CHORD PBR Material Generation (SDXL)**

Generate seamless textures with SDXL and extract full PBR material maps using Ubisoft's CHORD model. This is the recommended workflow for high-quality PBR material creation.

**Source:** [ubisoft/ComfyUI-Chord](https://github.com/ubisoft/ComfyUI-Chord)

**Required Models:**
- `sd_xl_base_1.0.safetensors` (checkpoint) - [HuggingFace](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)
- `chord_v1.safetensors` (checkpoint) - [HuggingFace](https://huggingface.co/Ubisoft/ubisoft-laforge-chord)

**Required Custom Nodes:**
- [ComfyUI-Chord](https://github.com/ubisoft/ComfyUI-Chord)
- [comfyui-seamless-tiling](https://github.com/spinagon/comfyui-seamless-tiling)

**Outputs:**
- `basecolor` - Diffuse/albedo map
- `normal` - Normal map (OpenGL format)
- `roughness` - Roughness map
- `metalness` - Metalness map
- `height` - Height/displacement map (derived from normal)

**Parameters:**
- `positive_prompt`: Texture description (e.g., "worn leather texture, seamless tileable")
- `negative_prompt`: Things to avoid
- `steps`: Sampling steps (default: 30)
- `cfg`: Guidance scale (default: 7)
- `width`, `height`: Output dimensions (default: 1024x1024)

**Example Usage:**
```yaml
stages:
  - id: material_gen
    type: comfyui
    workflow: fab/workflows/comfyui/chord_image_to_material.json
    comfyui_params:
      positive_prompt: "aged oak wood planks, seamless tileable, top down view"
      negative_prompt: "blurry, low quality, watermark"
      steps: 30
      cfg: 7
```

---

### chord_turbo_image_to_material.json
**Ubisoft CHORD PBR Material Generation (Turbo - Fast)**

Fast texture generation using Z-Image Turbo (only 9 steps!) with CHORD PBR decomposition. Produces 2048x2048 output. Use this when speed is more important than maximum quality.

**Source:** [ubisoft/ComfyUI-Chord](https://github.com/ubisoft/ComfyUI-Chord)

**Required Models:**
- `z_image_turbo_bf16.safetensors` (diffusion model) - [HuggingFace](https://huggingface.co/Comfy-Org/z_image_turbo)
- `qwen_3_4b.safetensors` (text encoder) - [HuggingFace](https://huggingface.co/Comfy-Org/z_image_turbo)
- `ae.safetensors` (VAE) - [HuggingFace](https://huggingface.co/Comfy-Org/z_image_turbo)
- `chord_v1.safetensors` (checkpoint) - [HuggingFace](https://huggingface.co/Ubisoft/ubisoft-laforge-chord)

**Required Custom Nodes:**
- [ComfyUI-Chord](https://github.com/ubisoft/ComfyUI-Chord)

**Outputs:** Same as `chord_image_to_material.json`

**Parameters:**
- `positive_prompt`: Texture description
- `steps`: Sampling steps (default: 9 - turbo mode)
- `width`, `height`: Output dimensions (default: 2048x2048)

---

### texture_upscale_4x.json
**Texture Upscaling (4x)**

Upscale textures 4x using the UltraSharp ESRGAN model. This is a pure upscaling workflow that preserves material detail without AI hallucination or style changes.

**Source:** [greenzorro/comfyui-workflow-upscaler](https://github.com/greenzorro/comfyui-workflow-upscaler)

**Required Models:**
- `4x-UltraSharp.pth` (upscale model) - [HuggingFace](https://huggingface.co/philz1337x/upscaler/resolve/main/4x-UltraSharp.pth)

**Required Custom Nodes:** None (uses built-in nodes)

**Outputs:**
- `upscaled` - 4x upscaled image

**Parameters:**
- `input_image`: Path to image to upscale

**Example Usage:**
```yaml
stages:
  - id: upscale_texture
    type: comfyui
    workflow: fab/workflows/comfyui/texture_upscale_4x.json
    inputs:
      input_image: ${previous_stage.basecolor}
```

---

### flux_inpainting.json
**FLUX Inpainting / Texture Repair**

Inpaint and repair textures using the FLUX model. Use this for fixing artifacts, filling gaps, or blending seams in textures.

**Source:** [rubi-du/ComfyUI-Flux-Inpainting](https://github.com/rubi-du/ComfyUI-Flux-Inpainting)

**Required Models:**
- `clip_l.safetensors` (text encoder) - [HuggingFace](https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8)
- `t5xxl_fp16.safetensors` (text encoder) - [HuggingFace](https://huggingface.co/comfyanonymous/flux_text_encoders)
- `flux1-fill-dev.safetensors` (diffusion model) - [HuggingFace](https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev)

**Required Custom Nodes:**
- [ComfyUI-Flux-Inpainting](https://github.com/rubi-du/ComfyUI-Flux-Inpainting)

**Outputs:**
- `inpainted` - Repaired image

**Parameters:**
- `prompt`: Description of what to generate in masked area
- `input_image`: Image with alpha mask (transparent = inpaint area)
- `steps`: Sampling steps (default: 30)
- `denoise`: Denoise strength (default: 50)

---

## Creating New Workflows

1. Design your workflow in ComfyUI's web interface
2. Export via "Save (API Format)" button
3. Place the JSON file in this directory
4. Ensure sampler nodes use the `seed` input (for determinism)
5. Add a `_fab_meta` object to the JSON with:
   - `name`: Human-readable name
   - `description`: What the workflow does
   - `source`: URL to original source
   - `required_models`: Array of model requirements
   - `required_custom_nodes`: Array of custom node repos
   - `outputs`: Array of output names
   - `parameters`: Map of injectable parameters

## Server Requirements

ComfyUI must be running with:
- API enabled (default)
- Required models installed in `ComfyUI/models/`
- Required custom nodes installed via ComfyUI-Manager
- Sufficient VRAM for the workflow (8GB+ recommended, 16GB+ for FLUX)

## Model Installation

Models should be placed in the appropriate ComfyUI directories:

| Model Type | Directory |
|------------|-----------|
| Checkpoints | `ComfyUI/models/checkpoints/` |
| Upscale Models | `ComfyUI/models/upscale_models/` |
| Text Encoders | `ComfyUI/models/text_encoders/` or `ComfyUI/models/clip/` |
| VAE | `ComfyUI/models/vae/` |
| Diffusion Models | `ComfyUI/models/diffusion_models/` or `ComfyUI/models/unet/` |

## Custom Node Installation

Install custom nodes via ComfyUI-Manager or manually:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ubisoft/ComfyUI-Chord.git
pip install -r ComfyUI-Chord/requirements.txt
```
