//! HTN (Hierarchical Task Network) integration for Bevy.
//!
//! This module bridges `ai-htn` with Bevy ECS, providing:
//! - Components for tracking HTN plan execution
//! - Events for task decomposition and execution
//! - Debug visualization for HTN plans
//!
//! ## Architecture
//!
//! HTN planning in Bevy works through these components:
//! - `HtnPlanStatus`: Current plan execution state
//! - `HtnTaskStack`: Track of current task decomposition
//! - `HtnWorldState`: The planning world state (generic)
//!
//! The actual planning is done through `ai-htn::HtnPlanner` which
//! decomposes compound tasks into primitive operators.

use bevy_ecs::prelude::*;

pub use ai_htn::{CompoundTask, HtnPlannerConfig, OperatorId, Task};

/// Status of HTN plan execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HtnStatus {
    /// No plan is active.
    #[default]
    Idle,
    /// Planning in progress.
    Planning,
    /// Executing a plan.
    Executing,
    /// Plan completed successfully.
    Completed,
    /// Planning or execution failed.
    Failed,
}

/// Component tracking HTN plan execution status.
#[derive(Component, Debug, Clone, Default)]
pub struct HtnPlanStatus {
    /// Current status.
    pub status: HtnStatus,
    /// Current operator being executed.
    pub current_operator: Option<OperatorId>,
    /// Index of current operator in the plan.
    pub current_index: usize,
    /// Total operators in the plan.
    pub total_operators: usize,
    /// Names of operators in the current plan.
    pub plan_operators: Vec<&'static str>,
    /// Number of task expansions used in planning.
    pub expansions_used: usize,
    /// Whether the plan just completed this tick.
    pub just_completed: bool,
}

impl HtnPlanStatus {
    /// Start executing a new plan.
    pub fn set_executing(&mut self, operators: Vec<&'static str>) {
        self.status = HtnStatus::Executing;
        self.total_operators = operators.len();
        self.plan_operators = operators;
        self.current_index = 0;
        self.current_operator = self.plan_operators.first().map(|&s| OperatorId(s));
        self.just_completed = false;
    }

    /// Advance to the next operator.
    pub fn advance(&mut self) {
        self.current_index += 1;
        if self.current_index >= self.total_operators {
            self.status = HtnStatus::Completed;
            self.current_operator = None;
            self.just_completed = true;
        } else {
            self.current_operator = self.plan_operators.get(self.current_index).map(|&s| OperatorId(s));
        }
    }

    /// Mark as failed.
    pub fn set_failed(&mut self) {
        self.status = HtnStatus::Failed;
        self.current_operator = None;
        self.just_completed = false;
    }

    /// Reset to idle.
    pub fn reset(&mut self) {
        self.status = HtnStatus::Idle;
        self.current_operator = None;
        self.current_index = 0;
        self.total_operators = 0;
        self.plan_operators.clear();
        self.just_completed = false;
    }

    /// Get progress as a fraction (0.0 to 1.0).
    pub fn progress(&self) -> f32 {
        if self.total_operators == 0 {
            0.0
        } else {
            self.current_index as f32 / self.total_operators as f32
        }
    }
}

/// Component tracking the task decomposition stack.
///
/// This shows the hierarchical structure of task decomposition for debugging.
#[derive(Component, Debug, Clone, Default)]
pub struct HtnTaskStack {
    /// Stack of tasks being processed (compound tasks being decomposed).
    pub stack: Vec<HtnTaskInfo>,
    /// History of decomposition choices made.
    pub decomposition_history: Vec<HtnDecomposition>,
}

/// Information about a task in the stack.
#[derive(Debug, Clone)]
pub struct HtnTaskInfo {
    /// Task identifier.
    pub task: HtnTaskType,
    /// Method chosen for decomposition (if compound).
    pub method_name: Option<&'static str>,
    /// Depth in the decomposition tree.
    pub depth: usize,
}

