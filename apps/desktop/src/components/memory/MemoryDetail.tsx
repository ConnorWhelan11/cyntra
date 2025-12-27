import React from "react";
import type { MemoryItem } from "@/types";

interface MemoryDetailProps {
  memory: MemoryItem | null;
  onLinkClick?: (targetId: string) => void;
  className?: string;
}

const TYPE_CONFIG: Record<string, { color: string; icon: string; label: string; desc: string }> = {
  pattern: {
    color: "var(--accent-primary)",
    icon: "◈",
    label: "Pattern",
    desc: "Learned behavior or best practice",
  },
  failure: {
    color: "var(--signal-error)",
    icon: "⚠",
    label: "Failure",
    desc: "Recorded error or anti-pattern",
  },
  dynamic: {
    color: "var(--signal-active)",
    icon: "◎",
    label: "Dynamic",
    desc: "Contextual or evolving knowledge",
  },
  context: {
    color: "var(--signal-info)",
    icon: "◐",
    label: "Context",
    desc: "Static project or codebase info",
  },
};

const AGENT_CONFIG: Record<string, { color: string; label: string }> = {
  claude: { color: "var(--agent-claude)", label: "Claude" },
  codex: { color: "var(--agent-codex)", label: "Codex" },
  opencode: { color: "var(--agent-opencode)", label: "OpenCode" },
  crush: { color: "var(--agent-crush)", label: "Crush" },
};

const LINK_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  supersedes: { icon: "→", label: "Supersedes", color: "var(--accent-primary)" },
  instance_of: { icon: "↓", label: "Instance of", color: "var(--signal-active)" },
  related_to: { icon: "↔", label: "Related to", color: "var(--text-secondary)" },
  derived_from: { icon: "←", label: "Derived from", color: "var(--signal-info)" },
};

