export interface MissionStep {
  id: string;
  title: string;
  status: "pending" | "active" | "done";
}

export interface MissionState {
  missionId: string | null;
  userId: string | null;
  status: "idle" | "running" | "paused" | "completed";
  currentStepId: string | null;
  steps: MissionStep[];
  startedAt: number | null;
  completedAt: number | null;
}

export interface MissionRunnerShellProps {
  missionState: MissionState;
  onStart: () => void;
  onAdvance: () => void;
  onPause: () => void;
  onResume: () => void;
  initialSteps: MissionStep[];
}

export function MissionRunnerShell({
  missionState,
  onStart,
  onAdvance,
  onPause,
  onResume,
  initialSteps,
}: MissionRunnerShellProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "idle":
        return "bg-gray-500";
      case "running":
        return "bg-green-500";
      case "paused":
        return "bg-yellow-500";
      case "completed":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStepIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case "done":
        return "✓";
      case "active":
        return "▶";
      default:
        return "○";
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b pb-2">
        <h3 className="text-lg font-semibold">Mission Runner</h3>
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${getStatusColor(missionState.status)}`} />
          <span className="text-sm font-medium capitalize">{missionState.status}</span>
        </div>
      </div>

      {/* Steps */}
      <div className="mb-4 flex-1 space-y-2 overflow-y-auto">
        {missionState.status === "idle" && initialSteps.length > 0 ? (
          <div className="space-y-2">
            <p className="mb-2 text-sm text-muted-foreground">Ready to start mission</p>
            {initialSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 rounded-md border p-3">
                <span className="text-lg">○</span>
                <span className="text-sm">{step.title}</span>
              </div>
            ))}
          </div>
        ) : missionState.steps.length > 0 ? (
          missionState.steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-md border p-3 ${
                step.status === "active"
                  ? "border-primary bg-primary/10"
                  : step.status === "done"
                    ? "border-green-500 bg-green-500/10"
                    : "bg-muted"
              }`}
            >
              <span className="text-lg">{getStepIcon(step.status)}</span>
              <span className="text-sm">{step.title}</span>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No mission loaded
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {missionState.status === "idle" && (
          <button
            onClick={onStart}
            disabled={initialSteps.length === 0}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Start Mission
          </button>
        )}

        {missionState.status === "running" && (
          <>
            <button
              onClick={onAdvance}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Next Step
            </button>
            <button
              onClick={onPause}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Pause
            </button>
          </>
        )}

        {missionState.status === "paused" && (
          <button
            onClick={onResume}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Resume
          </button>
        )}

        {missionState.status === "completed" && (
          <div className="flex flex-1 items-center justify-center rounded-md bg-blue-500/10 py-2 text-sm font-medium text-blue-500">
            Mission Completed! 🎉
          </div>
        )}
      </div>

      {/* Timestamps */}
      {missionState.startedAt && (
        <div className="mt-4 border-t pt-2 text-xs text-muted-foreground">
          <div>Started: {new Date(missionState.startedAt).toLocaleString()}</div>
          {missionState.completedAt && (
            <div>Completed: {new Date(missionState.completedAt).toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  );
}
