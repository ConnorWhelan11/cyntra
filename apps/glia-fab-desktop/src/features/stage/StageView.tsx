import { useEffect, useCallback, useState, useRef } from "react";
import type { ProjectInfo, ServerInfo, Nav, RuntimeState } from "@/types";
import { useStageState } from "./useStageState";
import {
  StageLayout,
  WorldSelector,
  GameFrame,
  GameConsole,
  StageControls,
} from "./components";
import { GameplayOverlay } from "./GameplayOverlay";
import { getRuntimeService } from "@/services/runtimeService";

interface StageViewProps {
  activeProject: ProjectInfo | null;
  serverInfo?: ServerInfo | null;
  onNavigate?: (nav: Nav) => void;
  initialWorldId?: string | null;
  onWorldSelected?: (worldId: string | null) => void;
}

/**
 * StageView - Game playtest and preview
 *
 * Provides a unified interface for:
 * - Selecting worlds with Godot runtime
 * - Playing Godot Web exports in an iframe
 * - Viewing console output from games
 */
export function StageView({
  activeProject,
  serverInfo,
  onNavigate,
  initialWorldId,
  onWorldSelected,
}: StageViewProps) {
  const baseUrl = serverInfo?.base_url;
  const state = useStageState(baseUrl);
  const [showGameplayOverlay, setShowGameplayOverlay] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [isRuntimeConnected, setIsRuntimeConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const toggleGameplayOverlay = useCallback(() => {
    setShowGameplayOverlay((prev) => !prev);
  }, []);

  const handleNavigateToGameplay = useCallback(() => {
    if (onNavigate) {
      onNavigate("gameplay");
    }
  }, [onNavigate]);

  // Keep selected world in sync with App-level selection
  useEffect(() => {
    onWorldSelected?.(state.selectedWorldId);
  }, [state.selectedWorldId, onWorldSelected]);

  useEffect(() => {
    if (!initialWorldId) return;
    if (state.selectedWorldId === initialWorldId) return;
    if (!state.worlds.some((w) => w.id === initialWorldId)) return;
    state.selectWorld(initialWorldId);
  }, [initialWorldId, state.selectedWorldId, state.worlds, state.selectWorld]);

  // Runtime connection (iframe messaging) while the game is running
  useEffect(() => {
    let cancelled = false;

    const disconnect = () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      getRuntimeService().disconnect();
      setIsRuntimeConnected(false);
      setRuntimeState(null);
    };

    if (state.gameStatus !== "running") {
      disconnect();
      return;
    }

    (async () => {
      try {
        const service = getRuntimeService({ method: "iframe" });
        await service.connect();
        if (cancelled) return;
        setIsRuntimeConnected(true);
        unsubscribeRef.current?.();
        unsubscribeRef.current = service.onStateUpdate((next) => setRuntimeState(next));
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to connect to runtime:", e);
        disconnect();
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [state.gameStatus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "Escape":
          if (state.gameStatus === "running" || state.gameStatus === "loading") {
            state.stop();
          }
          break;
        case "Enter":
          if (state.gameStatus === "idle" && state.selectedWorld?.hasGameBuild) {
            state.play();
          }
          break;
        case "r":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (state.gameStatus === "running") {
              state.restart();
            }
          }
          break;
        case "f":
          if (state.gameStatus === "running") {
            const iframe = document.querySelector(".game-frame-iframe") as HTMLIFrameElement;
            iframe?.requestFullscreen?.();
          }
          break;
        case "`":
          state.toggleConsole();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  // Handle iframe load
  const handleGameLoad = useCallback(() => {
    state.setGameStatus("running");
    state.addLog("info", "Game loaded successfully");
  }, [state]);

  // Handle iframe error
  const handleGameError = useCallback(
    (message: string) => {
      state.setError(message);
      state.addLog("error", message);
    },
    [state]
  );

  // Handle messages from iframe
  const handleGameMessage = useCallback(
    (data: unknown) => {
      if (!data || typeof data !== "object") return;

      const msg = data as Record<string, unknown>;

      // Handle console messages from Godot
      if (msg.type === "console" && typeof msg.level === "string" && typeof msg.message === "string") {
        const level = msg.level as "info" | "warn" | "error" | "debug";
        state.addLog(level, msg.message, msg.source as string | undefined);
      }

      // Handle ready message
      if (msg.type === "ready") {
        state.addLog("info", "Godot runtime ready");
      }
    },
    [state]
  );

  // Add initial log when world is selected
  useEffect(() => {
    if (state.selectedWorld) {
      state.addLog(
        "info",
        `Selected world: ${state.selectedWorld.name}`,
        "stage"
      );
    }
  }, [state.selectedWorldId]);

  return (
    <div className="stage-view">
      <StageLayout
        consoleOpen={state.consoleOpen}
        sidebar={
          <div className="stage-sidebar">
            <WorldSelector
              worlds={state.worlds}
              selectedWorldId={state.selectedWorldId}
              onSelect={state.selectWorld}
            />
            <StageControls
              selectedWorld={state.selectedWorld}
              status={state.gameStatus}
              onPlay={state.play}
              onStop={state.stop}
              onRestart={state.restart}
              showGameplay={showGameplayOverlay}
              onToggleGameplay={toggleGameplayOverlay}
            />
          </div>
        }
        gameFrame={
          <GameFrame
            gameUrl={state.fullGameUrl}
            status={state.gameStatus}
            error={state.errorMessage}
            restartKey={state.restartKey}
            onLoad={handleGameLoad}
            onError={handleGameError}
            onMessage={handleGameMessage}
          />
        }
        console={
          <GameConsole
            logs={state.filteredLogs}
            filter={state.consoleFilter}
            isOpen={state.consoleOpen}
            onToggle={state.toggleConsole}
            onClear={state.clearLogs}
            onFilterChange={state.setConsoleFilter}
          />
        }
        rightPanel={
          showGameplayOverlay ? (
            <GameplayOverlay
              worldPath={
                activeProject?.root && state.selectedWorld
                  ? `${activeProject.root}/fab/worlds/${state.selectedWorld.id}`
                  : null
              }
              isOpen={showGameplayOverlay}
              onClose={toggleGameplayOverlay}
              runtimeState={runtimeState ?? undefined}
              runtimeConnected={isRuntimeConnected}
              onNavigateToGameplay={handleNavigateToGameplay}
            />
          ) : null
        }
      />
    </div>
  );
}

export default StageView;
