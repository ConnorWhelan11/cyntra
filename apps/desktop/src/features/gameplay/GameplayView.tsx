import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useGameplay } from "@/context/GameplayContext";
import type {
  AudioZoneConfig,
  EntityConfig,
  GameplayTab,
  InteractionConfig,
  ObjectiveConfig,
  RuntimeState,
  TriggerConfig,
  ValidationReport,
} from "@/types";
import { SigilIcon } from "@/components/shared/SigilIcon";
import { RuntimeMonitor } from "./components/RuntimeMonitor";
import { ObjectivesTab } from "./tabs/ObjectivesTab";
import { getRuntimeService } from "@/services/runtimeService";
import { exportGameplayJson } from "@/services/gameplayService";

interface GameplayViewProps {
  worldPath?: string;
  onNavigate?: (nav: string) => void;
}

/**
 * GameplayView - Main gameplay definition editor
 *
 * Features:
 * - Tabbed interface for entities, triggers, objectives
 * - Entity inspector panel
 * - Validation status display
 * - Save/export functionality
 */
export function GameplayView({ worldPath, onNavigate }: GameplayViewProps) {
  const {
    state,
    loadConfig,
    saveConfig,
    validate,
    createNew,
    updateEntity,
    deleteEntity,
    addEntity,
    updateTrigger,
    deleteTrigger,
    addTrigger,
    updateObjective,
    deleteObjective,
    addObjective,
    setActiveTab,
    selectEntity,
    selectTrigger,
    selectObjective,
    clearError,
    entityCount,
    npcCount: _npcCount,
    itemCount: _itemCount,
    triggerCount,
    objectiveCount,
    interactionCount,
  } = useGameplay();

  const { config, validationReport, isLoading, isSaving, isValidating, isDirty, error, ui } = state;

  const [showInspector, setShowInspector] = useState(true);
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [isRuntimeConnected, setIsRuntimeConnected] = useState(false);
  const runtimeUnsubscribeRef = useRef<(() => void) | null>(null);
  const worldId = useMemo(() => {
    if (!worldPath) return "world";
    return worldPath.split("/").filter(Boolean).pop() ?? "world";
  }, [worldPath]);

  // Runtime service connection
  const handleConnectRuntime = useCallback(async () => {
    try {
      const service = getRuntimeService();
      await service.connect();
      setIsRuntimeConnected(true);

      // Subscribe to state updates
      runtimeUnsubscribeRef.current?.();
      runtimeUnsubscribeRef.current = service.onStateUpdate((state) => setRuntimeState(state));
    } catch (e) {
      console.error("Failed to connect to runtime:", e);
    }
  }, []);

  const handleDisconnectRuntime = useCallback(() => {
    const service = getRuntimeService();
    runtimeUnsubscribeRef.current?.();
    runtimeUnsubscribeRef.current = null;
    service.disconnect();
    setIsRuntimeConnected(false);
    setRuntimeState(null);
  }, []);

  // Load config on mount
  useEffect(() => {
    if (!worldPath) return;
    if (state.worldPath === worldPath && config) return;
    loadConfig(worldPath);
  }, [worldPath, state.worldPath, config, loadConfig]);

  useEffect(() => {
    return () => {
      runtimeUnsubscribeRef.current?.();
      getRuntimeService().disconnect();
    };
  }, []);

  const handleSave = async () => {
    await saveConfig();
  };

  const handleValidate = async () => {
    await validate();
  };

  const handleExport = () => {
    if (!state.worldPath || !config) return;
    const outputPath = `${state.worldPath}/gameplay.json`;
    exportGameplayJson(state.worldPath, outputPath).catch((e) => {
      console.error("Export failed:", e);
    });
  };

  const tabs: { id: GameplayTab; label: string; count?: number }[] = [
    { id: "entities", label: "Entities", count: entityCount },
    { id: "triggers", label: "Triggers", count: triggerCount },
    { id: "objectives", label: "Objectives", count: objectiveCount },
    { id: "interactions", label: "Interactions", count: interactionCount },
    { id: "audio", label: "Audio Zones" },
    { id: "validation", label: "Validation" },
  ];

  // Get NPCs and items from entities
  const npcs = config ? Object.entries(config.entities).filter(([_, e]) => e.type === "npc") : [];
  const items = config
    ? Object.entries(config.entities).filter(([_, e]) =>
        ["key_item", "consumable", "equipment", "document"].includes(e.type)
      )
    : [];

  const selectedEntity = ui.selectedEntityId && config?.entities[ui.selectedEntityId];
  const selectedTrigger = ui.selectedTriggerId && config?.triggers[ui.selectedTriggerId];
  const selectedObjective =
    ui.selectedObjectiveId && config?.objectives.find((o) => o.id === ui.selectedObjectiveId);
  const selectedObjectiveIndex = useMemo(() => {
    if (!config || !ui.selectedObjectiveId) return null;
    const index = config.objectives.findIndex((o) => o.id === ui.selectedObjectiveId);
    return index >= 0 ? index : null;
  }, [config, ui.selectedObjectiveId]);

  const handleAddNpc = useCallback(() => {
    if (!config) return;
    const existingIds = new Set(Object.keys(config.entities));
    const id = createUniqueId(existingIds, "npc");
    addEntity(id, { type: "npc", display_name: "New NPC" });
    selectEntity(id);
  }, [config, addEntity, selectEntity]);

  const handleAddItem = useCallback(() => {
    if (!config) return;
    const existingIds = new Set(Object.keys(config.entities));
    const id = createUniqueId(existingIds, "item");
    addEntity(id, { type: "key_item", display_name: "New Item" });
    selectEntity(id);
  }, [config, addEntity, selectEntity]);

  const handleAddTrigger = useCallback(() => {
    if (!config) return;
    const existingIds = new Set(Object.keys(config.triggers));
    const id = createUniqueId(existingIds, "trigger");
    addTrigger(id, { type: "enter", actions: [] });
    selectTrigger(id);
  }, [config, addTrigger, selectTrigger]);

  const handleAddObjective = useCallback(() => {
    if (!config) return;
    const existingIds = new Set(config.objectives.map((o) => o.id));
    const id = createUniqueId(existingIds, "objective");
    addObjective({ id, description: "New objective", type: "main" });
    selectObjective(id);
  }, [config, addObjective, selectObjective]);

  return (
    <div className="gameplay-view">
      {/* Toolbar */}
      <div className="gameplay-toolbar">
        <div className="gameplay-toolbar-left">
          {onNavigate && (
            <button
              type="button"
              className="gameplay-action-btn gameplay-action-btn--secondary gameplay-action-btn--small"
              onClick={() => onNavigate("stage")}
              title="Back to Stage"
            >
              ← Stage
            </button>
          )}
          <SigilIcon name="gameplay" size={20} className="gameplay-toolbar-icon" />
          <span className="gameplay-title">{config?.world_id || "Gameplay Editor"}</span>
          {isDirty && <span className="gameplay-dirty-badge">Unsaved</span>}
        </div>
        <div className="gameplay-toolbar-actions">
          <button
            className="gameplay-action-btn"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button className="gameplay-action-btn" onClick={handleValidate} disabled={isValidating}>
            {isValidating ? "Validating..." : "Validate"}
          </button>
          <button
            className="gameplay-action-btn gameplay-action-btn--secondary"
            onClick={() => setShowInspector((prev) => !prev)}
          >
            {showInspector ? "Hide Inspector" : "Show Inspector"}
          </button>
          <button
            className="gameplay-action-btn gameplay-action-btn--secondary"
            onClick={handleExport}
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="gameplay-error-banner">
          <span>{error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="gameplay-loading">
          <div className="gameplay-loading-spinner" />
          <span>Loading gameplay config...</span>
        </div>
      ) : !config ? (
        <div className="gameplay-empty">
          <SigilIcon name="gameplay" size={48} className="gameplay-empty-icon" />
          <h3>No Gameplay Config</h3>
          <p>Select a world to edit its gameplay definition</p>
          {worldPath && (
            <div className="gameplay-empty-actions">
              <button
                className="gameplay-action-btn gameplay-action-btn--primary"
                onClick={() => loadConfig(worldPath)}
              >
                Load Config
              </button>
              <button
                className="gameplay-action-btn gameplay-action-btn--secondary"
                onClick={() => createNew(worldId, worldPath)}
              >
                Create New
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="gameplay-content">
          {/* Tabs */}
          <div className="gameplay-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`gameplay-tab ${ui.activeTab === tab.id ? "gameplay-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.count !== undefined && <span className="gameplay-tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* Main content area */}
          <div className="gameplay-main">
            {/* List panel */}
            <div className="gameplay-list-panel">
              {ui.activeTab === "entities" && (
                <EntitiesPanel
                  npcs={npcs}
                  items={items}
                  selectedId={ui.selectedEntityId}
                  onSelect={selectEntity}
                  onAddNpc={handleAddNpc}
                  onAddItem={handleAddItem}
                  validationReport={validationReport}
                />
              )}
              {ui.activeTab === "triggers" && (
                <TriggersPanel
                  triggers={Object.entries(config.triggers)}
                  selectedId={ui.selectedTriggerId}
                  onSelect={selectTrigger}
                  onAddTrigger={handleAddTrigger}
                  validationReport={validationReport}
                />
              )}
              {ui.activeTab === "objectives" && (
                <ObjectivesTab
                  objectives={config.objectives}
                  selectedId={ui.selectedObjectiveId}
                  onSelect={selectObjective}
                  runtimeStates={runtimeState?.objective_states}
                  onAddObjective={handleAddObjective}
                />
              )}
              {ui.activeTab === "interactions" && (
                <InteractionsPanel
                  interactions={Object.entries(config.interactions)}
                  validationReport={validationReport}
                />
              )}
              {ui.activeTab === "audio" && (
                <AudioZonesPanel audioZones={Object.entries(config.audio_zones)} />
              )}
              {ui.activeTab === "validation" && (
                <ValidationPanel validationReport={validationReport} />
              )}
            </div>

            {/* Inspector panel */}
            {showInspector && (
              <div className="gameplay-inspector-panel">
                {ui.activeTab === "entities" && selectedEntity && (
                  <EntityInspector
                    entityId={ui.selectedEntityId!}
                    entity={selectedEntity}
                    onUpdate={(next) => updateEntity(ui.selectedEntityId!, next)}
                    onDelete={() => {
                      deleteEntity(ui.selectedEntityId!);
                      selectEntity(null);
                    }}
                  />
                )}
                {ui.activeTab === "triggers" && selectedTrigger && (
                  <TriggerInspector
                    triggerId={ui.selectedTriggerId!}
                    trigger={selectedTrigger}
                    onUpdate={(next) => updateTrigger(ui.selectedTriggerId!, next)}
                    onDelete={() => {
                      deleteTrigger(ui.selectedTriggerId!);
                      selectTrigger(null);
                    }}
                  />
                )}
                {ui.activeTab === "objectives" && selectedObjective && (
                  <ObjectiveInspector
                    objective={selectedObjective}
                    allObjectives={config.objectives}
                    onUpdate={(next) => {
                      if (selectedObjectiveIndex === null) return;
                      updateObjective(selectedObjectiveIndex, next);
                    }}
                    onDelete={() => {
                      if (selectedObjectiveIndex === null) return;
                      deleteObjective(selectedObjectiveIndex);
                      selectObjective(null);
                    }}
                  />
                )}
                {!selectedEntity && !selectedTrigger && !selectedObjective && (
                  <div className="gameplay-inspector-empty">
                    <p>Select an item to inspect</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Runtime Monitor */}
          <RuntimeMonitor
            objectives={config?.objectives || []}
            runtimeState={runtimeState}
            isConnected={isRuntimeConnected}
            onConnect={handleConnectRuntime}
            onDisconnect={handleDisconnectRuntime}
          />
        </div>
      )}
    </div>
  );
}

// Sub-components

function EntitiesPanel({
  npcs,
  items,
  selectedId,
  onSelect,
  onAddNpc,
  onAddItem,
  validationReport,
}: {
  npcs: [string, EntityConfig][];
  items: [string, EntityConfig][];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddNpc: () => void;
  onAddItem: () => void;
  validationReport: ValidationReport | null;
}) {
  const getEntityStatus = (id: string, type: string) => {
    if (!validationReport) return "unknown";
    const matchedList =
      type === "npc" ? validationReport.matched_npcs : validationReport.matched_items;
    if (matchedList.includes(id)) return "valid";
    if (validationReport.missing_markers.some((m) => m.entity_id === id)) return "invalid";
    return "unknown";
  };

  const [query, setQuery] = useState("");
  const queryLower = query.trim().toLowerCase();

  const [collapsed, setCollapsed] = useState<{ npcs: boolean; items: boolean }>({
    npcs: false,
    items: false,
  });

  const filteredNpcs = useMemo(() => {
    if (!queryLower) return npcs;
    return npcs.filter(([id, entity]) => {
      const haystack = `${id} ${entity.display_name ?? ""} ${entity.marker ?? ""}`.toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [npcs, queryLower]);

  const filteredItems = useMemo(() => {
    if (!queryLower) return items;
    return items.filter(([id, entity]) => {
      const haystack = `${id} ${entity.display_name ?? ""} ${entity.marker ?? ""}`.toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [items, queryLower]);

  const toggleNpcs = useCallback(() => {
    setCollapsed((prev) => ({ ...prev, npcs: !prev.npcs }));
  }, []);

  const toggleItems = useCallback(() => {
    setCollapsed((prev) => ({ ...prev, items: !prev.items }));
  }, []);

  return (
    <div>
      <div className="gameplay-list-toolbar">
        <input
          className="gameplay-filter-input"
          value={query}
          placeholder="Filter entities…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="gameplay-filter-clear"
            onClick={() => setQuery("")}
            aria-label="Clear entity filter"
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      <div className="gameplay-entity-group">
        <div className="gameplay-group-header">
          <button type="button" className="gameplay-group-toggle" onClick={toggleNpcs}>
            <span className="gameplay-group-chevron">{collapsed.npcs ? "▸" : "▾"}</span>
            <span>NPCs</span>
            <span className="gameplay-group-count">
              {filteredNpcs.length}/{npcs.length}
            </span>
          </button>
          <button
            type="button"
            className="gameplay-action-btn gameplay-action-btn--secondary gameplay-action-btn--small"
            onClick={onAddNpc}
          >
            + NPC
          </button>
        </div>
        {!collapsed.npcs && (
          <div className="gameplay-entity-list">
            {filteredNpcs.length === 0 ? (
              <div className="gameplay-list-empty">No NPCs match this filter</div>
            ) : (
              filteredNpcs.map(([id, entity]) => {
                const status = getEntityStatus(id, "npc");
                const icon = status === "valid" ? "✓" : status === "invalid" ? "✗" : "?";
                return (
                  <button
                    key={id}
                    type="button"
                    className={`gameplay-entity-item ${selectedId === id ? "gameplay-entity-item--selected" : ""}`}
                    onClick={() => onSelect(id)}
                  >
                    <span className="gameplay-entity-name">{entity.display_name || id}</span>
                    <span className={`gameplay-entity-status gameplay-entity-status--${status}`}>
                      {icon}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="gameplay-entity-group">
        <div className="gameplay-group-header">
          <button type="button" className="gameplay-group-toggle" onClick={toggleItems}>
            <span className="gameplay-group-chevron">{collapsed.items ? "▸" : "▾"}</span>
            <span>Items</span>
            <span className="gameplay-group-count">
              {filteredItems.length}/{items.length}
            </span>
          </button>
          <button
            type="button"
            className="gameplay-action-btn gameplay-action-btn--secondary gameplay-action-btn--small"
            onClick={onAddItem}
          >
            + Item
          </button>
        </div>
        {!collapsed.items && (
          <div className="gameplay-entity-list">
            {filteredItems.length === 0 ? (
              <div className="gameplay-list-empty">No items match this filter</div>
            ) : (
              filteredItems.map(([id, entity]) => {
                const status = getEntityStatus(id, "item");
                const icon = status === "valid" ? "✓" : status === "invalid" ? "✗" : "?";
                return (
                  <button
                    key={id}
                    type="button"
                    className={`gameplay-entity-item ${selectedId === id ? "gameplay-entity-item--selected" : ""}`}
                    onClick={() => onSelect(id)}
                  >
                    <span className="gameplay-entity-name">{entity.display_name || id}</span>
                    <span className={`gameplay-entity-status gameplay-entity-status--${status}`}>
                      {icon}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TriggersPanel({
  triggers,
  selectedId,
  onSelect,
  onAddTrigger,
  validationReport,
}: {
  triggers: [string, TriggerConfig][];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddTrigger: () => void;
  validationReport: ValidationReport | null;
}) {
  const getStatus = (id: string) => {
    if (!validationReport) return "unknown";
    if (validationReport.matched_triggers.includes(id)) return "valid";
    if (validationReport.missing_markers.some((m) => m.entity_id === id)) return "invalid";
    return "unknown";
  };

  const [query, setQuery] = useState("");
  const queryLower = query.trim().toLowerCase();

  const filteredTriggers = useMemo(() => {
    if (!queryLower) return triggers;
    return triggers.filter(([id, trigger]) => {
      const haystack = `${id} ${trigger.type} ${trigger.marker ?? ""}`.toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [triggers, queryLower]);

  return (
    <div>
      <div className="gameplay-list-toolbar">
        <input
          className="gameplay-filter-input"
          value={query}
          placeholder="Filter triggers…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="gameplay-filter-clear"
            onClick={() => setQuery("")}
            aria-label="Clear trigger filter"
            title="Clear"
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="gameplay-action-btn gameplay-action-btn--secondary gameplay-action-btn--small"
          onClick={onAddTrigger}
        >
          + Trigger
        </button>
      </div>

      <div className="gameplay-entity-list">
        {filteredTriggers.length === 0 ? (
          <div className="gameplay-list-empty">No triggers match this filter</div>
        ) : (
          filteredTriggers.map(([id, trigger]) => (
            <button
              key={id}
              type="button"
              className={`gameplay-entity-item ${selectedId === id ? "gameplay-entity-item--selected" : ""}`}
              onClick={() => onSelect(id)}
            >
              <div>
                <span className="gameplay-entity-name">{id}</span>
                <span className="gameplay-entity-meta">{trigger.type}</span>
              </div>
              <span className={`gameplay-entity-status gameplay-entity-status--${getStatus(id)}`}>
                {getStatus(id) === "valid" ? "✓" : getStatus(id) === "invalid" ? "✗" : "?"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function InteractionsPanel({
  interactions,
  validationReport,
}: {
  interactions: [string, InteractionConfig][];
  validationReport: ValidationReport | null;
}) {
  const getStatus = (id: string) => {
    if (!validationReport) return "unknown";
    if (validationReport.matched_interactions.includes(id)) return "valid";
    if (validationReport.missing_markers.some((m) => m.entity_id === id)) return "invalid";
    return "unknown";
  };

  return (
    <div>
      <div className="gameplay-entity-list">
        {interactions.map(([id, interaction]) => (
          <div key={id} className="gameplay-entity-item gameplay-entity-item--static">
            <div>
              <span className="gameplay-entity-name">{interaction.display_name || id}</span>
              <span className="gameplay-entity-meta">{interaction.type}</span>
            </div>
            <span className={`gameplay-entity-status gameplay-entity-status--${getStatus(id)}`}>
              {getStatus(id) === "valid" ? "✓" : getStatus(id) === "invalid" ? "✗" : "?"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AudioZonesPanel({ audioZones }: { audioZones: [string, AudioZoneConfig][] }) {
  return (
    <div>
      <div className="gameplay-entity-list">
        {audioZones.map(([id, zone]) => (
          <div key={id} className="gameplay-entity-item gameplay-entity-item--static">
            <span className="gameplay-entity-name">{id}</span>
            <span className="gameplay-entity-meta">{zone.music_track || "No track"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationPanel({ validationReport }: { validationReport: ValidationReport | null }) {
  if (!validationReport) {
    return (
      <div className="gameplay-inspector-empty gameplay-validation-empty">
        <p>Run validation to see results</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div className="gameplay-validation-section">
        <div className="gameplay-validation-title">
          {validationReport.valid ? (
            <span className="gameplay-validation-status gameplay-validation-status--pass">
              ✓ Validation Passed
            </span>
          ) : (
            <span className="gameplay-validation-status gameplay-validation-status--fail">
              ✗ Validation Failed
            </span>
          )}
        </div>
      </div>

      {/* Errors */}
      {validationReport.missing_markers.length > 0 && (
        <div className="gameplay-validation-section">
          <div className="gameplay-validation-title">
            Missing Markers ({validationReport.missing_markers.length})
          </div>
          <div className="gameplay-validation-list">
            {validationReport.missing_markers.map((issue) => (
              <div
                key={`${issue.entity_type}:${issue.entity_id}:${issue.expected_marker}`}
                className="gameplay-validation-item gameplay-validation-item--error"
              >
                <span>✗</span>
                <div>
                  <div>{issue.entity_id}</div>
                  <div className="gameplay-validation-detail">
                    Expected: {issue.expected_marker}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {validationReport.warnings.length > 0 && (
        <div className="gameplay-validation-section">
          <div className="gameplay-validation-title">
            Warnings ({validationReport.warnings.length})
          </div>
          <div className="gameplay-validation-list">
            {validationReport.warnings.map((warning) => (
              <div
                key={`${warning.code}:${warning.entity_id ?? ""}:${warning.message}`}
                className="gameplay-validation-item gameplay-validation-item--warning"
              >
                <span>⚠</span>
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matched */}
      <div className="gameplay-validation-section">
        <div className="gameplay-validation-title">Matched Markers</div>
        <div className="gameplay-validation-stats">
          <div>NPCs: {validationReport.matched_npcs?.length || 0}</div>
          <div>Items: {validationReport.matched_items?.length || 0}</div>
          <div>Triggers: {validationReport.matched_triggers?.length || 0}</div>
          <div>Interactions: {validationReport.matched_interactions?.length || 0}</div>
        </div>
      </div>
    </div>
  );
}

function EntityInspector({
  entityId,
  entity,
  onUpdate,
  onDelete,
}: {
  entityId: string;
  entity: EntityConfig;
  onUpdate: (next: EntityConfig) => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <div className="gameplay-inspector-header">{entity.display_name || entityId}</div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">ID</label>
        <div className="gameplay-inspector-value">{entityId}</div>
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Type</label>
        <div className="gameplay-inspector-value">{entity.type}</div>
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Display Name</label>
        <input
          className="gameplay-inspector-input"
          value={entity.display_name ?? ""}
          onChange={(e) => onUpdate({ ...entity, display_name: e.target.value })}
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Marker</label>
        <input
          className="gameplay-inspector-input"
          value={entity.marker ?? ""}
          placeholder="e.g. NPC_LIBRARIAN"
          onChange={(e) => onUpdate({ ...entity, marker: e.target.value || undefined })}
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Behavior</label>
        <input
          className="gameplay-inspector-input"
          value={entity.behavior ?? ""}
          placeholder="e.g. idle, patrol, vendor"
          onChange={(e) => onUpdate({ ...entity, behavior: e.target.value || undefined })}
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Dialogue</label>
        <input
          className="gameplay-inspector-input"
          value={entity.dialogue ?? ""}
          placeholder="Dialogue key"
          onChange={(e) => onUpdate({ ...entity, dialogue: e.target.value || undefined })}
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Description</label>
        <input
          className="gameplay-inspector-input"
          value={entity.description ?? ""}
          placeholder="Short description"
          onChange={(e) => onUpdate({ ...entity, description: e.target.value || undefined })}
        />
      </div>

      <button
        type="button"
        className="gameplay-action-btn gameplay-action-btn--danger gameplay-action-btn--full"
        onClick={onDelete}
      >
        Delete Entity
      </button>
    </div>
  );
}

function TriggerInspector({
  triggerId,
  trigger,
  onUpdate,
  onDelete,
}: {
  triggerId: string;
  trigger: TriggerConfig;
  onUpdate: (next: TriggerConfig) => void;
  onDelete: () => void;
}) {
  const [actionsText, setActionsText] = useState(JSON.stringify(trigger.actions ?? [], null, 2));
  const [actionsError, setActionsError] = useState<string | null>(null);

  useEffect(() => {
    setActionsText(JSON.stringify(trigger.actions ?? [], null, 2));
    setActionsError(null);
  }, [trigger.actions]);

  const applyActionsText = useCallback(() => {
    try {
      const parsed = JSON.parse(actionsText);
      if (!Array.isArray(parsed)) throw new Error("Actions must be a JSON array");
      onUpdate({ ...trigger, actions: parsed });
      setActionsError(null);
    } catch (e) {
      setActionsError(String(e));
    }
  }, [actionsText, onUpdate, trigger]);

  return (
    <div>
      <div className="gameplay-inspector-header">{triggerId}</div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Type</label>
        <select
          className="gameplay-inspector-input"
          value={trigger.type}
          onChange={(e) => onUpdate({ ...trigger, type: e.target.value as TriggerConfig["type"] })}
        >
          <option value="enter">enter</option>
          <option value="exit">exit</option>
          <option value="proximity">proximity</option>
          <option value="time">time</option>
          <option value="flag_change">flag_change</option>
        </select>
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Marker</label>
        <input
          className="gameplay-inspector-input"
          value={trigger.marker ?? ""}
          placeholder="Marker name (optional)"
          onChange={(e) => onUpdate({ ...trigger, marker: e.target.value || undefined })}
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Once Only</label>
        <select
          className="gameplay-inspector-input"
          value={trigger.once ? "yes" : "no"}
          onChange={(e) => onUpdate({ ...trigger, once: e.target.value === "yes" })}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Actions (JSON)</label>
        <textarea
          className="gameplay-inspector-input gameplay-inspector-textarea"
          value={actionsText}
          onChange={(e) => setActionsText(e.target.value)}
          onBlur={applyActionsText}
        />
        {actionsError && <div className="gameplay-inspector-error">{actionsError}</div>}
      </div>

      <button
        type="button"
        className="gameplay-action-btn gameplay-action-btn--danger gameplay-action-btn--full"
        onClick={onDelete}
      >
        Delete Trigger
      </button>
    </div>
  );
}

function ObjectiveInspector({
  objective,
  allObjectives,
  onUpdate,
  onDelete,
}: {
  objective: ObjectiveConfig;
  allObjectives: ObjectiveConfig[];
  onUpdate: (next: ObjectiveConfig) => void;
  onDelete: () => void;
}) {
  const requiresPlaceholder =
    allObjectives.length > 0
      ? allObjectives
          .map((o) => o.id)
          .slice(0, 3)
          .join(", ")
      : "objective_a, objective_b";

  return (
    <div>
      <div className="gameplay-inspector-header">{objective.description}</div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">ID</label>
        <div className="gameplay-inspector-value">{objective.id}</div>
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Type</label>
        <select
          className="gameplay-inspector-input"
          value={objective.type}
          onChange={(e) =>
            onUpdate({ ...objective, type: e.target.value as ObjectiveConfig["type"] })
          }
        >
          <option value="main">main</option>
          <option value="side">side</option>
          <option value="discovery">discovery</option>
          <option value="final">final</option>
        </select>
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Description</label>
        <input
          className="gameplay-inspector-input"
          value={objective.description}
          onChange={(e) => onUpdate({ ...objective, description: e.target.value })}
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Requires (comma-separated IDs)</label>
        <input
          className="gameplay-inspector-input"
          value={(objective.requires ?? []).join(", ")}
          placeholder={requiresPlaceholder}
          onChange={(e) =>
            onUpdate({
              ...objective,
              requires: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <div className="gameplay-inspector-field">
        <label className="gameplay-inspector-label">Hint</label>
        <input
          className="gameplay-inspector-input"
          value={objective.hint ?? ""}
          placeholder="Optional hint shown to player"
          onChange={(e) => onUpdate({ ...objective, hint: e.target.value || undefined })}
        />
      </div>

      <button
        type="button"
        className="gameplay-action-btn gameplay-action-btn--danger gameplay-action-btn--full"
        onClick={onDelete}
      >
        Delete Objective
      </button>
    </div>
  );
}

export default GameplayView;

function createUniqueId(existingIds: Set<string>, prefix: string): string {
  const safePrefix = prefix.trim().length ? prefix.trim() : "id";
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = `${safePrefix}_${i}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${safePrefix}_${Date.now()}`;
}
