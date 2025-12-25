//! Kernel configuration loading and management.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Main kernel configuration, loaded from .cyntra/config.yaml
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct KernelConfig {
    /// Config version
    pub version: Option<String>,

    /// Maximum parallel workcells
    #[serde(default = "default_max_parallel")]
    pub max_parallel: usize,

    /// Maximum tokens per cycle
    #[serde(default = "default_max_tokens")]
    pub max_tokens_per_cycle: usize,

    /// Workcells directory (relative to project root)
    #[serde(default = "default_workcells_dir")]
    pub workcells_dir: PathBuf,

    /// Archives directory for completed workcell logs
    #[serde(default = "default_archives_dir")]
    pub archives_dir: PathBuf,

    /// Runs directory for kernel run outputs
    #[serde(default = "default_runs_dir")]
    pub runs_dir: PathBuf,

    /// Scheduling configuration (new format)
    #[serde(default)]
    pub scheduling: SchedulingConfig,

    /// Routing rules for toolchain selection
    #[serde(default)]
    pub routing: RoutingConfig,

    /// Quality gates configuration
    #[serde(default)]
    pub gates: GatesConfig,

    /// Speculation (parallel execution) configuration
    #[serde(default)]
    pub speculation: SpeculationConfig,

    /// Toolchain configurations (flexible, just capture as Value)
    #[serde(default)]
    pub toolchains: serde_json::Value,

    /// Toolchain priority order
    #[serde(default)]
    pub toolchain_priority: Vec<String>,
}

/// Scheduling configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SchedulingConfig {
    #[serde(default = "default_max_parallel")]
    pub max_concurrent_workcells: usize,

    #[serde(default = "default_max_tokens")]
    pub max_concurrent_tokens: usize,

    #[serde(default)]
    pub starvation_threshold_hours: usize,
}

fn default_max_parallel() -> usize {
    3
}
fn default_max_tokens() -> usize {
    500_000
}
fn default_workcells_dir() -> PathBuf {
    PathBuf::from(".workcells")
}
fn default_archives_dir() -> PathBuf {
    PathBuf::from(".cyntra/archives")
}
fn default_runs_dir() -> PathBuf {
    PathBuf::from(".cyntra/runs")
}

/// Routing rules for selecting toolchains
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RoutingConfig {
    /// Default toolchain if no rules match
    #[serde(default = "default_toolchain")]
    pub default_toolchain: String,

    /// Risk-based routing rules
    #[serde(default)]
    pub rules: Vec<RoutingRule>,
}

fn default_toolchain() -> String {
    "claude".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRule {
    /// Match condition (new format)
    #[serde(default, rename = "match")]
    pub matches: RuleMatch,

    /// Toolchain(s) to use (new format uses array)
    #[serde(default, rename = "use")]
    pub toolchains: Vec<String>,

    /// Legacy: single toolchain
    #[serde(default)]
    pub toolchain: Option<String>,

    /// Whether to speculate (run multiple in parallel)
    #[serde(default)]
    pub speculate: bool,

    /// Parallelism for speculation
    #[serde(default)]
    pub parallelism: Option<usize>,
}

impl RoutingRule {
    /// Get the primary toolchain for this rule
    pub fn primary_toolchain(&self) -> Option<&str> {
        self.toolchains.first().map(|s| s.as_str())
            .or(self.toolchain.as_deref())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RuleMatch {
    pub dk_risk: Option<Vec<String>>,
    pub dk_tool_hint: Option<String>,
    pub tags_any: Option<Vec<String>>,
    // Legacy fields
    pub risk: Option<String>,
    pub size: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Quality gates configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GatesConfig {
    /// Whether gates are enabled
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Gate commands to run
    #[serde(default)]
    pub commands: Vec<GateCommand>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateCommand {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub required: bool,
}

/// Speculation (parallel multi-agent) configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpeculationConfig {
    /// Enable speculation for high-risk tasks
    #[serde(default)]
    pub enabled: bool,

    /// Number of parallel agents for speculation
    #[serde(default = "default_speculation_count")]
    pub count: usize,

    /// Risk levels that trigger speculation
    #[serde(default)]
    pub risk_levels: Vec<String>,
}

fn default_speculation_count() -> usize {
    3
}

impl Default for KernelConfig {
    fn default() -> Self {
        Self {
            version: None,
            max_parallel: default_max_parallel(),
            max_tokens_per_cycle: default_max_tokens(),
            workcells_dir: default_workcells_dir(),
            archives_dir: default_archives_dir(),
            runs_dir: default_runs_dir(),
            scheduling: SchedulingConfig::default(),
            routing: RoutingConfig::default(),
            gates: GatesConfig::default(),
            speculation: SpeculationConfig::default(),
            toolchains: serde_json::Value::Null,
            toolchain_priority: Vec::new(),
        }
    }
}

impl KernelConfig {
    /// Load configuration from a YAML file
    pub fn load(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config from {}", path.display()))?;
        let config: Self = serde_yaml::from_str(&content)
            .with_context(|| format!("Failed to parse config from {}", path.display()))?;
        Ok(config)
    }

    /// Load from project root (looks for .cyntra/config.yaml)
    pub fn load_from_project(project_root: &Path) -> Result<Self> {
        let config_path = project_root.join(".cyntra/config.yaml");
        if config_path.exists() {
            Self::load(&config_path)
        } else {
            Ok(Self::default())
        }
    }

    /// Resolve paths relative to project root
    pub fn resolve_paths(&mut self, project_root: &Path) {
        self.workcells_dir = project_root.join(&self.workcells_dir);
        self.archives_dir = project_root.join(&self.archives_dir);
        self.runs_dir = project_root.join(&self.runs_dir);
    }
}
