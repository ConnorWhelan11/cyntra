# Glia Fab Dojo World

Cairo ECS contracts for provable gameplay state on Starknet using the Dojo framework.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Godot Game Client                                          │
│  FabDojoClient.gd → Torii GraphQL queries                   │
│  FabController.gd → Cartridge Controller sessions           │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP/WS
┌────────────────────────────▼────────────────────────────────┐
│  Torii Indexer                                              │
│  Indexes world state, provides GraphQL/gRPC API             │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Katana Sequencer                                           │
│  Local/hosted Starknet sequencer                            │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Dojo World (Cairo Contracts)                               │
│  Asset Registry + Spawn System + Models                     │
└─────────────────────────────────────────────────────────────┘
```

## Models

### Asset Models (`models/asset.cairo`)

- **Asset**: Core asset registry (IPFS CID, Membrane attestation, quality tier)
- **AssetInstance**: Spawned instance in a world (position, rotation, scale)
- **AssetOwnership**: Tracks who owns/can spawn assets

### Player Models (`models/player.cairo`)

- **Player**: Player state in a world (position, health, character)
- **InventorySlot**: Player inventory items
- **PlayerSession**: Controller session tracking
- **PlayerStats**: Accumulated statistics (XP, achievements)

### World Models (`models/world_meta.cairo`)

- **WorldMeta**: World metadata (name, description, state)
- **WorldConfig**: World settings (bounds, permissions)
- **WorldAccess**: Per-user access control

## Systems

### Asset Registry (`systems/asset_registry.cairo`)

- `register_asset`: Register new asset with IPFS CID
- `set_attestation`: Link Membrane attestation UID
- `transfer_ownership`: Transfer asset ownership
- `grant_spawn_permission`: Allow address to spawn asset
- `revoke_spawn_permission`: Remove spawn permission

### Spawn (`systems/spawn.cairo`)

- `spawn_asset`: Place asset instance in world
- `despawn_asset`: Remove instance (soft delete)
- `update_transform`: Move/rotate instance
- `join_world`: Player joins world
- `leave_world`: Player leaves world
- `update_player_position`: Update player transform
- `pickup_item`: Take item into inventory
- `drop_item`: Drop item from inventory

## Development

### Prerequisites

```bash
# Install Dojo CLI
curl -L https://install.dojoengine.org | bash
dojoup
```

### Build

```bash
cd fab/dojo
sozo build
```

### Test

```bash
sozo test
```

### Local Development

```bash
# Terminal 1: Start Katana sequencer
katana --disable-fee

# Terminal 2: Deploy contracts
sozo migrate

# Terminal 3: Start Torii indexer
torii --world <WORLD_ADDRESS>
```

### Deploy to Slot (Production)

```bash
# Login to Cartridge
slot auth login

# Deploy project
slot deployments create glia-fab katana

# Deploy contracts
sozo --profile prod migrate

# Start indexer
slot deployments create glia-fab torii --world <WORLD_ADDRESS>
```

## Configuration

### Development (`dojo_dev.toml`)

```toml
[env]
rpc_url = "http://localhost:5050"
```

### Production (`dojo_prod.toml`)

```toml
[env]
rpc_url = "https://api.cartridge.gg/x/glia-fab/katana"

[slot]
project = "glia-fab"
tier = "basic"
```

## Integration with Membrane

Assets registered in Dojo can reference Membrane attestation UIDs:

1. **Asset Creation**: Artist creates 3D asset, passes Fab quality gates
2. **Membrane Attestation**: Asset is uploaded to IPFS, EAS attestation created on Base
3. **Dojo Registration**: Asset registered with IPFS CID + attestation UID
4. **Quality Verification**: Worlds can require minimum quality tiers

```
                            ┌──────────────────┐
                            │   Membrane       │
                            │   (Base L2)      │
                            │                  │
    ┌───────────────────────┤  EAS Attestation │
    │ attestation_uid       │  IPFS Upload     │
    │                       └──────────────────┘
    ▼
┌──────────────────────────────────────────────┐
│  Dojo World (Starknet)                       │
│                                              │
│  Asset {                                     │
│    asset_id: felt252,                        │
│    ipfs_cid: ByteArray,                      │
│    attestation_uid: felt252,  ◄── Reference  │
│    quality: QualityTier,                     │
│  }                                           │
└──────────────────────────────────────────────┘
```

## Cartridge Controller

Games use Cartridge Controller for:

- **Session Keys**: Gasless gameplay transactions
- **Passkey Auth**: WebAuthn for secure, passwordless login
- **Paymaster**: Transaction fee sponsorship

See `FabController.gd` for Godot integration.
