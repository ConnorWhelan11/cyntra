"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import React, { useId } from "react";

const glowInputVariants = cva(
  "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
  {
    variants: {
      variant: {
        default: "border-border focus-visible:border-cyan-neon focus-visible:shadow-neon-cyan/40",
        error:
          "border-destructive focus-visible:border-destructive focus-visible:shadow-[0_0_20px_hsl(var(--destructive))]",
        success:
          "border-emerald-neon focus-visible:border-emerald-neon focus-visible:shadow-neon-emerald/40",
      },
      size: {
        default: "h-10 px-3 py-2",
        sm: "h-9 px-3 py-2 text-sm",
        lg: "h-11 px-4 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const containerVariants = cva("space-y-2", {
  variants: {
    size: {
      default: "space-y-2",
      sm: "space-y-1.5",
      lg: "space-y-2.5",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface GlowInputProps
  extends
    Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      | "size"
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
    VariantProps<typeof glowInputVariants> {
  /** Input label */
  label?: string;
  /** Helper description text */
  description?: string;
  /** Error message */
  error?: string;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
  /** Disable glow animations */
  disableAnimations?: boolean;
  /** Container class name */
  containerClassName?: string;
}

export function GlowInput({
  className,
  containerClassName,
  variant,
  size,
  label,
  description,
  error,
  leftIcon,
  rightIcon,
  disableAnimations = false,
  id,
  ...props
}: GlowInputProps) {
  const inputId = useId();
  const finalId = id || inputId;
  const descriptionId = `${finalId}-description`;
  const errorId = `${finalId}-error`;

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Use error variant if error is present
  const finalVariant = error ? "error" : variant;

  return (
    <div className={cn(containerVariants({ size }), containerClassName)}>
      {/* Label */}
      {label && (
        <motion.label
          htmlFor={finalId}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          initial={shouldAnimate ? { opacity: 0, y: -5 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {label}
        </motion.label>
      )}

      {/* Input container */}
      <div className="relative">
        {/* Left icon */}
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {leftIcon}
          </div>
        )}

        {/* Input field */}
        <motion.input
          id={finalId}
          className={cn(
            glowInputVariants({ variant: finalVariant, size }),
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            className
          )}
          aria-describedby={
            description || error
              ? `${description ? descriptionId : ""} ${error ? errorId : ""}`.trim()
              : undefined
          }
          aria-invalid={error ? "true" : undefined}
          initial={shouldAnimate ? { opacity: 0, scale: 0.98 } : {}}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          whileFocus={
            shouldAnimate
              ? {
                  scale: 1.01,
                  transition: { duration: 0.1 },
                }
              : {}
          }
          {...props}
        />

        {/* Right icon or error icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {error ? (
            <motion.div
              initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <AlertCircle className="h-4 w-4 text-destructive" />
            </motion.div>
          ) : (
            rightIcon
          )}
        </div>
      </div>

      {/* Description */}
      {description && !error && (
        <motion.p
          id={descriptionId}
          className="text-sm text-muted-foreground"
          initial={shouldAnimate ? { opacity: 0, y: 5 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.2 }}
        >
          {description}
        </motion.p>
      )}

      {/* Error message */}
      {error && (
        <motion.p
          id={errorId}
          className="text-sm text-destructive flex items-center gap-1"
          initial={shouldAnimate ? { opacity: 0, y: 5 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.2 }}
        >
          <AlertCircle className="h-3 w-3" />
          {error}
        </motion.p>
      )}
    </div>
  );
}
