import React, { useState, useEffect } from "react";
import type {
  GameplayConfig,
  ValidationReport,
  RuntimeState,
  ObjectiveStatus,
  ObjectiveConfig,
  EntityConfig,
} from "@/types";
import { loadGameplay, validateGameplay } from "@/services/gameplayService";

interface GameplayOverlayProps {
  worldPath: string | null;
  isOpen: boolean;
  onClose: () => void;
  runtimeState?: RuntimeState;
  runtimeConnected?: boolean;
  onNavigateToGameplay?: () => void;
}

/**
 * GameplayOverlay - Side panel showing gameplay info in Stage View
 *
 * Features:
 * - Objectives progress tracker
 * - Active flags display
 * - Validation status
 * - Quick navigation to Gameplay editor
 */
export function GameplayOverlay({
  worldPath,
  isOpen,
  onClose,
  runtimeState,
  runtimeConnected = false,
  onNavigateToGameplay,
}: GameplayOverlayProps) {
  const [config, setConfig] = useState<GameplayConfig | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"objectives" | "flags" | "entities">(
    "objectives"
  );

  // Load gameplay config when opened
  useEffect(() => {
    if (!isOpen || !worldPath) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [configData, validationData] = await Promise.all([
          loadGameplay(worldPath),
          validateGameplay(worldPath).catch(() => null),
        ]);
        setConfig(configData as unknown as GameplayConfig);
        setValidation(validationData);
      } catch (e) {
        setError(String(e));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isOpen, worldPath]);

  if (!isOpen) return null;

  // Calculate objective stats
  const objectives = config?.objectives || [];
  const objectiveStates = runtimeState?.objective_states || {};
  const completedCount = Object.values(objectiveStates).filter((s) => s === "completed").length;
  const activeCount = Object.values(objectiveStates).filter((s) => s === "active").length;

  // Get active flags
  const flags = runtimeState?.flags || {};
  const activeFlags = Object.entries(flags).filter(([_, v]) => v);

  return (
    <div className="gameplay-overlay">
      <div className="gameplay-overlay-header">
        <div className="gameplay-overlay-header-left">
          <h3 className="gameplay-overlay-title">Gameplay</h3>
          <span
            className={`gameplay-overlay-runtime ${
              runtimeConnected ? "connected" : "disconnected"
            }`}
            title={runtimeConnected ? "Receiving live runtime state" : "No runtime connection"}
          >
            {runtimeConnected ? "● Live" : "○ Offline"}
          </span>
        </div>
        <div className="gameplay-overlay-actions">
          {onNavigateToGameplay && (
            <button
              className="gameplay-overlay-btn"
              onClick={onNavigateToGameplay}
              title="Open Gameplay Editor"
            >
              Edit
            </button>
          )}
          <button className="gameplay-overlay-close" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="gameplay-overlay-loading">Loading...</div>
      ) : error ? (
        <div className="gameplay-overlay-error">{error}</div>
      ) : !config ? (
        <div className="gameplay-overlay-empty">
          <p>No gameplay config found</p>
          {onNavigateToGameplay && (
            <button className="gameplay-overlay-btn" onClick={onNavigateToGameplay}>
              Create Config
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Section tabs */}
          <div className="gameplay-overlay-tabs">
            <button
              className={`gameplay-overlay-tab ${activeSection === "objectives" ? "active" : ""}`}
              onClick={() => setActiveSection("objectives")}
            >
              Objectives
            </button>
            <button
              className={`gameplay-overlay-tab ${activeSection === "flags" ? "active" : ""}`}
              onClick={() => setActiveSection("flags")}
            >
              Flags
            </button>
            <button
              className={`gameplay-overlay-tab ${activeSection === "entities" ? "active" : ""}`}
              onClick={() => setActiveSection("entities")}
            >
              Entities
            </button>
          </div>

          {/* Content */}
          <div className="gameplay-overlay-content">
            {activeSection === "objectives" && (
              <ObjectivesSection
                objectives={objectives}
                states={objectiveStates}
                completedCount={completedCount}
                activeCount={activeCount}
              />
            )}

            {activeSection === "flags" && <FlagsSection flags={flags} activeFlags={activeFlags} />}

            {activeSection === "entities" && (
              <EntitiesSection config={config} validation={validation} />
            )}
          </div>

          {/* Validation status footer */}
          <div className="gameplay-overlay-footer">
            {validation ? (
              <div
                className={`gameplay-overlay-validation ${validation.valid ? "valid" : "invalid"}`}
              >
                {validation.valid
                  ? "✓ Valid"
                  : `⚠ ${validation.missing_markers?.length || 0} issues`}
              </div>
            ) : (
              <div className="gameplay-overlay-validation unknown">Not validated</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Sub-components

function ObjectivesSection({
  objectives,
  states,
  completedCount,
  activeCount,
}: {
  objectives: ObjectiveConfig[];
  states: Record<string, ObjectiveStatus>;
  completedCount: number;
  activeCount: number;
}) {
  const total = objectives.length;
  const progress = total > 0 ? (completedCount / total) * 100 : 0;

  const getObjectiveStatus = (id: string): ObjectiveStatus => {
    return states[id] || "locked";
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case "main":
        return "#6366f1";
      case "side":
        return "#fbbf24";
      case "discovery":
        return "#4ade80";
      case "final":
        return "#f87171";
      default:
        return "#888";
    }
  };

  return (
    <div>
      <div className="gameplay-section">
        <div className="gameplay-section-header">
          <span className="gameplay-section-title">Progress</span>
          <span className="gameplay-section-count">
            {completedCount}/{total}
          </span>
        </div>
        <div className="gameplay-progress-bar">
          <div className="gameplay-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 12 }}>
          {activeCount > 0 && <span>{activeCount} active</span>}
        </div>
      </div>

      <div className="gameplay-section">
        <div className="gameplay-section-header">
          <span className="gameplay-section-title">Objectives</span>
        </div>
        <div className="gameplay-item-list">
          {objectives.map((obj) => {
            const status = getObjectiveStatus(obj.id);
            return (
              <div key={obj.id} className="gameplay-item">
                <div className={`gameplay-item-status ${status}`} />
                <span className="gameplay-item-name">{obj.description}</span>
                <span
                  className="gameplay-item-type"
                  style={{ background: getTypeColor(obj.type), color: "#000" }}
                >
                  {obj.type}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FlagsSection({
  flags,
  activeFlags,
}: {
  flags: Record<string, boolean>;
  activeFlags: [string, boolean][];
}) {
  const allFlags = Object.entries(flags);

  return (
    <div>
      <div className="gameplay-section">
        <div className="gameplay-section-header">
          <span className="gameplay-section-title">Active Flags</span>
          <span className="gameplay-section-count">{activeFlags.length}</span>
        </div>
        {activeFlags.length > 0 ? (
          <div className="gameplay-item-list">
            {activeFlags.map(([name, _value]) => (
              <div key={name} className="gameplay-flag">
                <span className="gameplay-flag-name">{name}</span>
                <span className="gameplay-flag-value">true</span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              textAlign: "center",
              padding: 16,
            }}
          >
            No flags set
          </div>
        )}
      </div>

      {allFlags.length > activeFlags.length && (
        <div className="gameplay-section">
          <div className="gameplay-section-header">
            <span className="gameplay-section-title">All Flags</span>
            <span className="gameplay-section-count">{allFlags.length}</span>
          </div>
          <div className="gameplay-item-list">
            {allFlags.map(([name, value]) => (
              <div key={name} className="gameplay-flag">
                <span className="gameplay-flag-name">{name}</span>
                <span className={`gameplay-flag-value ${value ? "" : "false"}`}>
                  {value ? "true" : "false"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EntitiesSection({
  config,
  validation,
}: {
  config: GameplayConfig;
  validation: ValidationReport | null;
}) {
  const entities = Object.entries(config.entities || {}) as [string, EntityConfig][];
  const npcs = entities.filter(([_id, entity]) => entity.type === "npc");
  const items = entities.filter(([_id, entity]) =>
    ["key_item", "consumable", "equipment", "document"].includes(entity.type)
  );

  const getStatus = (id: string, type: string) => {
    if (!validation) return "unknown";
    const list = type === "npc" ? validation.matched_npcs : validation.matched_items;
    return list?.includes(id) ? "matched" : "missing";
  };

  return (
    <div>
      <div className="gameplay-section">
        <div className="gameplay-section-header">
          <span className="gameplay-section-title">NPCs</span>
          <span className="gameplay-section-count">{npcs.length}</span>
        </div>
        <div className="gameplay-item-list">
          {npcs.map(([id, entity]) => (
            <div key={id} className="gameplay-item">
              <div
                className={`gameplay-item-status ${
                  getStatus(id, "npc") === "matched" ? "completed" : "failed"
                }`}
              />
              <span className="gameplay-item-name">{entity.display_name || id}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gameplay-section">
        <div className="gameplay-section-header">
          <span className="gameplay-section-title">Items</span>
          <span className="gameplay-section-count">{items.length}</span>
        </div>
        <div className="gameplay-item-list">
          {items.map(([id, entity]) => (
            <div key={id} className="gameplay-item">
              <div
                className={`gameplay-item-status ${
                  getStatus(id, "item") === "matched" ? "completed" : "failed"
                }`}
              />
              <span className="gameplay-item-name">{entity.display_name || id}</span>
              <span
                className="gameplay-item-type"
                style={{
                  background: "var(--surface-tertiary)",
                  color: "var(--text-secondary)",
                }}
              >
                {entity.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GameplayOverlay;
