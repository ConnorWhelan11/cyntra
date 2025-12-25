import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Flow Sigil - Runs Route (Reserved)
 * Archetype: "Process Stream"
 * 3 horizontal parallel lines with diagonal flow-arrows
 */
export function Flow({ size = 24, className }: SigilProps) {
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
      {/* Top flow line */}
      <line
        x1="4" y1="7" x2="16" y2="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="14,5 17,7 14,9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Middle flow line */}
      <line
        x1="4" y1="12" x2="18" y2="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="16,10 19,12 16,14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Bottom flow line */}
      <line
        x1="4" y1="17" x2="16" y2="17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <polyline
        points="14,15 17,17 14,19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default Flow;
