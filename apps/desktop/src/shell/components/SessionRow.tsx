/**
 * SessionRow - Individual session list item
 */
import React from "react";
import type { Session } from "../sessions/types";

export interface SessionRowProps {
  session: Session;
  selected?: boolean;
  onSelect?: () => void;
  onTogglePin?: () => void;
}

export function SessionRow({ session, selected, onSelect, onTogglePin }: SessionRowProps) {
  const statusClass = {
    idle: "session-status--idle",
    running: "session-status--running",
    error: "session-status--error",
    completed: "session-status--completed",
  }[session.status];

  return (
    <div className={`session-row ${selected ? "session-row--selected" : ""}`} role="listitem">
      <button
        type="button"
        className={`session-pin ${session.pinned ? "session-pin--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin?.();
        }}
        title={session.pinned ? "Unpin" : "Pin"}
        aria-label={session.pinned ? "Unpin session" : "Pin session"}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 2L7.5 6L11 7.5L7.5 9L6 10L4.5 9L1 7.5L4.5 6L6 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={session.pinned ? "currentColor" : "none"}
          />
        </svg>
      </button>
      <button
        type="button"
        className="session-row-main"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        title={session.subtitle ? `${session.title} — ${session.subtitle}` : session.title}
      >
        <div className="session-row-content">
          <div className="session-row-title">{session.title}</div>
          {session.subtitle && <div className="session-row-subtitle">{session.subtitle}</div>}
        </div>
        <div className="session-row-meta">
          <div className={`session-status ${statusClass}`} aria-hidden="true">
            <div className="session-status-dot" />
          </div>
          {session.generation !== undefined && (
            <div className="session-metric" aria-label={`Generation ${session.generation}`}>
              <span className="session-metric-label">gen</span>
              {session.generation}
            </div>
          )}
          {session.bestFitness !== undefined && (
            <div
              className="session-metric"
              aria-label={`Fitness ${session.bestFitness.toFixed(2)}`}
            >
              <span className="session-metric-label">fit</span>
              {session.bestFitness.toFixed(2)}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