/// Type of task (mirrors ai_htn::Task).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HtnTaskType {
    /// Compound task that decomposes into subtasks.
    Compound(&'static str),
    /// Primitive operator that executes directly.
    Primitive(&'static str),
}

impl From<Task> for HtnTaskType {
    fn from(task: Task) -> Self {
        match task {
            Task::Compound(c) => HtnTaskType::Compound(c.0),
            Task::Primitive(p) => HtnTaskType::Primitive(p.0),
        }
    }
}

/// Record of a decomposition choice.
#[derive(Debug, Clone)]
pub struct HtnDecomposition {
    /// The compound task that was decomposed.
    pub compound_task: &'static str,
    /// The method chosen.
    pub method_name: &'static str,
    /// Resulting subtasks.
    pub subtasks: Vec<HtnTaskType>,
    /// Tick when decomposition occurred.
    pub tick: u64,
}

impl HtnTaskStack {
    /// Push a task onto the stack.
    pub fn push(&mut self, info: HtnTaskInfo) {
        self.stack.push(info);
    }

    /// Pop a task from the stack.
    pub fn pop(&mut self) -> Option<HtnTaskInfo> {
        self.stack.pop()
    }

    /// Record a decomposition choice.
    pub fn record_decomposition(
        &mut self,
        compound_task: &'static str,
        method_name: &'static str,
        subtasks: Vec<HtnTaskType>,
        tick: u64,
    ) {
        self.decomposition_history.push(HtnDecomposition {
            compound_task,
            method_name,
            subtasks,
            tick,
        });
    }

    /// Clear the stack for a new planning session.
    pub fn clear(&mut self) {
        self.stack.clear();
    }

    /// Clear history (but not the current stack).
    pub fn clear_history(&mut self) {
        self.decomposition_history.clear();
    }

    /// Get current depth in the task hierarchy.
    pub fn depth(&self) -> usize {
        self.stack.len()
    }
}

/// Event emitted when HTN status changes.
#[derive(Event, Debug, Clone)]
pub struct HtnStatusChanged {
    /// The entity whose status changed.
    pub entity: Entity,
    /// Previous status.
    pub previous: HtnStatus,
    /// New status.
    pub current: HtnStatus,
}

/// Event emitted when an HTN operator starts execution.
#[derive(Event, Debug, Clone)]
pub struct HtnOperatorStarted {
    /// The entity executing the operator.
    pub entity: Entity,
    /// The operator being executed.
    pub operator: OperatorId,
    /// Index in the plan.
    pub index: usize,
    /// Total operators in plan.
    pub total: usize,
}

/// Event emitted when an HTN operator completes.
#[derive(Event, Debug, Clone)]
pub struct HtnOperatorCompleted {
    /// The entity that completed the operator.
    pub entity: Entity,
    /// The completed operator.
    pub operator: OperatorId,
    /// Whether it succeeded.
    pub success: bool,
}

/// Event emitted when a compound task is decomposed.
#[derive(Event, Debug, Clone)]
pub struct HtnTaskDecomposed {
    /// The entity doing the decomposition.
    pub entity: Entity,
    /// The compound task that was decomposed.
    pub compound_task: CompoundTask,
    /// The method chosen.
    pub method_name: &'static str,
    /// Number of resulting subtasks.
    pub subtask_count: usize,
}

/// Configuration for HTN debugging.
#[derive(Resource, Debug, Clone)]
pub struct HtnDebugConfig {
    /// Show current plan operators.
    pub show_plan: bool,
    /// Show task decomposition stack.
    pub show_stack: bool,
    /// Show decomposition history.
    pub show_history: bool,
    /// Show planning statistics.
    pub show_stats: bool,
    /// Maximum history entries to keep.
    pub max_history_entries: usize,
}

impl Default for HtnDebugConfig {
    fn default() -> Self {
        Self {
            show_plan: true,
            show_stack: true,
            show_history: false,
            show_stats: true,
            max_history_entries: 50,
        }
    }
}

/// System that detects changes in HtnPlanStatus and emits events.
pub fn emit_htn_status_events(
    mut events: EventWriter<HtnStatusChanged>,
    query: Query<(Entity, &HtnPlanStatus), Changed<HtnPlanStatus>>,
    mut previous_statuses: Local<std::collections::HashMap<Entity, HtnStatus>>,
) {
    for (entity, status) in query.iter() {
        let previous = previous_statuses
            .get(&entity)
            .copied()
            .unwrap_or(HtnStatus::Idle);

        if previous != status.status {
            events.write(HtnStatusChanged {
                entity,
                previous,
                current: status.status,
            });

            previous_statuses.insert(entity, status.status);
        }
    }
}

/// Bundle for an HTN-enabled AI agent.
#[derive(Bundle, Default)]
pub struct HtnAgentBundle {
    /// Plan execution status.
    pub status: HtnPlanStatus,
    /// Task decomposition stack.
    pub stack: HtnTaskStack,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_htn_status() {
        let mut status = HtnPlanStatus::default();
        assert_eq!(status.status, HtnStatus::Idle);

        status.set_executing(vec!["MoveTo", "PickUp", "Return"]);
        assert_eq!(status.status, HtnStatus::Executing);
        assert_eq!(status.total_operators, 3);
        assert_eq!(status.current_operator, Some(OperatorId("MoveTo")));
        assert_eq!(status.progress(), 0.0);

        status.advance();
        assert_eq!(status.current_index, 1);
        assert_eq!(status.current_operator, Some(OperatorId("PickUp")));
        assert!((status.progress() - 0.333).abs() < 0.01);

        status.advance();
        status.advance();
        assert_eq!(status.status, HtnStatus::Completed);
        assert!(status.just_completed);
    }

    #[test]
    fn test_htn_task_type_conversion() {
        let compound = Task::Compound(CompoundTask("DoWork"));
        let primitive = Task::Primitive(OperatorId("Walk"));

        assert_eq!(HtnTaskType::from(compound), HtnTaskType::Compound("DoWork"));
        assert_eq!(HtnTaskType::from(primitive), HtnTaskType::Primitive("Walk"));
    }

    #[test]
    fn test_htn_task_stack() {
        let mut stack = HtnTaskStack::default();
        assert_eq!(stack.depth(), 0);

        stack.push(HtnTaskInfo {
            task: HtnTaskType::Compound("Root"),
            method_name: Some("DefaultMethod"),
            depth: 0,
        });
        assert_eq!(stack.depth(), 1);

        stack.record_decomposition(
            "Root",
            "DefaultMethod",
            vec![HtnTaskType::Primitive("Walk"), HtnTaskType::Primitive("Talk")],
            1,
        );
        assert_eq!(stack.decomposition_history.len(), 1);

        let popped = stack.pop();
        assert!(popped.is_some());
        assert_eq!(stack.depth(), 0);
    }

    #[test]
    fn test_htn_agent_bundle() {
        let bundle = HtnAgentBundle::default();
        assert_eq!(bundle.status.status, HtnStatus::Idle);
        assert!(bundle.stack.stack.is_empty());
    }
}
