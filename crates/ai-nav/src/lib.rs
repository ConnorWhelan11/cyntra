//! Navigation primitives (backends, queries, and reference actions).

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

pub mod actions;
pub mod grid;
pub mod mesh;
pub mod math;
pub mod navigator;
pub mod world;

pub use actions::MoveToAction;
pub use grid::NavGrid;
pub use mesh::{NavMesh, NavMeshQuery};
pub use math::Vec2;
pub use navigator::{NavCorridor, NavPath, NavRaycastHit, NavRegionId, Navigator};
pub use world::{NavWorldMut, NavWorldView};
