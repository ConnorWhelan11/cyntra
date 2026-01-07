#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;
mod poc;
mod viewport;

use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::{BufRead, Read, Write};
use std::net::{SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use mime_guess::MimeGuess;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;
use walkdir::WalkDir;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use poc::{poc_close_viewport_poc_window, poc_open_viewport_poc_window, poc_ping_viewport_poc_window, poc_pong};
use viewport::{viewport_close, viewport_command, viewport_open, ViewportManager};

type CommandResult<T> = std::result::Result<T, String>;

const GLOBAL_ENV_SERVICE: &str = "cyntra-desktop";
const GLOBAL_ENV_ACCOUNT: &str = "global-env";

// ---------------------------------------------
// Local HTTP server (for viewer + game exports)
// ---------------------------------------------

#[derive(Clone, Default)]
struct WebRoots {
  viewer_dir: Option<PathBuf>,
  runs_dir: Option<PathBuf>,
  immersa_dir: Option<PathBuf>,      // apps/immersa/resources/public/
  immersa_data_dir: Option<PathBuf>, // <project>/.cyntra/immersa/
}

struct WebServerState {
  addr: SocketAddr,
  roots: Arc<RwLock<WebRoots>>,
}

#[derive(Serialize)]
struct ServerInfo {
  base_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalEnvParams {
  text: String,
}

#[tauri::command]
fn get_global_env() -> CommandResult<Option<String>> {
  get_global_env_text_internal()
}

#[tauri::command]
fn set_global_env(params: GlobalEnvParams) -> CommandResult<()> {
  // Write to file first (dev-friendly)
  let file_path = global_env_file_path();
  if let Some(parent) = file_path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::write(&file_path, &params.text).map_err(|e| e.to_string())?;

  // Also try keychain (will prompt, but optional)
  let _ = global_env_entry()
    .and_then(|entry| entry.set_password(&params.text).map_err(|e| e.to_string()));

  Ok(())
}

#[tauri::command]
fn clear_global_env() -> CommandResult<()> {
  // Remove file
  let file_path = global_env_file_path();
  if file_path.exists() {
    fs::remove_file(&file_path).map_err(|e| e.to_string())?;
  }

  // Also clear keychain (optional)
  let Ok(entry) = global_env_entry() else {
    return Ok(());
  };
  match entry.delete_password() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(_) => Ok(()),
  }
}

fn safe_join(root: &Path, requested_path: &str) -> Result<PathBuf> {
  fn hex_val(b: u8) -> Option<u8> {
    match b {
      b'0'..=b'9' => Some(b - b'0'),
      b'a'..=b'f' => Some(b - b'a' + 10),
      b'A'..=b'F' => Some(b - b'A' + 10),
      _ => None,
    }
  }

  fn percent_decode_segment(input: &str) -> Result<String> {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
      if bytes[i] == b'%' && i + 2 < bytes.len() {
        let Some(hi) = hex_val(bytes[i + 1]) else {
          out.push(bytes[i]);
          i += 1;
          continue;
        };
        let Some(lo) = hex_val(bytes[i + 2]) else {
          out.push(bytes[i]);
          i += 1;
          continue;
        };
        out.push((hi << 4) | lo);
        i += 3;
        continue;
      }
      out.push(bytes[i]);
      i += 1;
    }

    String::from_utf8(out).map_err(|_| anyhow!("invalid url encoding"))
  }

  let path = requested_path.split('?').next().unwrap_or("");
  let mut rel = path.trim_start_matches('/').to_string();
  if rel.is_empty() || rel.ends_with('/') {
    rel.push_str("index.html");
  }

  let mut out = PathBuf::from(root);
  for part in rel.split('/') {
    if part.is_empty() || part == "." {
      continue;
    }

    let decoded = percent_decode_segment(part)?;

    // Reject traversal and unexpected separators after decoding
    if decoded == ".." || decoded.contains('/') || decoded.contains('\\') {
      return Err(anyhow!("path traversal blocked"));
    }
    if decoded.is_empty() || decoded == "." {
      continue;
    }

    out.push(decoded);
  }
  Ok(out)
}

fn is_allowed_origin(origin: &str) -> bool {
  origin == "tauri://localhost"
    || origin.starts_with("http://localhost")
    || origin.starts_with("http://127.0.0.1")
    || origin.starts_with("https://localhost")
    || origin.starts_with("https://127.0.0.1")
}

fn ensure_executable(path: &Path) -> Result<()> {
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms)?;
  }
  Ok(())
}

fn write_executable_file(path: &Path, content: &str) -> Result<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(path, content)?;
  ensure_executable(path)?;
  Ok(())
}

fn prepend_path(dir: &Path, existing: Option<std::ffi::OsString>) -> std::ffi::OsString {
  let mut parts: Vec<std::path::PathBuf> = Vec::new();
  parts.push(dir.to_path_buf());
  if let Some(existing) = existing {
    for p in std::env::split_paths(&existing) {
      parts.push(p);
    }
  }
  std::env::join_paths(parts).unwrap_or_else(|_| dir.as_os_str().to_owned())
}

fn read_env_text(text: &str) -> HashMap<String, String> {
  let mut out = HashMap::new();
  for raw_line in text.lines() {
    let mut line = raw_line.trim();
    if line.is_empty() || line.starts_with('#') {
      continue;
    }
    if let Some(stripped) = line.strip_prefix("export ") {
      line = stripped.trim();
    }
    let Some(eq_idx) = line.find('=') else {
      continue;
    };
    let key = line[..eq_idx].trim();
    let mut value = line[eq_idx + 1..].trim().to_string();
    if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
      value = value[1..value.len() - 1].to_string();
      value = value
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace("\\\\", "\\")
        .replace("\\\"", "\"");
    } else if value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2 {
      value = value[1..value.len() - 1].to_string();
    }
    if !key.is_empty() {
      out.insert(key.to_string(), value);
    }
  }
  out
}

fn read_env_file(path: &Path) -> HashMap<String, String> {
  match fs::read_to_string(path) {
    Ok(text) => read_env_text(&text),
    Err(_) => HashMap::new(),
  }
}

fn global_env_file_path() -> PathBuf {
  let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
  PathBuf::from(home).join(".cyntra").join("global-env.txt")
}

fn global_env_entry() -> CommandResult<Entry> {
  Entry::new(GLOBAL_ENV_SERVICE, GLOBAL_ENV_ACCOUNT).map_err(|e| e.to_string())
}

fn get_global_env_text_internal() -> CommandResult<Option<String>> {
  // Try file-based storage first (dev-friendly, no keychain prompts)
  let file_path = global_env_file_path();
  if file_path.exists() {
    return fs::read_to_string(&file_path)
      .map(Some)
      .map_err(|e| e.to_string());
  }

  // Fallback to keychain (production, more secure)
  let entry = match global_env_entry() {
    Ok(entry) => entry,
    Err(_) => return Ok(None),
  };
  match entry.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(_) => Ok(None),
  }
}

fn ensure_project_shims(project_root: &Path) -> Result<PathBuf> {
  let bin_dir = project_root.join(".cyntra/bin");
  fs::create_dir_all(&bin_dir)?;

  struct Shim<'a> {
    name: &'a str,
    module: &'a str,
  }

  let shims = [
    Shim {
      name: "cyntra",
      module: "cyntra.cli",
    },
    Shim {
      name: "workcell",
      module: "cyntra.workcell.cli",
    },
    Shim {
      name: "fab-gate",
      module: "cyntra.fab.gate",
    },
    Shim {
      name: "fab-render",
      module: "cyntra.fab.render",
    },
    Shim {
      name: "fab-godot",
      module: "cyntra.fab.godot",
    },
    Shim {
      name: "fab-critics",
      module: "cyntra.fab.critics.cli",
    },
    Shim {
      name: "fab-regression",
      module: "cyntra.fab.regression",
    },
    Shim {
      name: "fab-scaffold",
      module: "cyntra.fab.scaffolds.cli",
    },
  ];

  for shim in shims {
    let path = bin_dir.join(shim.name);
    let script = format!(
      r#"#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${{BASH_SOURCE[0]}}")/../.." && pwd)"
cd "$ROOT"

export PYTHONUNBUFFERED=1
export PYTHONPATH="$ROOT/kernel/src${{PYTHONPATH:+:$PYTHONPATH}}"

PYTHON="${{CYNTRA_PYTHON:-}}"
if [[ -z "$PYTHON" ]]; then
  if [[ -n "${{VIRTUAL_ENV:-}}" && -x "${{VIRTUAL_ENV}}/bin/python" ]]; then
    PYTHON="${{VIRTUAL_ENV}}/bin/python"
  elif [[ -x "$ROOT/.cyntra/venv/bin/python" ]]; then
    PYTHON="$ROOT/.cyntra/venv/bin/python"
  elif [[ -x "$ROOT/.venv/bin/python" ]]; then
    PYTHON="$ROOT/.venv/bin/python"
  elif [[ -x "$ROOT/kernel/.venv/bin/python" ]]; then
    PYTHON="$ROOT/kernel/.venv/bin/python"
  else
    PYTHON="$(command -v python3 || command -v python)"
  fi
fi

exec "$PYTHON" -m {module} "$@"
"#,
      module = shim.module
    );
    write_executable_file(&path, &script)?;
  }

  Ok(bin_dir)
}

