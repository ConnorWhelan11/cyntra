//! AI Integration Demo - Validates M2, M3, M4 milestones.
//!
//! This demo demonstrates all three integration milestones:
//!
//! **M2: KinematicCharacterController**
//! - AI agent with physics-based movement
//! - Gravity, ground snap, obstacle stepping
//! - WASD to move the controlled agent
//!
//! **M3: Raycast/Shapecast Perception**
//! - Line of sight checks between agents
//! - Nearby entity detection (overlap sphere)
//! - Visual debug rays
//!
//! **M4: AI Collision Events**
//! - High-level AiCollisionEvent types
//! - TriggerEnter/Exit events
//! - Contact tracking
//!
//! Controls:
//! - WASD: Move the green AI agent
//! - Space: Jump
//! - Left/Right Arrows: Orbit camera
//! - Q/E: Zoom
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example ai_integration_demo --features physics,bevy-demo`

use ai_bevy::physics::{
    layers, AiAgentPhysicsBundle, AiCollisionEvent, AiCollisionLayer, AiMovementInput,
    AiMovementOutput, AiPerception, AiPhysicsPlugin, AiVerticalVelocity, ActiveEvents, Collider,
    CollisionGroups, Group, RigidBody, Sensor, TriggerTracker,
};
use bevy::color::Color;
use bevy::core_pipeline::core_3d::Camera3d;
use bevy::prelude::*;
use bevy_rapier3d::prelude::{QueryFilter, ReadRapierContext};

/// Marker for the player-controlled AI agent.
#[derive(Component)]
struct PlayerAgent;

/// Marker for enemy AI agents (targets for perception).
#[derive(Component)]
struct EnemyAgent;

/// Marker for trigger zones.
#[derive(Component)]
struct TriggerZone {
    name: &'static str,
}

/// Visual indicator for perception results.
#[derive(Component)]
struct PerceptionIndicator;

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
                player_movement_input,
                camera_follow,
                perception_system,
                listen_ai_events,
            ),
        )
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 10.0, 20.0).looking_at(Vec3::ZERO, Vec3::Y),
        OrbitCamera {
            distance: 22.0,
            yaw: 0.0,
            pitch: 0.5,
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
        Mesh3d(meshes.add(Plane3d::new(Vec3::Y, bevy::math::Vec2::splat(20.0)))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.3, 0.4, 0.3),
            ..default()
        })),
        RigidBody::Fixed,
        Collider::cuboid(20.0, 0.1, 20.0),
        CollisionGroups::new(
            Group::from_bits(layers::GROUND).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Ground,
    ));

    // =====================
    // M2: Player AI Agent with KinematicCharacterController
    // =====================
    let agent_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.2, 0.8, 0.2),
        ..default()
    });

    commands.spawn((
        PlayerAgent,
        Name::new("Player Agent"),
        Mesh3d(meshes.add(Capsule3d::new(0.4, 1.0))),
        MeshMaterial3d(agent_material),
        Transform::from_xyz(0.0, 2.0, 0.0),
        // M2: Physics bundle with character controller
        AiAgentPhysicsBundle::standard(),
        AiMovementInput::stationary(),
        AiMovementOutput::default(),
        AiVerticalVelocity::default(),
        TriggerTracker::default(),
        AiCollisionLayer::Agent,
        ActiveEvents::COLLISION_EVENTS,
    ));

    // =====================
    // Enemy agents (targets for M3 perception)
    // =====================
    let enemy_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.8, 0.2, 0.2),
        ..default()
    });

    // Place enemies around the arena
    let enemy_positions = [
        Vec3::new(5.0, 1.0, 0.0),
        Vec3::new(-5.0, 1.0, 3.0),
        Vec3::new(0.0, 1.0, -6.0),
        Vec3::new(7.0, 1.0, 7.0),
    ];

    for (i, pos) in enemy_positions.iter().enumerate() {
        commands.spawn((
            EnemyAgent,
            Name::new(format!("Enemy {}", i)),
            Mesh3d(meshes.add(Capsule3d::new(0.4, 1.0))),
            MeshMaterial3d(enemy_material.clone()),
            Transform::from_translation(*pos),
            RigidBody::Fixed,
            Collider::capsule_y(0.5, 0.4),
            CollisionGroups::new(
                Group::from_bits(layers::AGENT).unwrap(),
                Group::from_bits(layers::AGENT | layers::GROUND).unwrap(),
            ),
            AiCollisionLayer::Agent,
        ));
    }

    // =====================
    // M4: Trigger zones for AiCollisionEvent testing
    // =====================
    let trigger_material = materials.add(StandardMaterial {
        base_color: Color::srgba(0.2, 0.2, 0.8, 0.3),
        alpha_mode: AlphaMode::Blend,
        ..default()
    });

    // Blue trigger zone
    commands.spawn((
        TriggerZone { name: "Blue Zone" },
        Mesh3d(meshes.add(Cuboid::new(4.0, 0.5, 4.0))),
        MeshMaterial3d(trigger_material.clone()),
        Transform::from_xyz(-6.0, 0.25, -6.0),
        Collider::cuboid(2.0, 0.25, 2.0),
        Sensor,
        CollisionGroups::new(
            Group::from_bits(layers::TRIGGER).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Trigger,
        ActiveEvents::COLLISION_EVENTS,
    ));

    // Yellow trigger zone
    let yellow_trigger = materials.add(StandardMaterial {
        base_color: Color::srgba(0.8, 0.8, 0.2, 0.3),
        alpha_mode: AlphaMode::Blend,
        ..default()
    });

    commands.spawn((
        TriggerZone { name: "Yellow Zone" },
        Mesh3d(meshes.add(Cuboid::new(4.0, 0.5, 4.0))),
        MeshMaterial3d(yellow_trigger),
        Transform::from_xyz(6.0, 0.25, 6.0),
        Collider::cuboid(2.0, 0.25, 2.0),
        Sensor,
        CollisionGroups::new(
            Group::from_bits(layers::TRIGGER).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Trigger,
        ActiveEvents::COLLISION_EVENTS,
    ));

    // Obstacles (walls to block line of sight)
    let wall_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.5, 0.5, 0.6),
        ..default()
    });

    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.5, 3.0, 6.0))),
        MeshMaterial3d(wall_material.clone()),
        Transform::from_xyz(3.0, 1.5, -3.0),
        RigidBody::Fixed,
        Collider::cuboid(0.25, 1.5, 3.0),
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Obstacle,
    ));

    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(6.0, 3.0, 0.5))),
        MeshMaterial3d(wall_material),
        Transform::from_xyz(-3.0, 1.5, 3.0),
        RigidBody::Fixed,
        Collider::cuboid(3.0, 1.5, 0.25),
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        AiCollisionLayer::Obstacle,
    ));

    // Perception indicator (shows line-of-sight state)
    commands.spawn((
        PerceptionIndicator,
        Mesh3d(meshes.add(Sphere::new(0.2))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(1.0, 1.0, 1.0),
            emissive: bevy::color::LinearRgba::rgb(2.0, 2.0, 2.0),
            ..default()
        })),
        Transform::from_xyz(0.0, 5.0, 0.0),
    ));

    info!("=== AI Integration Demo ===");
    info!("M2: WASD to move the green agent, Space to jump");
    info!("M3: Watch the indicator sphere - green=enemy visible, red=blocked");
    info!("M4: Walk into colored zones to see AiCollisionEvent logs");
    info!("Camera: Arrows orbit, Q/E zoom");
}

/// M2: Process player input and set movement velocity.
fn player_movement_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<(&mut AiMovementInput, &AiMovementOutput, &mut AiVerticalVelocity), With<PlayerAgent>>,
) {
    let Ok((mut input, output, mut vert_vel)) = query.single_mut() else {
        return;
    };

    let speed = 5.0;
    let mut velocity = bevy_rapier3d::math::Vect::ZERO;

    // WASD movement
    if keyboard.pressed(KeyCode::KeyW) {
        velocity.z -= speed;
    }
    if keyboard.pressed(KeyCode::KeyS) {
        velocity.z += speed;
    }
    if keyboard.pressed(KeyCode::KeyA) {
        velocity.x -= speed;
    }
    if keyboard.pressed(KeyCode::KeyD) {
        velocity.x += speed;
    }

    // Jump (only when grounded)
    if keyboard.just_pressed(KeyCode::Space) && output.grounded {
        vert_vel.0 = 8.0; // Jump velocity
    }

    input.velocity = velocity;
    input.apply_gravity = true;
}

/// Camera follow with orbit.
fn camera_follow(
    time: Res<Time>,
    keyboard: Res<ButtonInput<KeyCode>>,
    player_query: Query<&Transform, (With<PlayerAgent>, Without<OrbitCamera>)>,
    mut camera_query: Query<(&mut Transform, &mut OrbitCamera)>,
) {
    let Ok(player_transform) = player_query.single() else {
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
        orbit.distance = (orbit.distance + speed * 5.0).min(40.0);
    }

    // Calculate camera position relative to player
    let target = player_transform.translation + Vec3::new(0.0, 1.5, 0.0);
    let x = orbit.distance * orbit.pitch.cos() * orbit.yaw.sin();
    let y = orbit.distance * orbit.pitch.sin();
    let z = orbit.distance * orbit.pitch.cos() * orbit.yaw.cos();

    cam_transform.translation = target + Vec3::new(x, y, z);
    cam_transform.look_at(target, Vec3::Y);
}

/// M3: Perception system - check line of sight to enemies.
fn perception_system(
    rapier_context: ReadRapierContext,
    player_query: Query<(Entity, &Transform), With<PlayerAgent>>,
    enemy_query: Query<(Entity, &Transform), With<EnemyAgent>>,
    mut indicator_query: Query<
        (&mut Transform, &mut MeshMaterial3d<StandardMaterial>),
        (With<PerceptionIndicator>, Without<PlayerAgent>, Without<EnemyAgent>),
    >,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let Ok(rapier) = rapier_context.single() else {
        return;
    };
    let Ok((player_entity, player_transform)) = player_query.single() else {
        return;
    };

    let perception = AiPerception::new(&rapier);
    let player_pos = player_transform.translation;
    let eye_height = bevy_rapier3d::math::Vect::new(player_pos.x, player_pos.y + 0.8, player_pos.z);

    // Check line of sight to each enemy
    let mut visible_count = 0;
    for (_enemy_entity, enemy_transform) in enemy_query.iter() {
        let enemy_pos = enemy_transform.translation;
        let enemy_eye =
            bevy_rapier3d::math::Vect::new(enemy_pos.x, enemy_pos.y + 0.8, enemy_pos.z);

        let los_result = perception.line_of_sight(eye_height, enemy_eye, Some(player_entity));

        if los_result.visible {
            visible_count += 1;
        }
    }

    // Also check nearby entities using overlap sphere (M3 feature)
    let nearby = perception.overlap_sphere(
        eye_height,
        10.0,
        QueryFilter::default().exclude_collider(player_entity),
    );

    // Update indicator based on perception results
    if let Ok((mut indicator_transform, indicator_material)) = indicator_query.single_mut() {
        indicator_transform.translation = player_pos + Vec3::new(0.0, 3.0, 0.0);

        // Update color based on visibility
        if let Some(mat) = materials.get_mut(&indicator_material.0) {
            if visible_count > 0 {
                mat.base_color = Color::srgb(0.0, 1.0, 0.0); // Green = enemies visible
                mat.emissive = bevy::color::LinearRgba::rgb(0.0, 3.0, 0.0);
            } else {
                mat.base_color = Color::srgb(1.0, 0.0, 0.0); // Red = no visibility
                mat.emissive = bevy::color::LinearRgba::rgb(3.0, 0.0, 0.0);
            }
        }
    }

    // Log perception state periodically (every ~2 seconds based on frame count)
    static mut FRAME_COUNT: u32 = 0;
    unsafe {
        FRAME_COUNT += 1;
        if FRAME_COUNT % 120 == 0 {
            info!(
                "M3 Perception: {} enemies visible, {} entities within 10m",
                visible_count,
                nearby.entities.len()
            );
        }
    }
}

/// M4: Listen for high-level AI collision events.
fn listen_ai_events(
    mut events: EventReader<AiCollisionEvent>,
    triggers: Query<&TriggerZone>,
    names: Query<&Name>,
) {
    for event in events.read() {
        match event {
            AiCollisionEvent::TriggerEnter { agent, trigger } => {
                let agent_name = names.get(*agent).map(|n| n.as_str()).unwrap_or("Unknown");
                let zone_name = triggers
                    .get(*trigger)
                    .map(|t| t.name)
                    .unwrap_or("Unknown Zone");
                info!("M4 Event: {} entered {}", agent_name, zone_name);
            }
            AiCollisionEvent::TriggerExit { agent, trigger } => {
                let agent_name = names.get(*agent).map(|n| n.as_str()).unwrap_or("Unknown");
                let zone_name = triggers
                    .get(*trigger)
                    .map(|t| t.name)
                    .unwrap_or("Unknown Zone");
                info!("M4 Event: {} exited {}", agent_name, zone_name);
            }
            AiCollisionEvent::AgentContact { agent, other_agent } => {
                let name1 = names.get(*agent).map(|n| n.as_str()).unwrap_or("Agent1");
                let name2 = names
                    .get(*other_agent)
                    .map(|n| n.as_str())
                    .unwrap_or("Agent2");
                info!("M4 Event: Agent contact between {} and {}", name1, name2);
            }
            _ => {}
        }
    }
}
