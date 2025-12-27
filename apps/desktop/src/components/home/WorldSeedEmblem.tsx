/**
 * WorldSeedEmblem - Animated seed icon for world creation
 *
 * Shows charge → launch animation during creation.
 */

import React from "react";

interface WorldSeedEmblemProps {
  state: "idle" | "charging" | "launching" | "complete";
  size?: number;
}

export function WorldSeedEmblem({ state, size = 64 }: WorldSeedEmblemProps) {
  return (
    <div
      className={`world-seed-emblem world-seed-${state}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background glow */}
        <circle cx="32" cy="32" r="28" fill="url(#seedBgGradient)" className="seed-bg" />

        {/* Outer ring - rotates during charging */}
        <circle
          cx="32"
          cy="32"
          r="26"
          stroke="url(#seedRingGradient)"
          strokeWidth="2"
          strokeDasharray="8 4"
          fill="none"
          className="seed-outer-ring"
        />

        {/* Hexagonal structure */}
        <path
          d="M32 10L49.3 20V44L32 54L14.7 44V20L32 10Z"
          stroke="url(#seedHexGradient)"
          strokeWidth="1.5"
          fill="none"
          className="seed-hex-structure"
        />

        {/* Inner triangles */}
        <path
          d="M32 10L49.3 32L32 54L14.7 32L32 10Z"
          stroke="url(#seedHexGradient)"
          strokeWidth="1"
          strokeOpacity="0.5"
          fill="none"
          className="seed-inner-tri"
        />

        {/* Core - pulses during charging */}
        <circle cx="32" cy="32" r="8" fill="url(#seedCoreGradient)" className="seed-core" />

        {/* Energy particles - visible during charging */}
        <g className="seed-particles">
          <circle cx="32" cy="6" r="2" fill="oklch(78% 0.12 65)" />
          <circle cx="54" cy="18" r="2" fill="oklch(75% 0.18 160)" />
          <circle cx="54" cy="46" r="2" fill="oklch(78% 0.12 65)" />
          <circle cx="32" cy="58" r="2" fill="oklch(75% 0.18 160)" />
          <circle cx="10" cy="46" r="2" fill="oklch(78% 0.12 65)" />
          <circle cx="10" cy="18" r="2" fill="oklch(75% 0.18 160)" />
        </g>

        <defs>
          <radialGradient id="seedBgGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(20% 0.04 260)" />
            <stop offset="100%" stopColor="oklch(12% 0.02 260)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="seedRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(78% 0.12 65)" />
            <stop offset="50%" stopColor="oklch(75% 0.18 160)" />
            <stop offset="100%" stopColor="oklch(78% 0.12 65)" />
          </linearGradient>
          <linearGradient id="seedHexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(75% 0.18 160)" />
            <stop offset="100%" stopColor="oklch(78% 0.12 65)" />
          </linearGradient>
          <radialGradient id="seedCoreGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(85% 0.15 65)" />
            <stop offset="100%" stopColor="oklch(70% 0.12 65)" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
