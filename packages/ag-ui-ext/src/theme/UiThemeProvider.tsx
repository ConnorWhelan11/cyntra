"use client";

import * as React from "react";
import { applyThemeCssVariables, DEFAULT_THEME_ID, getTheme } from "./registry";
import type { UiTheme, UiThemeContextValue, UiThemeId } from "./types";

// ============================================================================
// CONTEXT
// ============================================================================

const UiThemeContext = React.createContext<UiThemeContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export interface UiThemeProviderProps {
  children: React.ReactNode;
  /** Initial theme ID */
  defaultThemeId?: UiThemeId;
  /** Controlled theme ID */
  themeId?: UiThemeId;
  /** Callback when theme changes */
  onThemeChange?: (themeId: UiThemeId) => void;
  /** Storage key for persisting theme preference */
  storageKey?: string;
  /** Disable CSS variable injection (for SSR or custom handling) */
  disableCssVariables?: boolean;
}

const STORAGE_KEY = "oos-ui-theme";

export function UiThemeProvider({
  children,
  defaultThemeId = DEFAULT_THEME_ID,
  themeId: controlledThemeId,
  onThemeChange,
  storageKey = STORAGE_KEY,
  disableCssVariables = false,
}: UiThemeProviderProps) {
  const [isHydrating, setIsHydrating] = React.useState(true);
  const [internalThemeId, setInternalThemeId] = React.useState<UiThemeId>(defaultThemeId);

  // Determine active theme ID (controlled vs uncontrolled)
  const activeThemeId = controlledThemeId ?? internalThemeId;
  const theme = getTheme(activeThemeId);

  // Load persisted theme on mount
  React.useEffect(() => {
    if (controlledThemeId !== undefined) {
      setIsHydrating(false);
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && (stored === "nebula" || stored === "solarpunk")) {
        setInternalThemeId(stored as UiThemeId);
      }
    } catch {
      // localStorage not available
    }

    setIsHydrating(false);
  }, [controlledThemeId, storageKey]);

  // Apply CSS variables when theme changes
  React.useEffect(() => {
    if (disableCssVariables || isHydrating) return;

    applyThemeCssVariables(theme);

    return () => {
      // Cleanup is handled by the next theme application
    };
  }, [theme, disableCssVariables, isHydrating]);

  // Theme setter
  const setThemeId = React.useCallback(
    (id: UiThemeId) => {
      if (controlledThemeId === undefined) {
        setInternalThemeId(id);
        try {
          localStorage.setItem(storageKey, id);
        } catch {
          // localStorage not available
        }
      }
      onThemeChange?.(id);
    },
    [controlledThemeId, onThemeChange, storageKey]
  );

  const contextValue = React.useMemo<UiThemeContextValue>(
    () => ({
      theme,
      themeId: activeThemeId,
      setThemeId,
      isHydrating,
    }),
    [theme, activeThemeId, setThemeId, isHydrating]
  );

  return <UiThemeContext.Provider value={contextValue}>{children}</UiThemeContext.Provider>;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Access the current UI theme context
 */
export function useUiTheme(): UiThemeContextValue {
  const context = React.useContext(UiThemeContext);

  if (!context) {
    throw new Error("useUiTheme must be used within a UiThemeProvider");
  }

  return context;
}

/**
 * Access just the current theme object (shorthand)
 */
export function useThemeTokens(): UiTheme {
  const { theme } = useUiTheme();
  return theme;
}

/**
 * Access specific token groups
 */
export function useGlassTokens() {
  const { theme } = useUiTheme();
  return theme.glass;
}

export function useColorTokens() {
  const { theme } = useUiTheme();
  return theme.color;
}

export function useMotionTokens() {
  const { theme } = useUiTheme();
  return theme.motion;
}

export function useAmbientTokens() {
  const { theme } = useUiTheme();
  return theme.ambient;
}

export function useControlTokens() {
  const { theme } = useUiTheme();
  return theme.controls;
}

export function useElevationTokens() {
  const { theme } = useUiTheme();
  return theme.elevation;
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Returns true if the current theme is Solarpunk
 */
export function useIsSolarpunk(): boolean {
  const { themeId } = useUiTheme();
  return themeId === "solarpunk";
}

/**
 * Returns true if the current theme is Nebula
 */
export function useIsNebula(): boolean {
  const { themeId } = useUiTheme();
  return themeId === "nebula";
}
