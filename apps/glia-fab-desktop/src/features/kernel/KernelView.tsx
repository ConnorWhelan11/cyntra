import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";
import type {
  ActiveJobInfo,
  BeadsIssue,
  ChatMessage,
  KernelEvent,
  KernelSnapshot,
  KernelWorkcell,
  ProjectInfo,
} from "@/types";

interface KernelViewProps {
  activeProject: ProjectInfo | null;
  kernelSnapshot: KernelSnapshot | null;
  kernelCounts: { total: number; ready: number };
  kernelWorkcells: KernelWorkcell[];
  filteredKernelIssues: BeadsIssue[];
  kernelSelectedIssueId: string | null;
  selectedKernelIssue: BeadsIssue | null;
  selectedIssueWorkcells: KernelWorkcell[];
  kernelFilter: string;
  setKernelFilter: (filter: string) => void;
  kernelOnlyReady: boolean;
  setKernelOnlyReady: (only: boolean) => void;
  kernelOnlyActiveIssues: boolean;
  setKernelOnlyActiveIssues: (only: boolean) => void;
  setKernelSelectedIssueId: (id: string) => void;
  visibleKernelEvents: KernelEvent[];
  kernelEventsForSelectedIssue: boolean;
  setKernelEventsForSelectedIssue: (forSelected: boolean) => void;
  kernelRunId: string | null;
  kernelJobId: string | null;
  activeJobs: ActiveJobInfo[];
  jobOutputs: Record<string, string>;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (input: string) => void;
  setSelectedWorkcellId: (id: string | null) => void;
  refreshKernel: (root: string) => void;
  initBeads: () => void;
  setNewIssueTitle: (title: string) => void;
  setNewIssueDescription: (desc: string) => void;
  setNewIssueTags: (tags: string) => void;
  setNewIssuePriority: (priority: string) => void;
  setNewIssueToolHint: (hint: string) => void;
  setNewIssueRisk: (risk: string) => void;
  setNewIssueSize: (size: string) => void;
  setIsCreateIssueOpen: (open: boolean) => void;
  kernelInit: () => void;
  kernelRunOnce: () => void;
  kernelRunWatch: () => void;
  kernelStop: () => void;
  setIssueStatus: (issueId: string, status: string) => void;
  kernelRunIssueOnce: (issueId: string) => void;
  restartIssue: (issue: BeadsIssue) => void;
  createTerminalAt: (path: string) => void;
  setIssueToolHint: (issueId: string, hint: string | null) => void;
  toggleIssueTag: (issue: BeadsIssue, tag: string) => void;
  sendChat: () => void;
}

/**
 * Kernel feature - Beads issues, workcells, and dev-kernel orchestration
 */
