#![cfg(feature = "bt")]

use ai_bt::BtPolicy;
use ai_core::{Action, ActionKey, ActionStatus, Brain, TickContext, WorldMut, WorldView};
use ai_utility::{UtilityNode, UtilityOption, UtilityPolicyConfig};

#[derive(Default)]
struct World {
    prefer_b: bool,
    log: Vec<&'static str>,
    canceled: Vec<&'static str>,
}

impl WorldView for World {
    type Agent = u64;
}

impl WorldMut for World {}

struct NamedAction {
    name: &'static str,
}

impl Action<World> for NamedAction {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut World,
        _blackboard: &mut ai_core::Blackboard,
    ) -> ActionStatus {
        world.log.push(self.name);
        ActionStatus::Running
    }

    fn cancel(
        &mut self,
        _ctx: &TickContext,
        _agent: u64,
        world: &mut World,
        _blackboard: &mut ai_core::Blackboard,
    ) {
        world.canceled.push(self.name);
    }
}

#[test]
fn utility_node_tie_breaks_by_option_order() {
    let agent = 1u64;
    let options = vec![
        UtilityOption::new(
            ActionKey("a"),
            |_ctx, _agent, _world, _bb| 1.0,
            |_ctx, _agent, _world, _bb| Box::new(NamedAction { name: "a" }),
        ),
        UtilityOption::new(
            ActionKey("b"),
            |_ctx, _agent, _world, _bb| 1.0,
            |_ctx, _agent, _world, _bb| Box::new(NamedAction { name: "b" }),
        ),
    ];

    let node = UtilityNode::new(options).with_config(UtilityPolicyConfig { min_score: 0.0 });
    let policy = Box::new(BtPolicy::new(Box::new(node)));
    let mut brain = Brain::new(agent, policy);

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

    assert_eq!(brain.actions.current_key(), Some(ActionKey("a")));
    assert!(world.canceled.is_empty());
    assert!(world.log.iter().all(|e| *e == "a"));
}

#[test]
fn utility_node_switching_options_cancels_previous_action() {
    let agent = 1u64;
    let options = vec![
        UtilityOption::new(
            ActionKey("a"),
            |_ctx, _agent, world: &World, _bb| if world.prefer_b { 0.0 } else { 1.0 },
            |_ctx, _agent, _world, _bb| Box::new(NamedAction { name: "a" }),
        ),
        UtilityOption::new(
            ActionKey("b"),
            |_ctx, _agent, world: &World, _bb| if world.prefer_b { 1.0 } else { 0.0 },
            |_ctx, _agent, _world, _bb| Box::new(NamedAction { name: "b" }),
        ),
    ];

    let node = UtilityNode::new(options);
    let policy = Box::new(BtPolicy::new(Box::new(node)));
    let mut brain = Brain::new(agent, policy);
    let mut world = World::default();

    // Tick 0: choose A.
    brain.tick(
        &TickContext {
            tick: 0,
            dt_seconds: 0.1,
            seed: 0,
        },
        &mut world,
    );
    assert_eq!(brain.actions.current_key(), Some(ActionKey("a")));

    // Tick 1: flip preference -> choose B, canceling A.
    world.prefer_b = true;
    brain.tick(
        &TickContext {
            tick: 1,
            dt_seconds: 0.1,
            seed: 0,
        },
        &mut world,
    );
    assert_eq!(brain.actions.current_key(), Some(ActionKey("b")));
    assert_eq!(world.canceled, vec!["a"]);
}

