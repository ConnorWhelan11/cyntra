//! Beads graph - dependency graph of all issues.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use anyhow::{Context, Result};

use super::issue::{Issue, IssueStatus};

/// The Beads work graph - all issues and their dependencies.
#[derive(Debug, Default)]
pub struct BeadsGraph {
    /// All issues by ID
    issues: HashMap<String, Issue>,
    /// Completed issue IDs
    completed: HashSet<String>,
}

impl BeadsGraph {
    /// Load the beads graph from .beads/issues.jsonl
    pub fn load(project_root: &Path) -> Result<Self> {
        let issues_path = project_root.join(".beads/issues.jsonl");
        let deps_path = project_root.join(".beads/deps.jsonl");

        let mut graph = Self::default();

        // Load issues
        if issues_path.exists() {
            let content = std::fs::read_to_string(&issues_path)
                .with_context(|| format!("Failed to read {}", issues_path.display()))?;

            for line in content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                let issue: Issue = serde_json::from_str(line)
                    .with_context(|| format!("Failed to parse issue: {}", line))?;

                if issue.status == IssueStatus::Completed {
                    graph.completed.insert(issue.id.clone());
                }
                graph.issues.insert(issue.id.clone(), issue);
            }
        }

        // Load dependencies (optional file)
        if deps_path.exists() {
            let content = std::fs::read_to_string(&deps_path)?;
            for line in content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(dep) = serde_json::from_str::<Dependency>(line) {
                    if let Some(issue) = graph.issues.get_mut(&dep.issue_id) {
                        issue.depends_on.push(dep.depends_on);
                    }
                }
            }
        }

        Ok(graph)
    }

    /// Get all issues
    pub fn all_issues(&self) -> impl Iterator<Item = &Issue> {
        self.issues.values()
    }

    /// Get an issue by ID
    pub fn get(&self, id: &str) -> Option<&Issue> {
        self.issues.get(id)
    }

    /// Get a mutable issue by ID
    pub fn get_mut(&mut self, id: &str) -> Option<&mut Issue> {
        self.issues.get_mut(id)
    }

    /// Get all ready issues (open with all deps satisfied)
    pub fn ready_issues(&self) -> Vec<&Issue> {
        let completed: Vec<String> = self.completed.iter().cloned().collect();
        self.issues
            .values()
            .filter(|i| i.is_ready(&completed))
            .collect()
    }

    /// Get all completed issue IDs
    pub fn completed_ids(&self) -> &HashSet<String> {
        &self.completed
    }

    /// Mark an issue as completed
    pub fn mark_completed(&mut self, id: &str) {
        if let Some(issue) = self.issues.get_mut(id) {
            issue.status = IssueStatus::Completed;
        }
        self.completed.insert(id.to_string());
    }

    /// Mark an issue as in progress
    pub fn mark_in_progress(&mut self, id: &str, workcell: &str) {
        if let Some(issue) = self.issues.get_mut(id) {
            issue.status = IssueStatus::InProgress;
            issue.assigned_workcell = Some(workcell.to_string());
        }
    }

    /// Mark an issue as failed
    pub fn mark_failed(&mut self, id: &str) {
        if let Some(issue) = self.issues.get_mut(id) {
            issue.status = IssueStatus::Failed;
            issue.retry_count += 1;
        }
    }

    /// Compute critical path through the graph
    pub fn critical_path(&self) -> Vec<&Issue> {
        // Simple implementation: longest path by total size_hours
        let ready = self.ready_issues();
        let mut path: Vec<&Issue> = ready.into_iter().collect();
        path.sort_by(|a, b| b.size_hours().cmp(&a.size_hours()));
        path
    }
}

#[derive(Debug, serde::Deserialize)]
struct Dependency {
    issue_id: String,
    depends_on: String,
}
