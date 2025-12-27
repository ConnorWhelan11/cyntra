/**
 * Theme System Exports
 *
 * Central export point for the Out-of-Scope UI theme system.
 */

// Types
export type {
  AmbientType,
  MotionConfig,
  ThemeCssVariables,
  UiAmbientTokens,
  UiColorTokens,
  UiControlTokens,
  UiElevationTokens,
  UiGlassTokens,
  UiMotionTokens,
  UiTheme,
  UiThemeContextValue,
  UiThemeId,
} from "./types";

// Theme definitions
export { nebulaTheme } from "./nebula";
export { solarpunkTheme } from "./solarpunk";

// Registry
export {
  applyThemeCssVariables,
  DEFAULT_THEME_ID,
  getTheme,
  getThemeIds,
  removeThemeCssVariables,
  themeToCssVariables,
  THEMES,
} from "./registry";

// Provider & Hooks
export {
  UiThemeProvider,
  useAmbientTokens,
  useColorTokens,
  useControlTokens,
  useElevationTokens,
  useGlassTokens,
  useIsNebula,
  useIsSolarpunk,
  useMotionTokens,
  useThemeTokens,
  useUiTheme,
} from "./UiThemeProvider";
export type { UiThemeProviderProps } from "./UiThemeProvider";
