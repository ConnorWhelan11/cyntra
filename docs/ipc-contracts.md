# IPC Contracts: WebUI ↔ Native Viewport

**Version:** 1.0.0
**Target:** Tauri v2
**Last Updated:** 2025-12-25

## Overview

This document defines the inter-process communication contract between two Tauri windows:

- **Window A (WebUI)**: React-based control interface running in a `WebviewWindow`
- **Window B (Viewport)**: Native wgpu rendering surface with optional egui overlay

Communication is bi-directional, asynchronous, and type-safe. Messages flow over Tauri's IPC layer using the event system (`emit`, `listen`) with structured payloads.

---

## Message Envelope

All messages share a common envelope structure regardless of direction or payload type.

### Envelope Schema

```typescript
interface MessageEnvelope<T> {
  schema_version: "1.0.0";           // Semver for protocol evolution
  message_id: string;                 // UUID for tracing/debugging
  request_id?: string;                // Optional correlation ID for request/response pairs
  timestamp: number;                  // Unix timestamp (ms) when message was created
  source_window: "webui" | "viewport";
  target_window: "webui" | "viewport";
  message_type: string;               // Discriminator (e.g., "SetCamera", "SelectionChanged")
  payload: T;                         // Strongly-typed payload
}
```

### Rationale

- **schema_version**: Enables protocol versioning; receivers can reject/adapt to older/newer versions
- **message_id**: Enables distributed tracing and debugging across window boundaries
- **request_id**: Allows request/response correlation (e.g., `LoadScene` → `SceneLoaded`)
- **timestamp**: Client-side timestamp for latency analysis and event ordering
- **source/target**: Explicit routing; useful when scaling to >2 windows
- **message_type**: Discriminator for payload deserialization

---

## Command Types (WebUI → Viewport)

Commands represent imperative actions issued by the UI to control the viewport state.

### 0. OpenViewport

Request that the native viewport subsystem starts and (if applicable) that the viewport window is created/shown.

```typescript
interface OpenViewportPayload {
  /** Optional label/identifier for the viewport window (default: "viewport") */
  window_label?: string;
  /** If true, force creating a fresh viewport (drop cached resources) */
  fresh?: boolean;
}
```

### 0b. CloseViewport

Request that the viewport window is hidden/closed. Whether GPU resources are retained is an implementation detail.

```typescript
interface CloseViewportPayload {
  /** If true, fully unload GPU resources instead of hiding */
  unload?: boolean;
}
```

### 1. SetToolMode

Switch the active interaction mode in the viewport.

```typescript
interface SetToolModePayload {
  mode: "select" | "orbit" | "pan" | "dolly" | "measure" | "annotate";
  options?: {
    snap_to_grid?: boolean;
    snap_distance?: number;
    multi_select?: boolean;
  };
}
```

### 2. SetCamera

Move the viewport camera to a specific position/orientation.

```typescript
interface SetCameraPayload {
  position: [number, number, number];   // [x, y, z] in world space
  target: [number, number, number];     // Look-at point
  fov?: number;                          // Field of view (degrees)
  transition?: {
    duration_ms: number;
    easing: "linear" | "ease_in_out" | "cubic_bezier";
  };
}
```

### 3. SelectEntity

Programmatically select entities in the scene.

```typescript
interface SelectEntityPayload {
  entity_ids: string[];                 // Empty array = clear selection
  mode: "replace" | "add" | "remove" | "toggle";
  focus?: boolean;                      // If true, camera frames selection
}
```

### 4. LoadScene

Load a new scene from a file path or asset ID.

```typescript
interface LoadScenePayload {
  source: string;                       // File path or asset:// URI
  options?: {
    clear_existing?: boolean;           // Default: true
    spawn_point?: [number, number, number];
    background?: "skybox" | "solid" | "transparent";
    background_color?: [number, number, number, number]; // RGBA [0..1]
  };
}
```

### 5. SetRenderOptions

Configure rendering quality/features.

