# Backbay Imperium (WIP)

This folder contains a standalone Rust workspace implementing the initial architecture from `research/backbay-imperium/IMPLEMENTATION_SPEC.md`.

## Docs

- `DESIGN_LAWS.md`: pillars + non-negotiable design rules
- `GAMEPLAY_SPEC.md`: comprehensive gameplay + “modern Civ 5” vibe target
- `CORE_FEATURES_AND_PROGRESSION.md`: core systems + progression (tech/culture/religion/units/buildings/diplomacy)
- `STORYTELLING_DESIGN.md`: storytelling + narrative design considerations for a Civ-like 4X
- `TECHNICAL_SPEC_AND_IMPLEMENTATION_PLAN.md`: synthesized technical spec + phased implementation plan
- `IMPLEMENTATION_SPEC.md`: deterministic architecture + protocol/contracts
- `SULLA_ANALYSIS.md`: research on high-leverage Civ-like design improvements
- `VERTICAL_SLICE.md`: milestone checklist for the first playable loop

## Workspace

- `crates/backbay-protocol`: shared types + MessagePack wire helpers (commands/events/snapshots)
- `crates/backbay-core`: deterministic simulation core (map/units/cities/combat + YAML rules loader)
- `crates/backbay-godot`: Godot 4 GDExtension bridge (`GameBridge`)
- Embedded default rules live in `crates/backbay-core/data/base/*.yaml`

## Commands

```bash
cd research/backbay-imperium
cargo test
```

## QA

From repo root:

```bash
mise run backbay-qa
```

## Godot Smoke Project

Minimal Godot project lives in `research/backbay-imperium/client`.

```bash
cd research/backbay-imperium
./scripts/build_godot_bridge.sh
```

Or from the repo root:

```bash
mise run backbay-godot-bridge
```

Open `client/` in Godot 4.2+ and run `Main.tscn`. It loads the base YAML files, instantiates `GameBridge`, and drives `apply_command` end-to-end via JSON→MessagePack helpers.
Base YAML files loaded in the smoke project: terrain, units, buildings, techs, improvements, policies, governments.

Controls in the smoke project:

- `LMB`: select unit (on unit) / move (on tile)
- `RMB` or `Shift+LMB`: set `Goto` orders (multi-turn)
- `Tab`: cycle units (current player)
- `Space`/`Enter`: end turn
- `Esc`/`Backspace`: cancel orders (selected unit)
- `R`: repath selected unit `Goto`
- `Z`: toggle ZOC overlay
- `O`: toggle orders overlay

Overlays:

- Blue: movement range
- Yellow: path preview to hovered tile (bright = this-turn; faint = later turns)
- Cyan: current `Goto` orders (selected unit)
- Red outline: enemy ZOC (entering ZOC stops movement/orders with an event)

## Status

Implemented so far:

- Deterministic `Hex` coordinate helpers (neighbors/distance/rings)
- `backbay-protocol` `Command`/`Event`/`Snapshot` models + MessagePack serialization
- `backbay-core` `GameEngine` with minimal `MoveUnit`, `AttackUnit`, `FoundCity`, `EndTurn`
- YAML rules loading + stable compilation into `CompiledRules` + `EffectIndex`
