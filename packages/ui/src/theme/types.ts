/**
 * Theme System Types for Out-of-Scope UI
 *
 * This module defines the core type system for multi-skin theming,
 * supporting both Nebula (clinical cyberpunk) and Solarpunk (botanical observatory) themes.
 */

// ============================================================================
// THEME IDENTIFIERS
// ============================================================================

export type UiThemeId = "nebula" | "solarpunk";

// ============================================================================
// COLOR TOKENS
// ============================================================================

export interface UiColorTokens {
  bg: {
    /** Deep space / main body background */
    body: string;
    /** Panel surfaces (glass panels, cards) */
    panel: string;
    /** Elevated surfaces (modals, popovers) */
    elevated: string;
    /** Horizon gradient for ambient backgrounds */
    horizon: string;
  };
  text: {
    /** Primary text color */
    primary: string;
    /** Secondary/muted text */
    muted: string;
    /** Soft/subtle text (labels, hints) */
    soft: string;
  };
  accent: {
    /** Primary accent (cyan in Nebula, gold/sun in Solarpunk) */
    primary: string;
    /** Secondary accent (magenta in Nebula, leaf-green in Solarpunk) */
    secondary: string;
    /** Positive/success states */
    positive: string;
    /** Warning states */
    warning: string;
    /** Destructive/error states */
    destructive: string;
  };
  /** Semantic border color */
  border: string;
  /** Focus ring color */
  ring: string;
}

// ============================================================================
// GLASS TOKENS
// ============================================================================

export interface UiGlassTokens {
  /** Panel background (RGBA with alpha) */
  panelBg: string;
  /** Panel border color */
  panelBorder: string;
  /** Backdrop blur amount */
  panelBlur: string;
  /** Header gradient (for panel headers) */
  headerGradient: string;
  /** Card/item background within panels */
  cardBg: string;
  /** Card border color */
  cardBorder: string;
  /** Hover state background */
  hoverBg: string;
  /** Active state border */
  activeBorder: string;
  /** Active state shadow */
  activeShadow: string;
}

// ============================================================================
// ELEVATION TOKENS
// ============================================================================

export interface UiElevationTokens {
  /** Soft drop shadow for cards */
  softDrop: string;
  /** HUD panel shadow */
  hudPanel: string;
  /** Session rail shadow */
  hudRail: string;
  /** Modal shadow */
  modal: string;
  /** Glow shadow (for neon/accent elements) */
  glow: string;
}

// ============================================================================
// MOTION TOKENS
// ============================================================================

export interface MotionConfig {
  duration: number;
  ease: string | number[];
}

export interface UiMotionTokens {
  /** Fast transitions (hover, active) */
  fast: MotionConfig;
  /** Normal transitions */
  normal: MotionConfig;
  /** Spring animation config */
  spring: {
    type: "spring";
    damping: number;
    stiffness: number;
  };
  /** Ambient drift (particles, background elements) */
  ambientDrift: MotionConfig;
  /** Ripple/glow pulse */
  ripple: MotionConfig;
}

// ============================================================================
// AMBIENT TOKENS
// ============================================================================

export type AmbientType = "nebula-stars" | "dust-motes";

export interface UiAmbientTokens {
  /** Type of ambient background */
  type: AmbientType;
  /** Particle/mote colors */
  particleColors: string[];
  /** Particle density (0-1) */
  particleDensity: number;
  /** Particle speed multiplier */
  particleSpeed: number;
  /** Particle size range [min, max] */
  particleSizeRange: [number, number];
  /** Background horizon gradient */
  horizonGradient: string;
  /** Primary ripple/glow color */
  rippleColorPrimary: string;
  /** Secondary ripple/glow color */
  rippleColorSecondary: string;
  /** Ambient glow intensity (0-1) */
  glowIntensity: number;
}

// ============================================================================
// CONTROL TOKENS
// ============================================================================

export interface UiControlTokens {
  switch: {
    track: {
      bg: { on: string; off: string };
      border: { on: string; off: string };
    };
    thumb: {
      bg: { on: string; off: string };
      shadow: { on: string; off: string };
    };
  };
  slider: {
    track: { bg: string; border: string };
    thumb: { bg: string; shadow: string };
    fill: string;
  };
  /** Button glow effect */
  buttonGlow: {
    hoverBg: string;
    hoverText: string;
    hoverShadow: string;
  };
}

// ============================================================================
// COMPLETE THEME INTERFACE
// ============================================================================

export interface UiTheme {
  /** Theme identifier */
  id: UiThemeId;
  /** Human-readable theme name */
  name: string;
  /** Short description */
  description: string;

  /** Color tokens */
  color: UiColorTokens;
  /** Glass/panel tokens */
  glass: UiGlassTokens;
  /** Elevation/shadow tokens */
  elevation: UiElevationTokens;
  /** Motion/animation tokens */
  motion: UiMotionTokens;
  /** Ambient background tokens */
  ambient: UiAmbientTokens;
  /** Control (switch, slider, button) tokens */
  controls: UiControlTokens;
}

// ============================================================================
// THEME CONTEXT VALUE
// ============================================================================

export interface UiThemeContextValue {
  /** Current theme object */
  theme: UiTheme;
  /** Current theme ID */
  themeId: UiThemeId;
  /** Set theme by ID */
  setThemeId: (id: UiThemeId) => void;
  /** Whether the theme is still loading/hydrating */
  isHydrating: boolean;
}

// ============================================================================
// CSS VARIABLE MAPPING
// ============================================================================

/**
 * Maps theme tokens to CSS custom properties.
 * These are applied to the document root when the theme changes.
 */
export type ThemeCssVariables = {
  // Colors
  "--theme-bg-body": string;
  "--theme-bg-panel": string;
  "--theme-bg-elevated": string;
  "--theme-bg-horizon": string;
  "--theme-text-primary": string;
  "--theme-text-muted": string;
  "--theme-text-soft": string;
  "--theme-accent-primary": string;
  "--theme-accent-secondary": string;
  "--theme-accent-positive": string;
  "--theme-accent-warning": string;
  "--theme-accent-destructive": string;
  "--theme-border": string;
  "--theme-ring": string;

  // Glass
  "--theme-glass-panel-bg": string;
  "--theme-glass-panel-border": string;
  "--theme-glass-panel-blur": string;
  "--theme-glass-header-gradient": string;
  "--theme-glass-card-bg": string;
  "--theme-glass-card-border": string;
  "--theme-glass-hover-bg": string;
  "--theme-glass-active-border": string;
  "--theme-glass-active-shadow": string;

  // Elevation
  "--theme-shadow-soft": string;
  "--theme-shadow-hud-panel": string;
  "--theme-shadow-hud-rail": string;
  "--theme-shadow-modal": string;
  "--theme-shadow-glow": string;

  // Ambient
  "--theme-ambient-horizon": string;
  "--theme-ambient-ripple-primary": string;
  "--theme-ambient-ripple-secondary": string;
  "--theme-ambient-glow-intensity": string;

  // Controls
  "--theme-switch-track-on": string;
  "--theme-switch-track-off": string;
  "--theme-switch-thumb-on": string;
  "--theme-switch-thumb-off": string;
  "--theme-button-glow-hover-bg": string;
  "--theme-button-glow-hover-text": string;
  "--theme-button-glow-hover-shadow": string;
};

