import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";
import type { ProjectInfo } from "@/types";

interface ProjectsViewProps {
  projects: ProjectInfo[];
  activeProjectRoot: string | null;
  activeProject: ProjectInfo | null;
  globalEnvText: string;
  globalEnvLoaded: boolean;
  globalEnvSaving: boolean;
  setNewProjectPath: (path: string) => void;
  setIsAddProjectOpen: (open: boolean) => void;
  setActiveProject: (root: string) => void;
  setGlobalEnvText: (text: string) => void;
  saveGlobalEnv: () => void;
  clearGlobalEnv: () => void;
  createTerminal: () => void;
  bootstrapCyntraKernel: () => void;
}

/**
 * Projects feature - manage project roots and configurations
 */
export function ProjectsView({
  projects,
  activeProjectRoot,
  activeProject,
  globalEnvText,
  globalEnvLoaded,
  globalEnvSaving,
  setNewProjectPath,
  setIsAddProjectOpen,
  setActiveProject,
  setGlobalEnvText,
  saveGlobalEnv,
  clearGlobalEnv,
  createTerminal,
  bootstrapCyntraKernel,
}: ProjectsViewProps) {
  return (
    <Panel style={{ height: "100%" }}>
      <PanelHeader
        title="Projects"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setNewProjectPath("");
              setIsAddProjectOpen(true);
            }}
          >
            Add Project
          </Button>
        }
      />

      <div className="split" style={{ gridTemplateColumns: "380px 1fr" }}>
        {/* Project List */}
        <div className="list">
          {projects.length === 0 && (
            <div className="list-item muted">Add a repo root (e.g. this folder).</div>
          )}
          {projects.map((p) => (
            <div
              key={p.root}
              className={"list-item " + (p.root === activeProjectRoot ? "active" : "")}
              onClick={() => setActiveProject(p.root)}
            >
              <div style={{ fontWeight: 650 }}>{p.root.split("/").slice(-1)[0]}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {p.root}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Viewer: {p.viewer_dir ? "yes" : "no"} · Cyntra Kernel:{" "}
                {p.cyntra_kernel_dir ? "yes" : "no"}
              </div>
            </div>
          ))}
        </div>

        {/* Project Detail */}
        <div className="detail">
          <div className="panel-header">
            <div className="panel-title">Project</div>
            <div className="row">
              <button className="btn" onClick={createTerminal} disabled={!activeProject}>
                New Terminal
              </button>
              <button
                className="btn primary"
                onClick={bootstrapCyntraKernel}
                disabled={!activeProject || !activeProject.cyntra_kernel_dir}
                title="Creates .cyntra/venv and installs kernel deps"
              >
                Bootstrap Cyntra
              </button>
            </div>
          </div>
          <div style={{ padding: 14, overflow: "auto" }}>
            {!activeProject && <div className="muted">Select a project to view details.</div>}
            {activeProject && (
              <>
                <div style={{ fontWeight: 650, marginBottom: 6 }}>{activeProject.root}</div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  Viewer dir: {activeProject.viewer_dir ?? "—"}
                </div>
                <div className="muted">
                  Cyntra kernel dir: {activeProject.cyntra_kernel_dir ?? "—"}
                </div>
                <div style={{ height: 16 }} />
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Global Env (encrypted)</div>
                    <div className="row">
                      <button className="btn" onClick={clearGlobalEnv} disabled={globalEnvSaving}>
                        Clear
                      </button>
                      <button
                        className="btn primary"
                        onClick={saveGlobalEnv}
                        disabled={globalEnvSaving}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: 14, display: "grid", gap: 8 }}>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Merged into workcell env with <code>.cyntra/.env</code> per project.
                    </div>
                    <textarea
                      className="text-input"
                      placeholder="KEY=value"
                      rows={6}
                      value={globalEnvText}
                      onChange={(e) => setGlobalEnvText(e.target.value)}
                    />
                    {!globalEnvLoaded && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Loading from keychain…
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ height: 18 }} />
                <div className="muted">
                  Tip: run `fab-gate`, `fab-render`, `fab-godot`, or `cyntra` commands in a terminal
                  session.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
