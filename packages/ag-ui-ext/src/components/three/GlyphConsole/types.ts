import type { RefObject } from "react";

export interface GlyphConsole3DProps {
  phase?: number; // injected by SceneRig
  htmlPortal?: RefObject<HTMLDivElement>; // injected by SceneRig

  todaySummary: {
    actIndex: number; // 0–3
    actCount: number; // total acts, usually 4
    nowLabel: string; // "Now: Hyperfocus Lab – Orgo"
    nextLabel?: string; // "Next: MCAT review block @ 8pm"
    leakMinutesToday?: number;
    completedBlocks?: number;
    plannedBlocks?: number;
  };

  constellationNodes: Array<{
    id: string;
    label: string;
    kind: "mission" | "leak" | "comms" | "broadcast" | "other";
    importance?: number; // 0–1, affects size/glow
    hasUnread?: boolean;
  }>;

  glyphState: "idle" | "listening" | "thinking" | "responding" | "error";
  isTyping: boolean;

  recentExchanges: Array<{
    id: string;
    role: "user" | "glyph";
    text: string;
  }>;

  // Callbacks
  onPromptSubmit: (text: string) => void;
  onNodeClick?: (id: string) => void; // constellation node
  onTodayClick?: () => void; // optional: open Today view
}
