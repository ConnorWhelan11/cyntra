//! Egui tooling for `ai-debug`'s Bevy `ai-bevy` debug draw plugin.
//!
//! This is an optional convenience layer: it provides an egui control panel for
//! [`AiBevyDebugDrawConfig`] and a click-to-set workflow for nav corridor queries.

use ai_nav::Vec2;
use bevy_app::{App, Plugin, Update};
use bevy_ecs::prelude::{Entity, Query, Res, ResMut, Resource, With};
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiPrimaryContextPass};
use bevy_input::keyboard::KeyCode;
use bevy_input::mouse::MouseButton;
use bevy_input::ButtonInput;
use bevy_math::{Ray3d, Vec2 as BVec2, Vec3};
use bevy_render::camera::Camera;
use bevy_transform::components::GlobalTransform;
use bevy_window::{PrimaryWindow, Window};

use crate::bevy::BevyDebugPlane;
use crate::bevy_ai::AiBevyDebugDrawConfig;

#[derive(Debug, Clone)]
#[derive(Resource)]
pub struct AiBevyDebugDrawEguiState {
    pub open: bool,
    pub click_sets_goal: bool,
    pub shift_click_sets_start: bool,
    /// Optional camera entity to use for viewport picking.
    ///
    /// If `None`, the picker uses a simple heuristic to select an active camera.
    pub pick_camera: Option<Entity>,
}

impl Default for AiBevyDebugDrawEguiState {
    fn default() -> Self {
        Self {
            open: true,
            click_sets_goal: true,
            shift_click_sets_start: true,
            pick_camera: None,
        }
    }
}

fn ray_intersect_plane(ray: Ray3d, plane: BevyDebugPlane, height: f32) -> Option<Vec3> {
    let dir = ray.direction.as_vec3();

    let (denom, numer) = match plane {
        BevyDebugPlane::Xz => (dir.y, height - ray.origin.y),
        BevyDebugPlane::Xy => (dir.z, height - ray.origin.z),
    };

    if denom.abs() <= 1e-6 {
        return None;
    }

    let t = numer / denom;
    if !t.is_finite() || t < 0.0 {
        return None;
    }

    Some(ray.origin + dir * t)
}

fn bevy_cursor_to_nav_point(
    camera: &Camera,
    camera_transform: &GlobalTransform,
    cursor: BVec2,
    plane: BevyDebugPlane,
    height: f32,
) -> Option<Vec2> {
    let ray = camera.viewport_to_world(camera_transform, cursor).ok()?;
    let hit = ray_intersect_plane(ray, plane, height)?;
    Some(match plane {
        BevyDebugPlane::Xz => Vec2::new(hit.x, hit.z),
        BevyDebugPlane::Xy => Vec2::new(hit.x, hit.y),
    })
}

pub fn ai_bevy_debug_draw_egui_ui(
    mut contexts: EguiContexts,
    mut state: ResMut<AiBevyDebugDrawEguiState>,
    mut config: ResMut<AiBevyDebugDrawConfig>,
    cameras: Query<(Entity, &Camera)>,
) {
    if !state.open {
        return;
    }

    let Ok(ctx) = contexts.ctx_mut() else {
        return;
    };

    let mut open = state.open;
    egui::Window::new("AI Nav Debug")
        .open(&mut open)
        .default_size([420.0, 260.0])
        .show(ctx, |ui| {
            ui.label("NavMesh / Corridor debug drawing");
            ui.separator();

            ui.horizontal(|ui| {
                ui.checkbox(&mut config.draw_navmesh, "draw navmesh");
                ui.checkbox(&mut config.draw_agents, "draw agents");
            });

            ui.horizontal(|ui| {
                ui.label("plane:");
                ui.radio_value(&mut config.plane, BevyDebugPlane::Xz, "XZ");
                ui.radio_value(&mut config.plane, BevyDebugPlane::Xy, "XY");
            });

            ui.horizontal(|ui| {
                match config.plane {
                    BevyDebugPlane::Xz => ui.label("y height:"),
                    BevyDebugPlane::Xy => ui.label("z height:"),
                };
                ui.add(egui::DragValue::new(&mut config.height).speed(0.05));
            });

            ui.horizontal(|ui| {
                let mut camera_infos = cameras
                    .iter()
                    .map(|(entity, camera)| (entity, camera.order, camera.is_active))
                    .collect::<Vec<(Entity, isize, bool)>>();
                camera_infos.sort_by(|(a_entity, a_order, _), (b_entity, b_order, _)| {
                    a_order.cmp(b_order).then_with(|| a_entity.cmp(b_entity))
                });

                let selected_text = match state.pick_camera {
                    None => "pick camera: auto".to_string(),
                    Some(selected) => camera_infos
                        .iter()
                        .find(|(entity, _, _)| *entity == selected)
                        .map(|(entity, order, active)| {
                            format!(
                                "pick camera: {:?} (order {}, {})",
                                entity,
                                order,
                                if *active { "active" } else { "inactive" }
                            )
                        })
                        .unwrap_or_else(|| format!("pick camera: {:?} (missing)", selected)),
                };

                egui::ComboBox::from_id_salt("ai_debug_pick_camera")
                    .selected_text(selected_text)
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut state.pick_camera, None, "auto");

                        for (entity, order, active) in camera_infos {
                            ui.selectable_value(
                                &mut state.pick_camera,
                                Some(entity),
                                format!(
                                    "{:?} (order {}, {})",
                                    entity,
                                    order,
                                    if active { "active" } else { "inactive" }
                                ),
                            );
                        }
                    });
            });

            ui.separator();

            ui.checkbox(&mut config.draw_corridor_query, "draw corridor query");

            ui.horizontal(|ui| {
                ui.label("start:");
                ui.add(egui::DragValue::new(&mut config.corridor_query_start.x).speed(0.05));
                ui.add(egui::DragValue::new(&mut config.corridor_query_start.y).speed(0.05));
            });
            ui.horizontal(|ui| {
                ui.label("goal:");
                ui.add(egui::DragValue::new(&mut config.corridor_query_goal.x).speed(0.05));
                ui.add(egui::DragValue::new(&mut config.corridor_query_goal.y).speed(0.05));
            });

            ui.horizontal(|ui| {
                if ui.button("swap").clicked() {
                    let start = config.corridor_query_start;
                    config.corridor_query_start = config.corridor_query_goal;
                    config.corridor_query_goal = start;
                }
                if ui.button("zero").clicked() {
                    config.corridor_query_start = Vec2::ZERO;
                    config.corridor_query_goal = Vec2::ZERO;
                }
            });

            ui.separator();

            ui.checkbox(&mut state.click_sets_goal, "click in viewport sets goal");
            ui.checkbox(
                &mut state.shift_click_sets_start,
                "shift+click sets start",
            );

            ui.small("Tip: enable 'draw corridor query', then click on the navmesh to move the goal.");
        });

    state.open = open;
}

