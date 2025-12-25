import React from "react";
import type { WorkcellInfo } from "@/types";
import { WorkcellBar } from "./WorkcellBar";

interface WorkcellTimelineProps {
  workcells: WorkcellInfo[];
  onWorkcellClick?: (workcell: WorkcellInfo) => void;
}

export function WorkcellTimeline({
  workcells,
  onWorkcellClick,
}: WorkcellTimelineProps) {
  if (workcells.length === 0) {
    return (
      <div className="workcell-timeline">
        <div className="text-tertiary text-sm italic p-3">
          No workcells active
        </div>
      </div>
    );
  }

  return (
    <div className="workcell-timeline">
      {workcells.map((workcell) => (
        <WorkcellBar
          key={workcell.id}
          workcell={workcell}
          onClick={() => onWorkcellClick?.(workcell)}
        />
      ))}
    </div>
  );
}

export default WorkcellTimeline;
