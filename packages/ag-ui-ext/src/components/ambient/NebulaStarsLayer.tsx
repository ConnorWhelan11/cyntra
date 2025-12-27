"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";
import { useAmbientTokens } from "../../theme";

// ============================================================================
// TYPES
// ============================================================================

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  brightness: number;
}

export interface NebulaStarsLayerProps {
  /** Override particle colors */
  colors?: string[];
  /** Override density (0-1) */
  density?: number;
  /** Container className */
  className?: string;
  /** Disable animations */
  disabled?: boolean;
}

// ============================================================================
// STAR GENERATION
// ============================================================================

function generateStars(count: number, colors: string[], sizeRange: [number, number]): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 4,
    brightness: 0.3 + Math.random() * 0.7,
  }));
}

// ============================================================================
// SINGLE STAR COMPONENT
// ============================================================================

interface StarParticleProps {
  star: Star;
}

const StarParticle = React.memo(function StarParticle({ star }: StarParticleProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <div
        className="absolute rounded-full"
        style={{
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: star.size,
          height: star.size,
          backgroundColor: star.color,
          opacity: star.brightness * 0.5,
        }}
      />
    );
  }

  return (
    <motion.div
      className="absolute rounded-full will-change-[opacity,transform]"
      style={{
        left: `${star.x}%`,
        top: `${star.y}%`,
        width: star.size,
        height: star.size,
        backgroundColor: star.color,
        boxShadow: `0 0 ${star.size * 2}px ${star.color}`,
      }}
      animate={{
        opacity: [
          star.brightness * 0.3,
          star.brightness,
          star.brightness * 0.5,
          star.brightness * 0.8,
          star.brightness * 0.3,
        ],
        scale: [1, 1.2, 1, 1.1, 1],
      }}
      transition={{
        duration: star.duration,
        delay: star.delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
});

// ============================================================================
// NEBULA STARS LAYER
// ============================================================================

export function NebulaStarsLayer({
  colors: propColors,
  density: propDensity,
  className,
  disabled = false,
}: NebulaStarsLayerProps) {
  const ambientTokens = useAmbientTokens();
  const reducedMotion = prefersReducedMotion();

  // Use props or fall back to theme tokens
  const colors = propColors ?? ambientTokens.particleColors;
  const density = propDensity ?? ambientTokens.particleDensity;
  const sizeRange = ambientTokens.particleSizeRange;

  // Calculate star count based on viewport and density
  const [stars, setStars] = React.useState<Star[]>([]);

  React.useEffect(() => {
    if (disabled || reducedMotion) {
      setStars([]);
      return;
    }

    // Base count on viewport, scaled by density
    const viewportArea =
      typeof window !== "undefined" ? (window.innerWidth * window.innerHeight) / 10000 : 100;
    const count = Math.floor(viewportArea * density * 3);
    const clampedCount = Math.min(Math.max(count, 30), 150);

    setStars(generateStars(clampedCount, colors, sizeRange));
  }, [colors, density, disabled, reducedMotion, sizeRange]);

  if (disabled || stars.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* Horizon gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: ambientTokens.horizonGradient,
        }}
      />

      {/* Twinkling stars */}
      {stars.map((star) => (
        <StarParticle key={star.id} star={star} />
      ))}

      {/* Nebula glow overlays */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `
            radial-gradient(
              circle at 20% 30%,
              ${colors[0]}10,
              transparent 40%
            ),
            radial-gradient(
              circle at 80% 70%,
              ${colors[1]}08,
              transparent 50%
            )
          `,
        }}
      />
    </div>
  );
}
