//! Raycast and shapecast queries for AI perception.
//!
//! This module provides convenient wrappers around Rapier's query pipeline
//! for common AI perception tasks like line-of-sight checks and area awareness.

use bevy_ecs::prelude::*;
use bevy_rapier3d::prelude::*;

use super::layers;

/// Result of a line-of-sight check.
#[derive(Debug, Clone)]
pub struct LineOfSightResult {
    /// Whether the target is visible (no obstruction).
    pub visible: bool,
    /// If blocked, the entity that blocked the view.
    pub blocker: Option<Entity>,
    /// If blocked, the point where the ray hit.
    pub hit_point: Option<bevy_rapier3d::math::Vect>,
    /// Distance to the target (or blocker if blocked).
    pub distance: f32,
}

/// Result of a raycast query.
#[derive(Debug, Clone)]
pub struct RaycastHit {
    /// The entity that was hit.
    pub entity: Entity,
    /// The point where the ray hit.
    pub point: bevy_rapier3d::math::Vect,
    /// The surface normal at the hit point.
    pub normal: bevy_rapier3d::math::Vect,
    /// Distance from ray origin to hit.
    pub distance: f32,
}

/// Result of a shape overlap query.
#[derive(Debug, Clone)]
pub struct OverlapResult {
    /// Entities that overlap with the query shape.
    pub entities: Vec<Entity>,
}

/// AI perception query helper.
///
/// This provides a convenient interface for common AI perception queries.
/// Use with `ReadRapierContext` system param.
pub struct AiPerception<'a> {
    context: &'a RapierContext<'a>,
}

impl<'a> AiPerception<'a> {
    /// Create a new perception helper from a RapierContext.
    pub fn new(context: &'a RapierContext<'a>) -> Self {
        Self { context }
    }

    /// Check line of sight between two points.
    ///
    /// Returns whether there's a clear line between `from` and `to`,
    /// optionally excluding certain entities.
    pub fn line_of_sight(
        &self,
        from: bevy_rapier3d::math::Vect,
        to: bevy_rapier3d::math::Vect,
        exclude: Option<Entity>,
    ) -> LineOfSightResult {
        let direction = to - from;
        let distance = direction.length();

        if distance < 0.001 {
            return LineOfSightResult {
                visible: true,
                blocker: None,
                hit_point: None,
                distance: 0.0,
            };
        }

        let direction = direction / distance;
        let filter = QueryFilter::default()
            .groups(CollisionGroups::new(
                Group::ALL,
                Group::from_bits(layers::OBSTACLE | layers::GROUND).unwrap(),
            ))
            .exclude_sensors();

        let filter = if let Some(entity) = exclude {
            filter.exclude_collider(entity)
        } else {
            filter
        };

        if let Some((entity, toi)) = self.context.cast_ray(from, direction, distance, true, filter)
        {
            // Something blocked the view
            LineOfSightResult {
                visible: false,
                blocker: Some(entity),
                hit_point: Some(from + direction * toi),
                distance: toi,
            }
        } else {
            // Clear line of sight
            LineOfSightResult {
                visible: true,
                blocker: None,
                hit_point: None,
                distance,
            }
        }
    }

    /// Cast a ray and return detailed hit information.
    ///
    /// Returns the first entity hit along the ray, or None if nothing was hit.
    pub fn raycast(
        &self,
        origin: bevy_rapier3d::math::Vect,
        direction: bevy_rapier3d::math::Vect,
        max_distance: f32,
        filter: QueryFilter,
    ) -> Option<RaycastHit> {
        let direction = direction.normalize();

        self.context
            .cast_ray_and_get_normal(origin, direction, max_distance, true, filter)
            .map(|(entity, intersection)| RaycastHit {
                entity,
                point: origin + direction * intersection.time_of_impact,
                normal: intersection.normal,
                distance: intersection.time_of_impact,
            })
    }

    /// Cast multiple rays in a cone pattern (useful for field of view).
    ///
    /// Returns all unique entities hit by any ray in the cone.
    pub fn cone_cast(
        &self,
        origin: bevy_rapier3d::math::Vect,
        forward: bevy_rapier3d::math::Vect,
        half_angle: f32,
        max_distance: f32,
        ray_count: usize,
        filter: QueryFilter,
    ) -> Vec<RaycastHit> {
        let forward = forward.normalize();
        let mut results = Vec::new();
        let mut seen_entities = std::collections::HashSet::new();

        // Generate rays in a cone
        let up = if forward.y.abs() > 0.9 {
            bevy_rapier3d::math::Vect::X
        } else {
            bevy_rapier3d::math::Vect::Y
        };
        let right = forward.cross(up).normalize();
        let up = right.cross(forward).normalize();

        for i in 0..ray_count {
            let angle = (i as f32 / ray_count as f32) * std::f32::consts::TAU;
            let offset_angle = half_angle * (i as f32 / ray_count as f32).sqrt();

            let offset_x = offset_angle.sin() * angle.cos();
            let offset_y = offset_angle.sin() * angle.sin();

            let direction = (forward + right * offset_x + up * offset_y).normalize();

            if let Some(hit) = self.raycast(origin, direction, max_distance, filter) {
                if seen_entities.insert(hit.entity) {
                    results.push(hit);
                }
            }
        }

        results
    }

    /// Find all entities within a sphere.
    pub fn overlap_sphere(
        &self,
        center: bevy_rapier3d::math::Vect,
        radius: f32,
        filter: QueryFilter,
    ) -> OverlapResult {
        let shape = Collider::ball(radius);
        let mut entities = Vec::new();

        self.context.intersections_with_shape(
            center,
            bevy_rapier3d::math::Rot::default(),
            &shape,
            filter,
            |entity| {
                entities.push(entity);
                true // Continue searching
            },
        );

        OverlapResult { entities }
    }

