//! Training data generation from verified planning

use crate::proof_receipt::PlanProof;
// Note: Formula and Counterexample will be used when training data generation is implemented
use serde::{Deserialize, Serialize};

/// A training example from plan verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanTrainingExample {
    /// The planning scenario
    pub scenario: PlanScenario,

    /// The outcome (proof or counterexample)
    pub outcome: PlanOutcome,

    /// RL signal strength (-1.0 to 1.0)
    pub signal: f64,
}

/// A planning scenario for training
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanScenario {
    /// Start state description
    pub start_state: String,

    /// Goal state description
    pub goal_state: String,

    /// Available actions
    pub actions: Vec<String>,

    /// The proposed plan
    pub proposed_plan: Vec<String>,
}

/// Outcome of plan verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlanOutcome {
    /// Plan is valid with proof
    Valid {
        proof: PlanProof,
    },

    /// Plan is invalid with counterexample
    Invalid {
        reason: String,
        counterexample: Option<String>,
    },

    /// Verification was inconclusive
    Unknown {
        reason: String,
    },
}

impl PlanTrainingExample {
    /// Create a positive training example (valid plan)
    pub fn positive(scenario: PlanScenario, proof: PlanProof) -> Self {
        Self {
            scenario,
            outcome: PlanOutcome::Valid { proof },
            signal: 1.0,
        }
    }

    /// Create a negative training example (invalid plan)
    pub fn negative(scenario: PlanScenario, reason: String, counterexample: Option<String>) -> Self {
        Self {
            scenario,
            outcome: PlanOutcome::Invalid {
                reason,
                counterexample,
            },
            signal: -1.0,
        }
    }

    /// Create an inconclusive example
    pub fn unknown(scenario: PlanScenario, reason: String) -> Self {
        Self {
            scenario,
            outcome: PlanOutcome::Unknown { reason },
            signal: 0.0,
        }
    }

    /// Check if this is a positive example
    pub fn is_positive(&self) -> bool {
        matches!(self.outcome, PlanOutcome::Valid { .. })
    }

    /// Check if this is a negative example
    pub fn is_negative(&self) -> bool {
        matches!(self.outcome, PlanOutcome::Invalid { .. })
    }
}

/// Collect training examples from a batch of planning attempts
pub fn collect_training_batch(
    scenarios: Vec<PlanScenario>,
    outcomes: Vec<PlanOutcome>,
) -> Vec<PlanTrainingExample> {
    scenarios
        .into_iter()
        .zip(outcomes.into_iter())
        .map(|(scenario, outcome)| {
            let signal = match &outcome {
                PlanOutcome::Valid { .. } => 1.0,
                PlanOutcome::Invalid { .. } => -1.0,
                PlanOutcome::Unknown { .. } => 0.0,
            };
            PlanTrainingExample {
                scenario,
                outcome,
                signal,
            }
        })
        .collect()
}
