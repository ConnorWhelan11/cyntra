import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";
import type { ProjectInfo, RunInfo, ArtifactInfo } from "@/types";

interface RunsViewProps {
  activeProject: ProjectInfo | null;
  runs: RunInfo[];
  activeRunId: string | null;
  activeRun: RunInfo | null;
  artifacts: ArtifactInfo[];
  activeArtifactRelPath: string | null;
  activeArtifact: ArtifactInfo | null;
  activeArtifactUrl: string | null;
  artifactText: string | null;
  jobExitCodes: Record<string, number | null | undefined>;
  jobOutputs: Record<string, string>;
  serverInfo: { base_url: string } | null;
  setNewRunCommand: (cmd: string) => void;
  setNewRunLabel: (label: string) => void;
  setIsNewRunOpen: (open: boolean) => void;
  refreshRuns: (root: string) => void;
  selectRun: (id: string) => void;
  selectArtifact: (relPath: string) => void;
}

/**
 * Runs feature - manage Cyntra runs and artifacts
 */
export function RunsView({
  activeProject,
  runs,
  activeRunId,
  activeRun,
  artifacts,
  activeArtifactRelPath,
  activeArtifact,
  activeArtifactUrl,
  artifactText,
  jobExitCodes,
  jobOutputs,
  serverInfo,
  setNewRunCommand,
  setNewRunLabel,
  setIsNewRunOpen,
  refreshRuns,
  selectRun,
  selectArtifact,
}: RunsViewProps) {
  return (
    <Panel style={{ height: "100%" }}>
      <PanelHeader
        title="Runs"
        actions={
          <div className="row">
            <Button
              variant="primary"
              onClick={() => {
                setNewRunCommand("ls -la");
                setNewRunLabel("");
                setIsNewRunOpen(true);
              }}
              disabled={!activeProject}
            >
              New Run
            </Button>
            <Button
              onClick={() => activeProject && refreshRuns(activeProject.root)}
              disabled={!activeProject}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className="split">
        {/* Run List */}
        <div className="list">
          {!activeProject && (
            <div className="list-item muted">Select a project first.</div>
          )}
          {activeProject && runs.length === 0 && (
            <div className="list-item muted">
              No runs yet. Output is expected under <code>.cyntra/runs/</code>.
            </div>
          )}
          {runs.map((r) => (
            <div
              key={r.id}
              className={"list-item " + (r.id === activeRunId ? "active" : "")}
              onClick={() => selectRun(r.id)}
            >
              <div style={{ fontWeight: 650 }}>{r.id}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {jobExitCodes[r.id] === undefined
                  ? ""
                  : jobExitCodes[r.id] === null
                    ? "running"
                    : `exit ${jobExitCodes[r.id]}`}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {r.modifiedMs ? new Date(r.modifiedMs).toLocaleString() : ""}
              </div>
            </div>
          ))}
        </div>

        {/* Run Details */}
        <div className="detail">
          <div className="panel-header">
            <div className="panel-title">Details</div>
            <div className="muted">{activeRun ? activeRun.id : "—"}</div>
          </div>

          <div className="split" style={{ gridTemplateColumns: "360px 1fr" }}>
            {/* Artifact List */}
            <div className="list">
              {activeRun && artifacts.length === 0 && (
                <div className="list-item muted">No artifacts found.</div>
              )}
              {activeRun &&
                artifacts.map((a) => (
                  <div
                    key={a.relPath}
                    className={
                      "list-item " +
                      (a.relPath === activeArtifactRelPath ? "active" : "")
                    }
                    onClick={() => selectArtifact(a.relPath)}
                  >
                    <div style={{ fontWeight: 650 }}>{a.relPath}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {a.kind} · {a.sizeBytes.toLocaleString()} bytes
                    </div>
                  </div>
                ))}
            </div>

            {/* Artifact Viewer */}
            <div style={{ overflow: "auto" }}>
              {!activeRun && (
                <div style={{ padding: 14 }} className="muted">
                  Select a run to view artifacts.
                </div>
              )}

              {activeRun && (
                <div style={{ padding: 14 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 650 }}>{activeRun.id}</div>
                      <div className="muted" style={{ marginTop: 4 }}>
                        {activeRun.dir}
                      </div>
                    </div>
                    <div className="row">
                      {serverInfo && (
                        <a
                          className="btn"
                          href={`${serverInfo.base_url}/artifacts/${activeRun.id}/terminal.log`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Log
                        </a>
                      )}
                    </div>
                  </div>

                  {jobOutputs[activeRun.id] && (
                    <>
                      <div style={{ height: 12 }} />
                      <div className="muted" style={{ marginBottom: 6 }}>
                        Live output
                      </div>
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          background: "rgba(0,0,0,0.28)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                          padding: 12,
                          margin: 0,
                          maxHeight: 220,
                          overflow: "auto",
                        }}
                      >
                        {jobOutputs[activeRun.id]}
                      </pre>
                    </>
                  )}

                  {activeArtifact && (
                    <>
                      <div style={{ height: 16 }} />
                      <div style={{ fontWeight: 650, marginBottom: 6 }}>
                        {activeArtifact.relPath}
                      </div>
                      <div className="muted" style={{ marginBottom: 10 }}>
                        {activeArtifact.kind}
                      </div>

                      {activeArtifact.kind === "image" && activeArtifactUrl && (
                        <img
                          src={activeArtifactUrl}
                          style={{
                            maxWidth: "100%",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        />
                      )}

                      {(activeArtifact.kind === "json" ||
                        activeArtifact.kind === "text" ||
                        activeArtifact.kind === "html") && (
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            background: "rgba(0,0,0,0.28)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 12,
                            padding: 12,
                            margin: 0,
                          }}
                        >
                          {artifactText ?? "Loading…"}
                        </pre>
                      )}

                      {activeArtifactUrl && (
                        <div style={{ height: 10 }}>
                          <a
                            className="btn"
                            href={activeArtifactUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Artifact
                          </a>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
