"use client";

/**
 * PracticeQuestionTool — Practice questions during missions
 * Wraps PracticeQuestionCard and emits tool events
 */

import { HelpCircle, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { useState, useCallback } from "react";
import type { MissionTool, MissionToolRenderProps } from "../../../../missions/types";
import { useMissionRuntime } from "../../../../missions/provider";
import { cn } from "@/lib/utils";
import { GlowButton } from "../../../atoms/GlowButton";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Questions (v0.1)
// ─────────────────────────────────────────────────────────────────────────────

const mockQuestions = [
  {
    id: "q1",
    question: "Which enzyme catalyzes the rate-limiting step of glycolysis?",
    choices: [
      { id: "a", text: "Hexokinase" },
      { id: "b", text: "Phosphofructokinase-1" },
      { id: "c", text: "Pyruvate kinase" },
      { id: "d", text: "Aldolase" },
    ],
    correctAnswerId: "b",
    explanation: "PFK-1 catalyzes the committed step of glycolysis and is the main regulatory enzyme.",
  },
  {
    id: "q2",
    question: "What is the primary function of the electron transport chain?",
    choices: [
      { id: "a", text: "Generate NADH" },
      { id: "b", text: "Produce CO2" },
      { id: "c", text: "Create a proton gradient" },
      { id: "d", text: "Synthesize glucose" },
    ],
    correctAnswerId: "c",
    explanation: "The ETC pumps protons across the inner mitochondrial membrane, creating the gradient used by ATP synthase.",
  },
  {
    id: "q3",
    question: "In the Frank-Starling mechanism, increased preload leads to:",
    choices: [
      { id: "a", text: "Decreased stroke volume" },
      { id: "b", text: "Increased stroke volume" },
      { id: "c", text: "Decreased heart rate" },
      { id: "d", text: "No change in cardiac output" },
    ],
    correctAnswerId: "b",
    explanation: "The Frank-Starling mechanism describes how increased ventricular filling (preload) leads to increased stretch and stronger contraction.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool Panel Component
// ─────────────────────────────────────────────────────────────────────────────

export function PracticeQuestionToolPanel({ toolId }: MissionToolRenderProps) {
  const { dispatch } = useMissionRuntime();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const question = mockQuestions[currentIndex];
  const isCorrect = submitted && selectedId === question.correctAnswerId;

  const handleChoiceSelect = useCallback((choiceId: string) => {
    if (submitted) return;
    setSelectedId(choiceId);
    dispatch({
      type: "tool/event",
      toolId,
      name: "practice/choiceSelected",
      data: { choiceId },
    } as Parameters<typeof dispatch>[0]);
  }, [submitted, dispatch, toolId]);

  const handleSubmit = useCallback(() => {
    if (!selectedId) return;
    setSubmitted(true);
    
    dispatch({
      type: "tool/event",
      toolId,
      name: "practice/submitted",
      data: { questionId: question.id, answerId: selectedId },
    } as Parameters<typeof dispatch>[0]);

    dispatch({
      type: "tool/event",
      toolId,
      name: selectedId === question.correctAnswerId ? "practice/correct" : "practice/incorrect",
    } as Parameters<typeof dispatch>[0]);
  }, [selectedId, question, dispatch, toolId]);

  const handleNext = useCallback(() => {
    if (currentIndex < mockQuestions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedId(null);
      setSubmitted(false);
      setShowExplanation(false);
    }
  }, [currentIndex]);

  return (
    <div className="practice-question-tool flex h-full flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Question {currentIndex + 1} of {mockQuestions.length}</span>
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground leading-relaxed">
          {question.question}
        </h3>
      </div>

      {/* Choices */}
      <div className="space-y-3 mb-6">
        {question.choices.map((choice, index) => {
          const isSelected = selectedId === choice.id;
          const isCorrectChoice = choice.id === question.correctAnswerId;
          const showResult = submitted;

          return (
            <button
              key={choice.id}
              onClick={() => handleChoiceSelect(choice.id)}
              disabled={submitted}
              className={cn(
                "w-full p-4 rounded-lg border text-left transition-all",
                !submitted && isSelected && "border-cyan-neon/60 bg-cyan-neon/10",
                !submitted && !isSelected && "border-border/40 bg-card/40 hover:border-cyan-neon/30",
                showResult && isCorrectChoice && "border-emerald-neon/60 bg-emerald-neon/10",
                showResult && isSelected && !isCorrectChoice && "border-red-500/60 bg-red-500/10",
                submitted && "cursor-default"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium",
                  isSelected ? "border-current" : "border-border/60"
                )}>
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="flex-1 text-sm">{choice.text}</span>
                {showResult && isCorrectChoice && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-neon" />
                )}
                {showResult && isSelected && !isCorrectChoice && (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Result & Explanation */}
      {submitted && (
        <div className="mb-6 space-y-3">
          <div className={cn(
            "flex items-center gap-2 rounded-lg p-3",
            isCorrect ? "bg-emerald-neon/10 text-emerald-neon" : "bg-red-500/10 text-red-400"
          )}>
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Correct!</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Incorrect</span>
              </>
            )}
          </div>

          {showExplanation && (
            <div className="rounded-lg border border-border/40 bg-card/40 p-3">
              <h4 className="mb-1 text-sm font-medium text-foreground">Explanation</h4>
              <p className="text-sm text-muted-foreground">{question.explanation}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center justify-between">
        <div>
          {submitted && (
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {showExplanation ? "Hide" : "Show"} Explanation
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {!submitted ? (
            <GlowButton
              glow="low"
              size="sm"
              onClick={handleSubmit}
              disabled={!selectedId}
            >
              Submit
            </GlowButton>
          ) : currentIndex < mockQuestions.length - 1 ? (
            <GlowButton glow="low" size="sm" onClick={handleNext}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </GlowButton>
          ) : (
            <div className="text-sm text-emerald-neon">All questions complete!</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definition
// ─────────────────────────────────────────────────────────────────────────────

export const PracticeQuestionTool: MissionTool = {
  id: "glia.practiceQuestion",
  title: "Practice",
  description: "Answer practice questions to test your knowledge",
  icon: <HelpCircle className="h-4 w-4" />,
  Panel: PracticeQuestionToolPanel,
  handlesEvents: true,
};

