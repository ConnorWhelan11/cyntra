# Viewport Architecture: Dual-Window Tauri v2 Design

**Version:** 1.0
**Target Platform:** Tauri v2.1+, wgpu 0.19+, Rust 1.85+
**Status:** Design Document

---

## 1. Overview and Goals

### Primary Goals

1. **Control/Data Separation**: Web UI (React/Next) acts as control plane; native viewport window is the data plane for high-performance GPU rendering
2. **True GPU Rendering**: Viewport renders directly to a wgpu surface—no frame streaming through IPC as the primary path
3. **Cross-Platform**: Windows 10+, macOS 11+, Linux (X11/Wayland)
4. **Maintainable**: Prefer standard Tauri patterns; minimize forks and exotic dependencies
5. **Type-Safe IPC**: Strongly typed messaging contract between windows

### Explicit Non-Goals

- Electron-style "offscreen rendering" where GPU frames are copied to shared memory
- Browser-based WebGL/WebGPU as the primary viewport (web UI may have separate viz, but not the main 3D view)
- Real-time collaborative multi-user editing (single-user desktop app)
- Mobile platform support (iOS/Android)

### Use Cases

- 3D asset viewer for Glia Fab pipeline (GLB/GLTF models)
- Scene inspection with camera controls (orbit, pan, zoom)
- Debug overlays (wireframe, normals, bounding boxes)
- Playback controls and timeline scrubbing from web UI

---

## 2. System Architecture

