"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Info,
  Target,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { toast, Toaster } from "sonner";

// Preset toast types with icons and styling
const toastPresets = {
  correct: {
    icon: CheckCircle2,
    className: "border-emerald-neon/40 bg-emerald-neon/10 text-emerald-neon shadow-neon-emerald/30",
    iconClassName: "text-emerald-neon",
  },
  incorrect: {
    icon: XCircle,
    className:
      "border-destructive/40 bg-destructive/10 text-destructive shadow-[0_0_20px_hsl(var(--destructive))]",
    iconClassName: "text-destructive",
  },
  streak: {
    icon: Flame,
    className: "border-cyan-neon/40 bg-cyan-neon/10 text-cyan-neon shadow-neon-cyan/30",
    iconClassName: "text-cyan-neon",
  },
  achievement: {
    icon: Trophy,
    className: "border-magenta-neon/40 bg-magenta-neon/10 text-magenta-neon shadow-neon-magenta/30",
    iconClassName: "text-magenta-neon",
  },
  goalMet: {
    icon: Target,
    className: "border-emerald-neon/40 bg-emerald-neon/10 text-emerald-neon shadow-neon-emerald/30",
    iconClassName: "text-emerald-neon",
  },
  xpGain: {
    icon: Zap,
    className: "border-cyan-neon/40 bg-cyan-neon/10 text-cyan-neon shadow-neon-cyan/30",
    iconClassName: "text-cyan-neon",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
    iconClassName: "text-yellow-500",
  },
  info: {
    icon: Info,
    className: "border-border/40 bg-card/80 text-foreground shadow-glass",
    iconClassName: "text-muted-foreground",
  },
} as const;

export type ToastType = keyof typeof toastPresets;

export interface NeonToastProps {
  /** Toast type (determines icon and styling) */
  type: ToastType;
  /** Toast message */
  message: string;
  /** Optional description */
  description?: string;
  /** Duration in milliseconds (0 = permanent) */
  duration?: number;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Action button */
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Custom toast component
function CustomToast({
  type,
  message,
  description,
  disableAnimations = false,
  action,
  onClose,
}: NeonToastProps & { onClose?: () => void }) {
  const preset = toastPresets[type];
  const Icon = preset.icon;
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  return (
    <motion.div
      className={cn(
        "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 shadow-lg backdrop-blur-sm",
        preset.className
      )}
      initial={shouldAnimate ? { opacity: 0, scale: 0.9, x: 100 } : {}}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={shouldAnimate ? { opacity: 0, scale: 0.9, x: 100 } : {}}
      transition={{
        duration: shouldAnimate ? 0.3 : 0,
        type: "spring",
        bounce: 0.2,
      }}
    >
      {/* Background glow effect */}
      {shouldAnimate && (type === "correct" || type === "streak" || type === "achievement") && (
        <motion.div
          className="absolute inset-0 opacity-20"
          animate={{
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      <div className="flex items-start gap-3 flex-1">
        {/* Icon */}
        <motion.div
          className={cn("flex-shrink-0", preset.iconClassName)}
          initial={shouldAnimate ? { opacity: 0, rotate: -180, scale: 0 } : {}}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{
            duration: shouldAnimate ? 0.4 : 0,
            delay: 0.1,
            type: "spring",
            bounce: 0.6,
          }}
        >
          <Icon className="h-5 w-5" />
        </motion.div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          <motion.p
            className="text-sm font-medium leading-none"
            initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.2 }}
          >
            {message}
          </motion.p>

          {description && (
            <motion.p
              className="text-xs opacity-80"
              initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
              animate={{ opacity: 0.8, y: 0 }}
              transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.3 }}
            >
              {description}
            </motion.p>
          )}
        </div>

        {/* Action button */}
        {action && (
          <motion.button
            className="text-xs font-medium hover:opacity-80 transition-opacity px-2 py-1 rounded border border-current/20 hover:bg-current/10"
            onClick={action.onClick}
            initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: shouldAnimate ? 0.2 : 0, delay: 0.4 }}
          >
            {action.label}
          </motion.button>
        )}

        {/* Close button */}
        {onClose && (
          <motion.button
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            onClick={onClose}
            initial={shouldAnimate ? { opacity: 0, rotate: 90 } : {}}
            animate={{ opacity: 0.6, rotate: 0 }}
            transition={{ duration: shouldAnimate ? 0.2 : 0, delay: 0.5 }}
          >
            <X className="h-4 w-4" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// Utility function to show neon toasts
export function showNeonToast({
  type,
  message,
  description,
  duration = 4000,
  disableAnimations = false,
  action,
}: NeonToastProps) {
  return toast.custom(
    (t) => (
      <CustomToast
        type={type}
        message={message}
        description={description}
        disableAnimations={disableAnimations}
        action={action}
        onClose={() => toast.dismiss(t)}
      />
    ),
    {
      duration: duration === 0 ? Infinity : duration,
    }
  );
}

// Pre-configured toast functions
export const neonToasts = {
  correct: (message: string, description?: string) =>
    showNeonToast({ type: "correct", message, description }),

  incorrect: (message: string, description?: string) =>
    showNeonToast({ type: "incorrect", message, description }),

  streak: (count: number, description?: string) =>
    showNeonToast({
      type: "streak",
      message: `${count} Day Streak!`,
      description: description || "Keep up the great work!",
    }),

  achievement: (title: string, description?: string) =>
    showNeonToast({ type: "achievement", message: title, description }),

  goalMet: (goal: string, description?: string) =>
    showNeonToast({
      type: "goalMet",
      message: `Goal Achieved: ${goal}`,
      description,
    }),

  xpGain: (amount: number, description?: string) =>
    showNeonToast({
      type: "xpGain",
      message: `+${amount} XP`,
      description: description || "Experience gained!",
    }),

  warning: (message: string, description?: string) =>
    showNeonToast({ type: "warning", message, description }),

  info: (message: string, description?: string) =>
    showNeonToast({ type: "info", message, description }),
};

// Themed Toaster component
export interface NeonToasterProps {
  /** Position of toasts */
  position?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  /** Maximum number of toasts */
  toastOptions?: {
    duration?: number;
    className?: string;
  };
}

export function NeonToaster({ position = "top-right", toastOptions }: NeonToasterProps = {}) {
  return (
    <Toaster
      position={position}
      toastOptions={{
        duration: 4000,
        className: "backdrop-blur-md",
        ...toastOptions,
      }}
      theme="dark"
    />
  );
}

// Export alias for the main component
export const NeonToast = NeonToaster;
