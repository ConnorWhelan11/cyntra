//! Tooling primitives for deterministic game AI.
//!
//! This crate is intentionally lightweight and engine-agnostic. Higher-level integrations (Bevy
//! debug drawing, inspectors, etc.) should live in dedicated adapter crates.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

pub mod trace;

pub use trace::{
    emit, NullTraceSink, TraceEvent, TraceLog, TraceSink, VecTraceSink, TRACE_LOG, TRACE_SINK,
};
