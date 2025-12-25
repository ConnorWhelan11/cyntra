import React from "react";
import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";
import type { PtySessionInfo } from "@/types";

interface TerminalsViewProps {
  sessions: PtySessionInfo[];
  activeSessionId: string | null;
  activeSession: PtySessionInfo | null;
  terminalRef: React.RefObject<HTMLDivElement>;
  setActiveSessionId: (id: string) => void;
  createTerminal: () => void;
  killTerminal: (id: string) => void;
}

/**
 * Terminals feature - manage PTY sessions with xterm.js
 */
export function TerminalsView({
  sessions,
  activeSessionId,
  activeSession,
  terminalRef,
  setActiveSessionId,
  createTerminal,
  killTerminal,
}: TerminalsViewProps) {
  return (
    <Panel style={{ height: "100%" }}>
      <PanelHeader
        title="Terminals"
        actions={
          <div className="row">
            <Button variant="primary" onClick={createTerminal}>
              New Terminal
            </Button>
            {activeSession && (
              <Button onClick={() => killTerminal(activeSession.id)}>
                Kill
              </Button>
            )}
          </div>
        }
      />

      <div className="split">
        {/* Session List */}
        <div className="list">
          {sessions.length === 0 && (
            <div className="list-item muted">No sessions yet.</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={"list-item " + (s.id === activeSessionId ? "active" : "")}
              onClick={() => setActiveSessionId(s.id)}
            >
              <div style={{ fontWeight: 650 }}>
                {s.command ?? "shell"}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {s.cwd ?? "—"}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {s.id}
              </div>
            </div>
          ))}
        </div>

        {/* Terminal Display */}
        <div className="detail">
          <div className="panel-header">
            <div className="panel-title">Session</div>
            <div className="muted">
              {activeSessionId ? activeSessionId : "—"}
            </div>
          </div>
          <div ref={terminalRef} className="terminal" />
        </div>
      </div>
    </Panel>
  );
}
