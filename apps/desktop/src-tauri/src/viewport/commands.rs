use tauri::{AppHandle, State};

use crate::ipc::schema::CommandEnvelope;
use crate::viewport::ViewportManager;

#[tauri::command]
pub fn viewport_open(app_handle: AppHandle, manager: State<ViewportManager>) -> Result<(), String> {
  manager.open(app_handle)
}

#[tauri::command]
pub fn viewport_close(app_handle: AppHandle, manager: State<ViewportManager>) -> Result<(), String> {
  let _ = app_handle;
  manager.shutdown()
}

#[tauri::command]
pub fn viewport_command(
  app_handle: AppHandle,
  manager: State<ViewportManager>,
  envelope: CommandEnvelope,
) -> Result<(), String> {
  manager.send_command(app_handle, envelope)
}
