import { AgentIndicator } from "@/components/shared/AgentIndicator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { KernelWorkcell } from "@/types";

interface WorkcellBarProps {
  workcell: KernelWorkcell;
  onViewDetails: () => void;
  onOpenTerminal: () => void;
}

function WorkcellBar({ workcell, onViewDetails, onOpenTerminal }: WorkcellBarProps) {
  // Determine progress state
  const isRunning = !workcell.proofStatus || workcell.proofStatus === "running";
  const isFailed = workcell.proofStatus === "failed";
  const isComplete = workcell.proofStatus === "passed" || workcell.proofStatus === "success";

  const progressClass = isFailed ? "failed" : isComplete ? "complete" : isRunning ? "running" : "";

  return (
    <div className={`workcell-bar-item ${progressClass}`}>
      <div className="workcell-bar-info">
        <span className="workcell-bar-id">{workcell.id.slice(-12)}</span>
        <span className="workcell-bar-issue">#{workcell.issueId}</span>
        {workcell.toolchain && (
          <AgentIndicator agent={workcell.toolchain} showLabel={false} size="sm" />
        )}
      </div>

      <div className="workcell-bar-progress">
        <div
          className={`workcell-bar-fill ${progressClass}`}
          style={{ width: isComplete ? "100%" : isFailed ? "100%" : "60%" }}
        />
      </div>

      <div className="workcell-bar-status">
        {workcell.proofStatus && (
          <StatusBadge status={workcell.proofStatus} />
        )}
      </div>

      <div className="workcell-bar-actions">
        <button
          type="button"
          className="mc-btn-icon"
          onClick={onViewDetails}
          title="View Details"
        >
          info
        </button>
        <button
          type="button"
          className="mc-btn-icon"
          onClick={onOpenTerminal}
          title="Open Terminal"
        >
          terminal
        </button>
      </div>
    </div>
  );
}

interface WorkcellGridProps {
  workcells: KernelWorkcell[];
  onViewDetails: (id: string) => void;
  onOpenTerminal: (path: string) => void;
}

export function WorkcellGrid({
  workcells,
  onViewDetails,
  onOpenTerminal,
}: WorkcellGridProps) {
  return (
    <div className="mc-panel workcell-grid-panel">
      <div className="mc-panel-header">
        <span className="mc-panel-title">Workcells</span>
        <span className="workcell-grid-count">{workcells.length}</span>
      </div>

      <div className="workcell-grid-content">
        {workcells.length === 0 ? (
          <div className="workcell-grid-empty">
            <span className="workcell-grid-empty-icon">layers</span>
            <span>No active workcells</span>
          </div>
        ) : (
          <div className="workcell-grid-list stagger-list">
            {workcells.map((wc) => (
              <WorkcellBar
                key={wc.id}
                workcell={wc}
                onViewDetails={() => onViewDetails(wc.id)}
                onOpenTerminal={() => onOpenTerminal(wc.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
