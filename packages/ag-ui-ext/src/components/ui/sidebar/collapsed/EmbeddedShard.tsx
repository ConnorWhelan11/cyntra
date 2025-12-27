"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { PixelCanvas } from "../../../atoms/PixelCanvas";
import { ANIMATION_CONFIG, ms } from "../core/animations";
import type { EmbeddedShardProps } from "../types";
import { ShardPip } from "./ShardPip";

export const EmbeddedShard = ({
  activeRealm,
  realms = [],
  studioDocks,
  socialDocks,
  onExpandSidebar,
  onDockClick,
  onRealmChange,
  sessionProgress,
  isExpanding,
}: EmbeddedShardProps) => {
  const [hoveredDock, setHoveredDock] = useState<string | null>(null);

  return (
    <div className={cn("relative flex h-full w-full overflow-visible")}>
      {/* ═══════════════════════════════════════════════════════════════════
          THE MONOLITH - Single outer rail, the only full-height outline
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="absolute right-2 top-3 bottom-3 w-[36px] flex flex-col overflow-visible">
        {/* Monolith glass - single 1px border, unified radius */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl overflow-hidden",
            "border border-cyan-500/20 bg-slate-950/70",
            "shadow-[0_0_20px_rgba(14,165,233,0.12),inset_0_1px_0_rgba(255,255,255,0.02)]",
            "backdrop-blur-sm transition-all duration-300",
            "hover:border-cyan-500/30 hover:shadow-[0_0_28px_rgba(14,165,233,0.18)]"
          )}
        />

        {/* ═══════════════════════════════════════════════════════════════════
            TOP CAP - Circle plugged into top of monolith
            ═══════════════════════════════════════════════════════════════════ */}
        <button
          onClick={onExpandSidebar}
          className="group relative z-10 flex flex-col items-center pt-3 pb-2"
          aria-label="Expand sidebar"
        >
          <motion.div
            className={cn(
              "h-5 w-5 rounded-full",
              "border border-cyan-500/25 bg-cyan-500/10",
              "shadow-[0_0_8px_rgba(34,211,238,0.2)]",
              "transition-all duration-200",
              "group-hover:border-cyan-500/45 group-hover:shadow-[0_0_14px_rgba(34,211,238,0.4)]"
            )}
            animate={{
              scale: isExpanding ? 0.8 : 1,
              opacity: isExpanding ? 0.5 : 1,
            }}
            transition={{ duration: 0.12 }}
          />
          {/* Vertical realm label */}
          <motion.span
            className={cn(
              "mt-2 text-[6px] font-bold uppercase tracking-[0.12em]",
              "text-slate-500/50 [writing-mode:vertical-lr] rotate-180",
              "transition-colors group-hover:text-slate-400/70"
            )}
            animate={{ opacity: isExpanding ? 0 : 1 }}
            transition={{ duration: 0.1 }}
          >
            {activeRealm.shortName || activeRealm.name.slice(0, 6)}
          </motion.span>
        </button>

        {/* ═══════════════════════════════════════════════════════════════════
            REALM BAND - Soft cutout in lower portion, NO border
            ~30% height, centered vertically in lower half
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="relative flex-1 flex items-end justify-center pb-12">
          <motion.button
            onClick={onExpandSidebar}
            className="group relative w-full mx-1.5 h-[38%] min-h-[100px] max-h-[180px]"
            aria-label="Open realms"
            animate={{
              scale: isExpanding ? 0.95 : 1,
              opacity: isExpanding ? 0.4 : 1,
            }}
            transition={{ duration: 0.15 }}
          >
            {/* Realm band interior - no border, just soft gradient + canvas */}
            <div
              className={cn(
                "absolute inset-0 rounded-lg overflow-hidden",
                "bg-gradient-to-b from-slate-900/40 via-slate-900/20 to-slate-900/60"
              )}
            >
              {/* PixelCanvas drawn directly on the band */}
              <PixelCanvas
                colors={activeRealm.pixelColors}
                gap={4}
                speed={isExpanding ? 5 : 12}
                variant="default"
              />

              {/* Subtle vertical data stream */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 overflow-hidden opacity-40">
                <motion.div
                  className="w-full h-12 bg-gradient-to-b from-transparent via-teal-300/25 to-transparent"
                  animate={{ y: ["-100%", "400%"] }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </div>

              {/* Soft inner gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-900/30" />
            </div>

            {/* Status dot - single glowing point in center */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="h-1.5 w-1.5 rounded-full bg-teal-300/80 shadow-[0_0_8px_rgba(45,212,191,0.5)]" />
            </div>

            {/* Session progress - subtle bar at bottom of band */}
            {sessionProgress !== undefined && sessionProgress > 0 && (
              <div className="absolute left-1.5 right-1.5 bottom-2 h-px bg-slate-700/30 rounded-full overflow-hidden z-10">
                <div
                  className="h-full bg-gradient-to-r from-teal-400/60 to-cyan-400/60 shadow-[0_0_4px_rgba(34,211,238,0.4)] transition-all duration-300"
                  style={{ width: `${sessionProgress * 100}%` }}
                />
              </div>
            )}

            {/* Realm selector dots - tiny chips at bottom, no enclosing pill */}
            {realms.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-1 z-10">
                {realms.map((realm) => (
                  <div
                    key={realm.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Switch to ${realm.name}`}
                    title={realm.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRealmChange?.(realm);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onRealmChange?.(realm);
                      }
                    }}
                    className={cn(
                      "h-1 w-1 rounded-full transition-all duration-200 outline-none focus:ring-1 focus:ring-cyan-400/70 focus:ring-offset-1 focus:ring-offset-slate-900",
                      realm.id === activeRealm.id
                        ? "bg-white/80 shadow-[0_0_4px_rgba(255,255,255,0.4)] scale-110"
                        : realm.isLocked
                          ? "bg-slate-600/25"
                          : "bg-slate-400/30 hover:bg-slate-200/50"
                    )}
                  />
                ))}
              </div>
            )}
          </motion.button>

          {/* ═══════════════════════════════════════════════════════════════════
              DOCKS - Embedded coins on the monolith glass, hugging the shard band
              Positioned INSIDE the monolith silhouette (4-6px from left edge)
              ═══════════════════════════════════════════════════════════════════ */}

          {/* STUDIO DOCKS - Upper area, embedded in glass */}
          <AnimatePresence>
            {!isExpanding && (
              <motion.div
                className="absolute left-[7px] top-[15%] flex flex-col gap-2 z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{
                  duration: ms(
                    ANIMATION_CONFIG.open.phase2.end - ANIMATION_CONFIG.open.phase2.start
                  ),
                  ease: ANIMATION_CONFIG.easing.open,
                }}
              >
                {studioDocks.map((dock, idx) => (
                  <motion.div
                    key={dock.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      delay: ms(idx * ANIMATION_CONFIG.stagger.navItem),
                      duration: 0.12,
                    }}
                  >
                    <ShardPip
                      dock={dock}
                      accent="cyan"
                      isHovered={hoveredDock === dock.id}
                      onHover={(hovered) => setHoveredDock(hovered ? dock.id : null)}
                      onClick={() => onDockClick?.(dock, "studio")}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* SOCIAL DOCKS - Below studio docks, embedded in glass */}
          <AnimatePresence>
            {!isExpanding && (
              <motion.div
                className="absolute left-[7px] top-[35%] flex flex-col gap-2 z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{
                  duration: ms(
                    ANIMATION_CONFIG.open.phase2.end - ANIMATION_CONFIG.open.phase2.start
                  ),
                  ease: ANIMATION_CONFIG.easing.open,
                }}
              >
                {socialDocks.map((dock, idx) => (
                  <motion.div
                    key={dock.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      delay: ms(idx * ANIMATION_CONFIG.stagger.navItem),
                      duration: 0.12,
                    }}
                  >
                    <ShardPip
                      dock={dock}
                      accent="moonlit_orchid"
                      isHovered={hoveredDock === dock.id}
                      onHover={(hovered) => setHoveredDock(hovered ? dock.id : null)}
                      onClick={() => onDockClick?.(dock, "social")}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            BOTTOM CAP - Circle plugged into bottom of monolith
            ═══════════════════════════════════════════════════════════════════ */}
        <motion.button
          onClick={onExpandSidebar}
          className="group relative z-10 flex items-center justify-center pb-3 pt-2"
          aria-label="Browse realms"
          animate={{
            opacity: isExpanding ? 0 : 1,
            scale: isExpanding ? 0.8 : 1,
          }}
          transition={{ duration: 0.1 }}
        >
          <div
            className={cn(
              "relative h-5 w-5 rounded-full",
              "border border-slate-600/35 bg-slate-800/30",
              "transition-all duration-200",
              "group-hover:border-cyan-500/35 group-hover:bg-slate-800/50"
            )}
          >
            <svg
              className="h-full w-full p-1 text-slate-500/50 transition-colors group-hover:text-cyan-400/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
        </motion.button>
      </div>
    </div>
  );
};
