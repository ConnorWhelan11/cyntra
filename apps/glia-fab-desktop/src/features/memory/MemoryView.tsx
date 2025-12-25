import React, { useState, useMemo } from "react";
import type { ProjectInfo, MemoryItem } from "@/types";
import { MemoryFilters, MemoryList, MemoryDetail, MemoryGraph } from "@/components/memory";

type MemoryType = MemoryItem["type"];
type MemoryScope = "individual" | "collective" | "all";
type Agent = "claude" | "codex" | "opencode" | "crush";
type ViewMode = "list" | "graph";

interface MemoryViewProps {
  activeProject: ProjectInfo | null;
}

// Mock memory data - expanded with more connections for graph viz
const MOCK_MEMORIES: MemoryItem[] = [
  {
    id: "mem-001",
    type: "pattern",
    agent: "claude",
    scope: "collective",
    importance: 0.89,
    content: "When fixing auth bugs in FastAPI, check middleware order first. Common issue: token expiry handler runs after validation.",
    sourceRun: "89",
    sourceIssue: "38",
    accessCount: 12,
    createdAt: "3 days ago",
    links: [
      { type: "supersedes", targetId: "mem-old-1", targetTitle: "Check auth.py for token bugs" },
      { type: "instance_of", targetId: "mem-pat-1", targetTitle: "Middleware ordering patterns" },
    ],
  },
  {
    id: "mem-002",
    type: "failure",
    agent: "codex",
    scope: "individual",
    importance: 0.72,
    content: "pytest-asyncio fixtures cannot be used with regular pytest fixtures in the same test. Use @pytest.mark.asyncio decorator.",
    sourceRun: "76",
    sourceIssue: "31",
    accessCount: 5,
    createdAt: "1 week ago",
    links: [
      { type: "related_to", targetId: "mem-003", targetTitle: "FastAPI SQLAlchemy async usage" },
    ],
  },
  {
    id: "mem-003",
    type: "dynamic",
    agent: "claude",
    scope: "collective",
    importance: 0.65,
    content: "This codebase uses FastAPI with SQLAlchemy async. Database session should be obtained from request.state.db.",
    accessCount: 28,
    createdAt: "2 weeks ago",
    links: [
      { type: "instance_of", targetId: "mem-001", targetTitle: "FastAPI middleware patterns" },
    ],
  },
  {
    id: "mem-004",
    type: "pattern",
    agent: "opencode",
    scope: "individual",
    importance: 0.55,
    content: "Blender scripts should import bpy at the top level, not inside functions, to avoid module reloading issues.",
    sourceRun: "92",
    sourceIssue: "44",
    accessCount: 3,
    createdAt: "4 days ago",
  },
  {
    id: "mem-005",
    type: "context",
    agent: "crush",
    scope: "collective",
    importance: 0.78,
    content: "Project uses pnpm workspaces for monorepo management. Always run pnpm install from root directory.",
    accessCount: 15,
    createdAt: "1 day ago",
    links: [
      { type: "related_to", targetId: "mem-004", targetTitle: "Blender script patterns" },
    ],
  },
  {
    id: "mem-006",
    type: "failure",
    agent: "claude",
    scope: "individual",
    importance: 0.82,
    content: "React useState with objects: spread operator creates shallow copy only. Deep nested updates require immer or manual deep clone.",
    sourceRun: "95",
    sourceIssue: "47",
    accessCount: 8,
    createdAt: "2 days ago",
  },
];

