use serde::{Deserialize, Serialize};

/// Human-readable names for compiled runtime IDs, for UI rendering.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesNames {
    /// Deterministic hash of the compiled rules content.
    pub rules_hash: u64,
    pub terrains: Vec<String>,
    pub unit_types: Vec<String>,
    pub buildings: Vec<String>,
    pub techs: Vec<String>,
    pub improvements: Vec<String>,
    pub policies: Vec<String>,
    pub governments: Vec<String>,
}
