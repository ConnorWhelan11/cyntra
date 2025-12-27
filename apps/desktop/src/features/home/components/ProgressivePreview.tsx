import React, { useMemo } from "react";
import type { PreviewStageMap, PreviewStage } from "@/types";
import { WorldPreview } from "../WorldPreview";

const STAGE_ORDER: PreviewStage[] = ["concept", "geometry", "textured", "final"];

interface ProgressivePreviewProps {
  stages: PreviewStageMap;
  currentStage?: string;
}

function resolveStage(
  stages: PreviewStageMap,
  currentStage?: string
): { stage: PreviewStage | null; url: string | null } {
  if (currentStage && stages[currentStage as PreviewStage]) {
    return {
      stage: currentStage as PreviewStage,
      url: stages[currentStage as PreviewStage] ?? null,
    };
  }

  for (let i = STAGE_ORDER.length - 1; i >= 0; i -= 1) {
    const stage = STAGE_ORDER[i];
    const url = stages[stage];
    if (url) {
      return { stage, url };
    }
  }

  return { stage: null, url: null };
}

export function ProgressivePreview({ stages, currentStage }: ProgressivePreviewProps) {
  const resolved = useMemo(() => resolveStage(stages, currentStage), [currentStage, stages]);

  const activeStage = resolved.stage ?? (currentStage as PreviewStage | null);

  return (
    <div className="progressive-preview">
      <div className="progressive-preview-stages">
        {STAGE_ORDER.map((stage) => {
          const isAvailable = Boolean(stages[stage]);
          const isActive = stage === activeStage;
          return (
            <div
              key={stage}
              className={`progressive-preview-stage ${isActive ? "active" : ""} ${
                isAvailable ? "" : "disabled"
              }`}
            >
              <span className="progressive-preview-stage-label">{stage}</span>
            </div>
          );
        })}
      </div>
      <div className="progressive-preview-viewer">
        <WorldPreview mode="asset" glbUrl={resolved.url ?? undefined} />
      </div>
    </div>
  );
}

export default ProgressivePreview;