fn start_local_server(roots: Arc<RwLock<WebRoots>>) -> Result<WebServerState> {
  let listener = TcpListener::bind("127.0.0.1:0").context("bind local http server")?;
  let addr = listener.local_addr().context("read local http addr")?;

  let roots_for_thread = roots.clone();
  thread::spawn(move || {
    let server =
      tiny_http::Server::from_listener(listener, None).expect("tiny_http server");
    for request in server.incoming_requests() {
      let url = request.url().to_string();
      let method = request.method().as_str().to_string();

      let allowed_origin = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Origin"))
        .and_then(|h| {
          let origin = h.value.as_str();
          if is_allowed_origin(origin) {
            Some(origin.to_string())
          } else {
            None
          }
        });

      let apply_common_headers = {
        let allowed_origin = allowed_origin.clone();
        move |mut response: tiny_http::Response<Box<dyn Read + Send>>,
              content_type: Option<String>| {
          if let Some(ct) = content_type {
            let header =
              tiny_http::Header::from_bytes(&b"Content-Type"[..], ct.as_bytes())
                .expect("content-type header");
            response = response.with_header(header).boxed();
          }
          response = response
            .with_header(
              tiny_http::Header::from_bytes(
                &b"X-Content-Type-Options"[..],
                &b"nosniff"[..],
              )
              .expect("nosniff header"),
            )
            .boxed()
            .with_header(
              tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..])
                .expect("cache header"),
            )
            .boxed();

          if let Some(origin) = allowed_origin.as_deref() {
            response = response
              .with_header(
                tiny_http::Header::from_bytes(
                  &b"Access-Control-Allow-Origin"[..],
                  origin.as_bytes(),
                )
                .expect("cors origin header"),
              )
              .boxed()
              .with_header(
                tiny_http::Header::from_bytes(&b"Vary"[..], &b"Origin"[..])
                  .expect("vary header"),
              )
              .boxed()
              .with_header(
                tiny_http::Header::from_bytes(
                  &b"Access-Control-Allow-Methods"[..],
                  &b"GET, HEAD, OPTIONS"[..],
                )
                .expect("cors methods header"),
              )
              .boxed()
              .with_header(
                tiny_http::Header::from_bytes(
                  &b"Access-Control-Allow-Headers"[..],
                  &b"*"[..],
                )
                .expect("cors headers header"),
              )
              .boxed();
          }
          response
        }
      };

      let send_response = |request: tiny_http::Request,
                           status: u16,
                           content_type: Option<String>,
                           body: Option<Vec<u8>>| {
        let mut response = match body {
          Some(bytes) => tiny_http::Response::from_data(bytes)
            .with_status_code(tiny_http::StatusCode(status))
            .boxed(),
          None => tiny_http::Response::empty(tiny_http::StatusCode(status)).boxed(),
        };
        response = apply_common_headers(response, content_type);
        let _ = request.respond(response);
      };

      let send_file_response = |request: tiny_http::Request,
                                status: u16,
                                content_type: Option<String>,
                                file: fs::File| {
        let response = tiny_http::Response::from_file(file)
          .with_status_code(tiny_http::StatusCode(status))
          .boxed();
        let response = apply_common_headers(response, content_type);
        let _ = request.respond(response);
      };

      let (root, path) = if url.starts_with("/viewer") {
        let viewer_dir = {
          roots_for_thread
            .read()
            .ok()
            .and_then(|r| r.viewer_dir.clone())
        };
        let Some(viewer_dir) = viewer_dir else {
          send_response(
            request,
            404,
            Some("text/plain".into()),
            Some(b"Viewer root not configured".to_vec()),
          );
          continue;
        };
        (viewer_dir, url.trim_start_matches("/viewer"))
      } else if url.starts_with("/artifacts") {
        let runs_dir = {
          roots_for_thread
            .read()
            .ok()
            .and_then(|r| r.runs_dir.clone())
        };
        let Some(runs_dir) = runs_dir else {
          send_response(
            request,
            404,
            Some("text/plain".into()),
            Some(b"Artifacts root not configured".to_vec()),
          );
          continue;
        };
        (runs_dir, url.trim_start_matches("/artifacts"))
      } else if url.starts_with("/immersa") {
        let immersa_dir = {
          roots_for_thread
            .read()
            .ok()
            .and_then(|r| r.immersa_dir.clone())
        };
        let Some(immersa_dir) = immersa_dir else {
          send_response(
            request,
            404,
            Some("text/plain".into()),
            Some(b"Immersa root not configured".to_vec()),
          );
          continue;
        };
        (immersa_dir, url.trim_start_matches("/immersa"))
      } else {
        send_response(request, 404, Some("text/plain".into()), Some(b"Not found".to_vec()));
        continue;
      };

      if method == "OPTIONS" {
        send_response(request, 204, None, None);
        continue;
      }

      if method != "GET" && method != "HEAD" {
        send_response(
          request,
          405,
          Some("text/plain".into()),
          Some(b"Method Not Allowed".to_vec()),
        );
        continue;
      }

      let resolved = match safe_join(&root, path) {
        Ok(p) => p,
        Err(_) => {
          send_response(request, 403, Some("text/plain".into()), Some(b"Forbidden".to_vec()));
          continue;
        }
      };

      if !resolved.is_file() {
        send_response(request, 404, Some("text/plain".into()), Some(b"Not found".to_vec()));
        continue;
      }

      let root_canon = match root.canonicalize() {
        Ok(p) => p,
        Err(_) => {
          send_response(
            request,
            500,
            Some("text/plain".into()),
            Some(b"Server root invalid".to_vec()),
          );
          continue;
        }
      };

      let resolved_canon = match resolved.canonicalize() {
        Ok(p) => p,
        Err(_) => {
          send_response(request, 404, Some("text/plain".into()), Some(b"Not found".to_vec()));
          continue;
        }
      };

      // Prevent symlink escape: canonical path must remain within root
      if !resolved_canon.starts_with(&root_canon) {
        send_response(request, 403, Some("text/plain".into()), Some(b"Forbidden".to_vec()));
        continue;
      }

      let mime = MimeGuess::from_path(&resolved_canon).first_or_octet_stream();
      let content_type = Some(mime.essence_str().to_string());

      if method == "HEAD" {
        send_response(request, 200, content_type, None);
        continue;
      }

      let file = match fs::File::open(&resolved_canon) {
        Ok(f) => f,
        Err(_) => {
          send_response(
            request,
            500,
            Some("text/plain".into()),
            Some(b"Failed to read file".to_vec()),
          );
          continue;
        }
      };
      send_file_response(request, 200, content_type, file);
    }
  });

  Ok(WebServerState { addr, roots })
}

#[tauri::command]
fn get_server_info(server: State<'_, Arc<WebServerState>>) -> ServerInfo {
  ServerInfo {
    base_url: format!("http://127.0.0.1:{}", server.addr.port()),
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetServerRootsParams {
  #[serde(default)]
  viewer_dir: Option<String>,
  #[serde(default)]
  project_root: Option<String>,
  #[serde(default)]
  immersa_dir: Option<String>,
}

#[tauri::command]
fn set_server_roots(
  server: State<'_, Arc<WebServerState>>,
  params: SetServerRootsParams,
) -> CommandResult<()> {
  let mut roots = server
    .roots
    .write()
    .map_err(|_| "server roots lock poisoned".to_string())?;
  roots.viewer_dir = params.viewer_dir.map(PathBuf::from);
  roots.immersa_dir = params.immersa_dir.map(PathBuf::from);
  let project_root = params.project_root.as_ref().map(PathBuf::from);
  roots.runs_dir = project_root.as_ref().map(|p| p.join(".cyntra/runs"));
  roots.immersa_data_dir = project_root.as_ref().map(|p| p.join(".cyntra/immersa"));
  if let Some(project_root) = project_root {
    let _ = ensure_project_shims(&project_root);
    if let Some(runs_dir) = &roots.runs_dir {
      let _ = fs::create_dir_all(runs_dir);
    }
    if let Some(immersa_data_dir) = &roots.immersa_data_dir {
      let _ = fs::create_dir_all(immersa_data_dir.join("presentations"));
    }
  }
  Ok(())
}

#[derive(Serialize)]
struct ProjectInfo {
  root: String,
  viewer_dir: Option<String>,
  cyntra_kernel_dir: Option<String>,
  immersa_data_dir: Option<String>,
}

#[tauri::command]
fn detect_project(root: String) -> CommandResult<ProjectInfo> {
  let root_path = PathBuf::from(&root);
  if !root_path.is_dir() {
    return Err(format!("not a directory: {}", root));
  }
  let viewer_dir = root_path.join("fab/assets/viewer");
  let cyntra_kernel_dir = root_path.join("kernel");
  let immersa_data_dir = root_path.join(".cyntra/immersa");
  Ok(ProjectInfo {
    root,
    viewer_dir: viewer_dir.is_dir().then(|| viewer_dir.to_string_lossy().to_string()),
    cyntra_kernel_dir: cyntra_kernel_dir
      .is_dir()
      .then(|| cyntra_kernel_dir.to_string_lossy().to_string()),
    immersa_data_dir: Some(immersa_data_dir.to_string_lossy().to_string()),
  })
}

// ---------------------------------------------
// Runs / artifacts
// ---------------------------------------------

fn epoch_ms_now() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn to_epoch_ms(ts: SystemTime) -> Option<u64> {
  ts.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as u64)
}

fn runs_dir_for_project(project_root: &str) -> PathBuf {
  PathBuf::from(project_root).join(".cyntra/runs")
}

fn sanitize_slug(input: &str) -> String {
  let mut out = String::new();
  for c in input.chars() {
    let keep = c.is_ascii_alphanumeric() || c == '-' || c == '_';
    if keep {
      out.push(c.to_ascii_lowercase());
    } else if c.is_whitespace() {
      out.push('_');
    }
    if out.len() >= 32 {
      break;
    }
  }
  if out.is_empty() {
    "run".to_string()
  } else {
    out
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunInfo {
  id: String,
  dir: String,
  modified_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunsListParams {
  project_root: String,
}

#[tauri::command]
fn runs_list(params: RunsListParams) -> CommandResult<Vec<RunInfo>> {
  let runs_dir = runs_dir_for_project(&params.project_root);
  if !runs_dir.is_dir() {
    return Ok(Vec::new());
  }

  let mut runs: Vec<RunInfo> = Vec::new();
  let entries = fs::read_dir(&runs_dir).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if !path.is_dir() {
      continue;
    }
    let id = entry.file_name().to_string_lossy().to_string();
    let modified_ms = entry
      .metadata()
      .ok()
      .and_then(|m| m.modified().ok())
      .and_then(to_epoch_ms);
    runs.push(RunInfo {
      id,
      dir: path.to_string_lossy().to_string(),
      modified_ms,
    });
  }

  runs.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then_with(|| b.id.cmp(&a.id)));
  Ok(runs)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactInfo {
  rel_path: String,
  kind: String,
  size_bytes: u64,
  url: String,
}

fn artifact_kind(path: &Path) -> &'static str {
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  match ext.as_str() {
    "json" => "json",
    "png" | "jpg" | "jpeg" | "webp" => "image",
    "glb" => "glb",
    "html" | "htm" => "html",
    "txt" | "log" | "md" | "yaml" | "yml" => "text",
    _ => "other",
  }
}

fn collect_files_recursive(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
  let entries = fs::read_dir(dir)?;
  for entry in entries {
    let entry = entry?;
    let path = entry.path();
    if path.is_dir() {
      collect_files_recursive(&path, out)?;
    } else if path.is_file() {
      out.push(path);
    }
  }
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunArtifactsParams {
  project_root: String,
  run_id: String,
}

#[tauri::command]
fn run_artifacts(params: RunArtifactsParams) -> CommandResult<Vec<ArtifactInfo>> {
  let runs_dir = runs_dir_for_project(&params.project_root);
  let run_dir = runs_dir.join(&params.run_id);
  if !run_dir.is_dir() {
    return Ok(Vec::new());
  }

  let mut files: Vec<PathBuf> = Vec::new();
  collect_files_recursive(&run_dir, &mut files).map_err(|e| e.to_string())?;

  let mut artifacts: Vec<ArtifactInfo> = Vec::new();
  for file in files {
    let rel = match file.strip_prefix(&run_dir) {
      Ok(r) => r,
      Err(_) => continue,
    };
    let rel_path = rel.to_string_lossy().replace('\\', "/");
    let size_bytes = file.metadata().ok().map(|m| m.len()).unwrap_or(0);
    artifacts.push(ArtifactInfo {
      rel_path: rel_path.clone(),
      kind: artifact_kind(&file).to_string(),
      size_bytes,
      url: format!("/artifacts/{}/{}", params.run_id, rel_path),
    });
  }

  artifacts.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
  Ok(artifacts)
}

// Hierarchical artifact tree node
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactNode {
  name: String,
  rel_path: String,
  is_dir: bool,
  kind: String,
  size_bytes: u64,
  url: Option<String>,
  children: Vec<ArtifactNode>,
}

fn build_artifact_tree(dir: &Path, run_dir: &Path, run_id: &str) -> ArtifactNode {
  let name = dir
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("")
    .to_string();
  let rel_path = dir
    .strip_prefix(run_dir)
    .map(|p| p.to_string_lossy().replace('\\', "/"))
    .unwrap_or_default();

  let mut children: Vec<ArtifactNode> = Vec::new();

  if let Ok(entries) = fs::read_dir(dir) {
    let mut entries: Vec<_> = entries.flatten().collect();
    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
      let a_is_dir = a.path().is_dir();
      let b_is_dir = b.path().is_dir();
      match (a_is_dir, b_is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.file_name().cmp(&b.file_name()),
      }
    });

    for entry in entries {
      let path = entry.path();
      if path.is_dir() {
        children.push(build_artifact_tree(&path, run_dir, run_id));
      } else if path.is_file() {
        let file_name = path
          .file_name()
          .and_then(|n| n.to_str())
          .unwrap_or("")
          .to_string();
        let file_rel = path
          .strip_prefix(run_dir)
          .map(|p| p.to_string_lossy().replace('\\', "/"))
          .unwrap_or_default();
        let size_bytes = path.metadata().ok().map(|m| m.len()).unwrap_or(0);
        let kind = artifact_kind(&path).to_string();

        children.push(ArtifactNode {
          name: file_name,
          rel_path: file_rel.clone(),
          is_dir: false,
          kind,
          size_bytes,
          url: Some(format!("/artifacts/{}/{}", run_id, file_rel)),
          children: Vec::new(),
        });
      }
    }
  }

  // Calculate total size for directories
  let total_size: u64 = children.iter().map(|c| c.size_bytes).sum();

  ArtifactNode {
    name,
    rel_path,
    is_dir: true,
    kind: "dir".to_string(),
    size_bytes: total_size,
    url: None,
    children,
  }
}

#[tauri::command]
fn run_artifacts_tree(params: RunArtifactsParams) -> CommandResult<ArtifactNode> {
  let runs_dir = runs_dir_for_project(&params.project_root);
  let run_dir = runs_dir.join(&params.run_id);

  if !run_dir.is_dir() {
    return Ok(ArtifactNode {
      name: params.run_id.clone(),
      rel_path: "".to_string(),
      is_dir: true,
      kind: "dir".to_string(),
      size_bytes: 0,
      url: None,
      children: Vec::new(),
    });
  }

  Ok(build_artifact_tree(&run_dir, &run_dir, &params.run_id))
}

// ---------------------------------------------
// Run details
// ---------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunDetails {
  id: String,
  project_root: String,
  run_dir: String,
  command: String,
  label: Option<String>,
  started_ms: Option<u64>,
  ended_ms: Option<u64>,
  exit_code: Option<i32>,
  duration_ms: Option<u64>,
  artifacts_count: usize,
  terminal_log_lines: usize,
  issues_processed: Vec<String>,
  workcells_spawned: usize,
  gates_passed: usize,
  gates_failed: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunDetailsParams {
  project_root: String,
  run_id: String,
}

#[tauri::command]
fn run_details(params: RunDetailsParams) -> CommandResult<RunDetails> {
  let runs_dir = runs_dir_for_project(&params.project_root);
  let run_dir = runs_dir.join(&params.run_id);
  let run_dir_str = run_dir.to_string_lossy().to_string();

  if !run_dir.is_dir() {
    return Err(format!("Run not found: {}", params.run_id));
  }

  // Read run_meta.json
  let meta_path = run_dir.join("run_meta.json");
  let (command, label, started_ms) = if meta_path.is_file() {
    let text = fs::read_to_string(&meta_path).unwrap_or_default();
    let meta: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    (
      meta.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      meta.get("label").and_then(|v| v.as_str()).map(|s| s.to_string()),
      meta.get("started_ms").and_then(|v| v.as_u64()),
    )
  } else {
    (String::new(), None, None)
  };

  // Read job_result.json
  let result_path = run_dir.join("job_result.json");
  let (exit_code, ended_ms) = if result_path.is_file() {
    let text = fs::read_to_string(&result_path).unwrap_or_default();
    let result: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    (
      result.get("exit_code").and_then(|v| v.as_i64()).map(|v| v as i32),
      result.get("ended_ms").and_then(|v| v.as_u64()),
    )
  } else {
    (None, None)
  };

  // Calculate duration
  let duration_ms = match (started_ms, ended_ms) {
    (Some(start), Some(end)) if end >= start => Some(end - start),
    _ => None,
  };

  // Count artifacts
  let mut files: Vec<PathBuf> = Vec::new();
  let _ = collect_files_recursive(&run_dir, &mut files);
  let artifacts_count = files.len();

  // Count terminal.log lines
  let log_path = run_dir.join("terminal.log");
  let terminal_log_lines = if log_path.is_file() {
    fs::read_to_string(&log_path)
      .map(|text| text.lines().count())
      .unwrap_or(0)
  } else {
    0
  };

  // Parse events for this run from events.jsonl
  let events_path = cyntra_events_path(&params.project_root);
  let mut issues_processed: HashSet<String> = HashSet::new();
  let mut workcell_ids: HashSet<String> = HashSet::new();
  let mut workcells_spawned_fallback = 0usize;
  let mut gates_passed = 0usize;
  let mut gates_failed = 0usize;

  if events_path.is_file() {
    fn parse_rfc3339_ms(ts: &str) -> Option<u64> {
      let dt = OffsetDateTime::parse(ts, &Rfc3339).ok()?;
      let ms = dt.unix_timestamp_nanos() / 1_000_000;
      u64::try_from(ms).ok()
    }

    fn get_str<'a>(v: &'a serde_json::Value, keys: &[&str]) -> Option<&'a str> {
      keys
        .iter()
        .find_map(|k| v.get(*k).and_then(|x| x.as_str()))
    }

    fn get_run_id_field(v: &serde_json::Value) -> Option<&str> {
      v.get("run_id")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("runId").and_then(|x| x.as_str()))
    }

    fn event_matches_run(
      event: &serde_json::Value,
      run_id: &str,
      started_ms: Option<u64>,
      ended_ms: Option<u64>,
    ) -> bool {
      if let Some(ev_run) = get_run_id_field(event) {
        return ev_run == run_id;
      }
      if let Some(data) = event.get("data") {
        if let Some(data_run) = get_run_id_field(data) {
          return data_run == run_id;
        }
      }

      let Some(start) = started_ms else {
        // No reliable way to scope; fall back to including.
        return true;
      };
      let end = ended_ms.unwrap_or_else(epoch_ms_now);

      let Some(ts) = event.get("timestamp").and_then(|x| x.as_str()) else {
        return false;
      };
      let Some(ts_ms) = parse_rfc3339_ms(ts) else {
        return false;
      };

      ts_ms >= start && ts_ms <= end
    }

    let file = fs::File::open(&events_path).map_err(|e| e.to_string())?;
    let reader = std::io::BufReader::new(file);
    for line in reader.lines().map_while(Result::ok) {
      let line = line.trim();
      if line.is_empty() {
        continue;
      }

      let event: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => continue,
      };
      if !event.is_object() {
        continue;
      }
      if !event_matches_run(&event, &params.run_id, started_ms, ended_ms) {
        continue;
      }

      let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

      // Count unique issues touched during this run.
      if let Some(issue_id) = get_str(&event, &["issue_id", "issueId"]) {
        issues_processed.insert(issue_id.to_string());
      }

      // Count workcell creations (prefer unique workcell IDs)
      if event_type == "workcell.created" || event_type == "workcell.started" {
        if let Some(workcell_id) = get_str(&event, &["workcell_id", "workcellId"]) {
          workcell_ids.insert(workcell_id.to_string());
        } else {
          workcells_spawned_fallback += 1;
        }
      }

      // Count gate results
      if event_type == "gates.passed" {
        gates_passed += 1;
      }
      if event_type == "gates.failed" {
        gates_failed += 1;
      }
    }
  }

  let mut issues_processed: Vec<String> = issues_processed.into_iter().collect();
  issues_processed.sort();
  let workcells_spawned = workcell_ids.len() + workcells_spawned_fallback;

  Ok(RunDetails {
    id: params.run_id,
    project_root: params.project_root,
    run_dir: run_dir_str,
    command,
    label,
    started_ms,
    ended_ms,
    exit_code,
    duration_ms,
    artifacts_count,
    terminal_log_lines,
    issues_processed,
    workcells_spawned,
    gates_passed,
    gates_failed,
  })
}

