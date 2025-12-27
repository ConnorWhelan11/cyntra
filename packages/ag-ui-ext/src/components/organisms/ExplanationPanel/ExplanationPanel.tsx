"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Lightbulb,
  Target,
  X,
} from "lucide-react";
import * as React from "react";
import { GlowButton } from "../../atoms/GlowButton";

const explanationPanelVariants = cva(
  "relative w-full rounded-lg border bg-card/40 backdrop-blur-sm transition-all duration-300 overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-border/40",
        success: "border-emerald-neon/40 bg-emerald-neon/5",
        warning: "border-yellow-500/40 bg-yellow-500/5",
        destructive: "border-destructive/40 bg-destructive/5",
      },
      size: {
        default: "max-w-4xl",
        compact: "max-w-2xl",
        expanded: "max-w-6xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ExplanationItem {
  id: string;
  type: "text" | "bullet" | "diagram" | "formula" | "tip" | "warning";
  content: string;
  title?: string;
  imageUrl?: string;
  imageAlt?: string;
  highlight?: boolean;
}

export interface ExplanationPanelProps
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
    VariantProps<typeof explanationPanelVariants> {
  /** Panel title */
  title?: string;
  /** Explanation items */
  items: ExplanationItem[];
  /** Whether panel is expanded */
  expanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Show close button */
  showClose?: boolean;
  /** Close callback */
  onClose?: () => void;
  /** Loading state */
  loading?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Custom header content */
  headerContent?: React.ReactNode;
  /** Custom footer content */
  footerContent?: React.ReactNode;
}

export function ExplanationPanel({
  className,
  variant,
  size,
  title = "Explanation",
  items,
  expanded = true,
  onExpandedChange,
  showClose = false,
  onClose,
  loading = false,
  disableAnimations = false,
  headerContent,
  footerContent,
  ...props
}: ExplanationPanelProps) {
  const [internalExpanded, setInternalExpanded] = React.useState(expanded);

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const isExpanded = onExpandedChange !== undefined ? expanded : internalExpanded;

  const handleToggle = () => {
    if (onExpandedChange) {
      onExpandedChange(!expanded);
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const getItemIcon = (type: ExplanationItem["type"]) => {
    switch (type) {
      case "diagram":
        return <ImageIcon className="h-4 w-4" />;
      case "tip":
        return <Lightbulb className="h-4 w-4" />;
      case "warning":
        return <Target className="h-4 w-4" />;
      default:
        return <BookOpen className="h-4 w-4" />;
    }
  };

  const getItemStyles = (type: ExplanationItem["type"], highlight?: boolean) => {
    const baseStyles = "p-4 rounded-lg border transition-colors";

    if (highlight) {
      return cn(baseStyles, "border-cyan-neon/40 bg-cyan-neon/5");
    }

    switch (type) {
      case "diagram":
        return cn(baseStyles, "border-border/40 bg-card/60");
      case "tip":
        return cn(baseStyles, "border-emerald-neon/40 bg-emerald-neon/5");
      case "warning":
        return cn(baseStyles, "border-yellow-500/40 bg-yellow-500/5");
      case "formula":
        return cn(baseStyles, "border-magenta-neon/40 bg-magenta-neon/5 font-mono text-sm");
      default:
        return cn(baseStyles, "border-border/40 bg-card/40");
    }
  };

  return (
    <motion.div
      className={cn(explanationPanelVariants({ variant, size }), className)}
      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldAnimate ? 0.3 : 0 }}
      {...props}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-neon/10 border border-cyan-neon/20">
            <BookOpen className="h-5 w-5 text-cyan-neon" />
          </div>
          <div>
            <motion.h3
              className="font-semibold text-foreground text-lg"
              initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.1 }}
            >
              {title}
            </motion.h3>
            <motion.p
              className="text-sm text-muted-foreground"
              initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: shouldAnimate ? 0.3 : 0, delay: 0.2 }}
            >
              {items.length} explanation{items.length !== 1 ? "s" : ""}
            </motion.p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {headerContent}

          <GlowButton
            variant="ghost"
            size="sm"
            glow="none"
            onClick={handleToggle}
            className="flex items-center gap-2"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="text-sm">{isExpanded ? "Collapse" : "Expand"}</span>
          </GlowButton>

          {showClose && (
            <GlowButton variant="ghost" size="sm" glow="none" onClick={onClose}>
              <X className="h-4 w-4" />
            </GlowButton>
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="p-6"
            initial={shouldAnimate ? { opacity: 0, height: 0 } : {}}
            animate={{ opacity: 1, height: "auto" }}
            exit={shouldAnimate ? { opacity: 0, height: 0 } : {}}
            transition={{ duration: shouldAnimate ? 0.3 : 0 }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Loading explanation...</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    className={getItemStyles(item.type, item.highlight)}
                    initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldAnimate ? 0.3 : 0,
                      delay: shouldAnimate ? index * 0.1 : 0,
                    }}
                  >
                    {/* Item Header */}
                    {item.title && (
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/20">
                        {getItemIcon(item.type)}
                        <h4 className="font-medium text-foreground">{item.title}</h4>
                      </div>
                    )}

                    {/* Item Content */}
                    <div className="space-y-3">
                      {/* Text Content */}
                      {item.type === "text" && (
                        <p className="text-sm leading-relaxed text-foreground">{item.content}</p>
                      )}

                      {/* Bullet Points */}
                      {item.type === "bullet" && (
                        <div className="space-y-2">
                          {item.content.split("\n").map((bullet, bulletIndex) => (
                            <div key={bulletIndex} className="flex items-start gap-2 text-sm">
                              <div className="w-1.5 h-1.5 bg-cyan-neon rounded-full mt-2 flex-shrink-0" />
                              <span className="text-foreground">{bullet.trim()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Diagram/Image */}
                      {item.type === "diagram" && item.imageUrl && (
                        <div className="space-y-3">
                          <img
                            src={item.imageUrl}
                            alt={item.imageAlt || item.title || "Diagram"}
                            className="w-full max-w-md mx-auto rounded-lg border border-border/40 bg-card"
                          />
                          {item.content && (
                            <p className="text-sm text-center text-muted-foreground">
                              {item.content}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Formula */}
                      {item.type === "formula" && (
                        <div className="font-mono text-center text-lg bg-card/60 p-4 rounded border border-border/20">
                          {item.content}
                        </div>
                      )}

                      {/* Tip */}
                      {item.type === "tip" && (
                        <div className="flex items-start gap-3">
                          <Lightbulb className="h-5 w-5 text-emerald-neon mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-foreground leading-relaxed">{item.content}</p>
                        </div>
                      )}

                      {/* Warning */}
                      {item.type === "warning" && (
                        <div className="flex items-start gap-3">
                          <Target className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-foreground leading-relaxed">{item.content}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      {footerContent && <div className="px-6 py-4 border-t border-border/40">{footerContent}</div>}
    </motion.div>
  );
}
