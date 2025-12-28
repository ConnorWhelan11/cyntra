//! Bevy integration for ai-crowd deterministic crowd avoidance.
//!
//! This module provides components and systems for integrating the ai-crowd
//! separation-based crowd solver with Bevy.
//!
//! # Usage
//!
//! 1. Add `AiCrowdPlugin` to your app
//! 2. Add `AiCrowdAgent` components to entities that should avoid each other
//! 3. Set `preferred_velocity` on each agent (typically from path following)
//! 4. The crowd solver will adjust velocities to avoid collisions

use std::collections::BTreeMap;

use ai_crowd::{Crowd, CrowdAgent, CrowdConfig};
use ai_nav::Vec2;
use bevy_app::{App, Plugin};
use bevy_ecs::prelude::{Component, Query, Res, ResMut, Resource};
use bevy_ecs::schedule::IntoScheduleConfigs;

use crate::{AiBevySchedule, AiBevySet, AiAgent, AiPosition, BevyAgentId};

/// Crowd solver configuration resource.
#[derive(Resource)]
pub struct AiCrowdConfig(pub CrowdConfig);

impl Default for AiCrowdConfig {
    fn default() -> Self {
        Self(CrowdConfig::default())
    }
}

/// Component marking an entity as a crowd agent.
///
/// Entities with this component will participate in crowd avoidance.
#[derive(Debug, Clone, Copy, Component)]
pub struct AiCrowdAgent {
    /// Agent radius for collision avoidance.
    pub radius: f32,
    /// Maximum movement speed.
    pub max_speed: f32,
    /// Current velocity (updated by crowd solver).
    pub velocity: Vec2,
    /// Preferred velocity (set by path follower or AI).
    pub preferred_velocity: Vec2,
}

impl Default for AiCrowdAgent {
    fn default() -> Self {
        Self {
            radius: 0.5,
            max_speed: 4.0,
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::ZERO,
        }
    }
}

impl AiCrowdAgent {
    /// Create a new crowd agent with the given radius and max speed.
    pub fn new(radius: f32, max_speed: f32) -> Self {
        Self {
            radius,
            max_speed,
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::ZERO,
        }
    }

    /// Set the preferred velocity.
    pub fn with_preferred_velocity(mut self, velocity: Vec2) -> Self {
        self.preferred_velocity = velocity;
        self
    }
}

/// Resource holding the crowd solver state.
#[derive(Resource)]
pub struct AiCrowdSolver {
    crowd: Crowd,
    /// Scratch buffer for collecting agents.
    agents: Vec<CrowdAgent>,
    /// Map from index to BevyAgentId for writing back.
    agent_ids: Vec<BevyAgentId>,
}

impl Default for AiCrowdSolver {
    fn default() -> Self {
        Self {
            crowd: Crowd::new(CrowdConfig::default()),
            agents: Vec::new(),
            agent_ids: Vec::new(),
        }
    }
}

/// System that runs the crowd solver on all crowd agents.
pub fn crowd_step_velocities(
    config: Res<AiCrowdConfig>,
    tick: Res<crate::AiTick>,
    mut solver: ResMut<AiCrowdSolver>,
    mut query: Query<(&AiAgent, &AiPosition, &mut AiCrowdAgent)>,
) {
    // Update config if changed
    if solver.crowd.config() != config.0 {
        solver.crowd.set_config(config.0);
    }

    // Collect agents in deterministic order
    solver.agents.clear();
    solver.agent_ids.clear();

    // First, collect all agents into a BTreeMap for deterministic ordering
    let mut ordered: BTreeMap<u64, (&AiAgent, &AiPosition, AiCrowdAgent)> = BTreeMap::new();
    for (ai_agent, pos, crowd_agent) in query.iter() {
        ordered.insert(ai_agent.0.0, (ai_agent, pos, *crowd_agent));
    }

    // Build the crowd agent list
    for (id, (ai_agent, pos, crowd_agent)) in &ordered {
        solver.agents.push(CrowdAgent {
            id: *id,
            position: pos.0,
            velocity: crowd_agent.velocity,
            preferred_velocity: crowd_agent.preferred_velocity,
            radius: crowd_agent.radius,
            max_speed: crowd_agent.max_speed,
        });
        solver.agent_ids.push(ai_agent.0);
    }

    if solver.agents.is_empty() {
        return;
    }

    // Run the crowd solver - need to split borrow
    let dt = tick.dt_seconds;
    let AiCrowdSolver { crowd, agents, .. } = &mut *solver;
    crowd.step_velocities(dt, agents);

    // Write velocities back to components
    let velocity_map: BTreeMap<u64, Vec2> = solver
        .agents
        .iter()
        .map(|a| (a.id, a.velocity))
        .collect();

    for (ai_agent, _pos, mut crowd_agent) in query.iter_mut() {
        if let Some(&velocity) = velocity_map.get(&ai_agent.0.0) {
            crowd_agent.velocity = velocity;
        }
    }
}

