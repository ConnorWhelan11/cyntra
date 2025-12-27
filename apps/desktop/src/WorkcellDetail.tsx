import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatContent(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type TelemetryEvent = {
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
};

type WorkcellInfo = {
  id: string;
  issueId: string;
  toolchain: string | null;
  created: string | null;
  speculateTag: string | null;
  hasTelemetry: boolean;
  hasProof: boolean;
  hasLogs: boolean;
};

type WorkcellDetailProps = {
  projectRoot: string;
  workcellId: string;
  onClose: () => void;
};

export function WorkcellDetail({ projectRoot, workcellId, onClose }: WorkcellDetailProps) {
  const [info, setInfo] = useState<WorkcellInfo | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [infoRes, eventsRes] = await Promise.all([
        invoke<WorkcellInfo>("workcell_get_info", {
          params: {
            projectRoot,
            workcellId,
          },
        }),
        invoke<TelemetryEvent[]>("workcell_get_telemetry", {
          params: {
            projectRoot,
            workcellId,
            offset: 0,
            limit: 500,
          },
        }),
      ]);

      setInfo(infoRes);
      setEvents(eventsRes);
      setError(null);
    } catch (e) {
      console.error("Failed to load workcell data:", e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectRoot, workcellId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      fetchData();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
  };

  const renderEvent = (event: TelemetryEvent, idx: number) => {
    const { eventType, timestamp, data } = event;

    switch (eventType) {
      case "started": {
        const toolchain = asString(data.toolchain);
        const model = asString(data.model);
        const issueId = asString(data.issue_id);
        const workcellId = asString(data.workcell_id);

        return (
          <div key={idx} className="telemetry-event started">
            <div className="event-header">
              <div className="badge">{eventType}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <div>
                <strong>{toolchain || "unknown"}</strong> • Model: {model || "unknown"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Issue #{issueId || "?"} • Workcell: {workcellId || "?"}
              </div>
            </div>
          </div>
        );
      }

      case "prompt_sent": {
        const tokens = asNumber(data.tokens);
        return (
          <div key={idx} className="telemetry-event prompt">
            <div className="event-header">
              <div className="badge primary">Prompt</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <details>
                <summary style={{ cursor: "pointer", marginBottom: 8 }}>
                  Show prompt ({tokens != null ? `~${tokens} tokens` : "view"})
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 11,
                    background: "var(--bg-elevated)",
                    padding: 8,
                    borderRadius: 4,
                    maxHeight: 300,
                    overflow: "auto",
                  }}
                >
                  {formatContent(data.prompt)}
                </pre>
              </details>
            </div>
          </div>
        );
      }

      case "response_chunk":
        return (
          <div key={idx} className="telemetry-event response-chunk">
            <div className="event-header">
              <div className="badge">Response</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body" style={{ fontSize: 12, fontFamily: "monospace" }}>
              {formatContent(data.content)}
            </div>
          </div>
        );

      case "response_complete": {
        const tokens = asNumber(data.tokens);
        return (
          <div key={idx} className="telemetry-event response-complete">
            <div className="event-header">
              <div className="badge success">Response Complete</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <details>
                <summary style={{ cursor: "pointer", marginBottom: 8 }}>
                  Show response ({tokens != null ? `${tokens} tokens` : "view"})
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 11,
                    background: "var(--bg-elevated)",
                    padding: 8,
                    borderRadius: 4,
                    maxHeight: 300,
                    overflow: "auto",
                  }}
                >
                  {formatContent(data.content)}
                </pre>
              </details>
            </div>
          </div>
        );
      }

      case "tool_call": {
        const tool = asString(data.tool);
        const args = asRecord(data.args);
        return (
          <div key={idx} className="telemetry-event tool-call">
            <div className="event-header">
              <div className="badge warning">Tool Call</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <div style={{ fontWeight: 600 }}>{tool || "unknown"}</div>
              {args && Object.keys(args).length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12 }}>Arguments</summary>
                  <pre
                    style={{
                      fontSize: 11,
                      background: "var(--bg-elevated)",
                      padding: 8,
                      borderRadius: 4,
                      marginTop: 4,
                    }}
                  >
                    {JSON.stringify(args, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      }

      case "tool_result": {
        const tool = asString(data.tool);
        const errorMessage = asString(data.error);
        const hasError = data.error != null;
        const result = data.result;
        const hasResult = result != null;
        return (
          <div key={idx} className="telemetry-event tool-result">
            <div className="event-header">
              <div className={"badge " + (hasError ? "error" : "")}>Tool Result</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <div style={{ fontWeight: 600 }}>{tool || "unknown"}</div>
              {hasError && (
                <div className="error" style={{ marginTop: 4, fontSize: 12 }}>
                  Error: {errorMessage || "Unknown error"}
                </div>
              )}
              {hasResult && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12 }}>Result</summary>
                  <pre
                    style={{
                      fontSize: 11,
                      background: "var(--bg-elevated)",
                      padding: 8,
                      borderRadius: 4,
                      marginTop: 4,
                      maxHeight: 200,
                      overflow: "auto",
                    }}
                  >
                    {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        );
      }

      case "completed": {
        const exitCode = asNumber(data.exit_code);
        const durationMs = asNumber(data.duration_ms);
        const status = asString(data.status);
        const isSuccess = exitCode === 0;

        return (
          <div key={idx} className="telemetry-event completed">
            <div className="event-header">
              <div className={"badge " + (isSuccess ? "success" : "error")}>Completed</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <div>
                Status: <strong>{status || "unknown"}</strong> • Exit code: {exitCode ?? "?"} •
                Duration: {durationMs != null ? (durationMs / 1000).toFixed(2) : "?"}s
              </div>
            </div>
          </div>
        );
      }

      case "error": {
        const errorMessage = asString(data.error);
        return (
          <div key={idx} className="telemetry-event error">
            <div className="event-header">
              <div className="badge error">Error</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body error">{errorMessage || "Unknown error"}</div>
          </div>
        );
      }

      default:
        return (
          <div key={idx} className="telemetry-event">
            <div className="event-header">
              <div className="badge">{eventType}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {formatTimestamp(timestamp)}
              </div>
            </div>
            <div className="event-body">
              <pre style={{ fontSize: 11 }}>{JSON.stringify(data, null, 2)}</pre>
            </div>
          </div>
        );
    }
  };

  if (loading && !info) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">
            <div className="panel-title">Loading...</div>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">
            <div className="panel-title">Error</div>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
          <div style={{ padding: 16 }}>
            <div className="error">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: "90vw", maxWidth: 1200, height: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <div className="panel-title">Workcell: {info?.id}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Issue #{info?.issueId} • {info?.toolchain || "unknown toolchain"}
              {info?.speculateTag && ` • ${info.speculateTag}`}
            </div>
          </div>
          <div className="row">
            <label className="muted" style={{ fontSize: 12, marginRight: 12 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Auto-refresh
            </label>
            <button className="btn" onClick={fetchData}>
              Refresh
            </button>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div style={{ padding: 16, flex: 1, overflow: "auto" }}>
          {!info?.hasTelemetry && (
            <div className="muted" style={{ textAlign: "center", padding: 32 }}>
              No telemetry data available for this workcell.
            </div>
          )}

          {info?.hasTelemetry && events.length === 0 && (
            <div className="muted" style={{ textAlign: "center", padding: 32 }}>
              Telemetry file exists but no events yet...
            </div>
          )}

          {events.length > 0 && (
            <div className="telemetry-timeline">{events.map((e, i) => renderEvent(e, i))}</div>
          )}
        </div>
      </div>
    </div>
  );
}
