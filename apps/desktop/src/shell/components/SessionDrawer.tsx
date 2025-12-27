/**
 * SessionDrawer - Session list sidebar with search and categories
 */
import React, { useState, useMemo } from "react";
import { SessionRow } from "./SessionRow";
import type { Session } from "../sessions/types";

export interface SessionDrawerProps {
  appId: string | null;
  appName?: string;
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onTogglePin?: (id: string) => void;
}

export function SessionDrawer({
  appId,
  appName,
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onTogglePin,
}: SessionDrawerProps) {
  const [search, setSearch] = useState("");

  const { pinned, recent } = useMemo(() => {
    const filtered = sessions.filter(
      (s) => !search || s.title.toLowerCase().includes(search.toLowerCase())
    );
    return {
      pinned: filtered.filter((s) => s.pinned),
      recent: filtered.filter((s) => !s.pinned),
    };
  }, [sessions, search]);

  if (!appId) {
    return (
      <aside className="session-drawer">
        <div className="session-empty">
          <div className="session-empty-title">Select an app</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="session-drawer">
      <div className="session-drawer-header">
        {appName && <div className="session-drawer-title">{appName}</div>}
        <div className="session-search">
          <svg
            className="session-search-icon"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
          >
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="session-search-input"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search sessions"
          />
        </div>
        <button
          type="button"
          className="session-new-btn"
          onClick={onNewSession}
          aria-label="New session"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 3.5V12.5M3.5 8H12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          New session
        </button>
      </div>
      <div className="session-drawer-content">
        {pinned.length > 0 && (
          <div className="session-section">
            <div className="session-section-header">
              <span className="label-caps">Pinned</span>
            </div>
            <div role="list">
              {pinned.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  selected={selectedSessionId === s.id}
                  onSelect={() => onSelectSession(s.id)}
                  onTogglePin={() => onTogglePin?.(s.id)}
                />
              ))}
            </div>
          </div>
        )}
        {recent.length > 0 && (
          <div className="session-section">
            <div className="session-section-header">
              <span className="label-caps">Recent</span>
            </div>
            <div role="list">
              {recent.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  selected={selectedSessionId === s.id}
                  onSelect={() => onSelectSession(s.id)}
                  onTogglePin={() => onTogglePin?.(s.id)}
                />
              ))}
            </div>
          </div>
        )}
        {sessions.length === 0 && (
          <div className="session-empty">
            <div className="session-empty-title">No sessions</div>
            <div className="session-empty-subtitle">Create your first session</div>
          </div>
        )}
      </div>
    </aside>
  );
}
