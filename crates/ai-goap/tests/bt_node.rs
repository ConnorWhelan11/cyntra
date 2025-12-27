#![cfg(feature = "bt")]

use ai_bt::{BtPolicy, Condition, ReactiveSequence};
use ai_core::{
    Action, ActionKey, ActionStatus, Blackboard, Brain, TickContext, WorldMut, WorldView,
};
use ai_goap::{GoapAction, GoapPlanNode, GoapPlanner, GoapState};
use ai_tools::{TraceEvent, TraceLog, TRACE_LOG};

const HAS_MONEY: GoapState = 1 << 0;
const AT_STORE: GoapState = 1 << 1;
const AT_SHED: GoapState = 1 << 2;
const HAS_TOOL: GoapState = 1 << 3;

#[derive(Default)]
struct ToyWorld {
    state: GoapState,
    log: Vec<&'static str>,
    canceled: Vec<&'static str>,
    allow_plan: bool,
}

impl WorldView for ToyWorld {
    type Agent = u64;
}

impl WorldMut for ToyWorld {}

#[derive(Debug, Clone)]
enum Spec {
    TravelToStore,
    TravelToShed,
    BuyTool,
    PickupTool,
}

#[derive(Debug)]
struct TravelAction {
    name: &'static str,
    remaining: u32,
    add: GoapState,
    remove: GoapState,
}

impl TravelAction {
    fn new(name: &'static str, remaining: u32, add: GoapState, remove: GoapState) -> Self {
        Self {
            name,
            remaining,
            add,
            remove,
        }
    }
}

impl Action<ToyWorld> for TravelAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut ToyWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push(self.name);
        if self.remaining == 0 {
            world.state = (world.state | self.add) & !self.remove;
            return ActionStatus::Success;
        }
        self.remaining -= 1;
        ActionStatus::Running
    }

    fn cancel(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut ToyWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) {
        world.canceled.push(self.name);
    }
}

#[derive(Debug)]
struct BuyToolAction;

impl Action<ToyWorld> for BuyToolAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut ToyWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push("buy_tool");
        let ok = (world.state & (HAS_MONEY | AT_STORE)) == (HAS_MONEY | AT_STORE);
        if !ok {
            return ActionStatus::Failure;
        }
        world.state |= HAS_TOOL;
        ActionStatus::Success
    }
}

#[derive(Debug)]
struct PickupToolAction;

impl Action<ToyWorld> for PickupToolAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut ToyWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push("pickup_tool");
        let ok = (world.state & AT_SHED) == AT_SHED;
        if !ok {
            return ActionStatus::Failure;
        }
        world.state |= HAS_TOOL;
        ActionStatus::Success
    }
}

#[derive(Debug, Clone, Copy)]
struct ToyFactory;

impl ai_core::ActionFactory<ToyWorld> for ToyFactory {
    type Spec = Spec;

    fn build(
        &self,
        spec: &Self::Spec,
        _ctx: &TickContext,
        _agent: u64,
        _world: &ToyWorld,
        _blackboard: &ai_core::Blackboard,
    ) -> Box<dyn Action<ToyWorld>> {
        match spec {
            Spec::TravelToStore => Box::new(TravelAction::new("travel_store", 3, AT_STORE, AT_SHED)),
            Spec::TravelToShed => Box::new(TravelAction::new("travel_shed", 1, AT_SHED, AT_STORE)),
            Spec::BuyTool => Box::new(BuyToolAction),
            Spec::PickupTool => Box::new(PickupToolAction),
        }
    }
}

fn planner() -> GoapPlanner<Spec> {
    GoapPlanner::new(vec![
        GoapAction {
            name: "travel_store",
            cost: 1,
            preconditions: 0,
            add: AT_STORE,
            remove: AT_SHED,
            spec: Spec::TravelToStore,
        },
        GoapAction {
            name: "travel_shed",
            cost: 1,
            preconditions: 0,
            add: AT_SHED,
            remove: AT_STORE,
            spec: Spec::TravelToShed,
        },
        GoapAction {
            name: "buy_tool",
            cost: 1,
            preconditions: HAS_MONEY | AT_STORE,
            add: HAS_TOOL,
            remove: 0,
            spec: Spec::BuyTool,
        },
        GoapAction {
            name: "pickup_tool",
            cost: 1,
            preconditions: AT_SHED,
            add: HAS_TOOL,
            remove: 0,
            spec: Spec::PickupTool,
        },
    ])
}

fn allow_plan_guard(_ctx: &TickContext, _agent: u64, world: &ToyWorld, _bb: &Blackboard) -> bool {
    world.allow_plan
}

fn run_scenario(seed: u64) -> (Vec<&'static str>, Vec<&'static str>, GoapState, Vec<TraceEvent>) {
    let agent = 1u64;

    let guard = Condition::new(allow_plan_guard);
    let goap = GoapPlanNode::new(
        planner(),
        ToyFactory,
        |_ctx, _agent, world, _bb| world.state,
        |_ctx, _agent, _world, _bb| HAS_TOOL,
    )
    .with_key(ActionKey("goap_plan"))
    .with_signature(|_ctx, _agent, world, _bb| (world.state & HAS_MONEY) as u64);

    let root = ReactiveSequence::new(vec![Box::new(guard), Box::new(goap)]);
    let policy = Box::new(BtPolicy::new(Box::new(root)));
    let mut brain = Brain::new(agent, policy);
    brain.blackboard.set(TRACE_LOG, TraceLog::default());
    let mut world = ToyWorld::default();
    world.state = HAS_MONEY;
    world.allow_plan = true;

    let mut saw_done = false;
    for tick in 0..10u64 {
        if tick == 1 {
            // Abort mid-plan.
            world.allow_plan = false;
        }
        if tick == 2 {
            // World changes while plan is aborted -> should replan on resume.
            world.state &= !HAS_MONEY;
            world.allow_plan = true;
        }

        brain.tick(
            &TickContext {
                tick,
                dt_seconds: 0.1,
                seed,
            },
            &mut world,
        );

        if (world.state & HAS_TOOL) == HAS_TOOL {
            if saw_done {
                break;
            }
            // One extra tick to observe `take_just_finished`-driven trace events.
            saw_done = true;
        }
    }

    let events = brain.blackboard.get(TRACE_LOG).unwrap().events.clone();

    (world.log, world.canceled, world.state, events)
}

#[test]
fn bt_guard_abort_forces_replan_with_cancel_and_is_deterministic() {
    let (log_a, canceled_a, state_a, events_a) = run_scenario(123);
    let (log_b, canceled_b, state_b, events_b) = run_scenario(123);

    assert_eq!(state_a & HAS_TOOL, HAS_TOOL);
    assert_eq!(state_b & HAS_TOOL, HAS_TOOL);
    assert_eq!(log_a, log_b);
    assert_eq!(canceled_a, canceled_b);
    assert_eq!(events_a, events_b);

    // Aborted store travel must be canceled.
    assert!(canceled_a.contains(&"travel_store"));

    // After money is removed, the resumed plan should head to the shed.
    assert!(log_a.iter().any(|e| *e == "travel_shed"));

    // Trace events are stable and include plan calls + outcome/done.
    assert!(events_a.iter().any(|e| e.tag == "goap.plan.call"));
    assert!(events_a.iter().any(|e| e.tag == "goap.plan.start"));
    assert_eq!(
        events_a.iter().filter(|e| e.tag == "goap.plan.call").count(),
        2
    );
    assert!(events_a.iter().any(|e| e.tag == "goap.plan.outcome.success"));
    assert!(events_a.iter().any(|e| e.tag == "goap.done"));
}