// ---------------------------------------------
// Beads + Cyntra observability
// ---------------------------------------------

fn beads_dir_for_project(project_root: &str) -> PathBuf {
  PathBuf::from(project_root).join(".beads")
}

fn beads_issues_path(project_root: &str) -> PathBuf {
  beads_dir_for_project(project_root).join("issues.jsonl")
}

fn beads_deps_path(project_root: &str) -> PathBuf {
  beads_dir_for_project(project_root).join("deps.jsonl")
}

fn cyntra_events_path(project_root: &str) -> PathBuf {
  PathBuf::from(project_root)
    .join(".cyntra")
    .join("logs")
    .join("events.jsonl")
}

fn workcells_dir_for_project(project_root: &str) -> PathBuf {
  PathBuf::from(project_root).join(".workcells")
}

fn utc_now_rfc3339() -> String {
  OffsetDateTime::now_utc()
    .format(&Rfc3339)
    .unwrap_or_else(|_| format!("{}", epoch_ms_now()))
}

fn read_jsonl_objects(path: &Path) -> Vec<serde_json::Map<String, serde_json::Value>> {
  let text = match fs::read_to_string(path) {
    Ok(s) => s,
    Err(_) => return Vec::new(),
  };
  let mut out: Vec<serde_json::Map<String, serde_json::Value>> = Vec::new();
  for line in text.lines() {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    let value: serde_json::Value = match serde_json::from_str(line) {
      Ok(v) => v,
      Err(_) => continue,
    };
    if let serde_json::Value::Object(map) = value {
      out.push(map);
    }
  }
  out
}

