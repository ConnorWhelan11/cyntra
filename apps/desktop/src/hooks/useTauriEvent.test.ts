import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTauriEvent } from "./useTauriEvent";
import { mockTauriEvent } from "@/test/mockTauri";

describe("useTauriEvent", () => {
  it("should listen to Tauri events", async () => {
    const { listenMock, emit } = mockTauriEvent();
    const handler = vi.fn();

    renderHook(() => useTauriEvent("test-event", handler));

    // Wait for async listen to complete
    await vi.waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith("test-event", expect.any(Function));
    });

    // Emit event
    emit("test-event", { data: "test" });

    expect(handler).toHaveBeenCalledWith({ data: "test" });
  });

  it("should unlisten on unmount", async () => {
    const { listenMock } = mockTauriEvent();
    const handler = vi.fn();
    const unlisten = vi.fn();

    listenMock.mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useTauriEvent("test-event", handler));

    await vi.waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    unmount();

    await vi.waitFor(() => {
      expect(unlisten).toHaveBeenCalled();
    });
  });
});
