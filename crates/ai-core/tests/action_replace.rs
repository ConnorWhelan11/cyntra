use ai_core::{
    Action, ActionKey, ActionOutcome, ActionRuntime, ActionStatus, Brain, Policy, TickContext,
    WorldMut, WorldView,
};

#[derive(Default)]
struct TestWorld {
    log: Vec<&'static str>,
    canceled: Vec<&'static str>,
}

impl WorldView for TestWorld {
    type Agent = u64;
}

impl WorldMut for TestWorld {}

struct OldAction;

impl Action<TestWorld> for OldAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut TestWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push("old");
        ActionStatus::Running
    }

    fn cancel(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut TestWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) {
        world.canceled.push("old");
    }
}

struct NewAction;

impl Action<TestWorld> for NewAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut TestWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push("new");
        ActionStatus::Success
    }
}

struct ReplaceOnTick1;

impl Policy<TestWorld> for ReplaceOnTick1 {
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: u64,
        world: &mut TestWorld,
        blackboard: &mut ai_core::Blackboard,
        actions: &mut ActionRuntime<TestWorld>,
    ) {
        let key = ActionKey("act");

        if ctx.tick == 0 {
            actions.ensure_current(
                key,
                |_ctx, _agent, _world, _bb| Box::new(OldAction),
                ctx,
                agent,
                world,
                blackboard,
            );
            return;
        }

        if ctx.tick == 1 {
            actions.replace_current_with(
                key,
                |_ctx, _agent, _world, _bb| Box::new(NewAction),
                ctx,
                agent,
                world,
                blackboard,
            );
            return;
        }

        if actions.is_running(key) {
            actions.ensure_current(
                key,
                |_ctx, _agent, _world, _bb| unreachable!("unexpected action restart"),
                ctx,
                agent,
                world,
                blackboard,
            );
        }
    }
}

#[test]
fn replace_current_restarts_action_even_with_same_key() {
    let agent = 1u64;
    let policy = Box::new(ReplaceOnTick1);
    let mut brain = Brain::new(agent, policy);
    let mut world = TestWorld::default();

    for tick in 0..3u64 {
        brain.tick(
            &TickContext {
                tick,
                dt_seconds: 0.1,
                seed: 123,
            },
            &mut world,
        );
    }

    assert_eq!(world.canceled, vec!["old"]);
    assert_eq!(world.log, vec!["old", "new"]);
    assert_eq!(
        brain.actions.take_just_finished(ActionKey("act")),
        Some(ActionOutcome::Success)
    );
}

