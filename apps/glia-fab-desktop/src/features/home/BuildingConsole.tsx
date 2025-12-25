/**
 * BuildingConsole - Supervised Autonomy Console for World Generation
 *
 * Shows multi-agent progress, live preview, and refinement input
 * during active world builds.
 */

import React, { useCallback, useMemo } from "react";
import type {
  WorldBuildState,
  PreviewMode,
} from "@/types";
import { AgentPanel } from "./AgentPanel";
import { WorldPreview } from "./WorldPreview";
import { RefinementInput } from "./RefinementInput";
import { RefinementQueue } from "./RefinementQueue";

interface BuildingConsoleProps {
  /** Active build state */
  buildState: WorldBuildState;
  /** Current preview mode */
  previewMode: PreviewMode;
  /** Toggle preview mode */
  onPreviewModeChange: (mode: PreviewMode) => void;
  /** Stop the build and return to builder */
  onCancel: () => void;
  /** Return to builder without changing build status */
  onDismiss: () => void;
  /** Pause the build */
  onPause: () => void;
  /** Resume a paused build */
  onResume: () => void;
  /** Retry a failed build */
  onRetry: () => void;
  /** Navigate to the world in Evolution */
  onViewInEvolution: () => void;
  /** Queue a refinement */
  onQueueRefinement: (text: string) => void;
  /** Apply refinement immediately */
  onApplyRefinementNow: (refinementId: string) => void;
}

/** Status to display text mapping */
const STATUS_TEXT: Record<string, string> = {
  queued: "Queued",
  scheduling: "Scheduling...",
  generating: "Generating scene...",
  rendering: "Rendering preview...",
  critiquing: "Running critics...",
  repairing: "Repairing issues...",
  exporting: "Exporting to Godot...",
  voting: "Selecting best candidate...",
  complete: "Complete!",
  failed: "Failed",
  paused: "Paused",
};

