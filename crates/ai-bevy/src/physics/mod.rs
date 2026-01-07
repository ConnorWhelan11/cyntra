//! Physics integration for ai-bevy using Rapier3D.
//!
//! This module provides a feature-gated integration with `bevy_rapier3d` for physics simulation.
//!
//! ## Features
//!
//! - `physics`: Enables Rapier3D physics integration
//! - `physics-debug`: Enables debug rendering for physics colliders
//!
//! ## Modules
//!
//! - [`character`]: KinematicCharacterController integration for AI agents
//! - [`perception`]: Raycast/shapecast queries for AI perception
//! - [`events`]: Collision event bridge for AI systems
//!
//! ## Usage
//!
//! ```rust,ignore
//! use ai_bevy::physics::{AiPhysicsPlugin, AiPhysicsSet};
//!
//! App::new()
//!     .add_plugins(DefaultPlugins)
//!     .add_plugins(AiPhysicsPlugin::default())
//!     .run();
//! ```

mod plugin;
mod systems;
pub mod character;
pub mod events;
pub mod nav_sync;
pub mod perception;

#[cfg(feature = "bevy-demo")]
pub mod debug;

pub use plugin::AiPhysicsPlugin;
pub use systems::*;

// Re-export character controller types
pub use character::{
    AiAgentPhysicsBundle, AiAgentPhysicsConfig, AiMovementInput, AiMovementOutput,
    AiVerticalVelocity,
};

// Re-export perception types
pub use perception::{AiPerception, LineOfSightResult, OverlapResult, RaycastHit};

// Re-export event types
pub use events::{
    AiCollisionBridgeConfig, AiCollisionEvent, AiCollisionLayer, ContactTracker, TriggerTracker,
};

// Re-export nav sync types
pub use nav_sync::{
    NavPathFollower, NavWaypointReached, PhysicsNavAgent, PhysicsNavSyncConfig,
    PhysicsRaycastCache,
};

// Re-export debug types (only with bevy-demo feature)
#[cfg(feature = "bevy-demo")]
pub use debug::{AiDebugConfig, AiDebugGizmos};

// Re-export commonly used Rapier types for convenience
pub use bevy_rapier3d::prelude::{
    ActiveCollisionTypes, ActiveEvents, Ccd, Collider, ColliderMassProperties, CollisionEvent,
    CollisionGroups, ContactForceEvent, Damping, ExternalForce, ExternalImpulse, Friction,
    GravityScale, Group, KinematicCharacterController, KinematicCharacterControllerOutput,
    LockedAxes, QueryFilter, RapierConfiguration, RapierContext, RapierPhysicsPlugin, Restitution,
    RigidBody, Sensor, Sleeping, Velocity,
};

/// System sets for physics integration ordering.
#[derive(bevy_ecs::schedule::SystemSet, Debug, Hash, PartialEq, Eq, Clone)]
pub enum AiPhysicsSet {
    /// Sync input from the last frame into physics-ready state.
    InputSync,
    /// Apply AI-decided forces/velocities to physics bodies.
    ApplyForces,
    /// Process collision events and emit gameplay events.
    CollisionEvents,
    /// Interpolate transforms for smooth rendering.
    Interpolate,
    /// Sync visual representations with physics state.
    RenderSync,
}

/// Collision layer constants for filtering.
pub mod layers {
    /// AI-controlled agents.
    pub const AGENT: u32 = 1 << 0;
    /// Static obstacles (walls, furniture).
    pub const OBSTACLE: u32 = 1 << 1;
    /// Sensor/trigger volumes.
    pub const TRIGGER: u32 = 1 << 2;
    /// Projectiles (bullets, thrown objects).
    pub const PROJECTILE: u32 = 1 << 3;
    /// Walkable ground surfaces.
    pub const GROUND: u32 = 1 << 4;
    /// Interactive objects (doors, switches).
    pub const INTERACTIVE: u32 = 1 << 5;

    /// All layers combined.
    pub const ALL: u32 = AGENT | OBSTACLE | TRIGGER | PROJECTILE | GROUND | INTERACTIVE;
}
