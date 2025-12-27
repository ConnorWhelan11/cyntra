import React from "react";
import type { Nav, ServerInfo, KernelSnapshot } from "@/types";
import { CommandBar } from "./CommandBar";
import { NavigationRail } from "./NavigationRail";
import { ContextStrip } from "./ContextStrip";
import { StatusBar } from "./StatusBar";

interface ContextItem {
  type: "issue" | "workcell" | "world" | "run" | "asset";
  id: string;
  title: string;
  status?: string;
  agent?: string | null;
  timestamp?: string;
}

interface MainLayoutProps {
  /** Current navigation */
  nav: Nav;
  /** Navigation change handler */
  onNavChange: (nav: Nav) => void;
  /** Server info */
  serverInfo?: ServerInfo | null;
  /** Kernel snapshot */
  kernelSnapshot?: KernelSnapshot | null;
  /** Active agent */
  activeAgent?: string | null;
  /** Current generation */
  generation?: number | null;
  /** Current fitness */
  fitness?: number | null;
  /** Kernel state */
  kernelState?: "idle" | "running" | "processing" | "error";
  /** Selected context item */
  selectedContext?: ContextItem | null;
  /** Context dismiss handler */
  onDismissContext?: () => void;
  /** Context actions */
  contextActions?: React.ReactNode;
  /** Navigation badges */
  navBadges?: Partial<Record<Nav, boolean>>;
  /** Command palette open handler */
  onOpenCommandPalette?: () => void;
  /** Main content */
  children: React.ReactNode;
}

export function MainLayout({
  nav,
  onNavChange,
  serverInfo,
  kernelSnapshot,
  activeAgent,
  generation,
  fitness,
  kernelState = "idle",
  selectedContext,
  onDismissContext,
  contextActions,
  navBadges,
  onOpenCommandPalette,
  children,
}: MainLayoutProps) {
  return (
    <div className="app-layout">
      {/* Command Bar - top */}
      <CommandBar
        activeAgent={activeAgent}
        generation={generation}
        kernelState={kernelState}
        kernelSnapshot={kernelSnapshot}
        onOpenCommandPalette={onOpenCommandPalette}
      />

      {/* Navigation Rail - left */}
      <NavigationRail activeNav={nav} onNavChange={onNavChange} badges={navBadges} />

      {/* Main Viewport */}
      <main className="main-viewport">
        {/* Main Content */}
        <div className="main-content">{children}</div>

        {/* Context Strip - bottom of viewport */}
        <ContextStrip
          selectedItem={selectedContext}
          onDismiss={onDismissContext}
          actions={contextActions}
        />
      </main>

      {/* Status Bar - bottom */}
      <StatusBar
        serverInfo={serverInfo}
        kernelSnapshot={kernelSnapshot}
        generation={generation}
        fitness={fitness}
      />
    </div>
  );
}

export default MainLayout;