### Process/Thread Model

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri Process (single process, multiple windows)              │
│                                                                 │
│  ┌────────────────────┐          ┌──────────────────────────┐  │
│  │  Main Thread       │          │  Render Thread (optional)│  │
│  │  - Event loop      │          │  - wgpu command building │  │
│  │  - Window mgmt     │◄────────►│  - Heavy compute         │  │
│  │  - IPC router      │  Channel │  - Parallel tasks        │  │
│  └────────────────────┘          └──────────────────────────┘  │
│           │                                                     │
│           ├──► Window A: WebviewWindow (Tauri's webview)       │
│           │    ┌─────────────────────────────────────┐         │
│           │    │  React App (Control Plane)          │         │
│           │    │  - Project browser                  │         │
│           │    │  - Playback controls                │         │
│           │    │  - Settings panels                  │         │
│           │    │  - sends: ViewportCommand           │         │
│           │    │  - receives: ViewportState          │         │
│           │    └─────────────────────────────────────┘         │
│           │                                                     │
│           └──► Window B: Native Window (raw wgpu surface)      │
│                ┌─────────────────────────────────────┐         │
│                │  wgpu Viewport (Data Plane)         │         │
│                │  - wgpu device/queue/surface        │         │
│                │  - Render loop (vsync or mailbox)   │         │
│                │  - Input capture (mouse/keyboard)   │         │
│                │  - Optional egui overlay            │         │
│                │  - sends: ViewportState             │         │
│                │  - receives: ViewportCommand        │         │
│                └─────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Module Breakdown

```
src-tauri/
├── main.rs                    # Entry point, window setup
├── viewport/
│   ├── mod.rs                 # Public API
│   ├── window.rs              # Native window creation (raw-window-handle)
│   ├── renderer.rs            # wgpu init, render loop
│   ├── camera.rs              # Camera state and controls
│   ├── input.rs               # Input handling
│   ├── scene.rs               # Scene graph and asset loading
│   └── overlay.rs             # Optional egui debug overlay
├── ipc/
│   ├── mod.rs                 # IPC router
│   ├── commands.rs            # Tauri commands
│   ├── events.rs              # Event emitter helpers
│   └── contract.rs            # TypeScript type generation
└── state.rs                   # Shared application state
```

---

## 3. Window Model

### Window Lifecycle

#### Creation Order

1. **Main Window (Web UI)** created first during `tauri::Builder::default().setup(|app| { ... })`
   - Label: `"main"`
   - Size: 1280x800, resizable
   - Shows immediately with splash screen or loading state

2. **Viewport Window** created on-demand when user opens a 3D asset
   - Label: `"viewport"`
   - Size: 1024x768, resizable
   - Initially hidden; shown after wgpu surface is ready
   - Uses `WindowBuilder::new()` with `.decorations(true)` (standard OS chrome)

#### Show/Hide/Focus Behavior

- **Main Window**:
  - Always visible (minimized state allowed)
  - Can toggle viewport visibility via menu or button
  - Closing main window quits app (primary window)

- **Viewport Window**:
  - Hidden by default; shown when asset loaded
  - `viewport.show()` called after first successful frame render
  - User can close viewport without quitting app (it's a tool window)
  - Main window can bring viewport to front via IPC command
  - Viewport steals focus on show (user is looking at 3D content)

#### Close Semantics

- **Main Window Close**: Triggers app quit
  - Before quit: send `Shutdown` command to viewport
  - Viewport performs cleanup (drop wgpu resources, flush logs)
  - App exits after viewport confirms cleanup (timeout: 5s)

- **Viewport Window Close**: Hides window, keeps wgpu resources alive
  - Emits `ViewportClosed` event (via `viewport:event`) to main window
  - Main window updates UI state (e.g., "Viewport Hidden")
  - Resources stay loaded for fast re-open
  - Explicit "Unload Asset" command from main window drops resources

#### Persistence

- Window positions and sizes saved to `$CONFIG/glia-fab/window-state.json`
- Restored on next launch
- Viewport visibility state **not** persisted (always hidden on launch)

---

## 4. Render Loop Design

### wgpu Initialization

```
Viewport Window Creation
  ↓
1. Create raw window handle (winit or tauri::Window → raw-window-handle)
  ↓
2. Request wgpu adapter (prefer high-performance GPU)
   - Backends: Vulkan (Linux/Win), Metal (macOS), DX12 (Win fallback)
   - Power preference: HighPerformance
   - Fallback: LowPower if HighPerformance unavailable
  ↓
3. Request device and queue
   - Features: TEXTURE_ADAPTER_SPECIFIC_FORMAT_FEATURES (for HDR if available)
   - Limits: default (can tune later)
   - Device lost callback: log error, attempt re-init
  ↓
4. Create surface from window handle
  ↓
5. Configure surface
   - Format: Bgra8UnormSrgb (most compatible) or surface preferred format
   - Usage: RENDER_ATTACHMENT
   - Present mode: Mailbox (prefer) → Fifo (fallback for vsync)
   - Alpha mode: Opaque
  ↓
6. Store device/queue/surface in Arc<Mutex<ViewportState>> or similar
```

### Surface Configuration and Resize

- **On Window Resize Event**:

  ```
  1. Get new physical size from window
  2. If size is zero (minimized), skip reconfigure
  3. Update surface config width/height
  4. Call surface.configure(&device, &new_config)
  5. Update camera aspect ratio
  6. Recreate depth buffer texture (if used)
  ```

- **Device Lost Handling**:
  - wgpu calls device lost callback
  - Attempt to re-initialize adapter/device/surface
  - If retry fails after 3 attempts, show error overlay and disable rendering
  - Emit `DeviceLost` event to main window

### Frame Pacing

#### Request-Redraw Model (Preferred)

- **Event Loop Pattern**:

  ```
  loop:
    match event {
      WindowEvent::RedrawRequested => {
        render_frame();
        window.request_redraw(); // continuous loop
      }
      WindowEvent::Resized(size) => {
        reconfigure_surface(size);
      }
      UserEvent::ViewportCommand(cmd) => {
        apply_command(cmd);
        window.request_redraw();
      }
    }
  ```

- **Present Mode**:
  - **Mailbox**: Low-latency, tearing-free (preferred for interactive viewport)
  - **Fifo**: Vsync fallback (if Mailbox unsupported)
  - **Immediate**: Tearing allowed, lowest latency (debug mode only)

---

## 5. Input Model

### Viewport Window Input Capture

- **Mouse Events**:
  - `CursorMoved`: Update camera controller (orbit/pan)
  - `MouseWheel`: Zoom in/out
  - `MouseInput`: Button down/up (left-drag orbit, right-drag pan, middle-drag pan-XY)

- **Keyboard Events**:
  - `F`: Frame selected object (or entire scene)
  - `G`: Toggle grid
  - `W`: Wireframe toggle
  - `1/2/3`: Orthographic views (front/side/top)
  - `Space`: Reset camera
  - `Esc`: Deselect / Clear tool

- **Focus Rules**:
  - Viewport must have OS focus to receive input
  - When unfocused, input ignored (camera state frozen)
  - Click-to-focus: clicking viewport window activates it

### Camera Controls

- **Arcball/Orbit Camera** (default):
  - Left-drag: Rotate around target
  - Right-drag: Pan parallel to view plane
  - Scroll: Zoom (adjust distance to target)
  - State: `{ target: Vec3, distance: f32, yaw: f32, pitch: f32 }`

- **Free-Fly Camera** (optional mode):
  - WASD: Move in view-relative directions
  - QE: Move up/down
  - Mouse-drag: Rotate view

---

## 6. Concurrency Model

### Thread Assignment

- **Main Thread**:
  - Tauri event loop (must stay on main thread per OS requirements)
  - Window creation and management
  - wgpu surface operations (surface.get_current_texture() is main-thread only on some platforms)
  - IPC message dispatch

- **Render Thread** (optional, advanced):
  - wgpu command encoding (can be offloaded)
  - Heavy compute (mesh processing, texture loading)
  - Scene graph updates
  - **Constraint**: Final surface present must happen on main thread

### Synchronization Strategy

#### Simple Approach (MVP)

- All wgpu operations on main thread
- State wrapped in `Arc<Mutex<ViewportState>>`
- IPC commands acquire lock, update state, trigger redraw
- No separate render thread initially

---

## 7. Observability

### Logging Strategy

- **Framework**: `tracing` crate (supports spans, levels, structured logs)
- **Levels**:
  - `ERROR`: Device lost, asset load failure, critical IPC errors
  - `WARN`: Surface reconfigure, present mode fallback
  - `INFO`: Window created, asset loaded, major state changes
  - `DEBUG`: Per-frame timings (sampled), input events
  - `TRACE`: wgpu command buffer details (dev builds only)

### Performance Metrics

- **FPS and Frame Time**:
  - Track last 60 frames in ring buffer
  - Compute rolling average FPS every 60 frames
  - Emit `viewport:metrics` event to main window

### Debug Overlays (egui)

- **Integration**:
  - `egui` + `egui-wgpu` for immediate-mode UI over viewport
  - Render after main scene pass, into same surface
  - Toggle via `~` key or IPC command

---

## 8. Cross-Platform Notes

### Windows (DX12 / Vulkan)

- **Backend Priority**: Try Vulkan first (better parity with Linux), fallback to DX12
- **DXGI Gotcha**: Surface resize during fullscreen transition can fail; catch and retry
- **Input**: Use `winit` raw input for low-latency mouse

### macOS (Metal)

- **Main Thread Requirement**: All `CAMetalLayer` operations (surface) must be on main thread
- **Retina Displays**: `window.scale_factor()` returns 2.0; must scale surface size accordingly
- **Metal Validation**: Enable in dev builds via `METAL_DEVICE_WRAPPER_TYPE=1` env var

### Linux (Vulkan / X11 / Wayland)

- **Backend**: Vulkan (best support)
- **Wayland**: Requires `wayland-client` and `wayland-protocols` system deps
- **X11**: More stable, but check for `MIT-SHM` extension
- **NVIDIA**: Ensure proprietary drivers installed

### Common Pitfalls

1. **Zero-Size Surface**: Resizing to (0, 0) when minimized crashes some backends
2. **Surface Lost**: User switches GPU → catch `SurfaceError::Lost`, reconfigure
3. **Out of Memory**: Log error, emit event, show user dialog
4. **Device Removed**: Attempt re-init once; if fails, disable rendering

---

## 9. Milestones

### PoC (Proof of Concept)

**Goal**: Prove we can open a native window and render a triangle with wgpu

- [ ] Tauri project with dual windows (webview + native)
- [ ] wgpu initialization and surface configuration
- [ ] Render single-color triangle to viewport window
- [ ] Basic IPC: Main window button → send command → change triangle color
- [ ] Cross-platform smoke test (at least 2 OSes)

### MVP (Minimum Viable Product)

**Goal**: Load and view a static 3D model with camera controls

- [ ] Asset loading (GLTF/GLB via `gltf` crate)
- [ ] Arcball camera with mouse orbit/pan/zoom
- [ ] Simple PBR shader (or unlit textured)
- [ ] Surface resize handling
- [ ] IPC contract for commands/state

### Hardening

**Goal**: Handle edge cases, improve stability, add debug tools

- [ ] Device lost recovery
- [ ] Surface error handling
- [ ] Window state persistence
- [ ] Egui debug overlay
- [ ] Logging with file output

### Polish

**Goal**: Production-ready UX and performance

- [ ] Wireframe/shading mode toggles
- [ ] Grid and axis gizmo
- [ ] Smooth camera interpolation
- [ ] Keyboard shortcuts
- [ ] Optimized render loop

---

## 10. References and Dependencies

### Tauri v2

- **Docs**: https://v2.tauri.app/
- **IPC**: https://v2.tauri.app/develop/calling-rust/

### wgpu

- **Version**: 0.19+ (or latest stable)
- **Docs**: https://wgpu.rs/

### Supporting Crates

- `winit`: 0.29+ (window management)
- `raw-window-handle`: 0.6+ (for wgpu surface creation)
- `gltf`: 1.4+ (asset loading)
- `glam`: 0.25+ (math)
- `egui`: 0.27+ (debug overlay)
- `egui-wgpu`: 0.27+ (egui renderer)
- `tracing`: 0.1+ (logging)

---

**End of Document**
