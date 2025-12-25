import { useState, useCallback, useMemo } from "react";
import type { RuntimeState, ObjectiveConfig, ObjectiveStatus } from "@/types";

interface RuntimeMonitorProps {
  objectives: ObjectiveConfig[];
  runtimeState: RuntimeState | null;
  isConnected: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * RuntimeMonitor - Live monitoring of game runtime state
 *
 * Features:
 * - Real-time objective progress tracking
 * - Trigger activation log
 * - Flag state display
 * - Connection status to Godot runtime
 */
export function RuntimeMonitor({
  objectives,
  runtimeState,
  isConnected,
  onConnect,
  onDisconnect,
}: RuntimeMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Calculate objective progress
  const objectiveStats = useMemo(() => {
    if (!runtimeState || !objectives.length) {
      return { completed: 0, active: 0, total: objectives.length };
    }

    const states = runtimeState.objective_states || {};
    let completed = 0;
    let active = 0;

    objectives.forEach((obj) => {
      const status = states[obj.id];
      if (status === "completed") completed++;
      else if (status === "active") active++;
    });

    return { completed, active, total: objectives.length };
  }, [objectives, runtimeState]);

  const recentTriggers = useMemo(() => {
    if (!runtimeState?.activated_triggers) return [];
    return [...runtimeState.activated_triggers]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }, [runtimeState?.activated_triggers]);

  // Sort flags for display
  const sortedFlags = useMemo(() => {
    if (!runtimeState?.flags) return [];
    return Object.entries(runtimeState.flags).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [runtimeState?.flags]);

  return (
    <div className={`runtime-monitor ${isExpanded ? "expanded" : "collapsed"}`}>
      {/* Header */}
      <div className="runtime-monitor-header" onClick={toggleExpanded}>
        <div className="runtime-monitor-header-left">
          <span className="runtime-monitor-toggle">{isExpanded ? "▼" : "▶"}</span>
          <span className="runtime-monitor-title">Runtime Monitor</span>
          <span
            className={`runtime-monitor-status ${isConnected ? "connected" : "disconnected"}`}
          >
            {isConnected ? "● Connected" : "○ Disconnected"}
          </span>
        </div>
        <div className="runtime-monitor-header-right">
          {!isConnected && onConnect && (
            <button
              className="runtime-monitor-btn"
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
            >
              Connect
            </button>
          )}
          {isConnected && onDisconnect && (
            <button
              className="runtime-monitor-btn disconnect"
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect();
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="runtime-monitor-content">
          {/* Objectives Panel */}
          <div className="runtime-monitor-panel">
            <div className="runtime-monitor-panel-header">
              <span className="runtime-monitor-panel-title">Objectives</span>
              <span className="runtime-monitor-panel-stat">
                {objectiveStats.completed}/{objectiveStats.total}
              </span>
            </div>
            <div className="runtime-monitor-panel-content">
              {objectives.length === 0 ? (
                <div className="runtime-monitor-empty">No objectives defined</div>
              ) : (
                <div className="runtime-objectives-list">
                  {objectives.map((obj) => {
                    const status = runtimeState?.objective_states?.[obj.id] || "locked";
                    return (
                      <div
                        key={obj.id}
                        className={`runtime-objective runtime-objective--${status}`}
                      >
                        <span className="runtime-objective-icon">
                          {getStatusIcon(status)}
                        </span>
                        <span className="runtime-objective-id">{obj.id}</span>
                        <span className={`runtime-objective-type runtime-objective-type--${obj.type}`}>
                          {obj.type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Triggers Panel */}
          <div className="runtime-monitor-panel">
            <div className="runtime-monitor-panel-header">
              <span className="runtime-monitor-panel-title">Recent Triggers</span>
            </div>
            <div className="runtime-monitor-panel-content">
              {recentTriggers.length === 0 ? (
                <div className="runtime-monitor-empty">No triggers activated</div>
              ) : (
                <div className="runtime-triggers-list">
                  {recentTriggers.map((event) => (
                    <div key={`${event.trigger_id}-${event.timestamp}`} className="runtime-trigger-event">
                      <span className="runtime-trigger-time">
                        {formatTime(event.timestamp)}
                      </span>
                      <span className="runtime-trigger-id">{event.trigger_id}</span>
                      <span className="runtime-trigger-action">
                        {event.actions_executed?.length ? `${event.actions_executed.length} actions` : "activated"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Flags Panel */}
          <div className="runtime-monitor-panel">
            <div className="runtime-monitor-panel-header">
              <span className="runtime-monitor-panel-title">Flags</span>
              <span className="runtime-monitor-panel-stat">
                {sortedFlags.filter(([, v]) => v).length}/{sortedFlags.length}
              </span>
            </div>
            <div className="runtime-monitor-panel-content">
              {sortedFlags.length === 0 ? (
                <div className="runtime-monitor-empty">No flags defined</div>
              ) : (
                <div className="runtime-flags-grid">
                  {sortedFlags.map(([key, value]) => (
                    <div
                      key={key}
                      className={`runtime-flag ${value ? "active" : "inactive"}`}
                    >
                      <span className="runtime-flag-icon">{value ? "✓" : "✗"}</span>
                      <span className="runtime-flag-name">{key}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Helper functions

function getStatusIcon(status: ObjectiveStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "active":
      return "◐";
    case "failed":
      return "✗";
    case "locked":
    default:
      return "○";
  }
}

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default RuntimeMonitor;
