# ARTIFACT_2_INTEGRATION_BLUEPRINT.md

## Bevy Rapier Integration Blueprint for ai-bevy

**Based on:** ARTIFACT_1_DECISION_MATRIX.md
**Target:** `crates/ai-bevy` crate

---

## Integration Blueprint

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BEVY APP                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐  │
│   │  Input      │     │  AI Systems     │     │  Rapier Physics         │  │
│   │  (Keyboard/ │────▶│  (BrainRegistry │────▶│  (RapierPhysicsPlugin)  │  │
│   │   Gamepad)  │     │   tick_ai)      │     │                         │  │
│   └─────────────┘     └─────────────────┘     └─────────────────────────┘  │
│         │                     │                         │                   │
│         │                     │                         │                   │
│         ▼                     ▼                         ▼                   │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        FixedUpdate Schedule                          │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │  │
│   │  │ SyncIn   │─▶│PhysicsSet│─▶│ AiThink  │─▶│PhysicsSet│─▶│SyncOut │ │  │
│   │  │ (Input)  │  │SyncBackend│  │ (Brains) │  │ Step     │  │(Events)│ │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                     │                                       │
│                                     ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         Update Schedule                              │  │
│   │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │  │
│   │  │ Interpolate      │  │ Render Sync      │  │ Godot Transform   │  │  │
│   │  │ Transforms       │  │ (Visual meshes)  │  │ Streaming (opt)   │  │  │
│   │  └──────────────────┘  └──────────────────┘  └───────────────────┘  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ (Optional future: Transform stream)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GODOT CLIENT (Renderer)                             │
│   - Receives transform updates via channel/IPC                              │
│   - Bodies are kinematic (display only)                                     │
│   - Godot physics DISABLED                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authority Model

| System | Authority | Notes |
|--------|-----------|-------|
| **Physics Simulation** | Rust/Bevy (Rapier) | Single source of truth |
| **Transform** | Rapier → Bevy `Transform` | Via `PhysicsSet::Writeback` |
| **AI Decision Making** | `ai-core` Brain system | Reads physics state, outputs velocities |
| **Rendering** | Bevy (or Godot client) | Interpolated transforms for smooth visuals |
| **Collision Events** | Rapier | Emitted to Bevy event system |

### What Godot Would Be Responsible For (Future)

- **Rendering only** - Visual meshes, materials, lighting
- **UI** - HUD, menus, dialogs
- **Audio** - Sound effects, music
- **NOT physics** - All bodies would be kinematic, driven by Rust

---

## System Ordering + Schedules

### FixedUpdate Schedule (Physics Tick)

```rust
// System ordering within FixedUpdate
app.configure_sets(
    FixedUpdate,
    (
        // 1. Gather input accumulated since last fixed tick
        AiPhysicsSet::InputSync,
        // 2. Rapier syncs Bevy components → internal state
        PhysicsSet::SyncBackend,
        // 3. AI brains read world state, decide actions
        AiBevySet::SyncIn,
        AiBevySet::Think,
        AiBevySet::SyncOut,
        // 4. Apply AI-decided velocities/forces
        AiPhysicsSet::ApplyForces,
        // 5. Rapier steps simulation
        PhysicsSet::StepSimulation,
        // 6. Rapier writes results back to Bevy components
        PhysicsSet::Writeback,
        // 7. Emit gameplay events from collisions
        AiPhysicsSet::CollisionEvents,
    ).chain(),
);
```

### Update Schedule (Render Frame)

```rust
app.configure_sets(
    Update,
    (
        // Visual interpolation for smooth rendering
        AiPhysicsSet::Interpolate,
        // Sync visual meshes with interpolated positions
        AiPhysicsSet::RenderSync,
        // Optional: Stream to Godot client
        AiPhysicsSet::GodotSync,
    ).chain(),
);
```

### System Order Diagram

```
Time ──────────────────────────────────────────────────────────────────────▶

Frame N                                                           Frame N+1
   │                                                                  │
   │  ┌─────────────────────────────────────────────────────────┐    │
   │  │                    FixedUpdate (16.67ms)                 │    │
   │  │                                                          │    │
   │  │   Input  →  Rapier  →  AI    →  Apply  →  Step  →  Write │    │
   │  │   Sync      Sync       Think    Forces    Sim      back  │    │
   │  │                                                          │    │
   │  └─────────────────────────────────────────────────────────┘    │
   │                              │                                   │
   │                              ▼                                   │
   │  ┌────────────────────────────────────────────────────────────┐ │
   │  │                      Update (vsync)                         │ │
   │  │                                                             │ │
   │  │   Interpolate Transforms  →  Render Sync  →  Godot Stream  │ │
   │  │                                                             │ │
   │  └────────────────────────────────────────────────────────────┘ │
   │                                                                  │
```

