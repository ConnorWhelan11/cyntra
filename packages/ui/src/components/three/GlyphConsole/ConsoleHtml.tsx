"use client";

import { Html } from "@react-three/drei";
import React, { useEffect, useState } from "react";
import type { GlyphConsole3DProps } from "./types";

interface ConsoleHtmlProps {
  recentExchanges: GlyphConsole3DProps["recentExchanges"];
  glyphState: GlyphConsole3DProps["glyphState"];
  onSubmit: (text: string) => void;
  htmlPortal?: React.RefObject<HTMLDivElement>;
}

const PLACEHOLDER_LINES = [
  "Confess your sins.",
  "Beg forgiveness.",
  "Get your fucking shit done.",
  "Accomplish anything. Tell Glyph what kind of chaos we’re in.",
];

export const ConsoleHtml: React.FC<ConsoleHtmlProps> = ({
  recentExchanges,
  glyphState,
  onSubmit,
  htmlPortal,
}) => {
  const [value, setValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [hasPlayedCarousel, setHasPlayedCarousel] = useState(false);

  // Run the placeholder carousel once
  useEffect(() => {
    if (hasPlayedCarousel) return;

    let i = 0;
    const lastIndex = PLACEHOLDER_LINES.length - 1;

    const id = setInterval(() => {
      if (i >= lastIndex) {
        setPlaceholderIndex(lastIndex);
        setHasPlayedCarousel(true);
        clearInterval(id);
        return;
      }
      i += 1;
      setPlaceholderIndex(i);
    }, 1400); // tweak speed as you like

    return () => clearInterval(id);
  }, [hasPlayedCarousel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  };

  const currentPlaceholder =
    PLACEHOLDER_LINES[
      hasPlayedCarousel ? PLACEHOLDER_LINES.length - 1 : placeholderIndex
    ];

  return (
    <Html
      portal={htmlPortal}
      transform={false}
      center
      position={[0, -0.5, 0]}
      className="pointer-events-auto"
      zIndexRange={[100, 0]}
    >
      <div className="mx-auto flex w-[520px] max-w-[90vw] flex-col gap-2 rounded-2xl border border-cyan-neon/30 bg-black/60 px-4 py-3 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.85)]">
        {/* Mini history (last 2–3 lines) */}
        {recentExchanges.length > 0 && (
          <div className="mb-1 max-h-[70px] overflow-y-auto text-[11px] font-mono text-slate-300/80">
            {recentExchanges.slice(-3).map((msg) => (
              <div key={msg.id} className="flex gap-1">
                <span className="text-cyan-neon/70">
                  {msg.role === "user" ? "you›" : "glyph›"}
                </span>
                <span className="opacity-80">{msg.text}</span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHasPlayedCarousel(true); // lock to final line once user starts typing
            }}
            rows={2}
            placeholder={currentPlaceholder}
            className="w-full resize-none rounded-xl border border-cyan-neon/35 bg-black/80 px-3 py-2 text-[12px] font-mono text-slate-100 outline-none ring-0 focus:border-cyan-neon/70 placeholder:text-slate-500"
            onFocus={() => setHasPlayedCarousel(true)} // also stop anim if they click in early
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <div className="flex items-center justify-between text-[10px] font-mono text-cyan-neon/50">
            <span>
              {glyphState === "thinking"
                ? "Glyph is weaving..."
                : "Ask for missions, leaks, schedules, or chaos cleanup."}
            </span>
            <button
              type="submit"
              className="rounded-full border border-cyan-neon/60 bg-cyan-neon/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-neon hover:bg-cyan-neon/20"
            >
              Invoke Glyph
            </button>
          </div>
        </form>
      </div>
    </Html>
  );
};
