import React from "react";
import type { WorldInfo } from "@/types";
import { WorldCard } from "./WorldCard";

interface WorldListProps {
  worlds: WorldInfo[];
  selectedWorldId?: string | null;
  onWorldSelect?: (world: WorldInfo) => void;
  onWorldOpen?: (world: WorldInfo) => void;
  onCreateNew?: () => void;
}

export function WorldList({
  worlds,
  selectedWorldId,
  onWorldSelect,
  onWorldOpen,
  onCreateNew,
}: WorldListProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {worlds.map((world) => (
        <WorldCard
          key={world.id}
          world={world}
          selected={selectedWorldId === world.id}
          onClick={() => onWorldSelect?.(world)}
          onDoubleClick={() => onWorldOpen?.(world)}
        />
      ))}

      {/* New World Card */}
      {onCreateNew && (
        <div
          className="world-card flex items-center justify-center cursor-pointer hover:border-accent-dim"
          onClick={onCreateNew}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onCreateNew();
            }
          }}
        >
          <div className="text-center">
            <div className="text-2xl text-tertiary mb-2">+</div>
            <div className="text-sm text-tertiary">NEW WORLD</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorldList;