pub fn ai_bevy_debug_draw_pick_goal(
    mouse: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    cameras: Query<(Entity, &Camera, &GlobalTransform)>,
    mut contexts: EguiContexts,
    state: Res<AiBevyDebugDrawEguiState>,
    mut config: ResMut<AiBevyDebugDrawConfig>,
) {
    if !state.click_sets_goal || !config.draw_corridor_query {
        return;
    }

    if !mouse.just_pressed(MouseButton::Left) {
        return;
    }

    // Don't steal input from egui windows.
    if let Ok(ctx) = contexts.ctx_mut() {
        if ctx.wants_pointer_input() || ctx.is_pointer_over_area() {
            return;
        }
    }

    let Some(window) = windows.iter().next() else {
        return;
    };
    let Some(cursor) = window.cursor_position() else {
        return;
    };

    let mut best: Option<(&Camera, &GlobalTransform)> = None;
    if let Some(pick_camera) = state.pick_camera {
        if let Ok((_entity, camera, camera_transform)) = cameras.get(pick_camera) {
            if camera.is_active {
                best = Some((camera, camera_transform));
            }
        }
    }

    if best.is_none() {
        for (_entity, camera, camera_transform) in cameras.iter() {
            if !camera.is_active {
                continue;
            }

            match best {
                None => best = Some((camera, camera_transform)),
                Some((best_camera, _)) => {
                    // Prefer the "main world" camera when possible:
                    // - if an order==0 camera exists, pick it
                    // - otherwise, pick the lowest order (UI overlays usually render later)
                    let prefer = (camera.order == 0 && best_camera.order != 0)
                        || camera.order < best_camera.order;
                    if prefer {
                        best = Some((camera, camera_transform));
                    }
                }
            }
        }
    }
    let Some((camera, camera_transform)) = best else {
        return;
    };

    let Some(p) =
        bevy_cursor_to_nav_point(camera, camera_transform, cursor, config.plane, config.height)
    else {
        return;
    };

    let shift = state.shift_click_sets_start
        && (keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight));

    if shift {
        config.corridor_query_start = p;
    } else {
        config.corridor_query_goal = p;
    }
}

/// Egui control panel + click-to-set workflow for `AiBevyDebugDrawConfig`.
///
/// This plugin also adds:
/// - `bevy_egui::EguiPlugin` (if missing)
pub struct AiBevyDebugDrawEguiPlugin;

impl Default for AiBevyDebugDrawEguiPlugin {
    fn default() -> Self {
        Self
    }
}

impl Plugin for AiBevyDebugDrawEguiPlugin {
    fn build(&self, app: &mut App) {
        if !app.is_plugin_added::<EguiPlugin>() {
            app.add_plugins(EguiPlugin::default());
        }

        app.init_resource::<AiBevyDebugDrawConfig>();
        app.init_resource::<AiBevyDebugDrawEguiState>();

        app.add_systems(EguiPrimaryContextPass, ai_bevy_debug_draw_egui_ui);
        app.add_systems(Update, ai_bevy_debug_draw_pick_goal);
    }
}
