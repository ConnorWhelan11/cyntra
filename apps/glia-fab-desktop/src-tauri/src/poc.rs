use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

const VIEWPORT_POC_LABEL: &str = "viewport_poc";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, Serialize)]
pub struct PocPingPayload {
  pub nonce: String,
  pub sent_at: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PocPongPayload {
  pub nonce: String,
  pub sent_at: u64,
  pub received_at: u64,
  pub pong_at: u64,
  pub rtt_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PocPongParams {
  pub nonce: String,
  pub sent_at: u64,
  pub received_at: u64,
}

fn now_ms() -> u64 {
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default();
  now.as_millis() as u64
}

fn ensure_viewport_poc_window(app_handle: &AppHandle) -> Result<(), String> {
  if let Some(window) = app_handle.get_webview_window(VIEWPORT_POC_LABEL) {
    let _ = window.show();
    let _ = window.set_focus();
    return Ok(());
  }

  WebviewWindowBuilder::new(
    app_handle,
    VIEWPORT_POC_LABEL,
    WebviewUrl::App("index.html".into()),
  )
  .title("Viewport PoC")
  .inner_size(900.0, 600.0)
  .resizable(true)
  .build()
  .map_err(|e| e.to_string())?;

  Ok(())
}

fn emit_ping(app_handle: &AppHandle, nonce: String) -> Result<String, String> {
  let ping = PocPingPayload {
    nonce: nonce.clone(),
    sent_at: now_ms(),
  };
  app_handle
    .emit_to(VIEWPORT_POC_LABEL, "poc:ping", ping)
    .map_err(|e| e.to_string())?;
  Ok(nonce)
}

#[tauri::command]
pub async fn poc_open_viewport_poc_window(app_handle: AppHandle) -> Result<String, String> {
  ensure_viewport_poc_window(&app_handle)?;
  emit_ping(&app_handle, Uuid::new_v4().to_string())
}

#[tauri::command]
pub fn poc_close_viewport_poc_window(app_handle: AppHandle) -> Result<(), String> {
  let Some(window) = app_handle.get_webview_window(VIEWPORT_POC_LABEL) else {
    return Ok(());
  };
  window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn poc_ping_viewport_poc_window(app_handle: AppHandle) -> Result<String, String> {
  let Some(window) = app_handle.get_webview_window(VIEWPORT_POC_LABEL) else {
    return Err("Poc viewport window not open".to_string());
  };
  let _ = window.show();
  let _ = window.set_focus();
  emit_ping(&app_handle, Uuid::new_v4().to_string())
}

#[tauri::command]
pub fn poc_pong(app_handle: AppHandle, params: PocPongParams) -> Result<(), String> {
  let pong_at = now_ms();
  let rtt_ms = pong_at.saturating_sub(params.sent_at);
  let payload = PocPongPayload {
    nonce: params.nonce,
    sent_at: params.sent_at,
    received_at: params.received_at,
    pong_at,
    rtt_ms,
  };

  app_handle
    .emit_to(MAIN_WINDOW_LABEL, "poc:pong", payload)
    .map_err(|e| e.to_string())
}
