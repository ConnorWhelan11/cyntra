"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  AnimationDirection,
  AnimationPhase,
  SidebarContextProps,
} from "../types";
import { ANIMATION_CONFIG } from "./animations";

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [animationDirection, setAnimationDirection] =
    useState<AnimationDirection>(null);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const animationStartTime = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const previousOpen = useRef<boolean | null>(null);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  // When the open prop changes, we want the first render after the change to
  // already see the correct direction, even before the effect fires.
  const pendingDirection: AnimationDirection =
    previousOpen.current !== null && previousOpen.current !== open
      ? open
        ? "opening"
        : "closing"
      : null;
  const resolvedAnimationDirection = animationDirection ?? pendingDirection;
  const isAnimating = animate ? resolvedAnimationDirection !== null : false;

  // Calculate current phase based on elapsed time
  const calculatePhase = useCallback(
    (elapsed: number, direction: AnimationDirection): AnimationPhase => {
      if (!direction) return "idle";

      const config =
        direction === "opening"
          ? ANIMATION_CONFIG.open
          : ANIMATION_CONFIG.close;

      if (direction === "opening") {
        if (elapsed < config.phase1.end) return "phase1";
        if (elapsed < config.phase2.end) return "phase2";
        if (elapsed < config.phase3.end) return "phase3";
      } else {
        if (elapsed < config.phase1.end) return "phase1";
        if (elapsed < config.phase2.end) return "phase2";
        if (elapsed < config.phase3.end) return "phase3";
        if (elapsed < (config as typeof ANIMATION_CONFIG.close).phase4.end)
          return "phase4";
      }

      return "idle";
    },
    []
  );

  // Animation loop
  const runAnimation = useCallback(
    (direction: AnimationDirection) => {
      if (!direction) return;

      const config =
        direction === "opening"
          ? ANIMATION_CONFIG.open
          : ANIMATION_CONFIG.close;

      const tick = () => {
        const elapsed = performance.now() - animationStartTime.current;
        const phase = calculatePhase(elapsed, direction);

        setAnimationPhase(phase);

        // Calculate phase progress
        let progress = 0;
        if (phase !== "idle") {
          const phaseConfig = config[phase as keyof typeof config];
          if (
            phaseConfig &&
            typeof phaseConfig === "object" &&
            "start" in phaseConfig
          ) {
            const phaseElapsed = elapsed - phaseConfig.start;
            const phaseDuration = phaseConfig.end - phaseConfig.start;
            progress = Math.min(1, Math.max(0, phaseElapsed / phaseDuration));
          }
        }
        setPhaseProgress(progress);

        if (elapsed >= config.total) {
          // Animation complete
          setAnimationPhase("idle");
          setAnimationDirection(null);
          setPhaseProgress(0);
          animationFrameRef.current = null;
        } else {
          animationFrameRef.current = requestAnimationFrame(tick);
        }
      };

      animationStartTime.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(tick);
    },
    [calculatePhase]
  );

  // Watch for open state changes and set direction before paint
  useLayoutEffect(() => {
    if (previousOpen.current === null) {
      previousOpen.current = open;
      return;
    }

    if (previousOpen.current !== open && animate) {
      // Cancel any existing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const direction: AnimationDirection = open ? "opening" : "closing";
      setAnimationDirection(direction);
      runAnimation(direction);
    }

    previousOpen.current = open;
  }, [open, animate, runAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        animate,
        animationPhase,
      animationDirection: resolvedAnimationDirection,
      isAnimating,
      phaseProgress,
    }}
  >
      {children}
    </SidebarContext.Provider>
  );
};
