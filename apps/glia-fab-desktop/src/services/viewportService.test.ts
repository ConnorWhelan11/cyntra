import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearTauriMocks, mockTauriEvent, mockTauriInvoke } from "@/test/mockTauri";
import { listenViewportEvents, loadScene, openViewport } from "./viewportService";

describe("viewportService", () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  it("sends viewport_command envelopes via invoke", async () => {
    const invokeMock = mockTauriInvoke({ viewport_command: undefined });

    await openViewport({ fresh: true });
    await loadScene("/tmp/example.glb");

    expect(invokeMock).toHaveBeenCalledWith(
      "viewport_command",
      expect.objectContaining({
        envelope: expect.objectContaining({
          schema_version: "1.0.0",
          source_window: "webui",
          target_window: "viewport",
        }),
      })
    );

    const envelopes = invokeMock.mock.calls.map((call) => call[1]?.envelope);
    const messageTypes = envelopes.map((env: any) => env?.message_type);
    expect(messageTypes).toContain("OpenViewport");
    expect(messageTypes).toContain("LoadScene");
  });

  it("listens for viewport:event envelopes", async () => {
    mockTauriInvoke({ viewport_command: undefined });
    const { emit } = mockTauriEvent();
    const handler = vi.fn();

    const unlisten = await listenViewportEvents(handler);

    emit("viewport:event", {
      schema_version: "1.0.0",
      message_id: "00000000-0000-4000-8000-000000000000",
      request_id: null,
      timestamp: 0,
      source_window: "viewport",
      target_window: "webui",
      message_type: "ViewportReady",
      payload: { window_label: "viewport" },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        message_type: "ViewportReady",
      })
    );

    await unlisten();
  });
});

