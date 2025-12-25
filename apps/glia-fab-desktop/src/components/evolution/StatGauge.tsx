/**
 * StatGauge - Organic biomorphic gauge for evolution stats
 * Features liquid fill animation, blob shape, and pulsing when active
 */

import React, { useMemo } from "react";

interface StatGaugeProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  trend?: "up" | "down" | "stable";
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
  colorScheme?: "fitness" | "rate" | "speed" | "diversity";
}

// Organic blob path generator
function generateBlobPath(seed: number, radius: number): string {
  const points = 8;
  const angleStep = (Math.PI * 2) / points;
  const pathPoints: string[] = [];

  for (let i = 0; i < points; i++) {
    const angle = i * angleStep;
    // Organic variation based on seed
    const variation = 0.85 + 0.3 * Math.sin(seed * 7 + i * 2.1);
    const r = radius * variation;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);

    if (i === 0) {
      pathPoints.push(`M ${x} ${y}`);
    } else {
      // Bezier curves for smooth organic shape
      const prevAngle = (i - 1) * angleStep;
      const prevVariation = 0.85 + 0.3 * Math.sin(seed * 7 + (i - 1) * 2.1);
      const prevR = radius * prevVariation;
      const cp1x = 50 + prevR * 1.1 * Math.cos(prevAngle + angleStep * 0.4);
      const cp1y = 50 + prevR * 1.1 * Math.sin(prevAngle + angleStep * 0.4);
      const cp2x = 50 + r * 1.1 * Math.cos(angle - angleStep * 0.4);
      const cp2y = 50 + r * 1.1 * Math.sin(angle - angleStep * 0.4);
      pathPoints.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`);
    }
  }

  pathPoints.push("Z");
  return pathPoints.join(" ");
}

// Color schemes for different stat types
const colorSchemes = {
  fitness: {
    low: "oklch(60% 0.15 25)",      // Red
    mid: "oklch(75% 0.15 85)",      // Yellow
    high: "oklch(75% 0.16 145)",    // Green
    glow: "oklch(75% 0.16 145 / 0.4)",
  },
  rate: {
    low: "oklch(70% 0.14 250)",     // Blue
    mid: "oklch(65% 0.18 280)",     // Purple
    high: "oklch(75% 0.22 160)",    // Cyan
    glow: "oklch(75% 0.22 160 / 0.4)",
  },
  speed: {
    low: "oklch(60% 0.12 200)",     // Teal dim
    mid: "oklch(70% 0.16 180)",     // Teal
    high: "oklch(80% 0.20 160)",    // Cyan bright
    glow: "oklch(80% 0.20 160 / 0.4)",
  },
  diversity: {
    low: "oklch(55% 0.14 320)",     // Magenta dim
    mid: "oklch(65% 0.18 280)",     // Purple
    high: "oklch(70% 0.20 65)",     // Gold
    glow: "oklch(70% 0.20 65 / 0.4)",
  },
};

const sizes = {
  sm: { outer: 80, inner: 60, fontSize: 14, labelSize: 9 },
  md: { outer: 100, inner: 76, fontSize: 18, labelSize: 10 },
  lg: { outer: 130, inner: 100, fontSize: 24, labelSize: 12 },
};

export function StatGauge({
  value,
  max,
  label,
  unit = "",
  trend,
  isActive = false,
  size = "md",
  colorScheme = "fitness",
}: StatGaugeProps) {
  const dims = sizes[size];
  const colors = colorSchemes[colorScheme];
  const percentage = Math.min(1, Math.max(0, value / max));

  // Generate organic blob paths
  const blobPaths = useMemo(() => ({
    outer: generateBlobPath(42, 45),
    inner: generateBlobPath(17, 38),
    fill: generateBlobPath(23, 36),
  }), []);

  // Interpolate color based on value
  const fillColor = useMemo(() => {
    if (percentage < 0.33) return colors.low;
    if (percentage < 0.66) return colors.mid;
    return colors.high;
  }, [percentage, colors]);

  // Format value for display
  const displayValue = useMemo(() => {
    if (unit === "%") return `${Math.round(value * 100)}`;
    if (value >= 100) return Math.round(value).toString();
    if (value >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }, [value, unit]);

  // Trend arrow
  const trendIcon = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "";
  const trendColor = trend === "up" ? colors.high : trend === "down" ? colors.low : colors.mid;

  return (
    <div
      className={`relative inline-flex flex-col items-center ${isActive ? "animate-cellular-pulse" : ""}`}
      style={{ width: dims.outer, height: dims.outer + 24 }}
    >
      <svg
        viewBox="0 0 100 100"
        width={dims.outer}
        height={dims.outer}
        className="overflow-visible"
      >
        {/* Glow filter */}
        <defs>
          <filter id={`gauge-glow-${label.replace(/\s/g, "")}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <clipPath id={`gauge-clip-${label.replace(/\s/g, "")}`}>
            <path d={blobPaths.fill} />
          </clipPath>
          <linearGradient id={`gauge-gradient-${label.replace(/\s/g, "")}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={colors.low} stopOpacity="0.8" />
            <stop offset="50%" stopColor={fillColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Outer membrane */}
        <path
          d={blobPaths.outer}
          fill="none"
          stroke="var(--evo-cell-membrane)"
          strokeWidth="1.5"
          opacity="0.6"
          className={isActive ? "animate-membrane-flow" : ""}
          style={{ transformOrigin: "50% 50%" }}
        />

        {/* Inner cytoplasm background */}
        <path
          d={blobPaths.inner}
          fill="var(--evo-cytoplasm)"
          opacity="0.8"
        />

        {/* Liquid fill with clip */}
        <g clipPath={`url(#gauge-clip-${label.replace(/\s/g, "")})`}>
          <rect
            x="0"
            y={100 - percentage * 80}
            width="100"
            height={percentage * 80 + 20}
            fill={`url(#gauge-gradient-${label.replace(/\s/g, "")})`}
            opacity="0.85"
            style={{
              transition: "y 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          {/* Liquid surface wobble */}
          <ellipse
            cx="50"
            cy={100 - percentage * 80}
            rx="35"
            ry="4"
            fill={fillColor}
            opacity="0.5"
            style={{
              transition: "cy 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </g>

        {/* Nucleus glow (when active) */}
        {isActive && (
          <circle
            cx="50"
            cy="50"
            r="8"
            fill={colors.high}
            opacity="0.3"
            filter={`url(#gauge-glow-${label.replace(/\s/g, "")})`}
            className="animate-nucleus-glow"
          />
        )}

        {/* Value text */}
        <text
          x="50"
          y="48"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-primary)"
          fontSize={dims.fontSize}
          fontFamily="var(--font-mono)"
          fontWeight="600"
        >
          {displayValue}
        </text>

        {/* Unit text */}
        <text
          x="50"
          y="62"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-tertiary)"
          fontSize={dims.labelSize}
          fontFamily="var(--font-mono)"
        >
          {unit}
          {trend && (
            <tspan fill={trendColor} dx="2">{trendIcon}</tspan>
          )}
        </text>
      </svg>

      {/* Label below */}
      <span
        className="text-center text-secondary font-mono uppercase tracking-wider mt-1"
        style={{ fontSize: dims.labelSize }}
      >
        {label}
      </span>
    </div>
  );
}

export default StatGauge;
