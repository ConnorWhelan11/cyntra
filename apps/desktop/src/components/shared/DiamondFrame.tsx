import React from "react";

interface DiamondFrameProps {
  /** Frame size in pixels (default 32) */
  size?: number;
  /** Is the tile in active/selected state */
  active?: boolean;
  /** Is the tile being hovered */
  hovered?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * DiamondFrame - The containment frame for navigation sigils
 *
 * A 45° rotated square that wraps sigil icons.
 * Visibility and color changes based on state:
 * - Idle: invisible (0% opacity)
 * - Hover: faint outline (40% opacity, slate color)
 * - Active: full visibility with gold accent and glow
 */
export function DiamondFrame({
  size = 32,
  active = false,
  hovered = false,
  className = "",
}: DiamondFrameProps) {
  // Compute diamond dimensions
  // A square rotated 45° with side length S inscribes in a square of size S*sqrt(2)
  // We want the inscribed area to be `size`, so the square side = size / sqrt(2)
  const innerSize = size / Math.SQRT2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`diamond-frame ${active ? "diamond-frame--active" : ""} ${hovered ? "diamond-frame--hovered" : ""} ${className}`}
      aria-hidden="true"
    >
      <rect
        x={size / 2}
        y={(size - innerSize) / 2}
        width={innerSize}
        height={innerSize}
        rx={2}
        transform={`rotate(45 ${size / 2} ${size / 2})`}
        className="diamond-frame-rect"
      />
    </svg>
  );
}

export default DiamondFrame;
