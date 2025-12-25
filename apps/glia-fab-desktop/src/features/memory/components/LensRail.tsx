import React, { useRef, useState, useEffect } from "react";
import { useMemoryAtlasContext, MemoryType, MemoryScope, Agent } from "../hooks/useMemoryAtlas";

const TYPE_CONFIG: Record<MemoryType, { color: string; icon: string; label: string }> = {
  pattern: { color: "var(--accent-primary)", icon: "◈", label: "Pattern" },
  failure: { color: "var(--signal-error)", icon: "⚠", label: "Failure" },
  dynamic: { color: "var(--signal-active)", icon: "◎", label: "Dynamic" },
  context: { color: "var(--signal-info)", icon: "◐", label: "Context" },
  playbook: { color: "var(--agent-opencode)", icon: "▤", label: "Playbook" },
  frontier: { color: "var(--signal-success)", icon: "⟁", label: "Frontier" },
};

const AGENT_CONFIG: Record<Agent, { color: string; label: string }> = {
  claude: { color: "var(--agent-claude)", label: "CL" },
  codex: { color: "var(--agent-codex)", label: "CX" },
  opencode: { color: "var(--agent-opencode)", label: "OC" },
  crush: { color: "var(--agent-crush)", label: "CR" },
};

const SCOPE_CONFIG: Record<MemoryScope, { icon: string; label: string }> = {
  individual: { icon: "○", label: "Individual" },
  collective: { icon: "◉", label: "Collective" },
  all: { icon: "◎", label: "All" },
};

interface LensRailProps {
  className?: string;
}

export function LensRail({ className = "" }: LensRailProps) {
  const { state, actions, filteredMemories, memories } = useMemoryAtlasContext();
  const { lens } = state;

  // Importance dial state
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle dial drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const delta = (centerY - clientY) / 50;
      const newValue = Math.max(0, Math.min(1, lens.importanceMin + delta * 0.02));
      actions.setImportanceMin(newValue);
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [isDragging, lens.importanceMin, actions]);

  return (
    <div
      className={`
        w-16 h-full flex flex-col items-center py-4 gap-5
        glass-panel border-r border-white/5
        ${className}
      `}
    >
      {/* Match count */}
      <div className="text-center">
        <div className="text-lg font-mono font-semibold text-primary">
          {filteredMemories.length}
        </div>
        <div className="text-[10px] text-tertiary uppercase tracking-wider">
          /{memories.length}
        </div>
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-gradient-to-r from-transparent via-slate to-transparent" />

      {/* Type chips */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[9px] text-tertiary uppercase tracking-widest mb-1">Type</span>
        {(Object.keys(TYPE_CONFIG) as MemoryType[]).map((type) => {
          const config = TYPE_CONFIG[type];
          const isActive = lens.types.includes(type);
          return (
            <button
              key={type}
              onClick={() => actions.toggleType(type)}
              className={`
                w-9 h-9 rounded-lg flex items-center justify-center
                transition-all duration-200 relative
                ${isActive
                  ? "bg-current/15 border border-current/40"
                  : "bg-white/5 border border-transparent hover:bg-white/10"
                }
              `}
              style={{ color: isActive ? config.color : "var(--text-tertiary)" }}
              title={config.label}
            >
              <span className="text-base">{config.icon}</span>
              {isActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-gradient-to-r from-transparent via-slate to-transparent" />

      {/* Scope toggle */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] text-tertiary uppercase tracking-widest mb-1">Scope</span>
        {(["all", "collective", "individual"] as MemoryScope[]).map((scope) => {
          const config = SCOPE_CONFIG[scope];
          const isActive = lens.scope === scope;
          return (
            <button
              key={scope}
              onClick={() => actions.setScope(scope)}
              className={`
                w-9 h-7 rounded-md flex items-center justify-center text-sm
                transition-all duration-200
                ${isActive
                  ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/30"
                  : "text-tertiary hover:text-secondary hover:bg-white/5"
                }
              `}
              title={config.label}
            >
              {config.icon}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-gradient-to-r from-transparent via-slate to-transparent" />

      {/* Agent chips */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[9px] text-tertiary uppercase tracking-widest mb-1">Agent</span>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(AGENT_CONFIG) as Agent[]).map((agent) => {
            const config = AGENT_CONFIG[agent];
            const isActive = lens.agents.includes(agent);
            return (
              <button
                key={agent}
                onClick={() => actions.toggleAgent(agent)}
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center
                  transition-all duration-200 text-[8px] font-bold
                  ${isActive
                    ? "ring-2 ring-offset-1 ring-offset-abyss"
                    : "opacity-40 hover:opacity-70"
                  }
                `}
                style={{
                  backgroundColor: config.color,
                  color: "var(--void)",
                }}
                title={agent}
              >
                {config.label[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Importance dial */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-[9px] text-tertiary uppercase tracking-widest">Imp</span>
        <div
          ref={dialRef}
          className={`
            relative w-10 h-10 rounded-full cursor-ns-resize
            bg-void border border-slate/50
            flex items-center justify-center
            ${isDragging ? "ring-2 ring-accent-primary/50" : ""}
          `}
          onMouseDown={() => setIsDragging(true)}
          onTouchStart={() => setIsDragging(true)}
        >
          {/* Track ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--slate)"
              strokeWidth="3"
              strokeOpacity="0.3"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 16 * lens.importanceMin} ${2 * Math.PI * 16}`}
              strokeLinecap="round"
              className="transition-all duration-100"
            />
          </svg>
          {/* Value */}
          <span className="text-xs font-mono text-primary relative z-10">
            {(lens.importanceMin * 100).toFixed(0)}
          </span>
        </div>
        <span className="text-[9px] text-tertiary">drag</span>
      </div>

      {/* Reset button */}
      <button
        onClick={actions.resetLens}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-tertiary hover:text-secondary hover:bg-white/5 transition-colors"
        title="Reset filters"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 8a6 6 0 1011.5 2.5" strokeLinecap="round" />
          <path d="M2 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default LensRail;
