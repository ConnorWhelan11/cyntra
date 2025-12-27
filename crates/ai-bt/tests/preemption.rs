use std::collections::BTreeMap;

use ai_bt::{BtNode, BtPolicy, Condition, RunAction, Selector};
use ai_core::{Action, ActionKey, ActionStatus, BbKey, Brain, TickContext, WorldMut, WorldView};

const STOP: BbKey<bool> = BbKey::new(1);

#[derive(Debug, Default)]
struct RecordingWorld {
    canceled: Vec<&'static str>,
    ticked: Vec<&'static str>,
    // Deterministic storage for potential future assertions.
    _positions: BTreeMap<u64, (f32, f32)>,
}

impl WorldView for RecordingWorld {
    type Agent = u64;
}

impl WorldMut for RecordingWorld {}

#[derive(Debug)]
struct RecordAction {
    name: &'static str,
}

impl RecordAction {
    fn new(name: &'static str) -> Self {
        Self { name }
    }
}

impl Action<RecordingWorld> for RecordAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut RecordingWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.ticked.push(self.name);
        ActionStatus::Running
    }

    fn cancel(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut RecordingWorld,
        _blackboard: &mut ai_core::Blackboard,
    ) {
        world.canceled.push(self.name);
    }
}

fn stop_is_true(_ctx: &TickContext, _agent: u64, _world: &RecordingWorld, bb: &ai_core::Blackboard) -> bool {
    bb.get(STOP).copied().unwrap_or(false)
}

fn make_record_action(
    _ctx: &TickContext,
    _agent: u64,
    _world: &RecordingWorld,
    _bb: &ai_core::Blackboard,
) -> Box<dyn ai_core::Action<RecordingWorld>> {
    Box::new(RecordAction::new("move"))
}

fn make_tree() -> Box<dyn BtNode<RecordingWorld>> {
    let stop = Condition::new(stop_is_true);
    let move_action = RunAction::new(ActionKey("move"), make_record_action);
    Box::new(Selector::new(vec![Box::new(stop), Box::new(move_action)]))
}

#[test]
fn action_is_canceled_when_bt_branch_stops_requesting_it() {
    let agent = 1u64;
    let policy = Box::new(BtPolicy::new(make_tree()));
    let mut brain = Brain::new(agent, policy);

    let mut world = RecordingWorld::default();
    brain.blackboard.set(STOP, false);

    // Tick once: action starts and runs.
    brain.tick(
        &TickContext {
            tick: 0,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );

    assert_eq!(world.ticked, vec!["move"]);
    assert!(world.canceled.is_empty());

    // Flip STOP: BT returns Success without ticking RunAction.
    brain.blackboard.set(STOP, true);
    brain.tick(
        &TickContext {
            tick: 1,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );

    assert_eq!(world.canceled, vec!["move"]);
    assert_eq!(world.ticked, vec!["move"]); // no extra tick after cancellation
}

#[test]
fn decimated_thinking_does_not_cancel_until_next_policy_tick() {
    let agent = 1u64;
    let policy = Box::new(BtPolicy::new(make_tree()));
    let mut brain = Brain::new(agent, policy);
    brain.config.think_every_ticks = 2;
    brain.config.think_offset_ticks = 0;

    let mut world = RecordingWorld::default();
    brain.blackboard.set(STOP, false);

    // Tick 0: policy ticks, starts action.
    brain.tick(
        &TickContext {
            tick: 0,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.ticked, vec!["move"]);
    assert!(world.canceled.is_empty());

    // Tick 1: policy does NOT tick; action continues even if STOP flips.
    brain.blackboard.set(STOP, true);
    brain.tick(
        &TickContext {
            tick: 1,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.ticked, vec!["move", "move"]);
    assert!(world.canceled.is_empty());

    // Tick 2: policy ticks again; STOP preempts and cancels action.
    brain.tick(
        &TickContext {
            tick: 2,
            dt_seconds: 0.1,
            seed: 123,
        },
        &mut world,
    );
    assert_eq!(world.canceled, vec!["move"]);
}
