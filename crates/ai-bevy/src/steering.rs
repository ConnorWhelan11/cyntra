//! Steering behaviors for AI agents.
//!
//! This module provides classic steering behaviors for local movement:
//! - Seek: Move toward a target
//! - Flee: Move away from a target
//! - Arrive: Approach and slow down at a target
//! - Wander: Random exploration movement
//! - Pursuit: Intercept a moving target
//! - Evade: Avoid a moving target
//!
//! ## Usage
//!
//! Add `SteeringAgent` component to entities, configure behaviors,
//! and the steering systems will compute desired velocities.

use ai_nav::Vec2;
use bevy_ecs::prelude::*;

/// Configuration for a steering agent.
#[derive(Component, Debug, Clone)]
pub struct SteeringAgent {
    /// Maximum movement speed.
    pub max_speed: f32,
    /// Maximum steering force.
    pub max_force: f32,
    /// Current velocity.
    pub velocity: Vec2,
    /// Mass (affects acceleration).
    pub mass: f32,
    /// Arrival slow-down radius.
    pub arrival_radius: f32,
    /// Wander circle distance.
    pub wander_distance: f32,
    /// Wander circle radius.
    pub wander_radius: f32,
    /// Current wander angle (radians).
    pub wander_angle: f32,
    /// Wander angle change per tick.
    pub wander_jitter: f32,
}

impl Default for SteeringAgent {
    fn default() -> Self {
        Self {
            max_speed: 5.0,
            max_force: 10.0,
            velocity: Vec2::ZERO,
            mass: 1.0,
            arrival_radius: 2.0,
            wander_distance: 2.0,
            wander_radius: 1.0,
            wander_angle: 0.0,
            wander_jitter: 0.3,
        }
    }
}

impl SteeringAgent {
    /// Create a new steering agent with default settings.
    pub fn new(max_speed: f32, max_force: f32) -> Self {
        Self {
            max_speed,
            max_force,
            ..Default::default()
        }
    }

    /// Apply a steering force and return the new velocity.
    pub fn apply_force(&mut self, force: Vec2, dt: f32) -> Vec2 {
        // Truncate force to max
        let force = truncate(force, self.max_force);
        // Calculate acceleration (F = ma, so a = F/m)
        let acceleration = force / self.mass.max(0.001);
        // Update velocity
        self.velocity = truncate(self.velocity + acceleration * dt, self.max_speed);
        self.velocity
    }
}

/// Active steering behaviors for an agent.
#[derive(Component, Debug, Clone, Default)]
pub struct SteeringBehaviors {
    /// Seek toward this target.
    pub seek_target: Option<Vec2>,
    /// Flee from this target.
    pub flee_target: Option<Vec2>,
    /// Arrive at this target (with slow-down).
    pub arrive_target: Option<Vec2>,
    /// Enable wandering.
    pub wander: bool,
    /// Pursuit target entity and its velocity.
    pub pursuit_target: Option<(Vec2, Vec2)>, // (position, velocity)
    /// Evade target entity and its velocity.
    pub evade_target: Option<(Vec2, Vec2)>, // (position, velocity)
    /// Weights for combining behaviors.
    pub weights: SteeringWeights,
}

/// Weights for combining multiple steering behaviors.
#[derive(Debug, Clone, Copy)]
pub struct SteeringWeights {
    pub seek: f32,
    pub flee: f32,
    pub arrive: f32,
    pub wander: f32,
    pub pursuit: f32,
    pub evade: f32,
}

impl Default for SteeringWeights {
    fn default() -> Self {
        Self {
            seek: 1.0,
            flee: 1.0,
            arrive: 1.0,
            wander: 0.5,
            pursuit: 1.0,
            evade: 1.5,
        }
    }
}

/// Result of steering calculation for debugging.
#[derive(Component, Debug, Clone)]
pub struct SteeringOutput {
    /// Individual behavior forces (for debugging).
    pub forces: SteeringForces,
    /// Combined steering force.
    pub total_force: Vec2,
    /// Resulting desired velocity.
    pub desired_velocity: Vec2,
}

