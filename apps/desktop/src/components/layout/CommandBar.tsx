import React from "react";
import type { KernelSnapshot } from "@/types";

interface CommandBarProps {
  /** Current active agent/toolchain */
  activeAgent?: string | null;
  /** Current generation number */
  generation?: number | null;
  /** Kernel state */
  kernelState?: "idle" | "running" | "processing" | "error";
  /** Kernel snapshot for status info */
  kernelSnapshot?: KernelSnapshot | null;
  /** Callback when command palette should open */
  onOpenCommandPalette?: () => void;
}

export function CommandBar({
  activeAgent,
  generation,
  kernelState = "idle",
  kernelSnapshot,
  onOpenCommandPalette,
}: CommandBarProps) {
  // Kernel status glyph based on state
  const getKernelGlyph = () => {
    switch (kernelState) {
      case "running":
        return { icon: "\u25C9", className: "glyph-running text-active" }; // ◉
      case "processing":
        return { icon: "\u25C8", className: "glyph-processing text-active" }; // ◈
      case "error":
        return { icon: "\u26A0", className: "glyph-error text-error" }; // ⚠
      default:
        return { icon: "\u25CB", className: "glyph-idle text-tertiary" }; // ○
    }
  };

  const glyph = getKernelGlyph();

  const workcellCount = kernelSnapshot?.workcells?.length ?? 0;
  // Active workcells are those without a terminal proofStatus (passed/failed)
  const activeWorkcells =
    kernelSnapshot?.workcells?.filter(
      (w) => w.proofStatus && !["passed", "failed"].includes(w.proofStatus)
    )?.length ?? 0;

  return (
    <header className="command-bar">
      <div className="command-bar-left">
        {/* Logo */}
        <div className="command-bar-logo">
          <div className="command-bar-logo-glyph">◈</div>
          <span>CYNTRA</span>
        </div>
      </div>

      {/* Search / Command Palette Trigger */}
      <button className="command-bar-search" onClick={onOpenCommandPalette} type="button">
        <span>⌘K</span>
        <span>Search & Command...</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="command-bar-right">
        {/* Active agent indicator */}
        {activeAgent && (
          <div className="command-bar-indicator">
            <span
              className={`agent-indicator-dot ${activeAgent}`}
              style={{ width: 8, height: 8 }}
            />
            <span>{activeAgent}</span>
          </div>
        )}

        {/* Generation counter */}
        {generation !== null && generation !== undefined && (
          <div className="command-bar-indicator font-mono">gen:{generation}</div>
        )}

        {/* Workcell count */}
        {workcellCount > 0 && (
          <div className="command-bar-indicator font-mono">
            {activeWorkcells}/{workcellCount} workcells
          </div>
        )}

        {/* Kernel status glyph */}
        <div className={`kernel-glyph ${glyph.className}`} title={`Kernel: ${kernelState}`}>
          {glyph.icon}
        </div>
      </div>
    </header>
  );
}

export default CommandBar;
