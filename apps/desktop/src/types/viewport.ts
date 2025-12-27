export type IpcWindow = "webui" | "viewport";

export interface MessageEnvelopeBase {
  schema_version: string;
  message_id: string;
  request_id: string | null;
  timestamp: number;
  source_window: IpcWindow;
  target_window: IpcWindow;
}

export interface OpenViewportPayload {
  window_label?: string;
  fresh?: boolean;
}

export interface CloseViewportPayload {
  unload?: boolean;
}

export interface SetToolModePayload {
  mode: string;
  options?: {
    snap_to_grid?: boolean;
    snap_distance?: number;
    multi_select?: boolean;
  };
}

export interface SetCameraPayload {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
  transition?: {
    duration_ms: number;
    easing: string;
  };
}

export interface SelectEntityPayload {
  entity_ids: string[];
  mode: string;
  focus?: boolean;
}

export interface LoadScenePayload {
  source: string;
  options?: {
    clear_existing?: boolean;
    spawn_point?: [number, number, number];
    background?: string;
    background_color?: [number, number, number, number];
  };
}

export interface SetRenderOptionsPayload {
  msaa?: number;
  shadows?: boolean;
  ssao?: boolean;
  bloom?: boolean;
  tonemap?: string;
  exposure?: number;
  debug_mode?: string;
}

export interface CaptureScreenshotPayload {
  width?: number;
  height?: number;
  format: string;
  quality?: number;
  transparent_background?: boolean;
}

export interface ShutdownPayload {
  deadline_ms?: number;
  reason?: string;
}

export type ViewportCommandMessage =
  | { message_type: "OpenViewport"; payload: OpenViewportPayload }
  | { message_type: "CloseViewport"; payload: CloseViewportPayload }
  | { message_type: "SetToolMode"; payload: SetToolModePayload }
  | { message_type: "SetCamera"; payload: SetCameraPayload }
  | { message_type: "SelectEntity"; payload: SelectEntityPayload }
  | { message_type: "LoadScene"; payload: LoadScenePayload }
  | { message_type: "SetRenderOptions"; payload: SetRenderOptionsPayload }
  | { message_type: "CaptureScreenshot"; payload: CaptureScreenshotPayload }
  | { message_type: "Shutdown"; payload: ShutdownPayload };

export type ViewportCommandEnvelope = MessageEnvelopeBase & ViewportCommandMessage;

export interface ViewportReadyPayload {
  window_label: string;
  backend?: string;
  adapter_name?: string;
}

export interface ViewportClosedPayload {
  window_label: string;
  reason?: string;
}

export interface SelectionChangedPayload {
  entity_ids: string[];
  entity_metadata?: Array<{
    id: string;
    name?: string;
    type?: string;
    bounds?: {
      min: [number, number, number];
      max: [number, number, number];
    };
  }>;
}

export interface HoverChangedPayload {
  entity_id: string | null;
  world_position?: [number, number, number];
  surface_normal?: [number, number, number];
}

export interface CameraChangedPayload {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  up: [number, number, number];
  projection_matrix?: number[];
}

export interface SceneLoadedPayload {
  request_id: string;
  source: string;
  entity_count: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  metadata?: {
    format?: string;
    file_size_bytes?: number;
    parse_time_ms?: number;
  };
}

export interface PerfStatsPayload {
  fps: number;
  frame_time_ms: number;
  draw_calls: number;
  triangle_count: number;
  memory_usage_mb?: number;
}

export interface ErrorPayload {
  request_id?: string;
  severity: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DeviceLostPayload {
  recoverable: boolean;
  reason?: string;
}

export interface ShutdownAckPayload {
  ok: boolean;
  cleanup_time_ms?: number;
}

export type ViewportEventMessage =
  | { message_type: "ViewportReady"; payload: ViewportReadyPayload }
  | { message_type: "ViewportClosed"; payload: ViewportClosedPayload }
  | { message_type: "SelectionChanged"; payload: SelectionChangedPayload }
  | { message_type: "HoverChanged"; payload: HoverChangedPayload }
  | { message_type: "CameraChanged"; payload: CameraChangedPayload }
  | { message_type: "SceneLoaded"; payload: SceneLoadedPayload }
  | { message_type: "PerfStats"; payload: PerfStatsPayload }
  | { message_type: "Error"; payload: ErrorPayload }
  | { message_type: "DeviceLost"; payload: DeviceLostPayload }
  | { message_type: "ShutdownAck"; payload: ShutdownAckPayload };

export type ViewportEventEnvelope = MessageEnvelopeBase & ViewportEventMessage;
