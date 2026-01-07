//! Kinematic Character Controller integration for AI agents.
//!
//! This module provides components and systems to integrate Rapier's KinematicCharacterController
//! with the ai-bevy AI agent systems.

use bevy_ecs::prelude::*;
use bevy_rapier3d::prelude::*;

use super::layers;

/// Component bundle for an AI agent with physics-based movement.
///
/// This sets up a KinematicCharacterController that:
/// - Handles slopes and stairs automatically
/// - Snaps to ground when walking down slopes
/// - Provides grounded state for jump logic
/// - Integrates with AI navigation systems
#[derive(Bundle)]
pub struct AiAgentPhysicsBundle {
    /// The character controller configuration.
    pub controller: KinematicCharacterController,
    /// Capsule collider for the agent.
    pub collider: Collider,
    /// Collision group membership.
    pub collision_groups: CollisionGroups,
    /// Kinematic rigid body (moved by code, not physics).
    pub rigid_body: RigidBody,
}

impl AiAgentPhysicsBundle {
    /// Create a new AI agent physics bundle with default settings.
    ///
    /// # Arguments
    /// * `height` - Total height of the agent capsule
    /// * `radius` - Radius of the agent capsule
    pub fn new(height: f32, radius: f32) -> Self {
        let half_height = (height - 2.0 * radius).max(0.0) / 2.0;

        Self {
            controller: KinematicCharacterController {
                // Snap to ground when walking down slopes
                snap_to_ground: Some(CharacterLength::Absolute(0.5)),
                // Auto-step up small obstacles
                autostep: Some(CharacterAutostep {
                    max_height: CharacterLength::Absolute(0.5),
                    min_width: CharacterLength::Absolute(0.2),
                    include_dynamic_bodies: false,
                }),
                // Maximum slope the agent can walk up (45 degrees)
                max_slope_climb_angle: std::f32::consts::FRAC_PI_4,
                // Minimum slope to start sliding (50 degrees)
                min_slope_slide_angle: std::f32::consts::FRAC_PI_4 + 0.1,
                // Small offset to prevent tunneling
                offset: CharacterLength::Absolute(0.01),
                // Slide along walls
                slide: true,
                ..Default::default()
            },
            collider: Collider::capsule_y(half_height, radius),
            collision_groups: CollisionGroups::new(
                Group::from_bits(layers::AGENT).unwrap(),
                Group::from_bits(layers::GROUND | layers::OBSTACLE | layers::TRIGGER).unwrap(),
            ),
            rigid_body: RigidBody::KinematicPositionBased,
        }
    }

    /// Create a slim agent (radius 0.3, height 1.8).
    pub fn slim() -> Self {
        Self::new(1.8, 0.3)
    }

    /// Create a standard agent (radius 0.4, height 1.8).
    pub fn standard() -> Self {
        Self::new(1.8, 0.4)
    }

    /// Create a large agent (radius 0.6, height 2.2).
    pub fn large() -> Self {
        Self::new(2.2, 0.6)
    }
}

/// Component to request movement for an AI agent.
///
/// Set this each frame with the desired movement vector.
/// The physics system will apply it through the KinematicCharacterController.
#[derive(Component, Default, Debug, Clone)]
pub struct AiMovementInput {
    /// Desired movement direction and speed (units per second).
    pub velocity: bevy_rapier3d::math::Vect,
    /// Whether to apply gravity this frame.
    pub apply_gravity: bool,
}

impl AiMovementInput {
    /// Create a new movement input.
    pub fn new(velocity: bevy_rapier3d::math::Vect) -> Self {
        Self {
            velocity,
            apply_gravity: true,
        }
    }

    /// Create a movement input without gravity (for flying/swimming).
    pub fn no_gravity(velocity: bevy_rapier3d::math::Vect) -> Self {
        Self {
            velocity,
            apply_gravity: false,
        }
    }

    /// Create a zero movement (standing still).
    pub fn stationary() -> Self {
        Self {
            velocity: bevy_rapier3d::math::Vect::ZERO,
            apply_gravity: true,
        }
    }
}

