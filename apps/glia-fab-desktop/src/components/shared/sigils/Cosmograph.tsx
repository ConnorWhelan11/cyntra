import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Cosmograph Sigil - Universe Route
 * Archetype: "Star Map"
 * Central node with 4 radiating lines at 45° angles,
 * outer ring broken into 4 arcs (open quadrants)
 */
export function Cosmograph({ size = 24, className }: SigilProps) {
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
      {/* Central node */}
      <circle cx="12" cy="12" r="2" fill="currentColor" />

      {/* Radiating lines at 45° angles */}
      <line
        x1="12" y1="12" x2="6" y2="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="12" y1="12" x2="18" y2="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="12" y1="12" x2="6" y2="18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="12" y1="12" x2="18" y2="18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Outer broken ring - 4 arcs in quadrants */}
      <path
        d="M 5 12 A 7 7 0 0 1 12 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 12 5 A 7 7 0 0 1 19 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 19 12 A 7 7 0 0 1 12 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 12 19 A 7 7 0 0 1 5 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default Cosmograph;
