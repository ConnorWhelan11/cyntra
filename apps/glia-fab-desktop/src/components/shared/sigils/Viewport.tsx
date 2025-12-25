import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Viewport Sigil - Viewer Route (Reserved)
 * Archetype: "Frame View"
 * Rounded rectangle with inner crosshairs
 */
export function Viewport({ size = 24, className }: SigilProps) {
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
      {/* Outer viewport frame */}
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Crosshairs - horizontal */}
      <line
        x1="9" y1="12" x2="15" y2="12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Crosshairs - vertical */}
      <line
        x1="12" y1="9" x2="12" y2="15"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Corner brackets (focus indicators) */}
      <path
        d="M 6 8 L 6 7 L 8 7"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 16 7 L 18 7 L 18 8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 18 16 L 18 17 L 16 17"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 8 17 L 6 17 L 6 16"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default Viewport;
