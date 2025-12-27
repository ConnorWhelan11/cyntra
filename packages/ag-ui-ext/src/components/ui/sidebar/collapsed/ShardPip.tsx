"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import type { DockItem } from "../types";

interface ShardPipProps {
  dock: DockItem;
  accent: "cyan" | "moonlit_orchid";
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onClick: () => void;
}

export const ShardPip = ({ dock, accent, isHovered, onHover, onClick }: ShardPipProps) => {
  const hasActivity = dock.hasActivity;

  // Accent-specific colors
  const colors = {
    cyan: {
      idleBorder: "border-cyan-400/35",
      hoverBorder: "border-cyan-400/90",
      activeBorder: "border-cyan-400/70",
      hoverFill: "bg-cyan-500/8",
      activeFill: "bg-cyan-500/5",
      idleIcon: "text-cyan-400/60",
      hoverIcon: "text-cyan-300",
      activeIcon: "text-cyan-400/80",
      glow: "shadow-[0_0_8px_rgba(34,211,238,0.25)]",
      activeGlow: "shadow-[0_0_6px_rgba(34,211,238,0.15)]",
      pulse: "bg-cyan-400/20",
    },
    moonlit_orchid: {
      idleBorder: "border-purple-200/40",
      hoverBorder: "border-purple-300/90",
      activeBorder: "border-purple-300/70",
      hoverFill: "bg-purple-400/10",
      activeFill: "bg-purple-400/5",
      idleIcon: "text-purple-200/80",
      hoverIcon: "text-purple-100",
      activeIcon: "text-purple-200/95",
      glow: "shadow-[0_0_8px_rgba(192,132,252,0.25)]", // soft purple-400
      activeGlow: "shadow-[0_0_6px_rgba(192,132,252,0.15)]",
      pulse: "bg-purple-300/18",
    },
  };

  const c = colors[accent];

  // Determine current state
  const isActive = hasActivity && !isHovered;

  return (
    <div className="relative flex items-center justify-center">
      {/* The pip - embedded coin in the monolith glass */}
      <motion.button
        onClick={onClick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={cn(
          "relative flex items-center justify-center rounded-full border transition-all duration-150",
          // Size: ~14px idle, slightly larger on hover
          isHovered ? "h-[18px] w-[18px]" : "h-[14px] w-[14px]",
          // Border state
          isHovered ? c.hoverBorder : isActive ? c.activeBorder : c.idleBorder,
          // Fill: transparent idle, subtle tint on hover/active
          isHovered ? c.hoverFill : isActive ? c.activeFill : "bg-transparent",
          // Glow: none idle, subtle on hover/active
          isHovered ? c.glow : isActive ? c.activeGlow : ""
        )}
        animate={{
          scale: isHovered ? 1.1 : 1,
        }}
        transition={{ duration: 0.12 }}
      >
        {/* Activity breathing ring - only when hasActivity and not hovered */}
        {hasActivity && !isHovered && (
          <motion.div
            className={cn(
              "absolute inset-[-2px] rounded-full border",
              accent === "cyan" ? "border-cyan-400/20" : "border-fuchsia-400/20"
            )}
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Icon - always visible, scales with state */}
        <span
          className={cn(
            "transition-all duration-150 flex items-center justify-center",
            isHovered
              ? cn(c.hoverIcon, "[&>svg]:h-2.5 [&>svg]:w-2.5")
              : isActive
                ? cn(c.activeIcon, "[&>svg]:h-2 [&>svg]:w-2")
                : cn(c.idleIcon, "[&>svg]:h-2 [&>svg]:w-2")
          )}
        >
          {dock.icon}
        </span>

        {/* Tooltip on hover */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, x: -4, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -4, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className={cn(
                "absolute left-full ml-2 whitespace-nowrap px-2 py-0.5 rounded text-[9px] font-medium",
                "bg-slate-900/95 border border-slate-700/40 text-slate-300",
                "shadow-md backdrop-blur-sm z-50"
              )}
            >
              {dock.label}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
};
