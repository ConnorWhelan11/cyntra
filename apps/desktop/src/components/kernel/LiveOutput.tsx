import React, { useRef, useEffect } from "react";

interface OutputLine {
  id: string;
  source: string;
  text: string;
  timestamp?: number;
}

interface LiveOutputProps {
  /** Lines of output to display */
  lines: OutputLine[];
  /** Whether to auto-scroll to bottom */
  autoScroll?: boolean;
  /** Max height in pixels */
  maxHeight?: number;
  /** Title for the panel */
  title?: string;
}

export function LiveOutput({
  lines,
  autoScroll = true,
  maxHeight = 300,
  title = "LIVE OUTPUT",
}: LiveOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (autoScroll && !isUserScrolling.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Track user scroll to disable auto-scroll temporarily
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    isUserScrolling.current = !isAtBottom;
  };

  return (
    <div className="mc-panel">
      <div className="mc-panel-header">
        <span className="mc-panel-title">{title}</span>
      </div>

      <div
        ref={scrollRef}
        className="live-output-content"
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        {lines.length === 0 ? (
          <div className="text-tertiary italic">Waiting for output...</div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="live-output-line">
              <span className="live-output-source">[{line.source}]</span>
              <span className="live-output-text">{line.text}</span>
            </div>
          ))
        )}
        {/* Blinking cursor */}
        <span className="live-output-cursor" />
      </div>
    </div>
  );
}

// Helper function to parse job output into lines
export function parseJobOutput(output: string, source: string = "output"): OutputLine[] {
  return output
    .split("\n")
    .filter((line) => line.trim())
    .map((text, index) => ({
      id: `${source}-${index}-${Date.now()}`,
      source,
      text: text.trim(),
      timestamp: Date.now(),
    }));
}

// Helper function to merge multiple job outputs
export function mergeJobOutputs(
  outputs: Record<string, string>,
  sourcePrefix: string = "workcell"
): OutputLine[] {
  const allLines: OutputLine[] = [];

  for (const [id, output] of Object.entries(outputs)) {
    const source = `${sourcePrefix}-${id.slice(-2)}`;
    allLines.push(...parseJobOutput(output, source));
  }

  return allLines;
}

export default LiveOutput;
