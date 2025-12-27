import type { GraphNodeId, GraphSnapshot } from "../Graph3D/types";
import type { GlyphState } from "../Glyph/types";

/**
 * Today Lens View Modes
 */
export type TodayViewMode = "timeline" | "ring";

/**
 * Block status in the day timeline
 */
export type BlockStatus = "planned" | "active" | "done" | "deferred" | "skipped";

/**
 * Block type for styling
 */
export type BlockType = "task" | "habit" | "meeting" | "deepWork" | "buffer";

/**
 * A single block in the Today timeline
 */
export interface TodayBlock {
  /** Unique block ID */
  id: string;

  /** Associated graph node IDs */
  nodeIds: GraphNodeId[];

  /** Display label */
  label: string;

  /** Optional description */
  description?: string;

  /** Scheduled start time */
  scheduledStart: Date;

  /** Duration in minutes */
  duration: number;

  /** Current status */
  status: BlockStatus;

  /** Block type for styling */
  type: BlockType;

  /** Actual start time if started */
  actualStart?: Date;

  /** Actual end time if completed */
  actualEnd?: Date;

  /** Energy level tag */
  energyLevel?: "low" | "medium" | "high";
}

/**
 * Props for the TodayLens component
 */
export interface TodayLensProps {
  /** The graph snapshot for context preview */
  graph: GraphSnapshot;

  /** The date to display */
  date: Date;

  /** Blocks for the day */
  blocks: TodayBlock[];

  /** View mode */
  viewMode?: TodayViewMode;

  /** Current time for Now marker */
  currentTime?: Date;

  /** Custom class for container */
  className?: string;

  // --- Callbacks ---

  /** Called when a block is tapped (opens Stack) */
  onBlockTap?: (blockId: string) => void;

  /** Called when blocks are reordered */
  onBlockReorder?: (orderedBlockIds: string[]) => void;

  /** Called when block status changes */
  onBlockStatusChange?: (blockId: string, status: BlockStatus) => void;

  /** Called when a block is deferred */
  onDefer?: (blockId: string, reason?: string) => void;

  /** Called when view mode toggles */
  onViewModeChange?: (mode: TodayViewMode) => void;

  /** Called when "End my day" is triggered */
  onEndDay?: () => void;

  /** Called when "Zoom out" to Week is requested */
  onZoomOut?: () => void;

  /** Called when "Show context" for a block is requested */
  onShowContext?: (nodeId: GraphNodeId) => void;
}

/**
 * Props for the inner 3D scene
 */
export interface TodayLensSceneProps {
  graph: GraphSnapshot;
  blocks: TodayBlock[];
  viewMode: TodayViewMode;
  activeBlockId?: string;
  currentTime: Date;
  onBlockTap?: (blockId: string) => void;
}

/**
 * Glyph dialogue based on context
 */
export interface TodayGlyphContext {
  state: GlyphState;
  dialogue: string;
}

/**
 * Block styling config
 */
export const BLOCK_COLORS: Record<BlockType, string> = {
  task: "bg-blue-500/20 border-blue-400/40",
  habit: "bg-teal-500/20 border-teal-400/40",
  meeting: "bg-purple-500/20 border-purple-400/40",
  deepWork: "bg-orange-500/20 border-orange-400/40",
  buffer: "bg-green-500/20 border-green-400/40",
};

export const BLOCK_ICONS: Record<BlockType, string> = {
  task: "○",
  habit: "↻",
  meeting: "◷",
  deepWork: "◉",
  buffer: "~",
};

export const STATUS_STYLES: Record<BlockStatus, string> = {
  planned: "opacity-100",
  active: "ring-2 ring-cyan-400 shadow-lg shadow-cyan-400/20",
  done: "opacity-50 line-through",
  deferred: "opacity-70 italic border-amber-400/40",
  skipped: "opacity-40 line-through",
};

/**
 * Compute Glyph context based on day state
 */
export function getGlyphContext(
  blocks: TodayBlock[],
  currentTime: Date,
  activeBlockId?: string
): TodayGlyphContext {
  const now = currentTime.getTime();
  const activeBlock = blocks.find((b) => b.id === activeBlockId);
  const allDone = blocks.every((b) => b.status === "done" || b.status === "skipped");
  const hasBlocks = blocks.length > 0;

  // Morning startup (before first block)
  const firstBlock = blocks[0];
  if (firstBlock && now < firstBlock.scheduledStart.getTime()) {
    return {
      state: "responding",
      dialogue: "Good morning! Here's your day.",
    };
  }

  // Day complete
  if (allDone && hasBlocks) {
    return {
      state: "success",
      dialogue: "You crushed it today. Time for Debrief?",
    };
  }

  // Active block
  if (activeBlock) {
    const remaining = Math.round(
      (activeBlock.scheduledStart.getTime() + activeBlock.duration * 60000 - now) / 60000
    );
    return {
      state: "idle",
      dialogue: `You're in ${activeBlock.label}. ${remaining} min left.`,
    };
  }

  // Between blocks
  const nextBlock = blocks.find((b) => b.scheduledStart.getTime() > now && b.status === "planned");
  if (nextBlock) {
    return {
      state: "thinking",
      dialogue: `Ready for ${nextBlock.label}?`,
    };
  }

  // Default
  return {
    state: "idle",
    dialogue: "What's next on your mind?",
  };
}

/**
 * Find active/next block based on current time
 */
export function computeActiveBlock(
  blocks: TodayBlock[],
  currentTime: Date
): { activeBlock?: TodayBlock; nextBlock?: TodayBlock } {
  const nowMs = currentTime.getTime();

  const activeBlock = blocks.find(
    (b) =>
      b.scheduledStart.getTime() <= nowMs &&
      b.scheduledStart.getTime() + b.duration * 60000 > nowMs &&
      b.status !== "done" &&
      b.status !== "skipped"
  );

  const nextBlock = blocks.find(
    (b) => b.scheduledStart.getTime() > nowMs && b.status === "planned"
  );

  return { activeBlock, nextBlock };
}

/**
 * Convert blocks to a ring graph for 3D visualization
 */
export function blocksToRingGraph(blocks: TodayBlock[]): GraphSnapshot {
  return {
    nodes: blocks.map((b) => ({
      id: b.id,
      label: b.label,
      category: b.type,
      status: b.status === "done" ? "completed" : b.status === "active" ? "active" : "normal",
      weight: b.status === "active" ? 1.0 : 0.7,
    })),
    edges: blocks.slice(0, -1).map((b, i) => ({
      id: `ring-${i}`,
      source: b.id,
      target: blocks[i + 1].id,
      type: "default" as const,
    })),
  };
}
