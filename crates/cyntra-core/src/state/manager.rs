//! State manager - persistent state operations.

use std::path::{Path, PathBuf};

use anyhow::Result;

use super::graph::BeadsGraph;
use super::issue::Issue;

/// Manages persistent state for the kernel.
pub struct StateManager {
    project_root: PathBuf,
    graph: BeadsGraph,
}

impl StateManager {
    /// Create a new state manager for a project
    pub fn new(project_root: &Path) -> Result<Self> {
        let graph = BeadsGraph::load(project_root)?;
        Ok(Self {
            project_root: project_root.to_path_buf(),
            graph,
        })
    }

    /// Get the beads graph
    pub fn graph(&self) -> &BeadsGraph {
        &self.graph
    }

    /// Get mutable beads graph
    pub fn graph_mut(&mut self) -> &mut BeadsGraph {
        &mut self.graph
    }

    /// Reload the graph from disk
    pub fn reload(&mut self) -> Result<()> {
        self.graph = BeadsGraph::load(&self.project_root)?;
        Ok(())
    }

    /// Persist changes to an issue
    pub fn persist_issue(&self, issue: &Issue) -> Result<()> {
        // TODO: Write back to .beads/issues.jsonl
        // For now this is a no-op
        let _ = issue;
        Ok(())
    }
}
