//! Physics ↔ Navigation synchronization.
//!
//! This module bridges 3D Rapier physics with 2D ai-nav navigation:
//! - Syncs 3D physics positions to 2D AiPosition for navmesh queries
//! - Converts navmesh paths to physics movement input
//! - Integrates Rapier raycasts with AiRaycastCallback

use bevy_ecs::prelude::*;
use bevy_rapier3d::prelude::*;
use bevy_transform::components::Transform;

use crate::AiPosition;
use ai_nav::Vec2;

use super::layers;

/// Configuration for physics ↔ navigation synchronization.
#[derive(Resource, Debug, Clone)]
pub struct PhysicsNavSyncConfig {
    /// Whether to read physics positions and write to AiPosition.
    pub sync_physics_to_nav: bool,
    /// Whether to use Rapier for AiRaycastCallback line-of-sight checks.
    pub use_physics_raycast: bool,
    /// Y-height for nav raycasts (agents' eye level).
    pub raycast_height: f32,
    /// Collision groups for nav raycasts (what blocks line of sight).
    pub raycast_filter_mask: u32,
}

impl Default for PhysicsNavSyncConfig {
    fn default() -> Self {
        Self {
            sync_physics_to_nav: true,
            use_physics_raycast: true,
            raycast_height: 1.5,
            raycast_filter_mask: layers::OBSTACLE | layers::GROUND,
        }
    }
}

/// Component to mark an entity for physics ↔ nav sync.
///
/// Entities with this component will have their physics Transform
/// synced to AiPosition for navigation.
#[derive(Component, Debug, Clone, Copy, Default)]
pub struct PhysicsNavAgent {
    /// Ground height offset (added to detected ground Y).
    pub ground_offset: f32,
}

/// System that syncs physics Transform positions to AiPosition (2D nav coords).
///
/// This runs during SyncIn and converts 3D positions to 2D (XZ plane).
pub fn sync_physics_to_nav(
    config: Option<Res<PhysicsNavSyncConfig>>,
    mut query: Query<(&Transform, &mut AiPosition), With<PhysicsNavAgent>>,
) {
    let config = config.map(|c| c.clone()).unwrap_or_default();
    if !config.sync_physics_to_nav {
        return;
    }

    for (transform, mut ai_pos) in query.iter_mut() {
        // Convert 3D (X, Y, Z) to 2D (X, Z) for nav
        ai_pos.0 = Vec2::new(transform.translation.x, transform.translation.z);
    }
}

// Note: Physics raycast integration with AiRaycastCallback is handled
// through PhysicsRaycastCache - see the cache-based approach below.
// Direct integration is not possible since RapierContext is not Send+Sync.

/// Resource that caches physics raycast results for the current frame.
///
/// This is updated each frame before AI ticking, allowing the AiRaycastCallback
/// to use pre-computed physics raycast results.
#[derive(Resource, Default, Debug)]
pub struct PhysicsRaycastCache {
    /// Cached line-of-sight results: ((from_x, from_z), (to_x, to_z)) -> blocked
    cache: std::collections::HashMap<((i32, i32), (i32, i32)), bool>,
    /// Grid cell size for quantizing positions (reduces cache lookups).
    cell_size: f32,
}

impl PhysicsRaycastCache {
    /// Create a new cache with the specified cell size.
    pub fn new(cell_size: f32) -> Self {
        Self {
            cache: std::collections::HashMap::new(),
            cell_size: cell_size.max(0.1),
        }
    }

    /// Clear the cache (call at start of each frame).
    pub fn clear(&mut self) {
        self.cache.clear();
    }

    /// Quantize a position to grid cell coordinates.
    fn quantize(&self, pos: Vec2) -> (i32, i32) {
        (
            (pos.x / self.cell_size).floor() as i32,
            (pos.y / self.cell_size).floor() as i32,
        )
    }

    /// Check if a raycast is blocked (from cache).
    pub fn is_blocked(&self, from: Vec2, to: Vec2) -> Option<bool> {
        let from_cell = self.quantize(from);
        let to_cell = self.quantize(to);
        self.cache.get(&(from_cell, to_cell)).copied()
    }

    /// Store a raycast result in the cache.
    pub fn set_blocked(&mut self, from: Vec2, to: Vec2, blocked: bool) {
        let from_cell = self.quantize(from);
        let to_cell = self.quantize(to);
        self.cache.insert((from_cell, to_cell), blocked);
    }
}

/// Component to track path following state.
#[derive(Component, Debug, Clone, Default)]
pub struct NavPathFollower {
    /// Current path waypoints (2D nav coordinates).
    pub path: Vec<Vec2>,
    /// Current waypoint index.
    pub current_waypoint: usize,
    /// Distance threshold to consider waypoint reached.
    pub waypoint_threshold: f32,
    /// Movement speed.
    pub speed: f32,
    /// Whether path following is active.
    pub active: bool,
}

impl NavPathFollower {
    /// Create a new path follower with default settings.
    pub fn new(speed: f32) -> Self {
        Self {
            path: Vec::new(),
            current_waypoint: 0,
            waypoint_threshold: 0.5,
            speed,
            active: false,
        }
    }

    /// Set a new path to follow.
    pub fn set_path(&mut self, path: Vec<Vec2>) {
        self.path = path;
        self.current_waypoint = 0;
        self.active = !self.path.is_empty();
    }

    /// Clear the current path.
    pub fn clear_path(&mut self) {
        self.path.clear();
        self.current_waypoint = 0;
        self.active = false;
    }

    /// Check if the path is complete.
    pub fn is_complete(&self) -> bool {
        self.current_waypoint >= self.path.len()
    }

    /// Get the current target waypoint, if any.
    pub fn current_target(&self) -> Option<Vec2> {
        self.path.get(self.current_waypoint).copied()
    }
}

