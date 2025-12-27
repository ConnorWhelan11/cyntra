"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import { getModuleAccentStyles } from "../styles";
import type { SidebarModuleProps } from "../types";

export const SidebarModule = ({
  children,
  className,
  accent = "cyan",
  glowIntensity = "subtle",
  index = 0,
}: SidebarModuleProps & { index?: number }) => {
  const { open, animationDirection } = useSidebar();
  const styles = getModuleAccentStyles(accent, glowIntensity);

  const isOpening = animationDirection === "opening";
  const phase2Config = ANIMATION_CONFIG.open.phase2;
  const staggerDelay = index * 60;

  // Module container animation
  const moduleTransition = {
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
        "relative flex flex-col rounded-xl border transition-[padding] overflow-hidden",
        styles.border,
        styles.hoverBorder,
        glowIntensity !== "none" && styles.glow,
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
        padding: open ? "0.375rem" : "0rem",
        borderColor: open ? undefined : "rgba(255,255,255,0)",
        backgroundColor: open ? "rgba(15, 23, 42, 0.4)" : "rgba(15, 23, 42, 0)",
      }}
      transition={moduleTransition}
    >
      {/* Vertical spine - fades in */}
      <motion.div
        className="absolute left-0 top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-slate-700/30 to-transparent"
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
      <div className="flex flex-col gap-0.5">{children}</div>
    </motion.div>
  );
};
