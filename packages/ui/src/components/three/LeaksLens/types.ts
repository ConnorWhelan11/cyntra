import type { GraphNodeId, GraphSnapshot } from "../Graph3D/types";
import type { GlyphState } from "../Glyph/types";

/**
 * Telemetry signal source
 */
export type TelemetrySource = "tab_switch" | "app_open" | "url_visit" | "manual";

/**
 * Leak severity based on recency
 */
export type LeakSeverity = "hot" | "warm" | "cool";

/**
 * Action for a leak item
 */
export type LeakAction = "block" | "mute" | "allow";

/**
 * Enforcement level
 */
export type EnforcementLevel = "soft" | "medium" | "hard";

/**
 * Duration preset in minutes
 */
export type DurationPreset = 25 | 50 | 90 | "custom";

/**
 * Telemetry signal
 */
export interface TelemetrySignal {
  nodeId: GraphNodeId;
  timestamp: Date;
  source: TelemetrySource;
  duration?: number; // Seconds spent
}

/**
 * A distraction node
 */
export interface DistractionNode {
  nodeId: GraphNodeId;
  label: string;
  severity: LeakSeverity;
  lastAccessed?: Date;
  totalTimeToday?: number; // Minutes
  sites?: string[]; // Associated URLs
  apps?: string[]; // Associated apps
  action?: LeakAction; // Current action setting
}

/**
 * Suppression configuration
 */
export interface SuppressionConfig {
  targetNodeIds: GraphNodeId[];
  duration: number; // Minutes
  enforcement: EnforcementLevel;
  blockedSites?: string[];
  blockedApps?: string[];
  startedAt: Date;
  endsAt: Date;
}

/**
 * Enforcement state
 */
export interface EnforcementState {
  active: boolean;
  config: SuppressionConfig | null;
  remainingSeconds: number;
  suppressedNodeIds: GraphNodeId[];
  blockedUrls: string[];
  violationCount: number;
}

/**
 * Props for the LeaksLens component
 */
export interface LeaksLensProps {
  /** The graph snapshot */
  graph: GraphSnapshot;

  /** Current focus node (NOW or active task) */
  focusNodeId: GraphNodeId;

  /** Goal being worked toward */
  goalNodeId?: GraphNodeId;

  /** Path from NOW to goal */
  focusedPath?: GraphNodeId[];

  /** Detected distractions */
  distractions: DistractionNode[];

  /** Telemetry data */
  telemetryData?: TelemetrySignal[];

  /** Custom class for container */
  className?: string;

  // --- Callbacks ---

  /** Called when suppression is confirmed */
  onSuppressionConfirm?: (config: SuppressionConfig) => void;

  /** Called when cancelled */
  onSuppressionCancel?: () => void;

  /** Called when a leak action changes */
  onLeakToggle?: (nodeId: GraphNodeId, action: LeakAction) => void;

  /** Called when user wants to see why something is a leak */
  onShowWhy?: (nodeId: GraphNodeId) => void;

  /** Called when duration is selected */
  onDurationSelect?: (minutes: number) => void;
}

/**
 * Props for the inner scene
 */
export interface LeaksLensSceneProps {
  graph: GraphSnapshot;
  focusNodeId: GraphNodeId;
  distractionNodeIds: GraphNodeId[];
  focusedPath?: GraphNodeId[];
}

/**
 * Compute severity from last accessed time
 */
export function computeSeverity(lastAccessed?: Date): LeakSeverity {
  if (!lastAccessed) return "cool";

  const now = Date.now();
  const diff = now - lastAccessed.getTime();
  const minutes = diff / 60000;

  if (minutes <= 30) return "hot";
  if (minutes <= 120) return "warm";
  return "cool";
}

/**
 * Get severity color classes
 */
export function getSeverityClasses(severity: LeakSeverity): {
  bg: string;
  text: string;
  border: string;
} {
  switch (severity) {
    case "hot":
      return {
        bg: "bg-red-500/20",
        text: "text-red-400",
        border: "border-red-400/30",
      };
    case "warm":
      return {
        bg: "bg-amber-500/20",
        text: "text-amber-400",
        border: "border-amber-400/30",
      };
    case "cool":
      return {
        bg: "bg-white/5",
        text: "text-white/50",
        border: "border-white/10",
      };
  }
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity: LeakSeverity): string {
  switch (severity) {
    case "hot":
      return "🔴";
    case "warm":
      return "🟡";
    case "cool":
      return "⚪";
  }
}

/**
 * Get Glyph context for Leaks
 */
export function getLeaksGlyphContext(
  distractions: DistractionNode[],
  selectedCount: number
): { state: GlyphState; dialogue: string } {
  if (distractions.length === 0) {
    return {
      state: "success",
      dialogue: "No leaks detected. Your focus is clean!",
    };
  }

  const hotCount = distractions.filter((d) => d.severity === "hot").length;

  if (selectedCount === 0) {
    return {
      state: "responding",
      dialogue: "These branches leak from your goal. What should I mute?",
    };
  }

  if (hotCount > 0) {
    return {
      state: "responding",
      dialogue: `${hotCount} hot leak${hotCount > 1 ? "s" : ""} pulling you off-course.`,
    };
  }

  return {
    state: "idle",
    dialogue: "Take your time. Decide what to mute.",
  };
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

