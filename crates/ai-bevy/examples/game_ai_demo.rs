//! Integrated Game AI Demo - M13 Milestone.
//!
//! This demo showcases a complete game AI agent that combines all AI systems:
//!
//! **Decision Layer (High-Level)**
//! - GOAP: Strategic goal planning (what to achieve)
//! - HTN: Task decomposition (how to break down goals)
//! - Utility: Dynamic prioritization (when conditions change)
//!
//! **Execution Layer (Mid-Level)**
//! - Behavior Trees: Reactive execution of plans
//!
//! **Movement Layer (Low-Level)**
//! - Steering Behaviors: Smooth, realistic movement
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    Decision Layer                           │
//! │  GOAP (Strategic) → HTN (Task Decomp) → Utility (Priority) │
//! └────────────────────────────┬────────────────────────────────┘
//!                              │ selected action
//! ┌────────────────────────────▼────────────────────────────────┐
//! │                    Execution Layer                          │
//! │           Behavior Tree (Reactive Execution)               │
//! └────────────────────────────┬────────────────────────────────┘
//!                              │ movement commands
//! ┌────────────────────────────▼────────────────────────────────┐
//! │                    Movement Layer                           │
//! │              Steering Behaviors (Smooth Motion)            │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! Run:
//! `cd crates && cargo run -p ai-bevy --example game_ai_demo --features goap,bt,utility,htn`

use ai_bevy::goap::{GoapAgentBundle, GoapGoal, GoapPlanStatus, GoapWorldState};
use ai_bevy::bt::{BtAgentBundle, BtExecutionStatus, BtNodeInfo, BtNodePath, BtNodeType, BtStatusComponent};
use ai_bevy::htn::{HtnAgentBundle, HtnPlanStatus, HtnTaskStack, HtnTaskType, HtnTaskInfo};
use ai_bevy::utility::{UtilityAgentBundle, UtilityOptionScore, UtilityScores, UtilitySelection};
use ai_bevy::steering::{SteeringAgent, SteeringAgentBundle, SteeringBehaviors, SteeringOutput};
use ai_bevy::{AiAgent, AiPosition, BevyAgentId};
use ai_nav::Vec2;
use bevy::prelude::*;

/// Marker for the integrated AI agent.
#[derive(Component)]
struct GameAiAgent;

/// High-level AI state machine.
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default)]
enum AiState {
    #[default]
    Idle,
    Planning,
    Executing,
    MovingToTarget,
    PerformingAction,
}

/// Current action being executed.
#[derive(Component, Debug, Clone, Default)]
struct CurrentAction {
    name: Option<&'static str>,
    target_position: Option<Vec2>,
    progress: f32,
    started_tick: u64,
}

/// Simulation environment state.
#[derive(Resource)]
struct SimulationState {
    tick: u64,
    food_position: Vec2,
    enemy_position: Vec2,
    shelter_position: Vec2,
    agent_health: f32,
    agent_hunger: f32,
    enemy_detected: bool,
    at_shelter: bool,
}

impl Default for SimulationState {
    fn default() -> Self {
        Self {
            tick: 0,
            food_position: Vec2::ZERO,
            enemy_position: Vec2::ZERO,
            shelter_position: Vec2::ZERO,
            agent_health: 100.0,
            agent_hunger: 0.0,
            enemy_detected: false,
            at_shelter: false,
        }
    }
}

fn main() {
    App::new()
        .add_plugins(MinimalPlugins)
        .init_resource::<SimulationState>()
        .add_systems(Startup, setup)
        .add_systems(Update, (
            update_simulation,
            update_utility_scores,
            select_goal_from_utility,
            decompose_goal_with_htn,
            execute_plan_with_bt,
            update_steering_targets,
            simulate_movement,
            print_status,
        ).chain())
        .run();
}

