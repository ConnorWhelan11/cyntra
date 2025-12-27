"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import React from "react";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import { getLinkAccentStyles } from "../styles";
import type { Links, SidebarAccent } from "../types";

export const SidebarLink = ({
  link,
  className,
  labelClassName,
  iconWrapperClassName,
  active = false,
  accent = "cyan",
  hasActivity = false,
  index = 0,
  ...props
}: {
  link: Links;
  className?: string;
  labelClassName?: string;
  iconWrapperClassName?: string;
  active?: boolean;
  accent?: SidebarAccent;
  hasActivity?: boolean;
  index?: number;
} & React.ComponentProps<"a">) => {
  const { open, animationDirection } = useSidebar();
  const styles = getLinkAccentStyles(accent);

  const isOpening = animationDirection === "opening";

  // Staggered animation timing
  const staggerDelay = index * ANIMATION_CONFIG.stagger.navItem;
  const phase3Config = ANIMATION_CONFIG.open.phase3;
  const closePhase2Config = ANIMATION_CONFIG.close.phase2;

  // Label animation transition
  const labelTransition = {
    opacity: {
      duration: ms(isOpening ? 60 : 40),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase3Config.start + staggerDelay + 20) : ms(closePhase2Config.start),
    },
    x: {
      duration: ms(isOpening ? 80 : 50),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase3Config.start + staggerDelay + 10) : 0,
    },
  };

  // Icon animation - icons settle into place during phase 2
  const phase2Config = ANIMATION_CONFIG.open.phase2;
  const iconTransition = {
    scale: {
      duration: ms(isOpening ? 100 : 60),
      ease: isOpening ? [0.34, 1.56, 0.64, 1] : ANIMATION_CONFIG.easing.close, // Slight bounce on open
      delay: isOpening ? ms(phase2Config.start + staggerDelay * 0.5) : 0,
    },
    x: {
      duration: ms(isOpening ? 80 : 50),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase2Config.start + staggerDelay * 0.5) : 0,
    },
  };

  return (
    <a
      href={link.href}
      className={cn(
        "group/sidebar relative flex w-full items-center py-1.5 transition-all duration-200",
        "justify-start",
        open ? "gap-3 pl-3 pr-2" : "gap-0 px-2.5",
        className
      )}
      {...props}
    >
      {/* Left Rail - appears on hover/active */}
      <motion.div
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full",
          styles.rail
        )}
        initial={false}
        animate={{
          height: active ? 20 : 0,
          opacity: active ? 1 : 0,
        }}
        whileHover={!active ? { height: 16, opacity: 1 } : undefined}
        transition={{ duration: 0.15 }}
      />

      {/* Icon with halo effect - animates from dock position */}
      <motion.span
        className={cn(
          "relative flex items-center justify-center shrink-0",
          "h-5 w-5",
          active ? styles.iconActive : cn("text-slate-500/80", styles.iconHover),
          iconWrapperClassName
        )}
        initial={{ scale: 0.9, x: -2 }}
        animate={{
          scale: open ? 1 : 0.9,
          x: open ? 0 : -2,
        }}
        transition={iconTransition}
      >
        {/* Subtle halo on hover */}
        <div
          className={cn(
            "absolute inset-0 rounded-full transition-opacity duration-200",
            active
              ? "opacity-20 bg-current blur-sm"
              : "opacity-0 group-hover/sidebar:opacity-15 bg-current blur-sm"
          )}
        />
        <span className="relative z-10">{link.icon}</span>
      </motion.span>

      {/* Label - staggered fade/slide in */}
      <motion.span
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          x: open ? 0 : -6,
          visibility: open ? "visible" : "hidden",
          clipPath: open ? "inset(0% 0% 0% 0%)" : "inset(0% 100% 0% 0%)",
        }}
        transition={labelTransition}
        className={cn(
          "inline-block text-[12px] font-medium whitespace-nowrap overflow-hidden",
          "tracking-wide",
          active ? styles.labelActive : cn("text-slate-400/90", styles.labelHover),
          "group-hover/sidebar:tracking-[0.02em]",
          labelClassName
        )}
      >
        {link.label}
      </motion.span>

      {/* Status Orb - tiny radar blip */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="ml-auto relative flex items-center justify-center h-3 w-3"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{
              duration: ms(80),
              delay: isOpening ? ms(phase3Config.start + staggerDelay + 40) : 0,
            }}
          >
            <div
              className={cn(
                "absolute h-[5px] w-[5px] rounded-full transition-all duration-300",
                hasActivity ? cn(styles.orb, "opacity-100") : "bg-slate-600/30 opacity-40"
              )}
            />
            {hasActivity && (
              <div
                className={cn(
                  "absolute h-[5px] w-[5px] rounded-full animate-ping opacity-30",
                  styles.orbPulse
                )}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </a>
  );
};
