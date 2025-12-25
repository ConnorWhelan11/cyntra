import { useEffect, useMemo } from "react";
import { ConstellationLayout } from "@/components/kernel/ConstellationLayout";
import { ModeRail } from "@/components/kernel/ModeRail";
import { InspectorDrawer } from "@/components/kernel/InspectorDrawer";
import { OutputStream } from "@/components/kernel/OutputStream";
import { WorkcellConstellationCanvas } from "@/components/kernel/WorkcellConstellationCanvas";
import { useConstellationState } from "@/components/kernel/useConstellationState";
import type {
  ActiveJobInfo,
  BeadsIssue,
  ChatMessage,
  KernelEvent,
  KernelSnapshot,
  KernelWorkcell,
  ProjectInfo,
} from "@/types";

function getProjectLabel(project: ProjectInfo): string {
  const parts = project.root.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? project.root;
}

interface KernelViewProps {
  activeProject: ProjectInfo | null;
  serverInfo: { base_url: string } | null;
  kernelSnapshot: KernelSnapshot | null;
  kernelCounts: { total: number; ready: number };
  kernelWorkcells: KernelWorkcell[];
  filteredKernelIssues: BeadsIssue[];
  kernelSelectedIssueId: string | null;
  selectedKernelIssue: BeadsIssue | null;
  selectedIssueWorkcells: KernelWorkcell[];
  kernelFilter: string;
  setKernelFilter: (filter: string) => void;
  kernelOnlyReady: boolean;
  setKernelOnlyReady: (only: boolean) => void;
  kernelOnlyActiveIssues: boolean;
  setKernelOnlyActiveIssues: (only: boolean) => void;
  setKernelSelectedIssueId: (id: string) => void;
  visibleKernelEvents: KernelEvent[];
  kernelEventsForSelectedIssue: boolean;
  setKernelEventsForSelectedIssue: (forSelected: boolean) => void;
  kernelRunId: string | null;
  kernelJobId: string | null;
  activeJobs: ActiveJobInfo[];
  jobOutputs: Record<string, string>;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (input: string) => void;
  setSelectedWorkcellId: (id: string | null) => void;
  refreshKernel: (root: string) => void;
  initBeads: () => void;
  setNewIssueTitle: (title: string) => void;
  setNewIssueDescription: (desc: string) => void;
  setNewIssueTags: (tags: string) => void;
  setNewIssuePriority: (priority: string) => void;
  setNewIssueToolHint: (hint: string) => void;
  setNewIssueRisk: (risk: string) => void;
  setNewIssueSize: (size: string) => void;
  setIsCreateIssueOpen: (open: boolean) => void;
  kernelInit: () => void;
  kernelRunOnce: () => void;
  kernelRunWatch: () => void;
  kernelStop: () => void;
  setIssueStatus: (issueId: string, status: string) => void;
  kernelRunIssueOnce: (issueId: string) => void;
  restartIssue: (issue: BeadsIssue) => void;
  createTerminalAt: (path: string) => void;
  setIssueToolHint: (issueId: string, hint: string | null) => void;
  toggleIssueTag: (issue: BeadsIssue, tag: string) => void;
  sendChat: () => void;
}

/**
 * Kernel Dashboard - Workcell Constellation View
 *
 * 3D visualization of workcells as a constellation graph with:
 * - Full-bleed R3F canvas background
 * - Mode rail on left (Browse/Watch/Triage)
 * - Inspector drawer on right (Issue/Workcell/Run tabs)
 * - Output stream dock at bottom
 */
