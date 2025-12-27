"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CheckCircle2, ChevronRight, Clock, RotateCcw, XCircle } from "lucide-react";
import * as React from "react";
import { useCalmMode } from "../../atoms/CalmModeToggle";
import { GlowButton } from "../../atoms/GlowButton";
import { StatBadge } from "../../atoms/StatBadge";

const questionCardVariants = cva(
  "relative w-full rounded-lg border bg-card/40 backdrop-blur-sm transition-all duration-300 overflow-hidden",
  {
    variants: {
      state: {
        default: "border-border/40 hover:border-cyan-neon/40 hover:shadow-neon-cyan/20",
        selected: "border-cyan-neon/60 bg-cyan-neon/5 shadow-neon-cyan/30",
        correct: "border-emerald-neon/60 bg-emerald-neon/5 shadow-neon-emerald/30",
        incorrect:
          "border-destructive/60 bg-destructive/5 shadow-[0_0_20px_hsl(var(--destructive))]",
        disabled: "border-border/20 bg-muted/20 opacity-60 cursor-not-allowed",
      },
      size: {
        default: "p-6",
        compact: "p-4",
        expanded: "p-8",
      },
    },
    defaultVariants: {
      state: "default",
      size: "default",
    },
  }
);

export interface QuestionChoice {
  id: string;
  text: string;
  explanation?: string;
}

export interface PracticeQuestionCardProps
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
    VariantProps<typeof questionCardVariants> {
  /** Question stem/text */
  question: string;
  /** Question choices */
  choices: QuestionChoice[];
  /** Correct answer ID */
  correctAnswerId?: string;
  /** Selected answer ID */
  selectedAnswerId?: string;
  /** Question state */
  state?: "default" | "selected" | "correct" | "incorrect" | "disabled";
  /** Question type */
  type?: "multiple-choice" | "true-false" | "short-answer";
  /** Subject/topic */
  subject?: string;
  /** Difficulty level */
  difficulty?: "Easy" | "Medium" | "Hard" | "Expert";
  /** Time limit in seconds */
  timeLimit?: number;
  /** Show explanation */
  showExplanation?: boolean;
  /** Question number */
  questionNumber?: number;
  /** Total questions */
  totalQuestions?: number;
  /** On choice select callback */
  onChoiceSelect?: (choiceId: string) => void;
  /** On submit callback */
  onSubmit?: () => void;
  /** On next question callback */
  onNext?: () => void;
  /** On explanation toggle callback */
  onExplanationToggle?: () => void;
  /** Loading state */
  loading?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
}

