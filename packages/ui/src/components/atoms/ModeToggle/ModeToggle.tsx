"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Heart, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useEffect, useState } from "react";

const modeToggleVariants = cva(
  "relative inline-flex items-center justify-center rounded-md border border-border/40 bg-background/50 backdrop-blur-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "shadow-glass",
        glow: "shadow-neon-cyan/20 hover:shadow-neon-cyan/40",
        minimal: "border-transparent bg-transparent hover:bg-accent/50",
      },
      size: {
        default: "h-10 w-10",
        sm: "h-8 w-8",
        lg: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const themes = [
  { value: "dark", icon: Moon, label: "Dark Mode" },
  { value: "light", icon: Sun, label: "Light Mode" },
  { value: "meditative", icon: Heart, label: "Meditative Mode" },
] as const;

export interface ModeToggleProps
  extends Omit<
      React.ButtonHTMLAttributes<HTMLButtonElement>,
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
    VariantProps<typeof modeToggleVariants> {
  /** Show labels in dropdown */
  showLabels?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Custom theme cycle order */
  themeOrder?: string[];
}

export function ModeToggle({
  className,
  variant,
  size,
  showLabels = false,
  disableAnimations = false,
  themeOrder = ["dark", "light", "meditative"],
  ...props
}: ModeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className={cn(modeToggleVariants({ variant, size }), className)}
        disabled
        {...props}
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const currentTheme = theme || "dark";
  const currentIndex = themeOrder.indexOf(currentTheme);
  const nextIndex = (currentIndex + 1) % themeOrder.length;
  const nextTheme = themeOrder[nextIndex];

  const currentThemeData = themes.find((t) => t.value === currentTheme);
  const nextThemeData = themes.find((t) => t.value === nextTheme);

  const CurrentIcon = currentThemeData?.icon || Moon;
  const NextIcon = nextThemeData?.icon || Sun;

  const handleToggle = () => {
    setTheme(nextTheme);
  };

  return (
    <motion.button
      className={cn(modeToggleVariants({ variant, size }), className)}
      onClick={handleToggle}
      title={`Switch to ${nextThemeData?.label || nextTheme}`}
      whileHover={
        shouldAnimate
          ? {
              scale: 1.05,
              transition: { duration: 0.1 },
            }
          : {}
      }
      whileTap={
        shouldAnimate
          ? {
              scale: 0.95,
              transition: { duration: 0.1 },
            }
          : {}
      }
      {...props}
    >
      {/* Background glow effect */}
      {shouldAnimate && variant === "glow" && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-cyan-neon/10 via-magenta-neon/10 to-emerald-neon/10 rounded-md opacity-0"
          animate={{
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Icon container with transition */}
      <div className="relative overflow-hidden">
        <motion.div
          key={currentTheme}
          className="flex items-center justify-center"
          initial={shouldAnimate ? { y: 20, opacity: 0, rotate: 180 } : {}}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={shouldAnimate ? { y: -20, opacity: 0, rotate: -180 } : {}}
          transition={{
            duration: shouldAnimate ? 0.3 : 0,
            ease: "easeInOut",
          }}
        >
          <CurrentIcon className="h-4 w-4" />
        </motion.div>

        {/* Preview of next icon on hover */}
        {shouldAnimate && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center opacity-0"
            whileHover={{
              opacity: 0.3,
              scale: 0.8,
              transition: { duration: 0.2 },
            }}
          >
            <NextIcon className="h-4 w-4" />
          </motion.div>
        )}
      </div>

      {/* Optional label */}
      {showLabels && (
        <motion.span
          className="ml-2 text-sm font-medium"
          initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          {currentThemeData?.label}
        </motion.span>
      )}
    </motion.button>
  );
}
