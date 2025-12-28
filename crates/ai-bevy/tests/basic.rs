use std::sync::Arc;

use ai_bevy::{AiAgent, AiBevyPlugin, AiNavMesh, AiPosition, AiTick, BevyAgentId, BevyBrainRegistry};
use ai_core::{ActionKey, Blackboard, Policy, TickContext};
use ai_nav::{MoveToAction, NavMesh, Vec2};
use bevy_app::App;

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

#[test]
fn bevy_adapter_ticks_brains_and_writes_positions() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0,
        seed: 0,
    });

    let mesh = NavMesh::from_triangles(vec![
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
    ]);
    app.insert_resource(AiNavMesh(Arc::new(mesh)));

    let agent = BevyAgentId(7);
    let entity = app
        .world_mut()
        .spawn((
            AiAgent(agent),
            AiPosition(Vec2::new(1.0, 1.0)),
        ))
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

    let start = app.world().get::<AiPosition>(entity).unwrap().0;
    for _ in 0..5 {
        app.update();
    }
    let end = app.world().get::<AiPosition>(entity).unwrap().0;

    assert!(end.x > start.x, "expected movement: {start:?} -> {end:?}");
}

