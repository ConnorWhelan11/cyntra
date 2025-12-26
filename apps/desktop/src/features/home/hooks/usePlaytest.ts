/**
 * usePlaytest - Playtest state management for World Builder
 *
 * Manages NitroGen-based gameplay testing lifecycle.
 */

import { useCallback } from "react";
import { startPlayabilityTest, killJob } from "@/services/runService";
import type { WorldBuildState } from "@/types";

export interface UsePlaytestConfig {
  projectRoot?: string | null;
  activeWorldBuild: WorldBuildState | null;
  setActiveWorldBuild: React.Dispatch<React.SetStateAction<WorldBuildState | null>>;
}

export interface UsePlaytestReturn {
  runPlaytest: () => Promise<void>;
  cancelPlaytest: () => Promise<void>;
}

export function usePlaytest({
  projectRoot,
  activeWorldBuild,
  setActiveWorldBuild,
}: UsePlaytestConfig): UsePlaytestReturn {
  const runPlaytest = useCallback(async () => {
    if (!projectRoot || !activeWorldBuild) return;
    if (activeWorldBuild.status !== "complete") return;

    // Mark playtest as running
    setActiveWorldBuild((prev) =>
      prev ? { ...prev, playtestStatus: "running" as const } : null
    );

    try {
      // Default Godot project path - could be derived from world config
      const godotProjectPath = `fab/vault/godot/templates/fab_game_template/project`;

      const jobInfo = await startPlayabilityTest({
        projectRoot,
        worldId: activeWorldBuild.issueId,
        godotProjectPath,
      });

      // Store job ID for potential cancellation
      setActiveWorldBuild((prev) =>
        prev ? { ...prev, playtestJobId: jobInfo.jobId } : null
      );

      // Note: Actual results would come through kernel events
      // For now, we'll simulate a result after some time
      // In production, useWorldBuildEvents would handle the playtest completion event

    } catch (error) {
      setActiveWorldBuild((prev) =>
        prev
          ? {
              ...prev,
              playtestStatus: "failed" as const,
              playtestError: error instanceof Error ? error.message : String(error),
            }
          : null
      );
    }
  }, [projectRoot, activeWorldBuild, setActiveWorldBuild]);

  const cancelPlaytest = useCallback(async () => {
    if (!activeWorldBuild?.playtestJobId) return;

    try {
      await killJob(activeWorldBuild.playtestJobId);
    } catch (error) {
      console.error("Failed to cancel playtest:", error);
    }

    setActiveWorldBuild((prev) =>
      prev
        ? {
            ...prev,
            playtestStatus: "idle" as const,
            playtestJobId: undefined,
          }
        : null
    );
  }, [activeWorldBuild?.playtestJobId, setActiveWorldBuild]);

  return {
    runPlaytest,
    cancelPlaytest,
  };
}
