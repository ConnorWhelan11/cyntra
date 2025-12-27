"use client";

import { cn } from "@/lib/utils";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { motion } from "framer-motion";
import * as React from "react";
import { useControlTokens } from "../../../theme";

// ============================================================================
// TYPES
// ============================================================================

export interface ThemedSwitchProps extends React.ComponentPropsWithoutRef<
  typeof SwitchPrimitive.Root
> {
  /** Size variant */
  size?: "sm" | "default" | "lg";
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Show the "ON/OFF" indicator */
  showIndicator?: boolean;
}

// ============================================================================
// THEMED SWITCH
// ============================================================================

export const ThemedSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  ThemedSwitchProps
>(function ThemedSwitch(
  {
    className,
    size = "default",
    label,
    description,
    showIndicator = false,
    checked,
    onCheckedChange,
    ...props
  },
  ref
) {
  const controlTokens = useControlTokens();
  const isChecked = checked ?? false;

  // Size mappings
  const sizeClasses = {
    sm: {
      track: "h-5 w-9",
      thumb: "h-4 w-4",
      translate: "translate-x-4",
    },
    default: {
      track: "h-6 w-11",
      thumb: "h-5 w-5",
      translate: "translate-x-5",
    },
    lg: {
      track: "h-7 w-14",
      thumb: "h-6 w-6",
      translate: "translate-x-7",
    },
  };

  const sizes = sizeClasses[size];

  const trackStyles = isChecked
    ? {
        background: controlTokens.switch.track.bg.on,
        borderColor: controlTokens.switch.track.border.on,
      }
    : {
        background: controlTokens.switch.track.bg.off,
        borderColor: controlTokens.switch.track.border.off,
      };

  const thumbStyles = isChecked
    ? {
        background: controlTokens.switch.thumb.bg.on,
        boxShadow: controlTokens.switch.thumb.shadow.on,
      }
    : {
        background: controlTokens.switch.thumb.bg.off,
        boxShadow: controlTokens.switch.thumb.shadow.off,
      };

  const SwitchRoot = (
    <SwitchPrimitive.Root
      ref={ref}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        "peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border",
        "transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        sizes.track,
        className
      )}
      style={{
        ...trackStyles,
        borderWidth: 1,
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          className={cn("pointer-events-none block rounded-full", sizes.thumb)}
          style={thumbStyles}
          initial={false}
          animate={{
            x: isChecked ? (size === "sm" ? 16 : size === "lg" ? 28 : 20) : 2,
            scale: isChecked ? 1 : 0.95,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
          }}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );

  // If no label, just return the switch
  if (!label) {
    return (
      <div className="inline-flex items-center gap-2">
        {SwitchRoot}
        {showIndicator && (
          <motion.span
            className="text-xs font-mono font-semibold"
            style={{
              color: isChecked
                ? controlTokens.switch.thumb.bg.on
                : "var(--theme-text-soft, #64748B)",
            }}
            initial={false}
            animate={{
              textShadow: isChecked
                ? controlTokens.switch.thumb.shadow.on.replace("0 0", "0 0 8px")
                : "none",
            }}
          >
            {isChecked ? "ON" : "OFF"}
          </motion.span>
        )}
      </div>
    );
  }

  // With label and optional description
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-[var(--theme-text-primary,#E5E7EB)]">
          {label}
        </span>
        {description && (
          <p className="text-xs text-[var(--theme-text-muted,#94A3B8)] mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {SwitchRoot}
        {showIndicator && (
          <motion.span
            className="text-xs font-mono font-semibold min-w-[2rem]"
            style={{
              color: isChecked
                ? controlTokens.switch.thumb.bg.on
                : "var(--theme-text-soft, #64748B)",
            }}
          >
            {isChecked ? "ON" : "OFF"}
          </motion.span>
        )}
      </div>
    </label>
  );
});
