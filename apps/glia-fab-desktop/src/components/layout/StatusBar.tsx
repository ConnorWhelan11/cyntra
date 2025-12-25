import React from "react";
import type { ServerInfo, KernelSnapshot } from "@/types";

interface StatusBarProps {
  /** Server connection info */
  serverInfo?: ServerInfo | null;
  /** Kernel snapshot for stats */
  kernelSnapshot?: KernelSnapshot | null;
  /** Current generation number */
  generation?: number | null;
  /** Current fitness score */
  fitness?: number | null;
  /** System metrics */
  metrics?: {
    cpu?: number;
    memory?: number;
  };
}

export function StatusBar({
  serverInfo,
  kernelSnapshot,
  generation,
  fitness,
  metrics,
}: StatusBarProps) {
  const isConnected = serverInfo !== null;
  const workcellCount = kernelSnapshot?.workcells?.length ?? 0;
  const issueCount = kernelSnapshot?.issues?.length ?? 0;

  return (
    <footer className="status-bar">
      {/* Connection status */}
      <div className="status-bar-item">
        <span className={`status-bar-dot ${isConnected ? "" : "disconnected"}`} />
        <span>{isConnected ? "Connected" : "Disconnected"}</span>
      </div>

      <span className="status-bar-separator" />

      {/* Workcell count */}
      {workcellCount > 0 && (
        <>
          <div className="status-bar-item">
            <span>{workcellCount} workcells</span>
          </div>
          <span className="status-bar-separator" />
        </>
      )}

      {/* Issue count */}
      {issueCount > 0 && (
        <>
          <div className="status-bar-item">
            <span>{issueCount} issues</span>
          </div>
          <span className="status-bar-separator" />
        </>
      )}

      {/* Generation */}
      {generation !== null && generation !== undefined && (
        <>
          <div className="status-bar-item font-mono">
            <span>gen:{generation}</span>
          </div>
          <span className="status-bar-separator" />
        </>
      )}

      {/* Fitness */}
      {fitness !== null && fitness !== undefined && (
        <>
          <div className="status-bar-item font-mono">
            <span>fit:{fitness.toFixed(2)}</span>
          </div>
          <span className="status-bar-separator" />
        </>
      )}

      {/* System metrics */}
      {metrics?.cpu !== undefined && (
        <div className="status-bar-item">
          <span>CPU: {metrics.cpu}%</span>
        </div>
      )}

      {/* Spacer to push server info to right */}
      <div style={{ flex: 1 }} />

      {/* Server URL (truncated) */}
      {serverInfo?.base_url && (
        <div className="status-bar-item" title={serverInfo.base_url}>
          <span>
            {(() => {
              try {
                return new URL(serverInfo.base_url).host;
              } catch {
                return serverInfo.base_url;
              }
            })()}
          </span>
        </div>
      )}
    </footer>
  );
}

export default StatusBar;
