import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Stage Sigil - Immersa Route (Reserved)
 * Archetype: "Presentation"
 * Trapezoid (perspective stage floor) with vertical line above (speaker)
 */
export function Stage({ size = 24, className }: SigilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Speaker podium (vertical line with node) */}
      <line
        x1="12"
        y1="4"
        x2="12"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="4" r="1.5" fill="currentColor" />

      {/* Stage floor (trapezoid in perspective) */}
      <path
        d="M 6 12 L 18 12 L 20 20 L 4 20 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Stage perspective lines */}
      <line
        x1="8"
        y1="14"
        x2="6"
        y2="20"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="16"
        y1="14"
        x2="18"
        y2="20"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export default Stage;
