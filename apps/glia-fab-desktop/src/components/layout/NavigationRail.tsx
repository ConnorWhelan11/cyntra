import React from "react";
import type { Nav } from "@/types";
import { NavTile, type NavStatus } from "@/components/shared/NavTile";
import type { SigilName } from "@/components/shared/sigils";

interface NavItem {
  id: Nav;
  sigil: SigilName;
  label: string;
}

interface NavigationRailProps {
  /** Current active navigation */
  activeNav: Nav;
  /** Navigation change handler */
  onNavChange: (nav: Nav) => void;
  /** Status indicators for nav items (new system) */
  statuses?: Partial<Record<Nav, NavStatus>>;
  /** Badge indicators for nav items (legacy, converts to attention status) */
  badges?: Partial<Record<Nav, boolean>>;
  /** Whether expanded labels mode is enabled */
  expanded?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "universe", sigil: "cosmograph", label: "Universe" },
  { id: "kernel", sigil: "hexcore", label: "Kernel" },
  { id: "evolution", sigil: "helix", label: "Evolution" },
  { id: "memory", sigil: "neuron", label: "Memory" },
  { id: "terminals", sigil: "prompt", label: "Terminals" },
  { id: "gallery", sigil: "aperture", label: "Gallery" },
  { id: "stage", sigil: "stage", label: "Stage" },
  { id: "gameplay", sigil: "gameplay", label: "Gameplay" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "projects", sigil: "cog", label: "Projects" },
];

export function NavigationRail({
  activeNav,
  onNavChange,
  statuses = {},
  badges = {},
  expanded = false,
}: NavigationRailProps) {
  // Merge badges into statuses (legacy badge = attention status)
  const getStatus = (id: Nav): NavStatus => {
    if (statuses[id]) return statuses[id];
    if (badges[id]) return "attention";
    return null;
  };
  return (
    <nav
      className={`nav-rail ${expanded ? "nav-rail--expanded" : ""}`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Main navigation items */}
      <div className="nav-rail-group">
        {NAV_ITEMS.map((item) => (
          <NavTile
            key={item.id}
            sigil={item.sigil}
            label={item.label}
            active={activeNav === item.id}
            status={getStatus(item.id)}
            onClick={() => onNavChange(item.id)}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="nav-rail-spacer" />

      {/* Bottom items */}
      <div className="nav-rail-group">
        {BOTTOM_ITEMS.map((item) => (
          <NavTile
            key={item.id}
            sigil={item.sigil}
            label={item.label}
            active={activeNav === item.id}
            status={getStatus(item.id)}
            onClick={() => onNavChange(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}

export default NavigationRail;
