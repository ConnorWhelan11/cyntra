"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";
import { useAmbientTokens } from "../../theme";

// ============================================================================
// TYPES
// ============================================================================

interface Mote {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
}

export interface DustMotesLayerProps {
  /** Override particle colors */
  colors?: string[];
  /** Override density (0-1) */
  density?: number;
  /** Override speed multiplier */
  speed?: number;
  /** Override size range [min, max] */
  sizeRange?: [number, number];
  /** Container className */
  className?: string;
  /** Disable animations */
  disabled?: boolean;
}

// ============================================================================
// MOTE GENERATION
// ============================================================================

function generateMotes(
  count: number,
  colors: string[],
  sizeRange: [number, number],
  speed: number
): Mote[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 5,
    duration: (8 + Math.random() * 8) / speed,
    driftX: (Math.random() - 0.5) * 30,
    driftY: -20 - Math.random() * 40, // Upward drift
  }));
}

// ============================================================================
// SINGLE MOTE COMPONENT
// ============================================================================

interface MoteParticleProps {
  mote: Mote;
  speedMultiplier: number;
}

const MoteParticle = React.memo(function MoteParticle({
  mote,
  speedMultiplier,
}: MoteParticleProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <div
        className="absolute rounded-full"
        style={{
          left: `${mote.x}%`,
          top: `${mote.y}%`,
          width: mote.size,
          height: mote.size,
          backgroundColor: mote.color,
          opacity: 0.3,
        }}
      />
    );
  }

  return (
    <motion.div
      className="absolute rounded-full will-change-transform"
      style={{
        left: `${mote.x}%`,
        top: `${mote.y}%`,
        width: mote.size,
        height: mote.size,
        backgroundColor: mote.color,
        filter: `blur(${mote.size > 4 ? 1 : 0}px)`,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: [0, 0.6, 0.4, 0.7, 0],
        scale: [0.5, 1, 0.9, 1.1, 0.8],
        x: [0, mote.driftX * 0.3, mote.driftX * 0.7, mote.driftX],
        y: [0, mote.driftY * 0.3, mote.driftY * 0.7, mote.driftY],
      }}
      transition={{
        duration: mote.duration / speedMultiplier,
        delay: mote.delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
});

// ============================================================================
// DUST MOTES LAYER
// ============================================================================

export function DustMotesLayer({
  colors: propColors,
  density: propDensity,
  speed: propSpeed,
  sizeRange: propSizeRange,
  className,
  disabled = false,
}: DustMotesLayerProps) {
  const ambientTokens = useAmbientTokens();
  const reducedMotion = prefersReducedMotion();

  // Use props or fall back to theme tokens
  const colors = propColors ?? ambientTokens.particleColors;
  const density = propDensity ?? ambientTokens.particleDensity;
  const speed = propSpeed ?? ambientTokens.particleSpeed;
  const sizeRange = propSizeRange ?? ambientTokens.particleSizeRange;

  // Calculate mote count based on viewport and density
  const [motes, setMotes] = React.useState<Mote[]>([]);

  React.useEffect(() => {
    if (disabled || reducedMotion) {
      setMotes([]);
      return;
    }

    // Base count on viewport, scaled by density
    const viewportArea =
      typeof window !== "undefined" ? (window.innerWidth * window.innerHeight) / 10000 : 100;
    const count = Math.floor(viewportArea * density * 2);
    const clampedCount = Math.min(Math.max(count, 15), 80);

    setMotes(generateMotes(clampedCount, colors, sizeRange, speed));
  }, [colors, density, disabled, reducedMotion, sizeRange, speed]);

  // Don't render if ambient type is not dust-motes
  if (disabled || motes.length === 0) {
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

      {/* Floating motes */}
      {motes.map((mote) => (
        <MoteParticle key={mote.id} mote={mote} speedMultiplier={speed} />
      ))}

      {/* Soft sunbeam overlay (optional) */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `
            radial-gradient(
              ellipse 60% 100% at 70% 0%,
              ${colors[0]}15,
              transparent 70%
            )
          `,
        }}
      />
    </div>
  );
}
