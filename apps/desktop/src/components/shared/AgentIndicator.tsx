import React from "react";

type Agent = "claude" | "codex" | "opencode" | "crush" | string;

interface AgentIndicatorProps {
  agent: Agent | null | undefined;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const AGENT_CONFIG: Record<string, { label: string; colorVar: string }> = {
  claude: { label: "Claude", colorVar: "var(--agent-claude)" },
  codex: { label: "Codex", colorVar: "var(--agent-codex)" },
  opencode: { label: "OpenCode", colorVar: "var(--agent-opencode)" },
  crush: { label: "Crush", colorVar: "var(--agent-crush)" },
};

const SIZE_MAP = {
  sm: { dot: 6, text: "var(--text-xs)" },
  md: { dot: 10, text: "var(--text-sm)" },
  lg: { dot: 14, text: "var(--text-base)" },
};

export function AgentIndicator({
  agent,
  showLabel = true,
  size = "md",
  className = "",
}: AgentIndicatorProps) {
  if (!agent) return null;

  const normalizedAgent = agent.toLowerCase();
  const config = AGENT_CONFIG[normalizedAgent] || {
    label: agent,
    colorVar: "var(--text-tertiary)",
  };
  const sizeConfig = SIZE_MAP[size];

  return (
    <span className={`agent-indicator ${className}`} style={{ fontSize: sizeConfig.text }}>
      <span
        className="agent-indicator-dot"
        style={{
          width: sizeConfig.dot,
          height: sizeConfig.dot,
          backgroundColor: config.colorVar,
          borderRadius: "50%",
          display: "inline-block",
        }}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export default AgentIndicator;
