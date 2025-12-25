import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Helix Sigil - Evolution Route
 * Archetype: "DNA Strand"
 * Two sinusoidal curves crossing at center,
 * 3 horizontal rungs connecting them
 */
export function Helix({ size = 24, className }: SigilProps) {
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
      {/* Left strand - S curve going down */}
      <path
        d="M 7 4 C 7 8, 17 8, 17 12 C 17 16, 7 16, 7 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Right strand - S curve going down (mirror) */}
      <path
        d="M 17 4 C 17 8, 7 8, 7 12 C 7 16, 17 16, 17 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Connecting rungs - horizontal bars */}
      <line
        x1="8.5" y1="6" x2="15.5" y2="6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="10" y1="12" x2="14" y2="12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="8.5" y1="18" x2="15.5" y2="18"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Helix;
