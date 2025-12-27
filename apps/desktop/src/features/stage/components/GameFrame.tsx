import { memo, useRef, useEffect, useCallback } from "react";
import type { GameStatus } from "@/types/ui";

interface GameFrameProps {
  gameUrl: string | null;
  status: GameStatus;
  error: string | null;
  restartKey: number;
  onLoad: () => void;
  onError: (message: string) => void;
  onMessage: (data: unknown) => void;
}

/**
 * GameFrame - Iframe wrapper for Godot Web exports
 */
export const GameFrame = memo(function GameFrame({
  gameUrl,
  status,
  error,
  restartKey,
  onLoad,
  onError,
  onMessage,
}: GameFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (iframeRef.current?.contentWindow !== event.source) return;
      onMessage(event.data);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage]);

  const handleIframeLoad = useCallback(() => {
    onLoad();
  }, [onLoad]);

  const handleIframeError = useCallback(() => {
    onError("Failed to load game. Check that the build exists.");
  }, [onError]);

  // Idle state - no world selected
  if (!gameUrl && status === "idle") {
    return (
      <div className="game-frame game-frame-empty">
        <div className="game-frame-placeholder">
          <div className="game-frame-placeholder-icon">🎮</div>
          <div className="game-frame-placeholder-text">Select a world to playtest</div>
          <div className="game-frame-placeholder-hint">
            Choose a world with a Godot build from the sidebar
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === "error" && error) {
    return (
      <div className="game-frame game-frame-error">
        <div className="game-frame-error-content">
          <div className="game-frame-error-icon">⚠</div>
          <div className="game-frame-error-message">{error}</div>
          <div className="game-frame-error-hint">
            Try rebuilding the world or check the console for details.
          </div>
        </div>
      </div>
    );
  }

  // Ready but not playing
  if (status === "idle" && gameUrl) {
    return (
      <div className="game-frame game-frame-ready">
        <div className="game-frame-placeholder">
          <div className="game-frame-placeholder-icon">▶</div>
          <div className="game-frame-placeholder-text">Ready to play</div>
          <div className="game-frame-placeholder-hint">Click Play to start the game</div>
        </div>
      </div>
    );
  }

  // Loading or running
  return (
    <div className="game-frame game-frame-active">
      {status === "loading" && (
        <div className="game-frame-loading">
          <div className="game-frame-spinner" />
          <div className="game-frame-loading-text">Loading game...</div>
        </div>
      )}
      {gameUrl && (status === "loading" || status === "running") && (
        <iframe
          ref={iframeRef}
          key={`${gameUrl}-${restartKey}`}
          className="game-frame-iframe"
          src={gameUrl}
          title="Godot Game"
          allow="fullscreen; gamepad; autoplay"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      )}
    </div>
  );
});

export default GameFrame;
