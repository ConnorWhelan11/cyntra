"use client";

import { useState, useCallback, ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { RichDocEditor, RichDocEditorProps } from "../../doc-editor/RichDocEditor";
import { DrawboardLayout, DrawboardLayoutProps } from "../../ai-drawboard/DrawboardLayout";
import { Block } from "@blocknote/core";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceLayoutMode = "split" | "tabbed" | "focus";
export type WorkspaceFocusPanel = "drawboard" | "notes" | "comms";

export interface LectureWorkspaceLayoutProps {
  /** Unique lecture identifier */
  lectureId: string;

  /** Collaboration room ID (for Yjs/Liveblocks) */
  roomId?: string;

  /** Lecture title displayed in header */
  lectureTitle?: string;

  /** Current lecture timestamp in seconds */
  currentTimestamp?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // Panel visibility
  // ─────────────────────────────────────────────────────────────────────────

  /** Show drawboard panel */
  showDrawboard?: boolean;

  /** Show notes panel */
  showNotes?: boolean;

  /** Show comms/chat panel */
  showComms?: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Layout configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Layout mode: split (side-by-side), tabbed, or focus (one panel maximized) */
  layout?: WorkspaceLayoutMode;

  /** Which panel to focus when in focus mode */
  focusPanel?: WorkspaceFocusPanel;

  /** Callback when layout changes */
  onLayoutChange?: (layout: WorkspaceLayoutMode, focusPanel?: WorkspaceFocusPanel) => void;

  // ─────────────────────────────────────────────────────────────────────────
  // Panel props passthrough
  // ─────────────────────────────────────────────────────────────────────────

  /** Props for the notes editor */
  notesProps?: Partial<RichDocEditorProps>;

  /** Props for the drawboard */
  drawboardProps?: Partial<DrawboardLayoutProps>;

  /** Content/component for comms panel (chat, voice indicators, etc.) */
  commsContent?: ReactNode;

  // ─────────────────────────────────────────────────────────────────────────
  // Callbacks
  // ─────────────────────────────────────────────────────────────────────────

  /** Called when notes content changes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNotesChange?: (content: Block<any, any, any>[]) => void;

  /** Called when drawboard XML changes */
  onDrawboardChange?: (xml: string) => void;

  /** Custom class name */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Controls Component
// ─────────────────────────────────────────────────────────────────────────────

interface LayoutControlsProps {
  layout: WorkspaceLayoutMode;
  focusPanel?: WorkspaceFocusPanel;
  showDrawboard: boolean;
  showNotes: boolean;
  showComms: boolean;
  onLayoutChange: (layout: WorkspaceLayoutMode, focusPanel?: WorkspaceFocusPanel) => void;
  onTogglePanel: (panel: WorkspaceFocusPanel) => void;
}

function LayoutControls({
  layout,
  focusPanel,
  showDrawboard,
  showNotes,
  showComms,
  onLayoutChange,
  onTogglePanel,
}: LayoutControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Layout mode buttons */}
      <div className="flex rounded-lg border border-border/40 bg-background/50 p-0.5">
        <button
          onClick={() => onLayoutChange("split")}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors",
            layout === "split"
              ? "bg-cyan-neon/20 text-cyan-neon"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Split
        </button>
        <button
          onClick={() => onLayoutChange("tabbed")}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors",
            layout === "tabbed"
              ? "bg-cyan-neon/20 text-cyan-neon"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Tabs
        </button>
        <button
          onClick={() => onLayoutChange("focus", focusPanel || "notes")}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors",
            layout === "focus"
              ? "bg-cyan-neon/20 text-cyan-neon"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Focus
        </button>
      </div>

      {/* Panel toggles */}
      <div className="flex gap-1 border-l border-border/40 pl-2">
        <button
          onClick={() => onTogglePanel("drawboard")}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            showDrawboard
              ? "bg-purple-500/20 text-purple-400"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Toggle Drawboard"
        >
          🎨
        </button>
        <button
          onClick={() => onTogglePanel("notes")}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            showNotes
              ? "bg-cyan-neon/20 text-cyan-neon"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Toggle Notes"
        >
          📝
        </button>
        <button
          onClick={() => onTogglePanel("comms")}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            showComms
              ? "bg-green-500/20 text-green-400"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          title="Toggle Comms"
        >
          💬
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Bar for Tabbed Layout
// ─────────────────────────────────────────────────────────────────────────────

interface TabBarProps {
  activeTab: WorkspaceFocusPanel;
  showDrawboard: boolean;
  showNotes: boolean;
  showComms: boolean;
  onTabChange: (tab: WorkspaceFocusPanel) => void;
}

function TabBar({ activeTab, showDrawboard, showNotes, showComms, onTabChange }: TabBarProps) {
  const tabs: { id: WorkspaceFocusPanel; label: string; icon: string; show: boolean }[] = [
    { id: "drawboard", label: "Drawboard", icon: "🎨", show: showDrawboard },
    { id: "notes", label: "Notes", icon: "📝", show: showNotes },
    { id: "comms", label: "Comms", icon: "💬", show: showComms },
  ];

  return (
    <div className="flex gap-1 border-b border-border/40 pb-2">
      {tabs
        .filter((t) => t.show)
        .map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-cyan-neon bg-card/80 text-foreground"
                : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
            )}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comms Panel Placeholder
// ─────────────────────────────────────────────────────────────────────────────

function CommsPanel({ children }: { children?: ReactNode }) {
  if (children) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-border/40 bg-card/60 p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Comms</h3>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/60">
        <span className="text-3xl">💬</span>
        <p className="text-center text-xs">
          Chat and voice comms will appear here.
          <br />
          Connect via Rivet + LiveKit.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LectureWorkspaceLayout - A composite layout for lecture sessions.
 *
 * Combines:
 * - BlockNote notes editor (for collaborative note-taking)
 * - Drawboard canvas (for diagrams and visual explanations)
 * - Comms panel (for chat and voice via Rivet/LiveKit)
 *
 * Supports multiple layout modes:
 * - Split: Side-by-side panels
 * - Tabbed: Switch between panels
 * - Focus: One panel maximized with others minimized
 *
 * @example
 * <LectureWorkspaceLayout
 *   lectureId="lecture-123"
 *   lectureTitle="Cardiac Physiology"
 *   showDrawboard
 *   showNotes
 *   showComms
 *   onNotesChange={(content) => saveNotes(content)}
 * />
 */
export function LectureWorkspaceLayout({
  roomId,
  lectureTitle,
  currentTimestamp,
  showDrawboard: initialShowDrawboard = true,
  showNotes: initialShowNotes = true,
  showComms: initialShowComms = false,
  layout: initialLayout = "split",
  focusPanel: initialFocusPanel = "notes",
  onLayoutChange,
  notesProps,
  drawboardProps,
  commsContent,
  onNotesChange,
  onDrawboardChange,
  className,
}: LectureWorkspaceLayoutProps) {
  // Internal state
  const [layout, setLayout] = useState<WorkspaceLayoutMode>(initialLayout);
  const [focusPanel, setFocusPanel] = useState<WorkspaceFocusPanel>(initialFocusPanel);
  const [activeTab, setActiveTab] = useState<WorkspaceFocusPanel>(initialFocusPanel);
  const [showDrawboard, setShowDrawboard] = useState(initialShowDrawboard);
  const [showNotes, setShowNotes] = useState(initialShowNotes);
  const [showComms, setShowComms] = useState(initialShowComms);

  // Handlers
  const handleLayoutChange = useCallback(
    (newLayout: WorkspaceLayoutMode, newFocusPanel?: WorkspaceFocusPanel) => {
      setLayout(newLayout);
      if (newFocusPanel) {
        setFocusPanel(newFocusPanel);
        setActiveTab(newFocusPanel);
      }
      onLayoutChange?.(newLayout, newFocusPanel);
    },
    [onLayoutChange]
  );

  const handleTogglePanel = useCallback((panel: WorkspaceFocusPanel) => {
    switch (panel) {
      case "drawboard":
        setShowDrawboard((p) => !p);
        break;
      case "notes":
        setShowNotes((p) => !p);
        break;
      case "comms":
        setShowComms((p) => !p);
        break;
    }
  }, []);

  const handleTabChange = useCallback((tab: WorkspaceFocusPanel) => {
    setActiveTab(tab);
    setFocusPanel(tab);
  }, []);

  // Format timestamp
  const formatTimestamp = (seconds?: number) => {
    if (seconds == null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Count visible panels
  const visiblePanelCount = [showDrawboard, showNotes, showComms].filter(Boolean).length;

  return (
    <div className={cn("lecture-workspace flex h-full flex-col gap-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {lectureTitle && (
            <h1 className="text-lg font-semibold text-foreground">{lectureTitle}</h1>
          )}
          {currentTimestamp != null && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-mono text-red-400">
              🔴 {formatTimestamp(currentTimestamp)}
            </span>
          )}
          {roomId && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Collaborative
            </span>
          )}
        </div>

        <LayoutControls
          layout={layout}
          focusPanel={focusPanel}
          showDrawboard={showDrawboard}
          showNotes={showNotes}
          showComms={showComms}
          onLayoutChange={handleLayoutChange}
          onTogglePanel={handleTogglePanel}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0">
        {/* Tabbed Layout */}
        {layout === "tabbed" && (
          <div className="flex h-full flex-col">
            <TabBar
              activeTab={activeTab}
              showDrawboard={showDrawboard}
              showNotes={showNotes}
              showComms={showComms}
              onTabChange={handleTabChange}
            />
            <div className="flex-1 min-h-0 pt-3">
              {activeTab === "drawboard" && showDrawboard && (
                <DrawboardLayout
                  mode="lecture"
                  showSidebar={false}
                  {...drawboardProps}
                  canvasProps={{
                    ...drawboardProps?.canvasProps,
                    onXmlChange: onDrawboardChange,
                  }}
                />
              )}
              {activeTab === "notes" && showNotes && (
                <div className="h-full">
                  <RichDocEditor
                    theme="dark"
                    {...notesProps}
                    onChange={onNotesChange}
                    className="h-full"
                  />
                </div>
              )}
              {activeTab === "comms" && showComms && <CommsPanel>{commsContent}</CommsPanel>}
            </div>
          </div>
        )}

        {/* Split Layout */}
        {layout === "split" && (
          <div className="flex h-full gap-3">
            {showDrawboard && (
              <div className={cn("min-h-0", visiblePanelCount === 1 ? "flex-1" : "flex-1")}>
                <DrawboardLayout
                  mode="lecture"
                  showSidebar={false}
                  {...drawboardProps}
                  canvasProps={{
                    ...drawboardProps?.canvasProps,
                    onXmlChange: onDrawboardChange,
                  }}
                />
              </div>
            )}
            {showNotes && (
              <div className={cn("min-h-0", visiblePanelCount === 1 ? "flex-1" : "flex-1")}>
                <RichDocEditor
                  theme="dark"
                  {...notesProps}
                  onChange={onNotesChange}
                  className="h-full"
                />
              </div>
            )}
            {showComms && (
              <div className={cn("min-h-0", visiblePanelCount <= 2 ? "w-80" : "w-64")}>
                <CommsPanel>{commsContent}</CommsPanel>
              </div>
            )}
          </div>
        )}

        {/* Focus Layout */}
        {layout === "focus" && (
          <div className="flex h-full gap-2">
            {/* Main focused panel */}
            <div className="flex-1 min-h-0">
              {focusPanel === "drawboard" && showDrawboard && (
                <DrawboardLayout
                  mode="lecture"
                  showSidebar={false}
                  {...drawboardProps}
                  canvasProps={{
                    ...drawboardProps?.canvasProps,
                    onXmlChange: onDrawboardChange,
                  }}
                />
              )}
              {focusPanel === "notes" && showNotes && (
                <RichDocEditor
                  theme="dark"
                  {...notesProps}
                  onChange={onNotesChange}
                  className="h-full"
                />
              )}
              {focusPanel === "comms" && showComms && <CommsPanel>{commsContent}</CommsPanel>}
            </div>

            {/* Minimized panels rail */}
            <div className="flex w-16 flex-col gap-2">
              {showDrawboard && focusPanel !== "drawboard" && (
                <button
                  onClick={() => handleLayoutChange("focus", "drawboard")}
                  className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-border/40 bg-card/60 text-muted-foreground transition-colors hover:border-purple-500/40 hover:text-purple-400"
                >
                  <span className="text-lg">🎨</span>
                  <span className="text-[10px]">Draw</span>
                </button>
              )}
              {showNotes && focusPanel !== "notes" && (
                <button
                  onClick={() => handleLayoutChange("focus", "notes")}
                  className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-border/40 bg-card/60 text-muted-foreground transition-colors hover:border-cyan-neon/40 hover:text-cyan-neon"
                >
                  <span className="text-lg">📝</span>
                  <span className="text-[10px]">Notes</span>
                </button>
              )}
              {showComms && focusPanel !== "comms" && (
                <button
                  onClick={() => handleLayoutChange("focus", "comms")}
                  className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-border/40 bg-card/60 text-muted-foreground transition-colors hover:border-green-500/40 hover:text-green-400"
                >
                  <span className="text-lg">💬</span>
                  <span className="text-[10px]">Comms</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
