# ADR: What “Native Viewport Window” Means (Linux) — and Required Guarantees

**Status:** Proposed (target: accept after spikes)
**Date:** 2025-12-25
**Scope:** `apps/desktop` viewport window + render loop

## Context

We want a dual-window desktop app:

- **Window A**: Web UI (WebView) control plane
- **Window B**: High-performance 3D viewport (wgpu) data plane

The design docs use overloaded terms (“native window”, “winit window”, “not GTK”) and cite Linux flickering risks. We need a precise definition for Linux and a concrete go/no-go set of guarantees before implementation.

## Decision (Primary Path)

**Pick A: In-process viewport window created by Tauri (no independent `winit::EventLoop`).**

- Window B is a **Tauri-managed window-only (non-webview) window**.
- wgpu renders into Window B by creating a `wgpu::Surface` from **Window B’s `raw-window-handle` (+ `raw-display-handle`)**.
- The viewport’s event handling (resize, DPI, close) is driven by the same application runtime/event loop that owns the window.

### Tauri v2 reality check (important)

In Tauri v2, creating a window that does **not** host a webview uses `tauri::window::WindowBuilder`, which is currently behind the `tauri` crate’s **`unstable`** feature. This means:

- Option A is viable, but it is **not a stable API surface**.
- We must be willing to pin Tauri versions and accept churn, or we should choose the sidecar approach.

### Definition: “Native window” on Linux (in our build)

On Linux, “native window” means: **a top-level OS window created by Tauri’s windowing layer (tao/wry runtime), which is GTK-backed**, but **does not contain a webview**.

This is “native” in the sense of: OS-managed toplevel window + raw window handle access, not “native” in the sense of “not GTK”.

## Required Guarantees (Stop/Go)

We proceed with the in-process design only if these are true in spikes:

1. **Surface creation works** on:
   - Wayland session (native Wayland, not silently XWayland-only)
   - X11 session
2. **No visible flicker** during:
   - continuous camera motion (60 FPS target)
   - resize drag
   - focus changes between windows
3. **No event-loop deadlocks**:
   - open/close viewport 20× without hangs
   - main window remains responsive while viewport renders continuously
4. **Idle behavior is sane**:
   - when viewport is not animating or interacted with, CPU usage stays low (no busy-spin render loop)
5. **macOS constraint compliance**:
   - surface operations required on main thread are respected (no “works on Windows/Linux only” architecture).

## Consequences

- We **do not** attempt to run a second `winit` event loop inside the Tauri process.
- We must design frame pacing as **interactive (continuous) when needed** and **event/dirty-driven when idle** to avoid CPU burn.
- IPC stays **in-process** and should be treated as a _bounded_ producer/consumer system (explicit coalescing before `emit`), not “Tauri events are backpressured”.

## Contingency (If Linux Fails)

If any Linux guarantees fail (especially flicker), we pivot to **B: separate-process viewport**:

- Viewport becomes a sidecar executable (pure `winit + wgpu`) with its own event loop and windowing (no GTK dependency).
- WebUI ↔ viewport uses an explicit transport (UDS/TCP) with real backpressure + optional binary framing.

This is heavier operationally but provides a real “not GTK” escape hatch.

## Notes

- The repository is currently Tauri v1; this ADR assumes we first migrate `apps/desktop` to Tauri v2 (tracked separately).
