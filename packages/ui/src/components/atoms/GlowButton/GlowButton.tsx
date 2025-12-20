"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import React from "react";

const glowButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 relative overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-neon-cyan hover:shadow-neon-cyan/80",
        ghost:
          "border border-border/40 bg-transparent hover:bg-accent hover:text-accent-foreground shadow-glass hover:shadow-neon-cyan/40",
        outline:
          "border border-cyan-neon/60 bg-transparent text-cyan-neon hover:bg-cyan-neon/10 hover:border-cyan-neon shadow-neon-cyan/40 hover:shadow-neon-cyan",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_20px_hsl(var(--destructive))]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-neon-magenta/60 hover:shadow-neon-magenta",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
      glow: {
        none: "",
        low: "animate-soft-glow",
        high: "shadow-glow animate-pulse",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      glow: "none",
    },
  }
);

export interface GlowButtonProps
  extends Omit<HTMLMotionProps<"button">, "children">,
    VariantProps<typeof glowButtonVariants> {
  /** Show loading spinner */
  loading?: boolean;
  /** Button content */
  children?: React.ReactNode;
  /** Disable glow animations */
  disableAnimations?: boolean;
}

export function GlowButton({
  className,
  variant,
  size,
  glow,
  loading = false,
  disabled,
  disableAnimations = false,
  children,
  ...props
}: GlowButtonProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const isDisabled = disabled || loading;

  return (
    <motion.button
      className={cn(
        glowButtonVariants({
          variant,
          size,
          glow: shouldAnimate ? glow : "none",
        }),
        className
      )}
      disabled={isDisabled}
      whileHover={
        shouldAnimate && !isDisabled
          ? {
              scale: 1.02,
              transition: { duration: 0.1 },
            }
          : {}
      }
      whileTap={
        shouldAnimate && !isDisabled
          ? {
              scale: 0.98,
              transition: { duration: 0.1 },
            }
          : {}
      }
      {...props}
    >
      {/* Background glow effect */}
      {shouldAnimate && glow !== "none" && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-cyan-neon/20 via-magenta-neon/20 to-emerald-neon/20 opacity-0 rounded-md"
          animate={{
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center gap-2">
        {loading && (
          <motion.div
            initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </motion.div>
        )}
        {children && (
          <motion.span
            initial={shouldAnimate && loading ? { opacity: 0, x: -10 } : {}}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: loading ? 0.1 : 0 }}
          >
            {children}
          </motion.span>
        )}
      </div>
    </motion.button>
  );
}
