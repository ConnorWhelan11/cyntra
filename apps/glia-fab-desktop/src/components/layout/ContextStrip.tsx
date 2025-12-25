import React from "react";

interface ContextStripProps {
  /** Currently selected item for context display */
  selectedItem?: {
    type: "issue" | "workcell" | "world" | "run" | "asset";
    id: string;
    title: string;
    status?: string;
    agent?: string | null;
    timestamp?: string;
  } | null;
  /** Callback to dismiss/deselect */
  onDismiss?: () => void;
  /** Additional actions */
  actions?: React.ReactNode;
}

export function ContextStrip({
  selectedItem,
  onDismiss,
  actions,
}: ContextStripProps) {
  // Hide if nothing selected
  if (!selectedItem) {
    return null;
  }

  const typeLabels: Record<string, string> = {
    issue: "ISSUE",
    workcell: "WORKCELL",
    world: "WORLD",
    run: "RUN",
    asset: "ASSET",
  };

  return (
    <div className="context-strip">
      <div className="context-strip-info">
        <span className="mc-badge">{typeLabels[selectedItem.type] || selectedItem.type}</span>
        <span className="context-strip-title">
          #{selectedItem.id}: {selectedItem.title}
        </span>
        {selectedItem.agent && (
          <span className="agent-indicator">
            <span className={`agent-indicator-dot ${selectedItem.agent}`} />
            <span>{selectedItem.agent}</span>
          </span>
        )}
        {selectedItem.status && (
          <span className={`mc-badge ${selectedItem.status}`}>
            {selectedItem.status}
          </span>
        )}
        {selectedItem.timestamp && (
          <span className="text-tertiary text-xs">{selectedItem.timestamp}</span>
        )}
      </div>

      <div className="context-strip-actions">
        {actions}
        {onDismiss && (
          <button
            className="mc-btn-icon"
            onClick={onDismiss}
            title="Dismiss"
            aria-label="Dismiss selection"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default ContextStrip;
