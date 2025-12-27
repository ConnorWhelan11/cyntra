import { useMemo } from "react";
import { AgentIndicator } from "@/components/shared/AgentIndicator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { BeadsIssue } from "@/types";

interface IssueMiniCardProps {
  issue: BeadsIssue;
  isSelected: boolean;
  onClick: () => void;
}

function IssueMiniCard({ issue, isSelected, onClick }: IssueMiniCardProps) {
  return (
    <button
      className={`issue-mini-card ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      type="button"
    >
      <div className="issue-mini-card-header">
        <span className="issue-mini-card-id">#{issue.id}</span>
        {issue.dkToolHint && (
          <AgentIndicator agent={issue.dkToolHint} showLabel={false} size="sm" />
        )}
      </div>
      <div className="issue-mini-card-title">{issue.title}</div>
      <div className="issue-mini-card-footer">
        <StatusBadge status={issue.status || "open"} />
        {issue.ready && <span className="issue-mini-card-ready-dot" />}
      </div>
    </button>
  );
}

interface IssueMinieBoardProps {
  issues: BeadsIssue[];
  selectedIssueId: string | null;
  filter: string;
  onlyReady: boolean;
  onlyActive: boolean;
  onFilterChange: (filter: string) => void;
  onOnlyReadyChange: (only: boolean) => void;
  onOnlyActiveChange: (only: boolean) => void;
  onSelectIssue: (id: string) => void;
}

export function IssueMiniBoard({
  issues,
  selectedIssueId,
  filter,
  onlyReady,
  onlyActive,
  onFilterChange,
  onOnlyReadyChange,
  onOnlyActiveChange,
  onSelectIssue,
}: IssueMinieBoardProps) {
  // Group issues by status for visual organization
  const groupedIssues = useMemo(() => {
    const groups = {
      running: [] as BeadsIssue[],
      ready: [] as BeadsIssue[],
      blocked: [] as BeadsIssue[],
      open: [] as BeadsIssue[],
      done: [] as BeadsIssue[],
    };

    for (const issue of issues) {
      const status = issue.status?.toLowerCase() || "open";
      if (status === "running" || status === "in_progress") {
        groups.running.push(issue);
      } else if (status === "ready" || issue.ready) {
        groups.ready.push(issue);
      } else if (status === "blocked" || status === "failed") {
        groups.blocked.push(issue);
      } else if (status === "done" || status === "complete") {
        groups.done.push(issue);
      } else {
        groups.open.push(issue);
      }
    }

    // Return in priority order: running first, then ready, blocked, open, done
    return [...groups.running, ...groups.ready, ...groups.blocked, ...groups.open, ...groups.done];
  }, [issues]);

  return (
    <div className="mc-panel issue-mini-board-panel">
      <div className="mc-panel-header">
        <span className="mc-panel-title">Issues</span>
        <div className="issue-mini-board-filters">
          <label className="issue-filter-chip">
            <input
              type="checkbox"
              checked={onlyReady}
              onChange={(e) => onOnlyReadyChange(e.target.checked)}
            />
            <span>Ready</span>
          </label>
          <label className="issue-filter-chip">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => onOnlyActiveChange(e.target.checked)}
            />
            <span>Active</span>
          </label>
        </div>
      </div>

      <div className="issue-mini-board-search">
        <input
          type="text"
          className="mc-input"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter by id, title, tag..."
        />
      </div>

      <div className="issue-mini-board-scroll">
        {groupedIssues.length === 0 ? (
          <div className="issue-mini-board-empty">
            <span className="issue-mini-board-empty-icon">
              {issues.length === 0 ? "inbox" : "filter"}
            </span>
            <span>{issues.length === 0 ? "No issues found" : "No issues match filters"}</span>
          </div>
        ) : (
          <div className="issue-mini-board-cards stagger-list">
            {groupedIssues.map((issue) => (
              <IssueMiniCard
                key={issue.id}
                issue={issue}
                isSelected={issue.id === selectedIssueId}
                onClick={() => onSelectIssue(issue.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
