import type { GlyphState } from "../Glyph/types";
import type { GraphNodeId, GraphSnapshot } from "../Graph3D/types";

/**
 * Block type for styling
 */
export type ScheduledBlockType = "task" | "habit" | "meeting" | "deepWork" | "buffer";

/**
 * A scheduled block in the week
 */
export interface ScheduledBlock {
  id: string;
  nodeIds: GraphNodeId[];
  dayIndex: number; // 0=Mon, 6=Sun
  order: number; // Position within day
  duration: number; // Minutes
  type: ScheduledBlockType;
  label: string;
  description?: string;
}

/**
 * A habit template that can be dropped as a block
 */
export interface HabitTemplate {
  id: string;
  label: string;
  steps: { nodeId: string; duration: number; label: string }[];
  totalDuration: number;
  recurrence: "daily" | "weekdays" | "weekends" | "custom";
}

/**
 * A suggestion for the week
 */
export interface WeekSuggestion {
  id: string;
  label: string;
  type: ScheduledBlockType;
  duration: number;
  nodeId?: GraphNodeId;
  source: "habit" | "goal" | "ai";
}

/**
 * Props for the WeekLens component
 */
export interface WeekLensProps {
  /** The graph snapshot */
  graph: GraphSnapshot;

  /** Monday of target week */
  weekStart: Date;

  /** Optional goal to prioritize */
  goalBias?: GraphNodeId;

  /** Habit templates */
  habitTemplates?: HabitTemplate[];

  /** Pre-placed blocks */
  existingSchedule?: ScheduledBlock[];

  /** Custom class for container */
  className?: string;

  // --- Callbacks ---

  /** Called when schedule changes */
  onScheduleChange?: (blocks: ScheduledBlock[]) => void;

  /** Called when a block is moved */
  onBlockMove?: (blockId: string, newDay: number, newOrder: number) => void;

  /** Called when a block is added */
  onBlockAdd?: (block: Omit<ScheduledBlock, "id">) => void;

  /** Called when a block is removed */
  onBlockRemove?: (blockId: string) => void;

  /** Called when a day is selected (go to Today) */
  onDaySelect?: (dayIndex: number) => void;

  /** Called when user wants to see a node in Graph */
  onGraphFocus?: (nodeId: GraphNodeId) => void;

  /** Called when done planning */
  onDone?: () => void;
}

/**
 * Day names
 */
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Block type colors
 */
export const BLOCK_TYPE_COLORS: Record<
  ScheduledBlockType,
  { bg: string; border: string; text: string }
> = {
  task: {
    bg: "bg-blue-500/20",
    border: "border-blue-400/40",
    text: "text-blue-300",
  },
  habit: {
    bg: "bg-teal-500/20",
    border: "border-teal-400/40",
    text: "text-teal-300",
  },
  meeting: {
    bg: "bg-gray-500/20",
    border: "border-gray-400/40",
    text: "text-gray-300",
  },
  deepWork: {
    bg: "bg-purple-500/20",
    border: "border-purple-400/40",
    text: "text-purple-300",
  },
  buffer: {
    bg: "bg-green-500/20",
    border: "border-green-400/40",
    text: "text-green-300",
  },
};

/**
 * Block type icons
 */
export const BLOCK_TYPE_ICONS: Record<ScheduledBlockType, string> = {
  task: "○",
  habit: "↻",
  meeting: "◷",
  deepWork: "◉",
  buffer: "~",
};

/**
 * Get date for a day index
 */
export function getDayDate(weekStart: Date, dayIndex: number): Date {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayIndex);
  return date;
}

/**
 * Format date for header
 */
export function formatWeekRange(weekStart: Date): string {
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);

  const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short" });
  const startDay = weekStart.getDate();
  const endDay = endDate.getDate();
  const year = weekStart.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

/**
 * Compute total hours for a day
 */
export function computeDayHours(blocks: ScheduledBlock[], dayIndex: number): number {
  return blocks.filter((b) => b.dayIndex === dayIndex).reduce((sum, b) => sum + b.duration, 0) / 60;
}

/**
 * Get Glyph context for Week
 */
export function getWeekGlyphContext(
  blocks: ScheduledBlock[],
  goalBias?: GraphNodeId
): { state: GlyphState; dialogue: string } {
  if (blocks.length === 0) {
    return {
      state: "responding",
      dialogue: "Your week is a blank canvas. Start with a goal or habit.",
    };
  }

  // Find empty days
  const dayHours = Array.from({ length: 7 }, (_, i) => computeDayHours(blocks, i));
  const emptyDays = dayHours.filter((h) => h === 0).length;

  if (emptyDays >= 3) {
    return {
      state: "thinking",
      dialogue: `${emptyDays} days are empty. Want me to help fill them?`,
    };
  }

  // Check for overloaded days
  const overloaded = dayHours.findIndex((h) => h > 10);
  if (overloaded >= 0) {
    return {
      state: "responding",
      dialogue: `${DAY_NAMES[overloaded]} looks heavy (${dayHours[overloaded].toFixed(1)}h). Consider spreading out.`,
    };
  }

  if (goalBias) {
    return {
      state: "responding",
      dialogue: "I've surfaced tasks for your goal. Add what fits.",
    };
  }

  return {
    state: "idle",
    dialogue: "Drag blocks to plan your week.",
  };
}
