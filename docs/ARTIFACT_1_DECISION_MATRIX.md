# ARTIFACT_1_DECISION_MATRIX.md

## Bevy + Rapier Integration Decision Matrix

**Date:** 2025-12-30
**Target:** `crates/ai-bevy` (Bevy 0.16.1 adapter for AI systems)

---

## Repo Findings

### Current Architecture

| Aspect | Current State |
|--------|---------------|
| **Dimension** | **3D** - Uses `Camera3d`, `Transform.translation` with XZ plane for 2D navigation logic |
| **Time/Tick** | `Update` schedule (NOT `FixedUpdate`). `AiTick.dt_seconds` defaults to 1/60, manually set |
| **Transform Origin** | AI positions stored in `AiPosition(Vec2)`, synced bidirectionally with Bevy `Transform` via `transform-sync` feature |
| **Existing Physics** | **None** - Only `NavMesh` pathfinding, `AiCrowdAgent` for crowd avoidance (velocity-based), and `AiRaycastCallback` for perception line-of-sight |
| **Godot Boundary** | Separate project (`backbay-imperium`) uses `godot-rust` directly for turn-based strategy. **No Bevy↔Godot bridge exists yet** |

### Key Files Analyzed

| File | Purpose |
|------|---------|
| `crates/ai-bevy/src/lib.rs` | Core Bevy adapter: `AiBevyPlugin`, `BevyAiWorld`, transform sync |
| `crates/ai-bevy/src/crowd.rs` | ORCA-style crowd avoidance (velocity steering, no physics) |
| `crates/ai-bevy/examples/crowd_demo.rs` | 3D demo: capsule agents on XZ plane, navmesh navigation |
| `research/backbay-imperium/crates/backbay-godot/src/lib.rs` | godot-rust GDExtension for turn-based game (unrelated to Bevy) |

### Constraints Identified

1. **Determinism Required** - AI system designed for deterministic replay (seeds, stable agent IDs)
2. **2D Logic on 3D World** - Navigation uses `Vec2` mapped to XZ, but rendering is 3D
3. **No Existing Physics** - Greenfield integration opportunity
4. **Bevy 0.16.1** - Must use compatible `bevy_rapier` version (0.28.x)

---

## Decision Matrix

| Criterion | **bevy_rapier3d** | **Direct Rapier** | **Godot Authoritative** | **Avian3D** |
|-----------|-------------------|-------------------|-------------------------|-------------|
| **Dev Velocity** | ★★★★★ Excellent - Component-based API, automatic sync | ★★☆☆☆ Slow - Manual pipeline management | ★☆☆☆☆ N/A - No Bevy↔Godot bridge | ★★★★☆ Good - ECS-native but less docs |
| **Safety/Complexity** | ★★★★☆ Low - Pure Rust, no FFI | ★★★☆☆ Medium - Manual resource management | ★★☆☆☆ High - FFI to Godot, complex IPC | ★★★★★ Low - Pure Rust, idiomatic Bevy |
| **Determinism** | ★★★★☆ Good - Fixed timestep, snapshots supported | ★★★★★ Excellent - Direct control over seeds/stepping | ★★☆☆☆ Poor - Godot's float precision varies | ★★★★★ Excellent - `enhanced-determinism` feature |
| **Networking Readiness** | ★★★★☆ Good - Snapshot/restore, fixed dt | ★★★★★ Excellent - Full control | ★★☆☆☆ Poor - Cross-process sync difficult | ★★★★★ Excellent - Built for determinism |
| **Performance** | ★★★★★ Excellent - SIMD, parallelized | ★★★★★ Excellent - Same engine | ★★★☆☆ Unknown - IPC overhead | ★★★☆☆ Good - Slower than Rapier currently |
| **Godot Interop** | ★★★★☆ Good - Stream transforms via channel | ★★★★☆ Good - Same approach | ★★★★★ Native - But wrong architecture | ★★★★☆ Good - Same as bevy_rapier |
| **Debuggability** | ★★★★★ Excellent - `RapierDebugRenderPlugin` | ★★★☆☆ Medium - Manual debug draw | ★★★★☆ Good - Godot debug tools | ★★★★☆ Good - Debug plugin available |
| **Maturity** | ★★★★★ Production-ready, widely used | ★★★★★ Same engine | ★★☆☆☆ Experimental architecture | ★★★☆☆ Newer, less battle-tested |
| **Bevy Integration** | ★★★★★ Excellent - PhysicsSet schedules | ★★☆☆☆ Manual - Roll your own | ★☆☆☆☆ N/A | ★★★★★ Excellent - ECS-native design |

### Risk Assessment

| Option | Key Risks |
|--------|-----------|
| **bevy_rapier3d** | Version coupling with Bevy (minor), nalgebra↔glam conversions |
| **Direct Rapier** | Significant boilerplate, easy to get scheduling wrong |
| **Godot Authoritative** | Wrong architecture for this repo, would require new Bevy↔Godot bridge |
| **Avian3D** | Less mature, performance gap vs Rapier, fewer production examples |

---

## Recommendation

### Primary: `bevy_rapier3d` Plugin

**Rationale:**
1. **Best fit for ai-bevy** - Component-based API matches existing ECS patterns
2. **Mature ecosystem** - Production-tested, excellent documentation
3. **PhysicsSet scheduling** - Clean integration with `FixedUpdate`
4. **Debug tooling** - `RapierDebugRenderPlugin` accelerates development
5. **Character controller** - Built-in `KinematicCharacterController` for AI agents
6. **Collision events** - `CollisionEvent` system for gameplay triggers

**Version:** `bevy_rapier3d = "0.28"` (compatible with Bevy 0.16.x)

### Fallback: Avian3D

**When to use:**
- If cross-platform determinism becomes critical (mobile/web/server parity)
- If the Rapier nalgebra dependency causes issues
- If ECS-native design proves more ergonomic for this codebase

### Rejected: Godot Authoritative

**Why:**
- `backbay-imperium` is a **separate** turn-based game using godot-rust directly
- No existing Bevy↔Godot physics bridge in this repo
- Would require building complex IPC/FFI layer
- Physics authority should live in Rust for AI determinism

### Rejected: Direct Rapier

**Why:**
- `bevy_rapier` provides the same engine with less boilerplate
- Manual scheduling is error-prone
- No benefit for this use case

---

## Sources

1. [Rapier Bevy Plugin - Simulation Structures](https://rapier.rs/docs/user_guides/bevy_plugin/simulation_structures/)
2. [Rapier Character Controller](https://rapier.rs/docs/user_guides/bevy_plugin/character_controller/)
3. [Tainted Coders - Bevy Physics: Rapier](https://taintedcoders.com/bevy/physics/rapier)
4. [Bevy Cheatbook - Fixed Timestep](https://bevy-cheatbook.github.io/fundamentals/fixed-timestep.html)
5. [Avian Physics crate](https://docs.rs/avian3d)
6. [Reddit - Avian 0.4 Determinism Discussion](https://www.reddit.com/r/rust/comments/1o5hsbi/avian_04_ecsdriven_physics_for_bevy/)
