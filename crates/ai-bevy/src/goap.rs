//! GOAP (Goal-Oriented Action Planning) integration for Bevy.
//!
//! This module bridges `ai-goap` with Bevy ECS, providing:
//! - World state components that sync GOAP bitset states
//! - Planning status events for debugging and UI
//! - Debug visualization for GOAP plans
//!
//! ## Architecture
//!
//! GOAP planning in Bevy works through these components:
//! - `GoapWorldState`: Current bitset state of an agent
//! - `GoapGoal`: Target bitset state the agent wants to achieve
//! - `GoapPlanStatus`: Current planning/execution status
//!
//! The actual planning is done through `ai-goap::GoapPlanner` which is
//! typically stored in the agent's `Brain` policy.

use bevy_ecs::prelude::*;

/// GOAP world state represented as a bitset.
///
/// Each bit represents a boolean fact about the world.
/// For example:
/// - Bit 0: HasWeapon
/// - Bit 1: TargetVisible
/// - Bit 2: InCover
/// - etc.
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GoapWorldState(pub u64);

impl GoapWorldState {
    /// Create a new world state with all bits cleared.
    pub fn new() -> Self {
        Self(0)
    }

    /// Create a world state from a raw bitset.
    pub fn from_bits(bits: u64) -> Self {
        Self(bits)
    }

    /// Set a specific bit (fact) to true.
    pub fn set_bit(&mut self, bit: u32) {
        self.0 |= 1 << bit;
    }

    /// Clear a specific bit (fact) to false.
    pub fn clear_bit(&mut self, bit: u32) {
        self.0 &= !(1 << bit);
    }

    /// Check if a specific bit (fact) is set.
    pub fn has_bit(&self, bit: u32) -> bool {
        (self.0 & (1 << bit)) != 0
    }

    /// Check if this state satisfies a goal state.
    ///
    /// Returns true if all bits set in `goal` are also set in this state.
    pub fn satisfies(&self, goal: GoapGoal) -> bool {
        (self.0 & goal.0) == goal.0
    }

    /// Count the number of bits set.
    pub fn count_bits(&self) -> u32 {
        self.0.count_ones()
    }

    /// Get the raw bitset value.
    pub fn bits(&self) -> u64 {
        self.0
    }
}

/// GOAP goal state represented as a bitset.
///
/// The goal is satisfied when all bits set in this state
/// are also set in the world state.
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct GoapGoal(pub u64);

impl GoapGoal {
    /// Create a new empty goal.
    pub fn new() -> Self {
        Self(0)
    }

    /// Create a goal from a raw bitset.
    pub fn from_bits(bits: u64) -> Self {
        Self(bits)
    }

    /// Set a required bit for this goal.
    pub fn require_bit(&mut self, bit: u32) {
        self.0 |= 1 << bit;
    }

    /// Remove a required bit from this goal.
    pub fn remove_bit(&mut self, bit: u32) {
        self.0 &= !(1 << bit);
    }

    /// Check if a specific bit is required.
    pub fn requires_bit(&self, bit: u32) -> bool {
        (self.0 & (1 << bit)) != 0
    }

    /// Get the raw bitset value.
    pub fn bits(&self) -> u64 {
        self.0
    }
}

/// Status of GOAP planning for an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GoapStatus {
    /// No plan is active; agent is idle.
    Idle,
    /// Currently planning (searching for a valid plan).
    Planning,
    /// Executing a plan with the given number of steps.
    Executing { steps_total: usize, steps_done: usize },
    /// Plan completed successfully.
    Completed,
    /// Planning failed (no valid plan found).
    Failed,
}

impl Default for GoapStatus {
    fn default() -> Self {
        Self::Idle
    }
}

/// Component tracking the current GOAP planning status.
#[derive(Component, Debug, Clone, Default)]
pub struct GoapPlanStatus {
    /// Current status of the GOAP system.
    pub status: GoapStatus,
    /// Last plan key (start, goal, signature) for cache tracking.
    pub last_plan_key: Option<GoapPlanKey>,
    /// Names of actions in the current plan (for debugging).
    pub plan_action_names: Vec<&'static str>,
    /// Current action index being executed.
    pub current_action_index: usize,
}

