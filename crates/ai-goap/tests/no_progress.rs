use ai_core::{
    Action, ActionFactory, ActionKey, ActionRuntime, ActionStatus, Blackboard, Policy, TickContext,
    WorldMut, WorldView,
};
use ai_goap::{GoapAction, GoapPlanPolicy, GoapPlanPolicyConfig, GoapPlanner, GoapState};

const GOAL: GoapState = 1 << 0;

#[derive(Default)]
struct World {
    state: GoapState,
    attempts: u32,
}

impl WorldView for World {
    type Agent = u64;
}

impl WorldMut for World {}

#[derive(Debug, Clone)]
enum Spec {
    Step,
}

#[derive(Debug)]
struct StepAction {
    set_goal_after: Option<u32>,
}

impl Action<World> for StepAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut World,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.attempts = world.attempts.saturating_add(1);
        if let Some(after) = self.set_goal_after {
            if world.attempts >= after {
                world.state |= GOAL;
            }
        }
        ActionStatus::Success
    }
}

#[derive(Debug, Clone, Copy)]
struct Factory {
    set_goal_after: Option<u32>,
}

impl ActionFactory<World> for Factory {
    type Spec = Spec;

    fn build(
        &self,
        spec: &Self::Spec,
        _ctx: &TickContext,
        _agent: u64,
        _world: &World,
        _blackboard: &Blackboard,
    ) -> Box<dyn Action<World>> {
        match spec {
            Spec::Step => Box::new(StepAction {
                set_goal_after: self.set_goal_after,
            }),
        }
    }
}

fn planner() -> GoapPlanner<Spec> {
    GoapPlanner::new(vec![GoapAction {
        name: "step",
        cost: 1,
        preconditions: 0,
        add: GOAL,
        remove: 0,
        spec: Spec::Step,
    }])
}

#[test]
fn policy_replans_when_plan_succeeds_but_goal_is_unmet() {
    let agent = 1u64;
    let mut policy = GoapPlanPolicy::new(
        planner(),
        Factory {
            set_goal_after: Some(2),
        },
        |_ctx, _agent, world, _bb| world.state,
        |_ctx, _agent, _world, _bb| GOAL,
    )
    .with_key(ActionKey("goap_plan"));

    let mut world = World::default();
    let mut blackboard = Blackboard::new();
    let mut actions = ActionRuntime::<World>::default();

    for tick in 0..3u64 {
        let ctx = TickContext {
            tick,
            dt_seconds: 0.1,
            seed: 0,
        };
        actions.begin_policy_tick();
        Policy::tick(&mut policy, &ctx, agent, &mut world, &mut blackboard, &mut actions);
        actions.preempt_unrequested(&ctx, agent, &mut world, &mut blackboard);
        let _ = actions.tick(&ctx, agent, &mut world, &mut blackboard);
    }

    assert_eq!(world.state & GOAL, GOAL);
    assert_eq!(world.attempts, 2);
    assert_eq!(policy.plan_calls(), 2);
}

#[test]
fn policy_no_progress_budget_stops_success_loop() {
    let agent = 1u64;
    let mut policy = GoapPlanPolicy::new(
        planner(),
        Factory { set_goal_after: None },
        |_ctx, _agent, world, _bb| world.state,
        |_ctx, _agent, _world, _bb| GOAL,
    )
    .with_key(ActionKey("goap_plan"))
    .with_config(GoapPlanPolicyConfig {
        min_replan_interval_ticks: 0,
        max_plan_starts_per_key: Some(2),
    });

    let mut world = World::default();
    let mut blackboard = Blackboard::new();
    let mut actions = ActionRuntime::<World>::default();

    for tick in 0..10u64 {
        let ctx = TickContext {
            tick,
            dt_seconds: 0.1,
            seed: 0,
        };
        actions.begin_policy_tick();
        Policy::tick(&mut policy, &ctx, agent, &mut world, &mut blackboard, &mut actions);
        actions.preempt_unrequested(&ctx, agent, &mut world, &mut blackboard);
        let _ = actions.tick(&ctx, agent, &mut world, &mut blackboard);
    }

    assert_eq!(world.state & GOAL, 0);
    assert_eq!(world.attempts, 2);
    assert_eq!(policy.plan_calls(), 2);
}

