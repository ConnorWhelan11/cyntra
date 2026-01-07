//! Behavior Tree integration for Bevy.
//!
//! This module bridges `ai-bt` with Bevy ECS, providing:
//! - Components for tracking BT execution status
//! - Events for node status changes
//! - Debug visualization for BT execution
//!
//! ## Architecture
//!
//! Behavior trees in Bevy work through these components:
//! - `BtExecutionStatus`: Current execution state of the BT
//! - `BtNodePath`: Tracks the path through the tree for debugging
//!
//! The actual BT execution happens through `ai-bt::BtPolicy` which is
//! stored in the agent's `Brain`.

use bevy_ecs::prelude::*;

pub use ai_bt::BtStatus;

/// Component tracking BT execution status.
#[derive(Component, Debug, Clone, Default)]
pub struct BtExecutionStatus {
    /// Current status of the root node.
    pub status: BtStatusComponent,
    /// Number of ticks since the BT started.
    pub ticks_running: u64,
    /// Whether the BT completed this frame.
    pub just_completed: bool,
    /// Last completion result (if completed).
    pub last_result: Option<BtStatusComponent>,
}

/// Bevy-compatible version of BtStatus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BtStatusComponent {
    #[default]
    Idle,
    Running,
    Success,
    Failure,
}

impl From<BtStatus> for BtStatusComponent {
    fn from(status: BtStatus) -> Self {
        match status {
            BtStatus::Running => Self::Running,
            BtStatus::Success => Self::Success,
            BtStatus::Failure => Self::Failure,
        }
    }
}

impl BtExecutionStatus {
    /// Mark the BT as running.
    pub fn set_running(&mut self) {
        self.status = BtStatusComponent::Running;
        self.ticks_running += 1;
        self.just_completed = false;
    }

    /// Mark the BT as completed with a result.
    pub fn set_completed(&mut self, result: BtStatusComponent) {
        self.status = result;
        self.last_result = Some(result);
        self.just_completed = true;
        self.ticks_running = 0;
    }

    /// Reset for a new BT execution.
    pub fn reset(&mut self) {
        self.status = BtStatusComponent::Idle;
        self.ticks_running = 0;
        self.just_completed = false;
    }
}

/// Component tracking the current path through the BT.
///
/// This is useful for debugging to see which nodes are active.
#[derive(Component, Debug, Clone, Default)]
pub struct BtNodePath {
    /// Stack of node names/indices representing the current path.
    pub path: Vec<BtNodeInfo>,
    /// The deepest node that was ticked this frame.
    pub active_leaf: Option<BtNodeInfo>,
}

/// Information about a BT node for debugging.
#[derive(Debug, Clone)]
pub struct BtNodeInfo {
    /// Node name or identifier.
    pub name: String,
    /// Node type (Selector, Sequence, Condition, Action, etc.).
    pub node_type: BtNodeType,
    /// Current status of this node.
    pub status: BtStatusComponent,
    /// Child index if applicable.
    pub child_index: Option<usize>,
}

/// Type of BT node for display purposes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BtNodeType {
    /// Selector (fallback) - tries children until one succeeds.
    Selector,
    /// Sequence - runs children in order until one fails.
    Sequence,
    /// Condition - checks a predicate.
    Condition,
    /// Action - executes a game action.
    Action,
    /// Decorator - modifies child behavior.
    Decorator,
    /// Custom node type.
    Custom,
}

impl BtNodePath {
    /// Push a node onto the path.
    pub fn push(&mut self, info: BtNodeInfo) {
        self.path.push(info);
    }

    /// Pop a node from the path.
    pub fn pop(&mut self) -> Option<BtNodeInfo> {
        self.path.pop()
    }

    /// Set the active leaf node.
    pub fn set_active_leaf(&mut self, info: BtNodeInfo) {
        self.active_leaf = Some(info);
    }

    /// Clear the path for a new tick.
    pub fn clear(&mut self) {
        self.path.clear();
        self.active_leaf = None;
    }

    /// Get the current depth in the tree.
    pub fn depth(&self) -> usize {
        self.path.len()
    }

    /// Get a string representation of the path.
    pub fn path_string(&self) -> String {
        self.path
            .iter()
            .map(|n| n.name.as_str())
            .collect::<Vec<_>>()
            .join(" > ")
    }
}

/// Event emitted when BT status changes.
#[derive(Event, Debug, Clone)]
pub struct BtStatusChanged {
    /// The entity whose BT status changed.
    pub entity: Entity,
    /// Previous status.
    pub previous: BtStatusComponent,
    /// New status.
    pub current: BtStatusComponent,
    /// Ticks the BT was running before completion.
    pub ticks_running: u64,
}

