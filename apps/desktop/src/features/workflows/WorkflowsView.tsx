import React, { useCallback, useState } from "react";
import type { ProjectInfo } from "@/types";
import { UnitWorkflowHost } from "./unit/UnitWorkflowHost";
import { createKernelConsoleSampleBundle } from "./samples/kernelConsoleSample";

export interface WorkflowsViewProps {
  activeProject: ProjectInfo | null;
}

export function WorkflowsView({ activeProject }: WorkflowsViewProps) {
  const [mountNonce, setMountNonce] = useState(0);

  const loadKernelConsoleSample = useCallback(() => {
    if (!activeProject) return;
    if (typeof localStorage === "undefined") return;

    const bundle = createKernelConsoleSampleBundle(activeProject.root);
    localStorage.setItem("bundle", JSON.stringify(bundle));
    setMountNonce((n) => n + 1);
  }, [activeProject]);

  if (!activeProject) {
    return (
      <div className="shell-placeholder">
        <div className="shell-placeholder-title">Workflows</div>
        <div className="shell-placeholder-text">Select a project to use workflows.</div>
      </div>
    );
  }

  return (
    <div className="workflows-view">
      <div className="workflows-header">
        <div className="workflows-header-left">
          <div className="workflows-title">Workflows</div>
          <div className="workflows-subtitle">
            Powered by Unit • Project: <code>{activeProject.root}</code>
          </div>
        </div>

        <div className="workflows-header-actions">
          <button className="btn" type="button" onClick={loadKernelConsoleSample}>
            Load sample: kernel events → console
          </button>
        </div>
      </div>

      <UnitWorkflowHost
        key={`${activeProject.root}:${mountNonce}`}
        projectRoot={activeProject.root}
      />
    </div>
  );
}
