import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Hexcore Sigil - Kernel Route
 * Archetype: "Reactor Core"
 * Regular hexagon outline with inner concentric hexagon at 60% scale,
 * central dot node
 */
export function Hexcore({ size = 24, className }: SigilProps) {
  // Outer hexagon points (radius 9 from center)
  const outerR = 9;
  const innerR = 5.4; // 60% of outer

  const hexPoints = (r: number, cx: number, cy: number) => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return points.join(" ");
  };

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
      {/* Outer hexagon */}
      <polygon
        points={hexPoints(outerR, 12, 12)}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Inner hexagon (60% scale) */}
      <polygon
        points={hexPoints(innerR, 12, 12)}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Central node */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default Hexcore;
