import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useKernelEventStream, useEventStreamCallback } from "./useKernelEventStream";
import { mockTauriEvent, mockTauriInvoke, clearTauriMocks } from "@/test/mockTauri";
import type { KernelEvent } from "@/types";

describe("useKernelEventStream", () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  it("should start event watcher when projectRoot is provided", async () => {
    const { listenMock } = mockTauriEvent();
    const invokeMock = mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    renderHook(() => useKernelEventStream("/path/to/project", onEvents));

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith("kernel_events", expect.any(Function));
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("start_event_watcher", {
        params: {
          projectRoot: "/path/to/project",
          lastOffset: 0,
        },
      });
    });
  });

  it("should not start watcher when projectRoot is null", async () => {
    const { listenMock } = mockTauriEvent();
    const invokeMock = mockTauriInvoke({
      start_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    renderHook(() => useKernelEventStream(null, onEvents));

    // Wait a bit to ensure nothing gets called
    await new Promise((r) => setTimeout(r, 50));

    expect(listenMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("should invoke onEvents callback when events are received", async () => {
    const { listenMock, emit } = mockTauriEvent();
    mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    renderHook(() => useKernelEventStream("/path/to/project", onEvents));

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    const testEvents: KernelEvent[] = [
      {
        timestamp: "2024-01-01T00:00:00Z",
        type: "issue.ready",
        issueId: "issue-1",
        workcellId: null,
        data: { message: "Issue ready" },
      },
      {
        timestamp: "2024-01-01T00:00:01Z",
        type: "workcell.started",
        issueId: "issue-1",
        workcellId: "wc-1",
        data: { message: "Workcell started" },
      },
    ];

    emit("kernel_events", {
      projectRoot: "/path/to/project",
      events: testEvents,
      offset: 1024,
    });

    expect(onEvents).toHaveBeenCalledWith(testEvents);
  });

  it("should filter events by projectRoot", async () => {
    const { listenMock, emit } = mockTauriEvent();
    mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    renderHook(() => useKernelEventStream("/path/to/project-a", onEvents));

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    // Emit event for different project - should be ignored
    emit("kernel_events", {
      projectRoot: "/path/to/project-b",
      events: [
        {
          timestamp: "2024-01-01T00:00:00Z",
          type: "test",
          issueId: null,
          workcellId: null,
          data: null,
        },
      ],
      offset: 100,
    });

    expect(onEvents).not.toHaveBeenCalled();

    // Emit event for correct project - should be handled
    emit("kernel_events", {
      projectRoot: "/path/to/project-a",
      events: [
        {
          timestamp: "2024-01-01T00:00:01Z",
          type: "test",
          issueId: null,
          workcellId: null,
          data: null,
        },
      ],
      offset: 200,
    });

    expect(onEvents).toHaveBeenCalledTimes(1);
  });

  it("should not call onEvents for empty event arrays", async () => {
    const { listenMock, emit } = mockTauriEvent();
    mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    renderHook(() => useKernelEventStream("/path/to/project", onEvents));

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    emit("kernel_events", {
      projectRoot: "/path/to/project",
      events: [],
      offset: 0,
    });

    expect(onEvents).not.toHaveBeenCalled();
  });

  it("should stop event watcher on unmount", async () => {
    const { listenMock } = mockTauriEvent();
    const invokeMock = mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    const { unmount } = renderHook(() => useKernelEventStream("/path/to/project", onEvents));

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("stop_event_watcher", {
        params: { projectRoot: "/path/to/project" },
      });
    });
  });

  it("should restart watcher when projectRoot changes", async () => {
    const { listenMock: _listenMock } = mockTauriEvent();
    const invokeMock = mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    const { rerender } = renderHook(
      ({ projectRoot }) => useKernelEventStream(projectRoot, onEvents),
      { initialProps: { projectRoot: "/path/to/project-a" } }
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("start_event_watcher", {
        params: {
          projectRoot: "/path/to/project-a",
          lastOffset: 0,
        },
      });
    });

    // Change project
    rerender({ projectRoot: "/path/to/project-b" });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("stop_event_watcher", {
        params: { projectRoot: "/path/to/project-a" },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("start_event_watcher", {
        params: {
          projectRoot: "/path/to/project-b",
          lastOffset: 0,
        },
      });
    });
  });

  it("should return current offset", async () => {
    const { listenMock: _listenMock, emit: _emit } = mockTauriEvent();
    mockTauriInvoke({
      start_event_watcher: undefined,
      stop_event_watcher: undefined,
    });
    const onEvents = vi.fn();

    const { result } = renderHook(() => useKernelEventStream("/path/to/project", onEvents));

    // Initially offset should be 0
    expect(result.current).toBe(0);

    await waitFor(() => {
      expect(_listenMock).toHaveBeenCalled();
    });

    // Note: The offset is stored in a ref and returned directly,
    // so it won't trigger a re-render when updated.
    // The returned value reflects the offset at render time.
  });
});

describe("useEventStreamCallback", () => {
  it("should return stable callback reference", () => {
    const callback = vi.fn();

    const { result, rerender } = renderHook(() => useEventStreamCallback(callback));

    const firstRef = result.current;

    rerender();

    expect(result.current).toBe(firstRef);
  });

  it("should call the latest callback when invoked", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { result, rerender } = renderHook(({ cb }) => useEventStreamCallback(cb), {
      initialProps: { cb: callback1 },
    });

    const stableCallback = result.current;

    // Update to new callback
    rerender({ cb: callback2 });

    // The stable reference should still be the same
    expect(result.current).toBe(stableCallback);

    // But when invoked, it should call the new callback
    const testEvents: KernelEvent[] = [
      {
        timestamp: "2024-01-01T00:00:00Z",
        type: "test",
        issueId: null,
        workcellId: null,
        data: null,
      },
    ];

    act(() => {
      stableCallback(testEvents);
    });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledWith(testEvents);
  });
});
