//! Proof receipts for verified plans

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Proof that a plan achieves its goal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanProof {
    /// Hash of the plan
    pub plan_hash: String,

    /// Start state description
    pub start_state: String,

    /// Goal state description
    pub goal_state: String,

    /// Sequence of action names
    pub action_sequence: Vec<String>,

    /// Individual step proofs
    pub step_proofs: Vec<StepProof>,

    /// Whether the full plan was LEAN-verified
    pub lean_verified: bool,

    /// Whether the full plan was Z3-checked
    pub z3_checked: bool,

    /// Generation timestamp
    pub generated_at: DateTime<Utc>,

    /// Proof time in milliseconds
    pub proof_time_ms: u64,
}

/// Proof for a single action step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepProof {
    /// Step index (0-based)
    pub step: usize,

    /// Action name
    pub action: String,

    /// Precondition formula (if formal)
    pub precondition: Option<String>,

    /// Effect formula (if formal)
    pub effect: Option<String>,

    /// Proof that precondition was satisfied
    pub precondition_proof: Option<String>,

    /// Proof that effect was achieved
    pub effect_proof: Option<String>,
}

impl PlanProof {
    /// Create a new plan proof
    pub fn new(
        plan_hash: String,
        start_state: String,
        goal_state: String,
        action_sequence: Vec<String>,
    ) -> Self {
        Self {
            plan_hash,
            start_state,
            goal_state,
            action_sequence,
            step_proofs: Vec::new(),
            lean_verified: false,
            z3_checked: false,
            generated_at: Utc::now(),
            proof_time_ms: 0,
        }
    }

    /// Add a step proof
    pub fn add_step(&mut self, step_proof: StepProof) {
        self.step_proofs.push(step_proof);
    }

    /// Mark as LEAN verified
    pub fn set_lean_verified(&mut self, verified: bool) {
        self.lean_verified = verified;
    }

    /// Mark as Z3 checked
    pub fn set_z3_checked(&mut self, checked: bool) {
        self.z3_checked = checked;
    }
}
