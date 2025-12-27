use std::collections::BTreeMap;

use ai_bt::{BtNode, BtPolicy, Condition, RunAction, Selector};
use ai_core::{ActionKey, BbKey, Brain, TickContext, WorldMut, WorldView};
use ai_nav::{MoveToAction, NavGrid, NavWorldMut, NavWorldView, Vec2};

const GOAL: BbKey<Vec2> = BbKey::new(1);

#[derive(Debug)]
struct TestWorld {
    nav: NavGrid,
    positions: BTreeMap<u64, Vec2>,
}

impl TestWorld {
    fn new(nav: NavGrid) -> Self {
        Self {
            nav,
            positions: BTreeMap::new(),
        }
    }
}

impl WorldView for TestWorld {
    type Agent = u64;
}

impl WorldMut for TestWorld {}

impl NavWorldView for TestWorld {
    fn position(&self, agent: Self::Agent) -> Option<Vec2> {
        self.positions.get(&agent).copied()
    }

    fn navigator(&self) -> &dyn ai_nav::Navigator {
        &self.nav
    }
}

impl NavWorldMut for TestWorld {
    fn set_position(&mut self, agent: Self::Agent, position: Vec2) {
        self.positions.insert(agent, position);
    }
}

fn at_goal(_ctx: &TickContext, agent: u64, world: &TestWorld, bb: &ai_core::Blackboard) -> bool {
    let Some(goal) = bb.get(GOAL).copied() else {
        return false;
    };
    let Some(pos) = world.position(agent) else {
        return false;
    };
    pos.distance(goal) <= 0.05
}

fn make_move_to(
    _ctx: &TickContext,
    _agent: u64,
    _world: &TestWorld,
    bb: &ai_core::Blackboard,
) -> Box<dyn ai_core::Action<TestWorld>> {
    let goal = bb.get(GOAL).copied().expect("goal must be set");
    Box::new(MoveToAction::new(goal, 1.0, 0.05))
}

fn make_move_to_bt() -> Box<dyn BtNode<TestWorld>> {
    let at_goal = Condition::new(at_goal);
    let move_to = RunAction::new(ActionKey("move_to_goal"), make_move_to);

    Box::new(Selector::new(vec![Box::new(at_goal), Box::new(move_to)]))
}

fn run_sim(seed: u64) -> Vec<Vec2> {
    let mut nav = NavGrid::new(10, 10, 1.0);
    // Add a wall with a gap.
    for y in 0..10 {
        nav.set_blocked(5, y, true);
    }
    nav.set_blocked(5, 5, false);

    let mut world = TestWorld::new(nav);
    let agent = 1u64;
    world.positions.insert(agent, Vec2::new(1.5, 1.5));

    let policy = Box::new(BtPolicy::new(make_move_to_bt()));
    let mut brain = Brain::new(agent, policy);
    brain.blackboard.set(GOAL, Vec2::new(8.5, 8.5));

    let mut history = Vec::new();
    for tick in 0..200u64 {
        let ctx = TickContext {
            tick,
            dt_seconds: 0.1,
            seed,
        };
        brain.tick(&ctx, &mut world);
        history.push(world.position(agent).unwrap());
    }
    history
}

#[test]
fn move_to_reaches_goal() {
    let history = run_sim(123);
    let last = *history.last().unwrap();
    assert!(last.distance(Vec2::new(8.5, 8.5)) <= 0.05);
}

#[test]
fn move_to_is_deterministic_for_same_seed() {
    assert_eq!(run_sim(123), run_sim(123));
}
