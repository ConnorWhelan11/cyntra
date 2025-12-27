use ai_core::{Action, ActionFactory, ActionKey, ActionStatus, Brain, TickContext, WorldMut, WorldView};
use ai_htn::{CompoundTask, HtnDomain, HtnPlanPolicy, HtnPlanner, Method, Operator, OperatorId, Task};
use ai_tools::{TraceLog, TRACE_LOG};

type State = u64;

const GOAL: State = 1 << 0;

#[derive(Default)]
struct World {
    state: State,
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
struct StepAction;

impl Action<World> for StepAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut World,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.state |= GOAL;
        ActionStatus::Success
    }
}

#[derive(Debug, Clone, Copy)]
struct Factory;

impl ActionFactory<World> for Factory {
    type Spec = Spec;

    fn build(
        &self,
        spec: &Self::Spec,
        _ctx: &TickContext,
        _agent: u64,
        _world: &World,
        _blackboard: &ai_core::Blackboard,
    ) -> Box<dyn Action<World>> {
        match spec {
            Spec::Step => Box::new(StepAction),
        }
    }
}

const ROOT: CompoundTask = CompoundTask("root");
const OP_STEP: OperatorId = OperatorId("step");

fn planner() -> HtnPlanner<Spec, State> {
    fn always(_s: &State) -> bool {
        true
    }
    fn apply_goal(s: &mut State) {
        *s |= GOAL;
    }

    let mut d = HtnDomain::new();
    d.add_operator(
        OP_STEP,
        Operator {
            name: "step",
            spec: Spec::Step,
            is_applicable: always,
            apply: apply_goal,
        },
    );
    d.add_method(
        ROOT,
        Method {
            name: "do_step",
            precondition: always,
            subtasks: vec![Task::Primitive(OP_STEP)],
        },
    );
    HtnPlanner::new(d)
}

fn main() {
    let agent = 1u64;

    let policy = Box::new(
        HtnPlanPolicy::new(
            planner(),
            vec![Task::Compound(ROOT)],
            Factory,
            |_ctx, _agent, world, _bb| world.state,
        )
        .with_key(ActionKey("htn_plan"))
        .with_done(|_ctx, _agent, world, _bb| (world.state & GOAL) == GOAL),
    );

    let mut brain = Brain::new(agent, policy);
    brain.blackboard.set(TRACE_LOG, TraceLog::default());

    let mut world = World::default();

    for tick in 0..3u64 {
        brain.tick(
            &TickContext {
                tick,
                dt_seconds: 0.1,
                seed: 0,
            },
            &mut world,
        );
    }

    let events = &brain.blackboard.get(TRACE_LOG).unwrap().events;
    for e in events {
        println!("[tick={}] {} a={} b={}", e.tick, e.tag, e.a, e.b);
    }
}

