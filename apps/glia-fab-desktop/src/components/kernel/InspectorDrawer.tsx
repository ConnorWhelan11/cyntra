import React, { useEffect, useMemo, useState } from "react";
import type { ConstellationStateReturn } from "./useConstellationState";
import type { BeadsIssue, KernelWorkcell, RunDetails } from "@/types";
import { TOOLCHAIN_COLORS } from "./useConstellationState";
import { getRunDetails } from "@/services";

interface InspectorDrawerProps {
  state: ConstellationStateReturn;
  issues: BeadsIssue[];
  workcells: KernelWorkcell[];
  runId: string | null;
  projectRoot: string | null;
  onSetIssueStatus?: (issueId: string, status: string) => void;
  onRunIssue?: (issueId: string) => void;
  onSetToolHint?: (issueId: string, hint: string | null) => void;
  onOpenTerminal?: (path: string) => void;
}

type TabId = "issue" | "workcell" | "run";

interface TabProps {
  id: TabId;
  label: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}

function Tab({ id, label, icon, isActive, onClick }: TabProps) {
  return (
    <button
      type="button"
      className={`inspector-tab ${isActive ? "active" : ""}`}
      onClick={onClick}
      data-tab={id}
    >
      <span className="inspector-tab-icon">{icon}</span>
      <span className="inspector-tab-label">{label}</span>
    </button>
  );
}

