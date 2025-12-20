"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import React from "react";
import { IconPulse } from "../../atoms/IconPulse";

const tutorCardVariants = cva(
  "relative p-4 rounded-lg border backdrop-blur-sm transition-all duration-200",
  {
    variants: {
      variant: {
        default: "bg-card/40 border-border/40 shadow-glass",
        suggestion: "bg-cyan-neon/5 border-cyan-neon/30 shadow-neon-cyan/10",
        explanation:
          "bg-emerald-neon/5 border-emerald-neon/30 shadow-neon-emerald/10",
        warning: "bg-yellow-500/5 border-yellow-500/30",
        insight:
          "bg-magenta-neon/5 border-magenta-neon/30 shadow-neon-magenta/10",
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

const cardTypeIcons = {
  text: Bot,
  suggestion: Lightbulb,
  explanation: Brain,
  warning: AlertCircle,
  insight: Sparkles,
  chart: BarChart3,
  progress: TrendingUp,
  flashcard: RotateCcw,
  quiz: CheckCircle2,
  steps: TrendingUp,
} as const;

export interface TutorCardProps
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
    VariantProps<typeof tutorCardVariants> {
  /** Card type determines icon and styling */
  type: keyof typeof cardTypeIcons;
  /** Flashcard data */
  flashcardData?: {
    front: string;
    back: string;
    flipped?: boolean;
  };
  /** Quiz data */
  quizData?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
  };
  /** Step-by-step data */
  stepsData?: Array<{
    title: string;
    description: string;
    completed?: boolean;
  }>;
  /** Card title */
  title?: string;
  /** Main content text */
  content: string;
  /** Bullet points list */
  bulletPoints?: string[];
  /** Chart data for visualization */
  chartData?: { label: string; value: number }[];
  /** Agent name */
  agentName?: string;
  /** Timestamp */
  timestamp?: string;
  /** Loading state */
  loading?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Action buttons */
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  }>;
}

export function TutorCard({
  className,
  variant,
  size,
  type,
  title,
  content,
  bulletPoints,
  chartData,
  flashcardData,
  quizData,
  stepsData,
  agentName = "AI Tutor",
  timestamp,
  loading = false,
  disableAnimations = false,
  onClick,
  actions,
  ...props
}: TutorCardProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const TypeIcon = cardTypeIcons[type];

  // Auto-select variant based on type if not specified
  const finalVariant =
    variant ||
    (type === "suggestion"
      ? "suggestion"
      : type === "explanation"
        ? "explanation"
        : type === "warning"
          ? "warning"
          : type === "insight"
            ? "insight"
            : type === "flashcard"
              ? "suggestion"
              : type === "quiz"
                ? "explanation"
                : type === "steps"
                  ? "insight"
                  : "default");

  return (
    <motion.div
      className={cn(
        tutorCardVariants({ variant: finalVariant, size }),
        onClick && "cursor-pointer hover:shadow-lg",
        className
      )}
      onClick={onClick}
      initial={shouldAnimate ? { opacity: 0, y: 20, scale: 0.95 } : {}}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
      whileHover={
        shouldAnimate && onClick
          ? {
              scale: 1.01,
              y: -2,
              transition: { duration: 0.2 },
            }
          : {}
      }
      {...props}
    >
      {/* Background glow effect */}
      {shouldAnimate && (type === "insight" || type === "suggestion") && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-cyan-neon/5 via-magenta-neon/5 to-emerald-neon/5 opacity-0 rounded-lg"
          animate={{
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <IconPulse
            icon={<TypeIcon className="h-4 w-4" />}
            variant={
              type === "explanation"
                ? "success"
                : type === "warning"
                  ? "warning"
                  : type === "insight"
                    ? "accent"
                    : "default"
            }
            intensity="low"
            pulse={type === "insight"}
            size="sm"
          />

          <div className="space-y-1">
            {title && (
              <motion.h3
                className="font-semibold text-foreground text-sm"
                initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                {title}
              </motion.h3>
            )}

            <motion.div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <span>{agentName}</span>
              {timestamp && (
                <>
                  <span>•</span>
                  <span>{timestamp}</span>
                </>
              )}
            </motion.div>
          </div>
        </div>

        {loading && (
          <motion.div
            className="text-muted-foreground"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Bot className="h-4 w-4" />
          </motion.div>
        )}
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 space-y-3"
        initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        {/* Main text content */}
        <p className="text-sm text-foreground leading-relaxed">{content}</p>

        {/* Bullet points */}
        {bulletPoints && bulletPoints.length > 0 && (
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {bulletPoints.map((point, index) => (
                <motion.li
                  key={index}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                  initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: 0.3 + index * 0.1 }}
                >
                  <div className="w-1 h-1 bg-cyan-neon rounded-full mt-2 flex-shrink-0" />
                  <span>{point}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {/* Simple chart visualization */}
        {chartData && chartData.length > 0 && (
          <motion.div
            className="space-y-2"
            initial={shouldAnimate ? { opacity: 0, scaleY: 0 } : {}}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <h4 className="text-xs font-medium text-foreground">
              Data Overview
            </h4>
            <div className="space-y-1">
              {chartData.map((item, index) => {
                const maxValue = Math.max(...chartData.map((d) => d.value));
                const percentage = (item.value / maxValue) * 100;

                return (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-12 h-1 bg-border/40 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-cyan-neon rounded-full"
                          initial={
                            shouldAnimate
                              ? { width: 0 }
                              : { width: `${percentage}%` }
                          }
                          animate={{ width: `${percentage}%` }}
                          transition={{
                            duration: 0.5,
                            delay: 0.5 + index * 0.1,
                          }}
                        />
                      </div>
                      <span className="text-foreground font-medium tabular-nums min-w-8">
                        {item.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Flashcard */}
        {flashcardData && (
          <motion.div
            className="space-y-3"
            initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
              <div className="text-center">
                {flashcardData.flipped ? (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Answer</div>
                    <div className="text-lg font-medium">
                      {flashcardData.back}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Question
                    </div>
                    <div className="text-lg font-medium">
                      {flashcardData.front}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Quiz */}
        {quizData && (
          <motion.div
            className="space-y-3"
            initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{quizData.question}</h4>
              <div className="space-y-2">
                {quizData.options.map((option, index) => (
                  <div
                    key={index}
                    className="p-3 border border-border/40 rounded-lg text-sm hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <span className="font-medium mr-2">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    {option}
                  </div>
                ))}
              </div>
              {quizData.explanation && (
                <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  {quizData.explanation}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Step-by-step */}
        {stepsData && stepsData.length > 0 && (
          <motion.div
            className="space-y-3"
            initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <div className="space-y-2">
              {stepsData.map((step, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium",
                      step.completed
                        ? "bg-emerald-neon/20 border-emerald-neon text-emerald-neon"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium text-sm">{step.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {step.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Action buttons */}
      {actions && actions.length > 0 && (
        <motion.div
          className="relative z-10 flex gap-2 pt-3 border-t border-border/20 mt-4"
          initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                action.variant === "outline"
                  ? "border border-border/40 text-foreground hover:bg-accent"
                  : action.variant === "ghost"
                    ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              {action.label}
            </button>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
