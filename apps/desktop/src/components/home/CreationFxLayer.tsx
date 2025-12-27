/**
 * CreationFxLayer - CSS-based visual effects for world creation
 *
 * Renders pulse ring animation on submit and success glow.
 * Respects prefers-reduced-motion.
 */

import React from "react";

interface CreationFxLayerProps {
  active: boolean;
  state: "idle" | "submitting" | "success" | "error";
  prefersReducedMotion: boolean;
}

export function CreationFxLayer({ active, state, prefersReducedMotion }: CreationFxLayerProps) {
  if (!active || prefersReducedMotion) {
    return null;
  }

  return (
    <div className="creation-fx-layer" aria-hidden="true">
      {/* Pulse ring - expands on submit */}
      {state === "submitting" && <div className="creation-pulse-ring" />}

      {/* Success glow */}
      {state === "success" && <div className="creation-success-glow" />}

      {/* Seed emblem - center of console */}
      {state === "submitting" && (
        <div className="creation-seed-emblem">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="seed-icon"
          >
            {/* Outer ring */}
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="url(#seedGradient)"
              strokeWidth="2"
              fill="none"
              className="seed-ring"
            />
            {/* Inner hexagon */}
            <path
              d="M24 8L36.9 16V32L24 40L11.1 32V16L24 8Z"
              stroke="url(#seedGradient)"
              strokeWidth="1.5"
              fill="none"
              className="seed-hex"
            />
            {/* Center dot */}
            <circle cx="24" cy="24" r="4" fill="url(#seedGradient)" className="seed-core" />
            <defs>
              <linearGradient id="seedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="oklch(78% 0.12 65)" />
                <stop offset="100%" stopColor="oklch(75% 0.18 160)" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
    </div>
  );
}
