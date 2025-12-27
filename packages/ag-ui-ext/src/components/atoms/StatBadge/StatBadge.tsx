"use client";

import { cn, formatNumber, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Clock, Flame, Star, Target, Trophy, Zap } from "lucide-react";
import React from "react";

const statBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 border",
  {
    variants: {
      variant: {
        xp: "bg-emerald-neon/10 text-emerald-neon border-emerald-neon/30 shadow-neon-emerald/20",
        streak: "bg-cyan-neon/10 text-cyan-neon border-cyan-neon/30 shadow-neon-cyan/20",
        difficulty: "bg-muted/50 text-muted-foreground border-border/50",
        achievement:
          "bg-magenta-neon/10 text-magenta-neon border-magenta-neon/30 shadow-neon-magenta/20",
        time: "bg-card/80 text-foreground border-border/40 shadow-glass",
        score: "bg-primary/10 text-primary border-primary/30",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        default: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
      glow: {
        none: "",
        subtle: "animate-soft-glow",
        intense: "shadow-glow animate-pulse",
      },
    },
    defaultVariants: {
      variant: "xp",
      size: "default",
      glow: "none",
    },
  }
);

const iconMap = {
  xp: Zap,
  streak: Flame,
  difficulty: Target,
  achievement: Trophy,
  time: Clock,
  score: Star,
} as const;

export interface StatBadgeProps
  extends
    Omit<
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
    VariantProps<typeof statBadgeVariants> {
  /** Stat value (number will be formatted) */
  value: number | string;
  /** Optional suffix (XP, days, %, etc.) */
  suffix?: string;
  /** Optional prefix */
  prefix?: string;
  /** Custom icon (overrides variant default) */
  icon?: React.ReactNode;
  /** Show icon */
  showIcon?: boolean;
  /** Animate value changes */
  animateValue?: boolean;
  /** Disable glow animations */
  disableAnimations?: boolean;
}

export function StatBadge({
  className,
  variant = "xp",
  size,
  glow,
  value,
  suffix,
  prefix,
  icon,
  showIcon = true,
  animateValue = false,
  disableAnimations = false,
  ...props
}: StatBadgeProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Get default icon for variant
  const DefaultIcon = iconMap[variant as keyof typeof iconMap];
  const displayIcon = icon || (DefaultIcon && <DefaultIcon className="h-3 w-3" />);

  // Format value if it's a number
  const formattedValue = typeof value === "number" ? formatNumber(value) : value;
  const displayText = `${prefix || ""}${formattedValue}${suffix || ""}`;

  return (
    <motion.div
      className={cn(
        statBadgeVariants({
          variant,
          size,
          glow: shouldAnimate ? glow : "none",
        }),
        className
      )}
      initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : {}}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      whileHover={
        shouldAnimate
          ? {
              scale: 1.05,
              transition: { duration: 0.1 },
            }
          : {}
      }
      {...props}
    >
      {/* Icon */}
      {showIcon && displayIcon && (
        <motion.div
          className="flex-shrink-0"
          initial={shouldAnimate ? { opacity: 0, rotate: -10 } : {}}
          animate={{ opacity: 1, rotate: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {displayIcon}
        </motion.div>
      )}

      {/* Value */}
      <motion.span
        className="font-semibold tabular-nums"
        initial={shouldAnimate && animateValue ? { opacity: 0, y: 5 } : {}}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: showIcon ? 0.2 : 0.1 }}
      >
        {displayText}
      </motion.span>
    </motion.div>
  );
}
