import React from "react";
import type { BeadsIssue } from "@/types";
import { IssueCard } from "./IssueCard";

interface IssueColumnProps {
  status: string;
  issues: BeadsIssue[];
  selectedIssueId?: string | null;
  onIssueClick?: (issue: BeadsIssue) => void;
  onIssueDoubleClick?: (issue: BeadsIssue) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, status: string) => void;
  isDragTarget?: boolean;
}

// Status display configuration
const STATUS_CONFIG: Record<string, { label: string; colorClass: string }> = {
  open: { label: "OPEN", colorClass: "open" },
  ready: { label: "READY", colorClass: "ready" },
  running: { label: "RUNNING", colorClass: "running" },
  blocked: { label: "BLOCKED", colorClass: "blocked" },
  done: { label: "DONE", colorClass: "done" },
  failed: { label: "FAILED", colorClass: "blocked" },
  escalated: { label: "ESCALATED", colorClass: "blocked" },
};

export function IssueColumn({
  status,
  issues,
  selectedIssueId,
  onIssueClick,
  onIssueDoubleClick,
  onDragOver,
  onDrop,
  isDragTarget = false,
}: IssueColumnProps) {
  const config = STATUS_CONFIG[status] || { label: status.toUpperCase(), colorClass: "" };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver?.(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDrop?.(e, status);
  };

  return (
    <div className="kanban-column">
      <div className={`kanban-column-header ${config.colorClass}`}>
        {config.label}
        <span className="text-tertiary ml-2">({issues.length})</span>
      </div>

      <div
        className={`kanban-column-cards kanban-drop-zone ${isDragTarget ? "active" : ""}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            selected={selectedIssueId === issue.id}
            onClick={() => onIssueClick?.(issue)}
            onDoubleClick={() => onIssueDoubleClick?.(issue)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("issue-id", issue.id);
              e.dataTransfer.setData("source-status", status);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default IssueColumn;