```typescript
interface SetRenderOptionsPayload {
  msaa?: 1 | 2 | 4 | 8;
  shadows?: boolean;
  ssao?: boolean;
  bloom?: boolean;
  tonemap?: "none" | "aces" | "reinhard";
  exposure?: number;                    // Default: 1.0
  debug_mode?: "none" | "wireframe" | "normals" | "uvs" | "overdraw";
}
```

### 6. CaptureScreenshot

Request a screenshot of the viewport.

```typescript
interface CaptureScreenshotPayload {
  width?: number;
  height?: number;
  format: "png" | "jpeg";
  quality?: number;                     // JPEG quality 0..100
  transparent_background?: boolean;
}
```

### 7. Shutdown

Request that the viewport subsystem shuts down and releases resources.

```typescript
interface ShutdownPayload {
  /** Soft deadline for cleanup; UI may force-close after this. */
  deadline_ms?: number;
  /** Reason for shutdown (for logs/telemetry). */
  reason?: "app_exit" | "restart" | "user_request";
}
```

---

## Event Types (Viewport → WebUI)

Events represent state changes or notifications originating from the viewport.

### 0. ViewportReady

Emitted exactly once per successful viewport startup (or re-init after device loss).

```typescript
interface ViewportReadyPayload {
  window_label: string;                 // e.g. "viewport"
  backend?: "vulkan" | "metal" | "dx12" | "dx11" | "gl";
  adapter_name?: string;
}
```

### 0b. ViewportClosed

Emitted when the viewport window/subsystem is closed or shut down.

```typescript
interface ViewportClosedPayload {
  window_label: string;
  reason?: "user_closed" | "shutdown" | "crash" | "restart";
}
```

### 1. SelectionChanged

```typescript
interface SelectionChangedPayload {
  entity_ids: string[];
  entity_metadata?: Array<{
    id: string;
    name?: string;
    type?: string;
    bounds?: { min: [number, number, number], max: [number, number, number] };
  }>;
}
```

### 2. HoverChanged

```typescript
interface HoverChangedPayload {
  entity_id: string | null;
  world_position?: [number, number, number];
  surface_normal?: [number, number, number];
}
```

**Backpressure:** Coalesce at 60 FPS (16ms).

### 3. CameraChanged

```typescript
interface CameraChangedPayload {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  up: [number, number, number];
  projection_matrix?: number[];         // Flattened 4x4 matrix
}
```

**Backpressure:** Coalesce at 30 FPS (33ms).

### 4. SceneLoaded

```typescript
interface SceneLoadedPayload {
  request_id: string;
  source: string;
  entity_count: number;
  bounds: { min: [number, number, number], max: [number, number, number] };
  metadata?: {
    format?: string;
    file_size_bytes?: number;
    parse_time_ms?: number;
  };
}
```

### 5. PerfStats

```typescript
interface PerfStatsPayload {
  fps: number;
  frame_time_ms: number;
  draw_calls: number;
  triangle_count: number;
  memory_usage_mb?: number;
}
```

**Frequency:** Every 1 second.

### 6. Error