/// System that converts NavPathFollower waypoints to AiMovementInput.
///
/// This bridges the 2D navigation path with 3D physics movement.
pub fn path_follow_to_movement(
    mut query: Query<(
        &Transform,
        &mut NavPathFollower,
        &mut super::character::AiMovementInput,
    )>,
) {
    for (transform, mut follower, mut movement) in query.iter_mut() {
        if !follower.active || follower.is_complete() {
            movement.velocity = bevy_rapier3d::math::Vect::ZERO;
            continue;
        }

        let Some(target) = follower.current_target() else {
            movement.velocity = bevy_rapier3d::math::Vect::ZERO;
            continue;
        };

        // Current position in 2D (XZ plane)
        let current = Vec2::new(transform.translation.x, transform.translation.z);
        let to_target = Vec2::new(target.x - current.x, target.y - current.y);
        let distance = (to_target.x * to_target.x + to_target.y * to_target.y).sqrt();

        // Check if we've reached the waypoint
        if distance < follower.waypoint_threshold {
            follower.current_waypoint += 1;
            if follower.is_complete() {
                follower.active = false;
                movement.velocity = bevy_rapier3d::math::Vect::ZERO;
                continue;
            }
        }

        // Calculate movement direction (normalize and scale by speed)
        if distance > 0.001 {
            let dir_x = to_target.x / distance;
            let dir_z = to_target.y / distance;
            movement.velocity = bevy_rapier3d::math::Vect::new(
                dir_x * follower.speed,
                0.0, // Y velocity handled by gravity
                dir_z * follower.speed,
            );
        } else {
            movement.velocity = bevy_rapier3d::math::Vect::ZERO;
        }

        movement.apply_gravity = true;
    }
}

/// Perform a physics raycast for line-of-sight checking.
///
/// This is a utility function that can be called to check if there's
/// a clear line of sight between two 2D nav positions.
pub fn physics_line_of_sight_check(
    rapier: &RapierContext,
    from_2d: Vec2,
    to_2d: Vec2,
    height: f32,
    filter_mask: u32,
) -> bool {
    let from_3d = bevy_rapier3d::math::Vect::new(from_2d.x, height, from_2d.y);
    let to_3d = bevy_rapier3d::math::Vect::new(to_2d.x, height, to_2d.y);

    let direction = to_3d - from_3d;
    let distance = direction.length();

    if distance < 0.001 {
        return false; // Same point, not blocked
    }

    let direction = direction / distance;
    let filter = QueryFilter::default()
        .groups(CollisionGroups::new(
            Group::ALL,
            Group::from_bits(filter_mask).unwrap_or(Group::ALL),
        ))
        .exclude_sensors();

    // Cast ray and check if anything blocks it before reaching the target
    if let Some((_entity, toi)) = rapier.cast_ray(from_3d, direction, distance, true, filter) {
        // Something was hit before reaching the target
        toi < distance - 0.1 // Small epsilon to handle edge cases
    } else {
        false // Nothing blocked the ray
    }
}

/// Event emitted when an agent reaches a path waypoint.
#[derive(bevy_ecs::event::Event, Debug, Clone)]
pub struct NavWaypointReached {
    /// The entity that reached the waypoint.
    pub entity: Entity,
    /// The waypoint index that was reached.
    pub waypoint_index: usize,
    /// The waypoint position.
    pub position: Vec2,
    /// Whether this was the final waypoint.
    pub is_final: bool,
}

/// System that emits NavWaypointReached events.
pub fn emit_waypoint_events(
    mut events: EventWriter<NavWaypointReached>,
    query: Query<(Entity, &NavPathFollower), Changed<NavPathFollower>>,
) {
    for (entity, follower) in query.iter() {
        // Check if we just advanced to a new waypoint
        if follower.current_waypoint > 0 && !follower.path.is_empty() {
            let reached_index = follower.current_waypoint - 1;
            if let Some(&position) = follower.path.get(reached_index) {
                events.write(NavWaypointReached {
                    entity,
                    waypoint_index: reached_index,
                    position,
                    is_final: follower.is_complete(),
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_physics_nav_sync_config_default() {
        let config = PhysicsNavSyncConfig::default();
        assert!(config.sync_physics_to_nav);
        assert!(config.use_physics_raycast);
        assert_eq!(config.raycast_height, 1.5);
    }

    #[test]
    fn test_physics_raycast_cache() {
        let mut cache = PhysicsRaycastCache::new(1.0);
        let from = Vec2::new(0.0, 0.0);
        let to = Vec2::new(5.0, 5.0);

        assert!(cache.is_blocked(from, to).is_none());

        cache.set_blocked(from, to, true);
        assert_eq!(cache.is_blocked(from, to), Some(true));

        cache.clear();
        assert!(cache.is_blocked(from, to).is_none());
    }

    #[test]
    fn test_nav_path_follower() {
        let mut follower = NavPathFollower::new(5.0);
        assert!(!follower.active);
        assert!(follower.is_complete());

        follower.set_path(vec![
            Vec2::new(1.0, 0.0),
            Vec2::new(2.0, 0.0),
            Vec2::new(3.0, 0.0),
        ]);

        assert!(follower.active);
        assert!(!follower.is_complete());
        assert_eq!(follower.current_target(), Some(Vec2::new(1.0, 0.0)));

        follower.current_waypoint = 1;
        assert_eq!(follower.current_target(), Some(Vec2::new(2.0, 0.0)));

        follower.current_waypoint = 3;
        assert!(follower.is_complete());
        assert!(follower.current_target().is_none());
    }

    #[test]
    fn test_physics_nav_agent() {
        let agent = PhysicsNavAgent::default();
        assert_eq!(agent.ground_offset, 0.0);
    }
}
