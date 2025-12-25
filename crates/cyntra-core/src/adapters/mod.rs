//! Adapters - toolchain integrations for LLM agents.

mod claude;
mod codex;

use std::path::Path;

use anyhow::Result;
use async_trait::async_trait;

use crate::state::Issue;

/// Available toolchains.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Toolchain {
    Claude,
    Codex,
    OpenCode,
    Crush,
}

impl Toolchain {
    /// Parse toolchain from name
    pub fn from_name(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "opencode" => Some(Self::OpenCode),
            "crush" => Some(Self::Crush),
            _ => None,
        }
    }

    /// Get toolchain name
    pub fn name(&self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::OpenCode => "opencode",
            Self::Crush => "crush",
        }
    }

    /// Execute this toolchain on an issue
    pub async fn execute(&self, issue: &Issue, workcell_path: &Path) -> Result<String> {
        match self {
            Self::Claude => claude::execute(issue, workcell_path).await,
            Self::Codex => codex::execute(issue, workcell_path).await,
            Self::OpenCode => todo!("OpenCode adapter not yet implemented"),
            Self::Crush => todo!("Crush adapter not yet implemented"),
        }
    }
}

/// Trait for toolchain adapters.
#[async_trait]
pub trait Adapter: Send + Sync {
    /// Execute the toolchain on an issue
    async fn execute(&self, issue: &Issue, workcell_path: &Path) -> Result<String>;

    /// Check if the adapter is available (API keys, etc.)
    fn is_available(&self) -> bool;
}
