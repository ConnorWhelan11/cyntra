"use client";

/**
 * CheckpointModal — Mid-mission checkpoint prompt
 */

import { Clock, ChevronRight, MessageSquare } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { useMissionRuntime } from "../../../../missions/provider";
import { GlowButton } from "../../../atoms/GlowButton";

export interface CheckpointModalProps {
  /** Custom class name */
  className?: string;
}

export function CheckpointModal({ className }: CheckpointModalProps) {
  const { definition, state, ackCheckpoint } = useMissionRuntime();
  const reducedMotion = prefersReducedMotion();
  const [notes, setNotes] = useState("");

  if (!definition || !state?.checkpoint) {
    return null;
  }

  const checkpoint = definition.checkpoints?.find((c) => c.id === state.checkpoint?.id);

  const handleContinue = () => {
    ackCheckpoint(state.checkpoint!.id);
  };

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
          className
        )}
        initial={reducedMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? {} : { opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-card/95 shadow-2xl overflow-hidden"
          initial={reducedMotion ? {} : { scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={reducedMotion ? {} : { scale: 0.95, y: 20 }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-400/20 to-amber-400/5 px-6 py-4 border-b border-amber-400/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Checkpoint</h3>
                <p className="text-sm text-muted-foreground">
                  {checkpoint?.title ?? "Quick check-in"}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <p className="text-sm text-foreground">
              Take a moment to assess your progress. How are you feeling about the material so far?
            </p>

            {/* Quick reflection prompt */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                Quick reflection (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What's working? What needs attention?"
                className="w-full h-20 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm resize-none focus:border-amber-400/40 focus:outline-none"
              />
            </div>

            {/* Self-assessment */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Are you on track?</span>
              <div className="flex gap-2">
                {["Behind", "On track", "Ahead"].map((option) => (
                  <button
                    key={option}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm transition-all",
                      option === "On track"
                        ? "border-emerald-neon/40 bg-emerald-neon/10 text-emerald-neon"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:border-border/60"
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border/40 px-6 py-4 bg-card/50">
            <GlowButton glow="low" onClick={handleContinue}>
              Continue
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </GlowButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
