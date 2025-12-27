"use client";

import { animateFloat, animateNumber, cn, prefersReducedMotion } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useId, useMemo, useState } from "react";

export interface HUDProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Progress value (0-1) */
  value: number;
  /** Display value (defaults to value * 100) */
  displayValue?: number;
  /** Ring size in pixels */
  size?: number;
  /** Ring thickness */
  strokeWidth?: number;
  /** Color theme */
  theme?: "cyan" | "magenta" | "emerald" | "rainbow";
  /** Show animated number in center */
  showValue?: boolean;
  /** Value suffix (e.g., '%', 'XP') */
  suffix?: string;
  /** Animation duration in ms */
  animationDuration?: number;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Label text below the ring */
  label?: string;
  /** Optional class name */
  className?: string;
}

export function HUDProgressRing({
  value,
  displayValue,
  size = 120,
  strokeWidth = 8,
  theme = "rainbow",
  showValue = true,
  suffix = "%",
  animationDuration = 1500,
  disableAnimations = false,
  label,
  className,
  ...props
}: HUDProgressRingProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const [animatedDisplayValue, setAnimatedDisplayValue] = useState(0);
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;
  const gradientId = useId();
  const clampedValue = useMemo(() => Math.max(0, Math.min(1, value)), [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - animatedValue * circumference;

  const finalDisplayValue = displayValue ?? animatedValue * 100;

  useEffect(() => {
    const target = clampedValue;
    if (shouldAnimate) {
      animateFloat(animatedValue, target, animationDuration, setAnimatedValue);
      animateNumber(
        Math.round(animatedDisplayValue),
        Math.round(displayValue ?? target * 100),
        animationDuration,
        setAnimatedDisplayValue
      );
    } else {
      setAnimatedValue(target);
      setAnimatedDisplayValue(displayValue ?? target * 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedValue, displayValue, shouldAnimate, animationDuration]);

  const getThemeColors = () => {
    switch (theme) {
      case "cyan":
        return {
          stroke: "hsl(var(--cyan-neon))",
          glow: "var(--cyan-neon)",
          shadow: "shadow-neon-cyan",
        };
      case "magenta":
        return {
          stroke: "hsl(var(--magenta-neon))",
          glow: "var(--magenta-neon)",
          shadow: "shadow-neon-magenta",
        };
      case "emerald":
        return {
          stroke: "hsl(var(--emerald-neon))",
          glow: "var(--emerald-neon)",
          shadow: "shadow-neon-emerald",
        };
      case "rainbow":
      default:
        return {
          stroke: "url(#rainbow-gradient)",
          glow: "var(--cyan-neon)",
          shadow: "shadow-glow",
        };
    }
  };

  const themeColors = getThemeColors();

  return (
    <div className={cn("flex flex-col items-center justify-center gap-2", className)} {...props}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className={cn(
            "transform -rotate-90 transition-all duration-300",
            shouldAnimate && "animate-soft-glow",
            themeColors.shadow
          )}
          role="img"
          aria-label={
            label
              ? `${label}: ${Math.round(finalDisplayValue)}${suffix}`
              : `${Math.round(finalDisplayValue)}${suffix}`
          }
        >
          <defs>
            <linearGradient
              id={`rainbow-gradient-${gradientId}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="hsl(var(--cyan-neon))" />
              <stop offset="50%" stopColor="hsl(var(--magenta-neon))" />
              <stop offset="100%" stopColor="hsl(var(--emerald-neon))" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
            className="opacity-20"
          />

          {/* Progress ring */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={
              theme === "rainbow" ? `url(#rainbow-gradient-${gradientId})` : themeColors.stroke
            }
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            filter="url(#glow)"
            initial={shouldAnimate ? { strokeDashoffset: circumference } : {}}
            animate={{ strokeDashoffset }}
            transition={{
              duration: shouldAnimate ? animationDuration / 1000 : 0,
              ease: "easeOut",
            }}
          />
        </svg>

        {/* Center content */}
        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.span
                key={Math.floor(finalDisplayValue)}
                className="text-2xl font-bold font-display tabular-nums"
                style={{
                  color: theme === "rainbow" ? "hsl(var(--cyan-neon))" : themeColors.stroke,
                }}
                initial={shouldAnimate ? { y: 10, opacity: 0 } : {}}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: shouldAnimate ? 0.2 : 0 }}
              >
                {Math.round(finalDisplayValue)}
                {suffix}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Label */}
      {label && (
        <motion.span
          className="text-sm text-muted-foreground font-medium"
          initial={shouldAnimate ? { opacity: 0, y: 5 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: shouldAnimate ? 0.3 : 0,
            duration: shouldAnimate ? 0.3 : 0,
          }}
          aria-hidden
        >
          {label}
        </motion.span>
      )}
    </div>
  );
}
