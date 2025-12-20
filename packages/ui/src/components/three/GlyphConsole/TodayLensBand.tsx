"use client";

import { Html } from "@react-three/drei";
import React from "react";
import type { GlyphConsole3DProps } from "./types";

interface TodayLensBandProps {
  todaySummary: GlyphConsole3DProps["todaySummary"];
  onClick?: () => void;
  htmlPortal?: React.RefObject<HTMLDivElement>;
}

export const TodayLensBand: React.FC<TodayLensBandProps> = ({
  todaySummary,
  onClick,
  htmlPortal,
}) => (
  <Html
    portal={htmlPortal}
    position={[0, 1.1, 0]}
    center
    className="pointer-events-auto"
    zIndexRange={[100, 0]}
  >
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-full border border-cyan-neon/30 bg-black/70 px-4 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-200 hover:border-cyan-neon/60 hover:bg-black/80 transition-all backdrop-blur-md"
    >
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-neon shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
        ACT 0{todaySummary.actIndex + 1} / 0{todaySummary.actCount}
      </span>
      <span className="h-3 w-px bg-white/15" />
      <span className="truncate max-w-[180px] text-[9px] text-slate-100">
        {todaySummary.nowLabel}
      </span>
      {todaySummary.nextLabel && (
        <>
          <span className="h-3 w-px bg-white/10" />
          <span className="truncate max-w-[150px] text-[9px] text-slate-400">
            Next: {todaySummary.nextLabel}
          </span>
        </>
      )}
    </button>
  </Html>
);

