//! Utility AI selection primitives.
//!
//! The core idea is simple: on each policy tick, score a set of options and run the highest-scoring
//! one via `ai-core` actions. Tie-breaking is stable by option order for determinism.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

pub mod policy;
#[cfg(feature = "bt")]
#[cfg_attr(docsrs, doc(cfg(feature = "bt")))]
pub mod bt;

pub use policy::{UtilityOption, UtilityPolicy, UtilityPolicyConfig};
#[cfg(feature = "bt")]
#[cfg_attr(docsrs, doc(cfg(feature = "bt")))]
pub use bt::UtilityNode;
