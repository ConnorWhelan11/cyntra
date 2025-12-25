import { memo, useCallback } from "react";
import type { GameStatus, StageWorld } from "@/types/ui";

interface StageControlsProps {
  selectedWorld: StageWorld | null;
  status: GameStatus;
  onPlay: () => void;
  onStop: () => void;
  onRestart: () => void;
  showGameplay?: boolean;
  onToggleGameplay?: () => void;
}

/**
 * StageControls - Play/Stop/Restart controls for game
 */
export const StageControls = memo(function StageControls({
  selectedWorld,
  status,
  onPlay,
  onStop,
  onRestart,
  showGameplay = false,
  onToggleGameplay,
}: StageControlsProps) {
  const handleFullscreen = useCallback(() => {
    // Find the iframe in the DOM and request fullscreen
    const iframe = document.querySelector(".game-frame-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.requestFullscreen?.().catch(() => {
        // Fullscreen not supported or denied
      });
    }
  }, []);

  const isPlaying = status === "running" || status === "loading";
  const canPlay = selectedWorld?.hasGameBuild && status === "idle";
  const canStop = isPlaying;
  const canRestart = isPlaying;
  const canFullscreen = status === "running";

  return (
    <div className="stage-controls">
      <div className="stage-controls-primary">
        {!isPlaying ? (
          <button
            className="stage-control-btn play"
            onClick={onPlay}
            disabled={!canPlay}
            title={canPlay ? "Play game" : "Select a world with a build"}
          >
            <span className="stage-control-icon">▶</span>
            <span className="stage-control-label">Play</span>
          </button>
        ) : (
          <button
            className="stage-control-btn stop"
            onClick={onStop}
            disabled={!canStop}
            title="Stop game"
          >
            <span className="stage-control-icon">■</span>
            <span className="stage-control-label">Stop</span>
          </button>
        )}

        <button
          className="stage-control-btn restart"
          onClick={onRestart}
          disabled={!canRestart}
          title="Restart game"
        >
          <span className="stage-control-icon">↻</span>
        </button>

        <button
          className="stage-control-btn fullscreen"
          onClick={handleFullscreen}
          disabled={!canFullscreen}
          title="Fullscreen"
        >
          <span className="stage-control-icon">⛶</span>
        </button>

        {onToggleGameplay && (
          <button
            className={`stage-control-btn gameplay ${showGameplay ? "active" : ""}`}
            onClick={onToggleGameplay}
            title={showGameplay ? "Hide Gameplay" : "Show Gameplay"}
          >
            <span className="stage-control-icon">◇</span>
          </button>
        )}
      </div>

      <div className="stage-controls-status">
        {status === "loading" && (
          <span className="stage-status loading">Loading...</span>
        )}
        {status === "running" && (
          <span className="stage-status running">Running</span>
        )}
        {status === "error" && (
          <span className="stage-status error">Error</span>
        )}
        {status === "idle" && selectedWorld && (
          <span className="stage-status idle">
            {selectedWorld.hasGameBuild ? "Ready" : "No build"}
          </span>
        )}
      </div>
    </div>
  );
});

export default StageControls;
