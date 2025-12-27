import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Hook for listening to Tauri events
 * @param eventName - Name of the Tauri event
 * @param handler - Event handler function
 */
export function useTauriEvent<T>(eventName: string, handler: (payload: T) => void): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const nextUnlisten = await listen<T>(eventName, (event) => {
        handler(event.payload);
      });
      if (cancelled) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    })();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [eventName, handler]);
}
