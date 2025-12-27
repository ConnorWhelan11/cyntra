import React from "react";
import type { MemoryItem } from "@/types";

type MemoryType = MemoryItem["type"];
type MemoryScope = "individual" | "collective" | "all";
type Agent = "claude" | "codex" | "opencode" | "crush";

interface MemoryFiltersProps {
  selectedTypes: MemoryType[];
  onTypesChange: (types: MemoryType[]) => void;
  selectedScope: MemoryScope;
  onScopeChange: (scope: MemoryScope) => void;
  selectedAgents: Agent[];
  onAgentsChange: (agents: Agent[]) => void;
  importanceThreshold: number;
  onImportanceChange: (value: number) => void;
  className?: string;
}

const MEMORY_TYPES: { id: MemoryType; label: string; icon: string; color: string }[] = [
  { id: "pattern", label: "Pattern", icon: "◈", color: "var(--accent-primary)" },
  { id: "failure", label: "Failure", icon: "⚠", color: "var(--signal-error)" },
  { id: "dynamic", label: "Dynamic", icon: "◎", color: "var(--signal-active)" },
  { id: "context", label: "Context", icon: "◐", color: "var(--signal-info)" },
  { id: "playbook", label: "Playbook", icon: "▤", color: "var(--agent-opencode)" },
  { id: "frontier", label: "Frontier", icon: "⟁", color: "var(--signal-success)" },
];

const SCOPES: { id: MemoryScope; label: string; desc: string }[] = [
  { id: "individual", label: "Individual", desc: "Agent-specific" },
  { id: "collective", label: "Collective", desc: "Shared across agents" },
  { id: "all", label: "All", desc: "Everything" },
];

const AGENTS: { id: Agent; label: string; color: string }[] = [
  { id: "claude", label: "Claude", color: "var(--agent-claude)" },
  { id: "codex", label: "Codex", color: "var(--agent-codex)" },
  { id: "opencode", label: "OpenCode", color: "var(--agent-opencode)" },
  { id: "crush", label: "Crush", color: "var(--agent-crush)" },
];

