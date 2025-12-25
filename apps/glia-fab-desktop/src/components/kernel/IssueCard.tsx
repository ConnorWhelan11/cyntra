import React from "react";
import type { BeadsIssue } from "@/types";

interface IssueCardProps {
  issue: BeadsIssue;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

// Map toolchain hint to agent color class
function getAgentClass(toolHint: string | null | undefined): string {
  if (!toolHint) return "";
  const hint = toolHint.toLowerCase();
  if (hint.includes("claude")) return "claude";
  if (hint.includes("codex")) return "codex";
  if (hint.includes("opencode")) return "opencode";
  if (hint.includes("crush")) return "crush";
  return "";
}

// Get agent initial
function getAgentInitial(toolHint: string | null | undefined): string {
  if (!toolHint) return "";
  const hint = toolHint.toLowerCase();
  if (hint.includes("claude")) return "C";
  if (hint.includes("codex")) return "X";
  if (hint.includes("opencode")) return "O";
  if (hint.includes("crush")) return "R";
  return hint[0]?.toUpperCase() || "";
}

export function IssueCard({
  issue,
  selected = false,
  onClick,
  onDoubleClick,
  draggable = false,
  onDragStart,
  onDragEnd,
}: IssueCardProps) {
  const agentClass = getAgentClass(issue.dkToolHint);
  const agentInitial = getAgentInitial(issue.dkToolHint);
  const tags = issue.tags?.slice(0, 3) ?? [];

  return (
    <div
      className={`issue-card card-selectable ${selected ? "selected" : ""} ${draggable ? "card-draggable" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="issue-card-header">
        <span className="issue-card-id">#{issue.id}</span>
        {agentClass && (
          <span className={`issue-card-agent ${agentClass}`} title={issue.dkToolHint || undefined}>
            {agentInitial}
          </span>
        )}
      </div>

      <div className="issue-card-title" title={issue.title}>
        {issue.title}
      </div>

      {tags.length > 0 && (
        <div className="issue-card-tags">
          {tags.map((tag) => (
            <span key={tag} className="issue-card-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default IssueCard;
