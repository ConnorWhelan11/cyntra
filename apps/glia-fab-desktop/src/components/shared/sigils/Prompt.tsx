import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Prompt Sigil - Terminals Route
 * Archetype: "Command Line"
 * Chevron > on left, cursor line on right
 */
export function Prompt({ size = 24, className }: SigilProps) {
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
      {/* Chevron prompt > */}
      <polyline
        points="5,8 10,12 5,16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Cursor line (underscore) */}
      <line
        x1="12" y1="16" x2="19" y2="16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Blinking cursor (vertical bar) */}
      <line
        x1="19" y1="10" x2="19" y2="16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="cursor-blink"
      />
    </svg>
  );
}

export default Prompt;
