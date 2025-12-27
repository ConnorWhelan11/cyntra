//! Deterministic, engine-agnostic AI kernel primitives.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

pub mod action;
pub mod agent;
pub mod blackboard;
pub mod brain;
pub mod plan;
pub mod policy;
pub mod rng;
pub mod tick;
pub mod world;

pub use action::{Action, ActionKey, ActionOutcome, ActionRuntime, ActionStatus};
pub use agent::AgentId;
pub use blackboard::{BbKey, Blackboard};
pub use brain::{Brain, BrainConfig};
pub use plan::{ActionFactory, PlanAction, PlanExecutorAction, PlanSpec};
pub use policy::Policy;
pub use rng::{DeterministicRng, SplitMix64};
pub use tick::TickContext;
pub use world::{WorldMut, WorldView};
