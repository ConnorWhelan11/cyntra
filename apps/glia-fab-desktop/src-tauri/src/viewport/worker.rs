use std::fs;
use std::sync::mpsc::Receiver;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::ipc::bus::ViewportEventBus;
use crate::ipc::schema::{
  new_event_envelope, CommandEnvelope, ErrorPayload, PerfStatsPayload, SceneLoadedMetadata,
  SceneLoadedPayload, ShutdownAckPayload, ViewportClosedPayload, ViewportCommand, ViewportEvent,
  ViewportReadyPayload,
};

pub struct ViewportWorkerConfig {
  pub window_label: String,
}

pub struct ViewportWorkerHandle {
  pub command_tx: std::sync::mpsc::SyncSender<CommandEnvelope>,
  pub join: JoinHandle<()>,
  pub _event_guard: crate::ipc::bus::ViewportEventBusGuard,
}

pub fn spawn_viewport_worker(
  config: ViewportWorkerConfig,
  command_rx: Receiver<CommandEnvelope>,
  event_bus: ViewportEventBus,
) -> JoinHandle<()> {
  thread::spawn(move || viewport_worker_main(config, command_rx, event_bus))
}

fn viewport_worker_main(
  config: ViewportWorkerConfig,
  command_rx: Receiver<CommandEnvelope>,
  event_bus: ViewportEventBus,
) {
  let _ = event_bus.publish(new_event_envelope(
    ViewportEvent::ViewportReady(ViewportReadyPayload {
      window_label: config.window_label.clone(),
      backend: None,
      adapter_name: None,
    }),
    None,
  ));

  let mut frame_count: u64 = 0;
  let mut last_perf_emit = Instant::now();
  let mut last_frame_at = Instant::now();

  loop {
    let cmd = match command_rx.recv_timeout(Duration::from_millis(250)) {
      Ok(cmd) => Some(cmd),
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => None,
      Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
    };

    if let Some(envelope) = cmd {
      if handle_command(&config, &event_bus, envelope) {
        break;
      }
    }

    frame_count += 1;
    let now = Instant::now();
    let frame_dt = now.saturating_duration_since(last_frame_at);
    last_frame_at = now;

    if now.saturating_duration_since(last_perf_emit) >= Duration::from_secs(1) {
      last_perf_emit = now;
      let frame_time_ms = frame_dt.as_secs_f32() * 1000.0;
      let fps = if frame_time_ms > 0.0 { 1000.0 / frame_time_ms } else { 0.0 };

      let _ = event_bus.publish(new_event_envelope(
        ViewportEvent::PerfStats(PerfStatsPayload {
          fps,
          frame_time_ms,
          draw_calls: 0,
          triangle_count: 0,
          memory_usage_mb: None,
        }),
        None,
      ));
    }
  }

  let _ = event_bus.publish(new_event_envelope(
    ViewportEvent::ViewportClosed(ViewportClosedPayload {
      window_label: config.window_label,
      reason: Some("shutdown".to_string()),
    }),
    None,
  ));

  let _ = frame_count;
}

fn handle_command(config: &ViewportWorkerConfig, event_bus: &ViewportEventBus, envelope: CommandEnvelope) -> bool {
  let request_id = envelope.request_id.or(Some(envelope.message_id));

  match envelope.message {
    ViewportCommand::OpenViewport(_) => {
      let _ = event_bus.publish(new_event_envelope(
        ViewportEvent::ViewportReady(ViewportReadyPayload {
          window_label: config.window_label.clone(),
          backend: None,
          adapter_name: None,
        }),
        request_id,
      ));
      false
    }
    ViewportCommand::CloseViewport(_) => {
      let _ = event_bus.publish(new_event_envelope(
        ViewportEvent::ViewportClosed(ViewportClosedPayload {
          window_label: config.window_label.clone(),
          reason: Some("user_closed".to_string()),
        }),
        request_id,
      ));
      false
    }
    ViewportCommand::LoadScene(payload) => {
      let started = Instant::now();
      match fs::metadata(&payload.source) {
        Ok(meta) if meta.is_file() => {
          let parse_time_ms = started.elapsed().as_millis() as u64;
          let bounds = crate::ipc::schema::Aabb3 {
            min: [0.0, 0.0, 0.0],
            max: [0.0, 0.0, 0.0],
          };
          let scene_loaded = SceneLoadedPayload {
            request_id: request_id.unwrap_or_else(Uuid::new_v4),
            source: payload.source,
            entity_count: 0,
            bounds,
            metadata: Some(SceneLoadedMetadata {
              format: None,
              file_size_bytes: Some(meta.len()),
              parse_time_ms: Some(parse_time_ms),
            }),
          };
          let _ = event_bus.publish(new_event_envelope(
            ViewportEvent::SceneLoaded(scene_loaded),
            request_id,
          ));
        }
        Ok(_) | Err(_) => {
          let _ = event_bus.publish(new_event_envelope(
            ViewportEvent::Error(ErrorPayload {
              request_id,
              severity: "error".to_string(),
              code: "INVALID_SCENE_PATH".to_string(),
              message: format!("Scene path not found or not a file: {}", payload.source),
              details: None,
            }),
            request_id,
          ));
        }
      }
      false
    }
    ViewportCommand::Shutdown(payload) => {
      let started = Instant::now();
      let _ = payload;
      let cleanup_time_ms = started.elapsed().as_millis() as u64;
      let _ = event_bus.publish(new_event_envelope(
        ViewportEvent::ShutdownAck(ShutdownAckPayload {
          ok: true,
          cleanup_time_ms: Some(cleanup_time_ms),
        }),
        request_id,
      ));
      true
    }
    _ => false,
  }
}

