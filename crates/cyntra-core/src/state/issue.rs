//! Issue model - represents a single work item from Beads.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A single issue/task from the Beads work graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    /// Unique identifier
    pub id: String,

    /// Issue title
    pub title: String,

    /// Detailed description/body
    #[serde(default)]
    pub body: String,

    /// Current status
    #[serde(default)]
    pub status: IssueStatus,

    /// Labels attached to this issue
    #[serde(default)]
    pub labels: Vec<String>,

    /// Dependencies (issue IDs that must complete first)
    #[serde(default)]
    pub depends_on: Vec<String>,

    /// Issues that depend on this one
    #[serde(default)]
    pub blocks: Vec<String>,

    /// Risk level (low, medium, high, critical)
    #[serde(default)]
    pub dk_risk: Option<String>,

    /// Size estimate (XS, S, M, L, XL)
    #[serde(default)]
    pub dk_size: Option<String>,

    /// Forced toolchain hint
    #[serde(default)]
    pub dk_tool_hint: Option<String>,

    /// Estimated tokens for this task
    #[serde(default)]
    pub dk_estimated_tokens: Option<usize>,

    /// When the issue was created
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,

    /// When the issue was last updated
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,

    /// Assigned workcell (if in progress)
    #[serde(default)]
    pub assigned_workcell: Option<String>,

    /// Number of retry attempts
    #[serde(default)]
    pub retry_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueStatus {
    #[default]
    Open,
    Ready,
    #[serde(alias = "inprogress", alias = "running")]
    InProgress,
    Completed,
    #[serde(alias = "done")]
    Done,
    Failed,
    Blocked,
    Cancelled,
    #[serde(alias = "pending")]
    Pending,
    #[serde(other)]
    Unknown,
}

impl Issue {
    /// Check if this issue is ready to be worked on (all deps satisfied)
    pub fn is_ready(&self, completed: &[String]) -> bool {
        matches!(self.status, IssueStatus::Open | IssueStatus::Ready)
            && self.depends_on.iter().all(|dep| completed.contains(dep))
    }

    /// Check if this issue is high-risk (triggers speculation)
    pub fn is_high_risk(&self) -> bool {
        matches!(
            self.dk_risk.as_deref(),
            Some("high") | Some("critical")
        )
    }

    /// Get size in hours for scheduling
    pub fn size_hours(&self) -> usize {
        match self.dk_size.as_deref() {
            Some("XS") => 1,
            Some("S") => 2,
            Some("M") => 4,
            Some("L") => 8,
            Some("XL") => 16,
            _ => 4, // Default to M
        }
    }

    /// Get estimated tokens (with default)
    pub fn estimated_tokens(&self) -> usize {
        self.dk_estimated_tokens.unwrap_or(50_000)
    }
}

impl Default for Issue {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: String::new(),
            body: String::new(),
            status: IssueStatus::default(),
            labels: Vec::new(),
            depends_on: Vec::new(),
            blocks: Vec::new(),
            dk_risk: None,
            dk_size: None,
            dk_tool_hint: None,
            dk_estimated_tokens: None,
            created_at: None,
            updated_at: None,
            assigned_workcell: None,
            retry_count: 0,
        }
    }
}