export function MemoryView({ activeProject }: MemoryViewProps) {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState<MemoryType[]>([
    "pattern",
    "failure",
    "dynamic",
    "context",
    "playbook",
    "frontier",
  ]);
  const [selectedScope, setSelectedScope] = useState<MemoryScope>("all");
  const [selectedAgents, setSelectedAgents] = useState<Agent[]>(["claude", "codex", "opencode", "crush"]);
  const [importanceThreshold, setImportanceThreshold] = useState(0.3);

  // Selection state
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter memories
  const filteredMemories = useMemo(() => {
    return MOCK_MEMORIES.filter((m) => {
      // Type filter
      if (!selectedTypes.includes(m.type)) return false;

      // Scope filter
      if (selectedScope !== "all" && m.scope !== selectedScope) return false;

      // Agent filter
      if (!selectedAgents.includes(m.agent as Agent)) return false;

      // Importance filter
      if (m.importance < importanceThreshold) return false;

      // Search filter
      if (searchQuery && !m.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [selectedTypes, selectedScope, selectedAgents, importanceThreshold, searchQuery]);

  const selectedMemory = MOCK_MEMORIES.find((m) => m.id === selectedMemoryId) || null;

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          {/* Animated brain icon */}
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-primary/10 to-signal-active/10 border border-slate/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-accent-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 4C8 4 5 7 5 11c0 2 1 4 3 5v3a1 1 0 001 1h6a1 1 0 001-1v-3c2-1 3-3 3-5 0-4-3-7-7-7z" />
                <path d="M9 21v-1M15 21v-1M12 17v-3" strokeLinecap="round" />
              </svg>
            </div>
            {/* Orbiting particles */}
            <div className="absolute inset-0 animate-spin" style={{ animationDuration: "10s" }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent-primary/40" />
            </div>
            <div className="absolute inset-0 animate-spin" style={{ animationDuration: "15s", animationDirection: "reverse" }}>
              <div className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-signal-active/40" />
            </div>
          </div>
          <div>
            <p className="text-secondary text-base">Select a project to explore agent memory</p>
            <p className="text-tertiary text-sm mt-1">Memories are stored per-project</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-primary tracking-tight">
            MEMORY
          </h1>
          <span className="text-sm text-tertiary font-mono">
            {filteredMemories.length} / {MOCK_MEMORIES.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary pointer-events-none"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="7" cy="7" r="4" />
              <path d="M10 10l3 3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9 pr-4 py-2 bg-obsidian/50 border border-slate/30 rounded-lg text-sm text-primary placeholder-tertiary focus:outline-none focus:border-accent-primary/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center bg-obsidian/50 border border-slate/30 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "list"
                  ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/30"
                  : "text-tertiary hover:text-secondary border border-transparent"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4h10M3 8h10M3 12h10" strokeLinecap="round" />
              </svg>
              List
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "graph"
                  ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/30"
                  : "text-tertiary hover:text-secondary border border-transparent"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="4" cy="4" r="2" />
                <circle cx="12" cy="4" r="2" />
                <circle cx="8" cy="12" r="2" />
                <path d="M5.5 5.5l2.5 5M10.5 5.5l-2.5 5" strokeLinecap="round" />
              </svg>
              Graph
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Filters sidebar */}
        <aside className="col-span-3 mc-panel overflow-hidden flex flex-col">
          <div className="mc-panel-header">
            <span className="mc-panel-title">Filters</span>
            <button
              onClick={() => {
                setSelectedTypes(["pattern", "failure", "dynamic", "context"]);
                setSelectedScope("all");
                setSelectedAgents(["claude", "codex", "opencode", "crush"]);
                setImportanceThreshold(0);
              }}
              className="text-xs text-tertiary hover:text-secondary transition-colors"
            >
              Reset
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <MemoryFilters
              selectedTypes={selectedTypes}
              onTypesChange={setSelectedTypes}
              selectedScope={selectedScope}
              onScopeChange={setSelectedScope}
              selectedAgents={selectedAgents}
              onAgentsChange={setSelectedAgents}
              importanceThreshold={importanceThreshold}
              onImportanceChange={setImportanceThreshold}
            />
          </div>
        </aside>

        {/* Memory list/graph */}
        <main className="col-span-5 mc-panel flex flex-col min-h-0 overflow-hidden">
          <div className="mc-panel-header">
            <span className="mc-panel-title">
              {viewMode === "graph" ? "Memory Graph" : "Memory List"} ({filteredMemories.length})
            </span>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {viewMode === "list" ? (
              <MemoryList
                memories={filteredMemories}
                selectedId={selectedMemoryId}
                onSelect={(m) => setSelectedMemoryId(m.id)}
              />
            ) : (
              <MemoryGraph
                memories={filteredMemories}
                selectedId={selectedMemoryId}
                onSelect={(m) => setSelectedMemoryId(m.id)}
              />
            )}
          </div>
        </main>

        {/* Selected memory detail */}
        <aside className="col-span-4 mc-panel flex flex-col min-h-0 overflow-hidden">
          <div className="mc-panel-header">
            <span className="mc-panel-title">
              {selectedMemory ? "Memory Detail" : "Select Memory"}
            </span>
            {selectedMemory && (
              <button
                onClick={() => setSelectedMemoryId(null)}
                className="text-tertiary hover:text-secondary transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <MemoryDetail
              memory={selectedMemory}
              onLinkClick={(targetId) => setSelectedMemoryId(targetId)}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default MemoryView;
