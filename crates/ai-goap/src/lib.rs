//! Deterministic GOAP planner producing `ai-core` plan specs.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

pub mod planner;
pub mod policy;
#[cfg(feature = "bt")]
#[cfg_attr(docsrs, doc(cfg(feature = "bt")))]
pub mod bt;

pub use planner::{GoapAction, GoapPlanner, GoapState};
pub use policy::{GoapPlanKey, GoapPlanPolicy, GoapPlanPolicyConfig};
#[cfg(feature = "bt")]
#[cfg_attr(docsrs, doc(cfg(feature = "bt")))]
pub use bt::GoapPlanNode;
