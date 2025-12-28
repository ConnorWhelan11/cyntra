#![cfg(feature = "trace-inspector")]

use ai_bevy::{
    AiAgent, AiBevyPlugin, AiPosition, AiTick, AiTraceBuffer, AiTraceInspectorPlugin, BevyAgentId,
    BevyBrainRegistry,
};
use ai_core::{ActionRuntime, Blackboard, Brain, Policy, TickContext};
use ai_nav::Vec2;
use bevy_app::App;

struct TracePolicy;

impl Policy<ai_bevy::BevyAiWorld> for TracePolicy {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: BevyAgentId,
        _world: &mut ai_bevy::BevyAiWorld,
        blackboard: &mut Blackboard,
        _actions: &mut ActionRuntime<ai_bevy::BevyAiWorld>,
    ) {
        ai_tools::emit(
            blackboard,
            ai_tools::TraceEvent::new(ctx.tick, "tick").with_a(agent.0),
        );
    }
}

#[test]
fn trace_inspector_collects_ai_trace_events() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());
    app.add_plugins(AiTraceInspectorPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0,
        seed: 0,
    });

    let agent = BevyAgentId(7);
    app.world_mut()
        .spawn((AiAgent(agent), AiPosition(Vec2::new(1.0, 2.0))));

    {
        let mut registry = app
            .world_mut()
            .get_non_send_resource_mut::<BevyBrainRegistry>()
            .expect("registry inserted by plugin");
        registry.insert(Brain::new(agent, Box::new(TracePolicy)));
    }

    app.update();

    let buffer = app.world().resource::<AiTraceBuffer>();
    assert_eq!(buffer.events.len(), 1);
    assert_eq!(buffer.events[0].agent, agent);
    assert_eq!(buffer.events[0].event.tick, 0);
}

