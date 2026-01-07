//! Physics systems for ai-bevy.

use bevy_ecs::prelude::*;
use bevy_rapier3d::prelude::*;

/// System that logs collision events (for debugging/demonstration).
///
/// In a real game, you would replace this with gameplay logic:
/// - Damage on collision
/// - Sound effects
/// - Trigger area events
pub fn log_collision_events(mut collision_events: EventReader<CollisionEvent>) {
    for event in collision_events.read() {
        match event {
            CollisionEvent::Started(e1, e2, _flags) => {
                tracing::debug!("Collision started: {:?} <-> {:?}", e1, e2);
            }
            CollisionEvent::Stopped(e1, e2, _flags) => {
                tracing::debug!("Collision stopped: {:?} <-> {:?}", e1, e2);
            }
        }
    }
}

/// System that logs contact force events (for debugging/demonstration).
pub fn log_contact_force_events(mut force_events: EventReader<ContactForceEvent>) {
    for event in force_events.read() {
        tracing::debug!(
            "Contact force: {:?} <-> {:?}, total_force_magnitude: {}",
            event.collider1,
            event.collider2,
            event.total_force_magnitude
        );
    }
}

/// Helper function to create a standard AI agent collider bundle.
///
/// This creates a capsule collider suitable for humanoid AI agents:
/// - Capsule shape (good for character controllers)
/// - Configured for collision with obstacles and ground
/// - Emits collision events
#[allow(dead_code)]
pub fn ai_agent_collider_bundle(
    radius: f32,
    half_height: f32,
) -> (
    Collider,
    CollisionGroups,
    ActiveEvents,
    ActiveCollisionTypes,
) {
    use super::layers;

    (
        Collider::capsule_y(half_height, radius),
        CollisionGroups::new(
            Group::from_bits(layers::AGENT).unwrap(),
            Group::from_bits(layers::OBSTACLE | layers::GROUND | layers::TRIGGER).unwrap(),
        ),
        ActiveEvents::COLLISION_EVENTS,
        ActiveCollisionTypes::default() | ActiveCollisionTypes::KINEMATIC_STATIC,
    )
}

/// Helper function to create a static obstacle collider.
#[allow(dead_code)]
pub fn static_obstacle_bundle(collider: Collider) -> (RigidBody, Collider, CollisionGroups) {
    use super::layers;

    (
        RigidBody::Fixed,
        collider,
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT | layers::PROJECTILE).unwrap(),
        ),
    )
}

/// Helper function to create a trigger/sensor volume.
#[allow(dead_code)]
pub fn trigger_volume_bundle(collider: Collider) -> (Collider, Sensor, CollisionGroups, ActiveEvents) {
    use super::layers;

    (
        collider,
        Sensor,
        CollisionGroups::new(
            Group::from_bits(layers::TRIGGER).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        ActiveEvents::COLLISION_EVENTS,
    )
}

/// Helper function to create a ground plane collider.
#[allow(dead_code)]
pub fn ground_plane_bundle(half_extents: bevy_rapier3d::math::Vect) -> (RigidBody, Collider, CollisionGroups) {
    use super::layers;

    (
        RigidBody::Fixed,
        Collider::cuboid(half_extents.x, half_extents.y, half_extents.z),
        CollisionGroups::new(
            Group::from_bits(layers::GROUND).unwrap(),
            Group::from_bits(layers::AGENT | layers::PROJECTILE).unwrap(),
        ),
    )
}
