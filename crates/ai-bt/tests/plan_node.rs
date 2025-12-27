use ai_bt::{BtPolicy, Condition, PlanNode, ReactiveSequence};
use ai_core::{Action, ActionFactory, ActionKey, ActionStatus, Blackboard, Brain, TickContext, WorldMut, WorldView};
use ai_tools::{TraceEvent, TraceLog, TRACE_LOG};

const HAS_MONEY: u64 = 1 << 0;
const AT_STORE: u64 = 1 << 1;
const AT_SHED: u64 = 1 << 2;
const HAS_TOOL: u64 = 1 << 3;

#[derive(Default)]
struct ToyWorld {
    state: u64,
    allow_plan: bool,
    log: Vec<&'static str>,
    canceled: Vec<&'static str>,
}

impl WorldView for ToyWorld {
    type Agent = u64;
}

impl WorldMut for ToyWorld {}

#[derive(Debug, Clone)]
enum Spec {
    TravelStore,
    TravelShed,
    BuyTool,
    PickupTool,
}

#[derive(Debug)]
struct TravelAction {
    name: &'static str,
    remaining: u32,
    add: u64,
    remove: u64,
}

impl TravelAction {
    fn new(name: &'static str, remaining: u32, add: u64, remove: u64) -> Self {
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

impl ActionFactory<ToyWorld> for ToyFactory {
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
            // Slow enough to still be running when we trigger abort/replan.
            Spec::TravelStore => Box::new(TravelAction::new("travel_store", 10, AT_STORE, AT_SHED)),
            Spec::TravelShed => Box::new(TravelAction::new("travel_shed", 1, AT_SHED, AT_STORE)),
            Spec::BuyTool => Box::new(BuyToolAction),
            Spec::PickupTool => Box::new(PickupToolAction),
        }
    }
}

fn allow_plan_guard(_ctx: &TickContext, _agent: u64, world: &ToyWorld, _bb: &Blackboard) -> bool {
    world.allow_plan
}

fn money_signature(_ctx: &TickContext, _agent: u64, world: &ToyWorld, _bb: &Blackboard) -> u64 {
    (world.state & HAS_MONEY) as u64
}

fn plan_for_world(
    _ctx: &TickContext,
    _agent: u64,
    world: &ToyWorld,
    _bb: &Blackboard,
) -> Option<ai_core::PlanSpec<Spec>> {
    if (world.state & HAS_MONEY) == HAS_MONEY {
        Some(ai_core::PlanSpec::new(vec![Spec::TravelStore, Spec::BuyTool]))
    } else {
        Some(ai_core::PlanSpec::new(vec![Spec::TravelShed, Spec::PickupTool]))
    }
}

fn run_scenario(seed: u64) -> (Vec<&'static str>, Vec<&'static str>, u64, Vec<TraceEvent>) {
    let agent = 1u64;

    let guard = Condition::new(allow_plan_guard);
    let plan = PlanNode::new(ActionKey("plan"), ToyFactory, plan_for_world)
        .with_signature(money_signature);

    let root = ReactiveSequence::new(vec![Box::new(guard), Box::new(plan)]);
    let policy = Box::new(BtPolicy::new(Box::new(root)));
    let mut brain = Brain::new(agent, policy);
    brain.blackboard.set(TRACE_LOG, TraceLog::default());

    let mut world = ToyWorld::default();
    world.state = HAS_MONEY;
    world.allow_plan = true;

    let mut saw_done = false;
    for tick in 0..20u64 {
        if tick == 1 {
            // Abort mid-plan (preemption should cancel the running plan step).
            world.allow_plan = false;
        }
        if tick == 2 {
            // Resume and restart the (cached) plan.
            world.allow_plan = true;
        }
        if tick == 3 {
            // Invalidate while the plan is running; the node should replace/restart the plan.
            world.state &= !HAS_MONEY;
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
fn reactive_sequence_guard_abort_and_invalidation_replan_are_deterministic() {
    let (log_a, canceled_a, state_a, events_a) = run_scenario(123);
    let (log_b, canceled_b, state_b, events_b) = run_scenario(123);

    assert_eq!(state_a & HAS_TOOL, HAS_TOOL);
    assert_eq!(state_b & HAS_TOOL, HAS_TOOL);

    // Deterministic logs.
    assert_eq!(log_a, log_b);
    assert_eq!(canceled_a, canceled_b);
    assert_eq!(events_a, events_b);

    // Abort cancels the slow travel step, then invalidation cancels it again via replace/restart.
    assert_eq!(canceled_a, vec!["travel_store", "travel_store"]);

    // After money is removed, the replanned sequence must head to the shed.
    assert!(log_a.iter().any(|e| *e == "travel_shed"));

    // Trace events are stable and include invalidation + restart.
    assert!(events_a.iter().any(|e| e.tag == "bt.plan.call"));
    assert!(events_a.iter().any(|e| e.tag == "bt.plan.start"));
    assert!(events_a.iter().any(|e| e.tag == "bt.plan.invalidated"));
    assert!(events_a.iter().any(|e| e.tag == "bt.plan.restart"));
    assert!(events_a.iter().any(|e| e.tag == "bt.plan.outcome.success"));
}
