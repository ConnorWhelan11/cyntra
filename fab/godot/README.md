# Fab Godot Template

This folder contains a minimal Godot 4 template project intended to turn Blender-authored
`.glb` scenes into a basic, testable first-person “walkaround”.

## Contract

See `fab/godot/CONTRACT.md` for the Blender→Godot metadata contract (spawn/colliders).

## Template layout

- `fab/godot/template/`: Godot project (text-only; no bundled assets).
  - `assets/`: place the exported level GLB as `assets/level.glb` (or change the path in
    `scripts/FabLevelLoader.gd`).
  - `assets/fab_environment.tres`: default WorldEnvironment tuned to roughly match the
    Outora Viewer “Ultra Quality” preview defaults (ACES tonemap, exposure, bloom, AO).

## Quick start (local)

1. Export a scene from Blender as `.glb` using the contract markers.
2. Copy it to `fab/godot/template/assets/level.glb`.
3. Open `fab/godot/template/` in Godot 4 and run the project.

## Build a Web export (via dev-kernel)

If you have Godot installed, you can build a Web export (and emit a `godot_report.json`)
with:

- If `dev-kernel` is installed: `fab-godot --asset path/to/level.glb --config godot_integration_v001 --out /tmp/fab-game`
- Or from source: `cd dev-kernel && PYTHONPATH=src python -m dev_kernel.fab.godot --asset ../path/to/level.glb --config godot_integration_v001 --out /tmp/fab-game`

To place the build where the Three.js viewer can “Play” it:

- If `dev-kernel` is installed: `fab-godot --asset fab/outora-library/viewer/assets/exports/gothic_library_full.glb --config godot_integration_v001 --out fab/outora-library/viewer/assets/games/gothic_library_full`
- Or from source: `cd dev-kernel && PYTHONPATH=src python -m dev_kernel.fab.godot --asset ../fab/outora-library/viewer/assets/exports/gothic_library_full.glb --config godot_integration_v001 --out ../fab/outora-library/viewer/assets/games/gothic_library_full`

Note: Godot 4.x does not support the `KHR_draco_mesh_compression` glTF extension. If your
viewer export is Draco-compressed, `fab-godot` will attempt to decode it via Blender
before importing into Godot.

## Visual fidelity

The Web export uses Godot’s Compatibility renderer (WebGL). To adjust the look:

- Lighting: edit `fab/godot/template/scenes/Main.tscn` (`Sun`, `Fill`).
- Post-processing: edit `fab/godot/template/assets/fab_environment.tres`
  (`ambient_light_energy`, `tonemap_exposure`, `glow_*`, `ssao_*`).

## Web export preset

`fab/godot/template/export_presets.cfg` includes a starter “Web” preset meant for CI
automation. You may still need to configure export templates locally in the Godot editor.
