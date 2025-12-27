use crate::Vec2;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NavPath {
    pub points: Vec<Vec2>,
}

impl NavPath {
    pub fn new(points: Vec<Vec2>) -> Self {
        Self { points }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NavRaycastHit {
    pub point: Vec2,
}

/// Backend-defined region identifier (poly/triangle/cell).
///
/// This value is intended to be stable across replays and serialization of baked data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NavRegionId(pub u32);

/// Debug-friendly corridor result for path following / visualization.
///
/// `portals.len()` is either `0` (no corridor available), or equals `regions.len()` where:
/// - `portals[..regions.len()-1]` are the shared edges between successive regions, oriented as
///   `(left, right)` for funnel algorithms.
/// - `portals[regions.len()-1]` is a degenerate `(goal, goal)` portal.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NavCorridor {
    pub regions: Vec<NavRegionId>,
    pub portals: Vec<(Vec2, Vec2)>,
    /// Funnel "corner" points derived from `portals`.
    ///
    /// This is the straightened path suitable for debug drawing and basic path following.
    /// When available, `corners[0]` is the requested `start` and `corners.last()` is the requested
    /// `goal`.
    pub corners: Vec<Vec2>,
}

pub trait Navigator {
    fn find_path(&self, start: Vec2, goal: Vec2) -> Option<NavPath>;

    /// Return a corridor (region path + portals) suitable for debugging/funnel path following.
    ///
    /// Backends that don't support corridor queries may return `None`.
    fn corridor(&self, _start: Vec2, _goal: Vec2) -> Option<NavCorridor> {
        None
    }

    /// Raycast inside the nav representation.
    ///
    /// Returns the first point where the segment from `start` to `end` exits navigable space.
    /// Backends that don't support raycasts may return `None`.
    fn raycast(&self, _start: Vec2, _end: Vec2) -> Option<NavRaycastHit> {
        None
    }

    /// Project a point onto the nearest navigable surface.
    ///
    /// Backends that don't support projection may return `None`.
    fn nearest_point(&self, _point: Vec2) -> Option<Vec2> {
        None
    }
}