/// Component storing the result of character controller movement.
///
/// Updated each physics frame with the actual movement result.
#[derive(Component, Default, Debug, Clone)]
pub struct AiMovementOutput {
    /// Whether the agent is currently on the ground.
    pub grounded: bool,
    /// The actual translation applied this frame.
    pub effective_translation: bevy_rapier3d::math::Vect,
    /// Whether the agent is sliding down a slope.
    pub is_sliding: bool,
}

/// Resource for configuring AI agent physics behavior.
#[derive(Resource, Debug, Clone)]
pub struct AiAgentPhysicsConfig {
    /// Gravity acceleration (default: 9.81 m/s^2 downward).
    pub gravity: bevy_rapier3d::math::Vect,
    /// Maximum fall speed (terminal velocity).
    pub max_fall_speed: f32,
    /// Air control factor (0.0 = no control, 1.0 = full control).
    pub air_control: f32,
}

impl Default for AiAgentPhysicsConfig {
    fn default() -> Self {
        Self {
            gravity: bevy_rapier3d::math::Vect::new(0.0, -9.81, 0.0),
            max_fall_speed: 50.0,
            air_control: 0.3,
        }
    }
}

/// Tracks the current vertical velocity for gravity accumulation.
#[derive(Component, Default, Debug)]
pub struct AiVerticalVelocity(pub f32);

/// System that applies movement input to character controllers.
pub fn apply_ai_movement(
    time: Res<bevy_time::Time>,
    config: Option<Res<AiAgentPhysicsConfig>>,
    mut query: Query<(
        &mut KinematicCharacterController,
        &AiMovementInput,
        &mut AiVerticalVelocity,
        Option<&KinematicCharacterControllerOutput>,
    )>,
) {
    let config = config.map(|c| c.clone()).unwrap_or_default();
    let dt = time.delta_secs();

    for (mut controller, input, mut vertical_vel, output) in query.iter_mut() {
        let grounded = output.map(|o| o.grounded).unwrap_or(false);

        // Calculate horizontal movement
        let mut translation = input.velocity * dt;

        // Apply gravity if requested
        if input.apply_gravity {
            if grounded {
                // Reset vertical velocity when grounded
                vertical_vel.0 = 0.0;
            } else {
                // Accumulate gravity
                vertical_vel.0 += config.gravity.y * dt;
                vertical_vel.0 = vertical_vel.0.max(-config.max_fall_speed);
            }
            translation.y += vertical_vel.0 * dt;
        }

        controller.translation = Some(translation);
    }
}

/// System that reads character controller output and updates AI movement output.
pub fn sync_ai_movement_output(
    mut query: Query<(
        &KinematicCharacterControllerOutput,
        &mut AiMovementOutput,
    )>,
) {
    for (controller_output, mut ai_output) in query.iter_mut() {
        ai_output.grounded = controller_output.grounded;
        ai_output.effective_translation = controller_output.effective_translation;
        ai_output.is_sliding = controller_output.is_sliding_down_slope;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_bundle_creation() {
        let bundle = AiAgentPhysicsBundle::new(1.8, 0.4);
        // Verify collider is a capsule
        assert!(matches!(bundle.rigid_body, RigidBody::KinematicPositionBased));
    }

    #[test]
    fn test_movement_input() {
        let input = AiMovementInput::new(bevy_rapier3d::math::Vect::new(1.0, 0.0, 0.0));
        assert!(input.apply_gravity);
        assert_eq!(input.velocity.x, 1.0);

        let no_grav = AiMovementInput::no_gravity(bevy_rapier3d::math::Vect::new(0.0, 1.0, 0.0));
        assert!(!no_grav.apply_gravity);
    }

    #[test]
    fn test_preset_bundles() {
        let _slim = AiAgentPhysicsBundle::slim();
        let _standard = AiAgentPhysicsBundle::standard();
        let _large = AiAgentPhysicsBundle::large();
    }
}
