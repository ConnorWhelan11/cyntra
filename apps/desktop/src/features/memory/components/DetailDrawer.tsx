import React, { useState } from "react";
import { useMemoryAtlasContext } from "../hooks/useMemoryAtlas";
import type { MemoryItem } from "@/types";

const TYPE_CONFIG: Record<string, { color: string; icon: string; label: string; desc: string }> = {
  pattern: {
    color: "var(--accent-primary)",
    icon: "◈",
    label: "Pattern",
    desc: "Learned behavior",
  },
  failure: { color: "var(--signal-error)", icon: "⚠", label: "Failure", desc: "Recorded error" },
  dynamic: {
    color: "var(--signal-active)",
    icon: "◎",
    label: "Dynamic",
    desc: "Evolving knowledge",
  },
  context: { color: "var(--signal-info)", icon: "◐", label: "Context", desc: "Static info" },
  playbook: {
    color: "var(--agent-opencode)",
    icon: "▤",
    label: "Playbook",
    desc: "Repair strategy",
  },
  frontier: {
    color: "var(--signal-success)",
    icon: "⟁",
    label: "Frontier",
    desc: "Promoted heuristic",
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

interface DetailDrawerProps {
  className?: string;
}

function MemoryListItem({
  memory,
  isSelected,
  onClick,
}: {
  memory: MemoryItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const typeConfig = TYPE_CONFIG[memory.type] || TYPE_CONFIG.pattern;

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
        transition-all duration-200
        ${
          isSelected
            ? "bg-accent-primary/10 border-l-2 border-accent-primary"
            : "hover:bg-white/5 border-l-2 border-transparent"
        }
      `}
    >
      <span style={{ color: typeConfig.color }}>{typeConfig.icon}</span>
      <span className="flex-1 text-sm text-secondary truncate">{memory.content}</span>
    </button>
  );
}

export function DetailDrawer({ className = "" }: DetailDrawerProps) {
  const { state, actions, selectedMemory, filteredMemories } = useMemoryAtlasContext();
  const { drawerState, listExpanded: _listExpanded } = state;
  const [activeSection, setActiveSection] = useState<"detail" | "list">("detail");

  const isOpen = drawerState !== "collapsed";
  const isExpanded = drawerState === "expanded";

  const drawerWidth = isExpanded ? 560 : 400;

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        actions.selectMemory(null);
      }
      if (e.key === "ArrowRight" && isOpen) {
        actions.selectNextMemory();
      }
      if (e.key === "ArrowLeft" && isOpen) {
        actions.selectPrevMemory();
      }
      if (e.key === " " && isOpen && !e.target) {
        e.preventDefault();
        actions.toggleDrawerExpanded();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, actions]);

  const typeConfig = selectedMemory
    ? TYPE_CONFIG[selectedMemory.type] || TYPE_CONFIG.pattern
    : null;
  const agentConfig = selectedMemory
    ? AGENT_CONFIG[selectedMemory.agent] || {
        color: "var(--text-tertiary)",
        label: selectedMemory.agent,
      }
    : null;

  return (
    <div
      className={`
        fixed top-0 right-0 h-full z-40
        glass-panel border-l border-white/10
        flex flex-col
        transition-all duration-300 ease-out
        ${isOpen ? "translate-x-0" : "translate-x-full"}
        ${className}
      `}
      style={{ width: drawerWidth }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex items-center bg-void/50 rounded-lg p-0.5">
            <button
              onClick={() => setActiveSection("detail")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeSection === "detail"
                  ? "bg-white/10 text-primary"
                  : "text-tertiary hover:text-secondary"
              }`}
            >
              Detail
            </button>
            <button
              onClick={() => setActiveSection("list")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeSection === "list"
                  ? "bg-white/10 text-primary"
                  : "text-tertiary hover:text-secondary"
              }`}
            >
              List ({filteredMemories.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Expand/collapse */}
          <button
            onClick={actions.toggleDrawerExpanded}
            className="w-7 h-7 rounded-md flex items-center justify-center text-tertiary hover:text-secondary hover:bg-white/5 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {isExpanded ? (
                <path d="M10 6l-4 4M6 6l4 4" strokeLinecap="round" />
              ) : (
                <path d="M6 6l4 4M10 6l-4 4" strokeLinecap="round" />
              )}
            </svg>
          </button>

          {/* Close */}
          <button
            onClick={() => actions.selectMemory(null)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-tertiary hover:text-secondary hover:bg-white/5 transition-colors"
            title="Close (Esc)"
          >
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeSection === "list" ? (
          /* List view */
          <div className="p-2 space-y-0.5">
            {filteredMemories.length === 0 ? (
              <div className="p-8 text-center text-tertiary text-sm">
                No memories match current filters
              </div>
            ) : (
              filteredMemories.map((memory) => (
                <MemoryListItem
                  key={memory.id}
                  memory={memory}
                  isSelected={memory.id === state.selectedMemoryId}
                  onClick={() => actions.selectMemory(memory.id)}
                />
              ))
            )}
          </div>
        ) : selectedMemory && typeConfig && agentConfig ? (
          /* Detail view */
          <div className="p-5 space-y-6">
            {/* Type header */}
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${typeConfig.color}25, ${typeConfig.color}08)`,
                  border: `1px solid ${typeConfig.color}40`,
                }}
              >
                <span className="text-xl" style={{ color: typeConfig.color }}>
                  {typeConfig.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-primary">{typeConfig.label}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full border"
                    style={{ borderColor: agentConfig.color, color: agentConfig.color }}
                  >
                    {agentConfig.label}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md ${
                      selectedMemory.scope === "collective"
                        ? "bg-signal-active/10 text-signal-active"
                        : "bg-slate/30 text-secondary"
                    }`}
                  >
                    {selectedMemory.scope}
                  </span>
                </div>
                <p className="text-xs text-tertiary mt-1">{typeConfig.desc}</p>
              </div>
            </div>

            {/* Content */}
            <div
              className="p-4 rounded-xl border relative"
              style={{
                background: `linear-gradient(135deg, var(--void) 0%, ${typeConfig.color}05 100%)`,
                borderColor: `${typeConfig.color}20`,
              }}
            >
              <p className="text-primary text-sm leading-relaxed">
                &ldquo;{selectedMemory.content}&rdquo;
              </p>
            </div>

            {/* Importance bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-tertiary uppercase tracking-wider">Importance</span>
                <span className="text-sm font-mono text-secondary">
                  {(selectedMemory.importance * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${selectedMemory.importance * 100}%`,
                    background: `linear-gradient(90deg, ${typeConfig.color}60, ${typeConfig.color})`,
                  }}
                />
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              {selectedMemory.sourceRun && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] text-tertiary uppercase tracking-wider mb-1">
                    Source
                  </div>
                  <div className="text-sm font-mono text-secondary">
                    Run #{selectedMemory.sourceRun}
                    {selectedMemory.sourceIssue && (
                      <span className="text-tertiary"> · #{selectedMemory.sourceIssue}</span>
                    )}
                  </div>
                </div>
              )}
              {selectedMemory.accessCount !== undefined && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] text-tertiary uppercase tracking-wider mb-1">
                    Accessed
                  </div>
                  <div className="text-sm text-secondary">
                    <span className="font-mono font-semibold">{selectedMemory.accessCount}</span>{" "}
                    times
                  </div>
                </div>
              )}
              {selectedMemory.createdAt && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] text-tertiary uppercase tracking-wider mb-1">
                    Created
                  </div>
                  <div className="text-sm text-secondary">{selectedMemory.createdAt}</div>
                </div>
              )}
              <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                <div className="text-[10px] text-tertiary uppercase tracking-wider mb-1">ID</div>
                <div className="text-xs font-mono text-tertiary truncate">{selectedMemory.id}</div>
              </div>
            </div>

            {/* Links */}
            {selectedMemory.links && selectedMemory.links.length > 0 && (
              <div>
                <div className="text-xs text-tertiary uppercase tracking-wider mb-3">
                  Connections ({selectedMemory.links.length})
                </div>
                <div className="space-y-2">
                  {selectedMemory.links.map((link, i) => {
                    const linkConfig = LINK_CONFIG[link.type] || LINK_CONFIG.related_to;
                    return (
                      <button
                        key={i}
                        onClick={() => actions.selectMemory(link.targetId)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all group text-left"
                      >
                        <span
                          className="w-7 h-7 rounded-md flex items-center justify-center text-lg"
                          style={{ background: `${linkConfig.color}15`, color: linkConfig.color }}
                        >
                          {linkConfig.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-tertiary uppercase tracking-wider">
                            {linkConfig.label}
                          </div>
                          <div className="text-sm text-secondary truncate group-hover:text-primary transition-colors">
                            &ldquo;{link.targetTitle}&rdquo;
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-tertiary group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 4l4 4-4 4" strokeLinecap="round" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white/5 border border-white/10 text-sm text-secondary hover:text-primary hover:bg-white/10 transition-all">
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
                Edit
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white/5 border border-white/10 text-sm text-secondary hover:text-primary hover:bg-white/10 transition-all">
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
                Link
              </button>
              <button className="w-10 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-tertiary hover:text-signal-error hover:border-signal-error/30 transition-all">
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
          </div>
        ) : (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <span className="text-2xl text-tertiary">◇</span>
            </div>
            <p className="text-secondary text-sm">Select a memory from the atlas</p>
            <p className="text-tertiary text-xs mt-1">or switch to List view</p>
          </div>
        )}
      </div>

      {/* Footer navigation */}
      {isOpen && selectedMemory && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <button
            onClick={actions.selectPrevMemory}
            className="flex items-center gap-2 text-sm text-tertiary hover:text-secondary transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M10 4l-4 4 4 4" strokeLinecap="round" />
            </svg>
            Previous
          </button>
          <span className="text-xs text-tertiary font-mono">
            {filteredMemories.findIndex((m) => m.id === selectedMemory.id) + 1} /{" "}
            {filteredMemories.length}
          </span>
          <button
            onClick={actions.selectNextMemory}
            className="flex items-center gap-2 text-sm text-tertiary hover:text-secondary transition-colors"
          >
            Next
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 4l4 4-4 4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default DetailDrawer;
