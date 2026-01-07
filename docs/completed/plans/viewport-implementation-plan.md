# Tauri v2 Multi-Window Viewport Implementation Plan

## Document Information

| Field               | Value        |
| ------------------- | ------------ |
| **Status**          | Draft        |
| **Version**         | 1.0          |
| **Created**         | 2025-12-25   |
| **Target Codebase** | apps/desktop |

---

## Executive Summary

This plan details the implementation of a Tauri v2 multi-window application with:

- **Window A**: Web UI (React frontend in WebviewWindow) - existing
- **Window B**: Native viewport window using wgpu for true 3D rendering with optional egui overlay

The approach uses **separate windows** (not embedded wgpu inside webview) to ensure maximum rendering performance and avoid Linux surface conflicts.

---

## Phase 0: Proof of Concept (PoC)

### Goals

- Validate wgpu window creation works alongside Tauri webview
- Confirm cross-platform surface creation (Windows/macOS/Linux)
- Establish basic event passing between windows

### Task Breakdown

#### 0.1 Project Structure Setup

**Files to create:**

```
apps/desktop/src-tauri/
  src/
    viewport/
      mod.rs              # Module entry, exports
      window.rs           # Window creation and lifecycle
      renderer.rs         # wgpu initialization, render loop
      surface.rs          # Surface management, resize handling
    ipc/
      mod.rs              # Module entry
      schema.rs           # Message types (serde-based)
      channel.rs          # Channel abstraction
```

**Cargo.toml additions:**

```toml
[dependencies]
wgpu = "23"
winit = "0.30"
raw-window-handle = "0.6"
gltf = "1.4"
glam = "0.29"
egui = "0.29"
egui-wgpu = "0.29"
```

#### 0.2 wgpu + winit Window Creation

- Create native winit window separate from Tauri's webview
- Initialize wgpu instance, adapter, device, queue
- Create surface from window handle
- Implement basic render loop (clear color only)

#### 0.3 Basic IPC Channel

- Define initial message schema (open viewport, close viewport, ping/pong)
- Implement Rust-side event emission via `app.emit_all`
- Implement frontend listener via `@tauri-apps/api/event`

### Acceptance Criteria

- [ ] Native wgpu window opens when triggered from React UI
- [ ] Window displays solid color (proves rendering works)
- [ ] Window responds to resize events
- [ ] Frontend receives `ViewportReady` event (via `viewport:event`)
- [ ] Works on macOS; documented path for Linux/Windows

### Stop/Go Gate

- [ ] wgpu surface created and presenting frames
- [ ] No crashes on window open/close cycle (10x)
- [ ] IPC ping/pong latency < 5ms average

---

## Phase 1: Minimum Viable Product (MVP)

### Goals

- Full render pipeline with scene graph
- Bi-directional typed IPC
- Camera controls (orbit, pan, zoom)
- Load and display GLB/glTF assets

### Workstream 1: Windowing & Lifecycle

**Files:**

- `src/viewport/window.rs`: Window state machine
- `src/viewport/manager.rs`: Track lifecycle events

**Tasks:**

- Implement window state machine (Creating → Ready → Active → Closing → Closed)
- Handle graceful shutdown (cleanup GPU resources)
- Support window positioning

#### Workstream 2: Viewport Renderer

**Files:**

- `src/viewport/renderer.rs`: Main render orchestration
- `src/viewport/pipeline.rs`: Render pipeline setup
- `src/viewport/mesh.rs`: Mesh handling, GPU buffers
- `src/viewport/camera.rs`: Camera matrices
- `src/viewport/gltf_loader.rs`: glTF/GLB loading

**Tasks:**

- Create depth buffer, optional MSAA
- Implement basic PBR or unlit shader
- Camera uniform buffer
- glTF loader with mesh extraction
- Transform hierarchy support

#### Workstream 3: Input Handling

**Files:**

