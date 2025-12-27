"use client";

import { cn, formatNumber, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Minus, MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import React from "react";

const kpiStatVariants = cva(
  "relative min-h-[120px] flex flex-col justify-between p-4 rounded-xl border backdrop-blur-sm transition-all duration-200",
  {
    variants: {
      variant: {
        default: "bg-card/30 border-border/30",
        success: "bg-emerald-400/5 border-emerald-400/20",
        warning: "bg-yellow-500/5 border-yellow-500/20",
        danger: "bg-destructive/5 border-destructive/20",
        accent: "bg-cyan-400/5 border-cyan-400/20",
      },
      size: {
        default: "p-4",
        compact: "p-3 min-h-[100px]",
        expanded: "p-6 min-h-[140px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface KPIStatProps
  extends
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      | "children"
      | "onDrag"
      | "onDragEnd"
      | "onDragEnter"
      | "onDragExit"
      | "onDragLeave"
      | "onDragOver"
      | "onDragStart"
      | "onDrop"
      | "onAnimationStart"
      | "onAnimationEnd"
      | "onAnimationIteration"
    >,
    VariantProps<typeof kpiStatVariants> {
  /** KPI title/label */
  title: string;
  /** Current value */
  value: number | string;
  /** Previous value for delta calculation */
  previousValue?: number;
  /** Value suffix (%, XP, etc.) */
  suffix?: string;
  /** Value prefix */
  prefix?: string;
  /** Custom delta value (overrides calculation) */
  delta?: number;
  /** Delta display type */
  deltaType?: "percentage" | "absolute" | "none";
  /** Sparkline data points */
  sparklineData?: number[];
  /** Show trend indicator */
  showTrend?: boolean;
  /** Additional description */
  description?: string;
  /** Loading state */
  loading?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export function KPIStat({
  className,
  variant,
  size,
  title,
  value,
  previousValue,
  suffix,
  prefix,
  delta,
  deltaType = "percentage",
  sparklineData,
  showTrend = true,
  description,
  loading = false,
  disableAnimations = false,
  onClick,
  ...props
}: KPIStatProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Calculate delta if not provided
  const calculatedDelta =
    delta !== undefined
      ? delta
      : typeof value === "number" && previousValue !== undefined
        ? deltaType === "percentage"
          ? ((value - previousValue) / previousValue) * 100
          : value - previousValue
        : 0;

  const deltaValue = Math.abs(calculatedDelta);
  const deltaDirection = calculatedDelta > 0 ? "up" : calculatedDelta < 0 ? "down" : "neutral";

  const DeltaIcon =
    deltaDirection === "up" ? TrendingUp : deltaDirection === "down" ? TrendingDown : Minus;

  const deltaColor =
    deltaDirection === "up"
      ? "text-emerald-neon"
      : deltaDirection === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  // Format the main value
  const formattedValue = typeof value === "number" ? formatNumber(value) : value;

  // Generate simple sparkline path if data provided
  const generateSparklinePath = (data: number[]) => {
    if (data.length < 2) return "";

    const width = 60;
    const height = 20;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    });

    return `M ${points.join(" L ")}`;
  };

  return (
    <motion.div
      className={cn(
        kpiStatVariants({ variant, size }),
        onClick && "cursor-pointer hover:shadow-lg",
        className
      )}
      onClick={onClick}
      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={
        shouldAnimate && onClick
          ? {
              scale: 1.02,
              transition: { duration: 0.2 },
            }
          : {}
      }
      {...props}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <motion.h3
          className="text-sm font-medium text-muted-foreground leading-tight"
          initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {title}
        </motion.h3>

        {loading && (
          <motion.div
            initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground animate-pulse" />
          </motion.div>
        )}
      </div>

      {/* Main value and delta */}
      <div className="flex items-end justify-between flex-1">
        <motion.div
          className="space-y-1"
          initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {loading ? (
            <div className="h-8 w-24 bg-muted/20 rounded animate-pulse" />
          ) : (
            <div className="text-3xl font-bold text-foreground tabular-nums leading-none">
              {prefix}
              {formattedValue}
              {suffix}
            </div>
          )}

          {description && (
            <p className="text-sm text-muted-foreground leading-tight">{description}</p>
          )}
        </motion.div>

        {/* Delta indicator */}
        {showTrend &&
          deltaType !== "none" &&
          !loading &&
          (calculatedDelta !== 0 || delta !== undefined) && (
            <motion.div
              className={cn("flex items-center gap-1 text-xs", deltaColor)}
              initial={shouldAnimate ? { opacity: 0, x: 10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <DeltaIcon className="h-3 w-3" />
              <span className="font-medium tabular-nums">
                {deltaType === "percentage"
                  ? `${deltaValue.toFixed(1)}%`
                  : formatNumber(deltaValue)}
              </span>
            </motion.div>
          )}
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 1 && !loading && (
        <motion.div
          className="flex justify-end"
          initial={shouldAnimate ? { opacity: 0, scaleX: 0 } : {}}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <svg width="60" height="20" className="text-cyan-neon/60">
            <path
              d={generateSparklinePath(sparklineData)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Highlight last point */}
            {sparklineData.length > 0 && (
              <circle
                cx="60"
                cy={
                  20 -
                  ((sparklineData[sparklineData.length - 1] - Math.min(...sparklineData)) /
                    (Math.max(...sparklineData) - Math.min(...sparklineData) || 1)) *
                    20
                }
                r="1.5"
                fill="currentColor"
              />
            )}
          </svg>
        </motion.div>
      )}

      {/* Loading shimmer effect */}
      {loading && shouldAnimate && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent rounded-lg"
          animate={{
            x: [-100, 100],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </motion.div>
  );
}
