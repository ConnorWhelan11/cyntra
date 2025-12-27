import React from "react";
import { motion } from "framer-motion";

interface KernelGlyphProps {
  state: "idle" | "running" | "processing" | "error";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: 20,
  md: 28,
  lg: 40,
};

export function KernelGlyph({ state, size = "md", className = "" }: KernelGlyphProps) {
  const pixelSize = SIZE_MAP[size];

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const getStateConfig = () => {
    switch (state) {
      case "running":
        return {
          glyph: "\u25C9", // ◉
          color: "var(--signal-active)",
          animation: prefersReducedMotion
            ? {}
            : {
                scale: [1, 1.1, 1],
                opacity: [0.8, 1, 0.8],
              },
          transition: {
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      case "processing":
        return {
          glyph: "\u25C8", // ◈
          color: "var(--signal-active)",
          animation: prefersReducedMotion
            ? {}
            : {
                rotate: [0, 360],
              },
          transition: {
            duration: 1,
            repeat: Infinity,
            ease: "linear",
          },
        };
      case "error":
        return {
          glyph: "\u26A0", // ⚠
          color: "var(--signal-error)",
          animation: prefersReducedMotion
            ? {}
            : {
                scale: [1, 1.1, 1],
                opacity: [1, 0.6, 1],
              },
          transition: {
            duration: 0.5,
            repeat: Infinity,
            ease: "easeInOut",
          },
        };
      default:
        return {
          glyph: "\u25CB", // ○
          color: "var(--text-tertiary)",
          animation: {},
          transition: {},
        };
    }
  };

  const config = getStateConfig();

  if (prefersReducedMotion || state === "idle") {
    return (
      <div
        className={`kernel-glyph ${className}`}
        style={{
          width: pixelSize,
          height: pixelSize,
          fontSize: pixelSize * 0.7,
          color: config.color,
          display: "grid",
          placeItems: "center",
        }}
        role="status"
        aria-label={`Kernel ${state}`}
      >
        {config.glyph}
      </div>
    );
  }

  return (
    <motion.div
      className={`kernel-glyph ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        fontSize: pixelSize * 0.7,
        color: config.color,
        display: "grid",
        placeItems: "center",
        // Non-idle states get a glow effect (idle already returned early)
        filter: `drop-shadow(0 0 ${pixelSize / 4}px ${config.color})`,
      }}
      animate={config.animation}
      transition={config.transition}
      role="status"
      aria-label={`Kernel ${state}`}
    >
      {config.glyph}
    </motion.div>
  );
}

export default KernelGlyph;