export function MemoryDetail({ memory, onLinkClick, className = "" }: MemoryDetailProps) {
  if (!memory) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="relative mb-6">
          {/* Animated placeholder */}
          <div className="w-24 h-24 rounded-2xl bg-obsidian/50 border border-slate/30 flex items-center justify-center">
            <div className="space-y-2 text-center">
              <div className="text-3xl text-tertiary/40">◇</div>
              <div className="w-8 h-0.5 bg-slate/30 mx-auto rounded-full" />
            </div>
          </div>
          {/* Decorative rings */}
          <div
            className="absolute inset-0 rounded-2xl border border-dashed border-slate/20 -m-2 animate-spin"
            style={{ animationDuration: "20s" }}
          />
          <div
            className="absolute inset-0 rounded-2xl border border-dashed border-slate/10 -m-4 animate-spin"
            style={{ animationDuration: "30s", animationDirection: "reverse" }}
          />
        </div>
        <p className="text-tertiary text-sm">Select a memory to view details</p>
        <p className="text-tertiary/50 text-xs mt-1">Click any item from the list or graph</p>
      </div>
    );
  }

  const typeConfig = TYPE_CONFIG[memory.type] || TYPE_CONFIG.pattern;
  const agentConfig = AGENT_CONFIG[memory.agent] || {
    color: "var(--text-tertiary)",
    label: memory.agent,
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header section with type indicator */}
      <div className="p-4 border-b border-slate/30">
        <div className="flex items-start gap-4">
          {/* Large type icon */}
          <div
            className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center relative"
            style={{
              background: `linear-gradient(135deg, ${typeConfig.color}25, ${typeConfig.color}08)`,
              border: `1px solid ${typeConfig.color}40`,
              boxShadow: `0 0 24px -8px ${typeConfig.color}`,
            }}
          >
            <span className="text-2xl" style={{ color: typeConfig.color }}>
              {typeConfig.icon}
            </span>
            {/* Importance ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke={typeConfig.color}
                strokeWidth="2"
                strokeOpacity="0.2"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke={typeConfig.color}
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 24 * memory.importance} ${2 * Math.PI * 24}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
          </div>

          {/* Type info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-primary">{typeConfig.label}</h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{ borderColor: agentConfig.color, color: agentConfig.color }}
              >
                {agentConfig.label}
              </span>
            </div>
            <p className="text-xs text-tertiary mt-0.5">{typeConfig.desc}</p>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-md ${
                  memory.scope === "collective"
                    ? "bg-signal-active/10 text-signal-active border border-signal-active/20"
                    : "bg-slate/30 text-secondary border border-slate/30"
                }`}
              >
                {memory.scope}
              </span>
              <span className="text-xs font-mono text-tertiary">
                {(memory.importance * 100).toFixed(0)}% importance
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* Memory content */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono tracking-widest text-tertiary uppercase">
              Content
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
          </div>
          <div
            className="p-4 rounded-xl border relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, var(--void) 0%, ${typeConfig.color}05 100%)`,
              borderColor: `${typeConfig.color}20`,
            }}
          >
            {/* Decorative corner accent */}
            <div
              className="absolute top-0 left-0 w-16 h-16 opacity-30"
              style={{
                background: `radial-gradient(circle at top left, ${typeConfig.color}30, transparent 70%)`,
              }}
            />
            <p className="relative text-primary text-sm leading-relaxed">
              &ldquo;{memory.content}&rdquo;
            </p>
          </div>
        </section>

        {/* Metadata grid */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono tracking-widest text-tertiary uppercase">
              Metadata
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {memory.sourceRun && (
              <div className="p-3 rounded-lg bg-obsidian/30 border border-slate/20">
                <div className="text-xs text-tertiary mb-1">Source Run</div>
                <div className="font-mono text-sm text-secondary">
                  #{memory.sourceRun}
                  {memory.sourceIssue && (
                    <span className="text-tertiary"> from issue #{memory.sourceIssue}</span>
                  )}
                </div>
              </div>
            )}
            {memory.accessCount !== undefined && (
              <div className="p-3 rounded-lg bg-obsidian/30 border border-slate/20">
                <div className="text-xs text-tertiary mb-1">Access Count</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-lg font-semibold text-secondary">
                    {memory.accessCount}
                  </span>
                  <span className="text-xs text-tertiary">times</span>
                </div>
              </div>
            )}
            {memory.createdAt && (
              <div className="p-3 rounded-lg bg-obsidian/30 border border-slate/20">
                <div className="text-xs text-tertiary mb-1">Created</div>
                <div className="text-sm text-secondary">{memory.createdAt}</div>
              </div>
            )}
            <div className="p-3 rounded-lg bg-obsidian/30 border border-slate/20">
              <div className="text-xs text-tertiary mb-1">ID</div>
              <div className="font-mono text-xs text-tertiary truncate">{memory.id}</div>
            </div>
          </div>
        </section>

        {/* Links */}
        {memory.links && memory.links.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono tracking-widest text-tertiary uppercase">
                Connections ({memory.links.length})
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-slate to-transparent" />
            </div>
            <div className="space-y-1.5">
              {memory.links.map((link, index) => {
                const linkConfig = LINK_CONFIG[link.type] || LINK_CONFIG.related_to;
                return (
                  <button
                    key={index}
                    onClick={() => onLinkClick?.(link.targetId)}
                    className="w-full group flex items-center gap-3 p-3 rounded-xl bg-obsidian/20 border border-transparent hover:border-slate/40 hover:bg-obsidian/50 transition-all duration-200 text-left"
                  >
                    {/* Link type indicator */}
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-transform duration-200 group-hover:scale-110"
                      style={{
                        background: `${linkConfig.color}15`,
                        color: linkConfig.color,
                      }}
                    >
                      {linkConfig.icon}
                    </div>

                    {/* Link info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-tertiary mb-0.5">{linkConfig.label}</div>
                      <div className="text-sm text-secondary truncate group-hover:text-primary transition-colors">
                        &ldquo;{link.targetTitle}&rdquo;
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <svg
                      className="w-4 h-4 text-tertiary group-hover:text-primary group-hover:translate-x-1 transition-all duration-200"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Actions */}
        <section className="pt-2">
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-obsidian border border-slate/30 text-sm text-secondary hover:text-primary hover:border-slate/60 transition-all">
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="10" height="10" rx="2" />
                <path d="M6 6h4M6 8h2" strokeLinecap="round" />
              </svg>
              <span>Edit</span>
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-obsidian border border-slate/30 text-sm text-secondary hover:text-primary hover:border-slate/60 transition-all">
              <svg
                className="w-4 h-4"
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
              <span>Link</span>
            </button>
            <button className="flex items-center justify-center w-10 rounded-lg bg-obsidian border border-slate/30 text-tertiary hover:text-signal-error hover:border-signal-error/30 transition-all">
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default MemoryDetail;
