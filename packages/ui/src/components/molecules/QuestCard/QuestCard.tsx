"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import React from "react";
import { IconPulse } from "../../atoms/IconPulse";
import { StatBadge } from "../../atoms/StatBadge";

const questCardVariants = cva(
  "relative group p-4 rounded-lg border transition-all duration-200 cursor-pointer overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-card/40 border-border/40 hover:border-cyan-neon/40 hover:shadow-neon-cyan/20 backdrop-blur-sm",
        completed:
          "bg-emerald-neon/5 border-emerald-neon/30 shadow-neon-emerald/10",
        locked: "bg-muted/20 border-border/20 opacity-60 cursor-not-allowed",
        featured:
          "bg-gradient-to-br from-cyan-neon/10 via-magenta-neon/5 to-emerald-neon/10 border-cyan-neon/40 shadow-neon-cyan/30",
      },
      size: {
        default: "p-4",
        compact: "p-3",
        expanded: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface QuestCardProps
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
    VariantProps<typeof questCardVariants> {
  /** Quest title */
  title: string;
  /** Quest description */
  description?: string;
  /** Reward XP amount */
  rewardXP: number;
  /** Difficulty level */
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  /** Progress (0-1) */
  progress: number;
  /** Estimated time in minutes */
  estimatedTime?: number;
  /** Quest status */
  status: "available" | "in-progress" | "completed" | "locked";
  /** Click handler */
  onClick?: () => void;
  /** Show progress bar */
  showProgress?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Featured quest (special styling) */
  featured?: boolean;
}

export function QuestCard({
  className,
  variant,
  size,
  title,
  description,
  rewardXP,
  difficulty,
  progress,
  estimatedTime,
  status,
  onClick,
  showProgress = true,
  disableAnimations = false,
  featured = false,
  ...props
}: QuestCardProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Determine variant based on status and featured flag
  const finalVariant = featured
    ? "featured"
    : status === "completed"
      ? "completed"
      : status === "locked"
        ? "locked"
        : variant || "default";

  const statusIcons = {
    available: Circle,
    "in-progress": Target,
    completed: CheckCircle2,
    locked: Circle,
  };

  const StatusIcon = statusIcons[status];

  return (
    <motion.div
      className={cn(
        questCardVariants({ variant: finalVariant, size }),
        className
      )}
      onClick={status !== "locked" ? onClick : undefined}
      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={
        shouldAnimate && status !== "locked"
          ? {
              scale: 1.02,
              y: -2,
              transition: { duration: 0.2 },
            }
          : {}
      }
      whileTap={
        shouldAnimate && status !== "locked"
          ? {
              scale: 0.98,
              transition: { duration: 0.1 },
            }
          : {}
      }
      {...props}
    >
      {/* Background glow effect for featured quests */}
      {shouldAnimate && featured && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-cyan-neon/5 via-magenta-neon/5 to-emerald-neon/5 opacity-0 rounded-lg"
          animate={{
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Status icon */}
          <IconPulse
            icon={<StatusIcon className="h-4 w-4" />}
            variant={
              status === "completed"
                ? "success"
                : status === "in-progress"
                  ? "accent"
                  : status === "locked"
                    ? "muted"
                    : "default"
            }
            intensity={status === "completed" ? "medium" : "low"}
            pulse={status === "in-progress"}
            size="sm"
          />

          {/* Title and description */}
          <div className="flex-1 min-w-0">
            <motion.h3
              className="font-semibold text-foreground text-sm leading-tight truncate"
              initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              {title}
            </motion.h3>
            {description && (
              <motion.p
                className="text-xs text-muted-foreground mt-1 line-clamp-2"
                initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                {description}
              </motion.p>
            )}
          </div>
        </div>

        {/* Action indicator */}
        {onClick && status !== "locked" && (
          <motion.div
            className="text-muted-foreground group-hover:text-cyan-neon transition-colors"
            initial={shouldAnimate ? { opacity: 0, x: 10 } : {}}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <ChevronRight className="h-4 w-4" />
          </motion.div>
        )}
      </div>

      {/* Metadata row */}
      <div className="relative z-10 flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {/* Difficulty badge */}
          <StatBadge variant="difficulty" value={difficulty} size="sm" />

          {/* Time estimate */}
          {estimatedTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{estimatedTime}m</span>
            </div>
          )}
        </div>

        {/* Reward XP */}
        <StatBadge
          variant="xp"
          value={rewardXP}
          suffix=" XP"
          size="sm"
          glow={featured ? "subtle" : "none"}
        />
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div className="relative z-10">
          <motion.div
            className="flex items-center justify-between text-xs text-muted-foreground mb-1"
            initial={shouldAnimate ? { opacity: 0 } : {}}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <span>Progress</span>
            <span>{Math.round(progress * 100)}%</span>
          </motion.div>

          <div className="h-1.5 bg-border/40 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                status === "completed"
                  ? "bg-emerald-neon"
                  : status === "in-progress"
                    ? "bg-cyan-neon"
                    : "bg-muted-foreground/40"
              )}
              initial={
                shouldAnimate ? { width: 0 } : { width: `${progress * 100}%` }
              }
              animate={{ width: `${progress * 100}%` }}
              transition={{
                duration: shouldAnimate ? 0.8 : 0,
                delay: 0.4,
                ease: "easeOut",
              }}
            />
          </div>
        </div>
      )}

      {/* Completion overlay */}
      {status === "completed" && (
        <motion.div
          className="absolute top-2 right-2 z-20"
          initial={shouldAnimate ? { opacity: 0, scale: 0, rotate: -180 } : {}}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{
            duration: 0.5,
            delay: 0.2,
            type: "spring",
            bounce: 0.4,
          }}
        >
          <div className="bg-emerald-neon/20 text-emerald-neon p-1 rounded-full">
            <Trophy className="h-3 w-3" />
          </div>
        </motion.div>
      )}

      {/* Featured quest sparkle effect */}
      {shouldAnimate && featured && (
        <motion.div
          className="absolute top-1 right-1 text-cyan-neon"
          animate={{
            opacity: [0, 1, 0],
            scale: [0.8, 1.2, 0.8],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Zap className="h-3 w-3" />
        </motion.div>
      )}
    </motion.div>
  );
}
