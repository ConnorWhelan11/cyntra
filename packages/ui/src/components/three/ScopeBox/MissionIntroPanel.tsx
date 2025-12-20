import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EffectVariant, FrameMode, StoryFrame, StoryStep } from "./types";

/** Default hold duration for frames (ms) */
const DEFAULT_FRAME_HOLD_MS = 700;

/** Reduced motion hold duration (ms) - minimal but visible */
const REDUCED_MOTION_HOLD_MS = 100;

/**
 * A rendered segment of text within a line.
 * Each segment corresponds to one frame that was applied.
 */
interface Segment {
  /** Stable ID for React keys and animation tracking */
  id: string;
  /** The text content */
  text: string;
  /** Resolved CSS className */
  className: string;
  /** Whether this segment should animate in (only true when first added) */
  isNew: boolean;
  /** Whether this segment was mutated (for animating style changes) */
  wasMutated: boolean;
  /** Scale factor for the segment */
  scale: number;
  /** Visual effect variant applied to this segment */
  effectVariant: EffectVariant;
}

/**
 * Lines state: array of lines, each line is an array of segments
 */
type LinesState = Segment[][];

/**
 * Convert legacy lines to frames for backwards compatibility
 */
function linesToFrames(
  lines: string[],
  lineStyles?: Record<number, { className?: string; strikethrough?: boolean; emphasis?: boolean }>
): StoryFrame[] {
  return lines.map((text, i) => {
    const style = lineStyles?.[i];
    return {
      text,
      className: style?.className,
      strikethrough: style?.strikethrough,
      emphasis: style?.emphasis,
    };
  });
}

/**
 * Build the className for a segment, merging step-level and frame-level styles
 */
