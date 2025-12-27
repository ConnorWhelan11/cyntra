import React from "react";
import { useGameplay } from "@/context/GameplayContext";
import { SigilIcon } from "@/components/shared/SigilIcon";

interface GameplaySidebarPanelProps {
  onOpenEditor?: () => void;
  onValidate?: () => void;
  worldPath?: string;
}

/**
 * GameplaySidebarPanel - Quick overview panel for gameplay config
 *
 * Shows:
 * - Entity counts (NPCs, items)
 * - Trigger/objective counts
 * - Validation status
 * - Quick actions
 */
export function GameplaySidebarPanel({
  onOpenEditor,
  onValidate,
  worldPath,
}: GameplaySidebarPanelProps) {
  const {
    state,
    entityCount,
    npcCount,
    itemCount,
    triggerCount,
    objectiveCount,
    interactionCount,
    audioZoneCount,
    isValid: _isValid,
    loadConfig,
    validate,
  } = useGameplay();

  const { config, validationReport, isLoading, isValidating, isDirty } = state;

  // Calculate completed objectives for progress
  const completedObjectives = state.runtimeState?.objective_states
    ? Object.values(state.runtimeState.objective_states).filter((s) => s === "completed").length
    : 0;

  const handleValidate = async () => {
    if (onValidate) {
      onValidate();
    } else {
      await validate();
    }
  };

  const handleOpenEditor = () => {
    if (onOpenEditor) {
      onOpenEditor();
    }
  };

  // Load config when worldPath changes
  React.useEffect(() => {
    if (worldPath && !config) {
      loadConfig(worldPath);
    }
  }, [worldPath, config, loadConfig]);

  if (!config && !isLoading) {
    return (
      <div className="gameplay-sidebar-panel gameplay-sidebar-panel--empty">
        <div className="gameplay-sidebar-header">
          <SigilIcon name="gameplay" size={18} />
          <span>Gameplay</span>
        </div>
        <div className="gameplay-sidebar-empty">
          <p>No gameplay config loaded</p>
          {worldPath && (
            <button
              className="gameplay-btn gameplay-btn--secondary"
              onClick={() => loadConfig(worldPath)}
            >
              Load Config
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`gameplay-sidebar-panel ${isDirty ? "gameplay-sidebar-panel--dirty" : ""}`}>
      <div className="gameplay-sidebar-header">
        <SigilIcon name="gameplay" size={18} />
        <span>{config?.world_id || "Gameplay"}</span>
        {isDirty && <span className="gameplay-dirty-indicator" title="Unsaved changes" />}
      </div>

      {isLoading ? (
        <div className="gameplay-sidebar-loading">Loading...</div>
      ) : (
        <>
          {/* Stats Section */}
          <div className="gameplay-sidebar-stats">
            <div className="gameplay-stat">
              <span className="gameplay-stat-label">Entities</span>
              <span className="gameplay-stat-value">{entityCount}</span>
            </div>
            <div className="gameplay-stat gameplay-stat--indent">
              <span className="gameplay-stat-label">NPCs</span>
              <span className="gameplay-stat-value">{npcCount}</span>
            </div>
            <div className="gameplay-stat gameplay-stat--indent">
              <span className="gameplay-stat-label">Items</span>
              <span className="gameplay-stat-value">{itemCount}</span>
            </div>
            <div className="gameplay-stat">
              <span className="gameplay-stat-label">Triggers</span>
              <span className="gameplay-stat-value">{triggerCount}</span>
            </div>
            <div className="gameplay-stat">
              <span className="gameplay-stat-label">Interactions</span>
              <span className="gameplay-stat-value">{interactionCount}</span>
            </div>
            <div className="gameplay-stat">
              <span className="gameplay-stat-label">Objectives</span>
              <span className="gameplay-stat-value">
                {objectiveCount}
                {state.runtimeState && (
                  <span className="gameplay-progress">
                    {" "}
                    ({completedObjectives}/{objectiveCount})
                  </span>
                )}
              </span>
            </div>
            <div className="gameplay-stat">
              <span className="gameplay-stat-label">Audio Zones</span>
              <span className="gameplay-stat-value">{audioZoneCount}</span>
            </div>
          </div>

          {/* Validation Section */}
          <div className="gameplay-sidebar-validation">
            <div className="gameplay-validation-header">Validation</div>
            {validationReport ? (
              <div className="gameplay-validation-status">
                {validationReport.valid ? (
                  <div className="gameplay-status gameplay-status--valid">
                    <span className="gameplay-status-icon">✓</span>
                    <span>All markers matched</span>
                  </div>
                ) : (
                  <div className="gameplay-status gameplay-status--invalid">
                    <span className="gameplay-status-icon">✗</span>
                    <span>{validationReport.missing_markers.length} missing markers</span>
                  </div>
                )}
                {validationReport.warnings.length > 0 && (
                  <div className="gameplay-status gameplay-status--warning">
                    <span className="gameplay-status-icon">⚠</span>
                    <span>{validationReport.warnings.length} warnings</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="gameplay-validation-status gameplay-status--unknown">
                <span>Not validated</span>
              </div>
            )}
          </div>

          {/* Actions Section */}
          <div className="gameplay-sidebar-actions">
            <button className="gameplay-btn gameplay-btn--primary" onClick={handleOpenEditor}>
              Open Editor
            </button>
            <button
              className="gameplay-btn gameplay-btn--secondary"
              onClick={handleValidate}
              disabled={isValidating}
            >
              {isValidating ? "Validating..." : "Validate"}
            </button>
          </div>
        </>
      )}

      <style>{`
        .gameplay-sidebar-panel {
          padding: 12px;
          border-radius: 8px;
          background: var(--surface-secondary, rgba(255, 255, 255, 0.03));
          border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        }

        .gameplay-sidebar-panel--dirty {
          border-color: var(--signal-warning, #f0a000);
        }

        .gameplay-sidebar-panel--empty {
          opacity: 0.7;
        }

        .gameplay-sidebar-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #fff);
          margin-bottom: 12px;
        }

        .gameplay-dirty-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--signal-warning, #f0a000);
          margin-left: auto;
        }

        .gameplay-sidebar-empty {
          font-size: 12px;
          color: var(--text-secondary, #888);
          text-align: center;
          padding: 16px 0;
        }

        .gameplay-sidebar-loading {
          font-size: 12px;
          color: var(--text-secondary, #888);
          text-align: center;
          padding: 24px 0;
        }

        .gameplay-sidebar-stats {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        }

        .gameplay-stat {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }

        .gameplay-stat--indent {
          padding-left: 12px;
          opacity: 0.7;
        }

        .gameplay-stat-label {
          color: var(--text-secondary, #888);
        }

        .gameplay-stat-value {
          color: var(--text-primary, #fff);
          font-variant-numeric: tabular-nums;
        }

        .gameplay-progress {
          color: var(--text-tertiary, #666);
          font-size: 11px;
        }

        .gameplay-sidebar-validation {
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        }

        .gameplay-validation-header {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary, #666);
          margin-bottom: 8px;
        }

        .gameplay-validation-status {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .gameplay-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }

        .gameplay-status--valid {
          color: var(--signal-success, #4ade80);
        }

        .gameplay-status--invalid {
          color: var(--signal-error, #f87171);
        }

        .gameplay-status--warning {
          color: var(--signal-warning, #fbbf24);
        }

        .gameplay-status--unknown {
          color: var(--text-secondary, #888);
        }

        .gameplay-status-icon {
          font-size: 14px;
        }

        .gameplay-sidebar-actions {
          display: flex;
          gap: 8px;
        }

        .gameplay-btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .gameplay-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .gameplay-btn--primary {
          background: var(--accent-primary, #6366f1);
          color: white;
        }

        .gameplay-btn--primary:hover:not(:disabled) {
          background: var(--accent-primary-hover, #4f46e5);
        }

        .gameplay-btn--secondary {
          background: var(--surface-tertiary, rgba(255, 255, 255, 0.06));
          color: var(--text-primary, #fff);
          border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
        }

        .gameplay-btn--secondary:hover:not(:disabled) {
          background: var(--surface-hover, rgba(255, 255, 255, 0.1));
        }
      `}</style>
    </div>
  );
}

export default GameplaySidebarPanel;
