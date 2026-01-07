//! Quality critics for 3D asset validation.

pub mod clip;
pub mod geometry;
pub mod realism;

pub use clip::ClipCritic;
pub use geometry::GeometryCritic;
pub use realism::RealismCritic;
