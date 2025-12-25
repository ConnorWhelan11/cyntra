import { memo, type ReactNode } from "react";

interface StageLayoutProps {
  sidebar: ReactNode;
  gameFrame: ReactNode;
  console: ReactNode;
  consoleOpen: boolean;
  rightPanel?: ReactNode;
}

/**
 * StageLayout - Grid layout for Stage view
 *
 * Structure:
 * ┌──────────────┬────────────────────────────┬──────────────┐
 * │              │       Game Frame            │              │
 * │   Sidebar    │       (flexible)            │  Right Panel │
 * │   (260px)    ├────────────────────────────┤  (optional)  │
 * │              │   Console (collapsible)     │              │
 * └──────────────┴────────────────────────────┴──────────────┘
 */
export const StageLayout = memo(function StageLayout({
  sidebar,
  gameFrame,
  console,
  consoleOpen,
  rightPanel,
}: StageLayoutProps) {
  const hasRightPanel = !!rightPanel;

  return (
    <div className={`stage-layout ${consoleOpen ? "console-open" : ""} ${hasRightPanel ? "has-right-panel" : ""}`}>
      <aside className="stage-layout-sidebar">{sidebar}</aside>
      <div className="stage-layout-main">
        <div className="stage-layout-game">{gameFrame}</div>
        <div className={`stage-layout-console ${consoleOpen ? "open" : ""}`}>
          {console}
        </div>
      </div>
      {hasRightPanel && (
        <aside className="stage-layout-right">{rightPanel}</aside>
      )}
    </div>
  );
});

export default StageLayout;