/// Event emitted when a BT node is entered.
#[derive(Event, Debug, Clone)]
pub struct BtNodeEntered {
    /// The entity whose BT is executing.
    pub entity: Entity,
    /// Information about the node.
    pub node: BtNodeInfo,
    /// Current depth in the tree.
    pub depth: usize,
}

/// Event emitted when a BT node completes.
#[derive(Event, Debug, Clone)]
pub struct BtNodeCompleted {
    /// The entity whose BT is executing.
    pub entity: Entity,
    /// Information about the completed node.
    pub node: BtNodeInfo,
    /// Result status.
    pub result: BtStatusComponent,
}

/// Configuration for BT debugging.
#[derive(Resource, Debug, Clone)]
pub struct BtDebugConfig {
    /// Show current BT path.
    pub show_path: bool,
    /// Show node status colors.
    pub show_status_colors: bool,
    /// Show tick count.
    pub show_tick_count: bool,
    /// Log node entries.
    pub log_node_entries: bool,
    /// Log node completions.
    pub log_node_completions: bool,
}

impl Default for BtDebugConfig {
    fn default() -> Self {
        Self {
            show_path: true,
            show_status_colors: true,
            show_tick_count: true,
            log_node_entries: false,
            log_node_completions: false,
        }
    }
}

/// System that detects changes in BtExecutionStatus and emits events.
pub fn emit_bt_status_events(
    mut events: EventWriter<BtStatusChanged>,
    query: Query<(Entity, &BtExecutionStatus), Changed<BtExecutionStatus>>,
    mut previous_statuses: Local<std::collections::HashMap<Entity, BtStatusComponent>>,
) {
    for (entity, status) in query.iter() {
        let previous = previous_statuses
            .get(&entity)
            .copied()
            .unwrap_or(BtStatusComponent::Idle);

        if previous != status.status {
            events.write(BtStatusChanged {
                entity,
                previous,
                current: status.status,
                ticks_running: status.ticks_running,
            });

            previous_statuses.insert(entity, status.status);
        }
    }
}

/// Bundle for a BT-enabled AI agent.
#[derive(Bundle, Default)]
pub struct BtAgentBundle {
    /// Execution status tracking.
    pub status: BtExecutionStatus,
    /// Node path tracking.
    pub path: BtNodePath,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bt_status_conversion() {
        assert_eq!(BtStatusComponent::from(BtStatus::Running), BtStatusComponent::Running);
        assert_eq!(BtStatusComponent::from(BtStatus::Success), BtStatusComponent::Success);
        assert_eq!(BtStatusComponent::from(BtStatus::Failure), BtStatusComponent::Failure);
    }

    #[test]
    fn test_execution_status() {
        let mut status = BtExecutionStatus::default();
        assert_eq!(status.status, BtStatusComponent::Idle);

        status.set_running();
        assert_eq!(status.status, BtStatusComponent::Running);
        assert_eq!(status.ticks_running, 1);
        assert!(!status.just_completed);

        status.set_running();
        assert_eq!(status.ticks_running, 2);

        status.set_completed(BtStatusComponent::Success);
        assert_eq!(status.status, BtStatusComponent::Success);
        assert!(status.just_completed);
        assert_eq!(status.last_result, Some(BtStatusComponent::Success));
        assert_eq!(status.ticks_running, 0);
    }

    #[test]
    fn test_node_path() {
        let mut path = BtNodePath::default();
        assert_eq!(path.depth(), 0);

        path.push(BtNodeInfo {
            name: "Root".to_string(),
            node_type: BtNodeType::Selector,
            status: BtStatusComponent::Running,
            child_index: None,
        });
        assert_eq!(path.depth(), 1);

        path.push(BtNodeInfo {
            name: "Attack".to_string(),
            node_type: BtNodeType::Sequence,
            status: BtStatusComponent::Running,
            child_index: Some(0),
        });
        assert_eq!(path.depth(), 2);
        assert_eq!(path.path_string(), "Root > Attack");

        let popped = path.pop();
        assert!(popped.is_some());
        assert_eq!(path.depth(), 1);
    }

    #[test]
    fn test_bt_agent_bundle() {
        let bundle = BtAgentBundle::default();
        assert_eq!(bundle.status.status, BtStatusComponent::Idle);
        assert!(bundle.path.path.is_empty());
    }
}
