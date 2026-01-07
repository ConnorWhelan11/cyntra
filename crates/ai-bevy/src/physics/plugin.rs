//! Physics plugin for ai-bevy.

use bevy_app::{App, FixedUpdate, Plugin, Update};
use bevy_ecs::schedule::IntoScheduleConfigs;
use bevy_rapier3d::prelude::*;

use super::character::{apply_ai_movement, sync_ai_movement_output, AiAgentPhysicsConfig};
use super::events::{
    bridge_collision_events, update_contact_trackers, update_trigger_trackers,
    AiCollisionBridgeConfig, AiCollisionEvent,
};
use super::nav_sync::{
    emit_waypoint_events, path_follow_to_movement, sync_physics_to_nav, NavWaypointReached,
    PhysicsNavSyncConfig, PhysicsRaycastCache,
};
use super::systems::*;
use super::AiPhysicsSet;

#[cfg(feature = "bevy-demo")]
use super::debug::{draw_agent_perception, draw_nav_paths, AiDebugConfig};

/// Configuration for the AI physics plugin.
#[derive(Debug, Clone)]
pub struct AiPhysicsConfig {
    /// Gravity vector (default: -9.81 on Y axis).
    pub gravity: bevy_rapier3d::math::Vect,
    /// Fixed timestep in seconds (default: 1/60).
    pub timestep: f32,
    /// Enable debug rendering (requires `physics-debug` feature).
    pub debug_render: bool,
}

impl Default for AiPhysicsConfig {
    fn default() -> Self {
        Self {
            gravity: bevy_rapier3d::math::Vect::new(0.0, -9.81, 0.0),
            timestep: 1.0 / 60.0,
            debug_render: cfg!(feature = "physics-debug"),
        }
    }
}

/// Plugin that integrates Rapier3D physics with the ai-bevy AI systems.
///
/// This plugin:
/// - Adds `RapierPhysicsPlugin` with fixed timestep configuration
/// - Sets up system ordering for AI ↔ physics synchronization
/// - Optionally enables debug rendering
///
/// ## Example
///
/// ```rust,ignore
/// use ai_bevy::physics::AiPhysicsPlugin;
///
/// App::new()
///     .add_plugins(DefaultPlugins)
///     .add_plugins(AiPhysicsPlugin::default())
///     .run();
/// ```
pub struct AiPhysicsPlugin {
    config: AiPhysicsConfig,
}

impl Default for AiPhysicsPlugin {
    fn default() -> Self {
        Self {
            config: AiPhysicsConfig::default(),
        }
    }
}

impl AiPhysicsPlugin {
    /// Create a new physics plugin with custom configuration.
    pub fn new(config: AiPhysicsConfig) -> Self {
        Self { config }
    }

    /// Set the gravity vector.
    pub fn with_gravity(mut self, gravity: bevy_rapier3d::math::Vect) -> Self {
        self.config.gravity = gravity;
        self
    }

    /// Set the fixed timestep.
    pub fn with_timestep(mut self, timestep: f32) -> Self {
        self.config.timestep = timestep;
        self
    }

    /// Enable or disable debug rendering.
    pub fn with_debug_render(mut self, enable: bool) -> Self {
        self.config.debug_render = enable;
        self
    }
}

impl Plugin for AiPhysicsPlugin {
    fn build(&self, app: &mut App) {
        // Add Rapier physics plugin with fixed timestep
        app.add_plugins(
            RapierPhysicsPlugin::<NoUserData>::default()
                .in_fixed_schedule(),
        );

        // Optionally add debug rendering
        if self.config.debug_render {
            app.add_plugins(RapierDebugRenderPlugin::default());
        }

        // Register AI collision events
        app.add_event::<AiCollisionEvent>();
        app.add_event::<NavWaypointReached>();

        // Add default resources
        app.init_resource::<AiAgentPhysicsConfig>();
        app.init_resource::<AiCollisionBridgeConfig>();
        app.init_resource::<PhysicsNavSyncConfig>();
        app.insert_resource(PhysicsRaycastCache::new(1.0));

        #[cfg(feature = "bevy-demo")]
        app.init_resource::<AiDebugConfig>();

        // Configure system sets in FixedUpdate
        app.configure_sets(
            FixedUpdate,
            (
                AiPhysicsSet::InputSync,
                AiPhysicsSet::ApplyForces,
                // PhysicsSet::SyncBackend runs here (from RapierPhysicsPlugin)
                // PhysicsSet::StepSimulation runs here
                // PhysicsSet::Writeback runs here
                AiPhysicsSet::CollisionEvents,
            )
                .chain(),
        );

        // Configure system sets in Update (for rendering)
        app.configure_sets(
            Update,
            (AiPhysicsSet::Interpolate, AiPhysicsSet::RenderSync).chain(),
        );

        // Add character controller systems
        app.add_systems(
            FixedUpdate,
            (
                // Apply movement input before physics step
                apply_ai_movement.in_set(AiPhysicsSet::ApplyForces),
                // Sync output after physics step
                sync_ai_movement_output.in_set(AiPhysicsSet::CollisionEvents),
            ),
        );

        // Add collision event systems
        app.add_systems(
            FixedUpdate,
            (
                log_collision_events.in_set(AiPhysicsSet::CollisionEvents),
                bridge_collision_events.in_set(AiPhysicsSet::CollisionEvents),
                update_contact_trackers.in_set(AiPhysicsSet::CollisionEvents),
                update_trigger_trackers
                    .in_set(AiPhysicsSet::CollisionEvents)
                    .after(bridge_collision_events),
            ),
        );

        // Add nav sync systems
        app.add_systems(
            FixedUpdate,
            (
                // Sync physics positions to nav at start of frame
                sync_physics_to_nav.in_set(AiPhysicsSet::InputSync),
                // Path following drives movement input
                path_follow_to_movement.in_set(AiPhysicsSet::InputSync),
                // Emit waypoint events after movement
                emit_waypoint_events.in_set(AiPhysicsSet::CollisionEvents),
            ),
        );

        // Add debug visualization systems (Update schedule for gizmos)
        #[cfg(feature = "bevy-demo")]
        app.add_systems(
            Update,
            (
                draw_nav_paths.in_set(AiPhysicsSet::RenderSync),
                draw_agent_perception.in_set(AiPhysicsSet::RenderSync),
            ),
        );

        // Store config as resource for runtime access
        app.insert_resource(AiPhysicsConfigResource(self.config.clone()));
    }
}

/// Resource holding the physics configuration.
#[derive(bevy_ecs::prelude::Resource, Debug, Clone)]
pub struct AiPhysicsConfigResource(pub AiPhysicsConfig);
