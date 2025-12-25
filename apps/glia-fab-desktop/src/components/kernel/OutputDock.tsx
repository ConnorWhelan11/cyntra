import { useState, useRef, useEffect } from "react";

interface OutputDockProps {
  runId: string | null;
  output: string;
  isRunning: boolean;
}

export function OutputDock({ runId, output, isRunning }: OutputDockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (contentRef.current && isExpanded) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [output, isExpanded]);

  // Auto-expand when kernel starts running
  useEffect(() => {
    if (isRunning && runId) {
      setIsExpanded(true);
    }
  }, [isRunning, runId]);

  const truncatedRunId = runId
    ? runId.length > 32
      ? `...${runId.slice(-28)}`
      : runId
    : null;

  return (
    <div className={`output-dock ${isExpanded ? "expanded" : "collapsed"}`}>
      <button
        type="button"
        className="output-dock-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="output-dock-header-left">
          <span className={`output-dock-indicator ${isRunning ? "running" : ""}`} />
          <span className="output-dock-title">Live Output</span>
          {truncatedRunId && (
            <span className="output-dock-run-id">{truncatedRunId}</span>
          )}
        </div>
        <div className="output-dock-header-right">
          <span className="output-dock-toggle">
            {isExpanded ? "collapse" : "expand"}
          </span>
        </div>
      </button>

      <div className="output-dock-content">
        {!runId ? (
          <div className="output-dock-empty">
            <span>No kernel run active. Start a run to see output.</span>
          </div>
        ) : (
          <pre ref={contentRef} className="output-dock-log">
            {output || "Waiting for output..."}
            {isRunning && <span className="output-dock-cursor" />}
          </pre>
        )}
      </div>
    </div>
  );
}
