import { KernelGlyph } from "@/components/shared/KernelGlyph";
import { Button } from "@/components/ui/Button";

interface KernelHeaderProps {
  isRunning: boolean;
  hasError: boolean;
  issueCount: number;
  readyCount: number;
  workcellCount: number;
  beadsPresent: boolean;
  jobCount: number;
  hasProject: boolean;
  onRefresh: () => void;
  onInitBeads: () => void;
  onNewIssue: () => void;
  onInitKernel: () => void;
  onRunOnce: () => void;
  onWatch: () => void;
  onStop: () => void;
}

export function KernelHeader({
  isRunning,
  hasError,
  issueCount,
  readyCount,
  workcellCount,
  beadsPresent,
  jobCount,
  hasProject,
  onRefresh,
  onInitBeads,
  onNewIssue,
  onInitKernel,
  onRunOnce,
  onWatch,
  onStop,
}: KernelHeaderProps) {
  const glyphState = hasError
    ? "error"
    : isRunning
      ? "running"
      : "idle";

  return (
    <header className="kernel-header">
      <div className="kernel-header-left">
        <div className="kernel-header-glyph">
          <KernelGlyph state={glyphState} size="lg" />
        </div>
        <div className="kernel-header-title">
          <h1>Kernel</h1>
          <div className="kernel-header-stats">
            <span className="kernel-stat">
              <span className="kernel-stat-value">{issueCount}</span>
              <span className="kernel-stat-label">issues</span>
            </span>
            <span className="kernel-stat-divider" />
            <span className="kernel-stat">
              <span className="kernel-stat-value kernel-stat-ready">{readyCount}</span>
              <span className="kernel-stat-label">ready</span>
            </span>
            <span className="kernel-stat-divider" />
            <span className="kernel-stat">
              <span className="kernel-stat-value">{workcellCount}</span>
              <span className="kernel-stat-label">workcells</span>
            </span>
            <span className="kernel-stat-divider" />
            <span className="kernel-stat">
              <span className={`kernel-stat-indicator ${beadsPresent ? "active" : ""}`} />
              <span className="kernel-stat-label">beads</span>
            </span>
            {jobCount > 0 && (
              <>
                <span className="kernel-stat-divider" />
                <span className="kernel-stat">
                  <span className="kernel-stat-value kernel-stat-active">{jobCount}</span>
                  <span className="kernel-stat-label">jobs</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="kernel-header-actions">
        <Button
          variant="ghost"
          onClick={onRefresh}
          disabled={!hasProject}
        >
          Refresh
        </Button>
        <Button
          variant="ghost"
          onClick={onInitBeads}
          disabled={!hasProject}
        >
          Init Beads
        </Button>
        <Button
          variant="primary"
          onClick={onNewIssue}
          disabled={!hasProject}
        >
          New Issue
        </Button>
        <Button
          variant="ghost"
          onClick={onInitKernel}
          disabled={!hasProject}
        >
          Init
        </Button>
        <Button
          variant="ghost"
          onClick={onRunOnce}
          disabled={!hasProject}
        >
          Run Once
        </Button>
        {!isRunning ? (
          <Button
            variant="primary"
            onClick={onWatch}
            disabled={!hasProject}
          >
            Watch
          </Button>
        ) : (
          <Button
            variant="destructive"
            onClick={onStop}
          >
            Stop
          </Button>
        )}
      </div>
    </header>
  );
}
