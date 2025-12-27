use ai_core::{
    Action, ActionFactory, ActionKey, ActionRuntime, Blackboard, Policy, TickContext, WorldMut,
    WorldView,
};
use ai_goap::{GoapAction, GoapPlanPolicy, GoapPlanner, GoapState};

const GOAL: GoapState = 1 << 0;

#[derive(Default)]
struct FailWorld {
    state: GoapState,
}

impl WorldView for FailWorld {
    type Agent = u64;
}

impl WorldMut for FailWorld {}

#[derive(Debug, Clone)]
struct FailSpec;

#[derive(Debug, Clone, Copy)]
struct FailFactory;

#[derive(Debug)]
struct AlwaysFailAction;

impl Action<FailWorld> for AlwaysFailAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        _world: &mut FailWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ai_core::ActionStatus {
        ai_core::ActionStatus::Failure
    }
}

impl ActionFactory<FailWorld> for FailFactory {
    type Spec = FailSpec;

    fn build(
        &self,
        _spec: &Self::Spec,
        _ctx: &TickContext,
        _agent: u64,
        _world: &FailWorld,
        _blackboard: &ai_core::Blackboard,
    ) -> Box<dyn Action<FailWorld>> {
        Box::new(AlwaysFailAction)
    }
}

fn planner() -> GoapPlanner<FailSpec> {
    GoapPlanner::new(vec![GoapAction {
        name: "fail",
        cost: 1,
        preconditions: 0,
        add: GOAL,
        remove: 0,
        spec: FailSpec,
    }])
}

#[test]
fn policy_replans_after_failure_instead_of_reusing_cached_plan() {
    let agent = 1u64;
    let key = ActionKey("goap_plan");

    let mut policy = GoapPlanPolicy::new(
        planner(),
        FailFactory,
        |_ctx, _agent, world, _bb| world.state,
        |_ctx, _agent, _world, _bb| GOAL,
    )
    .with_key(key);

    let mut world = FailWorld::default();
    let mut blackboard = Blackboard::new();
    let mut actions: ActionRuntime<FailWorld> = ActionRuntime::default();

    // Tick 0: policy plans once and runs the plan, which fails immediately.
    let ctx0 = TickContext {
        tick: 0,
        dt_seconds: 0.1,
        seed: 123,
    };
    actions.begin_policy_tick();
    policy.tick(&ctx0, agent, &mut world, &mut blackboard, &mut actions);
    actions.preempt_unrequested(&ctx0, agent, &mut world, &mut blackboard);
    let _ = actions.tick(&ctx0, agent, &mut world, &mut blackboard);
    assert_eq!(policy.plan_calls(), 1);

    // Tick 1: the plan failure should clear the cache so we call the planner again.
    let ctx1 = TickContext {
        tick: 1,
        dt_seconds: 0.1,
        seed: 123,
    };
    actions.begin_policy_tick();
    policy.tick(&ctx1, agent, &mut world, &mut blackboard, &mut actions);
    assert_eq!(policy.plan_calls(), 2);
    assert_eq!(actions.current_key(), Some(key));
}
