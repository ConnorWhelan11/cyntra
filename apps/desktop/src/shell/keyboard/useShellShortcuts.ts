/**
 * useShellShortcuts - Global keyboard shortcuts for shell navigation
 */
import { useEffect, useCallback } from "react";

export interface ShellShortcutHandlers {
  onNewSession?: () => void;
  onOpenPalette?: () => void;
  onSelectSessionByIndex?: (index: number) => void;
  onNextApp?: () => void;
  onPrevApp?: () => void;
}

export function useShellShortcuts(handlers: ShellShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture if typing in input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Cmd+N: New session
      if (isMeta && key === "n") {
        e.preventDefault();
        handlers.onNewSession?.();
        return;
      }

      // Cmd+K: Open command palette
      if (isMeta && key === "k") {
        e.preventDefault();
        handlers.onOpenPalette?.();
        return;
      }

      // Cmd+1-9: Select session by index
      if (isMeta && key >= "1" && key <= "9") {
        e.preventDefault();
        const index = parseInt(key, 10) - 1;
        handlers.onSelectSessionByIndex?.(index);
        return;
      }

      // Cmd+[: Previous app
      if (isMeta && key === "[") {
        e.preventDefault();
        handlers.onPrevApp?.();
        return;
      }

      // Cmd+]: Next app
      if (isMeta && key === "]") {
        e.preventDefault();
        handlers.onNextApp?.();
        return;
      }
    },
    [handlers]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
