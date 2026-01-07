//! Navigation Physics Demo - Validates M5, M6, M7 milestones.
//!
//! This demo demonstrates:
//!
//! **M5: Physics ↔ Navigation Sync**
//! - 3D physics positions synced to 2D nav coordinates
//! - PhysicsNavAgent marker for position sync
//!
//! **M6: Path Following with Physics**
//! - NavPathFollower drives AiMovementInput
//! - Waypoint tracking and completion
//! - NavWaypointReached events
//!
//! **M7: Debug Visualization**
//! - Navigation path gizmos
//! - Waypoint markers
//! - Facing direction arrows
//! - Perception cones (when enabled)
//!
//! Controls:
//! - Click on ground: Set new destination for the agent
//! - Space: Toggle perception cone visualization
//! - Left/Right Arrows: Orbit camera
//! - Q/E: Zoom
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example nav_physics_demo --features physics,bevy-demo`

use ai_bevy::physics::{
    layers, AiAgentPhysicsBundle, AiCollisionLayer, AiDebugConfig, AiMovementInput,
    AiMovementOutput, AiPhysicsPlugin, AiVerticalVelocity, ActiveEvents, Collider,
    CollisionGroups, Group, NavPathFollower, NavWaypointReached, PhysicsNavAgent, RigidBody,
};
use ai_bevy::{AiFacing, AiPosition};
use bevy::color::Color;
use bevy::core_pipeline::core_3d::Camera3d;
use bevy::prelude::*;
use bevy::window::PrimaryWindow;
use bevy_rapier3d::prelude::{QueryFilter, ReadRapierContext};

/// Marker for the player-controlled AI agent.
#[derive(Component)]
struct NavAgent;

/// Camera orbit state.
#[derive(Component)]
struct OrbitCamera {
    distance: f32,
    yaw: f32,
    pitch: f32,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(AiPhysicsPlugin::default().with_debug_render(true))
        .add_systems(Startup, setup)
        .add_systems(
            Update,
            (
                camera_orbit,
                click_to_set_destination,
                toggle_perception_cones,
                log_waypoint_events,
            ),
        )
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut debug_config: ResMut<AiDebugConfig>,
) {
    // Enable path and waypoint visualization
    debug_config.show_paths = true;
    debug_config.show_waypoints = true;
    debug_config.show_facing = true;
    debug_config.show_perception_cones = false;

    // Camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 15.0, 20.0).looking_at(Vec3::ZERO, Vec3::Y),
        OrbitCamera {
            distance: 25.0,
            yaw: 0.0,
            pitch: 0.6,
        },
    ));

    // Light
    commands.spawn((
        DirectionalLight {
            illuminance: 15000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(5.0, 15.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Ground (large platform)
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::new(Vec3::Y, bevy::math::Vec2::splat(25.0)))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.35, 0.45, 0.35),
            ..default()
        })),
        RigidBody::Fixed,
        Collider::cuboid(25.0, 0.1, 25.0),
        CollisionGroups::new(
            Group::from_bits(layers::GROUND).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Ground,
    ));

    // =====================
    // M5/M6: Nav Agent with path following
    // =====================
    let agent_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.2, 0.6, 0.9),
        ..default()
    });

    // Create initial path for the agent
    let initial_path = vec![
        ai_nav::Vec2::new(5.0, 0.0),
        ai_nav::Vec2::new(5.0, 5.0),
        ai_nav::Vec2::new(-5.0, 5.0),
        ai_nav::Vec2::new(-5.0, -5.0),
        ai_nav::Vec2::new(0.0, 0.0),
    ];

    let mut path_follower = NavPathFollower::new(4.0);
    path_follower.set_path(initial_path);

    commands.spawn((
        NavAgent,
        Name::new("Nav Agent"),
        Mesh3d(meshes.add(Capsule3d::new(0.4, 1.0))),
        MeshMaterial3d(agent_material),
        Transform::from_xyz(0.0, 1.0, 0.0),
        // M5: Physics bundle + nav sync
        AiAgentPhysicsBundle::standard(),
        PhysicsNavAgent::default(),
        AiPosition(ai_nav::Vec2::new(0.0, 0.0)),
        AiFacing(ai_nav::Vec2::new(1.0, 0.0)),
        // M6: Path following
        path_follower,
        AiMovementInput::stationary(),
        AiMovementOutput::default(),
        AiVerticalVelocity::default(),
        AiCollisionLayer::Agent,
        ActiveEvents::COLLISION_EVENTS,
    ));

    // Obstacles to navigate around
    let obstacle_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.6, 0.4, 0.3),
        ..default()
    });

    // Obstacle 1
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.0, 2.0, 2.0))),
        MeshMaterial3d(obstacle_material.clone()),
        Transform::from_xyz(3.0, 1.0, 3.0),
        RigidBody::Fixed,
        Collider::cuboid(1.0, 1.0, 1.0),
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Obstacle,
    ));

    // Obstacle 2
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(3.0, 2.0, 1.0))),
        MeshMaterial3d(obstacle_material.clone()),
        Transform::from_xyz(-3.0, 1.0, 0.0),
        RigidBody::Fixed,
        Collider::cuboid(1.5, 1.0, 0.5),
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Obstacle,
    ));

    // Obstacle 3 (L-shaped)
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(4.0, 2.0, 1.0))),
        MeshMaterial3d(obstacle_material),
        Transform::from_xyz(0.0, 1.0, -6.0),
        RigidBody::Fixed,
        Collider::cuboid(2.0, 1.0, 0.5),
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Obstacle,
    ));

    // Waypoint markers (visual only)
    let waypoint_material = materials.add(StandardMaterial {
        base_color: Color::srgba(1.0, 1.0, 0.0, 0.5),
        alpha_mode: AlphaMode::Blend,
        ..default()
    });

    for (i, wp) in [
        Vec3::new(5.0, 0.1, 0.0),
        Vec3::new(5.0, 0.1, 5.0),
        Vec3::new(-5.0, 0.1, 5.0),
        Vec3::new(-5.0, 0.1, -5.0),
        Vec3::new(0.0, 0.1, 0.0),
    ]
    .iter()
    .enumerate()
    {
        commands.spawn((
            Mesh3d(meshes.add(Cylinder::new(0.3, 0.1))),
            MeshMaterial3d(waypoint_material.clone()),
            Transform::from_translation(*wp),
            Name::new(format!("Waypoint {}", i)),
        ));
    }

    info!("=== Navigation Physics Demo ===");
    info!("M5: Physics positions synced to nav coordinates");
    info!("M6: Agent follows path using physics movement");
    info!("M7: Debug gizmos show path, waypoints, and facing");
    info!("");
    info!("Controls:");
    info!("  Click on ground: Set new destination");
    info!("  Space: Toggle perception cones");
    info!("  Arrows: Orbit camera, Q/E: Zoom");
}

/// Camera orbit system.
fn camera_orbit(
    time: Res<Time>,
    keyboard: Res<ButtonInput<KeyCode>>,
    agent_query: Query<&Transform, (With<NavAgent>, Without<OrbitCamera>)>,
    mut camera_query: Query<(&mut Transform, &mut OrbitCamera)>,
) {
    let Ok(agent_transform) = agent_query.single() else {
        return;
    };
    let Ok((mut cam_transform, mut orbit)) = camera_query.single_mut() else {
        return;
    };

    let speed = 2.0 * time.delta_secs();

    // Orbit controls
    if keyboard.pressed(KeyCode::ArrowLeft) {
        orbit.yaw -= speed;
    }
    if keyboard.pressed(KeyCode::ArrowRight) {
        orbit.yaw += speed;
    }
    if keyboard.pressed(KeyCode::KeyQ) {
        orbit.distance = (orbit.distance - speed * 5.0).max(5.0);
    }
    if keyboard.pressed(KeyCode::KeyE) {
        orbit.distance = (orbit.distance + speed * 5.0).min(50.0);
    }

    // Calculate camera position relative to agent
    let target = agent_transform.translation + Vec3::new(0.0, 1.5, 0.0);
    let x = orbit.distance * orbit.pitch.cos() * orbit.yaw.sin();
    let y = orbit.distance * orbit.pitch.sin();
    let z = orbit.distance * orbit.pitch.cos() * orbit.yaw.cos();

    cam_transform.translation = target + Vec3::new(x, y, z);
    cam_transform.look_at(target, Vec3::Y);
}

/// Click on ground to set a new destination for the agent.
fn click_to_set_destination(
    mouse_button: Res<ButtonInput<MouseButton>>,
    window_query: Query<&Window, With<PrimaryWindow>>,
    camera_query: Query<(&Camera, &GlobalTransform), With<Camera3d>>,
    rapier_context: ReadRapierContext,
    mut agent_query: Query<(&Transform, &mut NavPathFollower, &mut AiFacing), With<NavAgent>>,
) {
    if !mouse_button.just_pressed(MouseButton::Left) {
        return;
    }

    let Ok(window) = window_query.single() else {
        return;
    };
    let Ok((camera, camera_transform)) = camera_query.single() else {
        return;
    };
    let Ok(rapier) = rapier_context.single() else {
        return;
    };
    let Ok((agent_transform, mut follower, mut facing)) = agent_query.single_mut() else {
        return;
    };

    let Some(cursor_position) = window.cursor_position() else {
        return;
    };

    // Get ray from camera through cursor
    let Ok(ray) = camera.viewport_to_world(camera_transform, cursor_position) else {
        return;
    };

    // Cast ray to find ground hit
    let filter = QueryFilter::default().groups(CollisionGroups::new(
        Group::ALL,
        Group::from_bits(layers::GROUND).unwrap(),
    ));

    if let Some((_entity, toi)) = rapier.cast_ray(ray.origin, ray.direction.into(), 100.0, true, filter) {
        let hit_point = ray.origin + ray.direction * toi;

        // Create a simple direct path from current position to destination
        let current_pos = agent_transform.translation;
        let path = vec![ai_nav::Vec2::new(hit_point.x, hit_point.z)];

        follower.set_path(path);

        // Update facing toward destination
        let dir = Vec3::new(hit_point.x - current_pos.x, 0.0, hit_point.z - current_pos.z).normalize();
        facing.0 = ai_nav::Vec2::new(dir.x, dir.z);

        info!("New destination: ({:.1}, {:.1})", hit_point.x, hit_point.z);
    }
}

/// Toggle perception cone visualization.
fn toggle_perception_cones(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut debug_config: ResMut<AiDebugConfig>,
) {
    if keyboard.just_pressed(KeyCode::Space) {
        debug_config.show_perception_cones = !debug_config.show_perception_cones;
        info!(
            "Perception cones: {}",
            if debug_config.show_perception_cones {
                "ON"
            } else {
                "OFF"
            }
        );
    }
}

/// Log waypoint reached events.
fn log_waypoint_events(mut events: EventReader<NavWaypointReached>) {
    for event in events.read() {
        if event.is_final {
            info!(
                "Reached final waypoint {} at ({:.1}, {:.1})",
                event.waypoint_index, event.position.x, event.position.y
            );
        } else {
            info!(
                "Reached waypoint {} at ({:.1}, {:.1})",
                event.waypoint_index, event.position.x, event.position.y
            );
        }
    }
}
