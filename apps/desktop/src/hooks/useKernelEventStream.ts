import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { KernelEvent } from "../types/kernel";

interface KernelEventsPayload {
  projectRoot: string;
  events: KernelEvent[];
  offset: number;
}

/**
 * Hook for streaming real-time kernel events via file watching.
 *
 * This hook establishes a file watcher on `.cyntra/logs/events.jsonl` and
 * streams new events as they are appended. Much faster than polling (~100ms latency).
 *
 * @param projectRoot - The project root path, or null to disable
 * @param onEvents - Callback invoked with new events when they arrive
 * @returns Current byte offset in the events file (for resumption)
 */
export function useKernelEventStream(
  projectRoot: string | null,
  onEvents: (events: KernelEvent[]) => void
): number {
  const offsetRef = useRef<number>(0);
  const onEventsRef = useRef(onEvents);

  // Keep callback ref updated
  onEventsRef.current = onEvents;

  useEffect(() => {
    if (!projectRoot) return;

    // New project = reset offset so we don't skip early bytes on the new file.
    offsetRef.current = 0;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      // Listen for kernel_events from the backend
      const nextUnlisten = await listen<KernelEventsPayload>("kernel_events", (event) => {
        if (event.payload.projectRoot === projectRoot) {
          offsetRef.current = event.payload.offset;
          if (event.payload.events.length > 0) {
            onEventsRef.current(event.payload.events);
          }
        }
      });

      if (cancelled) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;

      // Start the event watcher with current offset
      try {
        await invoke("start_event_watcher", {
          params: {
            projectRoot,
            lastOffset: offsetRef.current,
          },
        });
      } catch (err) {
        console.error("Failed to start event watcher:", err);
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }

      // Stop the event watcher
      invoke("stop_event_watcher", {
        params: { projectRoot },
      }).catch((err: unknown) => {
        console.error("Failed to stop event watcher:", err);
      });
    };
  }, [projectRoot]);

  return offsetRef.current;
}

/**
 * Stable callback wrapper for use with useKernelEventStream.
 * Prevents the hook from restarting on every render.
 */
export function useEventStreamCallback(
  callback: (events: KernelEvent[]) => void
): (events: KernelEvent[]) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((events: KernelEvent[]) => {
    callbackRef.current(events);
  }, []);
}
