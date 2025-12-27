"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { EmbeddedShard } from "../collapsed/EmbeddedShard";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import type { MorphingSidebarProps } from "../types";

export const MorphingSidebar = ({
  className,
  children,
  activeRealm,
  realms = [],
  studioDocks,
  socialDocks,
  onDockClick,
  onRealmChange,
  sessionProgress,
}: MorphingSidebarProps) => {
  const { open, setOpen, animationDirection } = useSidebar();

  // Calculate derived animation states
  const isOpening = animationDirection === "opening";
  const isClosing = animationDirection === "closing";

  // Panel animation config
  const openTiming = ANIMATION_CONFIG.open;
  const closeTiming = ANIMATION_CONFIG.close;

  // Phase 1: Panel width transition (0-120ms open, snappier close)
  const panelWidthTransition = {
    width: {
      duration: ms(isOpening ? openTiming.phase1.end : 60),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isClosing ? ms(closeTiming.phase4.start) : 0,
    },
  };

  // Phase 1: Background glass transition - only when expanded
  const glassTransition = {
    backgroundColor: {
      duration: ms(isOpening ? openTiming.phase1.end : 80),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isClosing ? ms(closeTiming.phase3.start) : 0,
    },
    borderColor: {
      duration: ms(isOpening ? openTiming.phase1.end : 80),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isClosing ? ms(closeTiming.phase3.start) : 0,
    },
  };

  // Phase 1: Shard opacity transition
  const shardMorphTransition = {
    opacity: {
      duration: ms(isOpening ? openTiming.phase1.end * 0.8 : 60),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isClosing ? ms(closeTiming.phase4.start) : 0,
    },
  };

  // Phase 2: Content reveal transition (80-200ms open)
  const contentRevealTransition = {
    opacity: {
      duration: ms(isOpening ? openTiming.phase2.end - openTiming.phase2.start : 60),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(openTiming.phase2.start) : 0,
    },
    x: {
      duration: ms(isOpening ? openTiming.phase2.end - openTiming.phase2.start : 50),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(openTiming.phase2.start) : 0,
    },
  };

  return (
    <motion.div
      className={cn("relative h-full shrink-0 overflow-visible", className)}
      initial={{ width: 56 }}
      animate={{ width: open ? 280 : 56 }}
      transition={panelWidthTransition}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Background glass panel - ONLY appears when expanded, no border when collapsed */}
      <motion.div
        className="absolute inset-0 backdrop-blur-2xl"
        initial={{
          backgroundColor: "rgba(5, 8, 15, 0)",
          borderRightWidth: 0,
          borderRightColor: "rgba(34, 211, 238, 0)",
        }}
        animate={{
          backgroundColor: open ? "rgba(5, 8, 15, 0.85)" : "rgba(5, 8, 15, 0)",
          borderRightWidth: open ? 1 : 0,
          borderRightColor: open ? "rgba(34, 211, 238, 0.35)" : "rgba(34, 211, 238, 0)",
        }}
        transition={glassTransition}
        style={{ borderRightStyle: "solid" }}
      />

      {/* Embedded shard - the monolith with its own border */}
      <motion.div
        className="absolute right-0 top-0 bottom-0 z-10 w-[56px]"
        initial={{ opacity: 1 }}
        animate={{ opacity: open ? 0 : 1 }}
        transition={shardMorphTransition}
        style={{ pointerEvents: open ? "none" : "auto" }}
      >
        <EmbeddedShard
          activeRealm={activeRealm}
          realms={realms}
          studioDocks={studioDocks}
          socialDocks={socialDocks}
          onExpandSidebar={() => setOpen(true)}
          onDockClick={onDockClick}
          onRealmChange={onRealmChange}
          sessionProgress={sessionProgress}
          isExpanding={open}
        />
      </motion.div>

      {/* Main content container - children render here with orchestrated reveal */}
      <motion.div
        className={cn(
          "relative z-20 h-full min-h-full flex flex-col overflow-visible",
          open ? "px-3 pt-4 pb-24" : "px-1 pt-4 pb-24"
        )}
        initial={{ opacity: 0, x: -20 }}
        animate={{
          opacity: open ? 1 : 0,
          x: open ? 0 : -20,
        }}
        transition={contentRevealTransition}
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};
