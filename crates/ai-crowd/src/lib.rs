//! Deterministic crowd primitives: preferred velocity + simple local avoidance.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

use std::collections::BTreeMap;

use ai_nav::Vec2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CrowdConfig {
    /// Radius used to consider other agents as neighbors.
    pub neighbor_radius: f32,
    /// Strength applied to the separation vector.
    pub separation_weight: f32,
    /// Optional acceleration limit (units: speed per second).
    pub max_accel: f32,
}

impl Default for CrowdConfig {
    fn default() -> Self {
        Self {
            neighbor_radius: 2.0,
            separation_weight: 1.0,
            max_accel: f32::INFINITY,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CrowdAgent {
    /// Stable identifier used for deterministic ordering.
    ///
    /// For strict determinism, this should be unique per-agent within a crowd step.
    pub id: u64,
    pub position: Vec2,
    pub velocity: Vec2,
    /// Preferred velocity (e.g. from a path follower). The solver nudges this to avoid neighbors.
    pub preferred_velocity: Vec2,
    pub radius: f32,
    pub max_speed: f32,
}

impl CrowdAgent {
    pub fn new(id: u64, position: Vec2) -> Self {
        Self {
            id,
            position,
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::ZERO,
            radius: 0.5,
            max_speed: 4.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Cell(i32, i32);

/// A small deterministic crowd solver:
/// - Builds a spatial hash for neighbor queries.
/// - Computes a separation vector from nearby agents.
/// - Blends with `preferred_velocity`, clamps speed, and optionally clamps acceleration.
pub struct Crowd {
    config: CrowdConfig,
    cell_size: f32,
    buckets: BTreeMap<Cell, Vec<usize>>,
    scratch_velocities: Vec<Vec2>,
}

impl Crowd {
    pub fn new(config: CrowdConfig) -> Self {
        let cell_size = config.neighbor_radius.max(1e-3);
        Self {
            config,
            cell_size,
            buckets: BTreeMap::new(),
            scratch_velocities: Vec::new(),
        }
    }

    pub fn config(&self) -> CrowdConfig {
        self.config
    }

    pub fn set_config(&mut self, config: CrowdConfig) {
        self.config = config;
        self.cell_size = self.config.neighbor_radius.max(1e-3);
    }

    pub fn step(&mut self, dt_seconds: f32, agents: &mut [CrowdAgent]) {
        self.step_velocities(dt_seconds, agents);
        let dt = dt_seconds.max(0.0);
        if dt <= 0.0 {
            return;
        }
        for agent in agents.iter_mut() {
            agent.position = agent.position + agent.velocity * dt;
        }
    }

    pub fn step_velocities(&mut self, dt_seconds: f32, agents: &mut [CrowdAgent]) {
        let dt = dt_seconds.max(0.0);
        let neighbor_radius = self.config.neighbor_radius.max(0.0);
        if neighbor_radius <= 0.0 {
            for agent in agents.iter_mut() {
                agent.velocity = clamp_length(agent.preferred_velocity, agent.max_speed.max(0.0));
            }
            return;
        }

        self.cell_size = neighbor_radius.max(1e-3);
        self.rebuild_buckets(agents);

        self.scratch_velocities.clear();
        self.scratch_velocities.resize(agents.len(), Vec2::ZERO);

        let neighbor_radius2 = neighbor_radius * neighbor_radius;

        for i in 0..agents.len() {
            let agent = agents[i];
            let mut separation = Vec2::ZERO;
            let cell = cell_for(agent.position, self.cell_size);

            for dy in -1..=1 {
                for dx in -1..=1 {
                    let c = Cell(cell.0 + dx, cell.1 + dy);
                    let Some(bucket) = self.buckets.get(&c) else {
                        continue;
                    };
                    for &j in bucket.iter() {
                        if i == j {
                            continue;
                        }
                        let other = agents[j];
                        let delta = agent.position - other.position;
                        let dist2 = delta.dot(delta);
                        if dist2 <= 1e-12 || dist2 > neighbor_radius2 {
                            continue;
                        }
                        let dist = dist2.sqrt();
                        let min_dist = (agent.radius.max(0.0) + other.radius.max(0.0)).max(1e-6);
                        let dir = delta / dist;

                        let mut weight = (neighbor_radius - dist) / neighbor_radius;
                        if dist < min_dist {
                            weight = 1.0 + (min_dist - dist) / min_dist;
                        }
                        separation = separation + dir * weight;
                    }
                }
            }

            let mut desired = agent.preferred_velocity;
            desired = desired + separation * self.config.separation_weight;
            desired = clamp_length(desired, agent.max_speed.max(0.0));
            desired = clamp_accel(agent.velocity, desired, self.config.max_accel, dt);

            self.scratch_velocities[i] = desired;
        }

        for (agent, new_v) in agents.iter_mut().zip(self.scratch_velocities.iter().copied()) {
            agent.velocity = new_v;
        }
    }

    fn rebuild_buckets(&mut self, agents: &[CrowdAgent]) {
        self.buckets.clear();
        for (idx, agent) in agents.iter().enumerate() {
            let cell = cell_for(agent.position, self.cell_size);
            self.buckets.entry(cell).or_default().push(idx);
        }

        // Deterministic within-cell ordering: independent of input slice order.
        for bucket in self.buckets.values_mut() {
            bucket.sort_by(|a, b| {
                let a_id = agents[*a].id;
                let b_id = agents[*b].id;
                (a_id, *a).cmp(&(b_id, *b))
            });
        }
    }
}

fn cell_for(p: Vec2, cell_size: f32) -> Cell {
    let cs = cell_size.max(1e-6);
    Cell((p.x / cs).floor() as i32, (p.y / cs).floor() as i32)
}

fn clamp_length(v: Vec2, max_len: f32) -> Vec2 {
    let max_len = max_len.max(0.0);
    let len = v.length();
    if len <= max_len || len <= f32::EPSILON {
        v
    } else {
        v * (max_len / len)
    }
}

fn clamp_accel(current: Vec2, desired: Vec2, max_accel: f32, dt: f32) -> Vec2 {
    if !max_accel.is_finite() || max_accel <= 0.0 || dt <= 0.0 {
        return desired;
    }
    let dv = desired - current;
    let max_dv = max_accel * dt;
    clamp_length(dv, max_dv) + current
}