function buildSegmentClassName(
  stepClassName: string | undefined,
  frame: StoryFrame
): string {
  // Base classes that apply to all segments
  const baseClasses = "font-mono whitespace-normal break-words leading-relaxed";

  // Step-level default (fallback)
  const stepDefault = stepClassName || "text-cyan-neon/80 font-medium";

  // Frame-level override className (if any)
  const frameOverrideClass = frame.className || "";

  // Build conditional classes
  const conditionalClasses: string[] = [];

  // Strikethrough effect: line-through + warning color
  if (frame.strikethrough) {
    conditionalClasses.push(
      "line-through",
      "decoration-rose-400/70",
      "decoration-2"
    );
  }

  // Emphasis effect: stronger text shadow / glow
  if (frame.emphasis) {
    conditionalClasses.push(
      "[text-shadow:0_0_8px_rgba(248,113,113,0.6),0_0_16px_rgba(248,113,113,0.3)]"
    );
  }

  // Use frame-level className if present, otherwise step default
  const textClass = frameOverrideClass || stepDefault;

  return [
    baseClasses,
    textClass,
    "[text-shadow:0_0_2px_rgba(0,240,255,0.3)]",
    ...conditionalClasses,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Create a segment from a frame
 */
function createSegment(
  frame: StoryFrame,
  stepClassName: string | undefined,
  frameIndex: number
): Segment {
  return {
    id: `segment-${frameIndex}-${Date.now()}`,
    text: frame.text,
    className: buildSegmentClassName(stepClassName, frame),
    isNew: true,
    wasMutated: false,
    scale: frame.scale || 1,
    effectVariant: frame.effectVariant || "none",
  };
}

/**
 * Mutate an existing segment with new styling from a frame
 * Preserves the segment's text and id, updates styling
 */
function mutateSegment(
  existingSegment: Segment,
  frame: StoryFrame,
  stepClassName: string | undefined
): Segment {
  return {
    ...existingSegment,
    // Keep the original text and id
    id: existingSegment.id,
    text: existingSegment.text,
    // Update styling
    className: buildSegmentClassName(stepClassName, frame),
    scale: frame.scale ?? existingSegment.scale,
    effectVariant: frame.effectVariant ?? existingSegment.effectVariant,
    // Animation flags
    isNew: false,
    wasMutated: true,
  };
}

/**
 * Apply a frame to the current lines state based on frame.mode
 * Returns a new linesState (immutable update)
 */
function applyFrame(
  frame: StoryFrame,
  currentLines: LinesState,
  stepClassName: string | undefined,
  frameIndex: number
): LinesState {
  const mode: FrameMode = frame.mode || "replace";

  // Mark all existing segments as not new and not mutated (they won't animate)
  const frozenLines: LinesState = currentLines.map((line) =>
    line.map((seg) => ({ ...seg, isNew: false, wasMutated: false }))
  );

  switch (mode) {
    case "replace": {
      // Clear everything and start fresh with this segment
      const newSegment = createSegment(frame, stepClassName, frameIndex);
      return [[newSegment]];
    }

    case "append-inline": {
      // Add to the last line, or create a new line if empty
      const newSegment = createSegment(frame, stepClassName, frameIndex);
      if (frozenLines.length === 0) {
        return [[newSegment]];
      }
      const lastLineIndex = frozenLines.length - 1;
      return [
        ...frozenLines.slice(0, lastLineIndex),
        [...frozenLines[lastLineIndex], newSegment],
      ];
    }

    case "append-below": {
      // Add a new line with this segment, or create first line if empty
      const newSegment = createSegment(frame, stepClassName, frameIndex);
      if (frozenLines.length === 0) {
        return [[newSegment]];
      }
      return [...frozenLines, [newSegment]];
    }

    case "mutate-last": {
      // Modify the last segment in the last line without adding new text
      if (frozenLines.length === 0) {
        // No segments to mutate, fall back to replace behavior
        const newSegment = createSegment(frame, stepClassName, frameIndex);
        return [[newSegment]];
      }

      const lastLineIndex = frozenLines.length - 1;
      const lastLine = frozenLines[lastLineIndex];
      
      if (lastLine.length === 0) {
        // Empty line, fall back to replace behavior
        const newSegment = createSegment(frame, stepClassName, frameIndex);
        return [[newSegment]];
      }

      const lastSegmentIndex = lastLine.length - 1;
      const mutatedSegment = mutateSegment(
        lastLine[lastSegmentIndex],
        frame,
        stepClassName
      );

      // Return new state with the mutated segment
      return [
        ...frozenLines.slice(0, lastLineIndex),
        [
          ...lastLine.slice(0, lastSegmentIndex),
          mutatedSegment,
        ],
      ];
    }

    default: {
      // Unknown mode, treat as replace
      const newSegment = createSegment(frame, stepClassName, frameIndex);
      return [[newSegment]];
    }
  }
}

/**
 * Frame phase within the current frame's lifecycle:
 * - "waiting-before": waiting for frame's delayBefore
 * - "visible": frame is shown, waiting holdMs
 * - "waiting-after": waiting for frame's delayAfter before advancing
 */
type FramePhase = "waiting-before" | "visible" | "waiting-after";

/**
 * Floating, cardless intro panel inside the ScopeBox.
 * Renders frames with cinematic fade-in/fade-out transitions.
 * Supports replace, append-inline, append-below, and mutate-last modes.
 */
export const MissionIntroPanel = ({
  step,
  onStepComplete,
}: {
  step: StoryStep;
  onStepComplete: () => void;
}) => {
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [frameIndex, setFrameIndex] = useState(-1); // -1 = waiting for step delayBefore
  const [framePhase, setFramePhase] = useState<FramePhase>("waiting-before");
  const [linesState, setLinesState] = useState<LinesState>([]);

  // Derive frames from step content
  const frames = useMemo((): StoryFrame[] => {
    if (!step.content) return [];

    // Prefer frames if available
    if (step.content.frames && step.content.frames.length > 0) {
      return step.content.frames;
    }

    // Fall back to legacy lines
    if (step.content.lines && step.content.lines.length > 0) {
      return linesToFrames(step.content.lines, step.content.lineStyles);
    }

    return [];
  }, [step.content]);

  const stepClassName = step.content?.className;
  const stepDelayBefore = step.delayBefore || 0;
  const stepDelayAfter = step.delayAfter || 0;

  // Clear timers helper
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Reset state when step changes
  useEffect(() => {
    clearTimers();
    setFrameIndex(-1);
    setFramePhase("waiting-before");
    setLinesState([]);

    // Start step delay before showing first frame
    const startTimer = setTimeout(
      () => {
        setFrameIndex(0);
        setFramePhase("waiting-before");
      },
      prefersReducedMotion ? 0 : stepDelayBefore
    );
    timersRef.current.push(startTimer);

    return clearTimers;
  }, [step.id, stepDelayBefore, prefersReducedMotion, clearTimers]);

  // Frame lifecycle: handle delayBefore -> visible -> delayAfter -> advance
  useEffect(() => {
    if (frameIndex < 0 || frameIndex >= frames.length) return;

    const currentFrame = frames[frameIndex];
    if (!currentFrame) return;

    const frameDelayBefore = prefersReducedMotion ? 0 : (currentFrame.delayBefore || 0);
    const holdDuration = prefersReducedMotion
      ? REDUCED_MOTION_HOLD_MS
      : currentFrame.holdMs || DEFAULT_FRAME_HOLD_MS;
    const frameDelayAfter = prefersReducedMotion ? 0 : (currentFrame.delayAfter || 0);
    const isLastFrame = frameIndex === frames.length - 1;

    if (framePhase === "waiting-before") {
      // Wait for frame's delayBefore, then show frame
      const timer = setTimeout(() => {
        // Apply this frame to the lines state
        setLinesState((prev) =>
          applyFrame(currentFrame, prev, stepClassName, frameIndex)
        );
        setFramePhase("visible");
      }, frameDelayBefore);
      timersRef.current.push(timer);
      return () => clearTimeout(timer);
    }

    if (framePhase === "visible") {
      // Wait holdMs, then transition to waiting-after (or advance if no delayAfter)
      const timer = setTimeout(() => {
        if (frameDelayAfter > 0) {
          setFramePhase("waiting-after");
        } else if (isLastFrame) {
          // No frame delayAfter, go to step completion
          const completionTimer = setTimeout(
            () => onStepComplete(),
            prefersReducedMotion ? 0 : stepDelayAfter
          );
          timersRef.current.push(completionTimer);
        } else {
          // Advance to next frame
          setFrameIndex((prev) => prev + 1);
          setFramePhase("waiting-before");
        }
      }, holdDuration);
      timersRef.current.push(timer);
      return () => clearTimeout(timer);
    }

    if (framePhase === "waiting-after") {
      // Wait for frame's delayAfter, then advance
      const timer = setTimeout(() => {
        if (isLastFrame) {
          // After last frame's delayAfter, wait step delayAfter then complete
          const completionTimer = setTimeout(
            () => onStepComplete(),
            prefersReducedMotion ? 0 : stepDelayAfter
          );
          timersRef.current.push(completionTimer);
        } else {
          // Advance to next frame
          setFrameIndex((prev) => prev + 1);
          setFramePhase("waiting-before");
        }
      }, frameDelayAfter);
      timersRef.current.push(timer);
      return () => clearTimeout(timer);
    }
  }, [frameIndex, framePhase, frames, stepClassName, stepDelayAfter, prefersReducedMotion, onStepComplete]);

  // Early return if no content
  if (frames.length === 0) {
    return null;
  }

  // Render placeholder during delayBefore
  if (frameIndex < 0 || linesState.length === 0) {
    return (
      <div className="w-[140px] sm:w-[160px] md:w-[180px] h-8 pointer-events-none" />
    );
  }

  /**
   * Render a segment with appropriate animation based on its state
   */
  const renderSegment = (segment: Segment) => {
    // NEW SEGMENT: fade-in with y offset and scale
    if (segment.isNew) {
      return (
        <motion.span
          key={segment.id}
          initial={{
            opacity: 0,
            y: prefersReducedMotion ? 0 : 4,
            scale: prefersReducedMotion ? 1 : 0.98,
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: segment.scale,
          }}
          transition={{
            duration: prefersReducedMotion ? 0.05 : 0.22,
            ease: "easeOut",
          }}
          className={segment.className}
        >
          {segment.text}
        </motion.span>
      );
    }

    // MUTATED SEGMENT with strike-glitch effect
    if (segment.wasMutated && segment.effectVariant === "strike-glitch") {
      return (
        <motion.span
          key={segment.id}
          initial={{
            scale: segment.scale,
            filter: "brightness(1)",
            x: 0,
          }}
          animate={{
            scale: segment.scale,
            filter: prefersReducedMotion
              ? "brightness(1)"
              : ["brightness(1)", "brightness(1.4)", "brightness(1.1)", "brightness(1)"],
            x: prefersReducedMotion ? 0 : [0, -1.5, 1.5, -0.5, 0],
          }}
          transition={{
            duration: prefersReducedMotion ? 0.05 : 0.25,
            ease: "easeOut",
            filter: {
              times: [0, 0.2, 0.5, 1],
            },
            x: {
              times: [0, 0.15, 0.35, 0.6, 1],
            },
          }}
          className={segment.className}
        >
          {segment.text}
        </motion.span>
      );
    }

    // MUTATED SEGMENT (no special effect, just animate the style change)
    if (segment.wasMutated) {
      return (
        <motion.span
          key={segment.id}
          initial={{ opacity: 0.8 }}
          animate={{
            opacity: 1,
            scale: segment.scale,
          }}
          transition={{
            duration: prefersReducedMotion ? 0.05 : 0.15,
            ease: "easeOut",
          }}
          className={segment.className}
        >
          {segment.text}
        </motion.span>
      );
    }

    // STATIC SEGMENT: no animation needed
    return (
      <span
        key={segment.id}
        className={segment.className}
        style={{ transform: `scale(${segment.scale})` }}
      >
        {segment.text}
      </span>
    );
  };

  return (
    <div
      className="
        relative
        w-[140px] sm:w-[160px] md:w-[180px]
        min-h-[2.5rem]
        text-center
        text-cyan-neon/90
        text-[8px] sm:text-[9px] md:text-[10px]
        font-mono leading-tight
        drop-shadow-[0_0_10px_rgba(56,189,248,0.4)]
        pointer-events-none
        overflow-visible
        mix-blend-screen
      "
    >
      {/* Scanline overlay effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#000_3px)] mix-blend-overlay z-10"
        aria-hidden="true"
      />

      {/* Lines container */}
      <div className="flex flex-col items-center gap-1">
        {linesState.map((line, lineIndex) => (
          <div
            key={`line-${lineIndex}`}
            className="flex flex-row flex-wrap items-center justify-center gap-x-1"
          >
            {line.map(renderSegment)}
          </div>
        ))}
      </div>
    </div>
  );
};
