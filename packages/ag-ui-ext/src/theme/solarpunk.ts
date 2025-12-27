/**
 * Solarpunk Theme - Botanical Observatory
 *
 * A warmer, sunlit aesthetic: deep navy with jade and gold accents,
 * soft analog controls, and floating dust motes.
 */

import type { UiTheme } from "./types";

export const solarpunkTheme: UiTheme = {
  id: "solarpunk",
  name: "Solarpunk Observatory",
  description: "Botanical space station with sunlit warmth and organic calm",

  color: {
    bg: {
      body: "#0a0f14", // Slightly warmer than nebula
      panel: "rgba(16, 24, 32, 0.92)",
      elevated: "rgba(24, 32, 40, 0.96)",
      horizon: "#0d1318",
    },
    text: {
      primary: "#F0EDE8", // Warm white
      muted: "#A8B4A8", // Sage-tinged gray
      soft: "#6B7B6B", // Muted sage
    },
    accent: {
      primary: "#F5A623", // Warm gold (sun)
      secondary: "#4ADE80", // Leaf green
      positive: "#4ADE80", // Same leaf green
      warning: "#FB923C", // Warm orange
      destructive: "#EF4444", // Softer red
    },
    border: "rgba(74, 222, 128, 0.15)",
    ring: "#4ADE80",
  },

  glass: {
    panelBg: "rgba(16, 24, 20, 0.88)", // Jade-tinted
    panelBorder: "rgba(74, 222, 128, 0.12)",
    panelBlur: "20px", // Slightly less blur for organic feel
    headerGradient:
      "linear-gradient(to right, rgba(245, 166, 35, 0.06), rgba(74, 222, 128, 0.04), transparent)",
    cardBg: "rgba(245, 166, 35, 0.02)",
    cardBorder: "rgba(74, 222, 128, 0.08)",
    hoverBg: "rgba(245, 166, 35, 0.06)",
    activeBorder: "rgba(245, 166, 35, 0.35)",
    activeShadow: "0 6px 24px rgba(245, 166, 35, 0.1)",
  },

  elevation: {
    softDrop: "0 4px 12px rgba(0, 0, 0, 0.12)",
    hudPanel: "0 8px 32px rgba(10, 15, 20, 0.5), inset 0 1px 0 rgba(245, 166, 35, 0.02)",
    hudRail: "0 -6px 28px rgba(10, 15, 20, 0.5), inset 0 1px 0 rgba(74, 222, 128, 0.03)",
    modal: "0 16px 48px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(245, 166, 35, 0.06)",
    glow: "0 0 20px 2px rgba(245, 166, 35, 0.25)",
  },

  motion: {
    fast: { duration: 0.18, ease: "easeOut" },
    normal: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }, // Slightly smoother
    spring: { type: "spring", damping: 28, stiffness: 240 }, // More relaxed
    ambientDrift: { duration: 12, ease: "linear" }, // Slower drift
    ripple: { duration: 2.5, ease: "easeInOut" },
  },

  ambient: {
    type: "dust-motes",
    particleColors: [
      "rgba(245, 166, 35, 0.6)", // Gold
      "rgba(255, 248, 220, 0.5)", // Warm cream
      "rgba(74, 222, 128, 0.3)", // Faint green
      "rgba(255, 255, 255, 0.4)", // White
    ],
    particleDensity: 0.35, // Sparser than stars
    particleSpeed: 0.15, // Slower, lazier drift
    particleSizeRange: [2, 6], // Larger motes
    horizonGradient: `
      radial-gradient(ellipse at top, rgba(245, 166, 35, 0.06), transparent 60%),
      radial-gradient(ellipse at bottom left, rgba(74, 222, 128, 0.05), transparent 50%),
      linear-gradient(to bottom, rgba(16, 24, 20, 0.3), transparent 70%)
    `,
    rippleColorPrimary: "rgba(245, 166, 35, 0.035)",
    rippleColorSecondary: "rgba(74, 222, 128, 0.025)",
    glowIntensity: 0.5, // Softer glow
  },

  controls: {
    switch: {
      track: {
        bg: {
          on: "rgba(74, 222, 128, 0.2)",
          off: "rgba(245, 230, 210, 0.1)", // Warm cream off state
        },
        border: {
          on: "rgba(74, 222, 128, 0.4)",
          off: "rgba(245, 230, 210, 0.2)",
        },
      },
      thumb: {
        bg: {
          on: "#F5A623", // Gold sun disk
          off: "#8B9B8B", // Sage gray
        },
        shadow: {
          on: "0 0 10px rgba(245, 166, 35, 0.5), inset 0 -1px 2px rgba(0,0,0,0.1)",
          off: "0 1px 3px rgba(0, 0, 0, 0.15)",
        },
      },
    },
    slider: {
      track: {
        bg: "rgba(245, 230, 210, 0.1)",
        border: "rgba(74, 222, 128, 0.15)",
      },
      thumb: {
        bg: "linear-gradient(135deg, #F5A623, #D4860F)", // Brass/wood knob
        shadow: "0 2px 6px rgba(0, 0, 0, 0.2), 0 0 8px rgba(245, 166, 35, 0.3)",
      },
      fill: "rgba(74, 222, 128, 0.5)",
    },
    buttonGlow: {
      hoverBg: "rgba(245, 166, 35, 0.08)",
      hoverText: "#F5A623",
      hoverShadow: "0 0 12px rgba(245, 166, 35, 0.12)",
    },
  },
};
