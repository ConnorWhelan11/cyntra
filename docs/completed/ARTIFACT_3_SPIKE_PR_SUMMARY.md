# ARTIFACT 3: Spike PR Summary

## Spike PR Summary

This spike implements a minimal **bevy_rapier3d** integration for the `ai-bevy` crate, proving out the core patterns for physics integration without affecting existing AI systems.

**Changes**: Added optional `physics` feature to `ai-bevy` with:
- `AiPhysicsPlugin` wrapping Rapier3D with FixedUpdate scheduling
- Collision layer constants for AI game entities
- Helper bundles for common physics setups
- Working demo with falling bodies, collision events, and trigger zones

**Validation**: `cargo check -p ai-bevy --features physics,bevy-demo` passes.

---

## Files Changed

| File | Change | Description |
|------|--------|-------------|
| `crates/ai-bevy/Cargo.toml` | Modified | Added `physics`, `physics-debug` features; `bevy_rapier3d = "0.30"` dependency; `tracing` dependency |
| `crates/ai-bevy/src/lib.rs` | Modified | Added feature-gated `pub mod physics` and re-exports for `AiPhysicsPlugin`, `AiPhysicsSet` |
| `crates/ai-bevy/src/physics/mod.rs` | Created | Module root with collision layer constants, `AiPhysicsSet` enum, re-exports from bevy_rapier3d |
| `crates/ai-bevy/src/physics/plugin.rs` | Created | `AiPhysicsPlugin` with builder pattern, FixedUpdate scheduling, debug render toggle |
| `crates/ai-bevy/src/physics/systems.rs` | Created | `log_collision_events` system; helper bundles (`ai_agent_collider_bundle`, `static_obstacle_bundle`, `trigger_volume_bundle`, `ground_plane_bundle`) |
| `crates/ai-bevy/examples/physics_demo.rs` | Created | Complete demo with falling spheres, ground plane, trigger zone, collision event logging |

---

## How to Run

```bash
# Check compilation
cd crates && cargo check -p ai-bevy --features physics

# Run the demo (requires windowing support)
cd crates && cargo run -p ai-bevy --example physics_demo --features "physics,bevy-demo"
```

---

## Demo Behavior

When running `physics_demo`:

1. **Camera** positioned at (0, 8, 15) looking at origin
2. **Ground plane** (green, 20x20 units) with `RigidBody::Fixed`
3. **5 falling spheres** (red) spawning at staggered heights (5-10 units)
4. **Static obstacle** (blue wall) at x=3 to test collision
5. **Trigger zone** (transparent green) at x=-2 - logs when balls enter/exit
6. **Debug rendering** shows collider wireframes (if `physics-debug` enabled)

Expected console output:
```
INFO physics_demo: Physics demo started!
INFO physics_demo: Watch the balls fall and collide with the ground.
INFO physics_demo: Ball entered trigger zone!
INFO physics_demo: Ball exited trigger zone!
```

---

## Notes / Gotchas

### Version Compatibility
- **bevy_rapier3d 0.30** is required for **Bevy 0.16.x** compatibility
- bevy_rapier3d 0.28 only works with Bevy 0.15 (causes trait mismatch errors)

### API Changes from 0.28 → 0.30
- `RapierContext` is now split into multiple components (`RapierContextColliders`, `RapierContextJoints`, `RapierContextSimulation`, `RapierRigidBodySet`)
- This spike uses simple collision events which work without accessing these components directly

### Known Warnings (benign)
- `unexpected cfg condition value: perception/dialogue` - placeholder features in lib.rs (pre-existing)
- `field 0 is never read` on `AiPhysicsConfigResource` - will be used when we add runtime config access

### Collision Layers
Defined in `physics/mod.rs`:
```rust
pub mod layers {
    pub const AGENT: u32 = 1 << 0;      // AI-controlled entities
    pub const OBSTACLE: u32 = 1 << 1;   // Static world geometry
    pub const TRIGGER: u32 = 1 << 2;    // Sensor/trigger volumes
    pub const PROJECTILE: u32 = 1 << 3; // Bullets, thrown objects
    pub const GROUND: u32 = 1 << 4;     // Ground/floor surfaces
    pub const INTERACTIVE: u32 = 1 << 5; // Pickups, doors, buttons
}
```

---

## Next Steps Checklist

### Immediate (M1-M2)
- [ ] Add `KinematicCharacterController` integration for AI agent movement
- [ ] Implement `TransformSync` system to sync AI positions → physics positions
- [ ] Add `ai-nav` integration (NavMesh → CharacterController pathing)

### Short-term (M3-M4)
- [ ] Implement raycast/shapecast queries for AI perception
- [ ] Add `CollisionEvent` → AI event bridge (damage, triggers)
- [ ] Create sensor query helpers for area detection

### Medium-term (M5-M7)
- [ ] Parallel physics worlds for rollback/prediction
- [ ] Godot state sync (if bidirectional physics needed)
- [ ] Physics-based AI behaviors (knockback, physics puzzles)

### Polish (M8-M10)
- [ ] Performance profiling with many agents
- [ ] Documentation and migration guide
- [ ] Examples: FPS controller, platformer, crowd simulation

---

## Artifact Cross-References

- **ARTIFACT_1_DECISION_MATRIX.md**: Explains why bevy_rapier3d was chosen over alternatives
- **ARTIFACT_2_INTEGRATION_BLUEPRINT.md**: Full architecture and milestone breakdown

---

## Diff Summary

```
 crates/ai-bevy/Cargo.toml          | 12 ++++--
 crates/ai-bevy/src/lib.rs          |  9 +++++
 crates/ai-bevy/src/physics/mod.rs  | 52 ++++++++++++++++++++++++
 crates/ai-bevy/src/physics/plugin.rs | 134 +++++++++++++++++++++++++++++++++++++
 crates/ai-bevy/src/physics/systems.rs| 111 ++++++++++++++++++++++++++++++++
 crates/ai-bevy/examples/physics_demo.rs | 175 +++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 491 insertions(+), 2 deletions(-)
```