fn setup(mut commands: Commands, mut sim: ResMut<SimulationState>) {
    // Initialize simulation
    sim.food_position = Vec2::new(10.0, 5.0);
    sim.enemy_position = Vec2::new(-5.0, 3.0);
    sim.shelter_position = Vec2::new(0.0, -10.0);
    sim.agent_health = 100.0;
    sim.agent_hunger = 30.0;
    sim.enemy_detected = false;
    sim.at_shelter = false;

    // Spawn integrated AI agent with all systems
    commands.spawn((
        GameAiAgent,
        Name::new("Integrated AI Agent"),
        AiAgent(BevyAgentId(1)),
        AiPosition(Vec2::new(0.0, 0.0)),
        AiState::default(),
        CurrentAction::default(),
        // Decision layer
        GoapAgentBundle::new(
            0b0001, // Initial: HasEnergy=true
            0b1000, // Goal: Survived=true
        ),
        HtnAgentBundle::default(),
        UtilityAgentBundle::default(),
        // Execution layer
        BtAgentBundle::default(),
        // Movement layer
        SteeringAgentBundle::new(3.0, 5.0),
    ));

    info!("╔════════════════════════════════════════════════════════════╗");
    info!("║           INTEGRATED GAME AI DEMO (M13)                   ║");
    info!("╠════════════════════════════════════════════════════════════╣");
    info!("║ This demo shows a survival AI agent combining:            ║");
    info!("║  • Utility AI - Evaluates priorities (hunger, danger)     ║");
    info!("║  • GOAP - Plans to achieve survival goals                 ║");
    info!("║  • HTN - Decomposes goals into executable tasks           ║");
    info!("║  • Behavior Trees - Executes tasks reactively             ║");
    info!("║  • Steering - Moves smoothly toward targets               ║");
    info!("╠════════════════════════════════════════════════════════════╣");
    info!("║ The agent will autonomously:                              ║");
    info!("║  - Find and eat food when hungry                          ║");
    info!("║  - Flee to shelter when enemy detected                    ║");
    info!("║  - Wander when no immediate needs                         ║");
    info!("╚════════════════════════════════════════════════════════════╝");
    info!("");
}

fn update_simulation(
    mut sim: ResMut<SimulationState>,
    query: Query<&AiPosition, With<GameAiAgent>>,
) {
    sim.tick += 1;

    // Update agent hunger
    sim.agent_hunger = (sim.agent_hunger + 0.5).min(100.0);

    // Move enemy in a pattern
    let enemy_angle = sim.tick as f32 * 0.1;
    sim.enemy_position = Vec2::new(
        enemy_angle.cos() * 8.0,
        enemy_angle.sin() * 8.0,
    );

    // Check if agent is near positions
    if let Ok(pos) = query.single() {
        let agent_pos = pos.0;

        // Check enemy proximity
        let dist_to_enemy = (agent_pos - sim.enemy_position).length();
        sim.enemy_detected = dist_to_enemy < 5.0;

        // Check if at shelter
        let dist_to_shelter = (agent_pos - sim.shelter_position).length();
        sim.at_shelter = dist_to_shelter < 2.0;

        // Check if near food
        let dist_to_food = (agent_pos - sim.food_position).length();
        if dist_to_food < 1.0 && sim.agent_hunger > 20.0 {
            sim.agent_hunger = (sim.agent_hunger - 30.0).max(0.0);
            info!("[Tick {}] 🍎 Agent ate food! Hunger: {:.0}", sim.tick, sim.agent_hunger);
        }
    }
}

fn update_utility_scores(
    sim: Res<SimulationState>,
    mut query: Query<(&mut UtilityScores, &AiPosition), With<GameAiAgent>>,
) {
    for (mut scores, pos) in query.iter_mut() {
        let agent_pos = pos.0;

        // Calculate scores based on needs and environment
        let hunger_urgency = sim.agent_hunger / 100.0;
        let danger_level = if sim.enemy_detected { 0.9 } else { 0.1 };
        let rest_desire = if sim.at_shelter { 0.8 } else { 0.2 };

        // Distance-based modifiers
        let dist_to_food = (agent_pos - sim.food_position).length();
        let food_accessibility = 1.0 / (1.0 + dist_to_food * 0.1);

        scores.update(sim.tick, vec![
            UtilityOptionScore {
                name: "FindFood",
                score: hunger_urgency * food_accessibility,
                selected: false,
                eligible: sim.agent_hunger > 20.0,
            },
            UtilityOptionScore {
                name: "FleeToShelter",
                score: danger_level,
                selected: false,
                eligible: sim.enemy_detected && !sim.at_shelter,
            },
            UtilityOptionScore {
                name: "Rest",
                score: rest_desire * 0.3,
                selected: false,
                eligible: sim.at_shelter,
            },
            UtilityOptionScore {
                name: "Explore",
                score: 0.2,
                selected: false,
                eligible: !sim.enemy_detected && sim.agent_hunger < 50.0,
            },
        ]);
    }
}

