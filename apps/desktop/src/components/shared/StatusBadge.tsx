import React from "react";

type Status =
  | "open"
  | "ready"
  | "running"
  | "blocked"
  | "done"
  | "failed"
  | "success"
  | "error"
  | "pending"
  | "active"
  | "idle"
  | "escalated"
  | string;

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

// Map various status names to badge classes
function getStatusClass(status: string): string {
  const s = status.toLowerCase();

  if (["ready", "done", "success", "complete", "passed"].includes(s)) {
    return "ready";
  }
  if (["failed", "fail", "blocked", "error", "escalated", "rejected"].includes(s)) {
    return "failed";
  }
  if (["running", "active", "in_progress", "processing"].includes(s)) {
    return "running";
  }
  if (["pending", "waiting", "queued"].includes(s)) {
    return "warning";
  }

  return "";
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const statusClass = getStatusClass(status);

  return (
    <span className={`mc-badge ${statusClass} ${className}`}>
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export default StatusBadge;
