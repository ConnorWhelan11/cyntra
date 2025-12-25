//! Dispatcher - routes tasks to appropriate toolchains.

use crate::adapters::Toolchain;
use crate::config::KernelConfig;
use crate::state::Issue;

/// Dispatcher routes issues to toolchains based on rules.
pub struct Dispatcher {
    config: KernelConfig,
}

impl Dispatcher {
    pub fn new(config: KernelConfig) -> Self {
        Self { config }
    }

    /// Select the appropriate toolchain for an issue
    pub fn select_toolchain(&self, issue: &Issue) -> Toolchain {
        // Check for explicit hint
        if let Some(hint) = &issue.dk_tool_hint {
            if let Some(tc) = Toolchain::from_name(hint) {
                return tc;
            }
        }

        // Apply routing rules
        for rule in &self.config.routing.rules {
            if self.matches_rule(issue, rule) {
                if let Some(tc_name) = rule.primary_toolchain() {
                    if let Some(tc) = Toolchain::from_name(tc_name) {
                        return tc;
                    }
                }
            }
        }

        // Default toolchain
        Toolchain::from_name(&self.config.routing.default_toolchain)
            .unwrap_or(Toolchain::Claude)
    }

    fn matches_rule(&self, issue: &Issue, rule: &crate::config::RoutingRule) -> bool {
        let m = &rule.matches;

        // Check risk
        if let Some(risk) = &m.risk {
            if issue.dk_risk.as_ref() != Some(risk) {
                return false;
            }
        }

        // Check size
        if let Some(size) = &m.size {
            if issue.dk_size.as_ref() != Some(size) {
                return false;
            }
        }

        // Check tags
        if let Some(tags) = &m.tags {
            if !tags.iter().any(|t| issue.labels.contains(t)) {
                return false;
            }
        }

        true
    }
}