fn read_jsonl_tail(path: &Path, limit: usize) -> Vec<serde_json::Map<String, serde_json::Value>> {
  let text = match fs::read_to_string(path) {
    Ok(s) => s,
    Err(_) => return Vec::new(),
  };
  let mut buf: VecDeque<serde_json::Map<String, serde_json::Value>> = VecDeque::new();
  for line in text.lines() {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    let value: serde_json::Value = match serde_json::from_str(line) {
      Ok(v) => v,
      Err(_) => continue,
    };
    if let serde_json::Value::Object(map) = value {
      buf.push_back(map);
      while buf.len() > limit {
        buf.pop_front();
      }
    }
  }
  buf.into_iter().collect()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BeadsDep {
  from_id: String,
  to_id: String,
  dep_type: String,
  created: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BeadsIssue {
  id: String,
  title: String,
  status: String,
  created: Option<String>,
  updated: Option<String>,
  description: Option<String>,
  tags: Vec<String>,
  dk_priority: Option<String>,
  dk_risk: Option<String>,
  dk_size: Option<String>,
  dk_tool_hint: Option<String>,
  dk_speculate: Option<bool>,
  dk_estimated_tokens: Option<i64>,
  dk_attempts: Option<i64>,
  dk_max_attempts: Option<i64>,
  ready: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KernelWorkcell {
  id: String,
  issue_id: String,
  created: Option<String>,
  path: String,
  speculate_tag: Option<String>,
  toolchain: Option<String>,
  proof_status: Option<String>,
  progress: f32,
  progress_stage: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KernelEvent {
  r#type: String,
  timestamp: Option<String>,
  issue_id: Option<String>,
  workcell_id: Option<String>,
  data: serde_json::Value,
  duration_ms: Option<i64>,
  tokens_used: Option<i64>,
  cost_usd: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KernelSnapshot {
  beads_present: bool,
  issues: Vec<BeadsIssue>,
  deps: Vec<BeadsDep>,
  workcells: Vec<KernelWorkcell>,
  events: Vec<KernelEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct KernelSnapshotParams {
  project_root: String,
  #[serde(default)]
  limit_events: Option<usize>,
}

fn parse_string(v: Option<&serde_json::Value>) -> Option<String> {
  match v {
    Some(serde_json::Value::String(s)) => Some(s.clone()),
    Some(other) => Some(other.to_string().trim_matches('"').to_string()),
    None => None,
  }
}

fn parse_i64(v: Option<&serde_json::Value>) -> Option<i64> {
  match v {
    Some(serde_json::Value::Number(n)) => n.as_i64(),
    Some(serde_json::Value::String(s)) => s.parse::<i64>().ok(),
    _ => None,
  }
}

fn parse_bool(v: Option<&serde_json::Value>) -> Option<bool> {
  match v {
    Some(serde_json::Value::Bool(b)) => Some(*b),
    Some(serde_json::Value::String(s)) => match s.to_ascii_lowercase().as_str() {
      "true" | "1" | "yes" => Some(true),
      "false" | "0" | "no" => Some(false),
      _ => None,
    },
    _ => None,
  }
}

fn load_beads_deps(project_root: &str) -> Vec<BeadsDep> {
  let raw = read_jsonl_objects(&beads_deps_path(project_root));
  raw
    .into_iter()
    .filter_map(|m| {
      let from_id = parse_string(m.get("from")).or_else(|| parse_string(m.get("from_id")))?;
      let to_id = parse_string(m.get("to")).or_else(|| parse_string(m.get("to_id")))?;
      let dep_type = parse_string(m.get("type")).or_else(|| parse_string(m.get("dep_type")))?;
      let created = parse_string(m.get("created"));
      Some(BeadsDep {
        from_id,
        to_id,
        dep_type,
        created,
      })
    })
    .collect()
}

fn load_beads_issues(project_root: &str) -> Vec<BeadsIssue> {
  let deps = load_beads_deps(project_root);
  let raw = read_jsonl_objects(&beads_issues_path(project_root));

  let mut status_by_id: HashMap<String, String> = HashMap::new();
  for m in &raw {
    if let Some(id) = parse_string(m.get("id")) {
      let status = parse_string(m.get("status")).unwrap_or_else(|| "open".to_string());
      status_by_id.insert(id, status);
    }
  }

  raw
    .into_iter()
    .filter_map(|m| {
      let id = parse_string(m.get("id"))?;
      let title = parse_string(m.get("title")).unwrap_or_else(|| "(untitled)".to_string());
      let status = parse_string(m.get("status")).unwrap_or_else(|| "open".to_string());
      let created = parse_string(m.get("created"));
      let updated = parse_string(m.get("updated"));
      let description = parse_string(m.get("description"));
      let tags: Vec<String> = match m.get("tags") {
        Some(serde_json::Value::Array(items)) => items
          .iter()
          .filter_map(|v| match v {
            serde_json::Value::String(s) => Some(s.clone()),
            _ => None,
          })
          .collect(),
        _ => Vec::new(),
      };

      let dk_priority = parse_string(m.get("dk_priority")).or_else(|| parse_string(m.get("priority")));
      let dk_risk = parse_string(m.get("dk_risk")).or_else(|| parse_string(m.get("risk")));
      let dk_size = parse_string(m.get("dk_size")).or_else(|| parse_string(m.get("size")));
      let dk_tool_hint = parse_string(m.get("dk_tool_hint")).or_else(|| parse_string(m.get("tool_hint")));
      let dk_speculate = parse_bool(m.get("dk_speculate"));
      let dk_estimated_tokens = parse_i64(m.get("dk_estimated_tokens"));
      let dk_attempts = parse_i64(m.get("dk_attempts"));
      let dk_max_attempts = parse_i64(m.get("dk_max_attempts"));

      let attempts = dk_attempts.unwrap_or(0);
      let max_attempts = dk_max_attempts.unwrap_or(3);

      let mut ready = status == "open" || status == "ready";
      let is_escalation = tags.iter().any(|t| {
        t == "escalation" || t == "needs-human" || t == "@human-escalated" || t == "human-escalated"
      });
      if is_escalation {
        ready = false;
      }
      if attempts >= max_attempts {
        ready = false;
      }
      if ready {
        // Must have all blockers done
        let blockers: Vec<String> = deps
          .iter()
          .filter(|d| d.dep_type == "blocks" && d.to_id == id)
          .map(|d| d.from_id.clone())
          .collect();
        for blocker_id in blockers {
          let st = status_by_id.get(&blocker_id).cloned().unwrap_or_else(|| "open".to_string());
          if st != "done" {
            ready = false;
            break;
          }
        }
      }

      Some(BeadsIssue {
        id,
        title,
        status,
        created,
        updated,
        description,
        tags,
        dk_priority,
        dk_risk,
        dk_size,
        dk_tool_hint,
        dk_speculate,
        dk_estimated_tokens,
        dk_attempts,
        dk_max_attempts,
        ready,
      })
    })
    .collect()
}

/// Compute workcell progress based on files and telemetry
///
/// Progress stages and approximate percentages:
/// - "created": 0.05 - workcell directory exists with marker
/// - "starting": 0.10 - manifest.json exists (toolchain assigned)
/// - "running": 0.20-0.80 - telemetry events indicate work in progress
/// - "gates": 0.85 - gates are running (proof.json has intermediate status)
/// - "complete": 1.0 - proof.json has final status (passed/failed/done)
fn compute_workcell_progress(wc_path: &std::path::Path) -> (f32, String) {
  let proof_path = wc_path.join("proof.json");
  let manifest_path = wc_path.join("manifest.json");
  let telemetry_path = wc_path.join("telemetry.jsonl");

  // Check proof.json for final status
  if proof_path.is_file() {
    if let Ok(content) = fs::read_to_string(&proof_path) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(status) = v.get("status").and_then(|s| s.as_str()) {
          let status_lower = status.to_lowercase();
          // Final states
          if status_lower.contains("pass") || status_lower.contains("done") ||
             status_lower.contains("fail") || status_lower.contains("error") ||
             status_lower.contains("complete") {
            return (1.0, "complete".to_string());
          }
          // Gates running
          if status_lower.contains("gate") || status_lower.contains("verif") ||
             status_lower.contains("check") {
            return (0.85, "gates".to_string());
          }
          // Running state
          if status_lower.contains("run") {
            return (0.50, "running".to_string());
          }
        }
      }
    }
  }

  // Check telemetry for progress indicators
  if telemetry_path.is_file() {
    if let Ok(content) = fs::read_to_string(&telemetry_path) {
      let line_count = content.lines().filter(|l| !l.trim().is_empty()).count();
      if line_count > 0 {
        // Estimate progress based on telemetry events
        // More events = more progress (capped at 0.80)
        let estimated = 0.20 + (line_count as f32 * 0.02).min(0.60);
        return (estimated, "running".to_string());
      }
    }
  }

  // Check for manifest (toolchain assigned)
  if manifest_path.is_file() {
    return (0.10, "starting".to_string());
  }

  // Just created
  (0.05, "created".to_string())
}

fn load_workcells(project_root: &str) -> Vec<KernelWorkcell> {
  let dir = workcells_dir_for_project(project_root);
  if !dir.is_dir() {
    return Vec::new();
  }

  let mut out: Vec<KernelWorkcell> = Vec::new();
  let entries = match fs::read_dir(&dir) {
    Ok(e) => e,
    Err(_) => return Vec::new(),
  };

  for entry in entries.flatten() {
    let wc_path = entry.path();
    if !wc_path.is_dir() {
      continue;
    }
    let marker = wc_path.join(".workcell");
    if !marker.is_file() {
      continue;
    }
    let marker_json: serde_json::Value = match fs::read_to_string(&marker)
      .ok()
      .and_then(|s| serde_json::from_str(&s).ok())
    {
      Some(v) => v,
      None => continue,
    };

    let id = marker_json
      .get("id")
      .and_then(|v| v.as_str())
      .unwrap_or(wc_path.file_name().and_then(|n| n.to_str()).unwrap_or("workcell"))
      .to_string();
    let issue_id = marker_json
      .get("issue_id")
      .and_then(|v| v.as_str())
      .unwrap_or("?")
      .to_string();
    let created = marker_json.get("created").and_then(|v| v.as_str()).map(|s| s.to_string());
    let speculate_tag = marker_json
      .get("speculate_tag")
      .and_then(|v| v.as_str())
      .map(|s| s.to_string());

    let mut toolchain: Option<String> = None;
    let manifest_path = wc_path.join("manifest.json");
    if manifest_path.is_file() {
      if let Ok(s) = fs::read_to_string(&manifest_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
          toolchain = v.get("toolchain").and_then(|t| t.as_str()).map(|t| t.to_string());
        }
      }
    }

    let mut proof_status: Option<String> = None;
    let proof_path = wc_path.join("proof.json");
    if proof_path.is_file() {
      if let Ok(s) = fs::read_to_string(&proof_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
          proof_status = v.get("status").and_then(|t| t.as_str()).map(|t| t.to_string());
        }
      }
    }

    // Compute progress based on workcell state
    let (progress, progress_stage) = compute_workcell_progress(&wc_path);

    out.push(KernelWorkcell {
      id,
      issue_id,
      created,
      path: wc_path.to_string_lossy().to_string(),
      speculate_tag,
      toolchain,
      proof_status,
      progress,
      progress_stage,
    });
  }

  out.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| a.id.cmp(&b.id)));
  out
}

fn load_events(project_root: &str, limit: usize) -> Vec<KernelEvent> {
  let path = cyntra_events_path(project_root);
  if !path.is_file() {
    return Vec::new();
  }
  let raw = read_jsonl_tail(&path, limit);
  raw
    .into_iter()
    .map(|m| KernelEvent {
      r#type: parse_string(m.get("type")).unwrap_or_else(|| "event".to_string()),
      timestamp: parse_string(m.get("timestamp")),
      issue_id: parse_string(m.get("issue_id").or_else(|| m.get("issueId"))),
      workcell_id: parse_string(m.get("workcell_id").or_else(|| m.get("workcellId"))),
      data: m
        .get("data")
        .cloned()
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new())),
      duration_ms: parse_i64(m.get("duration_ms")),
      tokens_used: parse_i64(m.get("tokens_used")),
      cost_usd: m.get("cost_usd").and_then(|v| v.as_f64()),
    })
    .collect()
}

