import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIntroSequence } from "./sequence";
import type { IntroPhase, IntroVariant, StoryStep } from "./types";

const INTRO_SEEN_KEY = "oos_intro_seen";

export interface UseIntroSequenceOptions {
  /** Which intro variant to use */
  variant?: IntroVariant;
  /** Whether intro is enabled at all */
  enableIntro?: boolean;
  /** Force intro to play even if seen before */
  forceIntro?: boolean;
  /** Callback when intro completes */
  onIntroComplete?: () => void;
}

export interface UseIntroSequenceReturn {
  /** The full intro sequence for this variant */
  sequence: StoryStep[];
  /** Current step index */
  stepIndex: number;
  /** Current step object */
  currentStep: StoryStep;
  /** Derived phase: chaos | script | orb | done */
  introPhase: IntroPhase;
  /** Whether user has previously seen the intro */
  hasSeenIntro: boolean;
  /** Advance to the next step */
  advanceStep: () => void;
  /** Mark intro as complete (triggers localStorage + callback) */
  completeIntro: () => void;
  /** Whether orb animation is currently active */
  orbActive: boolean;
  /** Orb animation progress (0-1) */
  orbProgress: MutableRefObject<number>;
  /** Containment progress (0-1), smoothly animated */
  containmentProgress: MutableRefObject<number>;
  /** Reference to step start time for timing calculations */
  stepStartTime: MutableRefObject<number | null>;
  /** Whether reduced motion is preferred */
  prefersReducedMotion: boolean;
}

/**
 * Derive the intro phase from a step's type and id
 * This is independent of specific script content
 */
function deriveIntroPhase(step: StoryStep): IntroPhase {
  switch (step.type) {
    case "wait":
      // The initial wait is "chaos", any other waits are still "script"
      return step.id === "chaos" ? "chaos" : "script";
    case "text":
      return "script";
    case "orb":
      return "orb";
    case "interactive":
      return "done";
    default:
      return "script";
  }
}

/**
 * Hook to manage intro sequence state, timing, and progression
 * Extracts all intro-related logic from ScopeBox for cleaner separation
 */
export function useIntroSequence({
  variant = "glia-premed",
  enableIntro = true,
  forceIntro = false,
  onIntroComplete,
}: UseIntroSequenceOptions = {}): UseIntroSequenceReturn {
  // Get the sequence for this variant
  const sequence = useMemo(() => getIntroSequence(variant), [variant]);

  // Core state
  const [hasSeenIntro, setHasSeenIntro] = useState(true);
  const [stepIndex, setStepIndex] = useState(sequence.length - 1);
  const [orbActive, setOrbActive] = useState(false);

  // Refs for animation state (avoid re-renders on every frame)
  const orbProgress = useRef(0);
  const containmentProgress = useRef(1); // Start contained if intro disabled/seen
  const stepStartTime = useRef<number | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Initialize intro state based on settings and localStorage
  useEffect(() => {
    // Respect reduced motion
    if (!enableIntro || prefersReducedMotion) {
      setHasSeenIntro(true);
      setStepIndex(sequence.length - 1);
      containmentProgress.current = 1;
      if (typeof window !== "undefined" && prefersReducedMotion) {
        window.localStorage.setItem(INTRO_SEEN_KEY, "1");
      }
      return;
    }

    // Force intro playback
    if (forceIntro) {
      setHasSeenIntro(false);
      setStepIndex(0);
      containmentProgress.current = 0;
      stepStartTime.current = null;
      return;
    }

    // Check localStorage for previous intro completion
    if (typeof window === "undefined") return;

    const seen = window.localStorage.getItem(INTRO_SEEN_KEY) === "1";

    if (!seen) {
      setHasSeenIntro(false);
      setStepIndex(0);
      containmentProgress.current = 0;
      stepStartTime.current = null;
    } else {
      setHasSeenIntro(true);
      setStepIndex(sequence.length - 1);
      containmentProgress.current = 1;
    }
  }, [enableIntro, forceIntro, prefersReducedMotion, sequence.length]);

  // Derive current step and phase
  const currentStep = sequence[stepIndex] || sequence[sequence.length - 1];
  const introPhase = deriveIntroPhase(currentStep);

  // Complete the intro (called when entering final "done" step)
  const completeIntro = useCallback(() => {
    setOrbActive(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    }

    setHasSeenIntro(true);
    onIntroComplete?.();
  }, [onIntroComplete]);

  // Advance to the next step
  const advanceStep = useCallback(() => {
    if (stepIndex >= sequence.length - 1) return;

    const nextIndex = stepIndex + 1;
    const nextStep = sequence[nextIndex];

    setStepIndex(nextIndex);
    stepStartTime.current = null; // Reset time for new step

    // If entering orb phase, reset orb progress
    if (nextStep.type === "orb") {
      orbProgress.current = 0;
      setOrbActive(true);
    }

    // If entering final step (done)
    if (nextStep.type === "interactive") {
      completeIntro();
    }
  }, [stepIndex, sequence, completeIntro]);

  return {
    sequence,
    stepIndex,
    currentStep,
    introPhase,
    hasSeenIntro,
    advanceStep,
    completeIntro,
    orbActive,
    orbProgress,
    containmentProgress,
    stepStartTime,
    prefersReducedMotion,
  };
}
