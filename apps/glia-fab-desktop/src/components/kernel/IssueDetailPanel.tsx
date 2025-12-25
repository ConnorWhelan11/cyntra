import { AgentIndicator } from "@/components/shared/AgentIndicator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { BeadsIssue, KernelWorkcell } from "@/types";

interface IssueDetailPanelProps {
  issue: BeadsIssue | null;
  workcells: KernelWorkcell[];
  onSetStatus: (issueId: string, status: string) => void;
  onRunIssue: (issueId: string) => void;
  onRestart: (issue: BeadsIssue) => void;
  onOpenTerminal: (path: string) => void;
  onSetToolHint: (issueId: string, hint: string | null) => void;
  onToggleTag: (issue: BeadsIssue, tag: string) => void;
}

const TOOLCHAINS = ["codex", "claude", "opencode", "crush"] as const;

const COMMON_TAGS = [
  "asset:interior",
  "gate:asset-only",
  "gate:godot",
  "gate:config:interior_library_v001",
  "gate:godot-config:godot_integration_v001",
] as const;

export function IssueDetailPanel({
  issue,
  workcells,
  onSetStatus,
  onRunIssue,
  onRestart,
  onOpenTerminal,
  onSetToolHint,
  onToggleTag,
}: IssueDetailPanelProps) {
  if (!issue) {
    return (
      <div className="mc-panel issue-detail-panel">
        <div className="mc-panel-header">
          <span className="mc-panel-title">Issue Detail</span>
        </div>
        <div className="issue-detail-empty">
          <span className="issue-detail-empty-icon">select</span>
          <span>Select an issue to view details</span>
        </div>
      </div>
    );
  }

  const firstWorkcell = workcells[0];

  return (
    <div className="mc-panel issue-detail-panel">
      <div className="mc-panel-header">
        <span className="mc-panel-title">Issue #{issue.id}</span>
        <div className="issue-detail-badges">
          <StatusBadge status={issue.status || "open"} />
          {issue.ready && <StatusBadge status="ready" />}
        </div>
      </div>

      <div className="issue-detail-content">
        <h2 className="issue-detail-title">{issue.title}</h2>

        {issue.description && (
          <p className="issue-detail-description">{issue.description}</p>
        )}

        {/* Action Buttons */}
        <div className="issue-detail-section">
          <div className="issue-detail-actions">
            <button
              type="button"
              className="mc-btn"
              onClick={() => onSetStatus(issue.id, "ready")}
            >
              Mark Ready
            </button>
            <button
              type="button"
              className="mc-btn"
              onClick={() => onSetStatus(issue.id, "blocked")}
            >
              Block
            </button>
            <button
              type="button"
              className="mc-btn primary"
              onClick={() => onSetStatus(issue.id, "done")}
            >
              Done
            </button>
            <button
              type="button"
              className="mc-btn"
              onClick={() => onRunIssue(issue.id)}
            >
              Run Issue
            </button>
            <button
              type="button"
              className="mc-btn"
              onClick={() => onRestart(issue)}
              title="Reset attempts and clear escalation tags"
            >
              Restart
            </button>
            {firstWorkcell && (
              <button
                type="button"
                className="mc-btn"
                onClick={() => onOpenTerminal(firstWorkcell.path)}
              >
                Terminal
              </button>
            )}
          </div>
        </div>

        {/* Toolchain Selector */}
        <div className="issue-detail-section">
          <div className="issue-detail-section-label">Toolchain</div>
          <div className="issue-detail-toolchain">
            {TOOLCHAINS.map((t) => (
              <button
                key={t}
                type="button"
                className={`issue-toolchain-btn ${issue.dkToolHint === t ? "active" : ""}`}
                onClick={() => onSetToolHint(issue.id, t)}
              >
                <AgentIndicator agent={t} showLabel={false} size="sm" />
                <span>{t}</span>
              </button>
            ))}
            <button
              type="button"
              className={`issue-toolchain-btn ${!issue.dkToolHint ? "active" : ""}`}
              onClick={() => onSetToolHint(issue.id, null)}
            >
              <span className="issue-toolchain-auto">auto</span>
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="issue-detail-section">
          <div className="issue-detail-section-label">Tags</div>
          <div className="issue-detail-tags">
            {COMMON_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`issue-tag-chip ${issue.tags.includes(tag) ? "active" : ""}`}
                onClick={() => onToggleTag(issue, tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          {issue.tags.filter((t) => !COMMON_TAGS.includes(t as any)).length > 0 && (
            <div className="issue-detail-tags-extra">
              {issue.tags
                .filter((t) => !COMMON_TAGS.includes(t as any))
                .map((tag) => (
                  <span key={tag} className="issue-tag-chip readonly">
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