#[tauri::command]
fn kernel_snapshot(params: KernelSnapshotParams) -> CommandResult<KernelSnapshot> {
  let beads_dir = beads_dir_for_project(&params.project_root);
  let beads_present = beads_dir.is_dir();
  let issues = load_beads_issues(&params.project_root);
  let deps = load_beads_deps(&params.project_root);
  let workcells = load_workcells(&params.project_root);
  let limit_events = params.limit_events.unwrap_or(200);
  let events = load_events(&params.project_root, limit_events);

  Ok(KernelSnapshot {
    beads_present,
    issues,
    deps,
    workcells,
    events,
  })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BeadsInitParams {
  project_root: String,
}

#[tauri::command]
fn beads_init(params: BeadsInitParams) -> CommandResult<()> {
  let dir = beads_dir_for_project(&params.project_root);
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let issues = beads_issues_path(&params.project_root);
  let deps = beads_deps_path(&params.project_root);
  if !issues.exists() {
    fs::write(&issues, "").map_err(|e| e.to_string())?;
  }
  if !deps.exists() {
    fs::write(&deps, "").map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BeadsCreateIssueParams {
  project_root: String,
  title: String,
  #[serde(default)]
  description: Option<String>,
  #[serde(default)]
  tags: Option<Vec<String>>,
  #[serde(default)]
  dk_priority: Option<String>,
  #[serde(default)]
  dk_risk: Option<String>,
  #[serde(default)]
  dk_size: Option<String>,
  #[serde(default)]
  dk_tool_hint: Option<String>,
  #[serde(default)]
  dk_speculate: Option<bool>,
  #[serde(default)]
  dk_estimated_tokens: Option<i64>,
  #[serde(default)]
  dk_attempts: Option<i64>,
  #[serde(default)]
  dk_max_attempts: Option<i64>,
}

#[tauri::command]
fn beads_create_issue(params: BeadsCreateIssueParams) -> CommandResult<BeadsIssue> {
  let issues_path = beads_issues_path(&params.project_root);
  if let Some(parent) = issues_path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }

  let existing = read_jsonl_objects(&issues_path);
  let mut existing_ids: Vec<i64> = Vec::new();
  for m in existing {
    if let Some(id) = parse_i64(m.get("id")) {
      existing_ids.push(id);
    } else if let Some(id_str) = parse_string(m.get("id")) {
      if let Ok(id) = id_str.parse::<i64>() {
        existing_ids.push(id);
      }
    }
  }
  existing_ids.sort();
  let next_id = existing_ids.last().cloned().unwrap_or(0) + 1;
  let now = utc_now_rfc3339();

  let mut obj = serde_json::Map::new();
  obj.insert("id".into(), serde_json::Value::String(next_id.to_string()));
  obj.insert("title".into(), serde_json::Value::String(params.title.clone()));
  obj.insert("status".into(), serde_json::Value::String("open".into()));
  obj.insert("created".into(), serde_json::Value::String(now.clone()));
  obj.insert("updated".into(), serde_json::Value::String(now.clone()));
  if let Some(desc) = &params.description {
    obj.insert("description".into(), serde_json::Value::String(desc.clone()));
  }
  if let Some(tags) = &params.tags {
    obj.insert(
      "tags".into(),
      serde_json::Value::Array(tags.iter().map(|t| serde_json::Value::String(t.clone())).collect()),
    );
  }
  if let Some(v) = &params.dk_priority {
    obj.insert("dk_priority".into(), serde_json::Value::String(v.clone()));
  }
  if let Some(v) = &params.dk_risk {
    obj.insert("dk_risk".into(), serde_json::Value::String(v.clone()));
  }
  if let Some(v) = &params.dk_size {
    obj.insert("dk_size".into(), serde_json::Value::String(v.clone()));
  }
  if let Some(v) = &params.dk_tool_hint {
    obj.insert("dk_tool_hint".into(), serde_json::Value::String(v.clone()));
  }
  if let Some(v) = params.dk_speculate {
    obj.insert("dk_speculate".into(), serde_json::Value::Bool(v));
  }
  if let Some(v) = params.dk_estimated_tokens {
    obj.insert(
      "dk_estimated_tokens".into(),
      serde_json::Value::Number(serde_json::Number::from(v)),
    );
  }
  if let Some(v) = params.dk_attempts {
    obj.insert(
      "dk_attempts".into(),
      serde_json::Value::Number(serde_json::Number::from(v)),
    );
  }
  if let Some(v) = params.dk_max_attempts {
    obj.insert(
      "dk_max_attempts".into(),
      serde_json::Value::Number(serde_json::Number::from(v)),
    );
  }

  let line = serde_json::Value::Object(obj).to_string();
  let mut file = fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&issues_path)
    .map_err(|e| e.to_string())?;
  writeln!(file, "{}", line).map_err(|e| e.to_string())?;

  let issues = load_beads_issues(&params.project_root);
  let created = issues
    .into_iter()
    .find(|i| i.id == next_id.to_string())
    .ok_or_else(|| "created issue not found".to_string())?;
  Ok(created)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BeadsUpdateIssueParams {
  project_root: String,
  issue_id: String,
  #[serde(default)]
  status: Option<String>,
  #[serde(default)]
  title: Option<String>,
  #[serde(default)]
  description: Option<String>,
  #[serde(default)]
  tags: Option<Vec<String>>,
  #[serde(default)]
  dk_priority: Option<String>,
  #[serde(default)]
  dk_risk: Option<String>,
  #[serde(default)]
  dk_size: Option<String>,
  #[serde(default)]
  dk_tool_hint: Option<String>,
  #[serde(default)]
  dk_speculate: Option<bool>,
  #[serde(default)]
  dk_estimated_tokens: Option<i64>,
  #[serde(default)]
  dk_attempts: Option<i64>,
  #[serde(default)]
  dk_max_attempts: Option<i64>,
}

#[tauri::command]
fn beads_update_issue(params: BeadsUpdateIssueParams) -> CommandResult<BeadsIssue> {
  let issues_path = beads_issues_path(&params.project_root);
  let raw_lines = match fs::read_to_string(&issues_path) {
    Ok(s) => s,
    Err(_) => return Err("issues.jsonl not found; init Beads first".into()),
  };

  let mut found = false;
  let mut updated_lines: Vec<String> = Vec::new();
  let now = utc_now_rfc3339();

  for line in raw_lines.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    let mut value: serde_json::Value = match serde_json::from_str(trimmed) {
      Ok(v) => v,
      Err(_) => {
        updated_lines.push(trimmed.to_string());
        continue;
      }
    };

    let id_match = value
      .get("id")
      .and_then(|v| v.as_str())
      .map(|s| s == params.issue_id)
      .unwrap_or(false);

    if !id_match {
      updated_lines.push(value.to_string());
      continue;
    }

    found = true;
    let obj = value.as_object_mut().ok_or_else(|| "invalid issue record".to_string())?;

    if let Some(v) = &params.status {
      obj.insert("status".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = &params.title {
      obj.insert("title".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = &params.description {
      obj.insert("description".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(tags) = &params.tags {
      obj.insert(
        "tags".into(),
        serde_json::Value::Array(tags.iter().map(|t| serde_json::Value::String(t.clone())).collect()),
      );
    }
    if let Some(v) = &params.dk_priority {
      obj.insert("dk_priority".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = &params.dk_risk {
      obj.insert("dk_risk".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = &params.dk_size {
      obj.insert("dk_size".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = &params.dk_tool_hint {
      obj.insert("dk_tool_hint".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = params.dk_speculate {
      obj.insert("dk_speculate".into(), serde_json::Value::Bool(v));
    }
    if let Some(v) = params.dk_estimated_tokens {
      obj.insert(
        "dk_estimated_tokens".into(),
        serde_json::Value::Number(serde_json::Number::from(v)),
      );
    }
    if let Some(v) = params.dk_attempts {
      obj.insert(
        "dk_attempts".into(),
        serde_json::Value::Number(serde_json::Number::from(v)),
      );
    }
    if let Some(v) = params.dk_max_attempts {
      obj.insert(
        "dk_max_attempts".into(),
        serde_json::Value::Number(serde_json::Number::from(v)),
      );
    }

    obj.insert("updated".into(), serde_json::Value::String(now.clone()));

    updated_lines.push(serde_json::Value::Object(obj.clone()).to_string());
  }

  if !found {
    return Err(format!("Issue not found: {}", params.issue_id));
  }

  let tmp_path = issues_path.with_extension("jsonl.tmp");
  fs::write(&tmp_path, updated_lines.join("\n") + "\n").map_err(|e| e.to_string())?;
  fs::rename(&tmp_path, &issues_path).map_err(|e| e.to_string())?;

  let issues = load_beads_issues(&params.project_root);
  let updated = issues
    .into_iter()
    .find(|i| i.id == params.issue_id)
    .ok_or_else(|| "updated issue not found".to_string())?;
  Ok(updated)
}

// ---------------------------------------------
// Job runner (one-shot commands writing into a run dir)
// ---------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ActiveJobInfo {
  job_id: String,
  run_id: String,
  run_dir: String,
  command: String,
  started_ms: u64,
}

struct JobHandle {
  info: ActiveJobInfo,
  killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
}

struct JobState {
  jobs: Mutex<HashMap<Uuid, Arc<JobHandle>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobStartParams {
  project_root: String,
  command: String,
  #[serde(default)]
  label: Option<String>,
  #[serde(default)]
  env: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobInfo {
  job_id: String,
  run_id: String,
  run_dir: String,
}

#[tauri::command]
fn job_start(
  app: AppHandle,
  state: State<'_, Arc<JobState>>,
  params: JobStartParams,
) -> CommandResult<JobInfo> {
  let job_id = Uuid::new_v4();
  let now_ms = epoch_ms_now();
  let slug = params
    .label
    .as_deref()
    .map(sanitize_slug)
    .unwrap_or_else(|| sanitize_slug(&params.command));
  let job_id_str = job_id.to_string();
  let run_id = format!("run_{}_{}_{}", now_ms, slug, &job_id_str[..8]);

  let runs_dir = runs_dir_for_project(&params.project_root);
  fs::create_dir_all(&runs_dir).map_err(|e| e.to_string())?;
  let run_dir = runs_dir.join(&run_id);
  fs::create_dir_all(&run_dir).map_err(|e| e.to_string())?;
  let run_dir_str = run_dir.to_string_lossy().to_string();

  let meta_path = run_dir.join("run_meta.json");
  let log_path = run_dir.join("terminal.log");

  let mut meta = serde_json::Map::new();
  meta.insert("run_id".into(), serde_json::Value::String(run_id.clone()));
  meta.insert(
    "project_root".into(),
    serde_json::Value::String(params.project_root.clone()),
  );
  meta.insert("command".into(), serde_json::Value::String(params.command.clone()));
  meta.insert(
    "label".into(),
    params
      .label
      .as_ref()
      .map(|v| serde_json::Value::String(v.clone()))
      .unwrap_or(serde_json::Value::Null),
  );
  meta.insert(
    "started_ms".into(),
    serde_json::Value::Number(serde_json::Number::from(now_ms)),
  );
  meta.insert(
    "env".into(),
    serde_json::Value::Object(
      params
        .env
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|(k, v)| (k, serde_json::Value::String(v)))
        .collect(),
    ),
  );
  fs::write(&meta_path, serde_json::to_vec_pretty(&serde_json::Value::Object(meta)).unwrap())
    .map_err(|e| e.to_string())?;

  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize {
      rows: 34,
      cols: 120,
      pixel_width: 0,
      pixel_height: 0,
    })
    .map_err(|e| e.to_string())?;

  let mut cmd = CommandBuilder::new("zsh");
  cmd.args(["-lc", &params.command]);
  cmd.cwd(&params.project_root);
  let mut merged_env: HashMap<String, String> = std::env::vars().collect();
  let env_file = PathBuf::from(&params.project_root).join(".cyntra/.env");
  if env_file.is_file() {
    for (k, v) in read_env_file(&env_file) {
      merged_env.insert(k, v);
    }
  }
  if let Ok(Some(text)) = get_global_env_text_internal() {
    for (k, v) in read_env_text(&text) {
      merged_env.insert(k, v);
    }
  }
  if let Some(env) = &params.env {
    for (k, v) in env {
      merged_env.insert(k.clone(), v.clone());
    }
  }
  let merged_path = merged_env.get("PATH").cloned();
  for (k, v) in merged_env {
    cmd.env(k, v);
  }
  cmd.env("CYNTRA_RUN_ID", &run_id);
  cmd.env("CYNTRA_RUN_DIR", run_dir_str.clone());
  cmd.env("CYNTRA_PROJECT_ROOT", &params.project_root);
  let venv_python = PathBuf::from(&params.project_root).join(".cyntra/venv/bin/python");
  if venv_python.is_file() {
    cmd.env("CYNTRA_PYTHON", venv_python.to_string_lossy().to_string());
  }
  if let Ok(bin) = ensure_project_shims(&PathBuf::from(&params.project_root)) {
    let new_path = prepend_path(&bin, merged_path.map(std::ffi::OsString::from));
    cmd.env("PATH", new_path);
  }

  let child = pair
    .slave
    .spawn_command(cmd)
    .map_err(|e| e.to_string())?;
  drop(pair.slave);

  let killer = child.clone_killer();

  let mut reader = pair
    .master
    .try_clone_reader()
    .map_err(|e| e.to_string())?;

  let job_handle = Arc::new(JobHandle {
    info: ActiveJobInfo {
      job_id: job_id.to_string(),
      run_id: run_id.clone(),
      run_dir: run_dir_str.clone(),
      command: params.command.clone(),
      started_ms: now_ms,
    },
    killer: Mutex::new(killer),
  });
  {
    let mut jobs = state
      .jobs
      .lock()
      .map_err(|_| "job state lock poisoned".to_string())?;
    jobs.insert(job_id, job_handle);
  }

  let job_id_str = job_id.to_string();
  let job_id_for_output = job_id_str.clone();
  let job_id_for_exit = job_id_str.clone();
  let run_id_for_output = run_id.clone();
  let app_for_output = app.clone();
  let log_path_for_output = log_path.clone();
  thread::spawn(move || {
    let mut log_file = fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(&log_path_for_output)
      .ok();
    let mut buf = [0u8; 8192];
    loop {
      let read = match reader.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => n,
        Err(_) => break,
      };
      let chunk = String::from_utf8_lossy(&buf[..read]).to_string();
      if let Some(f) = &mut log_file {
        let _ = f.write_all(chunk.as_bytes());
        let _ = f.flush();
      }
      let _ = app_for_output.emit(
        "job_output",
        serde_json::json!({
          "job_id": job_id_for_output,
          "run_id": run_id_for_output,
          "data": chunk
        }),
      );
    }
  });

  let app_for_exit = app.clone();
  let state_for_exit = state.inner().clone();
  let job_uuid_for_exit = job_id;
  let run_id_for_exit = run_id.clone();
  let run_dir_for_exit = run_dir.clone();
  thread::spawn(move || {
    let mut child = child;
    let exit_code = loop {
      match child.try_wait() {
        Ok(Some(s)) => break Some(s.exit_code()),
        Ok(None) => {}
        Err(_) => break None,
      }
      thread::sleep(Duration::from_millis(120));
    };

    let result_path = run_dir_for_exit.join("job_result.json");
    let _ = fs::write(
      &result_path,
      serde_json::to_vec_pretty(&serde_json::json!({
        "job_id": job_id_for_exit,
        "run_id": run_id_for_exit,
        "exit_code": exit_code,
        "ended_ms": epoch_ms_now()
      }))
      .unwrap(),
    );

    let _ = app_for_exit.emit(
      "job_exit",
      serde_json::json!({ "job_id": job_id_str, "run_id": run_id_for_exit, "exit_code": exit_code }),
    );

    if let Ok(mut jobs) = state_for_exit.jobs.lock() {
      jobs.remove(&job_uuid_for_exit);
    }
  });

  Ok(JobInfo {
    job_id: job_id.to_string(),
    run_id,
    run_dir: run_dir_str,
  })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobKillParams {
  job_id: String,
}

#[tauri::command]
fn job_kill(state: State<'_, Arc<JobState>>, params: JobKillParams) -> CommandResult<()> {
  let id = Uuid::parse_str(&params.job_id).map_err(|e| e.to_string())?;
  let job = {
    let jobs = state
      .jobs
      .lock()
      .map_err(|_| "job state lock poisoned".to_string())?;
    jobs.get(&id).cloned()
  };
  let Some(job) = job else {
    return Ok(());
  };
  let mut killer = job
    .killer
    .lock()
    .map_err(|_| "job killer lock poisoned".to_string())?;
  killer.kill().ok();
  Ok(())
}

#[tauri::command]
fn job_list_active(state: State<'_, Arc<JobState>>) -> CommandResult<Vec<ActiveJobInfo>> {
  let jobs = state
    .jobs
    .lock()
    .map_err(|_| "job state lock poisoned".to_string())?;
  Ok(jobs.values().map(|j| j.info.clone()).collect())
}

// ---------------------------------------------
// Membrane Service (Web3 integration layer)
// ---------------------------------------------

use std::process::{Child, Command, Stdio};

struct MembraneState {
  process: Mutex<Option<Child>>,
  port: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MembraneStatus {
  running: bool,
  port: u16,
  #[serde(skip_serializing_if = "Option::is_none")]
  version: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  uptime: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pid: Option<u32>,
}

fn find_membrane_path() -> Option<PathBuf> {
  // Try relative path from the app (development)
  let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .and_then(|p| p.parent())
    .and_then(|p| p.parent())
    .map(|p| p.join("packages/membrane"));

  if let Some(ref path) = dev_path {
    if path.join("package.json").exists() {
      return dev_path;
    }
  }

  // Try from home directory
  let home = homedir();
  let home_path = home.join("Medica/cyntra/packages/membrane");
  if home_path.join("package.json").exists() {
    return Some(home_path);
  }

  None
}

fn homedir() -> PathBuf {
  dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"))
}

fn check_membrane_health(port: u16) -> Option<(String, u64)> {
  // Quick HTTP check to see if membrane is responding

  // Use a blocking HTTP client (simple approach)
  let client = std::net::TcpStream::connect_timeout(
    &format!("127.0.0.1:{}", port).parse().unwrap(),
    Duration::from_millis(500),
  );

  if client.is_err() {
    return None;
  }

  let mut stream = client.unwrap();
  let request = format!(
    "GET / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
    port
  );

  if stream.write_all(request.as_bytes()).is_err() {
    return None;
  }

  let mut response = String::new();
  if stream.read_to_string(&mut response).is_err() {
    return None;
  }

  // Parse JSON from response body
  if let Some(body_start) = response.find("\r\n\r\n") {
    let body = &response[body_start + 4..];
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
      let version = json.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
      let uptime = json.get("uptime").and_then(|v| v.as_u64());
      if let (Some(v), Some(u)) = (version, uptime) {
        return Some((v, u));
      }
    }
  }

  Some(("unknown".to_string(), 0))
}

#[tauri::command]
fn membrane_status(state: State<'_, Arc<MembraneState>>) -> CommandResult<MembraneStatus> {
  let port = state.port;
  let mut process = state.process.lock().map_err(|_| "lock poisoned")?;

  // Check if our spawned process is still running
  let pid = if let Some(ref mut child) = *process {
    match child.try_wait() {
      Ok(Some(_)) => {
        // Process exited
        *process = None;
        None
      }
      Ok(None) => Some(child.id()),
      Err(_) => {
        *process = None;
        None
      }
    }
  } else {
    None
  };

  // Check health regardless of whether we spawned it
  if let Some((version, uptime)) = check_membrane_health(port) {
    return Ok(MembraneStatus {
      running: true,
      port,
      version: Some(version),
      uptime: Some(uptime),
      pid,
    });
  }

  Ok(MembraneStatus {
    running: false,
    port,
    version: None,
    uptime: None,
    pid: None,
  })
}

#[tauri::command]
fn membrane_start(state: State<'_, Arc<MembraneState>>) -> CommandResult<MembraneStatus> {
  let port = state.port;
  let mut process = state.process.lock().map_err(|_| "lock poisoned")?;

  // Check if already running
  if let Some((version, uptime)) = check_membrane_health(port) {
    // Membrane is already running (possibly externally)
    return Ok(MembraneStatus {
      running: true,
      port,
      version: Some(version),
      uptime: Some(uptime),
      pid: None, // We don't track external processes
    });
  }

  // Find membrane package
  let membrane_path = find_membrane_path()
    .ok_or_else(|| "Membrane package not found".to_string())?;

  // Start membrane using bun
  let child = Command::new("bun")
    .arg("run")
    .arg("start")
    .current_dir(&membrane_path)
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("Failed to start membrane: {}", e))?;

  let pid = child.id();
  *process = Some(child);

  // Wait for it to be ready (up to 5 seconds)
  for _ in 0..50 {
    thread::sleep(Duration::from_millis(100));
    if let Some((version, uptime)) = check_membrane_health(port) {
      return Ok(MembraneStatus {
        running: true,
        port,
        version: Some(version),
        uptime: Some(uptime),
        pid: Some(pid),
      });
    }
  }

  Err("Membrane started but health check failed".to_string())
}

#[tauri::command]
fn membrane_stop(state: State<'_, Arc<MembraneState>>) -> CommandResult<()> {
  let mut process = state.process.lock().map_err(|_| "lock poisoned")?;

  if let Some(ref mut child) = *process {
    let _ = child.kill();
    let _ = child.wait();
  }
  *process = None;

  Ok(())
}

#[tauri::command]
fn membrane_ensure(state: State<'_, Arc<MembraneState>>) -> CommandResult<MembraneStatus> {
  let port = state.port;

  // Check if already running
  if let Some((version, uptime)) = check_membrane_health(port) {
    return Ok(MembraneStatus {
      running: true,
      port,
      version: Some(version),
      uptime: Some(uptime),
      pid: None,
    });
  }

  // Not running, start it
  membrane_start(state)
}

// ---------------------------------------------
// Event file watcher (real-time kernel events)
// ---------------------------------------------

struct EventWatcherHandle {
  watcher: RecommendedWatcher,
  stop_tx: std::sync::mpsc::Sender<()>,
}

struct EventWatcherState {
  watchers: Mutex<HashMap<String, EventWatcherHandle>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartEventWatcherParams {
  project_root: String,
  #[serde(default)]
  last_offset: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KernelEventsPayload {
  project_root: String,
  events: Vec<KernelEvent>,
  offset: u64,
}

fn read_events_from_offset(path: &Path, offset: u64) -> (Vec<KernelEvent>, u64) {
  let file = match fs::File::open(path) {
    Ok(f) => f,
    Err(_) => return (Vec::new(), offset),
  };

  let file_len = match file.metadata() {
    Ok(m) => m.len(),
    Err(_) => return (Vec::new(), offset),
  };

  // If file is smaller than offset, it was likely truncated - reset
  let start_offset = if offset > file_len { 0 } else { offset };

  let mut reader = std::io::BufReader::new(file);
  if start_offset > 0 {
    use std::io::Seek;
    if reader.seek(std::io::SeekFrom::Start(start_offset)).is_err() {
      return (Vec::new(), offset);
    }
  }

  use std::io::BufRead;
  let mut events = Vec::new();
  let mut current_pos = start_offset;
  let mut buf: Vec<u8> = Vec::new();

  loop {
    buf.clear();
    let bytes_read = match reader.read_until(b'\n', &mut buf) {
      Ok(0) => break,
      Ok(n) => n,
      Err(_) => break,
    };
    current_pos += bytes_read as u64;

    let line = String::from_utf8_lossy(&buf);
    let line = line.trim();
    if line.is_empty() {
      continue;
    }

    let value: serde_json::Value = match serde_json::from_str(line) {
      Ok(v) => v,
      Err(_) => continue,
    };

    if let serde_json::Value::Object(m) = value {
      events.push(KernelEvent {
        r#type: parse_string(m.get("type")).unwrap_or_else(|| "event".to_string()),
        timestamp: parse_string(m.get("timestamp")),
        issue_id: parse_string(m.get("issue_id").or_else(|| m.get("issueId"))),
        workcell_id: parse_string(m.get("workcell_id").or_else(|| m.get("workcellId"))),
        data: m
          .get("data")
          .cloned()
          .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new())),
        duration_ms: parse_i64(m.get("duration_ms")),
        tokens_used: parse_i64(m.get("tokens_used")),
        cost_usd: m.get("cost_usd").and_then(|v| v.as_f64()),
      });
    }
  }

  (events, current_pos)
}

#[tauri::command]
fn start_event_watcher(
  app: AppHandle,
  state: State<'_, Arc<EventWatcherState>>,
  params: StartEventWatcherParams,
) -> CommandResult<()> {
  let project_root = params.project_root.clone();
  let events_path = cyntra_events_path(&project_root);

  // Ensure logs directory exists
  if let Some(parent) = events_path.parent() {
    let _ = fs::create_dir_all(parent);
  }

  let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
  let (event_tx, event_rx) = std::sync::mpsc::channel::<notify::Result<Event>>();

  let watcher = RecommendedWatcher::new(
    move |res| {
      let _ = event_tx.send(res);
    },
    Config::default().with_poll_interval(Duration::from_millis(100)),
  )
  .map_err(|e| format!("failed to create watcher: {}", e))?;

  {
    let mut watchers = state.watchers.lock().map_err(|_| "watcher state lock poisoned")?;
    if watchers.contains_key(&project_root) {
      return Ok(()); // Already watching
    }

    watchers.insert(
      project_root.clone(),
      EventWatcherHandle {
        watcher,
        stop_tx,
      },
    );

    // Watch the logs directory (parent of events.jsonl)
    if let Some(logs_dir) = events_path.parent() {
      if let Some(h) = watchers.get_mut(&project_root) {
        let _ = h.watcher.watch(logs_dir, RecursiveMode::NonRecursive);
      }
    }
  }

  // Spawn thread to handle events
  let app_clone = app.clone();
  let project_root_clone = project_root.clone();
  let events_path_clone = events_path.clone();
  let requested_offset = params.last_offset.unwrap_or(0);

  thread::spawn(move || {
    const DEFAULT_TAIL_BYTES: u64 = 256 * 1024;

    let mut current_offset = if requested_offset == 0 && events_path_clone.is_file() {
      events_path_clone
        .metadata()
        .map(|m| m.len().saturating_sub(DEFAULT_TAIL_BYTES))
        .unwrap_or(0)
    } else {
      requested_offset
    };

    // Always emit an initial payload so the UI can resume from the returned offset.
    if events_path_clone.is_file() {
      let (events, new_offset) = read_events_from_offset(&events_path_clone, current_offset);
      current_offset = new_offset;
      let _ = app_clone.emit(
        "kernel_events",
        KernelEventsPayload {
          project_root: project_root_clone.clone(),
          events,
          offset: current_offset,
        },
      );
    }

    loop {
      // Check for stop signal
      if stop_rx.try_recv().is_ok() {
        break;
      }

      // Wait for file change events with timeout
      match event_rx.recv_timeout(Duration::from_millis(500)) {
        Ok(Ok(event)) => {
          // Check if this event is for our events.jsonl file
          let is_our_file = event.paths.iter().any(|p| {
            p.file_name()
              .map(|n| n == "events.jsonl")
              .unwrap_or(false)
          });

          if is_our_file && events_path_clone.is_file() {
            // Debounce: wait a bit for writes to complete
            thread::sleep(Duration::from_millis(50));

            let (events, new_offset) = read_events_from_offset(&events_path_clone, current_offset);
            current_offset = new_offset;
            if !events.is_empty() {
              let _ = app_clone.emit(
                "kernel_events",
                KernelEventsPayload {
                  project_root: project_root_clone.clone(),
                  events,
                  offset: current_offset,
                },
              );
            }
          }
        }
        Ok(Err(_)) => {
          // Watcher error, continue
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
          // No event, check stop signal and continue
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
          // Channel closed, exit
          break;
        }
      }
    }
  });

  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopEventWatcherParams {
  project_root: String,
}

#[tauri::command]
fn stop_event_watcher(
  state: State<'_, Arc<EventWatcherState>>,
  params: StopEventWatcherParams,
) -> CommandResult<()> {
  let mut watchers = state.watchers.lock().map_err(|_| "watcher state lock poisoned")?;
  if let Some(handle) = watchers.remove(&params.project_root) {
    // Send stop signal
    let _ = handle.stop_tx.send(());
    // Watcher will be dropped, stopping the watch
  }
  Ok(())
}

// ---------------------------------------------
// PTY sessions (multi-terminal)
// ---------------------------------------------

#[derive(Serialize, Clone)]
struct PtySessionInfo {
  id: String,
  cwd: Option<String>,
  command: Option<String>,
}

struct PtySession {
  info: PtySessionInfo,
  master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
  writer: Mutex<Box<dyn Write + Send>>,
  child: Mutex<Box<dyn portable_pty::Child + Send>>,
}

struct PtyState {
  sessions: Mutex<HashMap<Uuid, Arc<PtySession>>>,
}

#[derive(Deserialize)]
struct PtyCreateParams {
  cwd: Option<String>,
  cols: Option<u16>,
  rows: Option<u16>,
}

#[tauri::command]
fn pty_create(
  app: AppHandle,
  state: State<'_, Arc<PtyState>>,
  params: PtyCreateParams,
) -> CommandResult<String> {
  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize {
      rows: params.rows.unwrap_or(34),
      cols: params.cols.unwrap_or(120),
      pixel_width: 0,
      pixel_height: 0,
    })
    .context("open pty")
    .map_err(|e| e.to_string())?;

  let mut cmd = CommandBuilder::new("zsh");
  cmd.arg("-l");
  if let Some(cwd) = &params.cwd {
    let root = PathBuf::from(cwd);
    cmd.cwd(cwd);
    cmd.env("CYNTRA_PROJECT_ROOT", cwd);
    let venv_python = root.join(".cyntra/venv/bin/python");
    if venv_python.is_file() {
      cmd.env("CYNTRA_PYTHON", venv_python.to_string_lossy().to_string());
    }
    if let Ok(bin) = ensure_project_shims(&root) {
      let new_path = prepend_path(&bin, std::env::var_os("PATH"));
      cmd.env("PATH", new_path);
    }
  }

  let child = pair
    .slave
    .spawn_command(cmd)
    .context("spawn shell in pty")
    .map_err(|e| e.to_string())?;
  drop(pair.slave);

  let master = pair.master;
  let mut reader = master
    .try_clone_reader()
    .context("clone pty reader")
    .map_err(|e| e.to_string())?;
  let writer = master
    .take_writer()
    .context("take pty writer")
    .map_err(|e| e.to_string())?;

  let id = Uuid::new_v4();
  let info = PtySessionInfo {
    id: id.to_string(),
    cwd: params.cwd.clone(),
    command: Some("zsh".into()),
  };
  let session_id = info.id.clone();

  let session = Arc::new(PtySession {
    info: info.clone(),
    master: Mutex::new(master),
    writer: Mutex::new(writer),
    child: Mutex::new(child),
  });

  {
    let mut sessions = state
      .sessions
      .lock()
      .map_err(|_| "pty sessions lock poisoned".to_string())?;
    sessions.insert(id, session.clone());
  }

  let app_for_output = app.clone();
  let session_id_for_output = session_id.clone();
  thread::spawn(move || {
    let mut buf = [0u8; 8192];
    loop {
      let read = match reader.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => n,
        Err(_) => break,
      };
      let chunk = String::from_utf8_lossy(&buf[..read]).to_string();
      let _ = app_for_output.emit(
        "pty_output",
        serde_json::json!({ "session_id": session_id_for_output, "data": chunk }),
      );
    }
  });

  let state_for_exit = state.inner().clone();
  let app_for_exit = app.clone();
  thread::spawn(move || {
    let exit_code = loop {
      let status = {
        let mut child = match session.child.lock() {
          Ok(c) => c,
          Err(_) => break None,
        };
        match child.try_wait() {
          Ok(Some(s)) => break Some(s.exit_code()),
          Ok(None) => None,
          Err(_) => break None,
        }
      };
      if status.is_some() {
        break status;
      }
      thread::sleep(Duration::from_millis(120));
    };

    {
      if let Ok(mut sessions) = state_for_exit.sessions.lock() {
        sessions.remove(&id);
      }
    }

    let _ = app_for_exit.emit(
      "pty_exit",
      serde_json::json!({ "session_id": session_id, "exit_code": exit_code }),
    );
  });

  Ok(id.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PtyWriteParams {
  session_id: String,
  data: String,
}

#[tauri::command]
fn pty_write(state: State<'_, Arc<PtyState>>, params: PtyWriteParams) -> CommandResult<()> {
  let id = Uuid::parse_str(&params.session_id).map_err(|e| e.to_string())?;
  let session = {
    let sessions = state
      .sessions
      .lock()
      .map_err(|_| "pty sessions lock poisoned".to_string())?;
    sessions.get(&id).cloned()
  };
  let Some(session) = session else {
    return Err("session not found".to_string());
  };
  let mut writer = session
    .writer
    .lock()
    .map_err(|_| "pty writer lock poisoned".to_string())?;
  writer
    .write_all(params.data.as_bytes())
    .context("write to pty")
    .map_err(|e| e.to_string())?;
  writer.flush().ok();
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PtyResizeParams {
  session_id: String,
  cols: u16,
  rows: u16,
}

#[tauri::command]
fn pty_resize(state: State<'_, Arc<PtyState>>, params: PtyResizeParams) -> CommandResult<()> {
  let id = Uuid::parse_str(&params.session_id).map_err(|e| e.to_string())?;
  let session = {
    let sessions = state
      .sessions
      .lock()
      .map_err(|_| "pty sessions lock poisoned".to_string())?;
    sessions.get(&id).cloned()
  };
  let Some(session) = session else {
    return Ok(());
  };
  let master = session
    .master
    .lock()
    .map_err(|_| "pty master lock poisoned".to_string())?;
  master
    .resize(PtySize {
      rows: params.rows,
      cols: params.cols,
      pixel_width: 0,
      pixel_height: 0,
    })
    .context("resize pty")
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PtyKillParams {
  session_id: String,
}

#[tauri::command]
fn pty_kill(state: State<'_, Arc<PtyState>>, params: PtyKillParams) -> CommandResult<()> {
  let id = Uuid::parse_str(&params.session_id).map_err(|e| e.to_string())?;
  let session = {
    let sessions = state
      .sessions
      .lock()
      .map_err(|_| "pty sessions lock poisoned".to_string())?;
    sessions.get(&id).cloned()
  };
  let Some(session) = session else {
    return Ok(());
  };
  let mut child = session
    .child
    .lock()
    .map_err(|_| "pty child lock poisoned".to_string())?;
  child.kill().ok();
  Ok(())
}

#[tauri::command]
fn pty_list(state: State<'_, Arc<PtyState>>) -> CommandResult<Vec<PtySessionInfo>> {
  let sessions = state
    .sessions
    .lock()
    .map_err(|_| "pty sessions lock poisoned".to_string())?;
  Ok(sessions.values().map(|s| s.info.clone()).collect())
}

// ---------------------------------------------
// Telemetry commands
// ---------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkcellTelemetryParams {
  project_root: String,
  workcell_id: String,
  offset: Option<usize>,
  limit: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TelemetryEvent {
  event_type: String,
  timestamp: String,
  data: serde_json::Value,
}

#[tauri::command]
fn workcell_get_telemetry(
  params: WorkcellTelemetryParams,
) -> CommandResult<Vec<TelemetryEvent>> {
  let workcells_dir = workcells_dir_for_project(&params.project_root);
  let workcell_path = workcells_dir.join(&params.workcell_id);
  let telemetry_path = workcell_path.join("telemetry.jsonl");

  if !telemetry_path.exists() {
    return Ok(Vec::new());
  }

  let content = fs::read_to_string(&telemetry_path).map_err(|e| e.to_string())?;
  let lines: Vec<&str> = content.lines().collect();

  let offset = params.offset.unwrap_or(0);
  let limit = params.limit.unwrap_or(usize::MAX);

  let mut events = Vec::new();
  for (i, line) in lines.iter().enumerate() {
    if i < offset {
      continue;
    }
    if events.len() >= limit {
      break;
    }

    if line.trim().is_empty() {
      continue;
    }

    match serde_json::from_str::<serde_json::Value>(line) {
      Ok(mut obj) => {
        if let Some(obj_map) = obj.as_object_mut() {
          let event_type = obj_map
            .remove("type")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "unknown".to_string());
          let timestamp = obj_map
            .remove("timestamp")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "".to_string());

          events.push(TelemetryEvent {
            event_type,
            timestamp,
            data: serde_json::Value::Object(obj_map.clone()),
          });
        }
      }
      Err(_) => continue,
    }
  }

  Ok(events)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkcellInfo {
  id: String,
  issue_id: String,
  toolchain: Option<String>,
  created: Option<String>,
  speculate_tag: Option<String>,
  has_telemetry: bool,
  has_proof: bool,
  has_logs: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkcellInfoParams {
  project_root: String,
  workcell_id: String,
}

#[tauri::command]
fn workcell_get_info(params: WorkcellInfoParams) -> CommandResult<WorkcellInfo> {
  let workcells_dir = workcells_dir_for_project(&params.project_root);
  let workcell_path = workcells_dir.join(&params.workcell_id);

  if !workcell_path.is_dir() {
    return Err("Workcell not found".to_string());
  }

  let marker_path = workcell_path.join(".workcell");
  let marker_json: serde_json::Value = fs::read_to_string(&marker_path)
    .ok()
    .and_then(|s| serde_json::from_str(&s).ok())
    .unwrap_or(serde_json::Value::Null);

  let issue_id = marker_json
    .get("issue_id")
    .and_then(|v| v.as_str())
    .unwrap_or("?")
    .to_string();
  let created = marker_json
    .get("created")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
  let speculate_tag = marker_json
    .get("speculate_tag")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());

  let mut toolchain: Option<String> = None;
  let manifest_path = workcell_path.join("manifest.json");
  if manifest_path.is_file() {
    if let Ok(s) = fs::read_to_string(&manifest_path) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
        toolchain = v
          .get("toolchain")
          .and_then(|t| t.as_str())
          .map(|t| t.to_string());
      }
    }
  }

  let has_telemetry = workcell_path.join("telemetry.jsonl").exists();
  let has_proof = workcell_path.join("proof.json").exists();
  let has_logs = workcell_path.join("logs").is_dir();

  Ok(WorkcellInfo {
    id: params.workcell_id,
    issue_id,
    toolchain,
    created,
    speculate_tag,
    has_telemetry,
    has_proof,
    has_logs,
  })
}

// ---------------------------------------------
// Immersa integration
// ---------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImmersaAsset {
  name: String,
  path: String,
  url: String,
  size: u64,
}

#[tauri::command]
fn list_immersa_assets(project_root: String) -> CommandResult<Vec<ImmersaAsset>> {
  let root = PathBuf::from(&project_root);
  let mut assets = Vec::new();

  // Scan fab/assets/**/*.glb
  let outora = root.join("fab/assets");
  if outora.is_dir() {
    for entry in WalkDir::new(&outora).follow_links(true).into_iter().filter_map(|e| e.ok()) {
      let path = entry.path();
      if path.extension().and_then(|s| s.to_str()) == Some("glb") {
        let rel_path = path.strip_prefix(&root).unwrap_or(path).to_string_lossy().to_string();
        assets.push(ImmersaAsset {
          name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
          path: rel_path.clone(),
          url: format!("/artifacts/{}", rel_path),
          size: path.metadata().map(|m| m.len()).unwrap_or(0),
        });
      }
    }
  }

  // Scan .cyntra/runs/*/artifacts/**/*.glb
  let runs = root.join(".cyntra/runs");
  if runs.is_dir() {
    for entry in WalkDir::new(&runs).follow_links(true).into_iter().filter_map(|e| e.ok()) {
      let path = entry.path();
      if path.extension().and_then(|s| s.to_str()) == Some("glb") {
        let rel_path = path.strip_prefix(&root).unwrap_or(path).to_string_lossy().to_string();
        assets.push(ImmersaAsset {
          name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
          path: rel_path.clone(),
          url: format!("/artifacts/{}", rel_path),
          size: path.metadata().map(|m| m.len()).unwrap_or(0),
        });
      }
    }
  }

  Ok(assets)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveImmersaPresentationParams {
  project_root: String,
  id: String,
  data: String,
}

#[tauri::command]
fn save_immersa_presentation(params: SaveImmersaPresentationParams) -> CommandResult<()> {
  let pres_dir = PathBuf::from(&params.project_root).join(".cyntra/immersa/presentations");
  fs::create_dir_all(&pres_dir).map_err(|e| e.to_string())?;
  let file_path = pres_dir.join(format!("{}.json", params.id));
  fs::write(&file_path, &params.data).map_err(|e| e.to_string())?;
  Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoadImmersaPresentationParams {
  project_root: String,
  id: String,
}

#[tauri::command]
fn load_immersa_presentation(params: LoadImmersaPresentationParams) -> CommandResult<String> {
  let file_path = PathBuf::from(&params.project_root)
    .join(format!(".cyntra/immersa/presentations/{}.json", params.id));
  fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_immersa_presentations(project_root: String) -> CommandResult<Vec<String>> {
  let pres_dir = PathBuf::from(&project_root).join(".cyntra/immersa/presentations");
  if !pres_dir.exists() {
    return Ok(Vec::new());
  }
  let mut ids = Vec::new();
  for entry in fs::read_dir(&pres_dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    if let Some(name) = entry.file_name().to_str() {
      if name.ends_with(".json") {
        ids.push(name.trim_end_matches(".json").to_string());
      }
    }
  }
  Ok(ids)
}

#[tauri::command]
fn delete_immersa_presentation(params: LoadImmersaPresentationParams) -> CommandResult<()> {
  let file_path = PathBuf::from(&params.project_root)
    .join(format!(".cyntra/immersa/presentations/{}.json", params.id));
  fs::remove_file(&file_path).map_err(|e| e.to_string())
}

// ---------------------------------------------
// Gameplay Definition System
// ---------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkerIssue {
  entity_id: String,
  expected_marker: String,
  entity_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationMessage {
  code: String,
  message: String,
  entity_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationReport {
  valid: bool,
  matched_npcs: Vec<String>,
  matched_items: Vec<String>,
  matched_triggers: Vec<String>,
  matched_interactions: Vec<String>,
  missing_markers: Vec<MarkerIssue>,
  orphaned_markers: Vec<String>,
  errors: Vec<ValidationMessage>,
  warnings: Vec<ValidationMessage>,
}

fn find_gameplay_yaml(world_path: &Path) -> Option<PathBuf> {
  // Try direct file
  if world_path.is_file() && world_path.file_name().map(|n| n == "gameplay.yaml").unwrap_or(false) {
    return Some(world_path.to_path_buf());
  }
  // Try in directory
  let yaml_path = world_path.join("gameplay.yaml");
  if yaml_path.is_file() {
    return Some(yaml_path);
  }
  // Try fab/worlds/<world_id>/gameplay.yaml pattern
  if world_path.is_dir() {
    for entry in fs::read_dir(world_path).ok()? {
      let entry = entry.ok()?;
      if entry.file_name() == "gameplay.yaml" {
        return Some(entry.path());
      }
    }
  }
  None
}

fn find_glb_in_world(world_path: &Path) -> Option<PathBuf> {
  if world_path.is_file() {
    return None;
  }
  // Look for exported/*.glb or *.glb in world directory
  let exported = world_path.join("exported");
  if exported.is_dir() {
    if let Ok(entries) = fs::read_dir(&exported) {
      for entry in entries.flatten() {
        if entry.path().extension().and_then(|s| s.to_str()) == Some("glb") {
          return Some(entry.path());
        }
      }
    }
  }
  // Fallback: look for any .glb in root
  if let Ok(entries) = fs::read_dir(world_path) {
    for entry in entries.flatten() {
      if entry.path().extension().and_then(|s| s.to_str()) == Some("glb") {
        return Some(entry.path());
      }
    }
  }
  None
}

fn extract_markers_from_glb(glb_path: &Path) -> Result<Vec<String>, String> {
  // Read GLB and extract node names that match marker patterns
  // This is a simplified implementation - in production would use gltf crate
  let content = fs::read(glb_path).map_err(|e| e.to_string())?;
  let mut markers = Vec::new();

  // Search for marker patterns in JSON chunk (simplified approach)
  // Real implementation would parse GLTF properly
  let content_str = String::from_utf8_lossy(&content);
  let marker_patterns = [
    "NPC_SPAWN_", "ITEM_SPAWN_", "TRIGGER_", "INTERACT_",
    "AUDIO_ZONE_", "PATH_", "PLAYER_SPAWN",
  ];

  for pattern in marker_patterns {
    let mut start = 0;
    while let Some(pos) = content_str[start..].find(pattern) {
      let abs_pos = start + pos;
      // Extract the full marker name (until non-alphanumeric)
      let end = content_str[abs_pos..]
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .map(|e| abs_pos + e)
        .unwrap_or(content_str.len());
      let marker = &content_str[abs_pos..end];
      if !markers.contains(&marker.to_string()) {
        markers.push(marker.to_string());
      }
      start = end;
    }
  }

  Ok(markers)
}

#[tauri::command]
fn load_gameplay(params: WorldPathParams) -> CommandResult<serde_json::Value> {
  let path = PathBuf::from(&params.world_path);
  let yaml_path = find_gameplay_yaml(&path)
    .ok_or_else(|| format!("gameplay.yaml not found in {}", params.world_path))?;

  let content = fs::read_to_string(&yaml_path).map_err(|e| e.to_string())?;
  let config: serde_json::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;
  Ok(config)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldPathParams {
  world_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveGameplayParams {
  world_path: String,
  config: serde_json::Value,
}

#[tauri::command]
fn save_gameplay(params: SaveGameplayParams) -> CommandResult<()> {
  let path = PathBuf::from(&params.world_path);
  let yaml_path = if path.is_file() {
    path
  } else {
    path.join("gameplay.yaml")
  };

  let yaml_str = serde_yaml::to_string(&params.config).map_err(|e| e.to_string())?;
  fs::write(&yaml_path, yaml_str).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn validate_gameplay(params: WorldPathParams) -> CommandResult<ValidationReport> {
  let path = PathBuf::from(&params.world_path);

  // Load gameplay config
  let yaml_path = find_gameplay_yaml(&path)
    .ok_or_else(|| format!("gameplay.yaml not found in {}", params.world_path))?;
  let content = fs::read_to_string(&yaml_path).map_err(|e| e.to_string())?;
  let config: serde_json::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;

  // Get markers from GLB
  let glb_path = find_glb_in_world(&path);
  let markers = glb_path
    .as_ref()
    .map(|p| extract_markers_from_glb(p).unwrap_or_default())
    .unwrap_or_default();

  let mut report = ValidationReport {
    valid: true,
    matched_npcs: Vec::new(),
    matched_items: Vec::new(),
    matched_triggers: Vec::new(),
    matched_interactions: Vec::new(),
    missing_markers: Vec::new(),
    orphaned_markers: Vec::new(),
    errors: Vec::new(),
    warnings: Vec::new(),
  };

  // Validate entities
  if let Some(entities) = config.get("entities").and_then(|e| e.as_object()) {
    for (id, entity) in entities {
      let entity_type = entity.get("type").and_then(|t| t.as_str()).unwrap_or("");
      let expected_marker = match entity_type {
        "npc" => format!("NPC_SPAWN_{}", id.to_uppercase()),
        "key_item" | "consumable" | "equipment" | "document" => {
          format!("ITEM_SPAWN_{}", id.to_uppercase())
        }
        _ => continue,
      };

      if markers.iter().any(|m| m == &expected_marker) {
        match entity_type {
          "npc" => report.matched_npcs.push(id.clone()),
          _ => report.matched_items.push(id.clone()),
        }
      } else {
        report.missing_markers.push(MarkerIssue {
          entity_id: id.clone(),
          expected_marker,
          entity_type: entity_type.to_string(),
        });
        report.valid = false;
      }
    }
  }

  // Validate triggers
  if let Some(triggers) = config.get("triggers").and_then(|t| t.as_object()) {
    for (id, trigger) in triggers {
      if let Some(marker) = trigger.get("marker").and_then(|m| m.as_str()) {
        if markers.iter().any(|m| m == marker) {
          report.matched_triggers.push(id.clone());
        } else {
          report.missing_markers.push(MarkerIssue {
            entity_id: id.clone(),
            expected_marker: marker.to_string(),
            entity_type: "trigger".to_string(),
          });
        }
      }
    }
  }

  // Validate interactions
  if let Some(interactions) = config.get("interactions").and_then(|i| i.as_object()) {
    for (id, interaction) in interactions {
      if let Some(marker) = interaction.get("marker").and_then(|m| m.as_str()) {
        if markers.iter().any(|m| m == marker) {
          report.matched_interactions.push(id.clone());
        } else {
          report.missing_markers.push(MarkerIssue {
            entity_id: id.clone(),
            expected_marker: marker.to_string(),
            entity_type: "interaction".to_string(),
          });
        }
      }
    }
  }

  // Find orphaned markers (markers in GLB with no definition)
  for marker in &markers {
    let is_matched = report.matched_npcs.iter().any(|id| marker.contains(&id.to_uppercase()))
      || report.matched_items.iter().any(|id| marker.contains(&id.to_uppercase()))
      || report.matched_triggers.iter().any(|id| marker.contains(&id.to_uppercase()))
      || report.matched_interactions.iter().any(|id| marker.contains(&id.to_uppercase()))
      || marker == "PLAYER_SPAWN"
      || marker.starts_with("PATH_");

    if !is_matched && marker.starts_with("NPC_SPAWN_")
      || marker.starts_with("ITEM_SPAWN_")
      || marker.starts_with("TRIGGER_")
      || marker.starts_with("INTERACT_")
    {
      report.orphaned_markers.push(marker.clone());
      report.warnings.push(ValidationMessage {
        code: "ORPHANED_MARKER".to_string(),
        message: format!("Marker '{}' has no corresponding entity definition", marker),
        entity_id: None,
      });
    }
  }

  Ok(report)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlbPathParams {
  glb_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportGameplayJsonParams {
  world_path: String,
  output_path: String,
}

#[tauri::command]
fn get_marker_names(params: GlbPathParams) -> CommandResult<Vec<String>> {
  let path = PathBuf::from(&params.glb_path);
  if !path.is_file() {
    return Err(format!("GLB file not found: {}", params.glb_path));
  }
  extract_markers_from_glb(&path)
}

#[tauri::command]
fn gameplay_exists(params: WorldPathParams) -> CommandResult<bool> {
  let path = PathBuf::from(&params.world_path);
  Ok(find_gameplay_yaml(&path).is_some())
}

#[tauri::command]
fn export_gameplay_json(params: ExportGameplayJsonParams) -> CommandResult<()> {
  let path = PathBuf::from(&params.world_path);
  let yaml_path = find_gameplay_yaml(&path)
    .ok_or_else(|| format!("gameplay.yaml not found in {}", params.world_path))?;

  let content = fs::read_to_string(&yaml_path).map_err(|e| e.to_string())?;
  let config: serde_json::Value = serde_yaml::from_str(&content).map_err(|e| e.to_string())?;

  let json_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
  fs::write(&params.output_path, json_str).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn get_patrol_paths(params: GlbPathParams) -> CommandResult<Vec<String>> {
  let path = PathBuf::from(&params.glb_path);
  if !path.is_file() {
    return Err(format!("GLB file not found: {}", params.glb_path));
  }
  let markers = extract_markers_from_glb(&path)?;
  let paths: Vec<String> = markers
    .into_iter()
    .filter(|m| m.starts_with("PATH_"))
    .map(|m| m.strip_prefix("PATH_").unwrap_or(&m).to_lowercase())
    .collect();
  Ok(paths)
}

fn main() {
  let roots = Arc::new(RwLock::new(WebRoots::default()));
  let server = Arc::new(start_local_server(roots.clone()).expect("start local server"));

  let pty_state = Arc::new(PtyState {
    sessions: Mutex::new(HashMap::new()),
  });

  let job_state = Arc::new(JobState {
    jobs: Mutex::new(HashMap::new()),
  });

  let event_watcher_state = Arc::new(EventWatcherState {
    watchers: Mutex::new(HashMap::new()),
  });

  let viewport_manager = ViewportManager::new();

  let membrane_state = Arc::new(MembraneState {
    process: Mutex::new(None),
    port: 7331,
  });

  tauri::Builder::default()
    .manage(server)
    .manage(pty_state)
    .manage(job_state)
    .manage(event_watcher_state)
    .manage(viewport_manager)
    .manage(membrane_state)
    .invoke_handler(tauri::generate_handler![
      get_server_info,
      get_global_env,
      set_global_env,
      clear_global_env,
      set_server_roots,
      detect_project,
      runs_list,
      run_artifacts,
      run_artifacts_tree,
      run_details,
      job_start,
      job_kill,
      job_list_active,
      kernel_snapshot,
      start_event_watcher,
      stop_event_watcher,
      beads_init,
      beads_create_issue,
      beads_update_issue,
      pty_create,
      pty_write,
      pty_resize,
      pty_kill,
      pty_list,
      workcell_get_telemetry,
      workcell_get_info,
      list_immersa_assets,
      save_immersa_presentation,
      load_immersa_presentation,
      list_immersa_presentations,
      delete_immersa_presentation,
      // Gameplay commands
      load_gameplay,
      save_gameplay,
      validate_gameplay,
      get_marker_names,
      gameplay_exists,
      export_gameplay_json,
      get_patrol_paths,
      // Viewport PoC
      viewport_open,
      viewport_close,
      viewport_command,
      // Window PoC (Spike A)
      poc_open_viewport_poc_window,
      poc_close_viewport_poc_window,
      poc_ping_viewport_poc_window,
      poc_pong,
      // Membrane (Web3 integration)
      membrane_status,
      membrane_start,
      membrane_stop,
      membrane_ensure,
    ])
    .run(tauri::generate_context!())
    .expect("error while running Glia Fab Desktop");
}
