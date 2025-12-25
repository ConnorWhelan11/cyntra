/**
 * Sleeptime Glyph - Visual representation of the background consolidation agent.
 *
 * Uses the same base glyph model but with:
 * - Purple/indigo color scheme (vs cyan for primary agent)
 * - Slower, dreamier animation rhythms
 * - Unique states for sleeptime phases
 */

export type SleeptimeGlyphState =
  | "dormant" // Waiting for trigger threshold
  | "ingesting" // Reading run history
  | "distilling" // Extracting patterns
  | "consolidating" // Writing to memory blocks
  | "injecting" // Preparing context for primary agents
  | "complete"; // Flash state after successful consolidation

export interface SleeptimeStatus {
  /** Completions since last consolidation */
  completionsSinceLastRun: number;
  /** Threshold to trigger next consolidation */
  completionThreshold: number;
  /** ISO timestamp of last consolidation */
  lastConsolidationTime: string | null;
  /** Number of patterns found in last run */
  patternsFound: number;
  /** Number of traps detected in last run */
  trapsFound: number;
  /** Whether currently consolidating */
  isConsolidating: boolean;
}

export interface SleeptimeGlyphObjectProps {
  state?: SleeptimeGlyphState;
  scale?: number;
  position?: [number, number, number];
  /** Progress through current phase (0-1) */
  progress?: number;
  /** Override model URL */
  modelUrl?: string;
}

export interface SleeptimeGlyphSceneProps extends SleeptimeGlyphObjectProps {
  className?: string;
  /** Show status overlay */
  showStatus?: boolean;
  /** Status data for overlay */
  status?: SleeptimeStatus;
}

/** Color palette for sleeptime glyph */
export const SLEEPTIME_COLORS = {
  // Core orb - deep purple
  core: "#9F7AEA",
  coreEmissive: "#805AD5",

  // Rings - bright violet/magenta
  rings: "#D6BCFA",
  ringsEmissive: "#E9D8FD",

  // Face accents - muted lavender
  face: "#6B46C1",
  faceEmissive: "#9F7AEA",

  // Halo/mist - soft purple
  halo: "#B794F4",
  haloEmissive: "#9F7AEA",

  // Point light glow
  glow: "#9F7AEA",

  // Background
  background: "#0A0612",
} as const;

/** State-specific intensity multipliers */
export const STATE_INTENSITIES: Record<SleeptimeGlyphState, number> = {
  dormant: 0.3,
  ingesting: 0.6,
  distilling: 0.8,
  consolidating: 1.0,
  injecting: 0.9,
  complete: 1.2,
};

/** State-specific animation speeds (multiplier) */
export const STATE_SPEEDS: Record<SleeptimeGlyphState, number> = {
  dormant: 0.3, // Very slow, breathing rhythm
  ingesting: 0.7,
  distilling: 1.0,
  consolidating: 1.2, // Faster during active work
  injecting: 0.8,
  complete: 0.5, // Gentle slowdown after completion
};
