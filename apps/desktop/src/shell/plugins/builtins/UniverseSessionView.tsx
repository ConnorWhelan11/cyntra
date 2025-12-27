import React, { useCallback, useState } from "react";
import { useParams } from "react-router-dom";

import { startJob } from "@/services/runService";
import { STORAGE_KEYS } from "@/utils";
import { useSessionActions, useSession } from "@/shell/sessions/useSessions";

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

export function UniverseSessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { updateSession } = useSessionActions();
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const session = useSession(sessionId);

  const resolveProjectRoot = useCallback(() => {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
      return raw && raw.trim().length > 0 ? raw : null;
    } catch {
      return null;
    }
  }, []);

  const handleResumeBuild = useCallback(async () => {
    if (!sessionId) return;
    const projectRoot = resolveProjectRoot();
    if (!projectRoot) {
      setError("Select an active project before starting a build.");
      return;
    }
    if (!/^\d+$/.test(sessionId)) {
      setError(
        "This session was created without kernel integration. Create a new world after selecting a project."
      );
      return;
    }
    setError(null);
    setIsStarting(true);
    try {
      updateSession(sessionId, { status: "running" });
      await startJob({
        projectRoot,
        command: `cyntra run --once --issue ${sessionId}`,
        label: `Build World ${sessionId}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      updateSession(sessionId, { status: "error" });
    } finally {
      setIsStarting(false);
    }
  }, [resolveProjectRoot, sessionId, updateSession]);

  if (!sessionId) {
    return (
      <div className="shell-placeholder">
        <div className="shell-placeholder-title">No session selected</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="shell-placeholder">
        <div className="shell-placeholder-title">Session not found</div>
        <div className="shell-placeholder-text">
          This world session is not in your local session store.
        </div>
      </div>
    );
  }

  return (
    <div className="shell-session-view">
      <header className="shell-session-header">
        <div className="shell-session-title">{session.title}</div>
        {session.subtitle && <div className="shell-session-subtitle">{session.subtitle}</div>}
        <div className="shell-session-meta">
          <span className="shell-session-meta-item">Status: {session.status}</span>
          {typeof session.generation === "number" && (
            <span className="shell-session-meta-item">Gen {session.generation}</span>
          )}
          {typeof session.bestFitness === "number" && (
            <span className="shell-session-meta-item">Best {session.bestFitness.toFixed(2)}</span>
          )}
          <span className="shell-session-meta-item">
            Updated: {formatTimestamp(session.updatedAt)}
          </span>
        </div>
      </header>

      {error && (
        <div className="shell-session-error" role="alert">
          {error}
        </div>
      )}

      <div className="shell-session-actions">
        <button
          type="button"
          className="shell-session-btn shell-session-btn--primary"
          onClick={handleResumeBuild}
          disabled={isStarting}
        >
          {isStarting ? "Starting..." : "Resume build"}
        </button>
      </div>
    </div>
  );
}

export default UniverseSessionView;
