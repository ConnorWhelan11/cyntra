import { useMemo } from "react";
import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import type { ProjectInfo, ServerInfo } from "@/types";

interface ViewerViewProps {
  serverInfo: ServerInfo | null;
  activeProject: ProjectInfo | null;
}

/**
 * Viewer feature - displays the Outora 3D asset viewer in an iframe
 */
export function ViewerView({ serverInfo, activeProject }: ViewerViewProps) {
  const viewerUrl = useMemo(() => {
    if (!serverInfo) return null;
    if (!activeProject?.viewer_dir) return null;
    return `${serverInfo.base_url}/viewer/index.html`;
  }, [serverInfo, activeProject]);

  const subtitle = activeProject?.viewer_dir
    ? "served locally"
    : "no viewer in project";

  return (
    <Panel style={{ height: "100%" }}>
      <PanelHeader title="Outora Viewer" subtitle={subtitle} />
      <div style={{ height: "calc(100% - 49px)" }}>
        {viewerUrl ? (
          <iframe className="iframe" src={viewerUrl} />
        ) : (
          <div style={{ padding: 14 }} className="text-muted-foreground">
            Select a project that contains `fab/outora-library/viewer/`.
          </div>
        )}
      </div>
    </Panel>
  );
}
