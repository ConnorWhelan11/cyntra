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
import { WorldPreview } from "./WorldPreview";
import { RefinementInput } from "./RefinementInput";
import { RefinementQueue } from "./RefinementQueue";
import { ProcessTransparencyPanel } from "./components/ProcessTransparencyPanel";
import { ProgressivePreview } from "./components/ProgressivePreview";

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
  /** Run playtest (NitroGen-based gameplay testing) */
  onRunPlaytest?: () => void;
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
  onRunPlaytest,
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
    previewUrls,
    refinements,
    error,
    playtestStatus,
    playtestMetrics,
    playtestFailures,
    playtestWarnings,
    playtestError,
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
              {onRunPlaytest && playtestStatus !== 'running' && playtestStatus !== 'passed' && (
                <button
                  className="building-console-btn building-console-btn--accent"
                  onClick={onRunPlaytest}
                  title="Run automated gameplay test with NitroGen"
                >
                  Run Playtest
                </button>
              )}
              {playtestStatus === 'running' && (
                <span className="building-console-playtest-running">
                  Testing...
                </span>
              )}
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

      {/* Playtest results */}
      {(playtestStatus === 'passed' || playtestStatus === 'failed') && (
        <div
          className={`building-console-playtest-result ${
            playtestStatus === 'passed' ? 'playtest-passed' : 'playtest-failed'
          }`}
        >
          <div className="playtest-result-header">
            <span className="playtest-result-badge" data-status={playtestStatus}>
              {playtestStatus === 'passed' ? 'Playtest Passed' : 'Playtest Failed'}
            </span>
            {playtestMetrics && (
              <div className="playtest-result-metrics">
                <span className="playtest-metric">
                  Movement: <strong>{((1 - playtestMetrics.stuckRatio) * 100).toFixed(0)}%</strong>
                </span>
                <span className="playtest-metric">
                  Coverage: <strong>{(playtestMetrics.coverageEstimate * 100).toFixed(0)}%</strong>
                </span>
                <span className="playtest-metric">
                  Playtime: <strong>{playtestMetrics.totalPlaytimeSeconds.toFixed(0)}s</strong>
                </span>
              </div>
            )}
          </div>
          {playtestFailures && playtestFailures.length > 0 && (
            <div className="playtest-failures">
              {playtestFailures.map((failure, i) => (
                <span key={i} className="playtest-failure-item">{failure}</span>
              ))}
            </div>
          )}
          {playtestWarnings && playtestWarnings.length > 0 && (
            <div className="playtest-warnings">
              {playtestWarnings.map((warning, i) => (
                <span key={i} className="playtest-warning-item">{warning}</span>
              ))}
            </div>
          )}
          {playtestError && (
            <div className="playtest-error">{playtestError}</div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="building-console-main">
        {/* Left: Process Transparency */}
        <div className="building-console-agents">
          <ProcessTransparencyPanel
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
            {previewMode === "asset" ? (
              <ProgressivePreview
                stages={{
                  concept: previewUrls?.concept,
                  geometry: previewUrls?.geometry,
                  textured: previewUrls?.textured,
                  final: previewUrls?.final || previewGlbUrl,
                }}
                currentStage={currentStage}
              />
            ) : (
              <WorldPreview
                mode="game"
                godotUrl={previewGodotUrl}
              />
            )}
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