export function PracticeQuestionCard({
  className,
  state = "default",
  size,
  question,
  choices,
  correctAnswerId,
  selectedAnswerId,
  type: _type = "multiple-choice",
  subject,
  difficulty,
  timeLimit,
  showExplanation = false,
  questionNumber,
  totalQuestions,
  onChoiceSelect,
  onSubmit,
  onNext,
  onExplanationToggle,
  loading = false,
  disableAnimations = false,
  ...props
}: PracticeQuestionCardProps) {
  const [remainingTime, setRemainingTime] = React.useState(timeLimit || 0);
  const [showFeedback, setShowFeedback] = React.useState(false);

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;
  const { isCalm } = useCalmMode();

  // Timer effect
  React.useEffect(() => {
    if (timeLimit && remainingTime > 0 && state !== "disabled") {
      const timer = setTimeout(() => {
        setRemainingTime((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLimit, remainingTime, state]);

  // Auto-show feedback when answer is selected
  React.useEffect(() => {
    if (selectedAnswerId && state !== "default") {
      setShowFeedback(true);
    }
  }, [selectedAnswerId, state]);

  const handleChoiceClick = (choiceId: string) => {
    if (state === "disabled" || loading) return;
    onChoiceSelect?.(choiceId);
  };

  const getChoiceState = (choiceId: string): "default" | "selected" | "correct" | "incorrect" => {
    if (choiceId === selectedAnswerId) {
      if (state === "correct") return "correct";
      if (state === "incorrect") return "incorrect";
      return "selected";
    }
    if (choiceId === correctAnswerId && (state === "correct" || state === "incorrect")) {
      return "correct";
    }
    return "default";
  };

  const getChoiceIcon = (choiceId: string) => {
    const choiceState = getChoiceState(choiceId);
    if (choiceState === "correct")
      return (
        <CheckCircle2
          className={cn("h-4 w-4", isCalm ? "text-emerald-600" : "text-emerald-neon")}
        />
      );
    if (choiceState === "incorrect" && choiceId === selectedAnswerId) {
      return <XCircle className={cn("h-4 w-4", isCalm ? "text-red-600" : "text-destructive")} />;
    }
    return null;
  };

  const timePercentage = timeLimit ? (remainingTime / timeLimit) * 100 : 100;
  const isTimeRunningOut = timePercentage < 20;

  return (
    <motion.div
      className={cn(questionCardVariants({ state, size }), className)}
      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldAnimate ? 0.3 : 0 }}
      {...props}
    >
      {/* Background effects */}
      {shouldAnimate && state === "correct" && (
        <motion.div
          className={cn(
            "absolute inset-0 bg-gradient-to-br to-transparent",
            isCalm ? "from-emerald-500/5 via-emerald-500/2" : "from-emerald-neon/10 via-cyan-neon/5"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {shouldAnimate && state === "incorrect" && (
        <motion.div
          className={cn(
            "absolute inset-0 bg-gradient-to-br to-transparent",
            isCalm ? "from-red-500/5 via-red-500/2" : "from-destructive/10 via-red-500/5"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Question number */}
          {questionNumber && totalQuestions && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">
                {questionNumber} of {totalQuestions}
              </span>
            </div>
          )}

          {/* Subject badge */}
          {subject && <StatBadge variant="difficulty" value={subject} size="sm" />}

          {/* Difficulty badge */}
          {difficulty && <StatBadge variant="difficulty" value={difficulty} size="sm" />}
        </div>

        {/* Timer */}
        {timeLimit && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  isTimeRunningOut ? "text-destructive" : "text-foreground"
                )}
              >
                {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, "0")}
              </span>
              {shouldAnimate && (
                <div className="w-8 h-1 bg-border/40 rounded-full overflow-hidden">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      isTimeRunningOut ? "bg-destructive" : "bg-cyan-neon"
                    )}
                    initial={{ width: "100%" }}
                    animate={{ width: `${timePercentage}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Question stem */}
      <motion.div
        className="relative z-10 mb-6"
        initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-foreground leading-relaxed">{question}</h3>
      </motion.div>

      {/* Choices */}
      <div className="relative z-10 space-y-3 mb-6">
        {choices.map((choice, index) => {
          const choiceState = getChoiceState(choice.id);
          const isSelected = choice.id === selectedAnswerId;

          return (
            <motion.button
              key={choice.id}
              className={cn(
                "w-full p-4 rounded-lg border text-left transition-all duration-200 group",
                choiceState === "correct" &&
                  cn(
                    isCalm
                      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
                      : "border-emerald-neon/60 bg-emerald-neon/10 text-emerald-neon"
                  ),
                choiceState === "incorrect" &&
                  isSelected &&
                  cn(
                    isCalm
                      ? "border-red-500/40 bg-red-500/5 text-red-600"
                      : "border-destructive/60 bg-destructive/10 text-destructive"
                  ),
                choiceState === "selected" &&
                  cn(
                    isCalm
                      ? "border-blue-500/40 bg-blue-500/5 text-blue-600"
                      : "border-cyan-neon/60 bg-cyan-neon/10 text-cyan-neon"
                  ),
                choiceState === "default" &&
                  cn(
                    isCalm
                      ? "border-border/60 bg-card/60 hover:border-border/80 hover:bg-card/80"
                      : "border-border/40 bg-card/40 hover:border-cyan-neon/40 hover:bg-cyan-neon/5"
                  ),
                state === "disabled" && "cursor-not-allowed opacity-60"
              )}
              onClick={() => handleChoiceClick(choice.id)}
              disabled={state === "disabled" || loading}
              initial={shouldAnimate ? { opacity: 0, x: -20 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: shouldAnimate ? 0.3 : 0,
                delay: shouldAnimate ? 0.2 + index * 0.1 : 0,
              }}
              whileHover={
                shouldAnimate && choiceState === "default" && state !== "disabled"
                  ? { scale: 1.01, x: 4 }
                  : {}
              }
              whileTap={
                shouldAnimate && choiceState === "default" && state !== "disabled"
                  ? { scale: 0.99 }
                  : {}
              }
            >
              <div className="flex items-start gap-3">
                {/* Choice letter/number */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full border border-current/40 flex items-center justify-center text-xs font-medium group-hover:border-current/60 transition-colors">
                  {String.fromCharCode(65 + index)}
                </div>

                {/* Choice text */}
                <div className="flex-1 text-sm leading-relaxed">{choice.text}</div>

                {/* Status icon */}
                <AnimatePresence>
                  {getChoiceIcon(choice.id) && (
                    <motion.div
                      initial={shouldAnimate ? { opacity: 0, scale: 0, rotate: -180 } : {}}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={shouldAnimate ? { opacity: 0, scale: 0, rotate: 180 } : {}}
                      transition={{
                        duration: shouldAnimate ? 0.4 : 0,
                        type: "spring",
                        bounce: 0.6,
                      }}
                    >
                      {getChoiceIcon(choice.id)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Feedback and Actions */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div
            className="relative z-10 space-y-4"
            initial={shouldAnimate ? { opacity: 0, height: 0 } : {}}
            animate={{ opacity: 1, height: "auto" }}
            exit={shouldAnimate ? { opacity: 0, height: 0 } : {}}
            transition={{ duration: shouldAnimate ? 0.3 : 0 }}
          >
            {/* Result message */}
            <motion.div
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                state === "correct" && "bg-emerald-neon/10 border border-emerald-neon/20",
                state === "incorrect" && "bg-destructive/10 border border-destructive/20"
              )}
              initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.1 }}
            >
              {state === "correct" ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-neon flex-shrink-0" />
                  <span className="text-sm font-medium text-emerald-neon">Correct! Well done.</span>
                </>
              ) : state === "incorrect" ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  <span className="text-sm font-medium text-destructive">
                    Incorrect. Let&apos;s review the correct answer.
                  </span>
                </>
              ) : null}
            </motion.div>

            {/* Correct answer explanation */}
            {correctAnswerId && showExplanation && (
              <motion.div
                className="space-y-2"
                initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.2 }}
              >
                <h4 className="text-sm font-medium text-foreground">Explanation</h4>
                <div className="text-sm text-muted-foreground bg-card/60 p-3 rounded-lg border border-border/20">
                  {choices.find((c) => c.id === correctAnswerId)?.explanation ||
                    "No explanation available."}
                </div>
              </motion.div>
            )}

            {/* Action buttons */}
            <motion.div
              className="flex items-center justify-between pt-2"
              initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.3 }}
            >
              <div className="flex items-center gap-2">
                {showExplanation !== undefined && (
                  <GlowButton variant="ghost" size="sm" glow="none" onClick={onExplanationToggle}>
                    <BookOpen className="h-4 w-4 mr-2" />
                    {showExplanation ? "Hide" : "Show"} Explanation
                  </GlowButton>
                )}

                {state === "incorrect" && (
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    glow="none"
                    onClick={() => {
                      // Reset state for retry
                      setShowFeedback(false);
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </GlowButton>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onSubmit && !selectedAnswerId && (
                  <GlowButton
                    variant="default"
                    size="sm"
                    glow="low"
                    onClick={onSubmit}
                    disabled={!selectedAnswerId || loading}
                  >
                    Submit Answer
                  </GlowButton>
                )}

                {onNext && (state === "correct" || state === "incorrect") && (
                  <GlowButton variant="default" size="sm" glow="low" onClick={onNext}>
                    Next Question
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </GlowButton>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      {loading && (
        <motion.div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Processing...</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
