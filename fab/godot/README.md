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

## Build a Web export (via Cyntra)

If you have Godot installed, you can build a Web export (and emit a `godot_report.json`)
with:

- If `cyntra` is installed: `fab-godot --asset path/to/level.glb --config godot_integration_v001 --out /tmp/fab-game`
- Or from source: `cd kernel && PYTHONPATH=src python -m cyntra.fab.godot --asset ../path/to/level.glb --config godot_integration_v001 --out /tmp/fab-game`

To place the build where the Three.js viewer can “Play” it:

- If `cyntra` is installed: `fab-godot --asset fab/assets/viewer/assets/exports/gothic_library_full.glb --config godot_integration_v001 --out fab/assets/viewer/assets/games/gothic_library_full`
- Or from source: `cd kernel && PYTHONPATH=src python -m cyntra.fab.godot --asset ../fab/assets/viewer/assets/exports/gothic_library_full.glb --config godot_integration_v001 --out ../fab/assets/viewer/assets/games/gothic_library_full`

Note: Godot 4.x does not support the `KHR_draco_mesh_compression` glTF extension. If your
viewer export is Draco-compressed, `fab-godot` will attempt to decode it via Blender
before importing into Godot.

## Visual fidelity

The Web export uses Godot’s Compatibility renderer (WebGL). To adjust the look:

- Lighting: edit `fab/godot/template/scenes/Main.tscn` (`Sun`, `Fill`).
- Post-processing: edit `fab/godot/template/assets/fab_environment.tres`
  (`ambient_light_energy`, `tonemap_exposure`, `glow_*`, `ssao_*`).

## Web export preset

`fab/godot/template/export_presets.cfg` includes a starter "Web" preset meant for CI
automation. You may still need to configure export templates locally in the Godot editor.

## Dojo/Starknet Integration

The template includes autoloads for onchain gameplay state via Dojo:

### Autoloads

- **FabDojoConfig**: Configuration (Torii URL, RPC URL, world address)
- **FabDojoClient**: GraphQL client for querying state from Torii indexer
- **FabController**: Cartridge Controller integration for wallet/sessions

### Quick Start

1. Deploy Dojo contracts (see `fab/dojo/README.md`)
2. Configure endpoints in `FabDojoConfig`:
   ```gdscript
   FabDojoConfig.torii_url = "http://localhost:8080/graphql"
   FabDojoConfig.rpc_url = "http://localhost:5050"
   FabDojoConfig.world_address = "0x..."
   ```
3. Connect wallet and join world:
   ```gdscript
   FabController.connect_wallet()
   await FabController.session_created
   FabController.join_world("world_1", "PlayerName", "character_asset_id")
   ```

### Querying State

```gdscript
# Get all asset instances in a world
FabDojoClient.get_world_instances("world_1", func(instances):
    for inst in instances:
        var pos = FabDojoClient.vec3_from_fixed(inst["position"])
        print("Instance at: ", pos)
)

# Subscribe to real-time updates
FabDojoClient.connect_realtime()
FabDojoClient.subscribe_assets("world_1")
FabDojoClient.asset_spawned.connect(func(data):
    print("Asset spawned: ", data)
)
```

### Transactions

```gdscript
# Update player position (uses session key, no wallet popup)
FabController.update_position("world_1", player.global_position, player.quaternion)

# Spawn an asset
FabController.spawn_asset(
    "world_1",
    "asset_id",
    "instance_id",
    Vector3(10, 0, 5),
    Quaternion.IDENTITY,
    Vector3.ONE
)
```

See `fab/dojo/README.md` for contract details and deployment instructions.
