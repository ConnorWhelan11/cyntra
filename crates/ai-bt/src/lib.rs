//! Behavior Tree runtime built on `ai-core`.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

pub mod bt;
pub mod nodes;
pub mod policy;

pub use bt::{BtNode, BtStatus};
// Defaults: reactive control flow nodes (abort-friendly).
//
// Memory variants are still available as `MemSelector` / `MemSequence` for cases
// where you explicitly want "resume running child without re-checking earlier
// conditions".
pub use nodes::{
    Condition, PlanNode, PlanNodeConfig, ReactiveSelector, ReactiveSequence, RunAction,
    Selector as MemSelector, Sequence as MemSequence,
};
pub use nodes::{ReactiveSelector as Selector, ReactiveSequence as Sequence};
pub use policy::BtPolicy;
