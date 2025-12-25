import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Gameplay Sigil - Gameplay Definition Route
 * Archetype: "Quest Graph"
 * Central objective node with branching paths to corner nodes,
 * representing the objective DAG and trigger network
 */
export function Gameplay({ size = 24, className }: SigilProps) {
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
      {/* Outer diamond frame */}
      <path
        d="M12 3 L21 12 L12 21 L3 12 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Cross lines connecting to center */}
      <line
        x1="12"
        y1="6"
        x2="12"
        y2="9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="18"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="6"
        y1="12"
        x2="9"
        y2="12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="15"
        y1="12"
        x2="18"
        y2="12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Central objective node (larger) */}
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />

      {/* Corner nodes (objectives/triggers) */}
      <circle cx="12" cy="5" r="1.2" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" opacity="0.6" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" opacity="0.6" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export default Gameplay;
