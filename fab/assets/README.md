Outora Library

This folder contains the Outora Library asset pipeline: Blender scenes, automation
scripts, exported assets, and a small Python helper package (now in the kernel).

Layout

- `blender/`: Blender automation scripts and working `.blend` files (run these via Blender).
- `models/`, `textures/`, `hdris/`, `room1107/`: Source assets.
- `exports/`: Generated exports (GLB/FBX, atlases, etc).
- `renders/`: Preview renders for review.
- `kernel/src/cyntra/fab/outora/`: Lightweight Python helpers (path utilities, shared logic).

Quick start

1. Create a venv and install dev deps:
   - `cd kernel && python -m venv .venv && source .venv/bin/activate`
   - `pip install -e ".[dev,fab]"`

2. Run a Blender script headless (example):
   - macOS: `/Applications/Blender.app/Contents/MacOS/Blender fab/assets/blender/outora_library_v0.4.0.blend --background --python fab/assets/blender/run_pipeline.py`
   - Other: `blender fab/assets/blender/outora_library_v0.4.0.blend --background --python fab/assets/blender/run_pipeline.py`

Lint/tests

- `cd kernel && ruff check src/cyntra/fab/outora`
- `cd kernel && pytest tests/fab/`

Notes

- The Python package is intended for helpers; most functionality lives in Blender
  scripts and relies on `bpy`.
- Avoid committing large `.blend1` backups unless they’re intentional releases.