export function KernelView(props: KernelViewProps) {
  const {
    activeProject,
    serverInfo,
    kernelSnapshot,
    kernelCounts,
    kernelWorkcells,
    filteredKernelIssues,
    visibleKernelEvents,
    kernelRunId,
    kernelJobId,
    activeJobs,
    jobOutputs,
    setSelectedWorkcellId,
    setIssueStatus,
    kernelRunIssueOnce,
    createTerminalAt,
    setIssueToolHint,
  } = props;

  // Constellation state management
  const constellation = useConstellationState(kernelSnapshot);

  // Keep legacy external selection in sync with constellation selection (Escape, deselect, etc).
  useEffect(() => {
    setSelectedWorkcellId(constellation.selectedWorkcellId);
  }, [constellation.selectedWorkcellId, setSelectedWorkcellId]);

  // Sync external selection with constellation state
  // (bidirectional sync for compatibility with existing app state)
  const handleSelectNode = (id: string | null) => {
    if (id === null) {
      constellation.escape();
      return;
    }

    constellation.selectWorkcell(id);
  };

  const handleHoverNode = (id: string | null) => {
    constellation.hoverWorkcell(id);
  };

  const handleOpenRunDetails = () => {
    constellation.setInspectorOpen(true);
    constellation.setInspectorTab("run");
  };

  const handleClearFilter = () => {
    constellation.escape();
  };

  // Compute counts for mode rail
  const runningCount = useMemo(
    () => kernelWorkcells.filter((w) => w.proofStatus?.toLowerCase().includes("running")).length,
    [kernelWorkcells]
  );

  const failedCount = useMemo(
    () =>
      kernelWorkcells.filter(
        (w) =>
          w.proofStatus?.toLowerCase().includes("fail") ||
          w.proofStatus?.toLowerCase().includes("error")
      ).length,
    [kernelWorkcells]
  );

  const isRunning = !!kernelJobId;

  // Get logs for current run
  const currentLogs = kernelRunId ? (jobOutputs[kernelRunId] ?? "") : "";

  // Header with status and controls
  const header = (
    <div className="constellation-header-content">
        <div className="constellation-header-left">
          <span className={`constellation-status-indicator ${isRunning ? "running" : ""}`} />
          <span className="constellation-title">
            {activeProject ? getProjectLabel(activeProject) : "Kernel"}
          </span>
          {isRunning && (
            <span className="constellation-status-badge running">Running</span>
          )}
        {activeJobs.length > 0 && (
          <span className="constellation-job-count">
            {activeJobs.length} job{activeJobs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="constellation-header-right">
        <span className="constellation-stat">
          <span className="constellation-stat-value">{kernelCounts.total}</span>
          <span className="constellation-stat-label">issues</span>
        </span>
        <span className="constellation-stat">
          <span className="constellation-stat-value">{kernelWorkcells.length}</span>
          <span className="constellation-stat-label">workcells</span>
        </span>
      </div>
    </div>
  );

  // Empty state - no project selected
  if (!activeProject) {
    return (
      <ConstellationLayout
        state={constellation}
        header={header}
        modeRail={
          <ModeRail
            state={constellation}
            issueCount={0}
            workcellCount={0}
            runningCount={0}
            failedCount={0}
          />
        }
        canvas={
          <WorkcellConstellationCanvas
            state={constellation}
            onSelectNode={handleSelectNode}
            onHoverNode={handleHoverNode}
          />
        }
        inspector={
          <InspectorDrawer
            state={constellation}
            issues={[]}
            workcells={[]}
            runId={kernelRunId}
            projectRoot={null}
          />
        }
        outputStream={
          <OutputStream
            events={[]}
            logs=""
            isRunning={false}
            runId={null}
            projectRoot={null}
            serverBaseUrl={serverInfo?.base_url ?? ""}
            filterWorkcellId={null}
            filterIssueId={null}
            onClearFilter={handleClearFilter}
            onOpenRunDetails={handleOpenRunDetails}
          />
        }
      />
    );
  }

  return (
    <ConstellationLayout
      state={constellation}
      header={header}
      modeRail={
        <ModeRail
          state={constellation}
          issueCount={kernelCounts.total}
          workcellCount={kernelWorkcells.length}
          runningCount={runningCount}
          failedCount={failedCount}
        />
      }
      canvas={
        <WorkcellConstellationCanvas
          state={constellation}
          onSelectNode={handleSelectNode}
          onHoverNode={handleHoverNode}
        />
      }
      inspector={
        <InspectorDrawer
          state={constellation}
          issues={filteredKernelIssues}
          workcells={kernelWorkcells}
          runId={kernelRunId}
          projectRoot={activeProject.root}
          onSetIssueStatus={setIssueStatus}
          onRunIssue={kernelRunIssueOnce}
          onSetToolHint={setIssueToolHint}
          onOpenTerminal={createTerminalAt}
        />
      }
      outputStream={
        <OutputStream
          events={visibleKernelEvents}
          logs={currentLogs}
          isRunning={isRunning}
          runId={kernelRunId}
          projectRoot={activeProject.root}
          serverBaseUrl={serverInfo?.base_url ?? ""}
          filterWorkcellId={constellation.selectedWorkcellId}
          filterIssueId={constellation.selectedIssueId}
          onClearFilter={handleClearFilter}
          onOpenRunDetails={handleOpenRunDetails}
        />
      }
    />
  );
}
