import { useEffect, type ReactNode } from "react";
import type { ConstellationStateReturn } from "./useConstellationState";

interface ConstellationLayoutProps {
  state: ConstellationStateReturn;
  modeRail: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  outputStream: ReactNode;
  header?: ReactNode;
}

/**
 * Full-bleed layout orchestrator for the Workcell Constellation view.
 *
 * Structure:
 * ┌─────────┬──────────────────────────────┬─────────────┐
 * │         │                              │             │
 * │  Mode   │      Canvas (full-bleed)     │  Inspector  │
 * │  Rail   │                              │   Drawer    │
 * │  64px   │                              │   320px     │
 * │         │                              │             │
 * ├─────────┴──────────────────────────────┴─────────────┤
 * │                  Output Stream Dock                   │
 * │                     (collapsible)                     │
 * └──────────────────────────────────────────────────────┘
 */
export function ConstellationLayout({
  state,
  modeRail,
  canvas,
  inspector,
  outputStream,
  header,
}: ConstellationLayoutProps) {
  const escape = state.escape;

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        escape();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [escape]);

  return (
    <div className="constellation-layout">
      {/* Full-bleed canvas background */}
      <div className="constellation-canvas-layer">{canvas}</div>

      {/* UI overlay layer */}
      <div className="constellation-ui-layer">
        {/* Optional header (for status/actions) */}
        {header && <div className="constellation-header">{header}</div>}

        {/* Main content area */}
        <div className="constellation-main">
          {/* Left: Mode Rail */}
          <div className="constellation-rail">{modeRail}</div>

          {/* Center: Spacer (canvas shows through) */}
          <div className="constellation-center" />

          {/* Right: Inspector Drawer */}
          <div className={`constellation-inspector ${state.inspectorOpen ? "open" : "closed"}`}>
            {inspector}
          </div>
        </div>

        {/* Bottom: Output Stream Dock */}
        <div className="constellation-output">{outputStream}</div>
      </div>
    </div>
  );
}
