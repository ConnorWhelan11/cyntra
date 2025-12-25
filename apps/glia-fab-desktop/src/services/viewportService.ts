import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ViewportCommandEnvelope,
  ViewportCommandMessage,
  ViewportEventEnvelope,
  OpenViewportPayload,
  CloseViewportPayload,
  ShutdownPayload,
  LoadScenePayload,
} from "@/types/viewport";

const SCHEMA_VERSION = "1.0.0";

function uuidV4(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
    .slice(8, 10)
    .join("")}-${hex.slice(10, 16).join("")}`;
}

export function createViewportCommandEnvelope(
  message: ViewportCommandMessage,
  requestId: string | null = null
): ViewportCommandEnvelope {
  return {
    schema_version: SCHEMA_VERSION,
    message_id: uuidV4(),
    request_id: requestId,
    timestamp: Date.now(),
    source_window: "webui",
    target_window: "viewport",
    ...message,
  };
}

export async function sendViewportCommand(envelope: ViewportCommandEnvelope): Promise<void> {
  await invoke("viewport_command", { envelope });
}

export async function openViewport(payload: OpenViewportPayload = {}): Promise<string> {
  const requestId = uuidV4();
  await sendViewportCommand(
    createViewportCommandEnvelope(
      { message_type: "OpenViewport", payload },
      requestId
    )
  );
  return requestId;
}

export async function closeViewport(payload: CloseViewportPayload = {}): Promise<string> {
  const requestId = uuidV4();
  await sendViewportCommand(
    createViewportCommandEnvelope(
      { message_type: "CloseViewport", payload },
      requestId
    )
  );
  return requestId;
}

export async function shutdownViewport(payload: ShutdownPayload = {}): Promise<string> {
  const requestId = uuidV4();
  await sendViewportCommand(
    createViewportCommandEnvelope(
      { message_type: "Shutdown", payload },
      requestId
    )
  );
  return requestId;
}

export async function loadScene(
  source: string,
  options?: LoadScenePayload["options"]
): Promise<string> {
  const requestId = uuidV4();
  await sendViewportCommand(
    createViewportCommandEnvelope(
      {
        message_type: "LoadScene",
        payload: { source, options },
      },
      requestId
    )
  );
  return requestId;
}

export async function listenViewportEvents(
  handler: (event: ViewportEventEnvelope) => void
): Promise<() => void> {
  const unlisten = await listen<ViewportEventEnvelope>("viewport:event", (event) => {
    handler(event.payload);
  });
  return unlisten;
}

