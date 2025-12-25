//! Runner - executes tasks in workcells using toolchains.

use std::path::Path;

use anyhow::Result;

use crate::adapters::Toolchain;
use crate::config::KernelConfig;
use crate::state::Issue;
use crate::workcell::WorkcellManager;

/// Runner executes issues in isolated workcells.
pub struct Runner {
    config: KernelConfig,
    workcell_manager: WorkcellManager,
}

impl Runner {
    pub fn new(config: KernelConfig, project_root: &Path) -> Result<Self> {
        let workcell_manager = WorkcellManager::new(config.clone(), project_root)?;
        Ok(Self {
            config,
            workcell_manager,
        })
    }

    /// Run an issue with the specified toolchain
    pub async fn run(
        &self,
        issue: &Issue,
        toolchain: Toolchain,
    ) -> Result<RunResult> {
        // Create workcell
        let workcell_path = self.workcell_manager.create(&issue.id, None)?;

        // Execute toolchain
        let result = toolchain.execute(issue, &workcell_path).await;

        // Capture result
        let run_result = match result {
            Ok(output) => RunResult {
                success: true,
                workcell_path: workcell_path.clone(),
                output: Some(output),
                error: None,
            },
            Err(e) => RunResult {
                success: false,
                workcell_path: workcell_path.clone(),
                output: None,
                error: Some(e.to_string()),
            },
        };

        Ok(run_result)
    }

    /// Get workcell manager for cleanup operations
    pub fn workcell_manager(&self) -> &WorkcellManager {
        &self.workcell_manager
    }
}

/// Result of running a task.
#[derive(Debug)]
pub struct RunResult {
    pub success: bool,
    pub workcell_path: std::path::PathBuf,
    pub output: Option<String>,
    pub error: Option<String>,
}
