# UDE Vault

A curated source-of-truth repository for Godot templates, addons, and tooling that agents can reliably copy from.

## Purpose

The UDE Vault provides:
- **Deterministic builds**: Pinned versions with SHA256 verification
- **Agent-friendly discovery**: Machine-readable `catalog.yaml` for quick lookups
- **Battle-tested modules**: Curated selection of production-quality addons
- **Offline capability**: Fully vendored (no network required at build time)

## Structure

```
fab/vault/
  catalog.yaml                    # Master catalog - agents read this first
  godot/
    templates/
      registry.json               # Template registry
      fab_game_template/          # Fab-compatible Godot template
      maaack_game_template/       # Full-featured game starter
      minimal_template/           # Tiny baseline
    addons/
      registry.json               # Addon registry
      gdunit4/                    # Unit testing
      debug_draw_3d/              # 3D debug visualization
      phantom_camera/             # Cinematic camera
      dialogue_manager/           # Branching dialogue
      gloot/                      # Inventory system
      beehave/                    # Behavior trees (AI)
      gut/                        # Alternative testing
      rollback_netcode/           # Multiplayer netcode
    tooling/
      registry.json               # Tooling registry
      gdscript_toolkit/           # Lint/format
  scripts/
    sync_upstreams.sh             # Update from upstream repos
    validate_hashes.py            # Verify SHA256 integrity
```

## Usage

### For Agents

Query the catalog to discover available addons:

```python
from cyntra.fab.vault import get_vault_registry

vault = get_vault_registry()

# List all testing addons
testing_addons = vault.list_addons(kind="testing")

# Get specific addon
gdunit = vault.get_addon("gdunit4")

# Install addon to project
vault.install_addon("gdunit4", project_path)

# Copy template
vault.copy_template("fab_game_template", dest_path)
```

### In world.yaml

Reference vault addons in your world configuration:

```yaml
generator:
  required_addons:
    - id: gdunit4
      required: true
    - id: debug_draw_3d
      required: false
```

### Manual Addon Installation

Each addon directory contains an `addon/` subdirectory with the actual addon files:

```bash
# Install gdunit4 to your project
cp -r fab/vault/godot/addons/gdunit4/addon/* my_project/addons/
```

## Addon Catalog

| ID | Kind | Description |
|----|------|-------------|
| `gdunit4` | testing | Unit testing framework for GDScript/C# |
| `gut` | testing | Simpler unit testing tool |
| `debug_draw_3d` | debug | Runtime 3D debug visualization |
| `phantom_camera` | camera | Cinematic camera behaviors |
| `dialogue_manager` | dialogue | Branching dialogue system |
| `gloot` | inventory | Universal inventory system |
| `beehave` | ai | Behavior tree editor/runtime |
| `rollback_netcode` | netcode | Rollback netcode for multiplayer |

## Template Catalog

| ID | Kind | Description |
|----|------|-------------|
| `fab_game_template` | game | Fab-compatible template with FabLevelLoader |
| `maaack_game_template` | game | Full-featured with menus/settings |
| `minimal_template` | minimal | Tiny baseline for experiments |

## Updating Addons

To update vendored addons from upstream:

```bash
# Update all addons
./fab/vault/scripts/sync_upstreams.sh

# Update specific addon
./fab/vault/scripts/sync_upstreams.sh gdunit4

# Verify hashes after update
python fab/vault/scripts/validate_hashes.py
```

## Adding New Addons

1. Add entry to `catalog.yaml` with upstream URL and pinned ref
2. Add entry to `godot/addons/registry.json`
3. Run `sync_upstreams.sh <addon_id>` to vendor
4. Create `manifest.json` in addon directory
5. Run `validate_hashes.py` to compute SHA256

## Design Principles

1. **Immutable once vendored**: Don't modify addon source; update by bumping version
2. **Pinned versions**: Always specify exact tag/commit, never `main`
3. **SHA256 tracking**: Detect drift from expected state
4. **Agent-first**: Machine-readable formats for programmatic access
5. **Offline-first**: Full vendor for deterministic, network-free builds
