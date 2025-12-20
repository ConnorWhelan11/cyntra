"use client";

import { cn } from "@/lib/utils";
import { motion, useMotionValue } from "framer-motion";
import { ArrowRight, Check, Clock } from "lucide-react";
import React, { useEffect, useState } from "react";
import { EvervaultPattern, generateRandomString } from "./EvervaultPattern";

export interface ConnectionCardProps {
  icon: React.ReactNode;
  name: string;
  label: string;
  status: "connected" | "disconnected" | "comingSoon";
  description: string;
  scopes?: string[];
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const ConnectionCard = ({
  icon,
  name,
  label,
  status,
  description,
  scopes,
  primaryAction,
  className,
}: ConnectionCardProps) => {
  let mouseX = useMotionValue(0);
  let mouseY = useMotionValue(0);
  const [randomString, setRandomString] = useState("");

  useEffect(() => {
    setRandomString(generateRandomString(1500));
  }, []);

  function onMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    let { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
    setRandomString(generateRandomString(1500));
  }

  const isConnected = status === "connected";
  const isComingSoon = status === "comingSoon";

  return (
    <motion.div
      layout
      onMouseMove={onMouseMove}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-[#0C1117]/50 p-6 backdrop-blur-md transition-all duration-300 hover:border-cyan-neon/30 hover:bg-[#0C1117]/80 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]",
        className
      )}
    >
      <EvervaultPattern
        mouseX={mouseX}
        mouseY={mouseY}
        randomString={randomString}
      />

      {/* Content Wrapper for z-index */}
      <div className="relative z-10 flex flex-col h-full justify-between">
        <div>
          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-cyan-neon ring-1 ring-white/10 transition-colors group-hover:bg-cyan-neon/10 group-hover:text-cyan-neon">
                {icon}
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  {name}
                </h3>
                <p className="text-xs font-medium text-slate-500">{label}</p>
              </div>
            </div>
            {/* Status Indicator */}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wider",
                isConnected
                  ? "bg-cyan-neon/10 text-cyan-neon ring-1 ring-cyan-neon/20"
                  : isComingSoon
                    ? "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20"
                    : "bg-white/5 text-slate-500 ring-1 ring-white/10"
              )}
            >
              {isConnected && (
                <div className="h-1.5 w-1.5 rounded-full bg-cyan-neon shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              )}
              {isComingSoon && <Clock className="h-3 w-3" />}
              {isConnected
                ? "Connected"
                : isComingSoon
                  ? "Soon"
                  : "Not connected"}
            </div>
          </div>

          {/* Description */}
          <p className="mb-6 text-sm leading-relaxed text-slate-400 group-hover:text-slate-300 transition-colors">
            {description}
          </p>

          {/* Scopes */}
          {scopes && scopes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-500 transition-colors group-hover:bg-white/10 group-hover:text-slate-400"
                >
                  {scope}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Scopes / Metadata */}
        {scopes && scopes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {scopes.map((scope) => (
              <span
                key={scope}
                className="inline-flex items-center rounded border border-white/5 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500"
              >
                {scope}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="relative z-10 mt-6 flex items-center justify-between border-t border-white/5 pt-4">
        {primaryAction ? (
          <button
            onClick={primaryAction.onClick}
            disabled={isComingSoon}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              isConnected
                ? "bg-cyan-neon/10 text-cyan-neon hover:bg-cyan-neon/20"
                : "bg-white/10 text-slate-200 hover:bg-white/15",
              isComingSoon && "cursor-not-allowed opacity-50"
            )}
          >
            {primaryAction.label}
            {!isConnected && !isComingSoon && (
              <ArrowRight className="h-3 w-3" />
            )}
            {isConnected && <Check className="h-3 w-3" />}
          </button>
        ) : (
          <div />
        )}

        <button className="text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors">
          Details
        </button>
      </div>
    </motion.div>
  );
};