---

## Module & File Plan

### Proposed Directory Structure

```
crates/ai-bevy/
├── Cargo.toml                    # Add bevy_rapier3d dependency
├── src/
│   ├── lib.rs                    # Existing - add physics feature gate
│   ├── crowd.rs                  # Existing - integrate with physics
│   ├── dialogue.rs               # Existing - unchanged
│   ├── trace_egui.rs             # Existing - unchanged
│   │
│   └── physics/                  # NEW MODULE
│       ├── mod.rs                # Physics module root, feature-gated
│       ├── plugin.rs             # AiPhysicsPlugin setup
│       ├── components.rs         # AiRigidBody, AiCollider wrappers
│       ├── systems.rs            # Sync systems, force application
│       ├── events.rs             # Collision event handling
│       ├── character.rs          # Character controller integration
│       └── debug.rs              # Debug visualization helpers
│
├── examples/
│   ├── crowd_demo.rs             # Existing
│   ├── perception_demo.rs        # Existing
│   ├── bevy_debug_demo.rs        # Existing
│   └── physics_demo.rs           # NEW - Rapier integration demo
```

### File-Level Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `Cargo.toml` | MODIFY | Add `bevy_rapier3d` dep, `physics` feature |
| `src/lib.rs` | MODIFY | Add `#[cfg(feature = "physics")] pub mod physics;` |
| `src/physics/mod.rs` | CREATE | Module root with re-exports |
| `src/physics/plugin.rs` | CREATE | `AiPhysicsPlugin` with schedule config |
| `src/physics/components.rs` | CREATE | `AiCollider`, `AiRigidBodyType` wrappers |
| `src/physics/systems.rs` | CREATE | Force application, velocity sync |
| `src/physics/events.rs` | CREATE | `AiCollisionEvent` wrapper, handlers |
| `src/physics/character.rs` | CREATE | `AiCharacterController` wrapper |
| `src/physics/debug.rs` | CREATE | Debug draw integration |
| `examples/physics_demo.rs` | CREATE | Minimal working demo |

---

## ECS Conventions

### Components

```rust
// Wrapper for cleaner API (maps to Rapier components)
#[derive(Component)]
pub struct AiPhysicsBody {
    pub body_type: AiRigidBodyType,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AiRigidBodyType {
    Dynamic,           // Affected by forces, collisions
    Kinematic,         // Player/AI controlled, not affected by forces
    Fixed,             // Static obstacle (walls, ground)
}

// Collision layers for filtering
#[derive(Clone, Copy)]
pub struct AiCollisionLayers {
    pub membership: u32,  // What groups this belongs to
    pub filter: u32,      // What groups this collides with
}

// Predefined layer constants
pub mod layers {
    pub const AGENT: u32     = 1 << 0;  // AI agents
    pub const OBSTACLE: u32  = 1 << 1;  // Static obstacles
    pub const TRIGGER: u32   = 1 << 2;  // Sensor volumes
    pub const PROJECTILE: u32 = 1 << 3; // Bullets, etc.
    pub const GROUND: u32    = 1 << 4;  // Walkable surfaces
}
```

### Collision Filtering Strategy

```rust
// Example: AI agent that collides with obstacles and ground, triggers sensors
commands.spawn((
    AiAgent(agent_id),
    AiPosition(start_pos),
    RigidBody::KinematicPositionBased,
    Collider::capsule_y(0.5, 0.3),
    CollisionGroups::new(
        Group::from_bits(layers::AGENT).unwrap(),
        Group::from_bits(layers::OBSTACLE | layers::GROUND | layers::TRIGGER).unwrap(),
    ),
    ActiveEvents::COLLISION_EVENTS,
    KinematicCharacterController::default(),
));
```

---

## Godot Boundary Contract

### Message Schema (Future Implementation)

```rust
/// Transform update sent to Godot client
#[derive(Serialize, Deserialize)]
pub struct TransformUpdate {
    pub entity_id: u64,
    pub position: [f32; 3],
    pub rotation: [f32; 4],  // Quaternion
    pub tick: u64,
}

/// Entity lifecycle events
#[derive(Serialize, Deserialize)]
pub enum EntityEvent {
    Spawn {
        entity_id: u64,
        prefab: String,
        transform: TransformUpdate,
    },
    Despawn {
        entity_id: u64,
    },
}

/// Physics events forwarded to Godot (for VFX/SFX)
#[derive(Serialize, Deserialize)]
pub enum PhysicsEvent {
    Collision {
        entity_a: u64,
        entity_b: u64,
        point: [f32; 3],
        normal: [f32; 3],
        impulse: f32,
    },
    TriggerEnter {
        trigger_id: u64,
        entity_id: u64,
    },
    TriggerExit {
        trigger_id: u64,
        entity_id: u64,
    },
}
```