    /// Find all entities within a box.
    pub fn overlap_box(
        &self,
        center: bevy_rapier3d::math::Vect,
        half_extents: bevy_rapier3d::math::Vect,
        rotation: bevy_rapier3d::math::Rot,
        filter: QueryFilter,
    ) -> OverlapResult {
        let shape = Collider::cuboid(half_extents.x, half_extents.y, half_extents.z);
        let mut entities = Vec::new();

        self.context.intersections_with_shape(
            center,
            rotation,
            &shape,
            filter,
            |entity| {
                entities.push(entity);
                true
            },
        );

        OverlapResult { entities }
    }

    /// Find all entities within a capsule (good for checking agent-sized areas).
    pub fn overlap_capsule(
        &self,
        center: bevy_rapier3d::math::Vect,
        half_height: f32,
        radius: f32,
        filter: QueryFilter,
    ) -> OverlapResult {
        let shape = Collider::capsule_y(half_height, radius);
        let mut entities = Vec::new();

        self.context.intersections_with_shape(
            center,
            bevy_rapier3d::math::Rot::default(),
            &shape,
            filter,
            |entity| {
                entities.push(entity);
                true
            },
        );

        OverlapResult { entities }
    }

    /// Cast a shape and find what it would hit.
    ///
    /// Useful for checking if an agent can move to a location.
    pub fn shapecast(
        &self,
        shape: &Collider,
        origin: bevy_rapier3d::math::Vect,
        rotation: bevy_rapier3d::math::Rot,
        direction: bevy_rapier3d::math::Vect,
        max_distance: f32,
        filter: QueryFilter,
    ) -> Option<RaycastHit> {
        let options = ShapeCastOptions {
            max_time_of_impact: max_distance,
            stop_at_penetration: true,
            ..Default::default()
        };

        self.context
            .cast_shape(origin, rotation, direction, shape, options, filter)
            .map(|(entity, hit)| RaycastHit {
                entity,
                point: origin + direction * hit.time_of_impact,
                normal: hit.details.map(|d| d.normal1).unwrap_or(bevy_rapier3d::math::Vect::Y),
                distance: hit.time_of_impact,
            })
    }

    /// Check if a point is inside any collider.
    pub fn point_inside(
        &self,
        point: bevy_rapier3d::math::Vect,
        filter: QueryFilter,
    ) -> Option<Entity> {
        let mut result = None;
        self.context.intersections_with_point(point, filter, |entity| {
            result = Some(entity);
            false // Stop at first hit
        });
        result
    }

    /// Find the closest entity to a point.
    pub fn closest_entity(
        &self,
        point: bevy_rapier3d::math::Vect,
        max_distance: f32,
        filter: QueryFilter,
    ) -> Option<(Entity, f32)> {
        self.context
            .project_point(point, true, filter)
            .filter(|(_, proj)| proj.point.distance(point) <= max_distance)
            .map(|(entity, proj)| (entity, proj.point.distance(point)))
    }
}

/// Convenience filter builders for common AI perception scenarios.
pub mod filters {
    use super::*;

    /// Filter for seeing other agents.
    pub fn see_agents() -> QueryFilter<'static> {
        QueryFilter::default()
            .groups(CollisionGroups::new(
                Group::ALL,
                Group::from_bits(layers::AGENT).unwrap(),
            ))
            .exclude_sensors()
    }

    /// Filter for seeing obstacles (for pathfinding).
    pub fn see_obstacles() -> QueryFilter<'static> {
        QueryFilter::default()
            .groups(CollisionGroups::new(
                Group::ALL,
                Group::from_bits(layers::OBSTACLE | layers::GROUND).unwrap(),
            ))
            .exclude_sensors()
    }

    /// Filter for detecting triggers.
    pub fn see_triggers() -> QueryFilter<'static> {
        QueryFilter::default().groups(CollisionGroups::new(
            Group::ALL,
            Group::from_bits(layers::TRIGGER).unwrap(),
        ))
    }

    /// Filter for seeing everything except triggers.
    pub fn see_solid() -> QueryFilter<'static> {
        QueryFilter::default()
            .groups(CollisionGroups::new(
                Group::ALL,
                Group::from_bits(layers::AGENT | layers::OBSTACLE | layers::GROUND).unwrap(),
            ))
            .exclude_sensors()
    }

    /// Filter for interactive objects.
    pub fn see_interactive() -> QueryFilter<'static> {
        QueryFilter::default().groups(CollisionGroups::new(
            Group::ALL,
            Group::from_bits(layers::INTERACTIVE).unwrap(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_of_sight_result() {
        let visible = LineOfSightResult {
            visible: true,
            blocker: None,
            hit_point: None,
            distance: 10.0,
        };
        assert!(visible.visible);
        assert!(visible.blocker.is_none());
    }

    #[test]
    fn test_raycast_hit() {
        let hit = RaycastHit {
            entity: Entity::from_raw(1),
            point: bevy_rapier3d::math::Vect::new(1.0, 2.0, 3.0),
            normal: bevy_rapier3d::math::Vect::Y,
            distance: 5.0,
        };
        assert_eq!(hit.distance, 5.0);
    }

    #[test]
    fn test_filters() {
        let _agents = filters::see_agents();
        let _obstacles = filters::see_obstacles();
        let _triggers = filters::see_triggers();
        let _solid = filters::see_solid();
        let _interactive = filters::see_interactive();
    }
}
