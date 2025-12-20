/**
 * Theme Registry
 *
 * Central registry of all available UI themes.
 * Provides lookup and utility functions for theme management.
 */

import { nebulaTheme } from "./nebula";
import { solarpunkTheme } from "./solarpunk";
import type { ThemeCssVariables, UiTheme, UiThemeId } from "./types";

// ============================================================================
// THEME REGISTRY
// ============================================================================

export const THEMES: Record<UiThemeId, UiTheme> = {
  nebula: nebulaTheme,
  solarpunk: solarpunkTheme,
};

export const DEFAULT_THEME_ID: UiThemeId = "nebula";

export function getTheme(id: UiThemeId): UiTheme {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID];
}

export function getThemeIds(): UiThemeId[] {
  return Object.keys(THEMES) as UiThemeId[];
}

// ============================================================================
// CSS VARIABLE GENERATION
// ============================================================================

/**
 * Converts a theme object to CSS custom properties
 */
export function themeToCssVariables(theme: UiTheme): ThemeCssVariables {
  return {
    // Colors
    "--theme-bg-body": theme.color.bg.body,
    "--theme-bg-panel": theme.color.bg.panel,
    "--theme-bg-elevated": theme.color.bg.elevated,
    "--theme-bg-horizon": theme.color.bg.horizon,
    "--theme-text-primary": theme.color.text.primary,
    "--theme-text-muted": theme.color.text.muted,
    "--theme-text-soft": theme.color.text.soft,
    "--theme-accent-primary": theme.color.accent.primary,
    "--theme-accent-secondary": theme.color.accent.secondary,
    "--theme-accent-positive": theme.color.accent.positive,
    "--theme-accent-warning": theme.color.accent.warning,
    "--theme-accent-destructive": theme.color.accent.destructive,
    "--theme-border": theme.color.border,
    "--theme-ring": theme.color.ring,

    // Glass
    "--theme-glass-panel-bg": theme.glass.panelBg,
    "--theme-glass-panel-border": theme.glass.panelBorder,
    "--theme-glass-panel-blur": theme.glass.panelBlur,
    "--theme-glass-header-gradient": theme.glass.headerGradient,
    "--theme-glass-card-bg": theme.glass.cardBg,
    "--theme-glass-card-border": theme.glass.cardBorder,
    "--theme-glass-hover-bg": theme.glass.hoverBg,
    "--theme-glass-active-border": theme.glass.activeBorder,
    "--theme-glass-active-shadow": theme.glass.activeShadow,

    // Elevation
    "--theme-shadow-soft": theme.elevation.softDrop,
    "--theme-shadow-hud-panel": theme.elevation.hudPanel,
    "--theme-shadow-hud-rail": theme.elevation.hudRail,
    "--theme-shadow-modal": theme.elevation.modal,
    "--theme-shadow-glow": theme.elevation.glow,

    // Ambient
    "--theme-ambient-horizon": theme.ambient.horizonGradient,
    "--theme-ambient-ripple-primary": theme.ambient.rippleColorPrimary,
    "--theme-ambient-ripple-secondary": theme.ambient.rippleColorSecondary,
    "--theme-ambient-glow-intensity": String(theme.ambient.glowIntensity),

    // Controls
    "--theme-switch-track-on": theme.controls.switch.track.bg.on,
    "--theme-switch-track-off": theme.controls.switch.track.bg.off,
    "--theme-switch-thumb-on": theme.controls.switch.thumb.bg.on,
    "--theme-switch-thumb-off": theme.controls.switch.thumb.bg.off,
    "--theme-button-glow-hover-bg": theme.controls.buttonGlow.hoverBg,
    "--theme-button-glow-hover-text": theme.controls.buttonGlow.hoverText,
    "--theme-button-glow-hover-shadow": theme.controls.buttonGlow.hoverShadow,
  };
}

/**
 * Applies theme CSS variables to a target element
 */
export function applyThemeCssVariables(
  theme: UiTheme,
  target: HTMLElement = document.documentElement
): void {
  const variables = themeToCssVariables(theme);

  for (const [key, value] of Object.entries(variables)) {
    target.style.setProperty(key, value);
  }

  // Set data attribute for CSS selectors
  target.dataset.uiTheme = theme.id;
}

/**
 * Removes theme CSS variables from a target element
 */
export function removeThemeCssVariables(
  target: HTMLElement = document.documentElement
): void {
  const variables = themeToCssVariables(THEMES.nebula);

  for (const key of Object.keys(variables)) {
    target.style.removeProperty(key);
  }

  delete target.dataset.uiTheme;
}

