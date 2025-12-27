/**
 * WorldBuilderConsole - Single-column hero prompt input
 *
 * ChatGPT-style large textarea as the single hero.
 * Includes kicker, title, suggestion chips, and a collapsible blueprint panel.
 */

import React, { useCallback, useRef, useEffect, useState } from "react";
import type { BlueprintDraft, WorldRuntime, WorldOutput } from "@/types";
import { CreationFxLayer } from "@/components/home/CreationFxLayer";
import { BlueprintMiniPanel } from "./BlueprintMiniPanel";

interface SuggestionChip {
  id: string;
  label: string;
  promptText: string;
  runtime?: WorldRuntime;
  outputs?: WorldOutput[];
}

const SUGGESTION_CHIPS: SuggestionChip[] = [
  {
    id: "cozy-room",
    label: "Cozy living room",
    promptText: "A warm living room with natural light, soft textiles, and indoor plants",
    runtime: "three",
    outputs: ["viewer"],
  },
  {
    id: "car-studio",
    label: "Car in studio",
    promptText: "A sleek electric vehicle in a minimalist photo studio with dramatic lighting",
    runtime: "three",
    outputs: ["viewer", "build"],
  },
  {
    id: "forest-clearing",
    label: "Forest clearing",
    promptText: "A stylized low-poly forest clearing with a small stream and wooden bridge",
    runtime: "godot",
    outputs: ["viewer", "build"],
  },
  {
    id: "modern-house",
    label: "Modern house",
    promptText:
      "A contemporary house with clean lines, large windows, and landscaped garden at golden hour",
    runtime: "three",
    outputs: ["viewer"],
  },
  {
    id: "product-shot",
    label: "Product showcase",
    promptText: "A premium product display on infinite white backdrop with soft studio lighting",
    runtime: "three",
    outputs: ["viewer"],
  },
  {
    id: "sci-fi-corridor",
    label: "Sci-fi corridor",
    promptText: "A futuristic spaceship corridor with glowing panels and metallic surfaces",
    runtime: "godot",
    outputs: ["viewer", "build"],
  },
  {
    id: "zen-garden",
    label: "Zen garden",
    promptText: "A peaceful Japanese zen garden with raked sand, rocks, and a small water feature",
    runtime: "three",
    outputs: ["viewer"],
  },
  {
    id: "workshop",
    label: "Workshop",
    promptText:
      "A craftsman's workshop filled with tools, workbenches, and materials under warm pendant lights",
    runtime: "three",
    outputs: ["viewer"],
  },
];

interface WorldBuilderConsoleProps {
  promptText: string;
  onPromptChange: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitState: "idle" | "submitting" | "success" | "error";
  submitError: string | null;
  prefersReducedMotion: boolean;
  // Blueprint controls
  blueprint: BlueprintDraft;
  onBlueprintChange: (partial: Partial<BlueprintDraft>) => void;
}

export function WorldBuilderConsole({
  promptText,
  onPromptChange,
  onFocusChange,
  onSubmit,
  isSubmitting,
  canSubmit,
  submitState,
  submitError,
  prefersReducedMotion,
  blueprint,
  onBlueprintChange,
}: WorldBuilderConsoleProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [etchChipId, setEtchChipId] = useState<string | null>(null);
  const [focusWithin, setFocusWithin] = useState(false);

  const handleFocusCapture = useCallback(() => {
    if (focusWithin) return;
    setFocusWithin(true);
    onFocusChange(true);
  }, [focusWithin, onFocusChange]);

  const handleBlurCapture = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setFocusWithin(false);
      onFocusChange(false);
    },
    [onFocusChange]
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const maxHeight = 320;
    const minHeight = 120;
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = `${newHeight}px`;
  }, [promptText]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSubmit && !isSubmitting) {
          onSubmit();
        }
      }
      if (e.key === "Escape") {
        textareaRef.current?.blur();
      }
    },
    [canSubmit, isSubmitting, onSubmit]
  );

  // Handle chip click
  const handleChipClick = useCallback(
    (chip: SuggestionChip) => {
      if (!prefersReducedMotion) {
        setEtchChipId(null);
        const raf =
          typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (cb: (time: number) => void) => setTimeout(() => cb(0), 0);
        raf(() => setEtchChipId(chip.id));
        const timeout = typeof window !== "undefined" ? window.setTimeout.bind(window) : setTimeout;
        timeout(() => setEtchChipId(null), 420);
      }

      onPromptChange(chip.promptText);
      if (chip.runtime) {
        onBlueprintChange({ runtime: chip.runtime });
      }
      if (chip.outputs) {
        onBlueprintChange({ outputs: chip.outputs });
      }
      // Focus textarea after chip selection
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    [onPromptChange, onBlueprintChange, prefersReducedMotion]
  );

  // Get console class based on state
  const getConsoleClass = () => {
    const base = "hero-console";
    if (submitState === "error") return `${base} hero-console--error`;
    if (submitState === "success") return `${base} hero-console--success`;
    if (submitState === "submitting") return `${base} hero-console--submitting`;
    return base;
  };

  return (
    <div
      className="hero-container"
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      <CreationFxLayer
        active={submitState === "submitting" || submitState === "success"}
        state={submitState}
        prefersReducedMotion={prefersReducedMotion}
      />
      {/* Radial spotlight behind console */}
      <div className="hero-spotlight" aria-hidden="true" />

      <div className={getConsoleClass()}>
        {/* Kicker */}
        <div className="hero-kicker">CYNTRA / WORLD BUILDER</div>

        {/* Title */}
        <h1 className="hero-title">What world are we building?</h1>

        {/* Subline */}
        <p className="hero-subline">Describe it. Cyntra will compile a world recipe.</p>

        {/* Textarea */}
        <div className="hero-input-wrapper">
          <textarea
            ref={textareaRef}
            value={promptText}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="A warm living room with natural light streaming through large windows..."
            className="hero-textarea"
            disabled={isSubmitting}
            rows={4}
            aria-label="World description"
          />

          {/* Primary CTA */}
          <button
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className="hero-cta"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <span className="hero-spinner" aria-hidden="true" />
            ) : (
              <span className="hero-cta-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span>{isSubmitting ? "Creating..." : "Create World"}</span>
          </button>
        </div>

        {/* Error message */}
        {submitError && (
          <div className="hero-error" role="alert">
            {submitError}
          </div>
        )}

        {/* Hint */}
        <div className="hero-hint">
          <kbd>Enter</kbd> to create · <kbd>Shift+Enter</kbd> for new line
        </div>

        {/* Blueprint panel */}
        <BlueprintMiniPanel
          blueprint={blueprint}
          onUpdate={onBlueprintChange}
          expanded={focusWithin}
          disabled={isSubmitting}
        />

        {/* Suggestion Chips */}
        <div className="hero-suggestions">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => handleChipClick(chip)}
              className={`hero-suggestion-chip ${etchChipId === chip.id ? "is-etching" : ""}`}
              disabled={isSubmitting}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