fn select_goal_from_utility(
    sim: Res<SimulationState>,
    mut query: Query<(
        &mut UtilityScores,
        &mut UtilitySelection,
        &mut GoapWorldState,
        &mut GoapGoal,
        &mut AiState,
    ), With<GameAiAgent>>,
) {
    for (mut scores, mut selection, mut world_state, mut goal, mut state) in query.iter_mut() {
        // Only re-select when idle or if priorities changed significantly
        if *state != AiState::Idle && *state != AiState::Planning {
            continue;
        }

        if let Some(best) = scores.best() {
            let best_name = best.name;
            let best_score = best.score;

            // Only change if score is significant
            if best_score < 0.3 {
                continue;
            }

            let previous = selection.current;
            selection.select(best_name, best_score);

            // Mark selected in scores
            for score in &mut scores.scores {
                score.selected = score.name == best_name;
            }

            // Only plan if goal changed
            if previous != Some(best_name) {
                // Update GOAP world state and goal based on selection
                match best_name {
                    "FindFood" => {
                        // Goal: Be fed (bit 1)
                        world_state.0 = if sim.agent_hunger > 50.0 { 0 } else { 0b0010 };
                        goal.0 = 0b0010; // Want: Fed=true
                    }
                    "FleeToShelter" => {
                        // Goal: Be safe (bit 2)
                        world_state.0 = if sim.at_shelter { 0b0100 } else { 0 };
                        goal.0 = 0b0100; // Want: Safe=true
                    }
                    "Rest" => {
                        // Already at shelter, just rest
                        world_state.0 = 0b0110; // Safe and resting
                        goal.0 = 0b0110;
                    }
                    "Explore" => {
                        // Exploration goal
                        world_state.0 = 0b0001; // HasEnergy
                        goal.0 = 0b1000; // Want: Explored=true
                    }
                    _ => {}
                }

                *state = AiState::Planning;
                info!("[Tick {}] 🎯 New goal selected: {} (score: {:.2})", sim.tick, best_name, best_score);
            }
        }
    }
}

fn decompose_goal_with_htn(
    sim: Res<SimulationState>,
    mut query: Query<(
        &AiPosition,
        &UtilitySelection,
        &mut HtnPlanStatus,
        &mut HtnTaskStack,
        &mut GoapPlanStatus,
        &mut AiState,
    ), With<GameAiAgent>>,
) {
    for (_pos, selection, mut htn_status, mut htn_stack, mut goap_status, mut state) in query.iter_mut() {
        if *state != AiState::Planning {
            continue;
        }

        // Use HTN to decompose the selected goal into operators
        htn_stack.clear();
        htn_stack.clear_history();

        let operators = match selection.current {
            Some("FindFood") => {
                // Compound task: GetFood -> [MoveTo, PickUp, Eat]
                htn_stack.push(HtnTaskInfo {
                    task: HtnTaskType::Compound("GetFood"),
                    method_name: Some("StandardApproach"),
                    depth: 0,
                });
                htn_stack.record_decomposition(
                    "GetFood",
                    "StandardApproach",
                    vec![
                        HtnTaskType::Primitive("MoveTo"),
                        HtnTaskType::Primitive("PickUp"),
                        HtnTaskType::Primitive("Eat"),
                    ],
                    sim.tick,
                );
                vec!["MoveTo", "PickUp", "Eat"]
            }
            Some("FleeToShelter") => {
                // Compound task: SeekSafety -> [SprintTo, Hide]
                htn_stack.push(HtnTaskInfo {
                    task: HtnTaskType::Compound("SeekSafety"),
                    method_name: Some("FleeMethod"),
                    depth: 0,
                });
                htn_stack.record_decomposition(
                    "SeekSafety",
                    "FleeMethod",
                    vec![
                        HtnTaskType::Primitive("SprintTo"),
                        HtnTaskType::Primitive("Hide"),
                    ],
                    sim.tick,
                );
                vec!["SprintTo", "Hide"]
            }
            Some("Rest") => {
                vec!["Wait", "Recover"]
            }
            Some("Explore") => {
                htn_stack.push(HtnTaskInfo {
                    task: HtnTaskType::Compound("Explore"),
                    method_name: Some("WanderMethod"),
                    depth: 0,
                });
                vec!["Wander"]
            }
            _ => vec![],
        };

        if !operators.is_empty() {
            htn_status.set_executing(operators.clone());
            goap_status.set_executing(operators);
            *state = AiState::Executing;
            info!("[Tick {}] 📋 HTN decomposed plan: {:?}", sim.tick, htn_status.plan_operators);
        }
    }
}

