//! Scheduler - computes ready set and packs into parallel lanes.

use crate::config::KernelConfig;
use crate::state::{BeadsGraph, Issue};

/// Result of a scheduling cycle.
#[derive(Debug, Default)]
pub struct ScheduleResult {
    /// Issues ready to be worked on
    pub ready_issues: Vec<String>,
    /// Issues scheduled for this cycle
    pub scheduled: Vec<String>,
    /// Issues that need speculate+vote
    pub speculate: Vec<String>,
    /// Total estimated tokens
    pub total_tokens: usize,
}

impl ScheduleResult {
    pub fn summary(&self) -> String {
        format!(
            "Ready: {}, Scheduled: {}, Speculate: {}, Tokens: {}",
            self.ready_issues.len(),
            self.scheduled.len(),
            self.speculate.len(),
            self.total_tokens
        )
    }
}

/// Scheduler for selecting and prioritizing work.
pub struct Scheduler {
    config: KernelConfig,
    running_tasks: Vec<String>,
}

impl Scheduler {
    pub fn new(config: KernelConfig) -> Self {
        Self {
            config,
            running_tasks: Vec::new(),
        }
    }

    /// Set currently running tasks (to avoid double-scheduling)
    pub fn set_running(&mut self, tasks: Vec<String>) {
        self.running_tasks = tasks;
    }

    /// Run a scheduling cycle
    pub fn schedule(&self, graph: &BeadsGraph) -> ScheduleResult {
        let mut result = ScheduleResult::default();

        // Get ready issues
        let ready: Vec<&Issue> = graph
            .ready_issues()
            .into_iter()
            .filter(|i| !self.running_tasks.contains(&i.id))
            .collect();

        result.ready_issues = ready.iter().map(|i| i.id.clone()).collect();

        // Sort by critical path priority (size descending for now)
        let mut sorted = ready;
        sorted.sort_by(|a, b| b.size_hours().cmp(&a.size_hours()));

        // Pack into lanes respecting token budget
        let mut remaining_tokens = self.config.max_tokens_per_cycle;
        let mut remaining_slots = self.config.max_parallel - self.running_tasks.len();

        for issue in sorted {
            if remaining_slots == 0 {
                break;
            }

            let tokens = issue.estimated_tokens();
            if tokens > remaining_tokens {
                continue;
            }

            // Check if needs speculation
            if issue.is_high_risk() && self.config.speculation.enabled {
                result.speculate.push(issue.id.clone());
            } else {
                result.scheduled.push(issue.id.clone());
            }

            remaining_tokens -= tokens;
            remaining_slots -= 1;
            result.total_tokens += tokens;
        }

        result
    }
}
