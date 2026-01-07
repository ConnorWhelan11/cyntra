//! Debug visualization for AI physics integration.
//!
//! This module provides gizmo-based debug rendering for:
//! - Navigation paths and waypoints
//! - Perception cones and line-of-sight rays
//! - Trigger zone boundaries
//! - Agent facing directions

use bevy_color::Color;
use bevy_ecs::prelude::*;
use bevy_gizmos::gizmos::Gizmos;
use bevy_math::Vec3;
use bevy_transform::components::Transform;

use crate::{AiFacing, AiRadius};

use super::nav_sync::{NavPathFollower, PhysicsNavAgent};

/// Configuration for AI debug visualization.
#[derive(Resource, Debug, Clone)]
pub struct AiDebugConfig {
    /// Show navigation paths.
    pub show_paths: bool,
    /// Show waypoint markers.
    pub show_waypoints: bool,
    /// Show perception cones.
    pub show_perception_cones: bool,
    /// Show line-of-sight rays.
    pub show_los_rays: bool,
    /// Show agent facing direction.
    pub show_facing: bool,
    /// Show agent radius.
    pub show_radius: bool,
    /// Path line color (RGBA).
    pub path_color: [f32; 4],
    /// Waypoint color (RGBA).
    pub waypoint_color: [f32; 4],
    /// Perception cone color (RGBA).
    pub perception_color: [f32; 4],
    /// Line-of-sight blocked color (RGBA).
    pub los_blocked_color: [f32; 4],
    /// Line-of-sight clear color (RGBA).
    pub los_clear_color: [f32; 4],
    /// Facing direction color (RGBA).
    pub facing_color: [f32; 4],
    /// Agent radius color (RGBA).
    pub radius_color: [f32; 4],
    /// Perception cone half-angle in radians.
    pub perception_half_angle: f32,
    /// Perception cone range.
    pub perception_range: f32,
}

impl Default for AiDebugConfig {
    fn default() -> Self {
        Self {
            show_paths: true,
            show_waypoints: true,
            show_perception_cones: false,
            show_los_rays: false,
            show_facing: true,
            show_radius: false,
            path_color: [0.2, 0.8, 0.2, 1.0],      // Green
            waypoint_color: [1.0, 1.0, 0.0, 1.0],  // Yellow
            perception_color: [0.5, 0.5, 1.0, 0.3], // Light blue, semi-transparent
            los_blocked_color: [1.0, 0.2, 0.2, 1.0], // Red
            los_clear_color: [0.2, 1.0, 0.2, 1.0],   // Green
            facing_color: [0.0, 1.0, 1.0, 1.0],      // Cyan
            radius_color: [1.0, 1.0, 1.0, 0.3],      // White, semi-transparent
            perception_half_angle: std::f32::consts::FRAC_PI_4, // 45 degrees
            perception_range: 10.0,
        }
    }
}

fn color_from_rgba(rgba: [f32; 4]) -> Color {
    Color::srgba(rgba[0], rgba[1], rgba[2], rgba[3])
}

/// Gizmo helper for AI debug visualization.
///
/// This struct provides methods to draw AI-related debug visuals
/// using Bevy's gizmo system.
pub struct AiDebugGizmos;

impl AiDebugGizmos {
    /// Draw a navigation path as connected line segments.
    pub fn draw_path(
        gizmos: &mut Gizmos,
        path: &[ai_nav::Vec2],
        height: f32,
        color: Color,
    ) {
        for window in path.windows(2) {
            let from = Vec3::new(window[0].x, height, window[0].y);
            let to = Vec3::new(window[1].x, height, window[1].y);
            gizmos.line(from, to, color);
        }
    }

    /// Draw waypoint markers as small crosses.
    pub fn draw_waypoints(
        gizmos: &mut Gizmos,
        path: &[ai_nav::Vec2],
        current_index: usize,
        height: f32,
        color: Color,
        current_color: Color,
    ) {
        for (i, waypoint) in path.iter().enumerate() {
            let pos = Vec3::new(waypoint.x, height, waypoint.y);
            let c = if i == current_index {
                current_color
            } else {
                color
            };
            // Draw a small cross at each waypoint
            let size = if i == current_index { 0.3 } else { 0.15 };
            gizmos.line(pos - Vec3::X * size, pos + Vec3::X * size, c);
            gizmos.line(pos - Vec3::Z * size, pos + Vec3::Z * size, c);
        }
    }