function IssueTabContent({
  issue,
  workcells,
  onSetStatus,
  onRunIssue,
  onSetToolHint,
}: {
  issue: BeadsIssue | null;
  workcells: KernelWorkcell[];
  onSetStatus?: (issueId: string, status: string) => void;
  onRunIssue?: (issueId: string) => void;
  onSetToolHint?: (issueId: string, hint: string | null) => void;
}) {
  if (!issue) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-icon">📋</span>
        <span>Select an issue to inspect</span>
      </div>
    );
  }

  const relatedWorkcells = workcells.filter((w) => w.issueId === issue.id);
  const toolHint = issue.tags?.find((t) => t.startsWith("dk_tool_hint:"))?.split(":")[1];

  return (
    <div className="inspector-content">
      <div className="inspector-section">
        <div className="inspector-issue-header">
          <span className="inspector-issue-id">#{issue.id}</span>
          <span className={`inspector-issue-status ${issue.status}`}>
            {issue.status}
          </span>
        </div>
        <h3 className="inspector-issue-title">{issue.title}</h3>
        {issue.description && (
          <p className="inspector-issue-desc">{issue.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="inspector-section">
        <span className="inspector-section-label">Actions</span>
        <div className="inspector-actions">
          {issue.status !== "done" && onRunIssue && (
            <button
              type="button"
              className="inspector-action-button primary"
              onClick={() => onRunIssue(issue.id)}
            >
              <span>▶</span>
              Run
            </button>
          )}
          {issue.status === "open" && onSetStatus && (
            <button
              type="button"
              className="inspector-action-button"
              onClick={() => onSetStatus(issue.id, "ready")}
            >
              <span>✓</span>
              Mark Ready
            </button>
          )}
          {issue.status === "blocked" && onSetStatus && (
            <button
              type="button"
              className="inspector-action-button"
              onClick={() => onSetStatus(issue.id, "open")}
            >
              <span>🔓</span>
              Unblock
            </button>
          )}
        </div>
      </div>

      {/* Toolchain Selector */}
      <div className="inspector-section">
        <span className="inspector-section-label">Toolchain</span>
        <div className="inspector-toolchain-grid">
          {["claude", "codex", "opencode", "crush"].map((tc) => (
            <button
              key={tc}
              type="button"
              className={`inspector-toolchain-chip ${toolHint === tc ? "active" : ""}`}
              style={{ "--chip-color": TOOLCHAIN_COLORS[tc] } as React.CSSProperties}
              onClick={() => onSetToolHint?.(issue.id, toolHint === tc ? null : tc)}
            >
              {tc}
            </button>
          ))}
        </div>
      </div>

      {/* Related Workcells */}
      {relatedWorkcells.length > 0 && (
        <div className="inspector-section">
          <span className="inspector-section-label">
            Workcells ({relatedWorkcells.length})
          </span>
          <div className="inspector-workcell-list">
            {relatedWorkcells.map((wc) => (
              <div key={wc.id} className="inspector-workcell-item">
                <span
                  className="inspector-workcell-dot"
                  style={{
                    background: TOOLCHAIN_COLORS[wc.toolchain ?? "default"],
                  }}
                />
                <span className="inspector-workcell-id">
                  {wc.id.slice(-8)}
                </span>
                <span className={`inspector-workcell-status ${wc.proofStatus ?? "idle"}`}>
                  {wc.proofStatus ?? "idle"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {issue.tags && issue.tags.length > 0 && (
        <div className="inspector-section">
          <span className="inspector-section-label">Tags</span>
          <div className="inspector-tags">
            {issue.tags.map((tag) => (
              <span key={tag} className="inspector-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkcellTabContent({
  workcell,
  issue,
  onOpenTerminal,
}: {
  workcell: KernelWorkcell | null;
  issue: BeadsIssue | null;
  onOpenTerminal?: (path: string) => void;
}) {
  if (!workcell) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-icon">⬡</span>
        <span>Select a workcell to inspect</span>
      </div>
    );
  }

  const progress = typeof workcell.progress === "number" ? workcell.progress : 0;
  const progressStage = workcell.progressStage?.trim() || "unknown";

  return (
    <div className="inspector-content">
      <div className="inspector-section">
        <div className="inspector-workcell-header">
          <span
            className="inspector-workcell-indicator"
            style={{
              background: TOOLCHAIN_COLORS[workcell.toolchain ?? "default"],
            }}
          />
          <span className="inspector-workcell-full-id">{workcell.id}</span>
        </div>
        {issue && (
          <div className="inspector-workcell-issue-link">
            Issue: <strong>#{issue.id}</strong> - {issue.title}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="inspector-section">
        <span className="inspector-section-label">Status</span>
        <div className="inspector-status-row">
          <span className={`inspector-status-badge ${workcell.proofStatus ?? "idle"}`}>
            {workcell.proofStatus ?? "idle"}
          </span>
          {workcell.toolchain && (
            <span
              className="inspector-toolchain-badge"
              style={{
                "--chip-color": TOOLCHAIN_COLORS[workcell.toolchain],
              } as React.CSSProperties}
            >
              {workcell.toolchain}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="inspector-section">
        <span className="inspector-section-label">Progress</span>
        <div className="inspector-progress">
          <div className="inspector-progress-bar">
            <div
              className={`inspector-progress-fill ${progressStage}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="inspector-progress-info">
            <span className="inspector-progress-value">
              {Math.round(progress * 100)}%
            </span>
            <span className={`inspector-progress-stage ${progressStage}`}>
              {progressStage}
            </span>
          </div>
        </div>
      </div>

      {/* Path */}
      {workcell.path && (
        <div className="inspector-section">
          <span className="inspector-section-label">Worktree Path</span>
          <div className="inspector-path-row">
            <code className="inspector-path">{workcell.path}</code>
            {onOpenTerminal && (
              <button
                type="button"
                className="inspector-icon-button"
                onClick={() => onOpenTerminal(workcell.path!)}
                title="Open terminal here"
              >
                📺
              </button>
            )}
          </div>
        </div>
      )}

      {/* Speculate Tag */}
      {workcell.speculateTag && (
        <div className="inspector-section">
          <span className="inspector-section-label">Speculate Group</span>
          <span className="inspector-speculate-tag">{workcell.speculateTag}</span>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTimestamp(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString();
}

function RunTabContent({
  runId,
  projectRoot,
  onOpenTerminal,
}: {
  runId: string | null;
  projectRoot: string | null;
  onOpenTerminal?: (path: string) => void;
}) {
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !projectRoot) {
      setDetails(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setDetails(null);

    let cancelled = false;

    getRunDetails({ projectRoot, runId })
      .then((result) => {
        if (cancelled) return;
        setDetails(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId, projectRoot]);

  if (!runId) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-icon">▶</span>
        <span>No active run</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-icon">⏳</span>
        <span>Loading run details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-icon">⚠️</span>
        <span>{error}</span>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-icon">❓</span>
        <span>Run not found</span>
      </div>
    );
  }

  const exitStatus = details.exitCode === null
    ? "running"
    : details.exitCode === 0
    ? "success"
    : "failed";

  return (
    <div className="inspector-content">
      {/* Header */}
      <div className="inspector-section">
        <div className="inspector-run-header">
          <span className={`inspector-status-badge ${exitStatus}`}>
            {exitStatus === "running" ? "⏳ Running" : exitStatus === "success" ? "✓ Success" : "✕ Failed"}
          </span>
          {details.exitCode !== null && (
            <span className="inspector-exit-code">Exit: {details.exitCode}</span>
          )}
        </div>
        {details.label && (
          <div className="inspector-run-label">{details.label}</div>
        )}
      </div>

      {/* Command */}
      <div className="inspector-section">
        <span className="inspector-section-label">Command</span>
        <code className="inspector-command">{details.command || "—"}</code>
      </div>

      {/* Timing */}
      <div className="inspector-section">
        <span className="inspector-section-label">Timing</span>
        <div className="inspector-timing-grid">
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Started</span>
            <span className="inspector-timing-value">{formatTimestamp(details.startedMs)}</span>
          </div>
          <div className="inspector-timing-item">
            <span className="inspector-timing-label">Duration</span>
            <span className="inspector-timing-value">{formatDuration(details.durationMs)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="inspector-section">
        <span className="inspector-section-label">Stats</span>
        <div className="inspector-stats-grid">
          <div className="inspector-stat">
            <span className="inspector-stat-value">{details.issuesProcessed.length}</span>
            <span className="inspector-stat-label">Issues</span>
          </div>
          <div className="inspector-stat">
            <span className="inspector-stat-value">{details.workcellsSpawned}</span>
            <span className="inspector-stat-label">Workcells</span>
          </div>
          <div className="inspector-stat">
            <span className="inspector-stat-value inspector-stat-success">{details.gatesPassed}</span>
            <span className="inspector-stat-label">Passed</span>
          </div>
          <div className="inspector-stat">
            <span className="inspector-stat-value inspector-stat-failed">{details.gatesFailed}</span>
            <span className="inspector-stat-label">Failed</span>
          </div>
        </div>
      </div>

      {/* Artifacts */}
      <div className="inspector-section">
        <span className="inspector-section-label">Artifacts</span>
        <div className="inspector-artifacts-summary">
          <span className="inspector-artifacts-count">{details.artifactsCount} files</span>
          <span className="inspector-artifacts-log">{details.terminalLogLines} log lines</span>
        </div>
      </div>

      {/* Run ID */}
      <div className="inspector-section">
        <span className="inspector-section-label">Run ID</span>
        <code className="inspector-run-id">{runId}</code>
      </div>

      {/* Actions */}
      <div className="inspector-section">
        <span className="inspector-section-label">Actions</span>
        <div className="inspector-actions">
          {onOpenTerminal && details.runDir && (
            <button
              type="button"
              className="inspector-action-button"
              onClick={() => onOpenTerminal(details.runDir)}
            >
              <span>📂</span>
              Open Run Folder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Right drawer with tabbed content for Issue, Workcell, and Run inspection.
 * 320px wide, slides in/out.
 */
export function InspectorDrawer({
  state,
  issues,
  workcells,
  runId,
  projectRoot,
  onSetIssueStatus,
  onRunIssue,
  onSetToolHint,
  onOpenTerminal,
}: InspectorDrawerProps) {
  const selectedIssue = useMemo(() => {
    if (state.selectedIssueId) {
      return issues.find((i) => i.id === state.selectedIssueId) ?? null;
    }
    // If workcell selected, find its issue
    if (state.selectedWorkcellId) {
      const wc = workcells.find((w) => w.id === state.selectedWorkcellId);
      if (wc) {
        return issues.find((i) => i.id === wc.issueId) ?? null;
      }
    }
    return null;
  }, [state.selectedIssueId, state.selectedWorkcellId, issues, workcells]);

  const selectedWorkcell = useMemo(() => {
    if (!state.selectedWorkcellId) return null;
    return workcells.find((w) => w.id === state.selectedWorkcellId) ?? null;
  }, [state.selectedWorkcellId, workcells]);

  return (
    <div className="inspector-drawer">
      {/* Close button */}
      <button
        type="button"
        className="inspector-close-button"
        onClick={() => state.setInspectorOpen(false)}
        title="Close (Esc)"
      >
        ✕
      </button>

      {/* Tabs */}
      <div className="inspector-tabs">
        <Tab
          id="issue"
          label="Issue"
          icon="📋"
          isActive={state.inspectorTab === "issue"}
          onClick={() => state.setInspectorTab("issue")}
        />
        <Tab
          id="workcell"
          label="Workcell"
          icon="⬡"
          isActive={state.inspectorTab === "workcell"}
          onClick={() => state.setInspectorTab("workcell")}
        />
        <Tab
          id="run"
          label="Run"
          icon="▶"
          isActive={state.inspectorTab === "run"}
          onClick={() => state.setInspectorTab("run")}
        />
      </div>

      {/* Tab Content */}
      <div className="inspector-tab-content">
        {state.inspectorTab === "issue" && (
          <IssueTabContent
            issue={selectedIssue}
            workcells={workcells}
            onSetStatus={onSetIssueStatus}
            onRunIssue={onRunIssue}
            onSetToolHint={onSetToolHint}
          />
        )}
        {state.inspectorTab === "workcell" && (
          <WorkcellTabContent
            workcell={selectedWorkcell}
            issue={selectedIssue}
            onOpenTerminal={onOpenTerminal}
          />
        )}
        {state.inspectorTab === "run" && (
          <RunTabContent
            runId={runId}
            projectRoot={projectRoot}
            onOpenTerminal={onOpenTerminal}
          />
        )}
      </div>
    </div>
  );
}
