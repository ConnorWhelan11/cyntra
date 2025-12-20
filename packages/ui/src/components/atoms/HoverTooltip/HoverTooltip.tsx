import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import { cn } from "../../../lib/utils";

export interface HoverTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export const HoverTooltip = ({
  content,
  children,
  className,
  contentClassName,
  side = "top",
}: HoverTooltipProps) => {
  const [isVisible, setIsVisible] = React.useState(false);

  const positionStyles = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute z-50 min-w-[120px] max-w-[200px] px-3 py-2",
              "bg-black/90 backdrop-blur-md border border-cyan-neon/30",
              "text-xs font-mono text-cyan-neon/90 shadow-[0_0_15px_rgba(0,240,255,0.2)]",
              "rounded pointer-events-none",
              "text-center break-words",
              positionStyles[side],
              contentClassName
            )}
          >
            {content}
            {/* Little arrow */}
            <div
              className={cn(
                "absolute w-2 h-2 bg-black/90 border-cyan-neon/30 rotate-45",
                side === "top" &&
                  "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r",
                side === "bottom" &&
                  "top-[-5px] left-1/2 -translate-x-1/2 border-t border-l",
                side === "left" &&
                  "right-[-5px] top-1/2 -translate-y-1/2 border-t border-r",
                side === "right" &&
                  "left-[-5px] top-1/2 -translate-y-1/2 border-b border-l"
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
