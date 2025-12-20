"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import { getSectionAccentStyles } from "../styles";
import type { SidebarAccent } from "../types";

export const SidebarSection = ({
  title,
  className,
  accent = "cyan",
  index = 0,
}: {
  title: string;
  className?: string;
  accent?: SidebarAccent;
  index?: number;
}) => {
  const { open, animationDirection } = useSidebar();
  const styles = getSectionAccentStyles(accent);
  const spacedTitle = title.split("").join(" ");

  const isOpening = animationDirection === "opening";

  // Calculate staggered delay for this section
  const staggerDelay = index * 40; // 40ms between sections

  // Phase 3 timing for labels
  const phase3Config = ANIMATION_CONFIG.open.phase3;
  const closePhase2Config = ANIMATION_CONFIG.close.phase2;

  // Animation transitions
  const labelTransition = {
    duration: ms(isOpening ? 80 : 60),
    ease: isOpening
      ? ANIMATION_CONFIG.easing.open
      : ANIMATION_CONFIG.easing.close,
    delay: isOpening
      ? ms(phase3Config.start + staggerDelay)
      : ms(closePhase2Config.start + (1 - index) * 20), // Reverse order on close
  };

  const barTransition = {
    duration: ms(isOpening ? 100 : 60),
    ease: isOpening
      ? ANIMATION_CONFIG.easing.open
      : ANIMATION_CONFIG.easing.close,
    delay: isOpening
      ? ms(phase3Config.start + staggerDelay - 20)
      : ms(closePhase2Config.start + (1 - index) * 20),
  };

  return (
    <motion.div
      layout
      initial={false}
      animate={{
        opacity: open ? 1 : 0,
        y: open ? 0 : -6,
        visibility: open ? "visible" : "hidden",
        clipPath: open ? "inset(0% 0% 0% 0%)" : "inset(0% 100% 0% 0%)",
      }}
      transition={labelTransition}
      className={cn(
        "flex items-center gap-2 px-2 mt-3 first:mt-0 overflow-hidden",
        className
      )}
    >
      {/* Signal bar - grows from 0 height */}
      <motion.div
        className={cn(
          "w-[3px] rounded-full origin-center",
          styles.bar,
          styles.barGlow
        )}
        initial={{ height: 0, opacity: 0 }}
        animate={{
          height: open ? 10 : 0,
          opacity: open ? 1 : 0,
        }}
        transition={barTransition}
      />
      {/* Microcaps label - simple fade in */}
      <motion.span
        className={cn("text-[9px] font-bold uppercase", styles.text)}
        initial={{ letterSpacing: "0.15em", opacity: 0 }}
        animate={{
          opacity: open ? 1 : 0,
        }}
        transition={{
          duration: ms(isOpening ? 80 : 60),
          ease: isOpening
            ? ANIMATION_CONFIG.easing.open
            : ANIMATION_CONFIG.easing.close,
          delay: isOpening ? ms(phase3Config.start + staggerDelay) : 0,
        }}
      >
        {spacedTitle}
      </motion.span>
      {/* Trailing line - lighter than slab border for internal divider feel */}
      <motion.div
        className="flex-1 h-px bg-gradient-to-r from-slate-700/20 to-transparent"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{
          scaleX: open ? 1 : 0,
          opacity: open ? 1 : 0,
        }}
        transition={{
          duration: ms(isOpening ? 100 : 60),
          delay: isOpening ? ms(phase3Config.start + staggerDelay + 30) : 0,
        }}
        style={{ originX: 0 }}
      />
    </motion.div>
  );
};
