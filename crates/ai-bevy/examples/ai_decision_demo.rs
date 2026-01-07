//! AI Decision Systems Demo - Validates M8, M9, M10 milestones.
//!
//! This demo demonstrates all three AI decision system integrations:
//!
//! **M8: GOAP Integration**
//! - World state bits tracking agent conditions
//! - Goal state defining desired conditions
//! - Plan status tracking
//!
//! **M9: Behavior Tree Integration**
//! - BT execution status tracking
//! - Node path visualization
//! - Status change events
//!
//! **M10: Utility AI Integration**
//! - Option score tracking
//! - Selection change events
//! - Score visualization
//!
//! This example creates three agents, each using a different AI system,
//! and demonstrates how the Bevy components track their decision-making.
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example ai_decision_demo --features goap,bt,utility`

use ai_bevy::goap::{GoapAgentBundle, GoapGoal, GoapPlanStatus, GoapStatus, GoapWorldState};
use ai_bevy::bt::{BtAgentBundle, BtExecutionStatus, BtNodePath, BtNodeInfo, BtNodeType, BtStatusComponent};
use ai_bevy::utility::{UtilityAgentBundle, UtilityOptionScore, UtilityScores, UtilitySelection};
use ai_bevy::{AiAgent, AiPosition, BevyAgentId};
use bevy::prelude::*;

/// Marker for GOAP-based agent.
#[derive(Component)]
struct GoapAgent;

/// Marker for BT-based agent.
#[derive(Component)]
struct BtAgent;

/// Marker for Utility-based agent.
#[derive(Component)]
struct UtilityAgent;

/// Demo state for simulation.
#[derive(Resource, Default)]
struct DemoState {
    tick: u64,
    paused: bool,
}

fn main() {
    App::new()
        .add_plugins(MinimalPlugins)
        .init_resource::<DemoState>()
        .add_systems(Startup, setup)
        .add_systems(Update, (
            update_demo_state,
            simulate_goap_agent,
            simulate_bt_agent,
            simulate_utility_agent,
            print_agent_status,
        ).chain())
        .run();
}

fn setup(mut commands: Commands) {
    // GOAP Agent - Plans to achieve goals
    // State bits: 0=HasWeapon, 1=TargetVisible, 2=InRange, 3=TargetDead
    commands.spawn((
        GoapAgent,
        Name::new("GOAP Agent"),
        AiAgent(BevyAgentId(1)),
        AiPosition(ai_nav::Vec2::new(0.0, 0.0)),
        GoapAgentBundle::new(
            0b0001, // HasWeapon=true, others=false
            0b1000, // Goal: TargetDead=true
        ),
    ));

    // BT Agent - Executes behavior tree
    commands.spawn((
        BtAgent,
        Name::new("BT Agent"),
        AiAgent(BevyAgentId(2)),
        AiPosition(ai_nav::Vec2::new(5.0, 0.0)),
        BtAgentBundle::default(),
    ));

    // Utility Agent - Selects highest-scoring option
    commands.spawn((
        UtilityAgent,
        Name::new("Utility Agent"),
        AiAgent(BevyAgentId(3)),
        AiPosition(ai_nav::Vec2::new(10.0, 0.0)),
        UtilityAgentBundle::default(),
    ));

    info!("=== AI Decision Systems Demo ===");
    info!("M8: GOAP - Goal-Oriented Action Planning");
    info!("M9: BT - Behavior Tree Execution");
    info!("M10: Utility - Score-Based Selection");
    info!("");
    info!("Press Space to step simulation, Q to quit");
}

fn update_demo_state(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<DemoState>,
    mut exit: EventWriter<AppExit>,
) {
    if keyboard.just_pressed(KeyCode::KeyQ) {
        exit.write(AppExit::Success);
    }

    if keyboard.just_pressed(KeyCode::Space) {
        state.tick += 1;
        info!("\n--- Tick {} ---", state.tick);
    }
}

/// Simulate GOAP agent planning.
fn simulate_goap_agent(
    state: Res<DemoState>,
    mut query: Query<(&Name, &mut GoapWorldState, &GoapGoal, &mut GoapPlanStatus), With<GoapAgent>>,
) {
    if !state.is_changed() {
        return;
    }

    for (name, mut world_state, goal, mut plan_status) in query.iter_mut() {
        // Simulate world state changes based on tick
        match state.tick % 5 {
            1 => {
                // Find target
                world_state.set_bit(1); // TargetVisible = true
                plan_status.set_executing(vec!["FindTarget", "Approach", "Attack"]);
                info!("[{}] Found target! Planning attack sequence", name);
            }
            2 => {
                // Move into range
                world_state.set_bit(2); // InRange = true
                plan_status.action_completed();
                info!("[{}] Moved into range", name);
            }
            3 => {
                // Attack
                plan_status.action_completed();
                info!("[{}] Attacking target...", name);
            }
            4 => {
                // Target eliminated
                world_state.set_bit(3); // TargetDead = true
                plan_status.action_completed();
                plan_status.set_completed();
                info!("[{}] Target eliminated! Goal achieved.", name);
            }
            0 => {
                // Reset for next cycle
                world_state.0 = 0b0001; // Reset to just HasWeapon
                plan_status.status = GoapStatus::Idle;
                info!("[{}] Reset - looking for new target", name);
            }
            _ => {}
        }

        // Check if goal satisfied
        if world_state.satisfies(*goal) {
            info!("[{}] GOAP goal satisfied!", name);
        }
    }
}

/// Simulate BT agent execution.
fn simulate_bt_agent(
    state: Res<DemoState>,
    mut query: Query<(&Name, &mut BtExecutionStatus, &mut BtNodePath), With<BtAgent>>,
) {
    if !state.is_changed() {
        return;
    }

    for (name, mut status, mut path) in query.iter_mut() {
        path.clear();

        // Simulate BT traversal based on tick
        match state.tick % 4 {
            1 => {
                // Enter root selector
                path.push(BtNodeInfo {
                    name: "Root".to_string(),
                    node_type: BtNodeType::Selector,
                    status: BtStatusComponent::Running,
                    child_index: None,
                });
                // Try first child (attack sequence)
                path.push(BtNodeInfo {
                    name: "AttackSequence".to_string(),
                    node_type: BtNodeType::Sequence,
                    status: BtStatusComponent::Running,
                    child_index: Some(0),
                });
                status.set_running();
                info!("[{}] BT: Entering AttackSequence", name);
            }
            2 => {
                // Attack sequence running
                path.push(BtNodeInfo {
                    name: "Root".to_string(),
                    node_type: BtNodeType::Selector,
                    status: BtStatusComponent::Running,
                    child_index: None,
                });
                path.push(BtNodeInfo {
                    name: "AttackSequence".to_string(),
                    node_type: BtNodeType::Sequence,
                    status: BtStatusComponent::Running,
                    child_index: Some(0),
                });
                path.push(BtNodeInfo {
                    name: "Attack".to_string(),
                    node_type: BtNodeType::Action,
                    status: BtStatusComponent::Running,
                    child_index: Some(1),
                });
                path.set_active_leaf(BtNodeInfo {
                    name: "Attack".to_string(),
                    node_type: BtNodeType::Action,
                    status: BtStatusComponent::Running,
                    child_index: Some(1),
                });
                status.set_running();
                info!("[{}] BT: Running Attack action (path: {})", name, path.path_string());
            }
            3 => {
                // BT completes successfully
                status.set_completed(BtStatusComponent::Success);
                info!("[{}] BT: Completed with SUCCESS", name);
            }
            0 => {
                // Reset
                status.reset();
                info!("[{}] BT: Reset, waiting for next tick", name);
            }
            _ => {}
        }
    }
}

/// Simulate Utility agent selection.
fn simulate_utility_agent(
    state: Res<DemoState>,
    mut query: Query<(&Name, &mut UtilityScores, &mut UtilitySelection), With<UtilityAgent>>,
) {
    if !state.is_changed() {
        return;
    }

    for (name, mut scores, mut selection) in query.iter_mut() {
        // Simulate changing scores based on tick
        let tick_phase = state.tick % 6;

        // Calculate scores based on simulated conditions
        let attack_score = match tick_phase {
            0 | 1 => 0.8,
            2 | 3 => 0.3,
            _ => 0.5,
        };
        let flee_score = match tick_phase {
            2 | 3 => 0.9,
            _ => 0.2,
        };
        let patrol_score = match tick_phase {
            4 | 5 => 0.7,
            _ => 0.4,
        };

        // Update scores
        scores.update(state.tick, vec![
            UtilityOptionScore {
                name: "Attack",
                score: attack_score,
                selected: false,
                eligible: attack_score > 0.0,
            },
            UtilityOptionScore {
                name: "Flee",
                score: flee_score,
                selected: false,
                eligible: flee_score > 0.0,
            },
            UtilityOptionScore {
                name: "Patrol",
                score: patrol_score,
                selected: false,
                eligible: patrol_score > 0.0,
            },
        ]);

        // Find and select best option
        if let Some(best) = scores.best() {
            let best_name = best.name;
            let best_score = best.score;
            selection.select(best_name, best_score);

            // Mark as selected in scores
            for score in &mut scores.scores {
                score.selected = score.name == best_name;
            }

            info!(
                "[{}] Utility: Selected '{}' (score: {:.2}) | All: Attack={:.2}, Flee={:.2}, Patrol={:.2}",
                name, best_name, best_score, attack_score, flee_score, patrol_score
            );
        }
    }
}

/// Print status summary for all agents.
fn print_agent_status(
    state: Res<DemoState>,
    goap_query: Query<(&Name, &GoapWorldState, &GoapPlanStatus), With<GoapAgent>>,
    bt_query: Query<(&Name, &BtExecutionStatus), With<BtAgent>>,
    utility_query: Query<(&Name, &UtilitySelection), With<UtilityAgent>>,
) {
    // Only print every 5 ticks
    if state.tick == 0 || state.tick % 5 != 0 {
        return;
    }

    info!("\n=== Status Summary (Tick {}) ===", state.tick);

    for (name, world_state, plan_status) in goap_query.iter() {
        info!(
            "{}: WorldState=0b{:04b}, PlanStatus={:?}",
            name,
            world_state.bits(),
            plan_status.status
        );
    }

    for (name, status) in bt_query.iter() {
        info!(
            "{}: Status={:?}, TicksRunning={}",
            name,
            status.status,
            status.ticks_running
        );
    }

    for (name, selection) in utility_query.iter() {
        info!(
            "{}: Selected={:?}, Score={:.2}, TicksSelected={}",
            name,
            selection.current,
            selection.current_score,
            selection.ticks_selected
        );
    }
}
