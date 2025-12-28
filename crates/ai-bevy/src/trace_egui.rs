use bevy_app::{App, Plugin};
use bevy_ecs::prelude::{ResMut, Resource};
use bevy_egui::{egui, EguiContexts, EguiPlugin, EguiPrimaryContextPass};

use crate::{AiTraceBuffer, AiTraceInspectorPlugin};

#[derive(Debug, Default)]
#[derive(Resource)]
pub struct AiTraceEguiState {
    pub filter_tag: String,
    pub filter_agent: String,
    pub max_rows: usize,
    pub stick_to_bottom: bool,
}

pub fn trace_egui_ui(
    mut contexts: EguiContexts,
    mut state: ResMut<AiTraceEguiState>,
    mut buffer: ResMut<AiTraceBuffer>,
) {
    if state.max_rows == 0 {
        state.max_rows = 200;
    }

    let Ok(ctx) = contexts.ctx_mut() else {
        return;
    };

    egui::Window::new("AI Trace")
        .default_size([520.0, 360.0])
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(format!("events: {}", buffer.events.len()));
                ui.separator();

                ui.label("capacity:");
                let mut capacity = buffer.capacity as i64;
                if ui
                    .add(egui::DragValue::new(&mut capacity).range(1..=100_000))
                    .changed()
                {
                    buffer.capacity = capacity.max(1) as usize;
                    while buffer.events.len() > buffer.capacity {
                        buffer.events.pop_front();
                    }
                }

                if ui.button("clear").clicked() {
                    buffer.events.clear();
                }
            });

            ui.separator();

            ui.horizontal(|ui| {
                ui.label("tag:");
                ui.text_edit_singleline(&mut state.filter_tag);
                ui.label("agent:");
                ui.text_edit_singleline(&mut state.filter_agent);
            });

            ui.horizontal(|ui| {
                ui.label("rows:");
                ui.add(egui::DragValue::new(&mut state.max_rows).range(10..=10_000));
                ui.checkbox(&mut state.stick_to_bottom, "follow");
            });

            ui.separator();

            let tag_filter = state.filter_tag.trim().to_owned();
            let agent_filter = state.filter_agent.trim().parse::<u64>().ok();
            let max_rows = state.max_rows;

            let mut events: Vec<_> = buffer
                .events
                .iter()
                .filter(|e| {
                    let tag_ok =
                        tag_filter.is_empty() || e.event.tag.as_ref().contains(&tag_filter);
                    let agent_ok = agent_filter.is_none() || agent_filter == Some(e.agent.0);
                    tag_ok && agent_ok
                })
                .rev()
                .take(max_rows)
                .collect();
            events.reverse();

            egui::ScrollArea::vertical()
                .stick_to_bottom(state.stick_to_bottom)
                .show(ui, |ui| {
                    for e in events {
                        ui.monospace(format!(
                            "[{:>6}] agent={:<6} tag={} a={} b={}",
                            e.event.tick, e.agent.0, e.event.tag, e.event.a, e.event.b
                        ));
                    }
                });
        });
}

/// Optional egui-based UI for `AiTraceBuffer`.
///
/// This plugin also adds:
/// - `bevy_egui::EguiPlugin` (if missing)
/// - `AiTraceInspectorPlugin` (if missing)
pub struct AiTraceEguiPlugin;

impl Default for AiTraceEguiPlugin {
    fn default() -> Self {
        Self
    }
}

impl Plugin for AiTraceEguiPlugin {
    fn build(&self, app: &mut App) {
        if !app.is_plugin_added::<EguiPlugin>() {
            app.add_plugins(EguiPlugin::default());
        }
        if !app.is_plugin_added::<AiTraceInspectorPlugin>() {
            app.add_plugins(AiTraceInspectorPlugin);
        }

        app.init_resource::<AiTraceEguiState>();
        app.add_systems(EguiPrimaryContextPass, trace_egui_ui);
    }
}
