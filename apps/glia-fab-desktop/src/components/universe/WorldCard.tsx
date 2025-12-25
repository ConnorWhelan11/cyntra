import React from "react";
import type { WorldInfo } from "@/types";

interface WorldCardProps {
  world: WorldInfo;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function WorldCard({
  world,
  selected = false,
  onClick,
  onDoubleClick,
}: WorldCardProps) {
  const isBuilding = world.status === "building";

  const getStatusIndicator = () => {
    switch (world.status) {
      case "building":
        return <span className="text-active">◉</span>;
      case "complete":
        return <span className="text-success">✓</span>;
      case "failed":
        return <span className="text-error">✗</span>;
      default:
        return <span className="text-tertiary">○</span>;
    }
  };

  return (
    <div
      className={`world-card card-selectable ${selected ? "selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="world-card-title">{world.name}</div>

      {isBuilding && world.progress !== undefined && (
        <div className="world-card-progress workcell-progress">
          <div
            className="world-card-progress-fill"
            style={{ width: `${world.progress}%` }}
          />
        </div>
      )}

      <div className="world-card-meta">
        <span className="flex items-center gap-1">
          {getStatusIndicator()}
          <span>{world.status}</span>
        </span>

        {world.generation !== undefined && (
          <span className="font-mono">gen:{world.generation}</span>
        )}

        {world.fitness !== undefined && (
          <span className="world-card-fitness">
            fit:{world.fitness.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

export default WorldCard;