impl GoapPlanStatus {
    /// Update status when a new plan is created.
    pub fn set_executing(&mut self, action_names: Vec<&'static str>) {
        self.status = GoapStatus::Executing {
            steps_total: action_names.len(),
            steps_done: 0,
        };
        self.plan_action_names = action_names;
        self.current_action_index = 0;
    }

    /// Mark an action as completed.
    pub fn action_completed(&mut self) {
        self.current_action_index += 1;
        if let GoapStatus::Executing { steps_total, .. } = &mut self.status {
            self.status = GoapStatus::Executing {
                steps_total: *steps_total,
                steps_done: self.current_action_index,
            };
        }
    }

    /// Mark the plan as completed.
    pub fn set_completed(&mut self) {
        self.status = GoapStatus::Completed;
    }

    /// Mark planning as failed.
    pub fn set_failed(&mut self) {
        self.status = GoapStatus::Failed;
        self.plan_action_names.clear();
    }

    /// Get the current action name, if executing.
    pub fn current_action_name(&self) -> Option<&'static str> {
        self.plan_action_names.get(self.current_action_index).copied()
    }
}

/// Key for GOAP plan caching.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GoapPlanKey {
    /// Starting world state.
    pub start: u64,
    /// Goal state.
    pub goal: u64,
    /// Invalidation signature.
    pub signature: u64,
}

/// Event emitted when GOAP planning status changes.
#[derive(Event, Debug, Clone)]
pub struct GoapPlanEvent {
    /// The entity whose plan status changed.
    pub entity: Entity,
    /// The previous status.
    pub previous: GoapStatus,
    /// The new status.
    pub current: GoapStatus,
    /// Plan action names (if new plan started).
    pub plan_actions: Option<Vec<&'static str>>,
}

/// Event emitted when a GOAP action starts execution.
#[derive(Event, Debug, Clone)]
pub struct GoapActionStarted {
    /// The entity executing the action.
    pub entity: Entity,
    /// Name of the action.
    pub action_name: &'static str,
    /// Index in the plan.
    pub action_index: usize,
    /// Total actions in plan.
    pub total_actions: usize,
}

/// Event emitted when a GOAP action completes.
#[derive(Event, Debug, Clone)]
pub struct GoapActionCompleted {
    /// The entity that completed the action.
    pub entity: Entity,
    /// Name of the completed action.
    pub action_name: &'static str,
    /// Whether the action succeeded.
    pub success: bool,
}

/// Configuration for GOAP debugging and visualization.
#[derive(Resource, Debug, Clone)]
pub struct GoapDebugConfig {
    /// Show current world state bits.
    pub show_world_state: bool,
    /// Show goal state bits.
    pub show_goal_state: bool,
    /// Show current plan.
    pub show_plan: bool,
    /// Show planning statistics.
    pub show_stats: bool,
    /// Bit names for display (optional).
    pub bit_names: Vec<&'static str>,
}

impl Default for GoapDebugConfig {
    fn default() -> Self {
        Self {
            show_world_state: true,
            show_goal_state: true,
            show_plan: true,
            show_stats: false,
            bit_names: Vec::new(),
        }
    }
}

impl GoapDebugConfig {
    /// Set bit names for debugging display.
    pub fn with_bit_names(mut self, names: Vec<&'static str>) -> Self {
        self.bit_names = names;
        self
    }

    /// Get the name of a bit, or a default "Bit N" name.
    pub fn bit_name(&self, bit: u32) -> String {
        self.bit_names
            .get(bit as usize)
            .copied()
            .map(String::from)
            .unwrap_or_else(|| format!("Bit{}", bit))
    }
}

