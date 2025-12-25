//! Cyntra Core - Autonomous development kernel
//!
//! This crate provides the core kernel logic for scheduling tasks,
//! managing workcells (isolated git worktrees), dispatching to LLM
//! toolchains, and verifying results through quality gates.

pub mod adapters;
pub mod config;
pub mod kernel;
pub mod observability;
pub mod state;
pub mod workcell;

pub use config::KernelConfig;
pub use kernel::{Dispatcher, Runner, Scheduler, Verifier};
pub use state::{BeadsGraph, Issue};
pub use workcell::WorkcellManager;
