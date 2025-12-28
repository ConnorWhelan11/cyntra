//! Perception demo showing agents detecting each other through sight and hearing.
//!
//! The blue agent (observer) rotates in place while red agents stand around.
//! Agents change color based on detection status:
//! - Green: Visible (in sight cone)
//! - Orange: Audible (making noise)
//! - Yellow: Both seen and heard
//! - Red: Undetected
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example perception_demo --features perception,bevy-demo`

use std::sync::Arc;

use ai_bevy::{
    AiFacing, AiLoudness, AiRadius, AiVisibility,
    AiAgent, AiBevyPlugin, AiNavMesh, AiPosition, AiTick, BevyAgentId, BevyBrainRegistry,
};
use ai_core::{Blackboard, Brain, Policy, ActionRuntime, TickContext};
use ai_nav::{NavMesh, Vec2};
use bevy::color::Color;
use bevy::core_pipeline::core_3d::Camera3d;
use bevy::prelude::*;

/// Marker for the visual agent mesh.
#[derive(Component)]
struct AgentVisual(BevyAgentId);

/// Simple patrol policy that does nothing - agent just exists.
struct IdlePolicy;

impl Policy<ai_bevy::BevyAiWorld> for IdlePolicy {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: BevyAgentId,
        _world: &mut ai_bevy::BevyAiWorld,
        _blackboard: &mut Blackboard,
        _actions: &mut ActionRuntime<ai_bevy::BevyAiWorld>,
    ) {
        // No actions needed
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
        Transform::from_xyz(5.0, 15.0, 15.0).looking_at(Vec3::new(5.0, 0.0, 5.0), Vec3::Y),
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
            base_color: Color::srgb(0.3, 0.3, 0.35),
            ..default()
        })),
        Transform::from_xyz(5.0, 0.0, 5.0),
    ));

    // Create a simple navmesh
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

    let agent_mesh = meshes.add(Capsule3d::new(0.3, 1.0));
    let observer_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.2, 0.6, 0.9),
        ..default()
    });
    let target_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.9, 0.3, 0.2),
        ..default()
    });

    // Observer agent (blue) - looking around
    let observer = BevyAgentId(1);
    let observer_pos = Vec2::new(5.0, 5.0);
    commands.spawn((
        AiAgent(observer),
        AiPosition(observer_pos),
        AiFacing(Vec2::new(1.0, 0.0)),
        AiLoudness(0.0),  // Silent observer
        AiRadius(0.5),
        AiVisibility::default(),
    ));

    commands.spawn((
        AgentVisual(observer),
        Mesh3d(agent_mesh.clone()),
        MeshMaterial3d(observer_material),
        Transform::from_xyz(observer_pos.x, 0.5, observer_pos.y),
    ));

    // Create a simple brain
    let brain = Brain::new(observer, Box::new(IdlePolicy));
    registry.insert(brain);

    // Target agents (red) - scattered around, some making noise
    let target_positions = [
        (Vec2::new(8.0, 5.0), 0.0, "visible"),   // In front, visible
        (Vec2::new(2.0, 5.0), 0.0, "behind"),    // Behind, not visible
        (Vec2::new(5.0, 8.0), 0.8, "noisy"),     // To the side, making noise
        (Vec2::new(5.0, 2.0), 0.0, "hidden"),    // Other side, silent
    ];

    for (i, (pos, loudness, _label)) in target_positions.iter().enumerate() {
        let agent = BevyAgentId(100 + i as u64);
        commands.spawn((
            AiAgent(agent),
            AiPosition(*pos),
            AiFacing(Vec2::new(0.0, 1.0)),
            AiLoudness(*loudness),
            AiRadius(0.4),
            AiVisibility::default(),
        ));

        commands.spawn((
            AgentVisual(agent),
            Mesh3d(agent_mesh.clone()),
            MeshMaterial3d(target_material.clone()),
            Transform::from_xyz(pos.x, 0.5, pos.y),
        ));

        // Simple brain for targets
        registry.insert(Brain::new(agent, Box::new(IdlePolicy)));
    }

    // Print help text
    info!("Perception Demo");
    info!("- Blue agent (center) rotates and perceives nearby agents");
    info!("- Green = Visible | Orange = Audible | Yellow = Both | Red = Undetected");
}

/// System to slowly rotate the observer's facing direction.
fn rotate_observer(
    time: Res<Time>,
    mut query: Query<(&AiAgent, &mut AiFacing)>,
) {
    for (agent, mut facing) in query.iter_mut() {
        if agent.0.0 == 1 {
            // Rotate the observer
            let angle = time.elapsed_secs() * 0.5;
            facing.0 = Vec2::new(angle.cos(), angle.sin());
        }
    }
}

/// System to sync visual meshes with AI positions and rotations.
fn sync_visuals(
    query: Query<(&AiAgent, &AiPosition, &AiFacing)>,
    mut visuals: Query<(&AgentVisual, &mut Transform)>,
) {
    let data_map: std::collections::HashMap<_, _> =
        query.iter().map(|(a, p, f)| (a.0, (p.0, f.0))).collect();

    for (vis, mut transform) in visuals.iter_mut() {
        if let Some(&(pos, facing)) = data_map.get(&vis.0) {
            transform.translation.x = pos.x;
            transform.translation.z = pos.y;

            // Rotate to face direction
            let angle = facing.y.atan2(facing.x);
            transform.rotation = Quat::from_rotation_y(-angle);
        }
    }
}

/// System to visualize sight range (simple gizmo lines).
fn draw_sight_gizmos(
    query: Query<(&AiAgent, &AiPosition, &AiFacing)>,
    mut gizmos: Gizmos,
) {
    for (agent, pos, facing) in query.iter() {
        if agent.0.0 == 1 {
            // Observer - draw sight cone
            let center = Vec3::new(pos.0.x, 0.1, pos.0.y);
            let range = 8.0;
            let half_fov = 45.0_f32.to_radians();

            let forward = Vec3::new(facing.0.x, 0.0, facing.0.y).normalize();
            let right = Vec3::new(facing.0.y, 0.0, -facing.0.x).normalize();

            let left_edge = forward * half_fov.cos() - right * half_fov.sin();
            let right_edge = forward * half_fov.cos() + right * half_fov.sin();

            let cone_color = Color::srgba(0.2, 0.6, 0.9, 0.5);
            gizmos.line(center, center + left_edge * range, cone_color);
            gizmos.line(center, center + right_edge * range, cone_color);
            gizmos.line(center + left_edge * range, center + right_edge * range, cone_color);

            // Draw hearing circle
            let hearing_color = Color::srgba(0.9, 0.5, 0.2, 0.3);
            gizmos.circle(
                Isometry3d::new(center, Quat::from_rotation_x(std::f32::consts::FRAC_PI_2)),
                6.0,
                hearing_color,
            );
        }
    }
}

/// System to highlight detected agents.
fn highlight_detected(
    observer_query: Query<(&AiAgent, &AiPosition, &AiFacing)>,
    target_query: Query<(&AiAgent, &AiPosition, &AiLoudness)>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    visuals: Query<(&AgentVisual, &MeshMaterial3d<StandardMaterial>)>,
) {
    // Find observer
    let Some((_, obs_pos, obs_facing)) = observer_query.iter().find(|(a, _, _)| a.0.0 == 1) else {
        return;
    };

    for (target_agent, target_pos, target_loudness) in target_query.iter() {
        if target_agent.0.0 == 1 {
            continue; // Skip observer
        }

        // Check if in sight cone
        let to_target = target_pos.0 - obs_pos.0;
        let distance = (to_target.x * to_target.x + to_target.y * to_target.y).sqrt();
        let dir = if distance > 0.0 {
            Vec2::new(to_target.x / distance, to_target.y / distance)
        } else {
            Vec2::new(1.0, 0.0)
        };

        let dot = obs_facing.0.x * dir.x + obs_facing.0.y * dir.y;
        let half_fov = 45.0_f32.to_radians();
        let in_sight = distance <= 8.0 && dot >= half_fov.cos();

        // Check if audible
        let hearing_range = 6.0 * target_loudness.0;
        let audible = distance <= hearing_range && target_loudness.0 > 0.0;

        // Update visual
        for (vis, mat_handle) in visuals.iter() {
            if vis.0 == target_agent.0 {
                if let Some(mat) = materials.get_mut(&mat_handle.0) {
                    if in_sight && audible {
                        mat.base_color = Color::srgb(1.0, 1.0, 0.0); // Yellow - both
                    } else if in_sight {
                        mat.base_color = Color::srgb(0.0, 1.0, 0.0); // Green - seen
                    } else if audible {
                        mat.base_color = Color::srgb(1.0, 0.5, 0.0); // Orange - heard
                    } else {
                        mat.base_color = Color::srgb(0.9, 0.3, 0.2); // Red - undetected
                    }
                }
            }
        }
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(AiBevyPlugin::default())
        .add_systems(Startup, setup)
        .add_systems(Update, (
            rotate_observer,
            sync_visuals,
            draw_sight_gizmos,
            highlight_detected,
        ))
        .run();
}