/// System that detects changes in GoapPlanStatus and emits events.
pub fn emit_goap_plan_events(
    mut events: EventWriter<GoapPlanEvent>,
    query: Query<(Entity, &GoapPlanStatus), Changed<GoapPlanStatus>>,
    mut previous_statuses: Local<std::collections::HashMap<Entity, GoapStatus>>,
) {
    for (entity, status) in query.iter() {
        let previous = previous_statuses
            .get(&entity)
            .copied()
            .unwrap_or(GoapStatus::Idle);

        if previous != status.status {
            let plan_actions = if matches!(status.status, GoapStatus::Executing { .. }) {
                Some(status.plan_action_names.clone())
            } else {
                None
            };

            events.write(GoapPlanEvent {
                entity,
                previous,
                current: status.status,
                plan_actions,
            });

            previous_statuses.insert(entity, status.status);
        }
    }
}

/// System that syncs GoapWorldState from game world conditions.
///
/// This is a placeholder that users should replace with their own
/// logic to set world state bits based on game conditions.
pub fn sync_goap_world_state(
    mut query: Query<(&mut GoapWorldState, &crate::AiPosition)>,
) {
    // Example: Set bits based on position or other conditions
    // Users should implement their own sync logic
    for (_state, _pos) in query.iter_mut() {
        // Example conditions:
        // if pos.0.x < 0.0 { state.set_bit(0); } // Bit 0: InLeftArea
        // etc.
    }
}

/// Bundle for a GOAP-enabled AI agent.
#[derive(Bundle, Default)]
pub struct GoapAgentBundle {
    /// Current world state.
    pub world_state: GoapWorldState,
    /// Current goal.
    pub goal: GoapGoal,
    /// Plan status tracking.
    pub status: GoapPlanStatus,
}

impl GoapAgentBundle {
    /// Create a new GOAP agent bundle with initial state and goal.
    pub fn new(initial_state: u64, goal: u64) -> Self {
        Self {
            world_state: GoapWorldState::from_bits(initial_state),
            goal: GoapGoal::from_bits(goal),
            status: GoapPlanStatus::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_world_state_bits() {
        let mut state = GoapWorldState::new();
        assert_eq!(state.bits(), 0);

        state.set_bit(0);
        assert!(state.has_bit(0));
        assert!(!state.has_bit(1));

        state.set_bit(5);
        assert!(state.has_bit(5));

        state.clear_bit(0);
        assert!(!state.has_bit(0));
        assert!(state.has_bit(5));
    }

    #[test]
    fn test_goal_satisfaction() {
        let mut state = GoapWorldState::new();
        state.set_bit(0);
        state.set_bit(2);
        state.set_bit(4);

        let mut goal = GoapGoal::new();
        goal.require_bit(0);
        goal.require_bit(2);
        assert!(state.satisfies(goal));

        goal.require_bit(1); // Bit 1 is not set in state
        assert!(!state.satisfies(goal));
    }

    #[test]
    fn test_plan_status() {
        let mut status = GoapPlanStatus::default();
        assert_eq!(status.status, GoapStatus::Idle);

        status.set_executing(vec!["MoveTo", "Attack", "Flee"]);
        assert!(matches!(status.status, GoapStatus::Executing { steps_total: 3, steps_done: 0 }));
        assert_eq!(status.current_action_name(), Some("MoveTo"));

        status.action_completed();
        assert!(matches!(status.status, GoapStatus::Executing { steps_total: 3, steps_done: 1 }));
        assert_eq!(status.current_action_name(), Some("Attack"));

        status.action_completed();
        status.action_completed();
        status.set_completed();
        assert_eq!(status.status, GoapStatus::Completed);
    }

    #[test]
    fn test_debug_config_bit_names() {
        let config = GoapDebugConfig::default()
            .with_bit_names(vec!["HasWeapon", "TargetVisible", "InCover"]);

        assert_eq!(config.bit_name(0), "HasWeapon");
        assert_eq!(config.bit_name(1), "TargetVisible");
        assert_eq!(config.bit_name(2), "InCover");
        assert_eq!(config.bit_name(10), "Bit10"); // Fallback
    }

    #[test]
    fn test_goap_agent_bundle() {
        let bundle = GoapAgentBundle::new(0b101, 0b111);
        assert_eq!(bundle.world_state.bits(), 0b101);
        assert_eq!(bundle.goal.bits(), 0b111);
    }
}