/// System that applies crowd velocities to positions.
///
/// This should run after `crowd_step_velocities` if you want automatic position updates.
/// Alternatively, you can read `AiCrowdAgent.velocity` in your own movement system.
pub fn crowd_apply_velocities(
    tick: Res<crate::AiTick>,
    mut query: Query<(&mut AiPosition, &AiCrowdAgent)>,
) {
    let dt = tick.dt_seconds;
    for (mut pos, crowd_agent) in query.iter_mut() {
        pos.0 = pos.0 + crowd_agent.velocity * dt;
    }
}

/// Plugin for ai-crowd integration.
///
/// Adds crowd avoidance systems to the AI tick.
pub struct AiCrowdPlugin {
    /// Whether to automatically apply velocities to positions.
    pub apply_velocities: bool,
    /// The schedule to run in.
    pub schedule: AiBevySchedule,
}

impl Default for AiCrowdPlugin {
    fn default() -> Self {
        Self {
            apply_velocities: false,
            schedule: AiBevySchedule::Update,
        }
    }
}

impl AiCrowdPlugin {
    /// Create a new crowd plugin.
    pub fn new() -> Self {
        Self::default()
    }

    /// Enable automatic position updates from crowd velocities.
    pub fn with_velocity_application(mut self) -> Self {
        self.apply_velocities = true;
        self
    }

    /// Set the schedule to run in.
    pub fn in_fixed_update(mut self) -> Self {
        self.schedule = AiBevySchedule::FixedUpdate;
        self
    }
}

impl Plugin for AiCrowdPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AiCrowdConfig>();
        app.init_resource::<AiCrowdSolver>();

        let velocity_system = crowd_step_velocities.in_set(AiBevySet::Think);

        match self.schedule {
            AiBevySchedule::Update => {
                app.add_systems(bevy_app::Update, velocity_system);
                if self.apply_velocities {
                    app.add_systems(
                        bevy_app::Update,
                        crowd_apply_velocities
                            .in_set(AiBevySet::Think)
                            .after(crowd_step_velocities),
                    );
                }
            }
            AiBevySchedule::FixedUpdate => {
                app.add_systems(bevy_app::FixedUpdate, velocity_system);
                if self.apply_velocities {
                    app.add_systems(
                        bevy_app::FixedUpdate,
                        crowd_apply_velocities
                            .in_set(AiBevySet::Think)
                            .after(crowd_step_velocities),
                    );
                }
            }
        }
    }
}

#[cfg(feature = "crowd-orca")]
pub use ai_crowd::{OrcaConfig, OrcaLine};

/// System that runs ORCA-style avoidance (when the `crowd-orca` feature is enabled).
#[cfg(feature = "crowd-orca")]
pub fn crowd_step_orca_velocities(
    config: Res<AiCrowdConfig>,
    orca_config: Option<Res<AiOrcaConfig>>,
    tick: Res<crate::AiTick>,
    mut solver: ResMut<AiCrowdSolver>,
    mut query: Query<(&AiAgent, &AiPosition, &mut AiCrowdAgent)>,
) {
    // Update config if changed
    if solver.crowd.config() != config.0 {
        solver.crowd.set_config(config.0);
    }

    let orca_cfg = orca_config
        .as_ref()
        .map(|c| c.0)
        .unwrap_or_default();

    // Collect agents in deterministic order
    solver.agents.clear();
    solver.agent_ids.clear();

    let mut ordered: BTreeMap<u64, (&AiAgent, &AiPosition, AiCrowdAgent)> = BTreeMap::new();
    for (ai_agent, pos, crowd_agent) in query.iter() {
        ordered.insert(ai_agent.0.0, (ai_agent, pos, *crowd_agent));
    }

    for (id, (ai_agent, pos, crowd_agent)) in &ordered {
        solver.agents.push(CrowdAgent {
            id: *id,
            position: pos.0,
            velocity: crowd_agent.velocity,
            preferred_velocity: crowd_agent.preferred_velocity,
            radius: crowd_agent.radius,
            max_speed: crowd_agent.max_speed,
        });
        solver.agent_ids.push(ai_agent.0);
    }

    if solver.agents.is_empty() {
        return;
    }

    // Run ORCA solver - need to split borrow
    let dt = tick.dt_seconds;
    let AiCrowdSolver { crowd, agents, .. } = &mut *solver;
    crowd.step_orca_velocities(dt, agents, orca_cfg);

    // Write velocities back
    let velocity_map: BTreeMap<u64, Vec2> = solver
        .agents
        .iter()
        .map(|a| (a.id, a.velocity))
        .collect();

    for (ai_agent, _pos, mut crowd_agent) in query.iter_mut() {
        if let Some(&velocity) = velocity_map.get(&ai_agent.0.0) {
            crowd_agent.velocity = velocity;
        }
    }
}

/// ORCA configuration resource.
#[cfg(feature = "crowd-orca")]
#[derive(Resource)]
pub struct AiOrcaConfig(pub OrcaConfig);

#[cfg(feature = "crowd-orca")]
impl Default for AiOrcaConfig {
    fn default() -> Self {
        Self(OrcaConfig::default())
    }
}
