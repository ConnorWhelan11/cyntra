"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import React from "react";

const iconPulseVariants = cva(
  "inline-flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "text-foreground hover:text-cyan-neon",
        muted: "text-muted-foreground hover:text-foreground",
        accent: "text-cyan-neon hover:text-cyan-neon/80",
        success: "text-emerald-neon hover:text-emerald-neon/80",
        warning: "text-yellow-500 hover:text-yellow-400",
        danger: "text-destructive hover:text-destructive/80",
      },
      size: {
        sm: "h-4 w-4",
        default: "h-5 w-5",
        lg: "h-6 w-6",
        xl: "h-8 w-8",
      },
      intensity: {
        none: "",
        low: "drop-shadow-[0_0_4px_currentColor]",
        medium: "drop-shadow-[0_0_8px_currentColor]",
        high: "drop-shadow-[0_0_16px_currentColor]",
      },
      interactive: {
        none: "",
        hover: "cursor-pointer hover:scale-110",
        button: "cursor-pointer hover:scale-110 active:scale-95",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      intensity: "none",
      interactive: "none",
    },
  }
);

export interface IconPulseProps
  extends Omit<
      React.HTMLAttributes<HTMLDivElement>,
      | "children"
      | "onDrag"
      | "onDragEnd"
      | "onDragEnter"
      | "onDragExit"
      | "onDragLeave"
      | "onDragOver"
      | "onDragStart"
      | "onDrop"
      | "onAnimationStart"
      | "onAnimationEnd"
      | "onAnimationIteration"
    >,
    VariantProps<typeof iconPulseVariants> {
  /** Icon element (usually from lucide-react) */
  icon: React.ReactNode;
  /** Pulse animation on hover/focus */
  pulse?: boolean;
  /** Continuous pulse animation */
  continuousPulse?: boolean;
  /** Disable all animations */
  disableAnimations?: boolean;
  /** Click handler (makes it interactive) */
  onClick?: () => void;
  /** ARIA label for accessibility */
  "aria-label"?: string;
}

export function IconPulse({
  className,
  variant,
  size,
  intensity,
  interactive,
  icon,
  pulse = false,
  continuousPulse = false,
  disableAnimations = false,
  onClick,
  "aria-label": ariaLabel,
  ...props
}: IconPulseProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Determine interactivity based on onClick or explicit interactive prop
  const finalInteractive = onClick ? "button" : interactive;

  const baseClassName = cn(
    iconPulseVariants({
      variant,
      size,
      intensity: shouldAnimate ? intensity : "none",
      interactive: shouldAnimate ? finalInteractive : "none",
    }),
    continuousPulse && shouldAnimate && "animate-pulse",
    className
  );

  if (onClick) {
    return (
      <motion.button
        className={baseClassName}
        onClick={onClick}
        aria-label={ariaLabel}
        type="button"
        whileHover={
          shouldAnimate && pulse
            ? {
                scale: 1.1,
                filter: "drop-shadow(0 0 12px currentColor)",
                transition: { duration: 0.2 },
              }
            : shouldAnimate && finalInteractive !== "none"
              ? {
                  scale: 1.05,
                  transition: { duration: 0.1 },
                }
              : {}
        }
        whileTap={
          shouldAnimate
            ? {
                scale: 0.95,
                transition: { duration: 0.1 },
              }
            : {}
        }
        whileFocus={
          shouldAnimate && pulse
            ? {
                scale: 1.05,
                filter: "drop-shadow(0 0 8px currentColor)",
                transition: { duration: 0.2 },
              }
            : {}
        }
        animate={
          shouldAnimate && continuousPulse
            ? {
                scale: [1, 1.05, 1],
                opacity: [1, 0.8, 1],
              }
            : {}
        }
        transition={
          shouldAnimate && continuousPulse
            ? {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : {}
        }
      >
        {/* Icon with potential glow wrapper */}
        <motion.div
          className="flex items-center justify-center"
          initial={shouldAnimate ? { opacity: 0, rotate: -10 } : {}}
          animate={{ opacity: 1, rotate: 0 }}
          transition={{ duration: 0.3 }}
        >
          {icon}
        </motion.div>
      </motion.button>
    );
  }

  return (
    <motion.div
      className={baseClassName}
      aria-label={ariaLabel}
      whileHover={
        shouldAnimate && pulse
          ? {
              scale: 1.1,
              filter: "drop-shadow(0 0 12px currentColor)",
              transition: { duration: 0.2 },
            }
          : shouldAnimate && finalInteractive !== "none"
            ? {
                scale: 1.05,
                transition: { duration: 0.1 },
              }
            : {}
      }
      animate={
        shouldAnimate && continuousPulse
          ? {
              scale: [1, 1.05, 1],
              opacity: [1, 0.8, 1],
            }
          : {}
      }
      transition={
        shouldAnimate && continuousPulse
          ? {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : {}
      }
      {...props}
    >
      {/* Icon with potential glow wrapper */}
      <motion.div
        className="flex items-center justify-center"
        initial={shouldAnimate ? { opacity: 0, rotate: -10 } : {}}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 0.3 }}
      >
        {icon}
      </motion.div>
    </motion.div>
  );
}
