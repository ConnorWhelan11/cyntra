import { memo } from "react";
import type { StageWorld } from "@/types/ui";

interface WorldSelectorProps {
  worlds: StageWorld[];
  selectedWorldId: string | null;
  onSelect: (id: string) => void;
}

function getStatusIcon(world: StageWorld): string {
  if (world.status === "building") return "⏳";
  if (world.status === "failed") return "✖";
  if (world.hasGameBuild) return "▶";
  if (world.status === "complete") return "✔";
  return "○";
}

function getStatusClass(world: StageWorld): string {
  if (world.status === "building") return "status-building";
  if (world.status === "failed") return "status-failed";
  if (world.hasGameBuild) return "status-ready";
  if (world.status === "complete") return "status-complete";
  return "status-idle";
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * WorldSelector - List of available worlds for playtesting
 */
export const WorldSelector = memo(function WorldSelector({
  worlds,
  selectedWorldId,
  onSelect,
}: WorldSelectorProps) {
  const godotWorlds = worlds.filter((w) => w.runtime === "godot");
  const otherWorlds = worlds.filter((w) => w.runtime !== "godot");

  return (
    <div className="world-selector">
      <div className="world-selector-header">
        <h3 className="world-selector-title">Worlds</h3>
        <span className="world-selector-count">
          {godotWorlds.filter((w) => w.hasGameBuild).length} ready
        </span>
      </div>

      {godotWorlds.length === 0 ? (
        <div className="world-selector-empty">
          No Godot worlds found.
          <br />
          Create a world with runtime: godot.
        </div>
      ) : (
        <div className="world-list">
          {godotWorlds.map((world) => (
            <button
              key={world.id}
              className={`world-item ${selectedWorldId === world.id ? "selected" : ""} ${getStatusClass(world)}`}
              onClick={() => onSelect(world.id)}
              disabled={!world.hasGameBuild}
              title={world.hasGameBuild ? `Play ${world.name}` : "No game build available"}
            >
              <span className="world-item-icon">{getStatusIcon(world)}</span>
              <div className="world-item-info">
                <span className="world-item-name">{world.name}</span>
                <span className="world-item-meta">
                  {world.generation !== undefined && `Gen ${world.generation}`}
                  {world.fitness !== undefined && ` · ${Math.round(world.fitness * 100)}%`}
                  {" · "}
                  {formatTime(world.updatedAt)}
                </span>
              </div>
              {world.status === "building" && <span className="world-item-badge">Building</span>}
            </button>
          ))}
        </div>
      )}

      {otherWorlds.length > 0 && (
        <>
          <div className="world-selector-divider" />
          <div className="world-selector-section">
            <span className="world-selector-section-title">Other Runtimes</span>
            <div className="world-list world-list-muted">
              {otherWorlds.map((world) => (
                <div key={world.id} className="world-item disabled">
                  <span className="world-item-icon">○</span>
                  <div className="world-item-info">
                    <span className="world-item-name">{world.name}</span>
                    <span className="world-item-meta">{world.runtime}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default WorldSelector;
