"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { GlowButton } from "../GlowButton";

const calmModeToggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-border bg-card hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline:
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        lg: "h-10 px-4",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface CalmModeToggleProps
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
    VariantProps<typeof calmModeToggleVariants> {
  /** Whether calm mode is currently active */
  isCalm?: boolean;
  /** Callback when calm mode state changes */
  onCalmModeChange?: (isCalm: boolean) => void;
  /** Show tooltip text */
  showTooltip?: boolean;
  /** Custom calm mode icon */
  calmIcon?: React.ReactNode;
  /** Custom normal mode icon */
  normalIcon?: React.ReactNode;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Auto-persist to localStorage */
  autoPersist?: boolean;
  /** Custom labels */
  labels?: {
    calm?: string;
    normal?: string;
  };
}

export function CalmModeToggle({
  className,
  variant = "ghost",
  size = "sm",
  isCalm: controlledIsCalm,
  onCalmModeChange,
  showTooltip = true,
  calmIcon,
  normalIcon,
  disableAnimations = false,
  autoPersist = true,
  labels = {
    calm: "Calm Mode",
    normal: "Normal Mode",
  },
  ...props
}: CalmModeToggleProps) {
  const [internalIsCalm, setInternalIsCalm] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Load from localStorage on mount
  React.useEffect(() => {
    if (autoPersist && typeof window !== "undefined") {
      const stored = localStorage.getItem("calm-mode");
      const initialCalm = stored ? JSON.parse(stored) : false;
      setInternalIsCalm(initialCalm);
      if (onCalmModeChange) {
        onCalmModeChange(initialCalm);
      }
    }
    setMounted(true);
  }, [autoPersist, onCalmModeChange]);

  // Handle calm mode toggle
  const handleToggle = () => {
    const newIsCalm =
      controlledIsCalm !== undefined ? !controlledIsCalm : !internalIsCalm;

    if (controlledIsCalm === undefined) {
      setInternalIsCalm(newIsCalm);
    }

    if (autoPersist && typeof window !== "undefined") {
      localStorage.setItem("calm-mode", JSON.stringify(newIsCalm));
    }

    onCalmModeChange?.(newIsCalm);

    // Update document class for global styling
    if (typeof window !== "undefined") {
      if (newIsCalm) {
        document.documentElement.classList.add("calm-mode");
      } else {
        document.documentElement.classList.remove("calm-mode");
      }
    }
  };

  // Determine current state
  const isCalm =
    controlledIsCalm !== undefined ? controlledIsCalm : internalIsCalm;
  const currentLabel = isCalm ? labels.calm : labels.normal;

  // Icons
  const defaultCalmIcon = <Eye className="h-4 w-4" />;
  const defaultNormalIcon = <EyeOff className="h-4 w-4" />;

  const currentIcon = isCalm
    ? calmIcon || defaultCalmIcon
    : normalIcon || defaultNormalIcon;

  // Don't render until mounted to prevent hydration issues
  if (!mounted && autoPersist) {
    return null;
  }

  return (
    <GlowButton
      variant={variant === "default" ? "ghost" : variant}
      size={size}
      glow="none"
      className={cn(
        calmModeToggleVariants({ variant, size }),
        "group relative",
        className
      )}
      onClick={handleToggle}
      title={showTooltip ? currentLabel : undefined}
      {...props}
    >
      <motion.div
        className="flex items-center gap-2"
        initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: shouldAnimate ? 0.2 : 0 }}
      >
        <motion.div
          key={isCalm ? "calm" : "normal"}
          initial={shouldAnimate ? { rotate: -90, opacity: 0 } : {}}
          animate={{ rotate: 0, opacity: 1 }}
          exit={shouldAnimate ? { rotate: 90, opacity: 0 } : {}}
          transition={{ duration: shouldAnimate ? 0.2 : 0 }}
        >
          {currentIcon}
        </motion.div>

        {size !== "icon" && (
          <motion.span
            className="text-xs"
            initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: shouldAnimate ? 0.2 : 0, delay: 0.05 }}
          >
            {currentLabel}
          </motion.span>
        )}
      </motion.div>

      {/* Active indicator */}
      <motion.div
        className={cn(
          "absolute inset-0 rounded-md border-2 pointer-events-none",
          isCalm
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-cyan-neon/30 bg-cyan-neon/5"
        )}
        initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : {}}
        animate={{ opacity: isCalm ? 1 : 0, scale: isCalm ? 1 : 0.9 }}
        transition={{ duration: shouldAnimate ? 0.2 : 0 }}
      />
    </GlowButton>
  );
}

// Hook for consuming calm mode state
export function useCalmMode(autoPersist = true) {
  const [isCalm, setIsCalm] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (autoPersist && typeof window !== "undefined") {
      const stored = localStorage.getItem("calm-mode");
      const initialCalm = stored ? JSON.parse(stored) : false;
      setIsCalm(initialCalm);
      setMounted(true);
    } else {
      setMounted(true);
    }
  }, [autoPersist]);

  const toggleCalmMode = React.useCallback(() => {
    setIsCalm((prev) => {
      const newCalm = !prev;

      if (autoPersist && typeof window !== "undefined") {
        localStorage.setItem("calm-mode", JSON.stringify(newCalm));

        // Update document class
        if (newCalm) {
          document.documentElement.classList.add("calm-mode");
        } else {
          document.documentElement.classList.remove("calm-mode");
        }
      }

      return newCalm;
    });
  }, [autoPersist]);

  return { isCalm, setIsCalm, toggleCalmMode, mounted };
}
