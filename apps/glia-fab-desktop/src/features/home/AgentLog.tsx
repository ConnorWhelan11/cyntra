/**
 * AgentLog - Scrollable event log for a single agent
 *
 * Shows build events with type icons, timestamps, and smart auto-scroll.
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import type { BuildEvent, BuildEventType } from "@/types";

interface AgentLogProps {
  /** Events for this agent */
  events: BuildEvent[];
  /** Agent ID for filtering */
  agentId: string;
  /** Maximum events to show */
  maxEvents?: number;
}

/** Event type to icon mapping */
const EVENT_ICONS: Record<BuildEventType, string> = {
  system: "⚙",
  agent: "▶",
  critic: "◉",
  user: "💬",
  error: "⚠",
  vote: "✓",
};

/** Event type to color class */
const EVENT_COLORS: Record<BuildEventType, string> = {
  system: "agent-log-event--system",
  agent: "agent-log-event--agent",
  critic: "agent-log-event--critic",
  user: "agent-log-event--user",
  error: "agent-log-event--error",
  vote: "agent-log-event--vote",
};

/** Format timestamp for display */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Format event message for display */
function formatMessage(event: BuildEvent): string {
  // If message is just an event type, make it more readable
  if (event.message.includes(".")) {
    const parts = event.message.split(".");
    return parts[parts.length - 1].replace(/_/g, " ");
  }
  return event.message;
}

export function AgentLog({
  events,
  agentId,
  maxEvents = 100,
}: AgentLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filter and limit events
  const displayEvents = events
    .filter((e) => !e.agentId || e.agentId === agentId)
    .slice(-maxEvents);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayEvents.length, autoScroll]);

  // Handle scroll - disable auto-scroll if user scrolls up
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 20;

    setAutoScroll(isAtBottom);
  }, []);

  if (displayEvents.length === 0) {
    return (
      <div className="agent-log agent-log--empty">
        <span className="agent-log-empty-text">No events yet...</span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="agent-log"
      onScroll={handleScroll}
    >
      {displayEvents.map((event, index) => (
        <div
          key={event.id || index}
          className={`agent-log-event ${EVENT_COLORS[event.type]}`}
        >
          <span className="agent-log-event-icon">
            {EVENT_ICONS[event.type]}
          </span>
          <span className="agent-log-event-time">
            {formatTime(event.timestamp)}
          </span>
          <span className="agent-log-event-message">
            {formatMessage(event)}
          </span>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <span className="agent-log-event-meta">
              {event.metadata.fitness !== undefined && (
                <span className="agent-log-event-meta-item">
                  fitness: {(event.metadata.fitness as number).toFixed(2)}
                </span>
              )}
              {event.metadata.duration_ms !== undefined && (
                <span className="agent-log-event-meta-item">
                  {(event.metadata.duration_ms as number)}ms
                </span>
              )}
            </span>
          )}
        </div>
      ))}

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          className="agent-log-scroll-btn"
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
        >
          ↓ Scroll to latest
        </button>
      )}
    </div>
  );
}

export default AgentLog;
