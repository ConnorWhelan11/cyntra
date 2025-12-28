//! Crowd avoidance demo showing agents navigating while avoiding each other.
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example crowd_demo --features crowd,bevy-demo`

use std::sync::Arc;

use ai_bevy::{
    crowd::{AiCrowdAgent, AiCrowdPlugin},
    AiAgent, AiBevyPlugin, AiNavMesh, AiPosition, AiTick, BevyAgentId, BevyBrainRegistry,
};
use ai_core::{Action, ActionKey, ActionRuntime, Blackboard, Brain, Policy, TickContext};
use ai_nav::{MoveToAction, NavMesh, Vec2};
use bevy::color::Color;
use bevy::core_pipeline::core_3d::Camera3d;
use bevy::prelude::*;

/// Marker for the visual agent mesh.
#[derive(Component)]
struct AgentVisual(BevyAgentId);

/// Simple policy that moves to a goal position.
struct MoveToGoalPolicy {
    key: ActionKey,
    goal: Vec2,
    speed: f32,
    arrival_distance: f32,
}

impl Policy<ai_bevy::BevyAiWorld> for MoveToGoalPolicy {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: BevyAgentId,
        _world: &mut ai_bevy::BevyAiWorld,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<ai_bevy::BevyAiWorld>,
    ) {
        let goal = self.goal;
        let speed = self.speed;
        let arrival = self.arrival_distance;
        let make = move |_ctx: &TickContext,
                         _agent: BevyAgentId,
                         _world: &mut ai_bevy::BevyAiWorld,
                         _bb: &mut Blackboard| {
            Box::new(MoveToAction::new(goal, speed, arrival))
                as Box<dyn Action<ai_bevy::BevyAiWorld>>
        };

        actions.ensure_current(self.key, make, ctx, agent, _world, blackboard);
    }
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut registry: NonSendMut<BevyBrainRegistry>,
) {
    // Camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(5.0, 12.0, 12.0).looking_at(Vec3::new(5.0, 0.0, 5.0), Vec3::Y),
    ));

    // Light
    commands.spawn((
        DirectionalLight {
            illuminance: 10000.0,
            shadows_enabled: false,
            ..default()
        },
        Transform::from_xyz(5.0, 10.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Ground plane
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::new(Vec3::Y, bevy::math::Vec2::splat(10.0)))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.3, 0.5, 0.3),
            ..default()
        })),
        Transform::from_xyz(5.0, 0.0, 5.0),
    ));

    // Create a large navmesh
    let mesh = NavMesh::from_triangles(vec![
        [Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0), Vec2::new(10.0, 10.0)],
        [Vec2::new(0.0, 0.0), Vec2::new(10.0, 10.0), Vec2::new(0.0, 10.0)],
    ]);
    commands.insert_resource(AiNavMesh(Arc::new(mesh)));

    // Fixed dt for stable simulation.
    commands.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0 / 60.0,
        seed: 0,
    });

    // Spawn agents in two groups heading toward each other
    let agent_mesh = meshes.add(Capsule3d::new(0.3, 1.0));
    let colors = [
        Color::srgb(0.8, 0.2, 0.2),
        Color::srgb(0.2, 0.2, 0.8),
    ];

    // Group 1: Left side going right
    for i in 0..5u64 {
        let agent = BevyAgentId(i + 1);
        let start = Vec2::new(1.0, 2.0 + (i as f32) * 1.5);
        let goal = Vec2::new(9.0, 2.0 + (i as f32) * 1.5);

        commands.spawn((
            AiAgent(agent),
            AiPosition(start),
            AiCrowdAgent::new(0.5, 3.0),
        ));

        // Visual
        commands.spawn((
            AgentVisual(agent),
            Mesh3d(agent_mesh.clone()),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: colors[0],
                ..default()
            })),
            Transform::from_xyz(start.x, 0.5, start.y),
        ));

        registry.insert(Brain::new(
            agent,
            Box::new(MoveToGoalPolicy {
                key: ActionKey("move"),
                goal,
                speed: 2.5,
                arrival_distance: 0.2,
            }),
        ));
    }

    // Group 2: Right side going left
    for i in 0..5u64 {
        let agent = BevyAgentId(i + 100);
        let start = Vec2::new(9.0, 2.0 + (i as f32) * 1.5);
        let goal = Vec2::new(1.0, 2.0 + (i as f32) * 1.5);

        commands.spawn((
            AiAgent(agent),
            AiPosition(start),
            AiCrowdAgent::new(0.5, 3.0),
        ));

        // Visual
        commands.spawn((
            AgentVisual(agent),
            Mesh3d(agent_mesh.clone()),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: colors[1],
                ..default()
            })),
            Transform::from_xyz(start.x, 0.5, start.y),
        ));

        registry.insert(Brain::new(
            agent,
            Box::new(MoveToGoalPolicy {
                key: ActionKey("move"),
                goal,
                speed: 2.5,
                arrival_distance: 0.2,
            }),
        ));
    }
}

/// System to sync visual meshes with AI positions.
fn sync_visuals(
    positions: Query<(&AiAgent, &AiPosition)>,
    mut visuals: Query<(&AgentVisual, &mut Transform)>,
) {
    let pos_map: std::collections::HashMap<_, _> =
        positions.iter().map(|(a, p)| (a.0, p.0)).collect();

    for (vis, mut transform) in visuals.iter_mut() {
        if let Some(&pos) = pos_map.get(&vis.0) {
            transform.translation.x = pos.x;
            transform.translation.z = pos.y;
        }
    }
}

/// System to drive crowd agent preferred velocities from their brain actions.
fn update_preferred_velocities(
    mut query: Query<(&AiAgent, &AiPosition, &mut ai_bevy::crowd::AiCrowdAgent)>,
    registry: NonSend<BevyBrainRegistry>,
) {
    for (agent, _pos, mut crowd_agent) in query.iter_mut() {
        // Get the goal from the brain's policy (simplified: we just use position delta)
        // In a real scenario, the navigation system would provide the desired velocity
        if let Some(_brain) = registry.get(agent.0) {
            // For now, the preferred velocity is set by the navigation action
            // The crowd solver will adjust it to avoid collisions
            // We'll use the current velocity as a proxy
            crowd_agent.preferred_velocity = crowd_agent.velocity;
        }
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(AiBevyPlugin::default())
        .add_plugins(AiCrowdPlugin::new().with_velocity_application())
        .add_systems(Startup, setup)
        .add_systems(Update, (sync_visuals, update_preferred_velocities))
        .run();
}
