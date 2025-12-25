//! Observability - events, metrics, and logging.

use std::path::{Path, PathBuf};
use std::io::{BufRead, BufReader, Write};
use std::fs::OpenOptions;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A kernel event for observability.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KernelEvent {
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub issue_id: Option<String>,
    pub workcell_id: Option<String>,
    pub message: String,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

/// Event emitter for kernel observability.
pub struct EventEmitter {
    events_path: PathBuf,
}

impl EventEmitter {
    pub fn new(project_root: &Path) -> Self {
        Self {
            events_path: project_root.join(".cyntra/events.jsonl"),
        }
    }

    /// Emit an event.
    pub fn emit(&self, event: KernelEvent) -> Result<()> {
        if let Some(parent) = self.events_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.events_path)?;

        let line = serde_json::to_string(&event)?;
        writeln!(file, "{}", line)?;

        Ok(())
    }

    /// Emit a simple event.
    pub fn emit_simple(&self, event_type: &str, message: &str) -> Result<()> {
        self.emit(KernelEvent {
            timestamp: Utc::now(),
            event_type: event_type.to_string(),
            issue_id: None,
            workcell_id: None,
            message: message.to_string(),
            metadata: serde_json::Value::Null,
        })
    }

    /// Read recent events.
    pub fn read_recent(&self, limit: usize) -> Vec<KernelEvent> {
        let file = match std::fs::File::open(&self.events_path) {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };

        let reader = BufReader::new(file);
        let mut events: Vec<KernelEvent> = reader
            .lines()
            .filter_map(|line| line.ok())
            .filter_map(|line| serde_json::from_str(&line).ok())
            .collect();

        // Return last N events
        if events.len() > limit {
            events.drain(0..events.len() - limit);
        }

        events
    }
}

/// Kernel status snapshot.
#[derive(Debug, Serialize)]
pub struct KernelStatus {
    pub running: bool,
    pub active_workcells: usize,
    pub pending_issues: usize,
    pub completed_today: usize,
    pub recent_events: Vec<KernelEvent>,
}
