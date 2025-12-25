import React from "react";
import type { WorkcellInfo } from "@/types";

interface WorkcellBarProps {
  workcell: WorkcellInfo;
  onClick?: () => void;
}

// Map toolchain to agent color class
function getAgentClass(toolchain: string | null | undefined): string {
  if (!toolchain) return "";
  const tc = toolchain.toLowerCase();
  if (tc.includes("claude")) return "claude";
  if (tc.includes("codex")) return "codex";
  if (tc.includes("opencode")) return "opencode";
  if (tc.includes("crush")) return "crush";
  return "";
}

export function WorkcellBar({ workcell, onClick }: WorkcellBarProps) {
  const isIdle = workcell.state === "idle" || !workcell.issueId;
  const isRunning = workcell.state === "running";
  const isComplete = workcell.state === "complete" || workcell.state === "done";
  const isFailed = workcell.state === "failed" || workcell.state === "error";

  const agentClass = getAgentClass(workcell.toolchain);

  // Estimate progress (0-100)
  // In a real implementation, this would come from the workcell data
  const progress = isComplete ? 100 : isRunning ? 65 : isFailed ? 100 : 0;

  const progressClass = isFailed ? "failed" : isComplete ? "complete" : "running";

  return (
    <div
      className={`workcell-bar ${isIdle ? "idle" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <span className="workcell-bar-name">{workcell.id}</span>

      {isIdle ? (
        <span className="workcell-bar-info">idle</span>
      ) : (
        <>
          <div className="workcell-bar-progress workcell-progress">
            <div
              className={`workcell-bar-fill ${progressClass}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="workcell-bar-info">
            <span className="issue-id">#{workcell.issueId}</span>
            {agentClass && (
              <span className={`agent-indicator-dot ${agentClass}`} />
            )}
            <span>{workcell.toolchain}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default WorkcellBar;
