# Outora Library Viewer

This is a static Three.js viewer for exported `.glb` assets, with an optional “Play”
mode that embeds a Godot Web export.

## Run locally (required)

Serve this folder over HTTP (not `file://`) so:

- ES modules load correctly (Three.js via import maps)
- Godot Web exports can fetch their `.pck/.wasm` assets

From `fab/assets/viewer/`:

- `python3 -m http.server 8000`
- Open `http://localhost:8000/`

## Godot exports

The viewer expects game builds at:

- `fab/assets/viewer/assets/games/<asset_id>/index.html`

Example:

- `assets/games/gothic_library_full/index.html`

To build one (requires Godot installed):

- If `cyntra` is installed: `fab-godot --asset fab/assets/viewer/assets/exports/gothic_library_full.glb --config godot_integration_v001 --out fab/assets/viewer/assets/games/gothic_library_full`
- Or from source: `cd kernel && PYTHONPATH=src python -m cyntra.fab.godot --asset ../fab/assets/viewer/assets/exports/gothic_library_full.glb --config godot_integration_v001 --out ../fab/assets/viewer/assets/games/gothic_library_full`
