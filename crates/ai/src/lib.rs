//! Umbrella crate that re-exports the `ai-*` building blocks.
//!
//! This crate is intended as a convenient entrypoint for users and as a home for docs.rs guides.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

#[cfg(feature = "core")]
#[cfg_attr(docsrs, doc(cfg(feature = "core")))]
pub use ai_core as core;

#[cfg(feature = "tools")]
#[cfg_attr(docsrs, doc(cfg(feature = "tools")))]
pub use ai_tools as tools;

#[cfg(feature = "nav")]
#[cfg_attr(docsrs, doc(cfg(feature = "nav")))]
pub use ai_nav as nav;

#[cfg(feature = "crowd")]
#[cfg_attr(docsrs, doc(cfg(feature = "crowd")))]
pub use ai_crowd as crowd;

#[cfg(feature = "bt")]
#[cfg_attr(docsrs, doc(cfg(feature = "bt")))]
pub use ai_bt as bt;

#[cfg(feature = "goap")]
#[cfg_attr(docsrs, doc(cfg(feature = "goap")))]
pub use ai_goap as goap;

#[cfg(feature = "htn")]
#[cfg_attr(docsrs, doc(cfg(feature = "htn")))]
pub use ai_htn as htn;

#[cfg(feature = "utility")]
#[cfg_attr(docsrs, doc(cfg(feature = "utility")))]
pub use ai_utility as utility;

#[cfg(doc)]
pub mod guides {
    #![allow(clippy::all)]

    #[doc = include_str!("../../../docs/specs/ai-planning-contract.md")]
    pub mod planning_contract {}

    #[doc = include_str!("../../../docs/guides/ai-tracing.md")]
    pub mod tracing {}

    #[doc = include_str!("../../benches/README.md")]
    pub mod benchmarks_quickstart {}
}
