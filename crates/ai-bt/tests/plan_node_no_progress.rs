use std::cell::Cell;
use std::rc::Rc;

use ai_bt::{BtNode, BtPolicy, BtStatus, PlanNode, PlanNodeConfig};
use ai_core::{
    Action, ActionFactory, ActionKey, ActionStatus, Blackboard, Brain, PlanSpec, TickContext,
    WorldMut, WorldView,
};

#[derive(Default)]
struct World {
    done: bool,
    action_runs: u32,
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
    set_done_after: u32,
}

impl Action<World> for StepAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut World,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.action_runs = world.action_runs.saturating_add(1);
        if world.action_runs >= self.set_done_after {
            world.done = true;
        }
        ActionStatus::Success
    }
}

#[derive(Debug, Clone)]
struct Factory {
    set_done_after: u32,
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
                set_done_after: self.set_done_after,
            }),
        }
    }
}

struct FailureIsRunning<W>
where
    W: WorldMut + 'static,
{
    child: Box<dyn BtNode<W>>,
}

impl<W> FailureIsRunning<W>
where
    W: WorldMut + 'static,
{
    fn new(child: Box<dyn BtNode<W>>) -> Self {
        Self { child }
    }
}

impl<W> BtNode<W> for FailureIsRunning<W>
where
    W: WorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ai_core::ActionRuntime<W>,
    ) -> BtStatus {
        match self.child.tick(ctx, agent, world, blackboard, actions) {
            BtStatus::Failure => BtStatus::Running,
            other => other,
        }
    }

    fn reset(&mut self) {
        self.child.reset();
    }
}

#[test]
fn plan_node_replans_on_success_without_done_and_busts_cache() {
    let agent = 1u64;

    let plan_calls = Rc::new(Cell::new(0u32));
    let plan_calls_view = plan_calls.clone();

    let plan = PlanNode::new(ActionKey("plan"), Factory { set_done_after: 2 }, move |_, _, _, _| {
        plan_calls_view.set(plan_calls_view.get() + 1);
        Some(PlanSpec::new(vec![Spec::Step]))
    })
    // Enable caching on a stable key, so the only way `plan_fn` is called again is if the node
    // explicitly clears the cache (no-progress guard).
    .with_signature(|_, _, _, _| 0)
    .with_done(|_, _, world, _| world.done);

    let policy = Box::new(BtPolicy::new(Box::new(plan)));
    let mut brain = Brain::new(agent, policy);

    let mut world = World::default();

    for tick in 0..4u64 {
        brain.tick(
            &TickContext {
                tick,
                dt_seconds: 0.1,
                seed: 0,
            },
            &mut world,
        );
    }

    assert!(world.done);
    assert_eq!(world.action_runs, 2);
    assert_eq!(plan_calls.get(), 2);
}

#[test]
fn plan_node_no_progress_budget_stops_restart_loop() {
    let agent = 1u64;

    let plan_calls = Rc::new(Cell::new(0u32));
    let plan_calls_view = plan_calls.clone();

    let plan = PlanNode::new(ActionKey("plan"), Factory { set_done_after: u32::MAX }, move |_, _, _, _| {
        plan_calls_view.set(plan_calls_view.get() + 1);
        Some(PlanSpec::new(vec![Spec::Step]))
    })
    .with_config(PlanNodeConfig {
        min_replan_interval_ticks: 0,
        max_plan_starts_per_key: Some(2),
    })
    .with_signature(|_, _, _, _| 0)
    .with_done(|_, _, world, _| world.done);

    // Keep the BT "Running" even if the plan gives up, so the node isn't reset and we can observe
    // that it stops restarting after the budget is exhausted.
    let root = FailureIsRunning::new(Box::new(plan));
    let policy = Box::new(BtPolicy::new(Box::new(root)));
    let mut brain = Brain::new(agent, policy);

    let mut world = World::default();

    for tick in 0..20u64 {
        brain.tick(
            &TickContext {
                tick,
                dt_seconds: 0.1,
                seed: 0,
            },
            &mut world,
        );
    }

    assert!(!world.done);
    assert_eq!(world.action_runs, 2);
    assert_eq!(plan_calls.get(), 2);
}

