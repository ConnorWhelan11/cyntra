"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import {
  Beaker,
  Book,
  Brain,
  CheckCircle2,
  Circle,
  Clock,
  Heart,
  PlayCircle,
  Target,
} from "lucide-react";
import React, { useState } from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { StatBadge } from "../../atoms/StatBadge";

const studyNodeVariants = cva(
  "relative flex flex-col items-center cursor-pointer group",
  {
    variants: {
      variant: {
        default: "",
        featured: "z-10",
      },
      size: {
        sm: "gap-2",
        default: "gap-3",
        lg: "gap-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const nodeVariants = cva(
  "relative flex items-center justify-center rounded-full border-2 transition-all duration-300 overflow-hidden",
  {
    variants: {
      status: {
        upcoming: "bg-muted/20 border-border/40 text-muted-foreground",
        available:
          "bg-background border-cyan-neon/60 text-cyan-neon shadow-neon-cyan/40",
        "in-progress":
          "bg-cyan-neon/10 border-cyan-neon text-cyan-neon shadow-neon-cyan animate-soft-glow",
        completed:
          "bg-emerald-neon/10 border-emerald-neon text-emerald-neon shadow-neon-emerald",
        locked: "bg-muted/10 border-border/20 text-muted-foreground/50",
      },
      size: {
        sm: "w-8 h-8",
        default: "w-12 h-12",
        lg: "w-16 h-16",
      },
    },
    defaultVariants: {
      status: "available",
      size: "default",
    },
  }
);

const subjectIcons = {
  Biology: Book,
  Chemistry: Beaker,
  Physics: Target,
  Psychology: Brain,
  Sociology: Heart,
  "Critical Analysis": Target,
} as const;

export interface StudyNodeProps
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
    VariantProps<typeof studyNodeVariants> {
  /** Topic/subject name */
  topic: string;
  /** Subject category */
  subject?: keyof typeof subjectIcons;
  /** Estimated time in minutes */
  estimatedTime: number;
  /** Difficulty level */
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  /** Node status */
  status: "upcoming" | "available" | "in-progress" | "completed" | "locked";
  /** Progress (0-1) for in-progress items */
  progress?: number;
  /** Additional details for popover */
  description?: string;
  /** Prerequisites */
  prerequisites?: string[];
  /** Learning objectives */
  objectives?: string[];
  /** Click handler for starting/continuing */
  onStart?: () => void;
  /** Node position in timeline */
  position?: "first" | "middle" | "last";
  /** Disable animations */
  disableAnimations?: boolean;
}

export function StudyNode({
  className,
  variant,
  size,
  topic,
  subject,
  estimatedTime,
  difficulty,
  status,
  progress = 0,
  description,
  prerequisites,
  objectives,
  onStart,
  position = "middle",
  disableAnimations = false,
  ...props
}: StudyNodeProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const SubjectIcon = subject ? subjectIcons[subject] : Book;

  const statusIcons = {
    upcoming: Circle,
    available: PlayCircle,
    "in-progress": Target,
    completed: CheckCircle2,
    locked: Circle,
  };

  const StatusIcon = statusIcons[status];

  return (
    <div
      className={cn(studyNodeVariants({ variant, size }), className)}
      {...props}
    >
      {/* Timeline connector line */}
      {position !== "first" && (
        <div className="absolute -top-6 left-1/2 w-0.5 h-6 bg-border/40 -translate-x-1/2" />
      )}
      {position !== "last" && (
        <div className="absolute -bottom-6 left-1/2 w-0.5 h-6 bg-border/40 -translate-x-1/2" />
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <motion.button
            className={cn(
              nodeVariants({ status, size }),
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            initial={shouldAnimate ? { scale: 0, opacity: 0 } : {}}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: shouldAnimate ? 0.3 : 0,
              type: "spring",
              bounce: 0.4,
            }}
            whileHover={
              shouldAnimate && status !== "locked"
                ? {
                    scale: 1.1,
                    transition: { duration: 0.2 },
                  }
                : {}
            }
            whileTap={
              shouldAnimate && status !== "locked"
                ? {
                    scale: 0.95,
                    transition: { duration: 0.1 },
                  }
                : {}
            }
            disabled={status === "locked"}
          >
            {/* Background pulse for in-progress */}
            {shouldAnimate && status === "in-progress" && (
              <motion.div
                className="absolute inset-0 bg-cyan-neon/20 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}

            {/* Icon */}
            <div className="relative z-10 flex items-center justify-center">
              {status === "completed" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : subject ? (
                <SubjectIcon className="h-4 w-4" />
              ) : (
                <StatusIcon className="h-4 w-4" />
              )}
            </div>

            {/* Progress ring for in-progress items */}
            {status === "in-progress" && progress > 0 && (
              <svg
                className="absolute inset-0 w-full h-full transform -rotate-90"
                viewBox="0 0 36 36"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${progress * 100} 100`}
                  className="opacity-60"
                />
              </svg>
            )}
          </motion.button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-80 rounded-lg border border-border/40 bg-card/95 backdrop-blur-md p-4 text-card-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
            sideOffset={8}
          >
            <motion.div
              initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{topic}</h3>
                  <StatBadge
                    variant="difficulty"
                    value={difficulty}
                    size="sm"
                  />
                </div>

                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{estimatedTime} min</span>
                </div>

                {subject && (
                  <div className="flex items-center gap-1">
                    <SubjectIcon className="h-3 w-3" />
                    <span>{subject}</span>
                  </div>
                )}

                {status === "in-progress" && progress > 0 && (
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    <span>{Math.round(progress * 100)}% complete</span>
                  </div>
                )}
              </div>

              {/* Prerequisites */}
              {prerequisites && prerequisites.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-foreground">
                    Prerequisites
                  </h4>
                  <ul className="space-y-1">
                    {prerequisites.map((prereq, index) => (
                      <li
                        key={index}
                        className="text-xs text-muted-foreground flex items-center gap-2"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-neon" />
                        {prereq}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Learning objectives */}
              {objectives && objectives.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-foreground">
                    Learning Objectives
                  </h4>
                  <ul className="space-y-1">
                    {objectives.map((objective, index) => (
                      <li
                        key={index}
                        className="text-xs text-muted-foreground flex items-start gap-2"
                      >
                        <div className="w-1 h-1 bg-cyan-neon rounded-full mt-1.5 flex-shrink-0" />
                        {objective}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action button */}
              {onStart && status !== "locked" && status !== "completed" && (
                <div className="pt-2 border-t border-border/20">
                  <GlowButton
                    variant={status === "in-progress" ? "default" : "outline"}
                    size="sm"
                    glow="low"
                    onClick={() => {
                      onStart();
                      setOpen(false);
                    }}
                    className="w-full"
                  >
                    {status === "in-progress" ? "Continue" : "Start"} Study
                    Session
                  </GlowButton>
                </div>
              )}
            </motion.div>

            <Popover.Arrow className="fill-border/40" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Node label */}
      <motion.div
        className="text-center space-y-1"
        initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <p className="text-xs font-medium text-foreground truncate max-w-24">
          {topic}
        </p>
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{estimatedTime}m</span>
        </div>
      </motion.div>
    </div>
  );
}
