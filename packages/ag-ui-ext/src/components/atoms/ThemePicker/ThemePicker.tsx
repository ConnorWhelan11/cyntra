"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Check, Moon, Sun } from "lucide-react";
import { getTheme, getThemeIds, useMotionTokens, useUiTheme, type UiThemeId } from "../../../theme";

// ============================================================================
// THEME PREVIEW CARD
// ============================================================================

interface ThemePreviewProps {
  themeId: UiThemeId;
  isSelected: boolean;
  onClick: () => void;
}

function ThemePreview({ themeId, isSelected, onClick }: ThemePreviewProps) {
  const theme = getTheme(themeId);
  const motionTokens = useMotionTokens();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-2 p-3 rounded-xl",
        "border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        isSelected
          ? "border-[var(--theme-accent-primary)] bg-[var(--theme-glass-hover-bg)]"
          : "border-[var(--theme-glass-card-border)] bg-[var(--theme-glass-card-bg)] hover:border-[var(--theme-glass-active-border)]"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={motionTokens.fast}
    >
      {/* Theme preview swatch */}
      <div
        className="w-full h-16 rounded-lg overflow-hidden relative"
        style={{ background: theme.color.bg.body }}
      >
        {/* Mini ambient preview */}
        <div className="absolute inset-0" style={{ background: theme.ambient.horizonGradient }} />

        {/* Accent dots */}
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: theme.color.accent.primary }}
          />
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: theme.color.accent.secondary }}
          />
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: theme.color.accent.positive }}
          />
        </div>

        {/* Glass panel preview */}
        <div
          className="absolute top-2 right-2 h-8 w-12 rounded-md"
          style={{
            background: theme.glass.panelBg,
            border: `1px solid ${theme.glass.panelBorder}`,
          }}
        />
      </div>

      {/* Theme info */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {themeId === "nebula" ? (
            <Moon className="h-3.5 w-3.5 text-[var(--theme-text-muted)]" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-[var(--theme-text-muted)]" />
          )}
          <span className="text-xs font-medium text-[var(--theme-text-primary)] truncate">
            {theme.name}
          </span>
        </div>

        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex h-4 w-4 items-center justify-center rounded-full"
            style={{ background: theme.color.accent.primary }}
          >
            <Check className="h-2.5 w-2.5 text-black" />
          </motion.div>
        )}
      </div>
    </motion.button>
  );
}

// ============================================================================
// THEME PICKER
// ============================================================================

export interface ThemePickerProps {
  /** Layout direction */
  direction?: "horizontal" | "vertical";
  /** Compact mode (smaller cards) */
  compact?: boolean;
  /** Callback after theme change */
  onThemeChange?: (themeId: UiThemeId) => void;
  /** Additional className */
  className?: string;
}

export function ThemePicker({
  direction = "horizontal",
  compact = false,
  onThemeChange,
  className,
}: ThemePickerProps) {
  const { themeId, setThemeId } = useUiTheme();
  const themeIds = getThemeIds();

  const handleSelect = (id: UiThemeId) => {
    setThemeId(id);
    onThemeChange?.(id);
  };

  return (
    <div
      className={cn(
        "grid gap-3",
        direction === "horizontal" ? "grid-cols-2" : "grid-cols-1",
        compact && "gap-2",
        className
      )}
    >
      {themeIds.map((id) => (
        <ThemePreview
          key={id}
          themeId={id}
          isSelected={id === themeId}
          onClick={() => handleSelect(id)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// THEME TOGGLE (Simple icon toggle)
// ============================================================================

export interface ThemeToggleProps {
  /** Size of the toggle */
  size?: "sm" | "default" | "lg";
  /** Additional className */
  className?: string;
}

export function ThemeToggle({ size = "default", className }: ThemeToggleProps) {
  const { themeId, setThemeId, theme } = useUiTheme();
  const motionTokens = useMotionTokens();

  const sizes = {
    sm: "h-8 w-8",
    default: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const nextTheme = themeId === "nebula" ? "solarpunk" : "nebula";

  return (
    <motion.button
      type="button"
      onClick={() => setThemeId(nextTheme)}
      title={`Switch to ${getTheme(nextTheme).name}`}
      className={cn(
        "relative inline-flex items-center justify-center rounded-xl",
        "border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        sizes[size],
        className
      )}
      style={{
        borderColor: theme.glass.panelBorder,
        background: theme.glass.cardBg,
      }}
      whileHover={{
        borderColor: theme.glass.activeBorder,
        background: theme.glass.hoverBg,
      }}
      whileTap={{ scale: 0.95 }}
      transition={motionTokens.fast}
    >
      <motion.div
        key={themeId}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        exit={{ rotate: 90, opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ color: theme.color.accent.primary }}
      >
        {themeId === "nebula" ? (
          <Moon className={iconSizes[size]} />
        ) : (
          <Sun className={iconSizes[size]} />
        )}
      </motion.div>
    </motion.button>
  );
}
