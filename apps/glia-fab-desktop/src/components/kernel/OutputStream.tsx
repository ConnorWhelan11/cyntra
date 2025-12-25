import { useState, useRef, useEffect, useMemo } from "react";
import { ArtifactBrowser } from "./ArtifactBrowser";
import type { KernelEvent } from "@/types";

type StreamTab = "events" | "logs" | "artifacts";

interface OutputStreamProps {
  events: KernelEvent[];
  logs: string;
  isRunning: boolean;
  runId: string | null;
  projectRoot: string | null;
  serverBaseUrl: string;
  filterWorkcellId: string | null;
  filterIssueId: string | null;
  onClearFilter?: () => void;
  onOpenRunDetails?: () => void;
}

function getEventIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("spawn") || t.includes("create")) return "➕";
  if (t.includes("pass") || t.includes("success") || t.includes("complete")) return "✓";
  if (t.includes("fail") || t.includes("error")) return "✕";
  if (t.includes("start") || t.includes("run")) return "▶";
  if (t.includes("stop") || t.includes("cancel")) return "⏹";
  if (t.includes("init")) return "⚙";
  if (t.includes("escalat")) return "⚠";
  return "•";
}

function getEventClass(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("pass") || t.includes("success") || t.includes("complete")) return "success";
  if (t.includes("fail") || t.includes("error")) return "error";
  if (t.includes("escalat") || t.includes("warn")) return "warning";
  if (t.includes("spawn") || t.includes("start") || t.includes("run")) return "active";
  return "";
}

/**
 * Bottom dock with tabs for Events, Logs, and Artifacts.
 * Collapsible with filtering by selected entity.
 */
export function OutputStream({
  events,
  logs,
  isRunning,
  runId,
  projectRoot,
  serverBaseUrl,
  filterWorkcellId,
  filterIssueId,
  onClearFilter,
  onOpenRunDetails,
}: OutputStreamProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<StreamTab>("events");
  const logsRef = useRef<HTMLPreElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current && isExpanded && activeTab === "logs") {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, isExpanded, activeTab]);

  // Auto-expand when running starts
  useEffect(() => {
    if (isRunning && runId) {
      setIsExpanded(true);
      setActiveTab("logs");
    }
  }, [isRunning, runId]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = [...events].reverse().slice(0, 100);

    if (filterWorkcellId) {
      result = result.filter((e) => e.workcellId === filterWorkcellId);
    } else if (filterIssueId) {
      result = result.filter((e) => e.issueId === filterIssueId);
    }

    return result;
  }, [events, filterWorkcellId, filterIssueId]);

  const hasFilter = filterWorkcellId || filterIssueId;
  const filterLabel = filterWorkcellId
    ? `wc:${filterWorkcellId.slice(-6)}`
    : filterIssueId
      ? `#${filterIssueId}`
      : null;

  const truncatedRunId = runId
    ? runId.length > 20
      ? `...${runId.slice(-16)}`
      : runId
    : null;

  return (
    <div className={`output-stream ${isExpanded ? "expanded" : "collapsed"}`}>
      {/* Header */}
      <div
        className="output-stream-header"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="output-stream-header-left">
          <span className={`output-stream-indicator ${isRunning ? "running" : ""}`} />
          <span className="output-stream-title">Output</span>
          {truncatedRunId && (
            <button
              type="button"
              className="output-stream-run-id"
              onClick={(e) => {
                e.stopPropagation();
                onOpenRunDetails?.();
              }}
              disabled={!onOpenRunDetails}
              title="Open run details"
            >
              {truncatedRunId}
            </button>
          )}
          {hasFilter && (
            <span className="output-stream-filter-badge">
              {filterLabel}
              <button
                type="button"
                className="output-stream-filter-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearFilter?.();
                }}
                title="Clear filter"
              >
                ✕
              </button>
            </span>
          )}
        </div>
        <div className="output-stream-header-right">
          <span className="output-stream-toggle">
            {isExpanded ? "▼" : "▲"}
          </span>
        </div>
      </div>

      {/* Tabs (only visible when expanded) */}
      {isExpanded && (
        <div className="output-stream-tabs">
          <button
            type="button"
            className={`output-stream-tab ${activeTab === "events" ? "active" : ""}`}
            onClick={() => setActiveTab("events")}
          >
            Events
            <span className="output-stream-tab-count">{filteredEvents.length}</span>
          </button>
          <button
            type="button"
            className={`output-stream-tab ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            Logs
            {isRunning && <span className="output-stream-tab-live" />}
          </button>
          <button
            type="button"
            className={`output-stream-tab ${activeTab === "artifacts" ? "active" : ""}`}
            onClick={() => setActiveTab("artifacts")}
          >
            Artifacts
          </button>
        </div>
      )}

      {/* Content */}
      <div className="output-stream-content">
        {/* Events Tab */}
        {activeTab === "events" && (
          <div className="output-stream-events">
            {filteredEvents.length === 0 ? (
              <div className="output-stream-empty">
                <span className="output-stream-empty-icon">📜</span>
                <span>No events{hasFilter ? " matching filter" : ""}</span>
              </div>
            ) : (
              filteredEvents.map((event, idx) => {
                const icon = getEventIcon(event.type);
                const statusClass = getEventClass(event.type);
                const timestamp = event.timestamp
                  ? new Date(event.timestamp).toLocaleTimeString()
                  : "—";

                return (
                  <div
                    key={`${event.timestamp}-${idx}`}
                    className={`output-stream-event ${statusClass}`}
                  >
                    <span className={`output-stream-event-icon ${statusClass}`}>
                      {icon}
                    </span>
                    <span className="output-stream-event-type">{event.type}</span>
                    <span className="output-stream-event-meta">
                      {timestamp}
                      {event.issueId && (
                        <span className="output-stream-event-issue">
                          #{event.issueId}
                        </span>
                      )}
                      {event.workcellId && (
                        <span className="output-stream-event-wc">
                          {event.workcellId.slice(-6)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === "logs" && (
          <div className="output-stream-logs">
            {!runId ? (
              <div className="output-stream-empty">
                <span className="output-stream-empty-icon">📺</span>
                <span>No active run. Start a run to see logs.</span>
              </div>
            ) : (
              <pre ref={logsRef} className="output-stream-log-content">
                {logs || "Waiting for output..."}
                {isRunning && <span className="output-stream-cursor" />}
              </pre>
            )}
          </div>
        )}

        {/* Artifacts Tab */}
        {activeTab === "artifacts" && (
          <div className="output-stream-artifacts">
            <ArtifactBrowser
              runId={runId}
              projectRoot={projectRoot}
              serverBaseUrl={serverBaseUrl}
            />
          </div>
        )}
      </div>
    </div>
  );
}