export function KernelView(props: KernelViewProps) {
  const {
    activeProject,
    kernelSnapshot,
    kernelCounts,
    kernelWorkcells,
    filteredKernelIssues,
    kernelSelectedIssueId,
    selectedKernelIssue,
    selectedIssueWorkcells,
    kernelFilter,
    setKernelFilter,
    kernelOnlyReady,
    setKernelOnlyReady,
    kernelOnlyActiveIssues,
    setKernelOnlyActiveIssues,
    setKernelSelectedIssueId,
    visibleKernelEvents,
    kernelEventsForSelectedIssue,
    setKernelEventsForSelectedIssue,
    kernelRunId,
    kernelJobId,
    activeJobs,
    jobOutputs,
    chatMessages,
    chatInput,
    setChatInput,
    setSelectedWorkcellId,
    refreshKernel,
    initBeads,
    setNewIssueTitle,
    setNewIssueDescription,
    setNewIssueTags,
    setNewIssuePriority,
    setNewIssueToolHint,
    setNewIssueRisk,
    setNewIssueSize,
    setIsCreateIssueOpen,
    kernelInit,
    kernelRunOnce,
    kernelRunWatch,
    kernelStop,
    setIssueStatus,
    kernelRunIssueOnce,
    restartIssue,
    createTerminalAt,
    setIssueToolHint,
    toggleIssueTag,
    sendChat,
  } = props;

  return (
    <Panel style={{ height: "100%" }}>
      <PanelHeader
        title="Kernel"
        actions={
          <div className="row">
            <Button
              onClick={() => activeProject && refreshKernel(activeProject.root)}
              disabled={!activeProject}
            >
              Refresh
            </Button>
            <Button onClick={initBeads} disabled={!activeProject}>
              Init Beads
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setNewIssueTitle("");
                setNewIssueDescription("");
                setNewIssueTags(
                  [
                    "asset:interior",
                    "gate:asset-only",
                    "gate:godot",
                    "gate:config:interior_library_v001",
                    "gate:godot-config:godot_integration_v001",
                  ].join(", ")
                );
                setNewIssuePriority("P2");
                setNewIssueToolHint("");
                setNewIssueRisk("medium");
                setNewIssueSize("M");
                setIsCreateIssueOpen(true);
              }}
              disabled={!activeProject}
            >
              New Issue
            </Button>
            <Button onClick={kernelInit} disabled={!activeProject}>
              Init Kernel
            </Button>
            <Button onClick={kernelRunOnce} disabled={!activeProject}>
              Run Once
            </Button>
            {!kernelJobId ? (
              <Button variant="primary" onClick={kernelRunWatch} disabled={!activeProject}>
                Watch
              </Button>
            ) : (
              <Button onClick={kernelStop}>
                Stop
              </Button>
            )}
          </div>
        }
      />

      <div className="split" style={{ gridTemplateColumns: "420px 1fr" }}>
        {/* Issue List */}
        <div className="list">
          <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Issues: {kernelCounts.total} · Ready: {kernelCounts.ready} · Workcells:{" "}
                {kernelWorkcells.length} · Beads:{" "}
                {kernelSnapshot?.beadsPresent ? "yes" : "no"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Jobs: {activeJobs.length}
              </div>
            </div>
            <div style={{ height: 10 }} />
            <input
              className="text-input"
              value={kernelFilter}
              onChange={(e) => setKernelFilter(e.target.value)}
              placeholder="Filter issues (id/title/tag)…"
            />
            <div style={{ height: 10 }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label className="muted" style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={kernelOnlyReady}
                  onChange={(e) => setKernelOnlyReady(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Ready only
              </label>
              <label className="muted" style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={kernelOnlyActiveIssues}
                  onChange={(e) => setKernelOnlyActiveIssues(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Active only
              </label>
            </div>
          </div>

          {!activeProject && (
            <div className="list-item muted">Select a project first.</div>
          )}
          {activeProject && !kernelSnapshot && (
            <div className="list-item muted">
              Loading kernel snapshot… (Init Beads if this repo has none.)
            </div>
          )}
          {activeProject &&
            kernelSnapshot &&
            filteredKernelIssues.map((i) => (
              <div
                key={i.id}
                className={
                  "list-item " + (i.id === kernelSelectedIssueId ? "active" : "")
                }
                onClick={() => setKernelSelectedIssueId(i.id)}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 650 }}>
                    #{i.id} {i.title}
                  </div>
                  <div className={"badge " + (i.status || "open")}>{i.status}</div>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {i.ready ? "ready · " : ""}
                  {i.dkToolHint ? `tool:${i.dkToolHint} · ` : ""}
                  {i.tags.slice(0, 3).join(", ")}
                  {i.tags.length > 3 ? " …" : ""}
                </div>
              </div>
            ))}
        </div>

        {/* Mission Control */}
        <div className="detail">
          <div className="panel-header">
            <div className="panel-title">Mission Control</div>
            <div className="muted">
              {selectedKernelIssue ? `Issue #${selectedKernelIssue.id}` : "—"}
            </div>
          </div>

          <div style={{ padding: 14, overflow: "auto", display: "grid", gap: 12 }}>
            {!activeProject && (
              <div className="muted">Select a project to manage Beads + Kernel.</div>
            )}

            {activeProject && (
              <>
                {!selectedKernelIssue && (
                  <div className="muted">Select an issue on the left.</div>
                )}

                {selectedKernelIssue && (
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        #{selectedKernelIssue.id} {selectedKernelIssue.title}
                      </div>
                      <div className="row">
                        <div className={"badge " + selectedKernelIssue.status}>
                          {selectedKernelIssue.status}
                        </div>
                        {selectedKernelIssue.ready && <div className="badge ready">ready</div>}
                      </div>
                    </div>
                    <div style={{ padding: 14, display: "grid", gap: 10 }}>
                      {selectedKernelIssue.description && (
                        <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                          {selectedKernelIssue.description}
                        </div>
                      )}

                      <div className="row" style={{ flexWrap: "wrap" }}>
                        <button
                          className="btn"
                          onClick={() => setIssueStatus(selectedKernelIssue.id, "ready")}
                        >
                          Mark Ready
                        </button>
                        <button
                          className="btn"
                          onClick={() => setIssueStatus(selectedKernelIssue.id, "blocked")}
                        >
                          Block
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => setIssueStatus(selectedKernelIssue.id, "done")}
                        >
                          Done
                        </button>
                        <button
                          className="btn"
                          onClick={() => kernelRunIssueOnce(selectedKernelIssue.id)}
                        >
                          Run Issue Once
                        </button>
                        <button
                          className="btn"
                          onClick={() => restartIssue(selectedKernelIssue)}
                          title="Reset attempts and clear escalation tags"
                        >
                          Restart
                        </button>
                        {selectedIssueWorkcells[0] && (
                          <button
                            className="btn"
                            onClick={() => createTerminalAt(selectedIssueWorkcells[0].path)}
                          >
                            Terminal in Workcell
                          </button>
                        )}
                      </div>

                      <div className="row" style={{ flexWrap: "wrap" }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Toolchain
                        </div>
                        {["codex", "claude", "opencode", "crush"].map((t) => (
                          <button
                            key={t}
                            className={
                              "btn " + (selectedKernelIssue.dkToolHint === t ? "primary" : "")
                            }
                            onClick={() => setIssueToolHint(selectedKernelIssue.id, t)}
                          >
                            {t}
                          </button>
                        ))}
                        <button
                          className={"btn " + (!selectedKernelIssue.dkToolHint ? "primary" : "")}
                          onClick={() => setIssueToolHint(selectedKernelIssue.id, null)}
                        >
                          auto
                        </button>
                      </div>

                      <div className="row" style={{ flexWrap: "wrap" }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Tags
                        </div>
                        {[
                          "asset:interior",
                          "gate:asset-only",
                          "gate:godot",
                          "gate:config:interior_library_v001",
                          "gate:godot-config:godot_integration_v001",
                        ].map((tag) => (
                          <button
                            key={tag}
                            className={
                              "chip " +
                              (selectedKernelIssue.tags.includes(tag) ? "active" : "")
                            }
                            onClick={() => toggleIssueTag(selectedKernelIssue, tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid-2">
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">Workcells</div>
                      <div className="muted">{kernelWorkcells.length}</div>
                    </div>
                    <div style={{ maxHeight: 240, overflow: "auto" }}>
                      {kernelWorkcells.length === 0 && (
                        <div className="list-item muted">No active workcells.</div>
                      )}
                      {kernelWorkcells.map((w) => (
                        <div key={w.id} className="list-item">
                          <div className="row" style={{ justifyContent: "space-between" }}>
                            <div style={{ fontWeight: 650 }}>
                              {w.id} · #{w.issueId}
                            </div>
                            <div className="row">
                              {w.toolchain && <div className="badge">{w.toolchain}</div>}
                              {w.proofStatus && (
                                <div className={"badge " + w.proofStatus}>{w.proofStatus}</div>
                              )}
                            </div>
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {w.path}
                          </div>
                          <div style={{ height: 8 }} />
                          <div className="row">
                            <button className="btn" onClick={() => setSelectedWorkcellId(w.id)}>
                              View Details
                            </button>
                            <button className="btn" onClick={() => createTerminalAt(w.path)}>
                              Terminal
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">Events</div>
                      <label className="muted" style={{ fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={kernelEventsForSelectedIssue}
                          onChange={(e) => setKernelEventsForSelectedIssue(e.target.checked)}
                          style={{ marginRight: 8 }}
                        />
                        Selected only
                      </label>
                    </div>
                    <div style={{ maxHeight: 240, overflow: "auto" }}>
                      {visibleKernelEvents.length === 0 && (
                        <div className="list-item muted">No events yet.</div>
                      )}
                      {visibleKernelEvents
                        .slice()
                        .reverse()
                        .map((ev, idx) => (
                          <div key={idx} className="list-item">
                            <div style={{ fontWeight: 650 }}>{ev.type}</div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                              {ev.timestamp ?? "—"}
                              {ev.issueId ? ` · #${ev.issueId}` : ""}
                              {ev.workcellId ? ` · ${ev.workcellId}` : ""}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Chat / Commands</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      create · issue · tool · kernel
                    </div>
                  </div>
                  <div className="chat">
                    <div className="chat-log">
                      {chatMessages.length === 0 && (
                        <div className="muted">
                          Try: <code>create add spawn + colliders #asset:interior</code>,{" "}
                          <code>issue 1 ready</code>, <code>tool 1 codex</code>,{" "}
                          <code>kernel watch</code>.
                        </div>
                      )}
                      {chatMessages.slice(-30).map((m) => (
                        <div
                          key={m.id}
                          className={"chat-msg " + (m.role === "user" ? "user" : "system")}
                        >
                          <div className="chat-meta">
                            {m.role} · {new Date(m.ts).toLocaleTimeString()}
                          </div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                        </div>
                      ))}
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <input
                        className="text-input"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") sendChat();
                        }}
                        placeholder="Type a command…"
                      />
                      <button className="btn primary" onClick={sendChat}>
                        Send
                      </button>
                    </div>
                  </div>
                </div>

                {kernelRunId && (
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">Live Output</div>
                      <div className="muted">{kernelRunId}</div>
                    </div>
                    <pre className="log">
                      {jobOutputs[kernelRunId] ?? "No output yet."}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
