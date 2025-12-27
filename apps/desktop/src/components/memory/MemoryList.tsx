import React from "react";
import type { MemoryItem } from "@/types";

interface MemoryListProps {
  memories: MemoryItem[];
  selectedId?: string | null;
  onSelect?: (memory: MemoryItem) => void;
  className?: string;
}

const TYPE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  pattern: { color: "var(--accent-primary)", icon: "◈", label: "P" },
  failure: { color: "var(--signal-error)", icon: "⚠", label: "F" },
  dynamic: { color: "var(--signal-active)", icon: "◎", label: "D" },
  context: { color: "var(--signal-info)", icon: "◐", label: "C" },
};

const AGENT_COLORS: Record<string, string> = {
  claude: "var(--agent-claude)",
  codex: "var(--agent-codex)",
  opencode: "var(--agent-opencode)",
  crush: "var(--agent-crush)",
};

export function MemoryList({ memories, selectedId, onSelect, className = "" }: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="relative mb-4">
          {/* Animated empty state glyph */}
          <div className="w-16 h-16 rounded-2xl bg-obsidian border border-slate flex items-center justify-center">
            <span className="text-2xl text-tertiary">◇</span>
          </div>
          <div
            className="absolute inset-0 rounded-2xl border border-accent-primary/20 animate-ping"
            style={{ animationDuration: "3s" }}
          />
        </div>
        <p className="text-tertiary text-sm text-center">No memories match filters</p>
        <p className="text-tertiary/50 text-xs mt-1">Try adjusting your criteria</p>
      </div>
    );
  }

  return (
    <div className={`p-2 space-y-1 ${className}`}>
      {memories.map((memory, index) => {
        const isSelected = selectedId === memory.id;
        const typeConfig = TYPE_CONFIG[memory.type] || TYPE_CONFIG.pattern;
        const agentColor = AGENT_COLORS[memory.agent] || "var(--text-tertiary)";

        return (
          <div
            key={memory.id}
            className={`
              group relative overflow-hidden rounded-xl cursor-pointer
              transition-all duration-300 ease-out
              ${isSelected ? "bg-card-selected-bg" : "bg-obsidian/30 hover:bg-obsidian/60"}
            `}
            style={{
              animationDelay: `${index * 50}ms`,
              borderLeft: isSelected ? `3px solid ${typeConfig.color}` : "3px solid transparent",
              boxShadow: isSelected
                ? `0 0 30px -10px ${typeConfig.color}, inset 0 1px 0 0 rgba(255,255,255,0.03)`
                : "inset 0 1px 0 0 rgba(255,255,255,0.02)",
            }}
            onClick={() => onSelect?.(memory)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(memory);
              }
            }}
          >
            {/* Subtle hover gradient */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{
                background: `linear-gradient(135deg, ${typeConfig.color}05 0%, transparent 50%)`,
              }}
            />

            <div className="relative flex gap-3 p-3">
              {/* Type badge */}
              <div
                className={`
                  relative flex-shrink-0 w-10 h-10 rounded-lg
                  flex items-center justify-center
                  transition-all duration-300
                  ${isSelected ? "scale-110" : "group-hover:scale-105"}
                `}
                style={{
                  background: `linear-gradient(135deg, ${typeConfig.color}20, ${typeConfig.color}05)`,
                  border: `1px solid ${typeConfig.color}30`,
                  boxShadow: isSelected ? `0 0 16px -4px ${typeConfig.color}` : "none",
                }}
              >
                <span className="text-lg" style={{ color: typeConfig.color }}>
                  {typeConfig.icon}
                </span>

                {/* Pulse indicator for high importance */}
                {memory.importance > 0.8 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: typeConfig.color }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* Memory content */}
                <p
                  className={`
                  text-sm leading-relaxed line-clamp-2
                  transition-colors duration-200
                  ${isSelected ? "text-primary" : "text-secondary group-hover:text-primary"}
                `}
                >
                  {memory.content}
                </p>

                {/* Meta row */}
                <div className="flex items-center gap-3">
                  {/* Agent chip */}
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: agentColor }}>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: agentColor }}
                    />
                    {memory.agent}
                  </span>

                  <span className="text-slate">·</span>

                  {/* Scope */}
                  <span className="text-xs text-tertiary">{memory.scope}</span>

                  {/* Links indicator */}
                  {memory.links && memory.links.length > 0 && (
                    <>
                      <span className="text-slate">·</span>
                      <span className="text-xs text-tertiary flex items-center gap-1">
                        <svg
                          className="w-3 h-3"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path
                            d="M6 10L10 6M7 5L10 5V8M9 11L6 11V8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {memory.links.length}
                      </span>
                    </>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Importance meter */}
                  <div className="flex items-center gap-2">
                    <div className="relative w-12 h-1 rounded-full bg-slate/50 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                        style={{
                          width: `${memory.importance * 100}%`,
                          background:
                            memory.importance > 0.7
                              ? `linear-gradient(90deg, ${typeConfig.color}80, ${typeConfig.color})`
                              : `var(--slate)`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-tertiary tabular-nums w-6">
                      {(memory.importance * 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Selection indicator arrow */}
              <div
                className={`
                  flex-shrink-0 w-6 flex items-center justify-center
                  transition-all duration-300
                  ${isSelected ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}
                `}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke={typeConfig.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </div>
            </div>

            {/* Bottom border accent */}
            <div
              className={`
                absolute bottom-0 left-3 right-3 h-px
                transition-all duration-300
                ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-30"}
              `}
              style={{
                background: `linear-gradient(90deg, transparent, ${typeConfig.color}50, transparent)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default MemoryList;