impl Default for SteeringOutput {
    fn default() -> Self {
        Self {
            forces: SteeringForces::default(),
            total_force: Vec2::ZERO,
            desired_velocity: Vec2::ZERO,
        }
    }
}

/// Individual steering forces (for debugging).
#[derive(Debug, Clone)]
pub struct SteeringForces {
    pub seek: Vec2,
    pub flee: Vec2,
    pub arrive: Vec2,
    pub wander: Vec2,
    pub pursuit: Vec2,
    pub evade: Vec2,
}

impl Default for SteeringForces {
    fn default() -> Self {
        Self {
            seek: Vec2::ZERO,
            flee: Vec2::ZERO,
            arrive: Vec2::ZERO,
            wander: Vec2::ZERO,
            pursuit: Vec2::ZERO,
            evade: Vec2::ZERO,
        }
    }
}

/// Calculate seek steering force.
///
/// Returns a force that steers toward the target.
pub fn seek(position: Vec2, target: Vec2, max_speed: f32, current_velocity: Vec2) -> Vec2 {
    let desired = (target - position).normalize_or_zero() * max_speed;
    desired - current_velocity
}

/// Calculate flee steering force.
///
/// Returns a force that steers away from the target.
pub fn flee(position: Vec2, target: Vec2, max_speed: f32, current_velocity: Vec2) -> Vec2 {
    let desired = (position - target).normalize_or_zero() * max_speed;
    desired - current_velocity
}

/// Calculate arrive steering force.
///
/// Returns a force that steers toward the target, slowing down as it approaches.
pub fn arrive(
    position: Vec2,
    target: Vec2,
    max_speed: f32,
    current_velocity: Vec2,
    slow_radius: f32,
) -> Vec2 {
    let to_target = target - position;
    let distance = to_target.length();

    if distance < 0.001 {
        return current_velocity * -1.0; // Stop at target
    }

    // Calculate desired speed based on distance
    let speed = if distance < slow_radius {
        max_speed * (distance / slow_radius)
    } else {
        max_speed
    };

    let desired = to_target.normalize_or_zero() * speed;
    desired - current_velocity
}

/// Calculate wander steering force.
///
/// Returns a force for random exploration movement.
pub fn wander(
    velocity: Vec2,
    wander_distance: f32,
    wander_radius: f32,
    wander_angle: &mut f32,
    wander_jitter: f32,
    max_speed: f32,
    seed: u64,
) -> Vec2 {
    // Simple deterministic random using seed
    let jitter = ((seed as f32 * 0.618033988749895) % 1.0 - 0.5) * 2.0 * wander_jitter;
    *wander_angle += jitter;

    // Get the direction we're facing (or default to right if stationary)
    let heading = if velocity.length() > 0.001 {
        velocity.normalized()
    } else {
        Vec2::new(1.0, 0.0)
    };

    // Calculate wander circle center
    let circle_center = heading * wander_distance;

    // Calculate displacement on the wander circle
    let displacement = Vec2::new(
        wander_angle.cos() * wander_radius,
        wander_angle.sin() * wander_radius,
    );

    (circle_center + displacement).normalize_or_zero() * max_speed - velocity
}

/// Calculate pursuit steering force.
///
/// Returns a force that intercepts a moving target.
pub fn pursuit(
    position: Vec2,
    velocity: Vec2,
    target_position: Vec2,
    target_velocity: Vec2,
    max_speed: f32,
) -> Vec2 {
    let to_target = target_position - position;
    let distance = to_target.length();

    // Predict where the target will be
    let speed = velocity.length().max(0.001);
    let prediction_time = distance / speed;

    let predicted_position = target_position + target_velocity * prediction_time;

    seek(position, predicted_position, max_speed, velocity)
}

