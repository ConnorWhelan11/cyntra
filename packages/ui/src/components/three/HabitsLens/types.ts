import type { GlyphState } from "../Glyph/types";
import type { GraphNodeId } from "../Graph3D/types";

/**
 * Habit category (orbit type)
 */
export type HabitCategory = "morning" | "evening" | "weekly" | "custom";

/**
 * Recurrence rule type
 */
export type RecurrenceType =
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "custom";

/**
 * Instance status
 */
export type HabitInstanceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "partial"
  | "missed";

/**
 * Step result
 */
export type StepResult = "done" | "skipped" | "pending";

/**
 * A step in a habit template
 */
export interface HabitStep {
  id: string;
  label: string;
  duration: number; // Minutes
  optional: boolean;
  nodeId?: GraphNodeId;
  order: number;
}

/**
 * Recurrence rule
 */
export interface RecurrenceRule {
  type: RecurrenceType;
  daysOfWeek?: number[]; // 0=Sun, 6=Sat
  frequency?: number;
}

/**
 * A habit template
 */
export interface HabitTemplate {
  id: string;
  label: string;
  category: HabitCategory;
  steps: HabitStep[];
  totalDuration: number;
  recurrence: RecurrenceRule;
  createdAt: Date;
  lastModified: Date;
}

/**
 * A scheduled instance of a habit
 */
export interface HabitInstance {
  id: string;
  templateId: string;
  scheduledDate: Date;
  status: HabitInstanceStatus;
  stepResults: Map<string, StepResult>;
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
}

/**
 * Streak information
 */
export interface StreakInfo {
  templateId: string;
  currentStreak: number;
  bestStreak: number;
  hitRate: number; // 0-1, last 30 days
  lastCompleted: Date | null;
  lastMissed: Date | null;
}

/**
 * Props for the HabitsLens component
 */
export interface HabitsLensProps {
  /** Habit templates */
  templates: HabitTemplate[];

  /** Scheduled/completed instances */
  instances?: HabitInstance[];

  /** Streak data */
  streakData?: Map<string, StreakInfo>;

  /** Current date */
  currentDate?: Date;

  /** Custom class for container */
  className?: string;

  // --- Callbacks ---

  /** Called when a template is created */
  onTemplateCreate?: (template: Omit<HabitTemplate, "id">) => void;

  /** Called when a template is edited */
  onTemplateEdit?: (
    templateId: string,
    updates: Partial<HabitTemplate>
  ) => void;

  /** Called when a template is deleted */
  onTemplateDelete?: (templateId: string) => void;

  /** Called when adding to Week */
  onAddToWeek?: (templateId: string, targetDate: Date) => void;

  /** Called when starting now */
  onStartNow?: (templateId: string) => void;

  /** Called when viewing in Graph */
  onViewInGraph?: (nodeId: GraphNodeId) => void;
}

/**
 * Category icons
 */
export const CATEGORY_ICONS: Record<HabitCategory, string> = {
  morning: "☀️",
  evening: "🌙",
  weekly: "⚓",
  custom: "⭐",
};

/**
 * Category colors
 */
export const CATEGORY_COLORS: Record<
  HabitCategory,
  { bg: string; border: string; text: string; gradient: string }
> = {
  morning: {
    bg: "bg-amber-500/10",
    border: "border-amber-400/30",
    text: "text-amber-300",
    gradient: "from-amber-500/20 to-orange-500/10",
  },
  evening: {
    bg: "bg-indigo-500/10",
    border: "border-indigo-400/30",
    text: "text-indigo-300",
    gradient: "from-indigo-500/20 to-purple-500/10",
  },
  weekly: {
    bg: "bg-slate-500/10",
    border: "border-slate-400/30",
    text: "text-slate-300",
    gradient: "from-slate-500/20 to-gray-500/10",
  },
  custom: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-400/30",
    text: "text-cyan-300",
    gradient: "from-cyan-500/20 to-teal-500/10",
  },
};

/**
 * Compute total duration from steps
 */
export function computeTotalDuration(steps: HabitStep[]): number {
  return steps.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Get Glyph context for Habits
 */
export function getHabitsGlyphContext(
  templates: HabitTemplate[],
  streakData?: Map<string, StreakInfo>
): { state: GlyphState; dialogue: string } {
  if (templates.length === 0) {
    return {
      state: "responding",
      dialogue: "No rituals yet. Start with a morning routine?",
    };
  }

  // Check for broken streaks
  if (streakData) {
    const brokenStreaks = Array.from(streakData.values()).filter(
      (s) => s.lastMissed && s.currentStreak === 0
    );

    if (brokenStreaks.length > 0) {
      return {
        state: "responding",
        dialogue: "Some routines need attention. Want to simplify them?",
      };
    }

    // Check for strong streaks
    const strongStreaks = Array.from(streakData.values()).filter(
      (s) => s.currentStreak >= 7
    );

    if (strongStreaks.length > 0) {
      const best = Math.max(...strongStreaks.map((s) => s.currentStreak));
      return {
        state: "success",
        dialogue: `${best} days strong! Your rituals shape your days.`,
      };
    }
  }

  return {
    state: "idle",
    dialogue: "Your rituals shape your days.",
  };
}

/**
 * Format hit rate as percentage
 */
export function formatHitRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Get streak emoji based on length
 */
export function getStreakEmoji(streak: number): string {
  if (streak >= 30) return "🔥🔥🔥";
  if (streak >= 14) return "🔥🔥";
  if (streak >= 7) return "🔥";
  if (streak >= 3) return "✨";
  return "";
}
