use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const SCHEMA_VERSION: &str = "1.0.0";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IpcWindow {
  Webui,
  Viewport,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageEnvelope<M> {
  pub schema_version: String,
  pub message_id: Uuid,
  pub request_id: Option<Uuid>,
  pub timestamp: u64,
  pub source_window: IpcWindow,
  pub target_window: IpcWindow,
  #[serde(flatten)]
  pub message: M,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct OpenViewportPayload {
  pub window_label: Option<String>,
  pub fresh: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CloseViewportPayload {
  pub unload: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetToolModePayload {
  pub mode: String,
  pub options: Option<SetToolModeOptions>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetToolModeOptions {
  pub snap_to_grid: Option<bool>,
  pub snap_distance: Option<f32>,
  pub multi_select: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetCameraPayload {
  pub position: [f32; 3],
  pub target: [f32; 3],
  pub fov: Option<f32>,
  pub transition: Option<CameraTransition>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CameraTransition {
  pub duration_ms: u64,
  pub easing: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SelectEntityPayload {
  pub entity_ids: Vec<String>,
  pub mode: String,
  pub focus: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LoadScenePayload {
  pub source: String,
  pub options: Option<LoadSceneOptions>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LoadSceneOptions {
  pub clear_existing: Option<bool>,
  pub spawn_point: Option<[f32; 3]>,
  pub background: Option<String>,
  pub background_color: Option<[f32; 4]>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetRenderOptionsPayload {
  pub msaa: Option<u8>,
  pub shadows: Option<bool>,
  pub ssao: Option<bool>,
  pub bloom: Option<bool>,
  pub tonemap: Option<String>,
  pub exposure: Option<f32>,
  pub debug_mode: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CaptureScreenshotPayload {
  pub width: Option<u32>,
  pub height: Option<u32>,
  pub format: String,
  pub quality: Option<u8>,
  pub transparent_background: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ShutdownPayload {
  pub deadline_ms: Option<u64>,
  pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "message_type", content = "payload")]
pub enum ViewportCommand {
  OpenViewport(OpenViewportPayload),
  CloseViewport(CloseViewportPayload),
  SetToolMode(SetToolModePayload),
  SetCamera(SetCameraPayload),
  SelectEntity(SelectEntityPayload),
  LoadScene(LoadScenePayload),
  SetRenderOptions(SetRenderOptionsPayload),
  CaptureScreenshot(CaptureScreenshotPayload),
  Shutdown(ShutdownPayload),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ViewportReadyPayload {
  pub window_label: String,
  pub backend: Option<String>,
  pub adapter_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ViewportClosedPayload {
  pub window_label: String,
  pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SelectionChangedPayload {
  pub entity_ids: Vec<String>,
  pub entity_metadata: Option<Vec<EntityMetadata>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EntityMetadata {
  pub id: String,
  pub name: Option<String>,
  pub r#type: Option<String>,
  pub bounds: Option<Aabb3>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Aabb3 {
  pub min: [f32; 3],
  pub max: [f32; 3],
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HoverChangedPayload {
  pub entity_id: Option<String>,
  pub world_position: Option<[f32; 3]>,
  pub surface_normal: Option<[f32; 3]>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CameraChangedPayload {
  pub position: [f32; 3],
  pub target: [f32; 3],
  pub fov: f32,
  pub up: [f32; 3],
  pub projection_matrix: Option<Vec<f32>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SceneLoadedPayload {
  pub request_id: Uuid,
  pub source: String,
  pub entity_count: u32,
  pub bounds: Aabb3,
  pub metadata: Option<SceneLoadedMetadata>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SceneLoadedMetadata {
  pub format: Option<String>,
  pub file_size_bytes: Option<u64>,
  pub parse_time_ms: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PerfStatsPayload {
  pub fps: f32,
  pub frame_time_ms: f32,
  pub draw_calls: u32,
  pub triangle_count: u32,
  pub memory_usage_mb: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ErrorPayload {
  pub request_id: Option<Uuid>,
  pub severity: String,
  pub code: String,
  pub message: String,
  pub details: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeviceLostPayload {
  pub recoverable: bool,
  pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ShutdownAckPayload {
  pub ok: bool,
  pub cleanup_time_ms: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "message_type", content = "payload")]
pub enum ViewportEvent {
  ViewportReady(ViewportReadyPayload),
  ViewportClosed(ViewportClosedPayload),
  SelectionChanged(SelectionChangedPayload),
  HoverChanged(HoverChangedPayload),
  CameraChanged(CameraChangedPayload),
  SceneLoaded(SceneLoadedPayload),
  PerfStats(PerfStatsPayload),
  Error(ErrorPayload),
  DeviceLost(DeviceLostPayload),
  ShutdownAck(ShutdownAckPayload),
}

pub type CommandEnvelope = MessageEnvelope<ViewportCommand>;
pub type EventEnvelope = MessageEnvelope<ViewportEvent>;

pub fn epoch_ms_now() -> u64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

pub fn new_command_envelope(command: ViewportCommand, request_id: Option<Uuid>) -> CommandEnvelope {
  CommandEnvelope {
    schema_version: SCHEMA_VERSION.to_string(),
    message_id: Uuid::new_v4(),
    request_id,
    timestamp: epoch_ms_now(),
    source_window: IpcWindow::Webui,
    target_window: IpcWindow::Viewport,
    message: command,
  }
}

pub fn new_event_envelope(event: ViewportEvent, request_id: Option<Uuid>) -> EventEnvelope {
  EventEnvelope {
    schema_version: SCHEMA_VERSION.to_string(),
    message_id: Uuid::new_v4(),
    request_id,
    timestamp: epoch_ms_now(),
    source_window: IpcWindow::Viewport,
    target_window: IpcWindow::Webui,
    message: event,
  }
}

