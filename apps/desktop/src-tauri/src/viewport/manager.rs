use std::sync::mpsc::{sync_channel, TrySendError};
use std::sync::Mutex;
use std::thread;

use tauri::AppHandle;
use uuid::Uuid;

use crate::ipc::bus::ViewportEventBus;
use crate::ipc::schema::{new_command_envelope, CommandEnvelope, ShutdownPayload, ViewportCommand};

use super::worker::{spawn_viewport_worker, ViewportWorkerConfig, ViewportWorkerHandle};

pub struct ViewportManager {
  inner: Mutex<ViewportManagerInner>,
}

struct ViewportManagerInner {
  worker: Option<ViewportWorkerHandle>,
}

impl ViewportManager {
  pub fn new() -> Self {
    Self {
      inner: Mutex::new(ViewportManagerInner { worker: None }),
    }
  }

  pub fn open(&self, app_handle: AppHandle) -> Result<(), String> {
    let mut inner = self
      .inner
      .lock()
      .map_err(|_| "viewport manager lock poisoned".to_string())?;

    if inner.worker.is_some() {
      return Ok(());
    }

    let (command_tx, command_rx) = sync_channel::<CommandEnvelope>(64);
    let (event_bus, event_guard) = ViewportEventBus::new(app_handle, 256);

    let config = ViewportWorkerConfig {
      window_label: "viewport".to_string(),
    };

    let join = spawn_viewport_worker(config, command_rx, event_bus);
    inner.worker = Some(ViewportWorkerHandle {
      command_tx,
      join,
      _event_guard: event_guard,
    });
    Ok(())
  }

  pub fn send_command(&self, app_handle: AppHandle, envelope: CommandEnvelope) -> Result<(), String> {
    let is_shutdown = matches!(&envelope.message, ViewportCommand::Shutdown(_));

    self.open(app_handle.clone())?;
    let mut inner = self
      .inner
      .lock()
      .map_err(|_| "viewport manager lock poisoned".to_string())?;

    let Some(worker) = inner.worker.as_ref() else {
      return Err("VIEWPORT_NOT_RUNNING".to_string());
    };

    match worker.command_tx.try_send(envelope) {
      Ok(()) => {
        if is_shutdown {
          if let Some(handle) = inner.worker.take() {
            thread::spawn(move || {
              let _ = handle.join.join();
            });
          }
        }
        Ok(())
      }
      Err(TrySendError::Full(_)) => Err("VIEWPORT_BUSY".to_string()),
      Err(TrySendError::Disconnected(envelope)) => {
        if let Some(handle) = inner.worker.take() {
          thread::spawn(move || {
            let _ = handle.join.join();
          });
        }
        drop(inner);

        self.open(app_handle)?;
        let inner = self
          .inner
          .lock()
          .map_err(|_| "viewport manager lock poisoned".to_string())?;
        let Some(worker) = inner.worker.as_ref() else {
          return Err("VIEWPORT_NOT_RUNNING".to_string());
        };
        worker.command_tx.try_send(envelope).map_err(|err| match err {
          TrySendError::Full(_) => "VIEWPORT_BUSY".to_string(),
          TrySendError::Disconnected(_) => "VIEWPORT_NOT_RUNNING".to_string(),
        })
      }
    }
  }

  pub fn shutdown(&self) -> Result<(), String> {
    let handle = {
      let mut inner = self
        .inner
        .lock()
        .map_err(|_| "viewport manager lock poisoned".to_string())?;
      inner.worker.take()
    };

    let Some(handle) = handle else {
      return Ok(());
    };

    let deadline_ms = Some(5000);
    let shutdown = new_command_envelope(
      ViewportCommand::Shutdown(ShutdownPayload {
        deadline_ms,
        reason: Some("app_exit".to_string()),
      }),
      Some(Uuid::new_v4()),
    );
    let _ = handle.command_tx.try_send(shutdown);

    thread::spawn(move || {
      let _ = handle.join.join();
    });

    Ok(())
  }
}

impl Default for ViewportManager {
  fn default() -> Self {
    Self::new()
  }
}
