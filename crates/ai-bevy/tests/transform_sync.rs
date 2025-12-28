#![cfg(feature = "transform-sync")]

use std::sync::Arc;

use ai_bevy::{
    AiAgent, AiBevyPlugin, AiNavMesh, AiTick, AiTransformPlane, AiTransformSyncConfig, BevyAgentId,
    BevyBrainRegistry,
};
use ai_core::{ActionKey, Blackboard, Policy, TickContext};
use ai_nav::{MoveToAction, NavMesh, Vec2};
use bevy_app::App;
use bevy_transform::components::Transform;

struct MoveToPolicy {
    key: ActionKey,
    goal: Vec2,
    speed: f32,
    arrival_distance: f32,
}

impl Policy<ai_bevy::BevyAiWorld> for MoveToPolicy {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: BevyAgentId,
        world: &mut ai_bevy::BevyAiWorld,
        _blackboard: &mut Blackboard,
        actions: &mut ai_core::ActionRuntime<ai_bevy::BevyAiWorld>,
    ) {
        let goal = self.goal;
        let speed = self.speed;
        let arrival = self.arrival_distance;
        actions.ensure_current(
            self.key,
            |_ctx, _agent, _world, _bb| Box::new(MoveToAction::new(goal, speed, arrival)),
            ctx,
            agent,
            world,
            _blackboard,
        );
    }
}

fn unit_square_mesh() -> NavMesh {
    NavMesh::from_triangles(vec![
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(10.0, 10.0),
        ],
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 10.0),
            Vec2::new(0.0, 10.0),
        ],
    ])
}

#[test]
fn bevy_adapter_can_read_and_write_transform_positions_xz() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0,
        seed: 0,
    });

    app.insert_resource(AiTransformSyncConfig {
        plane: AiTransformPlane::Xz,
        height: 0.25,
        read_from_transform: true,
        write_to_transform: true,
    });

    app.insert_resource(AiNavMesh(Arc::new(unit_square_mesh())));

    let agent = BevyAgentId(7);
    let entity = app
        .world_mut()
        .spawn((AiAgent(agent), Transform::from_xyz(1.0, 0.25, 1.0)))
        .id();

    {
        let mut registry = app
            .world_mut()
            .get_non_send_resource_mut::<BevyBrainRegistry>()
            .expect("registry inserted by plugin");
        let policy = MoveToPolicy {
            key: ActionKey("move"),
            goal: Vec2::new(9.0, 1.0),
            speed: 1.0,
            arrival_distance: 0.01,
        };
        registry.insert(ai_core::Brain::new(agent, Box::new(policy)));
    }

    let start_x = app.world().get::<Transform>(entity).unwrap().translation.x;
    for _ in 0..5 {
        app.update();
    }
    let end = app.world().get::<Transform>(entity).unwrap().translation;

    assert!(end.x > start_x, "expected movement: {start_x} -> {}", end.x);
    assert!(
        (end.y - 0.25).abs() < 1e-6,
        "expected height to be applied: {}",
        end.y
    );
}

#[test]
fn bevy_adapter_can_read_and_write_transform_positions_xy() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0,
        seed: 0,
    });

    app.insert_resource(AiTransformSyncConfig {
        plane: AiTransformPlane::Xy,
        height: 42.0,
        read_from_transform: true,
        write_to_transform: true,
    });

    app.insert_resource(AiNavMesh(Arc::new(unit_square_mesh())));

    let agent = BevyAgentId(7);
    let entity = app
        .world_mut()
        .spawn((AiAgent(agent), Transform::from_xyz(1.0, 1.0, -3.0)))
        .id();

    {
        let mut registry = app
            .world_mut()
            .get_non_send_resource_mut::<BevyBrainRegistry>()
            .expect("registry inserted by plugin");
        let policy = MoveToPolicy {
            key: ActionKey("move"),
            goal: Vec2::new(9.0, 1.0),
            speed: 1.0,
            arrival_distance: 0.01,
        };
        registry.insert(ai_core::Brain::new(agent, Box::new(policy)));
    }

    let start_x = app.world().get::<Transform>(entity).unwrap().translation.x;
    for _ in 0..5 {
        app.update();
    }
    let end = app.world().get::<Transform>(entity).unwrap().translation;

    assert!(end.x > start_x, "expected movement: {start_x} -> {}", end.x);
    assert!(
        (end.z - 42.0).abs() < 1e-6,
        "expected height to be applied: {}",
        end.z
    );
}

