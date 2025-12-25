import { motion } from "framer-motion";
import React, { useMemo } from "react";

/**
 * Ambient particle layer for Mission Control background
 * Creates a subtle star field effect with gentle drifting particles
 */

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
}

interface AmbientLayerProps {
  /** Number of particles (default: 50) */
  count?: number;
  /** Disable animations */
  disabled?: boolean;
  className?: string;
}

function generateStars(count: number): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    // Gaussian-ish distribution for size (1-3px)
    size: 1 + Math.random() * 2,
    opacity: 0.1 + Math.random() * 0.3,
    delay: Math.random() * 20,
    duration: 15 + Math.random() * 10,
  }));
}

const StarParticle = React.memo(function StarParticle({ star }: { star: Star }) {
  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    return (
      <div
        className="absolute rounded-full"
        style={{
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: star.size,
          height: star.size,
          backgroundColor: "var(--ambient-star)",
          opacity: star.opacity * 0.5,
        }}
      />
    );
  }

  return (
    <motion.div
      className="absolute rounded-full will-change-transform"
      style={{
        left: `${star.x}%`,
        top: `${star.y}%`,
        width: star.size,
        height: star.size,
        backgroundColor: "var(--ambient-star)",
        boxShadow: `0 0 ${star.size * 2}px var(--ambient-star-glow)`,
      }}
      animate={{
        opacity: [star.opacity * 0.3, star.opacity, star.opacity * 0.5, star.opacity * 0.8, star.opacity * 0.3],
        x: [0, 10, 5, -5, 0],
        y: [0, -5, 10, 5, 0],
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

export function AmbientLayer({
  count = 50,
  disabled = false,
  className = "",
}: AmbientLayerProps) {
  const stars = useMemo(() => {
    if (disabled) return [];
    return generateStars(count);
  }, [count, disabled]);

  if (disabled || stars.length === 0) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 1200px 800px at 20% 10%, var(--ambient-gradient-1), transparent),
            radial-gradient(ellipse 800px 600px at 80% 90%, var(--ambient-gradient-2), transparent),
            var(--void)
          `,
        }}
      />

      {/* Stars */}
      {stars.map((star) => (
        <StarParticle key={star.id} star={star} />
      ))}

      {/* Subtle nebula glow */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `
            radial-gradient(circle at 15% 25%, var(--ambient-nebula-cyan), transparent 40%),
            radial-gradient(circle at 85% 75%, var(--ambient-nebula-gold), transparent 50%)
          `,
        }}
      />
    </div>
  );
}

export default AmbientLayer;
