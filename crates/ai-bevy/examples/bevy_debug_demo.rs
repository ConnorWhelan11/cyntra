//! Small Bevy demo wiring:
//! - `ai-bevy` (brain ticking + trace events + egui inspector)
//! - `ai-debug` (gizmos debug draw for navmesh + agents)
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example bevy_debug_demo --features trace-egui,bevy-demo`

use std::sync::Arc;

use ai_bevy::{
    AiAgent, AiBevyPlugin, AiNavMesh, AiPosition, AiTick, AiTraceEguiPlugin, BevyAgentId,
    BevyBrainRegistry,
};
use ai_core::{Action, ActionKey, ActionRuntime, Blackboard, Brain, Policy, TickContext};
use ai_nav::{MoveToAction, NavMesh, Vec2};
use ai_tools::TraceEvent;
use bevy::prelude::*;
use bevy::core_pipeline::core_3d::Camera3d;

use ai_debug::{AiBevyDebugDrawConfig, AiBevyDebugDrawEguiPlugin, AiBevyDebugDrawPlugin};

#[derive(Debug)]
struct TracedMoveToAction {
    goal_index: u64,
    started: bool,
    inner: MoveToAction,
}

impl TracedMoveToAction {
    fn new(goal_index: u64, goal: Vec2, speed: f32, arrival_distance: f32) -> Self {
        Self {
            goal_index,
            started: false,
            inner: MoveToAction::new(goal, speed, arrival_distance),
        }
    }
}

impl Action<ai_bevy::BevyAiWorld> for TracedMoveToAction {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: BevyAgentId,
        world: &mut ai_bevy::BevyAiWorld,
        blackboard: &mut Blackboard,
    ) -> ai_core::ActionStatus {
        if !self.started {
            self.started = true;
            ai_tools::emit(
                blackboard,
                TraceEvent::new(ctx.tick, "demo.action.start")
                    .with_a(agent.0)
                    .with_b(self.goal_index),
            );
        }

        let status = self.inner.tick(ctx, agent, world, blackboard);
        if let Some(outcome) = status.outcome() {
            ai_tools::emit(
                blackboard,
                TraceEvent::new(ctx.tick, "demo.action.finish")
                    .with_a(agent.0)
                    .with_b(outcome as u64),
            );
        }
        status
    }

    fn cancel(
        &mut self,
        ctx: &TickContext,
        agent: BevyAgentId,
        _world: &mut ai_bevy::BevyAiWorld,
        blackboard: &mut Blackboard,
    ) {
        ai_tools::emit(
            blackboard,
            TraceEvent::new(ctx.tick, "demo.action.cancel")
                .with_a(agent.0)
                .with_b(self.goal_index),
        );
    }
}

struct SwitchingMovePolicy {
    key: ActionKey,
    goals: [Vec2; 2],
    speed: f32,
    arrival_distance: f32,
    switch_every_ticks: u64,
    last_goal_index: Option<u64>,
}

impl Policy<ai_bevy::BevyAiWorld> for SwitchingMovePolicy {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: BevyAgentId,
        _world: &mut ai_bevy::BevyAiWorld,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<ai_bevy::BevyAiWorld>,
    ) {
        let phase = agent.0 % 2;
        let goal_index = ((ctx.tick / self.switch_every_ticks) + phase) % 2;

        ai_tools::emit(
            blackboard,
            TraceEvent::new(ctx.tick, "demo.policy.tick")
                .with_a(agent.0)
                .with_b(goal_index),
        );

        let goal = self.goals[goal_index as usize];
        let speed = self.speed;
        let arrival = self.arrival_distance;
        let make = move |_ctx: &TickContext,
                         _agent: BevyAgentId,
                         _world: &mut ai_bevy::BevyAiWorld,
                         _bb: &mut Blackboard| {
            Box::new(TracedMoveToAction::new(goal_index, goal, speed, arrival))
                as Box<dyn Action<ai_bevy::BevyAiWorld>>
        };

        if self.last_goal_index == Some(goal_index) {
            actions.ensure_current(self.key, make, ctx, agent, _world, blackboard);
        } else {
            actions.replace_current_with(self.key, make, ctx, agent, _world, blackboard);
            self.last_goal_index = Some(goal_index);
        }
    }
}

fn setup(
    mut commands: Commands,
    mut registry: NonSendMut<BevyBrainRegistry>,
) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(2.0, 10.0, 10.0).looking_at(Vec3::new(2.0, 0.0, 2.0), Vec3::Y),
    ));

    let mesh = NavMesh::from_triangles(vec![
        // L-shaped walkable region:
        // - bottom bar: y in [0, 1], x in [0, 4]
        // - right bar: x in [3, 4], y in [1, 4]
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(3.0, 1.0),
        ],
        [
            Vec2::new(0.0, 0.0),
            Vec2::new(3.0, 1.0),
            Vec2::new(0.0, 1.0),
        ],
        [
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 4.0),
            Vec2::new(3.0, 4.0),
        ],
        [
            Vec2::new(4.0, 0.0),
            Vec2::new(3.0, 4.0),
            Vec2::new(3.0, 1.0),
        ],
    ]);
    commands.insert_resource(AiNavMesh(Arc::new(mesh)));

    commands.insert_resource(AiBevyDebugDrawConfig {
        draw_corridor_query: true,
        corridor_query_start: Vec2::new(0.2, 0.2),
        corridor_query_goal: Vec2::new(3.8, 3.8),
        ..AiBevyDebugDrawConfig::default()
    });

    // Fixed dt so the demo is stable even with variable frame rate.
    commands.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 0.1,
        seed: 0,
    });

    let goals = [Vec2::new(3.8, 3.8), Vec2::new(0.2, 0.2)];

    for i in 0..3u64 {
        let agent = BevyAgentId(i + 1);
        commands.spawn((
            AiAgent(agent),
            AiPosition(Vec2::new(1.0 + (i as f32) * 0.4, 1.0)),
        ));

        registry.insert(Brain::new(
            agent,
            Box::new(SwitchingMovePolicy {
                key: ActionKey("move"),
                goals,
                speed: 2.0,
                arrival_distance: 0.05,
                switch_every_ticks: 30,
                last_goal_index: None,
            }),
        ));
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(AiBevyPlugin::default())
        .add_plugins(AiTraceEguiPlugin::default())
        .add_plugins(AiBevyDebugDrawEguiPlugin::default())
        .add_plugins(AiBevyDebugDrawPlugin::default())
        .add_systems(Startup, setup)
        .run();
}
