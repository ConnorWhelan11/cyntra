//! Claude adapter - uses Claude Code CLI.

use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};

use crate::state::Issue;

/// Execute Claude on an issue in a workcell.
pub async fn execute(issue: &Issue, workcell_path: &Path) -> Result<String> {
    tracing::info!(
        issue_id = %issue.id,
        workcell = %workcell_path.display(),
        "Executing Claude adapter"
    );

    // Build prompt from issue
    let prompt = format!(
        "# Task: {}\n\n{}\n\nPlease implement this task.",
        issue.title, issue.body
    );

    // Write prompt to file
    let prompt_path = workcell_path.join("prompt.md");
    std::fs::write(&prompt_path, &prompt)?;

    // Execute claude CLI
    let output = Command::new("claude")
        .arg("--print")
        .arg("--dangerously-skip-permissions")
        .arg(&prompt)
        .current_dir(workcell_path)
        .output()
        .context("Failed to execute claude CLI")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        anyhow::bail!("Claude failed: {}", stderr);
    }

    // Write output
    let output_path = workcell_path.join("logs/claude_output.txt");
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&output_path, &*stdout)?;

    Ok(stdout.to_string())
}
