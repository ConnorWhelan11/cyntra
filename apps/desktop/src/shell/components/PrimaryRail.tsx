/**
 * PrimaryRail - Icon-only app navigation sidebar
 */
import React from "react";
import { NavTile } from "@/components/shared/NavTile";
import type { AppPlugin } from "../plugins/types";

export interface PrimaryRailProps {
  plugins: AppPlugin[];
  activeAppId: string | null;
  onSelectApp: (appId: string) => void;
}

export function PrimaryRail({ plugins, activeAppId, onSelectApp }: PrimaryRailProps) {
  return (
    <aside className="primary-rail" role="navigation" aria-label="App navigation">
      <div className="primary-rail-inner">
        {plugins.map((plugin) => (
          <NavTile
            key={plugin.id}
            sigil={plugin.sigil}
            label={plugin.name}
            active={activeAppId === plugin.id}
            onClick={() => onSelectApp(plugin.id)}
          />
        ))}
      </div>
    </aside>
  );
}