export function MemoryFilters({
  selectedTypes,
  onTypesChange,
  selectedScope,
  onScopeChange,
  selectedAgents,
  onAgentsChange,
  importanceThreshold,
  onImportanceChange,
  className = "",
}: MemoryFiltersProps) {
  const toggleType = (type: MemoryType) => {
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  const toggleAgent = (agent: Agent) => {
    if (selectedAgents.includes(agent)) {
      onAgentsChange(selectedAgents.filter((a) => a !== agent));
    } else {
      onAgentsChange([...selectedAgents, agent]);
    }
  };

  return (
    <div className={`p-4 space-y-6 ${className}`}>
      {/* Type filters - pill grid */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono tracking-widest text-tertiary uppercase">Type</span>
          <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MEMORY_TYPES.map((type) => {
            const isActive = selectedTypes.includes(type.id);
            return (
              <button
                key={type.id}
                onClick={() => toggleType(type.id)}
                className={`
                  group relative flex items-center gap-2 px-3 py-2 rounded-lg
                  border transition-all duration-200 text-left
                  ${
                    isActive
                      ? "border-current bg-current/10"
                      : "border-slate/50 bg-obsidian/50 hover:border-slate hover:bg-obsidian"
                  }
                `}
                style={{
                  color: isActive ? type.color : "var(--text-tertiary)",
                  boxShadow: isActive ? `0 0 20px -8px ${type.color}` : "none",
                }}
              >
                <span
                  className={`text-base transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-105"}`}
                >
                  {type.icon}
                </span>
                <span className={`text-xs font-medium ${isActive ? "" : "text-secondary"}`}>
                  {type.label}
                </span>
                {isActive && (
                  <span
                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: type.color }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Scope filters - segmented control */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono tracking-widest text-tertiary uppercase">Scope</span>
          <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
        </div>
        <div className="relative bg-void/50 rounded-lg p-1 border border-slate/30">
          {/* Active indicator */}
          <div
            className="absolute top-1 bottom-1 rounded-md bg-accent-primary/15 border border-accent-primary/30 transition-all duration-300"
            style={{
              left: `calc(${SCOPES.findIndex((s) => s.id === selectedScope) * 33.333}% + 4px)`,
              width: "calc(33.333% - 8px)",
            }}
          />
          <div className="relative flex">
            {SCOPES.map((scope) => {
              const isActive = selectedScope === scope.id;
              return (
                <button
                  key={scope.id}
                  onClick={() => onScopeChange(scope.id)}
                  className={`
                    flex-1 py-2 px-2 text-center transition-colors duration-200 rounded-md
                    ${isActive ? "text-accent-primary" : "text-tertiary hover:text-secondary"}
                  `}
                >
                  <div className="text-xs font-medium">{scope.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Agent filters - horizontal chips */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono tracking-widest text-tertiary uppercase">Agent</span>
          <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
        </div>
        <div className="flex flex-wrap gap-2">
          {AGENTS.map((agent) => {
            const isActive = selectedAgents.includes(agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => toggleAgent(agent.id)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-full border
                  transition-all duration-200
                  ${
                    isActive
                      ? "border-current bg-current/15"
                      : "border-slate/50 bg-transparent hover:border-slate"
                  }
                `}
                style={{
                  color: isActive ? agent.color : "var(--text-tertiary)",
                }}
              >
                <span
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${isActive ? "scale-110" : "scale-90 opacity-50"}`}
                  style={{ backgroundColor: agent.color }}
                />
                <span className={`text-xs font-medium ${isActive ? "" : "text-secondary"}`}>
                  {agent.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Importance threshold - styled slider */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono tracking-widest text-tertiary uppercase">
            Importance
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
        </div>

        {/* Value display */}
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-tertiary">Threshold</span>
          <span
            className="font-mono text-lg font-semibold tabular-nums"
            style={{
              color:
                importanceThreshold > 0.7
                  ? "var(--accent-primary)"
                  : importanceThreshold > 0.4
                    ? "var(--text-secondary)"
                    : "var(--text-tertiary)",
            }}
          >
            {importanceThreshold.toFixed(1)}
          </span>
        </div>

        {/* Custom slider track */}
        <div className="relative h-8 flex items-center">
          {/* Background track with gradient */}
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-gradient-to-r from-slate via-obsidian to-accent-primary/30" />

          {/* Active fill */}
          <div
            className="absolute left-0 h-1.5 rounded-full bg-gradient-to-r from-accent-dim to-accent-primary"
            style={{ width: `${importanceThreshold * 100}%` }}
          />

          {/* Tick marks */}
          <div className="absolute inset-x-0 flex justify-between px-0.5">
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <div
                key={tick}
                className={`w-px h-2 transition-colors ${
                  tick <= importanceThreshold ? "bg-accent-primary/50" : "bg-slate"
                }`}
              />
            ))}
          </div>

          {/* Actual input (invisible but functional) */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={importanceThreshold}
            onChange={(e) => onImportanceChange(parseFloat(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />

          {/* Custom thumb */}
          <div
            className="absolute w-4 h-4 rounded-full bg-accent-primary border-2 border-void shadow-lg pointer-events-none transition-transform hover:scale-110"
            style={{
              left: `calc(${importanceThreshold * 100}% - 8px)`,
              boxShadow: "0 0 12px var(--accent-primary)",
            }}
          />
        </div>

        {/* Labels */}
        <div className="flex justify-between text-xs text-tertiary mt-1 font-mono">
          <span>0.0</span>
          <span className="text-secondary">min threshold</span>
          <span>1.0</span>
        </div>
      </section>

      {/* Stats footer */}
      <div className="pt-4 border-t border-slate/30">
        <div className="flex items-center justify-between text-xs">
          <span className="text-tertiary">Active filters</span>
          <span className="font-mono text-secondary">
            {selectedTypes.length +
              (selectedScope !== "all" ? 1 : 0) +
              selectedAgents.length +
              (importanceThreshold > 0 ? 1 : 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default MemoryFilters;
