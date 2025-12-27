import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Aperture Sigil - Gallery Route
 * Archetype: "Lens Iris"
 * 6 overlapping arc segments forming circular aperture opening
 */
export function Aperture({ size = 24, className }: SigilProps) {
  // 6 blade aperture, rotated to create iris effect
  const blades = [];
  const numBlades = 6;
  const outerRadius = 9;
  const innerRadius = 4;
  const cx = 12;
  const cy = 12;

  for (let i = 0; i < numBlades; i++) {
    const angle = ((Math.PI * 2) / numBlades) * i - Math.PI / 2;
    const nextAngle = ((Math.PI * 2) / numBlades) * (i + 1) - Math.PI / 2;

    // Outer point
    const x1 = cx + outerRadius * Math.cos(angle);
    const y1 = cy + outerRadius * Math.sin(angle);

    // Inner point (rotated slightly for blade effect)
    const midAngle = angle + (Math.PI / numBlades) * 0.6;
    const x2 = cx + innerRadius * Math.cos(midAngle);
    const y2 = cy + innerRadius * Math.sin(midAngle);

    // Next outer point
    const x3 = cx + outerRadius * Math.cos(nextAngle);
    const y3 = cy + outerRadius * Math.sin(nextAngle);

    blades.push(
      <path
        key={i}
        d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)}`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
  }

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
      {/* Outer circle for context */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.3"
      />

      {/* Aperture blades */}
      {blades}

      {/* Center opening hint */}
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

export default Aperture;