export function BuildingConsole({
  buildState,
  previewMode,
  onPreviewModeChange,
  onCancel,
  onDismiss,
  onPause,
  onResume,
  onRetry,
  onViewInEvolution,
  onQueueRefinement,
  onApplyRefinementNow,
}: BuildingConsoleProps) {
  const {
    status,
    prompt,
    isSpeculating,
    agents,
    leadingAgentId,
    winnerAgentId,
    generation,
    bestFitness,
    currentStage,
    previewGlbUrl,
    previewGodotUrl,
    refinements,
    error,
  } = buildState;

  // Determine if Godot preview is available
  const hasGodotPreview = Boolean(previewGodotUrl);

  // Get leading agent
  const leadingAgent = useMemo(() => {
    if (winnerAgentId) {
      return agents.find((a) => a.id === winnerAgentId);
    }
    if (leadingAgentId) {
      return agents.find((a) => a.id === leadingAgentId);
    }
    return agents[0];
  }, [agents, leadingAgentId, winnerAgentId]);

  const leadingLabel = useMemo(() => {
    if (!leadingAgent) return null;
    const toolchain =
      leadingAgent.toolchain.length > 0
        ? leadingAgent.toolchain[0].toUpperCase() + leadingAgent.toolchain.slice(1)
        : "Agent";
    return `${toolchain} (${leadingAgent.fitness.toFixed(2)})`;
  }, [leadingAgent]);

  // Handle refinement submit
  const handleRefinementSubmit = useCallback(
    (text: string) => {
      onQueueRefinement(text);
    },
    [onQueueRefinement]
  );

  const isComplete = status === "complete";
  const isFailed = status === "failed";
  const isPaused = status === "paused";
  const isActive = !isComplete && !isFailed && !isPaused;

  return (
    <div className="building-console" data-status={status}>
      {/* Header */}
      <header className="building-console-header">
        <div className="building-console-title">
          <span className="building-console-status-dot" data-status={status} />
          <span className="building-console-status-text">
            {STATUS_TEXT[status] ?? status}
          </span>
          {leadingLabel && (
            <span className="building-console-leading" title={winnerAgentId ? "Winner" : "Leading candidate"}>
              {winnerAgentId ? "Winner" : "Leading"}: {leadingLabel}
            </span>
          )}
        </div>
        <p className="building-console-prompt" title={prompt}>
          {prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt}
        </p>
        <div className="building-console-actions">
          {isActive && (
            <>
              <button
                className="building-console-btn building-console-btn--secondary"
                onClick={onPause}
              >
                Pause
              </button>
              <button
                className="building-console-btn building-console-btn--danger"
                onClick={onCancel}
              >
                Stop build
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button
                className="building-console-btn building-console-btn--primary"
                onClick={onResume}
                title="Restarts the build"
              >
                Resume
              </button>
              <button
                className="building-console-btn building-console-btn--secondary"
                onClick={onCancel}
              >
                Back
              </button>
            </>
          )}
          {isComplete && (
            <>
              <button
                className="building-console-btn building-console-btn--primary"
                onClick={onViewInEvolution}
              >
                View in Evolution
              </button>
              <button
                className="building-console-btn building-console-btn--secondary"
                onClick={onDismiss}
              >
                Build another
              </button>
            </>
          )}
          {isFailed && (
            <>
              <button
                className="building-console-btn building-console-btn--primary"
                onClick={onRetry}
              >
                Retry
              </button>
              <button
                className="building-console-btn building-console-btn--secondary"
                onClick={onDismiss}
              >
                Back
              </button>
            </>
          )}
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="building-console-error">
          <span className="building-console-error-icon">!</span>
          <span className="building-console-error-text">{error}</span>
        </div>
      )}

      {/* Main content */}
      <div className="building-console-main">
        {/* Left: Agent Panel */}
        <div className="building-console-agents">
          <AgentPanel
            agents={agents}
            leadingAgentId={leadingAgentId}
            winnerAgentId={winnerAgentId}
            isSpeculating={isSpeculating}
          />
        </div>

        {/* Right: Preview + Refinements */}
        <div className="building-console-preview-area">
          {/* Preview */}
          <div className="building-console-preview">
            <div className="building-console-preview-header">
              <span className="building-console-preview-label">Preview</span>
              <div className="building-console-preview-toggle">
                <button
                  className={`building-console-preview-toggle-btn ${
                    previewMode === "asset" ? "active" : ""
                  }`}
                  onClick={() => onPreviewModeChange("asset")}
                >
                  Asset
                </button>
                <button
                  className={`building-console-preview-toggle-btn ${
                    previewMode === "game" ? "active" : ""
                  }`}
                  onClick={() => onPreviewModeChange("game")}
                  disabled={!hasGodotPreview}
                  title={
                    hasGodotPreview
                      ? "View in Godot"
                      : "Godot export not yet available"
                  }
                >
                  Game
                </button>
              </div>
            </div>
            <WorldPreview
              mode={previewMode}
              glbUrl={previewGlbUrl}
              godotUrl={previewGodotUrl}
            />
            <div className="building-console-preview-stats">
              <span className="building-console-stat">
                Gen: <strong>{generation}</strong>
              </span>
              <span className="building-console-stat">
                Fitness: <strong>{bestFitness.toFixed(2)}</strong>
              </span>
              {currentStage && (
                <span className="building-console-stat">
                  Stage: <strong>{currentStage}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Refinement Queue */}
          {refinements.length > 0 && (
            <RefinementQueue
              refinements={refinements}
              onApplyNow={onApplyRefinementNow}
            />
          )}
        </div>
      </div>

      {/* Footer: Refinement Input */}
      {isActive && (
        <footer className="building-console-footer">
          <RefinementInput onSubmit={handleRefinementSubmit} />
        </footer>
      )}
    </div>
  );
}

export default BuildingConsole;
