/**
 * Nebula Theme - Clinical Cyberpunk HUD
 *
 * The original Out-of-Scope aesthetic: deep space darkness with
 * cyan/magenta neon accents, glass panels, and starfield ambience.
 */

import type { UiTheme } from "./types";

export const nebulaTheme: UiTheme = {
  id: "nebula",
  name: "Nebula",
  description: "Clinical cyberpunk HUD with neon accents and starfield ambience",

  color: {
    bg: {
      body: "#02040a",
      panel: "rgba(4, 8, 16, 0.94)",
      elevated: "rgba(12, 17, 23, 0.98)",
      horizon: "#050609",
    },
    text: {
      primary: "#E5E7EB",
      muted: "#94A3B8",
      soft: "#64748B",
    },
    accent: {
      primary: "#22D3EE", // cyan-neon
      secondary: "#F43F5E", // magenta-neon
      positive: "#10B981", // emerald-neon
      warning: "#EAB308", // yellow-warning
      destructive: "#F43F5E",
    },
    border: "rgba(34, 211, 238, 0.12)",
    ring: "#22D3EE",
  },

  glass: {
    panelBg: "rgba(4, 8, 16, 0.94)",
    panelBorder: "rgba(34, 211, 238, 0.12)",
    panelBlur: "24px",
    headerGradient:
      "linear-gradient(to right, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.015), transparent)",
    cardBg: "rgba(255, 255, 255, 0.015)",
    cardBorder: "rgba(255, 255, 255, 0.04)",
    hoverBg: "rgba(34, 211, 238, 0.08)",
    activeBorder: "rgba(34, 211, 238, 0.35)",
    activeShadow: "0 6px 28px rgba(34, 211, 238, 0.1)",
  },

  elevation: {
    softDrop: "0 2px 8px rgba(0, 0, 0, 0.15)",
    hudPanel: "0 8px 32px rgba(2, 4, 8, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.02)",
    hudRail: "0 -6px 32px rgba(2, 4, 8, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.02)",
    modal: "0 16px 48px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(34, 211, 238, 0.08)",
    glow: "0 0 16px 1px rgba(34, 211, 238, 0.4)",
  },

  motion: {
    fast: { duration: 0.15, ease: "easeOut" },
    normal: { duration: 0.2, ease: "easeOut" },
    spring: { type: "spring", damping: 25, stiffness: 280 },
    ambientDrift: { duration: 8, ease: "linear" },
    ripple: { duration: 2, ease: "easeInOut" },
  },

  ambient: {
    type: "nebula-stars",
    particleColors: ["#22D3EE", "#F43F5E", "#8B5CF6", "#10B981"],
    particleDensity: 0.6,
    particleSpeed: 0.3,
    particleSizeRange: [1, 3],
    horizonGradient: `
      radial-gradient(ellipse at top left, rgba(34, 211, 238, 0.08), transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(139, 92, 246, 0.06), transparent 50%),
      radial-gradient(circle at 30% 70%, rgba(244, 63, 94, 0.04), transparent 40%)
    `,
    rippleColorPrimary: "rgba(34, 211, 238, 0.04)",
    rippleColorSecondary: "rgba(217, 70, 239, 0.025)",
    glowIntensity: 0.8,
  },

  controls: {
    switch: {
      track: {
        bg: {
          on: "rgba(34, 211, 238, 0.2)",
          off: "rgba(255, 255, 255, 0.08)",
        },
        border: {
          on: "rgba(34, 211, 238, 0.4)",
          off: "rgba(255, 255, 255, 0.15)",
        },
      },
      thumb: {
        bg: {
          on: "#22D3EE",
          off: "#64748B",
        },
        shadow: {
          on: "0 0 8px rgba(34, 211, 238, 0.5)",
          off: "0 1px 2px rgba(0, 0, 0, 0.2)",
        },
      },
    },
    slider: {
      track: {
        bg: "rgba(255, 255, 255, 0.08)",
        border: "rgba(255, 255, 255, 0.15)",
      },
      thumb: {
        bg: "#22D3EE",
        shadow: "0 0 8px rgba(34, 211, 238, 0.5)",
      },
      fill: "rgba(34, 211, 238, 0.6)",
    },
    buttonGlow: {
      hoverBg: "rgba(34, 211, 238, 0.08)",
      hoverText: "#22D3EE",
      hoverShadow: "0 0 10px rgba(34, 211, 238, 0.1)",
    },
  },
};
