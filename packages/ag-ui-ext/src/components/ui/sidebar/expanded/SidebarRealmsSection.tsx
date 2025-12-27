"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import type { SidebarRealmsSectionProps } from "../types";

export const SidebarRealmsSection = ({ children, className }: SidebarRealmsSectionProps) => {
  const { open, isAnimating, animationDirection } = useSidebar();

  const isOpening = animationDirection === "opening";

  // Realms are the LAST reveal in Phase 3 (the "main event")
  const phase3Config = ANIMATION_CONFIG.open.phase3;

  // Header animation - comes in just before the cards
  const headerTransition = {
    opacity: {
      duration: ms(isOpening ? 100 : 80),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase3Config.start + 60) : 0,
    },
    y: {
      duration: ms(isOpening ? 120 : 80),
      ease: isOpening ? ANIMATION_CONFIG.easing.open : ANIMATION_CONFIG.easing.close,
      delay: isOpening ? ms(phase3Config.start + 50) : 0,
    },
  };

  // Glow effect fades in as realms appear
  const glowTransition = {
    duration: ms(isOpening ? 200 : 100),
    delay: isOpening ? ms(phase3Config.start + 80) : 0,
  };

  if (!open && !isAnimating) {
    return <div className={cn("flex flex-col gap-1 overflow-visible", className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn("relative flex flex-col gap-2.5 pt-4 mt-2 overflow-visible", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: open ? 1 : 0,
        y: open ? 0 : 20,
      }}
      transition={{
        opacity: {
          duration: ms(isOpening ? 80 : 60),
          delay: isOpening ? ms(phase3Config.start + 40) : 0,
        },
        y: {
          duration: ms(isOpening ? 120 : 80),
          delay: isOpening ? ms(phase3Config.start + 30) : 0,
        },
      }}
    >
      {/* Glow bleed effect - fades in with realms */}
      <motion.div
        className="pointer-events-none absolute -top-8 left-0 right-0 h-12 bg-gradient-to-t from-teal-500/[0.03] via-transparent to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={glowTransition}
      />

      {/* Section header - animates up from below */}
      <motion.div
        className="flex items-center gap-3 px-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{
          opacity: open ? 1 : 0,
          y: open ? 0 : 8,
        }}
        transition={headerTransition}
      >
        <motion.div
          className="h-px flex-1 bg-gradient-to-r from-transparent via-teal-500/30 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: open ? 1 : 0 }}
          transition={{
            duration: ms(isOpening ? 150 : 80),
            delay: isOpening ? ms(phase3Config.start + 70) : 0,
          }}
          style={{ originX: 1 }}
        />
        <div className="flex items-center gap-2">
          {/* Decorative dots - stagger in */}
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={`left-dot-${i}`}
                className={cn(
                  "h-1 w-1 rounded-full",
                  i === 0 ? "bg-teal-400/40" : i === 1 ? "bg-violet-400/40" : "bg-amber-400/40"
                )}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: open ? 1 : 0, opacity: open ? 1 : 0 }}
                transition={{
                  duration: 0.1,
                  delay: isOpening ? ms(phase3Config.start + 80 + i * 30) : 0,
                }}
              />
            ))}
          </div>
          <motion.span
            className="text-[9px] font-bold uppercase text-slate-400/60"
            initial={{ letterSpacing: "0.15em", opacity: 0 }}
            animate={{
              letterSpacing: open ? "0.3em" : "0.15em",
              opacity: open ? 1 : 0,
            }}
            transition={{
              letterSpacing: {
                duration: ms(isOpening ? 150 : 80),
                ease: [0.34, 1.56, 0.64, 1],
                delay: isOpening ? ms(phase3Config.start + 70) : 0,
              },
              opacity: headerTransition.opacity,
            }}
          >
            Realms
          </motion.span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={`right-dot-${i}`}
                className={cn(
                  "h-1 w-1 rounded-full",
                  i === 0 ? "bg-amber-400/40" : i === 1 ? "bg-violet-400/40" : "bg-teal-400/40"
                )}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: open ? 1 : 0, opacity: open ? 1 : 0 }}
                transition={{
                  duration: 0.1,
                  delay: isOpening ? ms(phase3Config.start + 80 + i * 30) : 0,
                }}
              />
            ))}
          </div>
        </div>
        <motion.div
          className="h-px flex-1 bg-gradient-to-r from-transparent via-teal-500/30 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: open ? 1 : 0 }}
          transition={{
            duration: ms(isOpening ? 150 : 80),
            delay: isOpening ? ms(phase3Config.start + 70) : 0,
          }}
          style={{ originX: 0 }}
        />
      </motion.div>

      {/* Cards container with ambient glow */}
      <div className="relative flex flex-col gap-2">
        {/* Ambient background glow */}
        <motion.div
          className="pointer-events-none absolute inset-0 -inset-x-2 rounded-2xl bg-gradient-to-b from-teal-500/[0.02] via-violet-500/[0.02] to-amber-500/[0.02] blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: open ? 1 : 0 }}
          transition={glowTransition}
        />
        <div className="relative flex flex-col gap-1.5">{children}</div>
      </div>
    </motion.div>
  );
};