```typescript
interface ErrorPayload {
  request_id?: string;
  severity: "warning" | "error" | "fatal";
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

### 7. DeviceLost

Emitted when wgpu reports device loss or unrecoverable surface errors.

```typescript
interface DeviceLostPayload {
  recoverable: boolean;
  reason?: string;
}
```

### 8. ShutdownAck

Emitted after the viewport processes a `Shutdown` command and begins teardown.

```typescript
interface ShutdownAckPayload {
  ok: boolean;
  /** Optional: wall-clock cleanup duration. */
  cleanup_time_ms?: number;
}
```

---

## Serialization Format

### Choice: JSON

**Rationale:**
- Human-readable, easy to debug
- Native TypeScript/Rust support (`serde_json`)
- Tauri's `emit`/`listen` APIs expect JSON-serializable payloads
- Easy to add optional fields without breaking older clients

**When to Use Bincode:**
For high-bandwidth data streams (vertex buffers, textures), use Tauri's streaming APIs or shared memory.

---

## Backpressure Strategy

Tauri window events are not a bounded channel; receivers provide no end-to-end queue introspection. To avoid unbounded memory growth and UI jank, **backpressure is enforced in Rust before calling `emit`**:

- A **bounded outgoing event queue** sits between the viewport subsystem and the WebUI emitter.
- Coalescing happens **before** enqueuing/emitting.
- Low-priority events may be dropped according to policy when the bounded queue is full.

### Event Coalescing (Viewport Side)

| Event Type | Coalesce Interval |
|------------|-------------------|
| HoverChanged | 16ms (60 FPS) |
| CameraChanged | 33ms (30 FPS) |
| PerfStats | 1000ms (1 Hz) |

### Dropping Policy

| Event Type | Priority | Drop Policy |
|------------|----------|-------------|
| Error | Critical | Never drop |
| SelectionChanged | High | Never drop |
| SceneLoaded | High | Never drop |
| CameraChanged | Medium | Drop if >10 pending |
| HoverChanged | Low | Drop if >5 pending |
| PerfStats | Low | Always drop oldest |

---

## Lifecycle Timeouts

Recommended UI-side timeouts (defaults; tune after spikes):

- `OpenViewport` → `ViewportReady`: **10s**
- `LoadScene` → `SceneLoaded` (or `Error`): **30s**
- `Shutdown` → `ShutdownAck` (or `ViewportClosed`): **5s**

Timeouts are enforced by the WebUI; the viewport should still emit an `Error` event on known failure conditions.

---

## Example Payloads

### Load New Scene

**UI → Viewport:**
```json
{
  "schema_version": "1.0.0",
  "message_id": "req_001",
  "timestamp": 1735142400000,
  "source_window": "webui",
  "target_window": "viewport",
  "message_type": "LoadScene",
  "payload": {
    "source": "asset://worlds/outora_library_v0.3.glb",
    "options": {
      "clear_existing": true,
      "background": "skybox"
    }
  }
}
```

**Viewport → UI (Success):**
```json
{
  "schema_version": "1.0.0",
  "message_id": "evt_001",
  "request_id": "req_001",
  "timestamp": 1735142402500,
  "source_window": "viewport",
  "target_window": "webui",
  "message_type": "SceneLoaded",
  "payload": {
    "request_id": "req_001",
    "source": "asset://worlds/outora_library_v0.3.glb",
    "entity_count": 42,
    "bounds": {
      "min": [-50.0, 0.0, -50.0],
      "max": [50.0, 10.0, 50.0]
    }
  }
}
```

---

## Implementation Notes

### Tauri v2 APIs

```rust
// Viewport: Emit event
app_handle.emit_all("viewport:event", &envelope)?;
```

```typescript
// WebUI: Listen
listen<MessageEnvelope<SelectionChangedPayload>>("viewport:event", (event) => {
  // Handle
});
```

Commands are typically sent via `invoke` so the Rust side can enforce bounded queues/backpressure:

```typescript
await invoke("viewport_command", { envelope });
```

### TypeScript Contract

Generate TypeScript types from Rust schemas using `ts-rs`:

```rust
#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
struct MessageEnvelope<T> {
    schema_version: String,
    message_id: String,
    // ...
}
```

Export to `apps/glia-fab-desktop/src/types/ipc.ts`.

---

## Assumptions

1. **Single WebUI, Single Viewport**: Multi-viewport requires routing extensions.
2. **No Binary Data in Events**: Large assets loaded via file paths.
3. **Eventual Consistency**: High-frequency events may arrive out-of-order.
4. **Error Recovery**: UI implements timeout logic (default: 30s).
5. **Coordinate System**: Right-handed Y-up (matching Blender/glTF).

### Suggested Error Codes

- `VIEWPORT_NOT_RUNNING`
- `VIEWPORT_BUSY`
- `INVALID_SCENE_PATH`
- `SCENE_LOAD_FAILED`
- `DEVICE_LOST`
- `SURFACE_LOST`
- `UNSUPPORTED_PLATFORM`
- `INTERNAL_ERROR`

---

## References

- [Tauri v2 Events](https://v2.tauri.app/reference/javascript/api/event/)
- [wgpu Documentation](https://wgpu.rs/)
- [glTF 2.0 Spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

---

**End of Document**
