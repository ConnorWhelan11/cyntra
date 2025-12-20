"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GliaPracticeQuestionPanel } from "../schema";
import type { AgUiWorkspaceActionHandler } from "../types";

export function PracticeQuestionPanel({
  panel,
  className,
}: {
  panel: GliaPracticeQuestionPanel;
  className?: string;
  onAction?: AgUiWorkspaceActionHandler;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const revealMode = panel.props.revealMode;
  const answerKeyId = panel.props.answerKeyId;

  const isCorrect = useMemo(() => {
    if (!submitted) return null;
    if (revealMode !== "onSubmit") return null;
    if (!answerKeyId || !selected) return null;
    return selected === answerKeyId;
  }, [answerKeyId, revealMode, selected, submitted]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-card/40 p-5",
        className
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        practice_question
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">
        {panel.title ?? "Practice"}
      </p>

      <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">
        {panel.props.prompt}
      </p>

      <div className="mt-4 space-y-2">
        {panel.props.choices.map((choice) => {
          const isSelected = selected === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => setSelected(choice.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-left text-sm text-foreground hover:bg-background/60",
                isSelected && "border-cyan-neon/40 bg-cyan-neon/5"
              )}
            >
              <span className="mt-0.5">
                {isSelected ? (
                  <CheckCircle2 className="h-4 w-4 text-cyan-neon" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <span className="flex-1">{choice.text}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          reveal: {revealMode}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setSelected(null);
              setSubmitted(false);
            }}
          >
            Reset
          </Button>
          <Button
            disabled={!selected}
            onClick={() => setSubmitted(true)}
            className="gap-2"
          >
            Submit
          </Button>
        </div>
      </div>

      {isCorrect != null ? (
        <div
          className={cn(
            "mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
            isCorrect
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
              : "border-rose-500/30 bg-rose-500/10 text-rose-100"
          )}
        >
          {isCorrect ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span>{isCorrect ? "Correct" : "Incorrect"}</span>
        </div>
      ) : null}
    </div>
  );
}
