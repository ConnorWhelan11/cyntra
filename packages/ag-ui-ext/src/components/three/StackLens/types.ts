import type { GraphNodeId } from "../Graph3D/types";
import type { GlyphState } from "../Glyph/types";

/**
 * Stack task status
 */
export type TaskStatus = "pending" | "active" | "done" | "skipped";

/**
 * Timer status
 */
export type TimerStatus = "idle" | "running" | "paused" | "complete" | "overtime";

/**
 * A single task in the Stack
 */
export interface StackTask {
  /** Unique task ID */
  id: string;

  /** Underlying graph node ID */
  nodeId: GraphNodeId;

  /** Display label */
  label: string;

  /** Optional description */
  description?: string;

  /** Planned duration in minutes */
  plannedDuration: number;

  /** Current status */
  status: TaskStatus;

  /** When the task was started */
  startedAt?: Date;

  /** When the task was completed */
  completedAt?: Date;

  /** Elapsed seconds (for pause/resume) */
  elapsedSeconds?: number;
}

/**
 * Timer state
 */
export interface TimerState {
  status: TimerStatus;
  elapsedSeconds: number;
  plannedSeconds: number;
  startedAt: Date | null;
  pausedAt: Date | null;
}

/**
 * Enforcement state from Leaks
 */
export interface EnforcementState {
  active: boolean;
  suppressedNodeIds: GraphNodeId[];
  suppressedSites?: string[];
  endsAt: Date;
}

/**
 * Props for the StackLens component
 */
export interface StackLensProps {
  /** Parent block ID from Today */
  blockId: string;

  /** Block label for header */
  blockLabel?: string;

  /** Ordered task list (1-3 items) */
  tasks: StackTask[];

  /** Current enforcement state from Leaks */
  enforcementState?: EnforcementState;

  /** Current time for timer calculations */
  currentTime?: Date;

  /** Custom class for container */
  className?: string;

  // --- Callbacks ---

  /** Called when a task starts */
  onTaskStart?: (taskId: string) => void;

  /** Called when timer is paused */
  onTaskPause?: (taskId: string) => void;

  /** Called when timer is resumed */
  onTaskResume?: (taskId: string) => void;

  /** Called when a task is completed */
  onTaskComplete?: (taskId: string) => void;

  /** Called when a task is skipped */
  onTaskSkip?: (taskId: string, reason?: string) => void;

  /** Called when tasks are reordered */
  onReorder?: (orderedTaskIds: string[]) => void;

  /** Called when user triggers distraction mode */
  onDistractionTrigger?: () => void;

  /** Called when enforcement is toggled */
  onEnforcementToggle?: (enabled: boolean) => void;

  /** Called when all tasks complete (triggers Debrief) */
  onBlockComplete?: () => void;

  /** Called when user wants to zoom out to Today */
  onZoomOut?: () => void;

  /** Called when user wants to show context in Graph */
  onShowContext?: (nodeId: GraphNodeId) => void;
}

/**
 * Timer color based on state
 */
export function getTimerColor(remaining: number, planned: number): "green" | "amber" | "red" {
  if (remaining <= 0) return "red";
  const percentRemaining = remaining / planned;
  if (percentRemaining <= 0.2) return "amber";
  return "green";
}

/**
 * Format seconds to MM:SS
 */
export function formatTime(seconds: number): string {
  const absSeconds = Math.abs(Math.floor(seconds));
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  const sign = seconds < 0 ? "-" : "";
  return `${sign}${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get Glyph context based on stack state
 */
export function getStackGlyphContext(
  tasks: StackTask[],
  timerState: TimerState
): { state: GlyphState; dialogue: string } {
  const activeTask = tasks.find((t) => t.status === "active");
  const allDone = tasks.every((t) => t.status === "done" || t.status === "skipped");
  const remaining = timerState.plannedSeconds - timerState.elapsedSeconds;

  // All tasks complete
  if (allDone) {
    return {
      state: "success",
      dialogue: "Stack cleared! Time for a break?",
    };
  }

  // Timer complete
  if (timerState.status === "complete") {
    return {
      state: "success",
      dialogue: "Nice work! Ready for next?",
    };
  }

  // Overtime
  if (timerState.status === "overtime") {
    return {
      state: "responding",
      dialogue: "Running over. Wrap up or extend?",
    };
  }

  // 5 minute warning
  if (remaining <= 300 && remaining > 0 && timerState.status === "running") {
    return {
      state: "thinking",
      dialogue: `${Math.ceil(remaining / 60)} minutes left. Wrap up or extend?`,
    };
  }

  // Task started
  if (activeTask && timerState.status === "running") {
    const minsLeft = Math.ceil(remaining / 60);
    return {
      state: "idle",
      dialogue: `Deep in it. ${minsLeft} minutes left. You got this.`,
    };
  }

  // Paused
  if (timerState.status === "paused") {
    return {
      state: "idle",
      dialogue: "Paused. Ready when you are.",
    };
  }

  // Default
  return {
    state: "responding",
    dialogue: "Let's do this. Ready to start?",
  };
}

/**
 * Create initial timer state from a task
 */
export function createTimerState(task: StackTask): TimerState {
  return {
    status: "idle",
    elapsedSeconds: task.elapsedSeconds ?? 0,
    plannedSeconds: task.plannedDuration * 60,
    startedAt: null,
    pausedAt: null,
  };
}
