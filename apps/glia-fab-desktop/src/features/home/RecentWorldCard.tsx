/**
 * RecentWorldCard - Individual recent world entry
 *
 * Shows world status, last run outcome, and open action.
 */

import React from "react";
import type { RecentWorld } from "@/types";

interface RecentWorldCardProps {
  world: RecentWorld;
  onResume: () => void;
  onRemove?: () => void;
}

export function RecentWorldCard({
  world,
  onResume,
  onRemove,
}: RecentWorldCardProps) {
  const getStatusColor = () => {
    switch (world.status) {
      case "building":
        return "var(--signal-active)";
      case "paused":
        return "var(--signal-warning, var(--signal-active))";
      case "canceled":
        return "var(--text-tertiary)";
      case "evolving":
        return "var(--signal-info)";
      case "complete":
        return "var(--signal-success)";
      case "failed":
        return "var(--signal-error)";
      default:
        return "var(--text-tertiary)";
    }
  };

  const getStatusLabel = () => {
    switch (world.status) {
      case "building":
        return "Building...";
      case "paused":
        return "Paused";
      case "canceled":
        return "Canceled";
      case "evolving":
        return "Evolving";
      case "complete":
        return "Complete";
      case "failed":
        return "Failed";
      default:
        return "Idle";
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="recent-world-card">
      {/* Status indicator */}
      <div
        className="recent-world-status"
        style={{ backgroundColor: getStatusColor() }}
        aria-label={getStatusLabel()}
      />

      {/* Content */}
      <div className="recent-world-content">
        <h4 className="recent-world-name">{world.name}</h4>
        <div className="recent-world-meta">
          <span className="recent-world-status-text">{getStatusLabel()}</span>
          {world.generation !== undefined && (
            <span className="recent-world-gen">gen:{world.generation}</span>
          )}
          {world.fitness !== undefined && (
            <span className="recent-world-fitness">
              fit:{world.fitness.toFixed(2)}
            </span>
          )}
        </div>
        <div className="recent-world-time">{formatTime(world.updatedAt)}</div>
      </div>

      {/* Last run outcome badge */}
      {world.lastRunOutcome && (
        <div
          className={`recent-world-outcome ${world.lastRunOutcome}`}
          aria-label={`Last run: ${world.lastRunOutcome}`}
        >
          {world.lastRunOutcome === "pass" ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M10.28 2.72a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0L1.72 6.78a.75.75 0 0 1 1.06-1.06L5 7.94l4.72-4.72a.75.75 0 0 1 1.06 0Z"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L6 4.94l1.22-1.22a.75.75 0 0 1 1.06 1.06L7.06 6l1.22 1.22a.75.75 0 0 1-1.06 1.06L6 7.06 4.78 8.28a.75.75 0 0 1-1.06-1.06L4.94 6 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="recent-world-actions">
        <button
          onClick={onResume}
          className="recent-world-resume-btn"
          title="Open this world"
          aria-label={`Open ${world.name}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M5.06 3.1a.75.75 0 0 1 .77.04l5 3.25a.75.75 0 0 1 0 1.26l-5 3.25A.75.75 0 0 1 4.75 10V4a.75.75 0 0 1 .31-.9Z"/>
          </svg>
          Open
        </button>

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="recent-world-remove-btn"
            title="Remove from recents"
            aria-label={`Remove ${world.name} from recents`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L6 4.94l1.22-1.22a.75.75 0 0 1 1.06 1.06L7.06 6l1.22 1.22a.75.75 0 0 1-1.06 1.06L6 7.06 4.78 8.28a.75.75 0 0 1-1.06-1.06L4.94 6 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