fn execute_plan_with_bt(
    sim: Res<SimulationState>,
    mut query: Query<(
        &AiPosition,
        &mut BtExecutionStatus,
        &mut BtNodePath,
        &mut HtnPlanStatus,
        &mut GoapPlanStatus,
        &mut CurrentAction,
        &mut AiState,
    ), With<GameAiAgent>>,
) {
    for (_pos, mut bt_status, mut bt_path, mut htn_status, mut goap_status, mut action, mut state) in query.iter_mut() {
        if *state != AiState::Executing && *state != AiState::MovingToTarget && *state != AiState::PerformingAction {
            continue;
        }

        // Build BT path for current operator
        bt_path.clear();

        if let Some(ref operator) = htn_status.current_operator {
            let operator_name = operator.0;

            // Create BT structure for current action
            bt_path.push(BtNodeInfo {
                name: "Root".to_string(),
                node_type: BtNodeType::Sequence,
                status: BtStatusComponent::Running,
                child_index: None,
            });
            bt_path.push(BtNodeInfo {
                name: format!("Execute_{}", operator_name),
                node_type: BtNodeType::Action,
                status: BtStatusComponent::Running,
                child_index: Some(htn_status.current_index),
            });

            bt_status.set_running();

            // Determine target and action type
            match operator_name {
                "MoveTo" | "PickUp" | "Eat" => {
                    action.name = Some(operator_name);
                    action.target_position = Some(sim.food_position);
                    *state = AiState::MovingToTarget;
                }
                "SprintTo" | "Hide" => {
                    action.name = Some(operator_name);
                    action.target_position = Some(sim.shelter_position);
                    *state = AiState::MovingToTarget;
                }
                "Wander" => {
                    action.name = Some(operator_name);
                    action.target_position = None;
                    *state = AiState::PerformingAction;
                }
                "Wait" | "Recover" => {
                    action.name = Some(operator_name);
                    action.target_position = None;
                    *state = AiState::PerformingAction;
                }
                _ => {}
            }
        } else {
            // No more operators - plan complete
            bt_status.set_completed(BtStatusComponent::Success);
            htn_status.reset();
            goap_status.set_completed();
            *state = AiState::Idle;
            action.name = None;
            action.target_position = None;
            action.progress = 0.0;
            info!("[Tick {}] ✅ Plan completed!", sim.tick);
        }
    }
}

fn update_steering_targets(
    sim: Res<SimulationState>,
    mut query: Query<(
        &AiPosition,
        &CurrentAction,
        &AiState,
        &mut SteeringAgent,
        &mut SteeringBehaviors,
    ), With<GameAiAgent>>,
) {
    for (_pos, action, state, mut agent, mut behaviors) in query.iter_mut() {
        // Reset behaviors
        behaviors.seek_target = None;
        behaviors.flee_target = None;
        behaviors.arrive_target = None;
        behaviors.wander = false;

        match *state {
            AiState::MovingToTarget => {
                if let Some(target) = action.target_position {
                    // Use arrive for smooth approach
                    behaviors.arrive_target = Some(target);

                    // If fleeing, also set flee from enemy
                    if action.name == Some("SprintTo") {
                        behaviors.flee_target = Some(sim.enemy_position);
                        agent.max_speed = 5.0; // Sprint faster
                    } else {
                        agent.max_speed = 3.0;
                    }
                }
            }
            AiState::PerformingAction => {
                if action.name == Some("Wander") {
                    behaviors.wander = true;
                    agent.max_speed = 2.0;
                }
            }
            _ => {}
        }
    }
}

