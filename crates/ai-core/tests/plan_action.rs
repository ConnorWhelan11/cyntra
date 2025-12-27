use ai_core::{
    Action, ActionKey, ActionOutcome, ActionRuntime, ActionStatus, BbKey, Brain, PlanAction, Policy,
    TickContext, WorldMut, WorldView,
};

const STOP: BbKey<bool> = BbKey::new(1);

#[derive(Default)]
struct PlanWorld {
    log: Vec<&'static str>,
    canceled: Vec<&'static str>,
}

impl WorldView for PlanWorld {
    type Agent = u64;
}

impl WorldMut for PlanWorld {}

#[derive(Debug)]
struct InstantLogAction(&'static str);

impl Action<PlanWorld> for InstantLogAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut PlanWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push(self.0);
        ActionStatus::Success
    }
}

#[derive(Debug)]
struct WaitTicksAction {
    name: &'static str,
    remaining: u32,
}

impl WaitTicksAction {
    fn new(name: &'static str, ticks: u32) -> Self {
        Self {
            name,
            remaining: ticks,
        }
    }
}

impl Action<PlanWorld> for WaitTicksAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut PlanWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push(self.name);
        if self.remaining == 0 {
            return ActionStatus::Success;
        }
        self.remaining -= 1;
        ActionStatus::Running
    }

    fn cancel(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut PlanWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) {
        world.canceled.push(self.name);
    }
}

struct StartPlanOnce {
    started: bool,
}

impl StartPlanOnce {
    fn new() -> Self {
        Self { started: false }
    }
}

impl Policy<PlanWorld> for StartPlanOnce {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: u64,
        world: &mut PlanWorld,
        blackboard: &mut ai_core::Blackboard,
        actions: &mut ActionRuntime<PlanWorld>,
    ) {
        if self.started {
            return;
        }
        self.started = true;

        actions.ensure_current(
            ActionKey("plan"),
            |_ctx, _agent, _world, _bb| {
                let steps: Vec<Box<dyn Action<PlanWorld>>> = vec![
                    Box::new(InstantLogAction("a")),
                    Box::new(WaitTicksAction::new("b", 3)),
                    Box::new(InstantLogAction("c")),
                ];
                Box::new(PlanAction::new(steps))
            },
            ctx,
            agent,
            world,
            blackboard,
        );
    }
}

struct ConditionalPlanPolicy;

impl Policy<PlanWorld> for ConditionalPlanPolicy {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: u64,
        world: &mut PlanWorld,
        blackboard: &mut ai_core::Blackboard,
        actions: &mut ActionRuntime<PlanWorld>,
    ) {
        let stop = blackboard.get(STOP).copied().unwrap_or(false);
        if stop {
            return;
        }

        actions.ensure_current(
            ActionKey("plan"),
            |_ctx, _agent, _world, _bb| {
                let steps: Vec<Box<dyn Action<PlanWorld>>> =
                    vec![Box::new(WaitTicksAction::new("wait", 999))];
                Box::new(PlanAction::new(steps))
            },
            ctx,
            agent,
            world,
            blackboard,
        );
    }
}

#[test]
fn plan_executes_to_completion_without_policy_ticks() {
    let agent = 1u64;
    let policy = Box::new(StartPlanOnce::new());
    let mut brain = Brain::new(agent, policy);
    brain.config.think_every_ticks = 1000;
    brain.config.think_offset_ticks = 0;

    let mut world = PlanWorld::default();

    for tick in 0..20u64 {
        let ctx = TickContext {
            tick,
            dt_seconds: 0.1,
            seed: 123,
        };
        brain.tick(&ctx, &mut world);
    }

    // "a" runs once, then "b" runs for a few ticks, then "c" runs once.
    assert!(world.log.first().copied() == Some("a"));
    assert!(world.log.contains(&"c"));
    assert_eq!(brain.actions.current_key(), None);

    // Plan should have finished successfully.
    assert_eq!(
        brain.actions.take_just_finished(ActionKey("plan")),
        Some(ActionOutcome::Success)
    );
}

#[test]
fn plan_cancel_propagates_to_current_step() {
    let agent = 1u64;
    let policy = Box::new(ConditionalPlanPolicy);
    let mut brain = Brain::new(agent, policy);

    let mut world = PlanWorld::default();
    brain.blackboard.set(STOP, false);

    // Tick 0: plan starts and step runs.
    brain.tick(
        &TickContext {
            tick: 0,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.log, vec!["wait"]);
    assert!(world.canceled.is_empty());

    // Tick 1: policy stops requesting the plan -> preemption cancels it.
    brain.blackboard.set(STOP, true);
    brain.tick(
        &TickContext {
            tick: 1,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );

    assert_eq!(world.canceled, vec!["wait"]);
    assert_eq!(brain.actions.current_key(), None);
}

