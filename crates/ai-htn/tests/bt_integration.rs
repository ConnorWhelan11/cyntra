#![cfg(feature = "bt")]

use ai_bt::{BtPolicy, Condition, PlanNode, ReactiveSequence};
use ai_core::{Action, ActionFactory, ActionKey, ActionStatus, Blackboard, Brain, TickContext, WorldMut, WorldView};
use ai_htn::{CompoundTask, HtnDomain, HtnPlanner, Method, Operator, OperatorId, Task};

type State = u64;

const HAS_MONEY: State = 1 << 0;
const AT_STORE: State = 1 << 1;
const AT_SHED: State = 1 << 2;
const HAS_TOOL: State = 1 << 3;

#[derive(Default)]
struct ToyWorld {
    state: State,
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
    add: State,
    remove: State,
}

impl TravelAction {
    fn new(name: &'static str, remaining: u32, add: State, remove: State) -> Self {
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

const GET_TOOL: CompoundTask = CompoundTask("get_tool");
const OP_TRAVEL_STORE: OperatorId = OperatorId("travel_store");
const OP_TRAVEL_SHED: OperatorId = OperatorId("travel_shed");
const OP_BUY_TOOL: OperatorId = OperatorId("buy_tool");
const OP_PICKUP_TOOL: OperatorId = OperatorId("pickup_tool");

fn planner() -> HtnPlanner<Spec, State> {
    fn always(_s: &State) -> bool {
        true
    }
    fn has_money(s: &State) -> bool {
        (s & HAS_MONEY) == HAS_MONEY
    }
    fn at_store_with_money(s: &State) -> bool {
        (s & (HAS_MONEY | AT_STORE)) == (HAS_MONEY | AT_STORE)
    }
    fn at_shed(s: &State) -> bool {
        (s & AT_SHED) == AT_SHED
    }

    fn apply_travel_store(s: &mut State) {
        *s = (*s | AT_STORE) & !AT_SHED;
    }
    fn apply_travel_shed(s: &mut State) {
        *s = (*s | AT_SHED) & !AT_STORE;
    }
    fn apply_buy_tool(s: &mut State) {
        *s |= HAS_TOOL;
    }
    fn apply_pickup_tool(s: &mut State) {
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

fn allow_plan_guard(_ctx: &TickContext, _agent: u64, world: &ToyWorld, _bb: &Blackboard) -> bool {
    world.allow_plan
}

fn money_signature(_ctx: &TickContext, _agent: u64, world: &ToyWorld, _bb: &Blackboard) -> u64 {
    (world.state & HAS_MONEY) as u64
}

fn run_scenario(seed: u64) -> (Vec<&'static str>, Vec<&'static str>, State) {
    let agent = 1u64;

    let root = vec![Task::Compound(GET_TOOL)];
    let planner = planner();

    let guard = Condition::new(allow_plan_guard);
    let plan = PlanNode::new(ActionKey("htn_plan"), ToyFactory, move |_ctx, _agent, world, _bb| {
        planner.plan(&world.state, &root)
    })
    .with_signature(money_signature)
    .with_done(|_ctx, _agent, world, _bb| (world.state & HAS_TOOL) == HAS_TOOL);

    let root = ReactiveSequence::new(vec![Box::new(guard), Box::new(plan)]);
    let policy = Box::new(BtPolicy::new(Box::new(root)));
    let mut brain = Brain::new(agent, policy);

    let mut world = ToyWorld::default();
    world.state = HAS_MONEY;
    world.allow_plan = true;

    for tick in 0..40u64 {
        if tick == 1 {
            // Abort mid-plan (preemption should cancel the running plan step).
            world.allow_plan = false;
        }
        if tick == 2 {
            // Resume and restart the plan.
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
            break;
        }
    }

    (world.log, world.canceled, world.state)
}

#[test]
fn htn_plan_embedded_in_reactive_bt_abort_and_replan_is_deterministic() {
    let (log_a, canceled_a, state_a) = run_scenario(123);
    let (log_b, canceled_b, state_b) = run_scenario(123);

    assert_eq!(state_a & HAS_TOOL, HAS_TOOL);
    assert_eq!(state_b & HAS_TOOL, HAS_TOOL);

    assert_eq!(log_a, log_b);
    assert_eq!(canceled_a, canceled_b);

    // Abort cancels the slow travel step, then invalidation cancels it again via replace/restart.
    assert_eq!(canceled_a, vec!["travel_store", "travel_store"]);

    // After money is removed, the replanned sequence must head to the shed.
    assert!(log_a.iter().any(|e| *e == "travel_shed"));
}

