import React, { useState } from "react";
import type { ProjectInfo, WorldInfo } from "@/types";
import { WorldCard, WorldList } from "@/components/universe";

interface UniverseViewProps {
  projects: ProjectInfo[];
  activeProject: ProjectInfo | null;
  onProjectSelect?: (project: ProjectInfo) => void;
  onWorldSelect?: (world: WorldInfo) => void;
  onWorldOpen?: (world: WorldInfo) => void;
  onCreateWorld?: () => void;
}

// Mock worlds data - in real implementation, this would come from the backend
function getWorldsForProject(project: ProjectInfo | null): WorldInfo[] {
  if (!project) return [];

  // Generate mock worlds based on project structure
  const worlds: WorldInfo[] = [];

  if (project.viewer_dir) {
    worlds.push({
      id: "outora-library",
      name: "Outora Library",
      status: "building",
      generation: 42,
      fitness: 0.87,
      progress: 65,
    });
  }

  // Add more mock worlds
  worlds.push({
    id: "car-config",
    name: "Car Config",
    status: "complete",
    generation: 12,
    fitness: 0.94,
  });

  return worlds;
}

export function UniverseView({
  projects: _projects,
  activeProject,
  onProjectSelect: _onProjectSelect,
  onWorldSelect,
  onWorldOpen,
  onCreateWorld,
}: UniverseViewProps) {
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const worlds = getWorldsForProject(activeProject);

  const handleWorldSelect = (world: WorldInfo) => {
    setSelectedWorldId(world.id);
    onWorldSelect?.(world);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-primary tracking-tight">
            CYNTRA UNIVERSE
          </h1>
          <p className="text-sm text-secondary mt-1">
            {activeProject ? activeProject.root.split("/").pop() : "Select a project to view worlds"}
          </p>
        </div>

        {activeProject && onCreateWorld && (
          <button className="mc-btn primary" onClick={onCreateWorld}>
            + New World
          </button>
        )}
      </div>

      {/* Main content */}
      {!activeProject ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-tertiary">
            <div className="text-4xl mb-4">🌐</div>
            <div>Select a project to explore its universe</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 3D World Graph placeholder */}
          <div className="lg:col-span-2 mc-panel">
            <div className="mc-panel-header">
              <span className="mc-panel-title">World Graph</span>
              <div className="mc-panel-actions">
                <button className="mc-btn text-xs">2D View</button>
                <button className="mc-btn text-xs">3D View</button>
              </div>
            </div>
            <div className="aspect-[16/9] bg-void flex items-center justify-center">
              {/* Placeholder for 3D graph */}
              <div className="text-center text-tertiary">
                <div className="text-6xl mb-4">🗺️</div>
                <div>3D World Graph</div>
                <div className="text-xs mt-2">
                  Interactive graph visualization coming in Phase 4
                </div>
              </div>
            </div>
          </div>

          {/* World details / stats */}
          <div className="mc-panel">
            <div className="mc-panel-header">
              <span className="mc-panel-title">Active Worlds</span>
            </div>
            <div className="p-3 space-y-3">
              {worlds.length === 0 ? (
                <div className="text-sm text-tertiary text-center py-4">
                  No worlds in this project yet
                </div>
              ) : (
                worlds.map((world) => (
                  <WorldCard
                    key={world.id}
                    world={world}
                    selected={selectedWorldId === world.id}
                    onClick={() => handleWorldSelect(world)}
                    onDoubleClick={() => onWorldOpen?.(world)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* World cards grid */}
      {activeProject && worlds.length > 0 && (
        <div className="mt-6">
          <h2 className="label-caps mb-3">All Worlds</h2>
          <WorldList
            worlds={worlds}
            selectedWorldId={selectedWorldId}
            onWorldSelect={handleWorldSelect}
            onWorldOpen={onWorldOpen}
            onCreateNew={onCreateWorld}
          />
        </div>
      )}
    </div>
  );
}

export default UniverseView;
