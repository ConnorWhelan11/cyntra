import { useMemo } from "react";
import type { KernelEvent } from "@/types";

interface EventItemProps {
  event: KernelEvent;
}

function getEventIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("spawn") || t.includes("create")) return "add_circle";
  if (t.includes("pass") || t.includes("success") || t.includes("complete")) return "check_circle";
  if (t.includes("fail") || t.includes("error")) return "error";
  if (t.includes("start") || t.includes("run")) return "play_circle";
  if (t.includes("stop") || t.includes("cancel")) return "stop_circle";
  if (t.includes("init")) return "settings";
  if (t.includes("escalat")) return "warning";
  return "radio_button_checked";
}

function getEventClass(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("pass") || t.includes("success") || t.includes("complete")) return "success";
  if (t.includes("fail") || t.includes("error")) return "error";
  if (t.includes("escalat") || t.includes("warn")) return "warning";
  if (t.includes("spawn") || t.includes("start") || t.includes("run")) return "active";
  return "";
}

function EventItem({ event }: EventItemProps) {
  const icon = getEventIcon(event.type);
  const statusClass = getEventClass(event.type);

  const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : "—";

  return (
    <div className={`event-item ${statusClass}`}>
      <span className={`event-item-icon ${statusClass}`}>{icon}</span>
      <div className="event-item-content">
        <span className="event-item-type">{event.type}</span>
        <span className="event-item-meta">
          {timestamp}
          {event.issueId && <span className="event-item-issue">#{event.issueId}</span>}
          {event.workcellId && (
            <span className="event-item-workcell">{event.workcellId.slice(-8)}</span>
          )}
        </span>
      </div>
    </div>
  );
}

interface EventsFeedProps {
  events: KernelEvent[];
  filterBySelectedIssue: boolean;
  onToggleFilter: (filter: boolean) => void;
}

export function EventsFeed({ events, filterBySelectedIssue, onToggleFilter }: EventsFeedProps) {
  // Reverse to show newest first
  const displayEvents = useMemo(() => {
    return [...events].reverse().slice(0, 50);
  }, [events]);

  return (
    <div className="mc-panel events-feed-panel">
      <div className="mc-panel-header">
        <span className="mc-panel-title">Events</span>
        <label className="events-feed-filter">
          <input
            type="checkbox"
            checked={filterBySelectedIssue}
            onChange={(e) => onToggleFilter(e.target.checked)}
          />
          <span>Selected only</span>
        </label>
      </div>

      <div className="events-feed-content">
        {displayEvents.length === 0 ? (
          <div className="events-feed-empty">
            <span className="events-feed-empty-icon">history</span>
            <span>No events yet</span>
          </div>
        ) : (
          <div className="events-feed-list stagger-list">
            {displayEvents.map((event, idx) => (
              <EventItem key={`${event.timestamp}-${idx}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