/// Calculate evade steering force.
///
/// Returns a force that avoids a moving target.
pub fn evade(
    position: Vec2,
    velocity: Vec2,
    target_position: Vec2,
    target_velocity: Vec2,
    max_speed: f32,
) -> Vec2 {
    let to_target = target_position - position;
    let distance = to_target.length();

    // Predict where the target will be
    let speed = velocity.length().max(0.001);
    let prediction_time = distance / speed;

    let predicted_position = target_position + target_velocity * prediction_time;

    flee(position, predicted_position, max_speed, velocity)
}

/// System that calculates steering forces for all agents.
pub fn calculate_steering(
    tick: Res<crate::AiTick>,
    mut query: Query<(
        &crate::AiPosition,
        &mut SteeringAgent,
        &SteeringBehaviors,
        &mut SteeringOutput,
    )>,
) {
    for (position, mut agent, behaviors, mut output) in query.iter_mut() {
        let pos = position.0;
        let vel = agent.velocity;
        let max_speed = agent.max_speed;
        let weights = &behaviors.weights;

        // Reset forces
        output.forces = SteeringForces::default();
        let mut total = Vec2::ZERO;

        // Seek
        if let Some(target) = behaviors.seek_target {
            let force = seek(pos, target, max_speed, vel);
            output.forces.seek = force;
            total = total + force * weights.seek;
        }

        // Flee
        if let Some(target) = behaviors.flee_target {
            let force = flee(pos, target, max_speed, vel);
            output.forces.flee = force;
            total = total + force * weights.flee;
        }

        // Arrive
        if let Some(target) = behaviors.arrive_target {
            let force = arrive(pos, target, max_speed, vel, agent.arrival_radius);
            output.forces.arrive = force;
            total = total + force * weights.arrive;
        }

        // Wander
        if behaviors.wander {
            // Extract values before mutable borrow
            let wander_distance = agent.wander_distance;
            let wander_radius = agent.wander_radius;
            let wander_jitter = agent.wander_jitter;
            let force = wander(
                vel,
                wander_distance,
                wander_radius,
                &mut agent.wander_angle,
                wander_jitter,
                max_speed,
                tick.seed.wrapping_add(tick.tick),
            );
            output.forces.wander = force;
            total = total + force * weights.wander;
        }

        // Pursuit
        if let Some((target_pos, target_vel)) = behaviors.pursuit_target {
            let force = pursuit(pos, vel, target_pos, target_vel, max_speed);
            output.forces.pursuit = force;
            total = total + force * weights.pursuit;
        }

        // Evade
        if let Some((target_pos, target_vel)) = behaviors.evade_target {
            let force = evade(pos, vel, target_pos, target_vel, max_speed);
            output.forces.evade = force;
            total = total + force * weights.evade;
        }

        output.total_force = total;
        output.desired_velocity = truncate(vel + total * tick.dt_seconds, max_speed);
    }
}

/// System that applies steering forces to agent velocities.
pub fn apply_steering(
    tick: Res<crate::AiTick>,
    mut query: Query<(&mut SteeringAgent, &SteeringOutput)>,
) {
    for (mut agent, output) in query.iter_mut() {
        agent.apply_force(output.total_force, tick.dt_seconds);
    }
}

/// System that updates positions from steering velocities.
pub fn apply_steering_to_position(
    tick: Res<crate::AiTick>,
    mut query: Query<(&mut crate::AiPosition, &SteeringAgent)>,
) {
    for (mut pos, agent) in query.iter_mut() {
        pos.0 = pos.0 + agent.velocity * tick.dt_seconds;
    }
}

/// Configuration for steering debug visualization.
#[derive(Resource, Debug, Clone)]
pub struct SteeringDebugConfig {
    /// Show velocity vector.
    pub show_velocity: bool,
    /// Show individual behavior forces.
    pub show_forces: bool,
    /// Show wander circle.
    pub show_wander_circle: bool,
    /// Velocity vector color.
    pub velocity_color: [f32; 4],
    /// Force vector color.
    pub force_color: [f32; 4],
    /// Wander circle color.
    pub wander_color: [f32; 4],
    /// Vector scale for visualization.
    pub vector_scale: f32,
}