    /// Draw a perception cone as a fan of lines.
    pub fn draw_perception_cone(
        gizmos: &mut Gizmos,
        position: Vec3,
        facing: ai_nav::Vec2,
        half_angle: f32,
        range: f32,
        segments: usize,
        color: Color,
    ) {
        let facing_3d = Vec3::new(facing.x, 0.0, facing.y).normalize();

        // Draw the cone edges
        for i in 0..=segments {
            let t = (i as f32 / segments as f32) * 2.0 - 1.0;
            let angle = t * half_angle;

            // Rotate facing direction by angle around Y axis
            let cos_a = angle.cos();
            let sin_a = angle.sin();
            let dir = Vec3::new(
                facing_3d.x * cos_a - facing_3d.z * sin_a,
                0.0,
                facing_3d.x * sin_a + facing_3d.z * cos_a,
            );

            gizmos.line(position, position + dir * range, color);
        }

        // Draw arc at the end
        let arc_segments = segments * 2;
        for i in 0..arc_segments {
            let t1 = (i as f32 / arc_segments as f32) * 2.0 - 1.0;
            let t2 = ((i + 1) as f32 / arc_segments as f32) * 2.0 - 1.0;
            let angle1 = t1 * half_angle;
            let angle2 = t2 * half_angle;

            let cos_a1 = angle1.cos();
            let sin_a1 = angle1.sin();
            let dir1 = Vec3::new(
                facing_3d.x * cos_a1 - facing_3d.z * sin_a1,
                0.0,
                facing_3d.x * sin_a1 + facing_3d.z * cos_a1,
            );

            let cos_a2 = angle2.cos();
            let sin_a2 = angle2.sin();
            let dir2 = Vec3::new(
                facing_3d.x * cos_a2 - facing_3d.z * sin_a2,
                0.0,
                facing_3d.x * sin_a2 + facing_3d.z * cos_a2,
            );

            gizmos.line(position + dir1 * range, position + dir2 * range, color);
        }
    }

    /// Draw a facing direction arrow.
    pub fn draw_facing(
        gizmos: &mut Gizmos,
        position: Vec3,
        facing: ai_nav::Vec2,
        length: f32,
        color: Color,
    ) {
        let facing_3d = Vec3::new(facing.x, 0.0, facing.y).normalize();
        let end = position + facing_3d * length;

        // Main line
        gizmos.line(position, end, color);

        // Arrow head
        let arrow_size = length * 0.2;
        let right = Vec3::new(-facing_3d.z, 0.0, facing_3d.x);
        gizmos.line(end, end - facing_3d * arrow_size + right * arrow_size * 0.5, color);
        gizmos.line(end, end - facing_3d * arrow_size - right * arrow_size * 0.5, color);
    }

    /// Draw a circle representing agent radius.
    pub fn draw_radius_circle(
        gizmos: &mut Gizmos,
        position: Vec3,
        radius: f32,
        segments: usize,
        color: Color,
    ) {
        for i in 0..segments {
            let angle1 = (i as f32 / segments as f32) * std::f32::consts::TAU;
            let angle2 = ((i + 1) as f32 / segments as f32) * std::f32::consts::TAU;

            let p1 = position + Vec3::new(angle1.cos() * radius, 0.0, angle1.sin() * radius);
            let p2 = position + Vec3::new(angle2.cos() * radius, 0.0, angle2.sin() * radius);

            gizmos.line(p1, p2, color);
        }
    }

