//! Workcell management - isolated git worktree environments.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::config::KernelConfig;

/// Manages isolated git worktree execution environments.
pub struct WorkcellManager {
    config: KernelConfig,
    repo_root: PathBuf,
}

/// Workcell metadata marker.
#[derive(Debug, Serialize, Deserialize)]
pub struct WorkcellMarker {
    pub id: String,
    pub issue_id: String,
    pub created: String,
    pub parent_commit: String,
    pub speculate_tag: Option<String>,
}

impl WorkcellManager {
    /// Create a new workcell manager.
    pub fn new(config: KernelConfig, repo_root: &Path) -> Result<Self> {
        // Ensure directories exist
        std::fs::create_dir_all(&config.workcells_dir)?;
        std::fs::create_dir_all(&config.archives_dir)?;

        Ok(Self {
            config,
            repo_root: repo_root.to_path_buf(),
        })
    }

    /// Create an isolated workcell for a task.
    pub fn create(&self, issue_id: &str, speculate_tag: Option<&str>) -> Result<PathBuf> {
        let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let workcell_name = format!("wc-{}-{}", issue_id, timestamp);
        let branch_name = format!("wc/{}/{}", issue_id, timestamp);
        let workcell_path = self.config.workcells_dir.join(&workcell_name);

        tracing::info!(
            workcell_id = %workcell_name,
            issue_id = %issue_id,
            "Creating workcell"
        );

        // Create isolated worktree from main
        let output = Command::new("git")
            .args(["worktree", "add"])
            .arg(&workcell_path)
            .args(["-b", &branch_name, "main"])
            .current_dir(&self.repo_root)
            .output()
            .context("Failed to create git worktree")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Failed to create worktree: {}", stderr);
        }

        // Remove kernel-owned directories from workcell
        let _ = std::fs::remove_dir_all(workcell_path.join(".beads"));
        let _ = std::fs::remove_dir_all(workcell_path.join(".cyntra"));

        // Create logs directory
        std::fs::create_dir_all(workcell_path.join("logs"))?;

        // Create isolation marker
        let marker = WorkcellMarker {
            id: workcell_name.clone(),
            issue_id: issue_id.to_string(),
            created: timestamp,
            parent_commit: self.get_main_head(),
            speculate_tag: speculate_tag.map(|s| s.to_string()),
        };

        let marker_json = serde_json::to_string_pretty(&marker)?;
        std::fs::write(workcell_path.join(".workcell"), marker_json)?;

        tracing::info!(
            workcell_id = %workcell_name,
            path = %workcell_path.display(),
            "Workcell created"
        );

        Ok(workcell_path)
    }

    /// Cleanup a workcell, optionally archiving logs.
    pub fn cleanup(&self, workcell_path: &Path, keep_logs: bool) -> Result<()> {
        let workcell_name = workcell_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        tracing::info!(
            workcell_id = %workcell_name,
            keep_logs = %keep_logs,
            "Cleaning up workcell"
        );

        // Archive logs if requested
        if keep_logs {
            self.archive_logs(workcell_path)?;
        }

        // Get branch name from marker
        let branch_name = self.get_branch_for_workcell(workcell_path);

        // Remove worktree
        let _ = Command::new("git")
            .args(["worktree", "remove", "--force"])
            .arg(workcell_path)
            .current_dir(&self.repo_root)
            .output();

        // Delete branch
        if let Some(branch) = branch_name {
            let _ = Command::new("git")
                .args(["branch", "-D", &branch])
                .current_dir(&self.repo_root)
                .output();
        }

        Ok(())
    }

    /// List all active workcells.
    pub fn list_active(&self) -> Vec<PathBuf> {
        if !self.config.workcells_dir.exists() {
            return Vec::new();
        }

        std::fs::read_dir(&self.config.workcells_dir)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().join(".workcell").exists())
            .map(|e| e.path())
            .collect()
    }

    /// Get workcell metadata.
    pub fn get_info(&self, workcell_path: &Path) -> Option<WorkcellMarker> {
        let marker_path = workcell_path.join(".workcell");
        let content = std::fs::read_to_string(marker_path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn get_main_head(&self) -> String {
        Command::new("git")
            .args(["rev-parse", "main"])
            .current_dir(&self.repo_root)
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }

    fn get_branch_for_workcell(&self, workcell_path: &Path) -> Option<String> {
        let info = self.get_info(workcell_path)?;
        Some(format!("wc/{}/{}", info.issue_id, info.created))
    }

    fn archive_logs(&self, workcell_path: &Path) -> Result<()> {
        let workcell_name = workcell_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        let logs_path = workcell_path.join("logs");
        if !logs_path.exists() {
            return Ok(());
        }

        let archive_path = self.config.archives_dir.join(workcell_name);
        std::fs::create_dir_all(&archive_path)?;

        // Copy logs directory
        copy_dir_recursive(&logs_path, &archive_path.join("logs"))?;

        // Copy core artifacts
        for filename in ["proof.json", "manifest.json", ".workcell"] {
            let src = workcell_path.join(filename);
            if src.exists() {
                std::fs::copy(&src, archive_path.join(filename))?;
            }
        }

        Ok(())
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