- `src/viewport/input.rs`: Input state
- `src/viewport/orbit_camera.rs`: Orbit camera controller

**Tasks:**

- Capture mouse events (click, drag, scroll)
- Implement orbit camera (spherical coordinates)
- Pan (shift+drag), zoom (scroll)

#### Workstream 4: IPC/Events

**Files:**

- `src/ipc/schema.rs`: All message types
- `src/ipc/dispatch.rs`: Message routing
- `src/ipc/coalesce.rs`: Backpressure

**Frontend:**

- `src/services/viewportService.ts`: IPC bridge
- `src/types/viewport.ts`: TypeScript types

**Tasks:**

- Schema: LoadAsset, SetCamera, SetSelection
- Coalescing for high-frequency events
- Generate TypeScript types from Rust

#### Workstream 5: Shared State

**Files:**

- `src/viewport/state.rs`: Viewport state
- `src/state/scene_state.rs`: Scene graph state

**Tasks:**

- Rust owns scene, React owns UI
- Selection state sync
- Camera state ownership

#### Workstream 6: Observability

**Files:**

- `src/viewport/metrics.rs`: Performance counters

**Tasks:**

- Frame time measurement
- Emit metrics to frontend

### Acceptance Criteria

- [ ] GLB asset loads and displays
- [ ] Camera orbit/pan/zoom at 60fps
- [ ] Selection click sends entity ID to frontend
- [ ] Frame time < 16ms

---

## Phase 2: Hardening

### Goals

- Production-quality error handling
- Performance optimization
- Memory management

### Tasks

- Surface lost recovery
- Device lost recovery
- Asset load failure handling
- Frustum culling
- GPU buffer pooling
- Multi-monitor DPI handling
- Platform-specific testing matrix

### Acceptance Criteria

- [ ] Graceful recovery from surface lost
- [ ] 60fps with 100+ objects
- [ ] Memory stable over 1-hour session

---

## Phase 3: UX/Polish

### Goals

- Refined visual quality
- Smooth animations
- egui debug overlay

### Tasks

- Anti-aliasing options
- Smooth camera transitions
- egui integration
- Keyboard shortcuts (F: focus, G: grid, W: wireframe)
- Window state persistence

---

## Task Table

| Task ID | Task              | Complexity | Dependencies | Done When               |
| ------- | ----------------- | ---------- | ------------ | ----------------------- |
| P0.1    | Project structure | S          | None         | Files created, compiles |
| P0.2    | wgpu window       | M          | P0.1         | Window opens with color |
| P0.3    | Basic IPC         | S          | P0.1         | Ping/pong works         |
| P1.1    | Window lifecycle  | M          | P0.2         | State machine works     |
| P1.2a   | Render pipeline   | L          | P1.1         | PBR shader rendering    |
| P1.2b   | glTF loader       | M          | P1.2a        | GLB displays            |
| P1.3    | Orbit camera      | M          | P1.2a        | Mouse controls work     |
| P1.4a   | IPC schema        | M          | P0.3         | Types defined           |
| P1.4b   | Coalescing        | M          | P1.4a        | High-freq handled       |
| P1.5    | Shared state      | M          | P1.4a        | Ownership documented    |
| P1.6    | Metrics           | S          | P1.2a        | Frame time visible      |
| P2.1    | Error recovery    | M          | P1.\*        | Surface lost handled    |
| P2.2    | Performance       | L          | P1.\*        | 60fps/100 objects       |
| P2.3    | Memory mgmt       | M          | P1.\*        | Stable 1-hour           |
| P3.1    | Visual polish     | M          | P2.\*        | AA/shadows work         |
| P3.2    | Animation         | S          | P2.\*        | Smooth transitions      |
| P3.3    | egui overlay      | M          | P2.\*        | Debug panel visible     |
| P3.4    | Shortcuts         | S          | P3.3         | All shortcuts work      |

---

## Risk Register