### ID & Ownership

| Entity Type | ID Source | Ownership |
|-------------|-----------|-----------|
| AI Agents | `BevyAgentId(u64)` from ai-bevy | Rust creates, Godot displays |
| Static Obstacles | Bevy `Entity` index | Rust creates, Godot displays |
| Triggers | Bevy `Entity` index | Rust creates & handles |
| Visual-only | N/A | Godot creates & manages |

### Interpolation Strategy (Godot Side)

```gdscript
# In Godot client (future)
var physics_tick_rate := 60.0
var render_buffer: Array[TransformUpdate] = []

func _process(delta: float) -> void:
    var alpha := clamp(accumulator / (1.0 / physics_tick_rate), 0.0, 1.0)

    for entity_id in tracked_entities:
        var prev := get_prev_transform(entity_id)
        var curr := get_curr_transform(entity_id)
        var interpolated := prev.lerp(curr, alpha)
        set_visual_transform(entity_id, interpolated)
```

---

## Milestones Table

| # | Milestone | Acceptance Criteria | Build Green? |
|---|-----------|---------------------|--------------|
| **M1** | Feature-gated Rapier dependency | `cargo build --features physics` compiles | ✅ |
| **M2** | Basic physics plugin | `AiPhysicsPlugin` adds `RapierPhysicsPlugin`, configures sets | ✅ |
| **M3** | Ground + falling bodies | Demo shows 3 capsules falling onto ground plane | ✅ |
| **M4** | Fixed timestep migration | AI systems run in `FixedUpdate`, physics stable at 60Hz | ✅ |
| **M5** | Collision events | `CollisionEvent` logged when bodies touch | ✅ |
| **M6** | Character controller | AI agents use `KinematicCharacterController` for movement | ✅ |
| **M7** | Crowd + physics integration | `AiCrowdAgent` velocity feeds into character controller | ✅ |
| **M8** | Trigger volumes | Sensor colliders emit enter/exit events | ✅ |
| **M9** | Debug rendering | `RapierDebugRenderPlugin` shows colliders in dev builds | ✅ |
| **M10** | Documentation | README updated, example documented | ✅ |

### Milestone Dependencies

```
M1 ──▶ M2 ──▶ M3 ──┬──▶ M4 ──▶ M7
                   │
                   ├──▶ M5 ──▶ M8
                   │
                   └──▶ M6 ──▶ M7

M9 (can be done anytime after M2)
M10 (after all others)
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Version mismatch** (bevy_rapier vs Bevy 0.16) | Low | High | Pin exact versions in Cargo.toml, test immediately |
| **Determinism regression** | Medium | High | Use `FixedUpdate`, fixed dt, test with seeded replays |
| **Performance overhead** | Low | Medium | Profile early, use collision layers to reduce pairs |
| **nalgebra ↔ glam friction** | Medium | Low | Use Rapier's built-in conversions, helper functions |
| **Breaking existing AI tests** | Medium | Medium | Feature-gate physics, existing tests run without it |
| **Character controller edge cases** | Medium | Medium | Copy/customize built-in controller if needed |

---

## Testing Plan

### Smoke Tests (M3)

```rust
#[test]
fn test_physics_plugin_loads() {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins);
    app.add_plugins(AiPhysicsPlugin::default());
    app.update(); // Should not panic
}

#[test]
fn test_body_falls_under_gravity() {
    let mut app = App::new();
    app.add_plugins((MinimalPlugins, AiPhysicsPlugin::default()));

    let entity = app.world.spawn((
        RigidBody::Dynamic,
        Collider::ball(0.5),
        Transform::from_xyz(0.0, 10.0, 0.0),
    )).id();

    // Run 60 fixed updates (1 second)
    for _ in 0..60 {
        app.update();
    }

    let transform = app.world.get::<Transform>(entity).unwrap();
    assert!(transform.translation.y < 5.0, "Body should have fallen");
}
```

### Regression Tests (M4)

```rust
#[test]
fn test_ai_brain_ticks_in_fixed_update() {
    // Verify BrainRegistry.tick() called exactly once per FixedUpdate
}

#[test]
fn test_crowd_velocity_applied_to_physics() {
    // Verify AiCrowdAgent.velocity → KinematicCharacterController.translation
}
```

### Determinism Tests (Optional)

```rust
#[test]
fn test_physics_determinism() {
    let snapshot_a = run_simulation_with_seed(12345, 600); // 10 seconds
    let snapshot_b = run_simulation_with_seed(12345, 600);
    assert_eq!(snapshot_a, snapshot_b, "Same seed should produce same result");
}
```

---

## Next Steps

1. Implement **M1** (add dependency)
2. Implement **M2** (basic plugin)
3. Create `physics_demo.rs` example
4. Iterate through remaining milestones
5. Document in crate README
