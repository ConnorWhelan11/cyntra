"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

import { PixelCanvas } from "../../../atoms/PixelCanvas";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import { useSidebar } from "../core/SidebarContext";
import { accentColorMap } from "../styles";
import type { Links, SidebarFeaturedCardProps } from "../types";
import { SidebarLink } from "./SidebarLink";

type AccentColors = (typeof accentColorMap)[keyof typeof accentColorMap];

// Extracted card content to avoid duplication
const CardContent = ({
  link,
  title,
  subtitle,
  pixelColors,
  pixelGap,
  pixelSpeed,
  locked,
  compact,
  colors,
}: {
  link: Links;
  title?: string;
  subtitle?: string;
  pixelColors: string[];
  pixelGap: number;
  pixelSpeed: number;
  locked: boolean;
  accentColor: string;
  compact: boolean;
  colors: AccentColors;
}) => (
  <>
    {/* Pixel Canvas Background */}
    <PixelCanvas
      colors={pixelColors}
      gap={pixelGap}
      speed={pixelSpeed}
      variant="default"
    />

    {/* Gradient overlay for readability */}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/50 to-transparent" />

    {/* Content */}
    <div
      className={cn(
        "relative z-10 flex flex-col",
        compact ? "gap-2" : "gap-2.5"
      )}
    >
      {/* Header with icon */}
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex items-center justify-center rounded-md transition-all duration-300",
            compact ? "h-7 w-7" : "h-8 w-8",
            colors.iconBg,
            colors.iconText,
            colors.iconShadow,
            !locked && colors.iconHover
          )}
        >
          <span
            className={
              compact
                ? "[&>svg]:h-3.5 [&>svg]:w-3.5"
                : "[&>svg]:h-4 [&>svg]:w-4"
            }
          >
            {link.icon}
          </span>
        </div>

        {/* Status indicator */}
        {locked ? (
          <span className="rounded-full border border-slate-600/50 bg-slate-800/80 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-slate-500">
            Soon
          </span>
        ) : (
          <div className="relative">
            <div className={cn("h-1.5 w-1.5 rounded-full", colors.orb)} />
            <div
              className={cn(
                "absolute inset-0 animate-ping rounded-full opacity-40",
                colors.orbPing
              )}
            />
          </div>
        )}
      </div>

      {/* Title & Subtitle */}
      <div className="flex flex-col gap-0.5">
        <h3
          className={cn(
            "font-semibold text-white transition-colors duration-200",
            compact ? "text-xs" : "text-[13px]",
            !locked && colors.titleHover
          )}
        >
          {title || link.label}
        </h3>
        {subtitle && (
          <p
            className={cn(
              "leading-snug text-slate-400 transition-colors duration-200",
              compact ? "text-[9px]" : "text-[10px]",
              !locked && "group-hover/featured:text-slate-300"
            )}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "h-px flex-1 bg-gradient-to-r to-transparent",
            colors.line
          )}
        />
        <span
          className={cn(
            "text-[8px] font-mono uppercase tracking-wider transition-colors",
            colors.ctaText
          )}
        >
          {locked ? "Locked" : "Enter"}
        </span>
        {!locked && (
          <svg
            className={cn(
              "h-2.5 w-2.5 transition-all duration-200 group-hover/featured:translate-x-0.5",
              colors.ctaText
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        )}
        {locked && (
          <svg
            className={cn("h-2.5 w-2.5", colors.ctaText)}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        )}
      </div>
    </div>
  </>
);

export const SidebarFeaturedCard = ({
  link,
  title,
  subtitle,
  className,
  pixelColors = ["#0d9488", "#14b8a6", "#2dd4bf", "#5eead4"],
  pixelGap = 6,
  pixelSpeed = 50,
  locked = false,
  accentColor = "teal",
  compact = false,
  index = 0,
}: SidebarFeaturedCardProps & { index?: number }) => {
  const { open, isAnimating, animationDirection } = useSidebar();
  const colors = accentColorMap[accentColor];

  const isOpening = animationDirection === "opening";

  // Realm cards are the LAST thing to reveal - staggered in Phase 3
  const phase3Config = ANIMATION_CONFIG.open.phase3;
  const staggerDelay = index * ANIMATION_CONFIG.stagger.realmCard;

  // Card animation timing - slides up from below
  const cardTransition = {
    opacity: {
      duration: ms(isOpening ? 100 : 80),
      ease: isOpening
        ? ANIMATION_CONFIG.easing.open
        : ANIMATION_CONFIG.easing.close,
      delay: isOpening
        ? ms(phase3Config.start + 100 + staggerDelay)
        : ms(staggerDelay * 0.5),
    },
    y: {
      duration: ms(isOpening ? 140 : 80),
      ease: isOpening
        ? ANIMATION_CONFIG.easing.open
        : ANIMATION_CONFIG.easing.close,
      delay: isOpening
        ? ms(phase3Config.start + 90 + staggerDelay)
        : ms(staggerDelay * 0.5),
    },
    scale: {
      duration: ms(isOpening ? 120 : 60),
      ease: isOpening ? [0.34, 1.02, 0.64, 1] : ANIMATION_CONFIG.easing.close, // Tiny overshoot
      delay: isOpening ? ms(phase3Config.start + 95 + staggerDelay) : 0,
    },
  };

  // When collapsed, render as a simple link
  if (!open && !isAnimating) {
    return <SidebarLink link={link} className={className} />;
  }

  const isInteractive = !locked;

  // When expanded or animating, render as beautiful featured card with animation
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{
        opacity: open ? 1 : 0,
        y: open ? 0 : 12,
        scale: open ? 1 : 0.97,
      }}
      transition={cardTransition}
    >
      {isInteractive ? (
        <motion.a
          href={link.href}
          className={cn(
            "group/featured relative flex flex-col overflow-hidden rounded-lg border bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90",
            compact ? "p-2.5" : "p-3",
            "transition-all duration-300",
            colors.border,
            colors.shadow,
            "focus-visible:outline-none focus-visible:ring-2",
            colors.ring,
            className
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15 }}
        >
          <CardContent
            link={link}
            title={title}
            subtitle={subtitle}
            pixelColors={pixelColors}
            pixelGap={pixelGap}
            pixelSpeed={pixelSpeed}
            locked={locked}
            accentColor={accentColor}
            compact={compact}
            colors={colors}
          />
        </motion.a>
      ) : (
        <div
          className={cn(
            "group/featured relative flex flex-col overflow-hidden rounded-lg border bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90",
            compact ? "p-2.5" : "p-3",
            "transition-all duration-300",
            colors.border,
            colors.shadow,
            "cursor-not-allowed opacity-60 grayscale-[30%] hover:opacity-70",
            className
          )}
        >
          <CardContent
            link={link}
            title={title}
            subtitle={subtitle}
            pixelColors={["#334155", "#475569", "#64748b"]}
            pixelGap={pixelGap}
            pixelSpeed={20}
            locked={locked}
            accentColor={accentColor}
            compact={compact}
            colors={colors}
          />
        </div>
      )}
    </motion.div>
  );
};
