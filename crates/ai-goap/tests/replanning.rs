use ai_core::{
    Action, ActionFactory, ActionKey, ActionOutcome, ActionStatus, Brain, TickContext, WorldMut,
    WorldView,
};
use ai_goap::{GoapAction, GoapPlanPolicy, GoapPlanPolicyConfig, GoapPlanner, GoapState};
use ai_tools::{TraceLog, TRACE_LOG};

const HAS_MONEY: GoapState = 1 << 0;
const AT_STORE: GoapState = 1 << 1;
const AT_SHED: GoapState = 1 << 2;
const HAS_TOOL: GoapState = 1 << 3;
const STORE_OPEN: GoapState = 1 << 4;

#[derive(Default)]
struct ToyWorld {
    state: GoapState,
    log: Vec<&'static str>,
    canceled: Vec<&'static str>,
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
            Spec::TravelToStore => Box::new(TravelAction::new("travel_store", 1, AT_STORE, AT_SHED)),
            Spec::TravelToShed => Box::new(TravelAction::new("travel_shed", 1, AT_SHED, AT_STORE)),
            Spec::BuyTool => Box::new(BuyToolAction),
            Spec::PickupTool => Box::new(PickupToolAction),
        }
    }
}

fn toy_planner() -> GoapPlanner<Spec> {
    GoapPlanner::new(vec![
        GoapAction {
            name: "travel_store",
            cost: 1,
            preconditions: STORE_OPEN,
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

#[test]
fn replanning_replaces_running_plan_with_same_key() {
    let agent = 1u64;
    let policy = Box::new(
        GoapPlanPolicy::new(
            toy_planner(),
            ToyFactory,
            |_ctx, _agent, world, _bb| world.state,
            |_ctx, _agent, _world, _bb| HAS_TOOL,
        )
        .with_key(ActionKey("goap_plan"))
        .with_signature(|_ctx, _agent, world, _bb| (world.state & HAS_MONEY) as u64),
    );
    let mut brain = Brain::new(agent, policy);
    brain.blackboard.set(TRACE_LOG, TraceLog::default());

    let mut world = ToyWorld::default();
    world.state = HAS_MONEY | STORE_OPEN;

    // Tick 0: start a plan that heads to the store (tie-broken deterministically).
    brain.tick(
        &TickContext {
            tick: 0,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.canceled, Vec::<&'static str>::new());
    assert_eq!(world.log, vec!["travel_store"]);

    // Money disappears mid-plan, forcing replanning.
    world.state &= !HAS_MONEY;

    // Tick 1: policy detects money change and replaces the plan in-place (same ActionKey).
    brain.tick(
        &TickContext {
            tick: 1,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.canceled, vec!["travel_store"]);
    assert!(world.log.contains(&"travel_shed"));
    let trace = brain.blackboard.get(TRACE_LOG).unwrap();
    assert!(trace.events.iter().any(|e| e.tag == "goap.invalidated"));
    assert!(trace.events.iter().any(|e| e.tag == "goap.plan.restart"));

    // Run until completion.
    for tick in 2..10u64 {
        brain.tick(
            &TickContext {
                tick,
                dt_seconds: 0.1,
                seed: 123,
            },
            &mut world,
        );
        if (world.state & HAS_TOOL) == HAS_TOOL {
            break;
        }
    }

    assert_eq!((world.state & HAS_TOOL), HAS_TOOL);
    assert_eq!(brain.actions.current_key(), None);
    assert_eq!(
        brain.actions.take_just_finished(ActionKey("goap_plan")),
        Some(ActionOutcome::Success)
    );
}

#[test]
fn replanning_is_throttled_until_min_interval() {
    let agent = 1u64;
    let policy = Box::new(
        GoapPlanPolicy::new(
            toy_planner(),
            SlowTravelFactory,
            |_ctx, _agent, world, _bb| world.state,
            |_ctx, _agent, _world, _bb| HAS_TOOL,
        )
        .with_key(ActionKey("goap_plan"))
        .with_config(GoapPlanPolicyConfig {
            min_replan_interval_ticks: 3,
            max_plan_starts_per_key: None,
        })
        .with_signature(|_ctx, _agent, world, _bb| (world.state & STORE_OPEN) as u64),
    );
    let mut brain = Brain::new(agent, policy);

    let mut world = ToyWorld::default();
    world.state = HAS_MONEY | STORE_OPEN;

    // Tick 0: start store plan; travel takes a while so it stays running.
    brain.tick(
        &TickContext {
            tick: 0,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.log, vec!["slow_travel_store"]);

    // Tick 1: store closes -> signature changes, but min interval prevents immediate replan.
    world.state &= !STORE_OPEN;
    brain.tick(
        &TickContext {
            tick: 1,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert!(world.canceled.is_empty());
    assert_eq!(brain.actions.current_key(), Some(ActionKey("goap_plan")));

    // Tick 2: still within throttle window.
    brain.tick(
        &TickContext {
            tick: 2,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert!(world.canceled.is_empty());

    // Tick 3: throttle window satisfied, policy replaces plan and cancels the slow travel step.
    brain.tick(
        &TickContext {
            tick: 3,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.canceled, vec!["slow_travel_store"]);
    assert!(world.log.contains(&"travel_shed"));
}

#[derive(Debug, Clone, Copy)]
struct SlowTravelFactory;

impl ActionFactory<ToyWorld> for SlowTravelFactory {
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
            Spec::TravelToStore => Box::new(TravelAction::new(
                "slow_travel_store",
                999,
                AT_STORE,
                AT_SHED,
            )),
            Spec::TravelToShed => Box::new(TravelAction::new("travel_shed", 1, AT_SHED, AT_STORE)),
            Spec::BuyTool => Box::new(BuyToolAction),
            Spec::PickupTool => Box::new(PickupToolAction),
        }
    }
}