fn simulate_movement(
    sim: Res<SimulationState>,
    mut query: Query<(
        &mut AiPosition,
        &mut SteeringAgent,
        &SteeringBehaviors,
        &mut SteeringOutput,
        &mut CurrentAction,
        &mut HtnPlanStatus,
        &mut GoapPlanStatus,
        &mut AiState,
    ), With<GameAiAgent>>,
) {
    let dt = 0.016; // 60 FPS

    for (mut pos, mut agent, behaviors, mut output, mut action, mut htn_status, mut goap_status, mut state) in query.iter_mut() {
        // Calculate steering forces manually (since we don't have the full system running)
        let mut force = Vec2::ZERO;

        if let Some(target) = behaviors.arrive_target {
            let to_target = target - pos.0;
            let distance = to_target.length();
            if distance > 0.1 {
                let speed = if distance < agent.arrival_radius {
                    agent.max_speed * (distance / agent.arrival_radius)
                } else {
                    agent.max_speed
                };
                let desired = if distance > 0.001 {
                    to_target * (speed / distance)
                } else {
                    Vec2::ZERO
                };
                force = force + (desired - agent.velocity);
            }
        }

        if let Some(flee_from) = behaviors.flee_target {
            let away = pos.0 - flee_from;
            let distance = away.length();
            if distance > 0.001 && distance < 10.0 {
                let desired = away * (agent.max_speed / distance);
                force = force + (desired - agent.velocity) * 1.5;
            }
        }

        if behaviors.wander {
            // Simple wander using sin/cos
            let wander_x = (sim.tick as f32 * 0.1).cos() * agent.max_speed * 0.5;
            let wander_y = (sim.tick as f32 * 0.1).sin() * agent.max_speed * 0.5;
            force = force + Vec2::new(wander_x, wander_y) - agent.velocity;
        }

        // Apply force and update position
        if force.length() > 0.001 {
            let clamped_force = if force.length() > agent.max_force {
                force * (agent.max_force / force.length())
            } else {
                force
            };
            agent.velocity = agent.velocity + clamped_force * dt;
            if agent.velocity.length() > agent.max_speed {
                agent.velocity = agent.velocity * (agent.max_speed / agent.velocity.length());
            }
            pos.0 = pos.0 + agent.velocity * dt;
        }

        output.total_force = force;
        output.desired_velocity = agent.velocity;

        // Check if reached target
        if *state == AiState::MovingToTarget {
            if let Some(target) = action.target_position {
                let dist = (pos.0 - target).length();
                if dist < 1.5 {
                    info!("[Tick {}] 📍 Reached target, advancing plan", sim.tick);
                    htn_status.advance();
                    goap_status.action_completed();
                    *state = AiState::Executing;
                }
            }
        }

        // Handle non-movement actions
        if *state == AiState::PerformingAction {
            action.progress += dt * 2.0; // Progress action
            if action.progress >= 1.0 {
                info!("[Tick {}] 🎬 Action '{}' completed", sim.tick, action.name.unwrap_or("unknown"));
                action.progress = 0.0;
                htn_status.advance();
                goap_status.action_completed();
                *state = AiState::Executing;
            }
        }
    }
}

fn print_status(
    sim: Res<SimulationState>,
    query: Query<(
        &AiPosition,
        &AiState,
        &UtilitySelection,
        &HtnPlanStatus,
        &SteeringAgent,
    ), With<GameAiAgent>>,
) {
    // Print every 60 ticks (about 1 second)
    if sim.tick % 60 != 0 {
        return;
    }

    for (pos, state, selection, htn, steering) in query.iter() {
        info!("────────────────────────────────────────────────────────────");
        info!("│ Tick: {} │ Position: ({:.1}, {:.1})", sim.tick, pos.0.x, pos.0.y);
        info!("│ State: {:?} │ Hunger: {:.0}% │ Enemy: {}",
            state,
            sim.agent_hunger,
            if sim.enemy_detected { "⚠️ DETECTED" } else { "none" }
        );
        info!("│ Goal: {:?} │ HTN: {:?} ({}/{})",
            selection.current,
            htn.current_operator.as_ref().map(|o| o.0),
            htn.current_index,
            htn.total_operators
        );
        info!("│ Velocity: ({:.2}, {:.2}) │ Speed: {:.2}",
            steering.velocity.x, steering.velocity.y, steering.velocity.length()
        );
        info!("────────────────────────────────────────────────────────────");
    }
}
