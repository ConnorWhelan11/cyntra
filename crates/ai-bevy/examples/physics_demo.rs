//! Physics demo showing Rapier3D integration with ai-bevy.
//!
//! This demo demonstrates:
//! - Gravity and dynamic bodies falling
//! - Ground collision with fixed bodies
//! - Collision event logging
//! - Trigger/sensor volumes
//! - Debug rendering of colliders
//!
//! Controls:
//! - WASD / Arrow keys: Orbit camera
//! - Q/E: Zoom in/out
//! - Space: Spawn a new ball
//! - Left click + drag: Pick up and move balls
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example physics_demo --features physics,bevy-demo`

use ai_bevy::physics::{
    layers, AiPhysicsPlugin, ActiveEvents, Collider, CollisionGroups, Group, RigidBody, Sensor,
};
use bevy::color::Color;
use bevy::core_pipeline::core_3d::Camera3d;
use bevy::prelude::*;
use bevy::window::PrimaryWindow;
use bevy_rapier3d::prelude::{QueryFilter, ReadRapierContext};

/// Marker component for dynamic falling bodies.
#[derive(Component)]
struct FallingBody;

/// Marker component for the trigger zone.
#[derive(Component)]
struct TriggerZone;

/// Resource to hold shared ball assets.
#[derive(Resource)]
struct BallAssets {
    mesh: Handle<Mesh>,
    material: Handle<StandardMaterial>,
}

/// Camera orbit state.
#[derive(Component)]
struct OrbitCamera {
    distance: f32,
    yaw: f32,
    pitch: f32,
}

/// Resource tracking drag state for picking objects.
#[derive(Resource, Default)]
struct DragState {
    /// Entity currently being dragged, if any.
    dragged_entity: Option<Entity>,
    /// Height at which we're dragging (Y coordinate).
    drag_height: f32,
}

/// Marker for entities that can be dragged.
#[derive(Component)]
struct Draggable;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        // Add physics with debug rendering enabled
        .add_plugins(AiPhysicsPlugin::default().with_debug_render(true))
        .init_resource::<DragState>()
        .add_systems(Startup, setup)
        .add_systems(Update, (
            check_trigger_events,
            camera_orbit,
            spawn_ball_on_space,
            drag_and_drop,
        ))
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Camera with orbit controls
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 8.0, 15.0).looking_at(Vec3::new(0.0, 2.0, 0.0), Vec3::Y),
        OrbitCamera {
            distance: 17.0,
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
        Transform::from_xyz(5.0, 10.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Ground plane (fixed rigid body)
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::new(Vec3::Y, bevy::math::Vec2::splat(10.0)))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.3, 0.5, 0.3),
            ..default()
        })),
        Transform::from_xyz(0.0, 0.0, 0.0),
        RigidBody::Fixed,
        Collider::cuboid(10.0, 0.1, 10.0),
        CollisionGroups::new(
            Group::from_bits(layers::GROUND).unwrap(),
            Group::from_bits(layers::AGENT | layers::PROJECTILE).unwrap(),
        ),
    ));

    // Create ball assets and store as resource for spawning more later
    let ball_mesh = meshes.add(Sphere::new(0.5));
    let ball_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.8, 0.2, 0.2),
        ..default()
    });
    commands.insert_resource(BallAssets {
        mesh: ball_mesh.clone(),
        material: ball_material.clone(),
    });

    // Spawn dynamic falling bodies
    for i in 0..5 {
        let x = (i as f32 - 2.0) * 1.5;
        let y = 5.0 + (i as f32) * 1.0;

        commands.spawn((
            FallingBody,
            Draggable,
            Mesh3d(ball_mesh.clone()),
            MeshMaterial3d(ball_material.clone()),
            Transform::from_xyz(x, y, 0.0),
            RigidBody::Dynamic,
            Collider::ball(0.5),
            CollisionGroups::new(
                Group::from_bits(layers::AGENT).unwrap(),
                Group::from_bits(layers::GROUND | layers::OBSTACLE | layers::TRIGGER).unwrap(),
            ),
            ActiveEvents::COLLISION_EVENTS,
        ));
    }

    // Static obstacle (a wall)
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.5, 2.0, 4.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.5, 0.5, 0.7),
            ..default()
        })),
        Transform::from_xyz(3.0, 1.0, 0.0),
        RigidBody::Fixed,
        Collider::cuboid(0.25, 1.0, 2.0),
        CollisionGroups::new(
            Group::from_bits(layers::OBSTACLE).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
    ));

    // Trigger zone (sensor that detects when bodies enter)
    commands.spawn((
        TriggerZone,
        Mesh3d(meshes.add(Cuboid::new(3.0, 0.5, 3.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgba(0.2, 0.8, 0.2, 0.3),
            alpha_mode: AlphaMode::Blend,
            ..default()
        })),
        Transform::from_xyz(-2.0, 0.25, 0.0),
        Collider::cuboid(1.5, 0.25, 1.5),
        Sensor,
        CollisionGroups::new(
            Group::from_bits(layers::TRIGGER).unwrap(),
            Group::from_bits(layers::AGENT).unwrap(),
        ),
        ActiveEvents::COLLISION_EVENTS,
    ));

    info!("Physics demo started!");
    info!("Controls: WASD/Arrows = orbit, Q/E = zoom, Space = spawn, Click+Drag = move balls");
    info!("The green transparent area is a trigger zone - balls entering will log events.");
}

/// System to check for trigger enter/exit events.
fn check_trigger_events(
    mut collision_events: EventReader<bevy_rapier3d::prelude::CollisionEvent>,
    trigger_query: Query<Entity, With<TriggerZone>>,
    falling_query: Query<Entity, With<FallingBody>>,
) {
    let trigger_entities: Vec<_> = trigger_query.iter().collect();
    let falling_entities: Vec<_> = falling_query.iter().collect();

    for event in collision_events.read() {
        match event {
            bevy_rapier3d::prelude::CollisionEvent::Started(e1, e2, _) => {
                let is_trigger_1 = trigger_entities.contains(e1);
                let is_trigger_2 = trigger_entities.contains(e2);
                let is_falling_1 = falling_entities.contains(e1);
                let is_falling_2 = falling_entities.contains(e2);

                if (is_trigger_1 && is_falling_2) || (is_trigger_2 && is_falling_1) {
                    info!("Ball entered trigger zone!");
                }
            }
            bevy_rapier3d::prelude::CollisionEvent::Stopped(e1, e2, _) => {
                let is_trigger_1 = trigger_entities.contains(e1);
                let is_trigger_2 = trigger_entities.contains(e2);
                let is_falling_1 = falling_entities.contains(e1);
                let is_falling_2 = falling_entities.contains(e2);

                if (is_trigger_1 && is_falling_2) || (is_trigger_2 && is_falling_1) {
                    info!("Ball exited trigger zone!");
                }
            }
        }
    }
}

/// System to orbit camera with keyboard input.
fn camera_orbit(
    time: Res<Time>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<(&mut Transform, &mut OrbitCamera)>,
) {
    let Ok((mut transform, mut orbit)) = query.single_mut() else {
        return;
    };

    let speed = 2.0 * time.delta_secs();

    // Yaw (horizontal rotation)
    if keyboard.pressed(KeyCode::KeyA) || keyboard.pressed(KeyCode::ArrowLeft) {
        orbit.yaw -= speed;
    }
    if keyboard.pressed(KeyCode::KeyD) || keyboard.pressed(KeyCode::ArrowRight) {
        orbit.yaw += speed;
    }

    // Pitch (vertical rotation)
    if keyboard.pressed(KeyCode::KeyW) || keyboard.pressed(KeyCode::ArrowUp) {
        orbit.pitch = (orbit.pitch + speed).min(1.4);
    }
    if keyboard.pressed(KeyCode::KeyS) || keyboard.pressed(KeyCode::ArrowDown) {
        orbit.pitch = (orbit.pitch - speed).max(0.1);
    }

    // Zoom
    if keyboard.pressed(KeyCode::KeyQ) {
        orbit.distance = (orbit.distance - speed * 5.0).max(5.0);
    }
    if keyboard.pressed(KeyCode::KeyE) {
        orbit.distance = (orbit.distance + speed * 5.0).min(50.0);
    }

    // Calculate new camera position
    let target = Vec3::new(0.0, 1.0, 0.0);
    let x = orbit.distance * orbit.pitch.cos() * orbit.yaw.sin();
    let y = orbit.distance * orbit.pitch.sin();
    let z = orbit.distance * orbit.pitch.cos() * orbit.yaw.cos();

    transform.translation = target + Vec3::new(x, y, z);
    transform.look_at(target, Vec3::Y);
}

/// System to spawn a new ball when space is pressed.
fn spawn_ball_on_space(
    mut commands: Commands,
    keyboard: Res<ButtonInput<KeyCode>>,
    ball_assets: Option<Res<BallAssets>>,
) {
    if !keyboard.just_pressed(KeyCode::Space) {
        return;
    }

    let Some(assets) = ball_assets else {
        return;
    };

    // Random-ish spawn position based on time
    let x = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .subsec_millis() as f32
        / 1000.0
        - 0.5)
        * 8.0;

    commands.spawn((
        FallingBody,
        Draggable,
        Mesh3d(assets.mesh.clone()),
        MeshMaterial3d(assets.material.clone()),
        Transform::from_xyz(x, 10.0, 0.0),
        RigidBody::Dynamic,
        Collider::ball(0.5),
        CollisionGroups::new(
            Group::from_bits(layers::AGENT).unwrap(),
            Group::from_bits(layers::GROUND | layers::OBSTACLE | layers::TRIGGER).unwrap(),
        ),
        ActiveEvents::COLLISION_EVENTS,
    ));

    info!("Spawned new ball at x={:.1}", x);
}

/// System to handle click-and-drag of physics objects.
fn drag_and_drop(
    mut drag_state: ResMut<DragState>,
    mouse_button: Res<ButtonInput<MouseButton>>,
    window_query: Query<&Window, With<PrimaryWindow>>,
    camera_query: Query<(&Camera, &GlobalTransform), With<Camera3d>>,
    rapier_context: ReadRapierContext,
    mut transforms: Query<&mut Transform, With<Draggable>>,
    draggable_query: Query<Entity, With<Draggable>>,
) {
    let Ok(window) = window_query.single() else {
        return;
    };
    let Ok((camera, camera_transform)) = camera_query.single() else {
        return;
    };
    let Ok(rapier) = rapier_context.single() else {
        return;
    };

    let Some(cursor_position) = window.cursor_position() else {
        return;
    };

    // Get ray from camera through cursor
    let Ok(ray) = camera.viewport_to_world(camera_transform, cursor_position) else {
        return;
    };

    // Handle mouse button press - start dragging
    if mouse_button.just_pressed(MouseButton::Left) {
        // Cast ray to find entity
        if let Some((entity, toi)) = rapier.cast_ray(
            ray.origin,
            ray.direction.into(),
            100.0,
            true,
            QueryFilter::default(),
        ) {
            // Check if this entity is draggable
            if draggable_query.get(entity).is_ok() {
                let hit_point = ray.origin + ray.direction * toi;
                drag_state.dragged_entity = Some(entity);
                drag_state.drag_height = hit_point.y.max(1.0); // Keep at least 1 unit above ground
                info!("Started dragging ball");
            }
        }
    }

    // Handle mouse button release - stop dragging
    if mouse_button.just_released(MouseButton::Left) {
        if drag_state.dragged_entity.is_some() {
            info!("Released ball");
        }
        drag_state.dragged_entity = None;
    }

    // While dragging, move the entity
    if let Some(entity) = drag_state.dragged_entity {
        if let Ok(mut transform) = transforms.get_mut(entity) {
            // Intersect ray with horizontal plane at drag_height
            // Plane equation: y = drag_height
            // Ray: P = origin + t * direction
            // Solve: origin.y + t * direction.y = drag_height
            let t = (drag_state.drag_height - ray.origin.y) / ray.direction.y;
            if t > 0.0 {
                let target = ray.origin + ray.direction * t;
                // Smoothly move toward target
                transform.translation.x = target.x;
                transform.translation.y = drag_state.drag_height;
                transform.translation.z = target.z;
            }
        }
    }
}
