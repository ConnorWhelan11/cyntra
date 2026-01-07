//! cyntra-fab - Rust-native ML critics for 3D asset quality validation.
//!
//! This crate provides quality assessment critics for the Fab asset pipeline:
//! - **GeometryCritic**: Validates mesh topology, normals, UVs, and triangle count
//! - **ClipCritic**: Text-to-image alignment using CLIP (ViT-B/32)
//! - **RealismCritic**: Photorealism assessment via image statistics and CLIP
//!
//! # Features
//!
//! - `metal` - Enable Metal acceleration (Apple Silicon)
//! - `cuda` - Enable CUDA acceleration (NVIDIA GPUs)
//!
//! # Example
//!
//! ```no_run
//! use cyntra_fab::critics::GeometryCritic;
//! use std::path::Path;
//!
//! let critic = GeometryCritic::new();
//! let result = critic.evaluate(Path::new("model.glb")).unwrap();
//! println!("Passed: {}, Score: {:.2}", result.passed, result.score);
//! ```

pub mod critics;
pub mod gate;

// Re-export commonly used types
pub use critics::geometry::{GeometryConfig, GeometryResult};
pub use critics::realism::RealismConfig;
pub use critics::{ClipCritic, GeometryCritic, RealismCritic};
pub use gate::{Asset, GateConfig, GateResult, GateRunner};