| Rank | Risk                           | Severity | Mitigation                       |
| ---- | ------------------------------ | -------- | -------------------------------- |
| 1    | Linux Wayland surface failure  | High     | Force Vulkan, X11 fallback       |
| 2    | Event loop conflict            | High     | Separate thread, message passing |
| 3    | macOS main thread requirement  | Medium   | Ensure wgpu init on main thread  |
| 4    | IPC bandwidth for large scenes | High     | Binary serialization, coalescing |
| 5    | GPU driver compatibility       | Medium   | Test matrix, fallback paths      |
| 6    | Memory leaks in GPU resources  | High     | Resource tracking, cleanup       |
| 7    | glTF feature support gaps      | Medium   | Document supported features      |

---

## Spike Experiments

### Spike 1: wgpu Surface on Linux Wayland

**Objective**: Validate wgpu surface creation on native Wayland
**Duration**: 1 day
**Success**: Surface creates and presents without X11

### Spike 2: Tauri + winit Event Loop

**Objective**: Validate separate winit window alongside Tauri
**Duration**: 1 day
**Success**: Both windows responsive, clean shutdown

### Spike 3: IPC Throughput

**Objective**: Measure latency for 60Hz camera updates
**Duration**: 0.5 days
**Success**: < 16ms total budget

### Spike 4: glTF Loading

**Objective**: Load Outora Library GLBs
**Duration**: 0.5 days
**Success**: All assets load, < 100ms

---

## Architecture Diagram

```
+------------------------------------------------------------------+
|                         Tauri Process                             |
|                                                                  |
|  +--------------------------+    +---------------------------+   |
|  |     WebviewWindow        |    |    Viewport Window        |   |
|  |        (React)           |    |      (wgpu + winit)       |   |
|  |                          |    |                           |   |
|  |  +--------------------+  |    |  +---------------------+  |   |
|  |  | ViewportService.ts |<-|----|--> viewport/ipc.rs     |  |   |
|  |  +--------------------+  |    |  +---------------------+  |   |
|  |           |              |    |           |               |   |
|  |           v              |    |           v               |   |
|  |  +--------------------+  |    |  +---------------------+  |   |
|  |  | GalleryView.tsx    |  |    |  | Renderer            |  |   |
|  |  | StageView.tsx      |  |    |  | - Pipeline          |  |   |
|  |  +--------------------+  |    |  | - Camera            |  |   |
|  |                          |    |  | - Scene             |  |   |
|  +--------------------------+    +---------------------------+   |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |                     Shared State (Rust)                   |   |
|  |  - SceneState (authoritative for 3D)                     |   |
|  |  - SelectionState (synced both ways)                      |   |
|  |  - CameraState (viewport owns, React requests)           |   |
|  +----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

---

## Critical Files

1. `apps/desktop/src-tauri/Cargo.toml` - Add wgpu, winit, gltf dependencies
2. `apps/desktop/src-tauri/src/main.rs` - Add viewport module, spawn commands
3. `apps/desktop/src/services/viewportService.ts` - IPC bridge
4. `apps/desktop/src/types/viewport.ts` - TypeScript message types
5. `apps/desktop/src-tauri/tauri.conf.json` - Multi-window config

---

## References

- [Tauri v2 Multi-Window](https://github.com/tauri-apps/tauri/discussions/10964)
- [wry wgpu Example](https://github.com/tauri-apps/wry/blob/dev/examples/wgpu.rs)
- [Tauri IPC](https://v2.tauri.app/concept/inter-process-communication/)
- [wgpu Surface Config](https://sotrh.github.io/learn-wgpu/beginner/tutorial2-surface/)
- [egui_wgpu](https://docs.rs/egui-wgpu)
- [tauri-wgpu-cam](https://github.com/clearlysid/tauri-wgpu-cam)
- [tauri-plugin-egui](https://github.com/clearlysid/tauri-plugin-egui)

---

**End of Plan**