    /// Draw a line-of-sight ray with hit indicator.
    pub fn draw_los_ray(
        gizmos: &mut Gizmos,
        from: Vec3,
        to: Vec3,
        blocked: bool,
        blocked_point: Option<Vec3>,
        clear_color: Color,
        blocked_color: Color,
    ) {
        if blocked {
            if let Some(hit_point) = blocked_point {
                // Draw line to hit point in blocked color
                gizmos.line(from, hit_point, blocked_color);
                // Draw X at hit point
                let size = 0.2;
                gizmos.line(
                    hit_point - Vec3::new(size, 0.0, size),
                    hit_point + Vec3::new(size, 0.0, size),
                    blocked_color,
                );
                gizmos.line(
                    hit_point - Vec3::new(-size, 0.0, size),
                    hit_point + Vec3::new(-size, 0.0, size),
                    blocked_color,
                );
            } else {
                gizmos.line(from, to, blocked_color);
            }
        } else {
            gizmos.line(from, to, clear_color);
        }
    }
}

/// System that draws navigation path debug visuals.
pub fn draw_nav_paths(
    config: Option<Res<AiDebugConfig>>,
    mut gizmos: Gizmos,
    query: Query<(&Transform, &NavPathFollower)>,
) {
    let config = config.map(|c| c.clone()).unwrap_or_default();
    if !config.show_paths && !config.show_waypoints {
        return;
    }

    for (transform, follower) in query.iter() {
        if follower.path.is_empty() {
            continue;
        }

        let height = transform.translation.y + 0.1;

        if config.show_paths {
            // Draw line from current position to first waypoint
            if let Some(first) = follower.path.get(follower.current_waypoint) {
                let from = Vec3::new(transform.translation.x, height, transform.translation.z);
                let to = Vec3::new(first.x, height, first.y);
                gizmos.line(from, to, color_from_rgba(config.path_color));
            }

            // Draw remaining path
            let remaining: Vec<_> = follower.path[follower.current_waypoint..].to_vec();
            AiDebugGizmos::draw_path(
                &mut gizmos,
                &remaining,
                height,
                color_from_rgba(config.path_color),
            );
        }

        if config.show_waypoints {
            let mut faded_color = config.waypoint_color;
            faded_color[3] *= 0.5;
            AiDebugGizmos::draw_waypoints(
                &mut gizmos,
                &follower.path,
                follower.current_waypoint,
                height,
                color_from_rgba(faded_color),
                color_from_rgba(config.waypoint_color),
            );
        }
    }
}

/// System that draws agent facing direction and perception cones.
pub fn draw_agent_perception(
    config: Option<Res<AiDebugConfig>>,
    mut gizmos: Gizmos,
    query: Query<(&Transform, Option<&AiFacing>, Option<&AiRadius>), With<PhysicsNavAgent>>,
) {
    let config = config.map(|c| c.clone()).unwrap_or_default();

    for (transform, facing, radius) in query.iter() {
        let pos = transform.translation + Vec3::Y * 0.1;

        // Draw facing direction
        if config.show_facing {
            if let Some(facing) = facing {
                AiDebugGizmos::draw_facing(
                    &mut gizmos,
                    pos,
                    facing.0,
                    1.5,
                    color_from_rgba(config.facing_color),
                );
            }
        }

        // Draw perception cone
        if config.show_perception_cones {
            if let Some(facing) = facing {
                AiDebugGizmos::draw_perception_cone(
                    &mut gizmos,
                    pos,
                    facing.0,
                    config.perception_half_angle,
                    config.perception_range,
                    8,
                    color_from_rgba(config.perception_color),
                );
            }
        }

        // Draw radius circle
        if config.show_radius {
            let r = radius.map(|r| r.0).unwrap_or(0.5);
            AiDebugGizmos::draw_radius_circle(
                &mut gizmos,
                pos,
                r,
                16,
                color_from_rgba(config.radius_color),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debug_config_default() {
        let config = AiDebugConfig::default();
        assert!(config.show_paths);
        assert!(config.show_waypoints);
        assert!(!config.show_perception_cones);
        assert!(config.show_facing);
    }

    #[test]
    fn test_colors() {
        let config = AiDebugConfig::default();
        assert_eq!(config.path_color[3], 1.0); // Full opacity
        assert!(config.perception_color[3] < 1.0); // Semi-transparent
    }

    #[test]
    fn test_color_conversion() {
        let color = color_from_rgba([1.0, 0.5, 0.0, 1.0]);
        // Just verify it doesn't panic
        let _ = color;
    }
}
