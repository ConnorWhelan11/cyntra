# Viewport Architecture Synthesis

**Consolidated from parallel research agents — 2025-12-25**

This document synthesizes findings from four parallel research tracks into actionable guidance for implementing a Tauri v2 multi-window viewport.

---

## Quick Reference

| Document            | Purpose                                | Location                                     |
| ------------------- | -------------------------------------- | -------------------------------------------- |
| Architecture        | System design, threading, window model | `docs/viewport-architecture.md`              |
| IPC Contracts       | Message schemas, backpressure          | `docs/ipc-contracts.md`                      |
| Implementation Plan | Phases, tasks, risks                   | `docs/plans/viewport-implementation-plan.md` |
| **This Synthesis**  | Key decisions, gotchas, action items   | `docs/plans/viewport-synthesis.md`           |

---

## Architecture Decision: Separate Windows

**Decision:** Use two separate Tauri windows (not embedded wgpu inside webview).

```
┌────────────────────────┐     ┌────────────────────────┐
│  Window A (WebView)    │     │  Window B (Native)     │
│  React UI              │◄───►│  wgpu + winit          │
│  Control Plane         │ IPC │  Data Plane            │
└────────────────────────┘     └────────────────────────┘
```

**Rationale:**

1. **Linux Stability**: GTK + wgpu overlay causes flickering ([tauri#9220](https://github.com/tauri-apps/tauri/issues/9220))
2. **Performance**: Native window allows vsync-aligned rendering
3. **Maintainability**: Standard Tauri patterns, no plugin dependencies

**Alternatives Rejected:**

- `tauri-plugin-egui` (glutin-based, unmaintained)
- wgpu inside webview overlay (Linux flickering)
- Pixel streaming via IPC (performance)

---

## Platform Matrix

| Platform          | Backend       | Window System  | Key Gotchas                              |
| ----------------- | ------------- | -------------- | ---------------------------------------- |
| **Windows**       | DX12 → Vulkan | Native         | ✅ Most stable                           |
| **macOS**         | Metal         | NSWindow       | Main thread requirement, Retina 2x DPI   |
| **Linux X11**     | Vulkan        | Xlib           | ✅ Stable, use `MIT-SHM`                 |
| **Linux Wayland** | Vulkan        | wayland-client | ⚠️ Flickering risk, NVIDIA driver issues |

### Critical Linux Issue

> wgpu + Tauri webview on same GTK window = **flickering** on X11/Wayland.
>
> **Mitigation**: Separate winit window (not GTK) for viewport.
> **References**: [tauri#9220](https://github.com/tauri-apps/tauri/issues/9220), [clearlysid/tauri-wgpu-cam](https://github.com/clearlysid/tauri-wgpu-cam)

---

## IPC Architecture

### Message Flow

```
React UI                    Rust Core                   Viewport
   │                           │                            │
   │── SetCamera ─────────────►│                            │
   │                           │── channel ────────────────►│
   │                           │                            │── render
   │                           │◄── CameraChanged ─────────│
   │◄── viewport:event ───────│                            │
```

### Key Message Types

**Commands (UI → Viewport):**

- `SetCamera` — position, target, transition
- `SelectEntity` — entity IDs, mode (replace/add/toggle)
- `LoadScene` — asset path, options
- `SetRenderOptions` — MSAA, shadows, debug mode

**Events (Viewport → UI):**

- `SelectionChanged` — entity IDs, metadata
- `CameraChanged` — position, target, FOV
- `PerfStats` — FPS, frame time, draw calls
- `Error` — severity, code, message

### Backpressure Strategy

| Event            | Coalesce    | Drop Policy         |
| ---------------- | ----------- | ------------------- |
| HoverChanged     | 16ms (60Hz) | Drop if >5 pending  |
| CameraChanged    | 33ms (30Hz) | Drop if >10 pending |
| PerfStats        | 1000ms      | Always drop oldest  |
| SelectionChanged | None        | Never drop          |

---

## Render Loop

### Scheduling: Request-Redraw Model

```rust
// Pseudocode
loop {
    match event {
        RedrawRequested => {
            process_commands();      // Drain IPC channel
            update_camera(dt);       // Apply input
            render_frame();          // wgpu submit
            window.request_redraw(); // Schedule next frame
        }
        Resized(size) => {
            surface.configure(&device, &new_config);
            depth_buffer = create_depth(size);
        }
    }
}
```

### Present Modes

| Mode        | Latency | Tearing | Use Case              |
| ----------- | ------- | ------- | --------------------- |
| **Mailbox** | Low     | No      | Default (interactive) |
| Fifo        | Medium  | No      | Vsync fallback        |
| Immediate   | Lowest  | Yes     | Debug only            |

### Error Recovery

| Error                       | Recovery                      |
| --------------------------- | ----------------------------- |
| `SurfaceError::Lost`        | Reconfigure surface           |
| `SurfaceError::OutOfMemory` | Emit error, disable rendering |
| Device Lost                 | Attempt re-init (3 retries)   |

---

## Implementation Phases

### Phase 0: PoC (1 week)

- [ ] wgpu window creation from Rust
- [ ] Surface presents solid color
- [ ] Basic IPC ping/pong

**Go/No-Go**: Surface creates on all platforms, IPC < 5ms

### Phase 1: MVP (2 weeks)

- [ ] glTF/GLB loading
- [ ] Orbit camera controls
- [ ] Typed IPC schema
- [ ] Selection sync

**Go/No-Go**: 60fps with Outora Library assets

### Phase 2: Hardening (1 week)

- [ ] Surface lost recovery
- [ ] Memory stability (1-hour test)
- [ ] Platform-specific testing

### Phase 3: Polish (1 week)

- [ ] egui debug overlay
- [ ] Keyboard shortcuts
- [ ] Smooth camera transitions

---

## Critical Files to Create

```
apps/desktop/src-tauri/
├── Cargo.toml              # Add wgpu, winit, gltf, egui
├── src/
│   ├── main.rs             # Add viewport spawn command
│   ├── viewport/
│   │   ├── mod.rs          # Module entry
│   │   ├── window.rs       # winit window creation
│   │   ├── renderer.rs     # wgpu init, render loop
│   │   ├── camera.rs       # Orbit camera controller
│   │   ├── scene.rs        # glTF loading, scene graph
│   │   └── input.rs        # Mouse/keyboard handling
│   └── ipc/
│       ├── mod.rs          # Module entry
│       ├── schema.rs       # Serde message types
│       └── channel.rs      # Backpressure, coalescing

apps/desktop/src/
├── services/viewportService.ts   # IPC bridge
└── types/viewport.ts             # TypeScript types (ts-rs generated)
```

---

## Dependencies to Add

```toml
# apps/desktop/src-tauri/Cargo.toml
[dependencies]
wgpu = "23"
winit = "0.30"
raw-window-handle = "0.6"
gltf = "1.4"
glam = "0.29"
egui = "0.29"
egui-wgpu = "0.29"
tracing = "0.1"
```

---

## Risk Register (Top 5)

| Risk                            | Impact | Mitigation                                     |
| ------------------------------- | ------ | ---------------------------------------------- |
| Linux Wayland surface conflicts | High   | Force Vulkan, separate winit window            |
| Event loop thread conflict      | High   | winit on main thread, message passing to Tauri |
| macOS Metal main thread         | Medium | Ensure wgpu init on main thread                |
| IPC bandwidth (large scenes)    | Medium | Coalescing, binary serialization for geometry  |
| Memory leaks in GPU resources   | High   | `Drop` impls, resource tracking                |

---

## Spike Experiments (Do First)

### Spike 1: wgpu + winit on Linux Wayland

```bash
# Test native Wayland surface
WAYLAND_DISPLAY=wayland-0 cargo run --example wgpu_triangle
```

**Success**: Surface creates without X11 fallback.

### Spike 2: Tauri + winit Coexistence

- Spawn winit window from Tauri setup hook
- Verify both windows receive events
- Clean shutdown without deadlock

**Success**: Both responsive, no crashes on close.

### Spike 3: IPC Round-Trip Latency

- Timestamp → emit → receive → respond → measure
- 1000 iterations, report p50/p99

**Success**: p99 < 5ms.

---

## Reference Implementations

| Repo                                                                                | What It Demonstrates                  |
| ----------------------------------------------------------------------------------- | ------------------------------------- |
| [clearlysid/tauri-wgpu-cam](https://github.com/clearlysid/tauri-wgpu-cam)           | wgpu surface from Tauri window handle |
| [clearlysid/tauri-plugin-egui](https://github.com/clearlysid/tauri-plugin-egui)     | egui + wgpu integration pattern       |
| [FabianLars/tauri-v2-wgpu](https://github.com/FabianLars/tauri-v2-wgpu)             | Minimal Tauri v2 wgpu example         |
| [wry/examples/wgpu.rs](https://github.com/tauri-apps/wry/blob/dev/examples/wgpu.rs) | wry-level surface creation            |

---

## Next Actions

1. **Run Spike 1**: Validate wgpu on Linux Wayland before committing to implementation
2. **Add Dependencies**: wgpu, winit, gltf to Cargo.toml
3. **Create Module Structure**: `viewport/` and `ipc/` directories
4. **Implement PoC**: Window + solid color render + basic IPC

---

## Open Questions

1. **Event Loop Ownership**: Should winit run in a separate thread, or share Tauri's main thread via custom event loop?
   - _Lean toward_: Separate thread with channel, Tauri stays on main.

2. **egui Input Routing**: How to split input between egui overlay and 3D camera?
   - _Lean toward_: egui gets priority; if not consumed, pass to camera.

3. **Asset Hot Reload**: Should viewport watch for file changes?
   - _Defer to Phase 3_: Not MVP-critical.

---

**End of Synthesis**
