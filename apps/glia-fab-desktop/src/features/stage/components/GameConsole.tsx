import { memo, useRef, useEffect } from "react";
import type { ConsoleEntry, ConsoleFilter } from "@/types/ui";

interface GameConsoleProps {
  logs: ConsoleEntry[];
  filter: ConsoleFilter;
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  onFilterChange: (filter: ConsoleFilter) => void;
}

function getLevelIcon(level: ConsoleEntry["level"]): string {
  switch (level) {
    case "error":
      return "✖";
    case "warn":
      return "⚠";
    case "debug":
      return "🐛";
    default:
      return "ℹ";
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * GameConsole - Log output panel with filtering
 */
export const GameConsole = memo(function GameConsole({
  logs,
  filter,
  isOpen,
  onToggle,
  onClear,
  onFilterChange,
}: GameConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  // Track scroll position to disable auto-scroll when user scrolls up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 20;
  };

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div className={`game-console ${isOpen ? "open" : "collapsed"}`}>
      <div className="game-console-header">
        <button className="game-console-toggle" onClick={onToggle}>
          <span className="game-console-toggle-icon">
            {isOpen ? "▼" : "▲"}
          </span>
          <span className="game-console-title">Console</span>
          {!isOpen && (errorCount > 0 || warnCount > 0) && (
            <span className="game-console-badges">
              {errorCount > 0 && (
                <span className="game-console-badge error">{errorCount}</span>
              )}
              {warnCount > 0 && (
                <span className="game-console-badge warn">{warnCount}</span>
              )}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="game-console-actions">
            <div className="game-console-filters">
              {(["all", "error", "warn", "info"] as ConsoleFilter[]).map((f) => (
                <button
                  key={f}
                  className={`game-console-filter ${filter === f ? "active" : ""}`}
                  onClick={() => onFilterChange(f)}
                >
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === "error" && errorCount > 0 && ` (${errorCount})`}
                  {f === "warn" && warnCount > 0 && ` (${warnCount})`}
                </button>
              ))}
            </div>
            <button className="game-console-clear" onClick={onClear}>
              Clear
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div
          ref={scrollRef}
          className="game-console-logs"
          onScroll={handleScroll}
        >
          {logs.length === 0 ? (
            <div className="game-console-empty">
              No logs yet. Start the game to see output.
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className={`console-entry ${entry.level}`}>
                <span className="console-entry-time">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="console-entry-icon">
                  {getLevelIcon(entry.level)}
                </span>
                <span className="console-entry-message">{entry.message}</span>
                {entry.source && (
                  <span className="console-entry-source">{entry.source}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});

export default GameConsole;
