use ai_core::{
    Action, ActionFactory, ActionKey, ActionRuntime, ActionStatus, Blackboard, Policy, TickContext,
    WorldMut, WorldView,
};
use ai_htn::{CompoundTask, HtnDomain, HtnPlanPolicy, HtnPlanner, Method, Operator, OperatorId, Task};
use ai_tools::{TraceEvent, TraceLog, TRACE_LOG};

const HAS_MONEY: u64 = 1 << 0;
const AT_STORE: u64 = 1 << 1;
const AT_SHED: u64 = 1 << 2;
const HAS_TOOL: u64 = 1 << 3;

#[derive(Default)]
struct ToyWorld {
    state: u64,
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
        _blackboard: &Blackboard,
    ) -> Box<dyn Action<ToyWorld>> {
        match spec {
            // Slow enough to still be running when we trigger replanning.
            Spec::TravelStore => Box::new(TravelAction::new("travel_store", 10, AT_STORE, AT_SHED)),
            Spec::TravelShed => Box::new(TravelAction::new("travel_shed", 1, AT_SHED, AT_STORE)),
            Spec::BuyTool => Box::new(BuyToolAction),
            Spec::PickupTool => Box::new(PickupToolAction),
        }
    }
}

const GET_TOOL: CompoundTask = CompoundTask("get_tool");
const OP_TRAVEL_STORE: OperatorId = OperatorId("travel_store");
const OP_TRAVEL_SHED: OperatorId = OperatorId("travel_shed");
const OP_BUY_TOOL: OperatorId = OperatorId("buy_tool");
const OP_PICKUP_TOOL: OperatorId = OperatorId("pickup_tool");

fn planner() -> HtnPlanner<Spec, u64> {
    fn always(_s: &u64) -> bool {
        true
    }
    fn has_money(s: &u64) -> bool {
        (*s & HAS_MONEY) == HAS_MONEY
    }
    fn at_store_with_money(s: &u64) -> bool {
        (*s & (HAS_MONEY | AT_STORE)) == (HAS_MONEY | AT_STORE)
    }
    fn at_shed(s: &u64) -> bool {
        (*s & AT_SHED) == AT_SHED
    }

    fn apply_travel_store(s: &mut u64) {
        *s = (*s | AT_STORE) & !AT_SHED;
    }
    fn apply_travel_shed(s: &mut u64) {
        *s = (*s | AT_SHED) & !AT_STORE;
    }
    fn apply_buy_tool(s: &mut u64) {
        *s |= HAS_TOOL;
    }
    fn apply_pickup_tool(s: &mut u64) {
        *s |= HAS_TOOL;
    }

    let mut d = HtnDomain::new();
    d.add_operator(
        OP_TRAVEL_STORE,
        Operator {
            name: "travel_store",
            spec: Spec::TravelStore,
            is_applicable: always,
            apply: apply_travel_store,
        },
    );
    d.add_operator(
        OP_TRAVEL_SHED,
        Operator {
            name: "travel_shed",
            spec: Spec::TravelShed,
            is_applicable: always,
            apply: apply_travel_shed,
        },
    );
    d.add_operator(
        OP_BUY_TOOL,
        Operator {
            name: "buy_tool",
            spec: Spec::BuyTool,
            is_applicable: at_store_with_money,
            apply: apply_buy_tool,
        },
    );
    d.add_operator(
        OP_PICKUP_TOOL,
        Operator {
            name: "pickup_tool",
            spec: Spec::PickupTool,
            is_applicable: at_shed,
            apply: apply_pickup_tool,
        },
    );

    d.add_method(
        GET_TOOL,
        Method {
            name: "buy_from_store",
            precondition: has_money,
            subtasks: vec![Task::Primitive(OP_TRAVEL_STORE), Task::Primitive(OP_BUY_TOOL)],
        },
    );
    d.add_method(
        GET_TOOL,
        Method {
            name: "pickup_from_shed",
            precondition: always,
            subtasks: vec![Task::Primitive(OP_TRAVEL_SHED), Task::Primitive(OP_PICKUP_TOOL)],
        },
    );

    HtnPlanner::new(d)
}

fn money_signature(_ctx: &TickContext, _agent: u64, world: &ToyWorld, _bb: &Blackboard) -> u64 {
    (world.state & HAS_MONEY) as u64
}

fn run_scenario(seed: u64) -> (Vec<&'static str>, Vec<&'static str>, u64, Vec<TraceEvent>) {
    let agent = 1u64;
    let mut policy = HtnPlanPolicy::new(
        planner(),
        vec![Task::Compound(GET_TOOL)],
        ToyFactory,
        |_ctx, _agent, world, _bb| world.state,
    )
    .with_key(ActionKey("htn_plan"))
    .with_signature(money_signature)
    .with_done(|_ctx, _agent, world, _bb| (world.state & HAS_TOOL) == HAS_TOOL);

    let mut world = ToyWorld::default();
    world.state = HAS_MONEY;

    let mut blackboard = Blackboard::new();
    blackboard.set(TRACE_LOG, TraceLog::default());
    let mut actions = ActionRuntime::<ToyWorld>::default();

    let mut saw_done = false;
    for tick in 0..40u64 {
        if tick == 1 {
            // Invalidate while running: policy should replace/restart the running plan.
            world.state &= !HAS_MONEY;
        }

        let ctx = TickContext {
            tick,
            dt_seconds: 0.1,
            seed,
        };
        actions.begin_policy_tick();
        Policy::tick(&mut policy, &ctx, agent, &mut world, &mut blackboard, &mut actions);
        actions.preempt_unrequested(&ctx, agent, &mut world, &mut blackboard);
        let _ = actions.tick(&ctx, agent, &mut world, &mut blackboard);

        if (world.state & HAS_TOOL) == HAS_TOOL {
            if saw_done {
                break;
            }
            // One extra tick to observe `take_just_finished`-driven trace events.
            saw_done = true;
        }
    }

    let events = blackboard.get(TRACE_LOG).unwrap().events.clone();
    (world.log, world.canceled, world.state, events)
}

#[test]
fn policy_invalidation_replaces_running_plan_and_is_deterministic() {
    let (log_a, canceled_a, state_a, events_a) = run_scenario(123);
    let (log_b, canceled_b, state_b, events_b) = run_scenario(123);

    assert_eq!(state_a & HAS_TOOL, HAS_TOOL);
    assert_eq!(state_b & HAS_TOOL, HAS_TOOL);
    assert_eq!(log_a, log_b);
    assert_eq!(canceled_a, canceled_b);
    assert_eq!(events_a, events_b);

    // Aborted store travel must be canceled.
    assert!(canceled_a.contains(&"travel_store"));

    // After money is removed, the plan should head to the shed.
    assert!(log_a.iter().any(|e| *e == "travel_shed"));

    // Trace events are stable and include invalidation + restart + goal done.
    assert!(events_a.iter().any(|e| e.tag == "htn.plan.call"));
    assert!(events_a.iter().any(|e| e.tag == "htn.plan.start"));
    assert!(events_a.iter().any(|e| e.tag == "htn.plan.invalidated"));
    assert!(events_a.iter().any(|e| e.tag == "htn.plan.restart"));
    assert!(events_a.iter().any(|e| e.tag == "htn.plan.outcome.success"));
    assert!(events_a.iter().any(|e| e.tag == "htn.plan.done"));
}
