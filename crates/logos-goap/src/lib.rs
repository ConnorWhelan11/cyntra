//! # logos-goap
//!
//! Formally verified GOAP planning with proof receipts.
//!
//! This crate extends the base GOAP planner with formal verification
//! capabilities, generating proof receipts for valid plans and
//! counterexamples for invalid plans.
//!
//! ## Features
//!
//! - `z3-verify`: Enable Z3-based counterexample generation
//!
//! ## Example
//!
//! ```rust,ignore
//! use logos_goap::VerifiedGoapPlanner;
//! use ai_goap::{GoapAction, GoapPlanner};
//!
//! // Create a verified planner
//! let planner = VerifiedGoapPlanner::new(GoapPlanner::new());
//!
//! // Plan with verification
//! let (plan, proof) = planner.plan_with_proof(start, goal, &actions)?;
//! ```

pub mod verified_planner;
pub mod proof_receipt;
pub mod training;

pub use verified_planner::*;
pub use proof_receipt::*;
pub use training::*;

use thiserror::Error;

/// Errors during verified planning
#[derive(Debug, Error)]
pub enum VerifiedPlanError {
    #[error("No plan found from start to goal")]
    NoPlanFound,

    #[error("Plan verification failed: {0}")]
    VerificationFailed(String),

    #[error("Formal precondition not satisfied: {action}")]
    PreconditionFailed { action: String },

    #[error("Logos error: {0}")]
    LogosError(#[from] logos_ffi::LogosError),
}

pub type Result<T> = std::result::Result<T, VerifiedPlanError>;
