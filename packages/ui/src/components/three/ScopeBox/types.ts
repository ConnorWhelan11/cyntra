import type { RefObject } from "react";
import type * as THREE from "three";

export type IntroPhase = "chaos" | "script" | "orb" | "done";

export type StepType = "wait" | "text" | "orb" | "interactive";

/** Supported intro sequence variants */
export type IntroVariant = "glia-premed" | "default";

/**
 * Frame mode determines how text is composed with previous frames:
 * - "replace": Clear all previous text and show only this frame (default)
 * - "append-inline": Keep existing text, add this frame on the same line
 * - "append-below": Keep existing text, add this frame on a new line below
 * - "mutate-last": Don't add text, modify styling of the last segment in place
 */
export type FrameMode = "replace" | "append-inline" | "append-below" | "mutate-last";

/**
 * Visual effect variants that can be applied to segments.
 * - "none": No special effect (default)
 * - "strike-glitch": Red strikethrough with glitch/jitter animation
 */
export type EffectVariant = "none" | "strike-glitch";

/**
 * A single cinematic frame in the intro sequence.
 * Frames fade in/out one at a time, creating a smooth narrative flow.
 */
export interface StoryFrame {
  /** The text to display for this frame (ignored for mutate-last mode) */
  text: string;
  /** How this frame composes with previous text. Default: "replace" */
  mode?: FrameMode;
  /** Optional CSS class override for this specific frame */
  className?: string;
  /** Delay before this frame starts rendering (ms). Default: 0 */
  delayBefore?: number;
  /** How long to hold this frame on screen (ms). Default: ~700ms */
  holdMs?: number;
  /** Delay after hold completes before advancing to next frame (ms). Default: 0 */
  delayAfter?: number;
  /** Apply strikethrough styling (warning/crossed-out effect) */
  strikethrough?: boolean;
  /** Apply emphasis/glow effect for "hook" frames */
  emphasis?: boolean;
  /** Scale factor for punch (default 1.0, use 1.02-1.05 for emphasis) */
  scale?: number;
  /** Visual effect variant to apply (used with mutate-last for animated effects) */
  effectVariant?: EffectVariant;
}

/** @deprecated Use StoryFrame instead. Kept for backwards compatibility. */
export interface LineStyle {
  /** Additional CSS classes to apply to this specific line */
  className?: string;
  /** Apply strikethrough styling (warning/emphasis effect) */
  strikethrough?: boolean;
  /** Apply glitch/emphasis effect */
  emphasis?: boolean;
}

/** Content configuration for text-based steps */
export interface StepContent {
  /**
   * Frame-based content (preferred).
   * Each frame fades in, holds, then transitions to the next.
   */
  frames?: StoryFrame[];
  
  /**
   * @deprecated Use `frames` instead.
   * Legacy line-based content for backwards compatibility.
   * If both `frames` and `lines` are present, `frames` takes precedence.
   */
  lines?: string[];
  
  /** @deprecated Use frame.holdMs instead. Delay between lines appearing (ms) */
  staggerDelay?: number;
  
  /** Show mission buttons instead of text */
  showButtons?: boolean;
  
  /** Default className for all frames/lines in this step */
  className?: string;
  
  /** @deprecated Use frame-level styles instead. Per-line style overrides. */
  lineStyles?: Record<number, LineStyle>;
}

export interface StoryStep {
  id: string;
  type: StepType;

  // Timing / Progression
  duration?: number; // For 'wait' steps
  delayBefore?: number; // Wait before starting the step (e.g., initial fade-in delay)
  delayAfter?: number; // Wait after last frame before advancing to next step

  // Visual Physics (ScopeBox state)
  containmentTarget: number; // 0 to 1
  shakeIntensity: number; // 0 to 1
  cameraBehavior?: "idle" | "pulse";

  // Content (MissionIntroPanel state)
  content?: StepContent;
}

/** Button configuration for MissionButtons */
export interface MissionButtonLabels {
  primary: string;
  secondary: string;
  primarySubLabel?: string;
  secondarySubLabel?: string;
}

export interface ScopeBoxProps {
  showNodes?: boolean;
  onNodeClick?: (id: string) => void;
  highlightedNodeId?: string | null;
  phase?: number; // 0: Spec, 1: Reality Check, 2: Leaks, 3: Expansion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  htmlPortal?: RefObject<any>;
  onCreateMission?: () => void;
  onResumeMission?: () => void;
  enableIntro?: boolean;
  forceIntro?: boolean;
  onIntroComplete?: () => void;
  /** Intro sequence variant to use */
  variant?: IntroVariant;
}

export interface NodeData {
  id: string;
  label: string;
  color: string;
  type: string;
  orbitalPos: THREE.Vector3;
  chaosPos: THREE.Vector3;
  initialPos?: THREE.Vector3;
}
