import React, { useState, useMemo } from "react";
import type { BeadsIssue } from "@/types";
import { IssueColumn } from "./IssueColumn";

interface IssueBoardProps {
  issues: BeadsIssue[];
  selectedIssueId?: string | null;
  onIssueSelect?: (issue: BeadsIssue) => void;
  onIssueOpen?: (issue: BeadsIssue) => void;
  onStatusChange?: (issueId: string, newStatus: string) => void;
}

const COLUMN_ORDER = ["open", "ready", "running", "blocked", "done"];

export function IssueBoard({
  issues,
  selectedIssueId,
  onIssueSelect,
  onIssueOpen,
  onStatusChange,
}: IssueBoardProps) {
  const [dragTargetStatus, setDragTargetStatus] = useState<string | null>(null);

  // Group issues by status
  const issuesByStatus = useMemo(() => {
    const grouped: Record<string, BeadsIssue[]> = {};
    for (const status of COLUMN_ORDER) {
      grouped[status] = [];
    }
    for (const issue of issues) {
      const status = issue.status || "open";
      if (!grouped[status]) {
        grouped[status] = [];
      }
      grouped[status].push(issue);
    }
    return grouped;
  }, [issues]);

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragTargetStatus(status);
  };

  const handleDragLeave = () => {
    setDragTargetStatus(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const issueId = e.dataTransfer.getData("issue-id");
    const sourceStatus = e.dataTransfer.getData("source-status");

    if (issueId && sourceStatus !== newStatus) {
      onStatusChange?.(issueId, newStatus);
    }

    setDragTargetStatus(null);
  };

  return (
    <div className="kanban-board" onDragLeave={handleDragLeave}>
      {COLUMN_ORDER.map((status) => (
        <IssueColumn
          key={status}
          status={status}
          issues={issuesByStatus[status] || []}
          selectedIssueId={selectedIssueId}
          onIssueClick={onIssueSelect}
          onIssueDoubleClick={onIssueOpen}
          onDragOver={(e) => handleDragOver(e, status)}
          onDrop={handleDrop}
          isDragTarget={dragTargetStatus === status}
        />
      ))}
    </div>
  );
}

export default IssueBoard;
