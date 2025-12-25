import React from "react";

interface SigilProps {
  size?: number;
  className?: string;
}

/**
 * Cog Sigil - Projects Route
 * Archetype: "Config Gear"
 * 8-tooth gear outline with hollow center
 */
export function Cog({ size = 24, className }: SigilProps) {
  // Generate 8-tooth gear path
  const numTeeth = 8;
  const outerRadius = 9;
  const innerRadius = 6;
  const toothWidth = 0.3; // Radians
  const cx = 12;
  const cy = 12;

  let path = "";

  for (let i = 0; i < numTeeth; i++) {
    const baseAngle = (Math.PI * 2 / numTeeth) * i - Math.PI / 2;

    // Start of tooth (inner)
    const a1 = baseAngle - toothWidth;
    const x1 = cx + innerRadius * Math.cos(a1);
    const y1 = cy + innerRadius * Math.sin(a1);

    // Outer tooth corners
    const a2 = baseAngle - toothWidth * 0.5;
    const x2 = cx + outerRadius * Math.cos(a2);
    const y2 = cy + outerRadius * Math.sin(a2);

    const a3 = baseAngle + toothWidth * 0.5;
    const x3 = cx + outerRadius * Math.cos(a3);
    const y3 = cy + outerRadius * Math.sin(a3);

    // End of tooth (inner)
    const a4 = baseAngle + toothWidth;
    const x4 = cx + innerRadius * Math.cos(a4);
    const y4 = cy + innerRadius * Math.sin(a4);

    // Valley to next tooth
    const nextBaseAngle = (Math.PI * 2 / numTeeth) * (i + 1) - Math.PI / 2;
    const a5 = nextBaseAngle - toothWidth;
    const x5 = cx + innerRadius * Math.cos(a5);
    const y5 = cy + innerRadius * Math.sin(a5);

    if (i === 0) {
      path += `M ${x1.toFixed(2)} ${y1.toFixed(2)} `;
    }

    path += `L ${x2.toFixed(2)} ${y2.toFixed(2)} `;
    path += `L ${x3.toFixed(2)} ${y3.toFixed(2)} `;
    path += `L ${x4.toFixed(2)} ${y4.toFixed(2)} `;

    // Arc along inner circle to next tooth
    if (i < numTeeth - 1) {
      path += `A ${innerRadius} ${innerRadius} 0 0 1 ${x5.toFixed(2)} ${y5.toFixed(2)} `;
    }
  }

  path += "Z";

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
      {/* Gear outline */}
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Hollow center */}
      <circle
        cx="12"
        cy="12"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export default Cog;