impl Default for SteeringDebugConfig {
    fn default() -> Self {
        Self {
            show_velocity: true,
            show_forces: false,
            show_wander_circle: false,
            velocity_color: [0.0, 1.0, 0.0, 1.0],   // Green
            force_color: [1.0, 0.5, 0.0, 0.7],      // Orange
            wander_color: [0.5, 0.5, 1.0, 0.5],     // Light blue
            vector_scale: 0.5,
        }
    }
}

/// Bundle for a steering-enabled AI agent.
#[derive(Bundle, Default)]
pub struct SteeringAgentBundle {
    /// Core steering parameters.
    pub agent: SteeringAgent,
    /// Active behaviors.
    pub behaviors: SteeringBehaviors,
    /// Output for debugging.
    pub output: SteeringOutput,
}

impl SteeringAgentBundle {
    /// Create a new steering agent bundle.
    pub fn new(max_speed: f32, max_force: f32) -> Self {
        Self {
            agent: SteeringAgent::new(max_speed, max_force),
            behaviors: SteeringBehaviors::default(),
            output: SteeringOutput::default(),
        }
    }
}

// Helper functions

fn truncate(v: Vec2, max_length: f32) -> Vec2 {
    let len = v.length();
    if len > max_length && len > 0.001 {
        v * (max_length / len)
    } else {
        v
    }
}

trait Vec2Ext {
    fn normalize_or_zero(self) -> Self;
}

impl Vec2Ext for Vec2 {
    fn normalize_or_zero(self) -> Self {
        let len = self.length();
        if len > 0.001 {
            self / len
        } else {
            Vec2::ZERO
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seek() {
        let pos = Vec2::new(0.0, 0.0);
        let target = Vec2::new(10.0, 0.0);
        let vel = Vec2::ZERO;
        let max_speed = 5.0;

        let force = seek(pos, target, max_speed, vel);
        assert!(force.x > 0.0); // Should push toward target
        assert!((force.length() - max_speed).abs() < 0.01);
    }

    #[test]
    fn test_flee() {
        let pos = Vec2::new(0.0, 0.0);
        let target = Vec2::new(10.0, 0.0);
        let vel = Vec2::ZERO;
        let max_speed = 5.0;

        let force = flee(pos, target, max_speed, vel);
        assert!(force.x < 0.0); // Should push away from target
    }

    #[test]
    fn test_arrive_slowdown() {
        let target = Vec2::new(0.0, 0.0);
        let vel = Vec2::ZERO;
        let max_speed = 5.0;
        let slow_radius = 2.0;

        // Far from target - should want full speed
        let far_pos = Vec2::new(10.0, 0.0);
        let force_far = arrive(far_pos, target, max_speed, vel, slow_radius);

        // Close to target - should want slower speed
        let close_pos = Vec2::new(1.0, 0.0);
        let force_close = arrive(close_pos, target, max_speed, vel, slow_radius);

        assert!(force_far.length() > force_close.length());
    }

    #[test]
    fn test_steering_agent_apply_force() {
        let mut agent = SteeringAgent::new(10.0, 20.0);
        agent.mass = 1.0;
        agent.velocity = Vec2::ZERO;

        let force = Vec2::new(10.0, 0.0);
        let new_vel = agent.apply_force(force, 0.1);

        assert!(new_vel.x > 0.0);
        assert!((new_vel.x - 1.0).abs() < 0.01); // F=ma, a=F/m=10, v=at=10*0.1=1
    }

    #[test]
    fn test_truncate() {
        let v = Vec2::new(10.0, 0.0);
        let truncated = truncate(v, 5.0);
        assert!((truncated.length() - 5.0).abs() < 0.01);

        let small = Vec2::new(2.0, 0.0);
        let not_truncated = truncate(small, 5.0);
        assert!((not_truncated.length() - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_steering_agent_bundle() {
        let bundle = SteeringAgentBundle::new(5.0, 10.0);
        assert_eq!(bundle.agent.max_speed, 5.0);
        assert_eq!(bundle.agent.max_force, 10.0);
    }
}
