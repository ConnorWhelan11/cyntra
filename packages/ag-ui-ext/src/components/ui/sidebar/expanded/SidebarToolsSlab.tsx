"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import type { SidebarToolsSlabProps } from "../types";

/**
 * SidebarToolsSlab - A unified container for multiple tool sections (Studio + Social).
 * Designed to be visually quieter than Realm portal cards, reading as a single
 * control panel rather than competing destination cards.
 */
export const SidebarToolsSlab = ({ children, className, index = 0 }: SidebarToolsSlabProps) => {
  const { open, animationDirection } = useSidebar();

  const isOpening = animationDirection === "opening";
  const phase2Config = ANIMATION_CONFIG.open.phase2;
  const staggerDelay = index * 60;

  // Container animation - slightly flatter than realm cards
  const slabTransition = {
    opacity: {
      duration: ms(isOpening ? 120 : 60),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase2Config.start + staggerDelay) : ms(staggerDelay * 0.5),
    },
    scale: {
      duration: ms(isOpening ? 100 : 60),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase2Config.start + staggerDelay) : 0,
    },
  };

  return (
    <motion.div
      className={cn(
        "relative flex flex-col rounded-xl border overflow-hidden",
        // Quieter border - neutral slate instead of accent colors
        "border-slate-700/15 hover:border-slate-600/25",
        // Subtle inner glow - flatter than realm cards
        "shadow-[inset_0_1px_0_rgba(148,163,184,0.04)]",
        className
      )}
      initial={{
        opacity: 0.6,
        scale: 0.98,
        padding: "0rem",
        borderColor: "rgba(255,255,255,0)",
        backgroundColor: "rgba(15, 23, 42, 0)",
      }}
      animate={{
        opacity: open ? 1 : 0.5,
        scale: open ? 1 : 0.98,
        // Slightly more padding to accommodate multiple sections
        padding: open ? "0.5rem" : "0rem",
        borderColor: open ? undefined : "rgba(255,255,255,0)",
        // Slightly darker/flatter than accent modules
        backgroundColor: open ? "rgba(15, 23, 42, 0.35)" : "rgba(15, 23, 42, 0)",
      }}
      transition={slabTransition}
    >
      {/* Vertical spine - subtle accent line on left edge */}
      <motion.div
        className="absolute left-0 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-slate-600/20 to-transparent"
        initial={{ opacity: 0, scaleY: 0.5 }}
        animate={{
          opacity: open ? 1 : 0,
          scaleY: open ? 1 : 0.5,
        }}
        transition={{
          duration: ms(isOpening ? 120 : 60),
          delay: isOpening ? ms(phase2Config.start + staggerDelay + 20) : 0,
        }}
      />

      {/* Inner container with section gap */}
      <div className="flex flex-col gap-4">{children}</div>
    </motion.div>
  );
};
