import React, { useEffect, useMemo, useState } from "react";
import type { AgentState } from "@/types";
import { AgentLog } from "../AgentLog";

interface ProcessTransparencyPanelProps {
  agents: AgentState[];
  activeAgentId?: string;
  onAgentSelect?: (agentId: string) => void;
  isSpeculating?: boolean;
  leadingAgentId?: string;
  winnerAgentId?: string;
}

const TOOLCHAIN_NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  crush: "Crush",
};

export function ProcessTransparencyPanel({
  agents,
  activeAgentId,
  onAgentSelect,
  isSpeculating = false,
  leadingAgentId,
  winnerAgentId,
}: ProcessTransparencyPanelProps) {
  const preferredAgentId = winnerAgentId ?? leadingAgentId ?? agents[0]?.id ?? null;
  const [internalAgentId, setInternalAgentId] = useState<string | null>(
    activeAgentId ?? preferredAgentId
  );

  const resolvedAgentId = activeAgentId ?? internalAgentId;

  useEffect(() => {
    if (activeAgentId) {
      setInternalAgentId(activeAgentId);
    }
  }, [activeAgentId]);

  useEffect(() => {
    if (agents.length === 0) return;
    if (resolvedAgentId && agents.some((agent) => agent.id === resolvedAgentId)) return;
    const fallbackId = winnerAgentId ?? leadingAgentId ?? agents[0].id;
    setInternalAgentId(fallbackId);
  }, [agents, leadingAgentId, resolvedAgentId, winnerAgentId]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (a.id === winnerAgentId) return -1;
      if (b.id === winnerAgentId) return 1;
      if (a.id === leadingAgentId) return -1;
      if (b.id === leadingAgentId) return 1;
      return b.fitness - a.fitness;
    });
  }, [agents, leadingAgentId, winnerAgentId]);

  const activeAgent = sortedAgents.find((agent) => agent.id === resolvedAgentId) ?? sortedAgents[0];

  const handleSelect = (agentId: string) => {
    if (!activeAgentId) {
      setInternalAgentId(agentId);
    }
    onAgentSelect?.(agentId);
  };

  if (agents.length === 0) {
    return (
      <div className="process-transparency process-transparency--empty">
        <div className="process-transparency-empty">
          <span className="process-transparency-empty-icon">...</span>
          <span>Waiting for agents to start...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="process-transparency">
      <div className="process-transparency-header">
        <span className="process-transparency-title">Process Transparency</span>
        {isSpeculating && <span className="process-transparency-badge">Speculate+Vote</span>}
      </div>
      <div className="process-transparency-body">
        <div className="process-transparency-agent-list">
          {sortedAgents.map((agent) => {
            const isActive = agent.id === activeAgent?.id;
            const isLeading = agent.id === leadingAgentId && !winnerAgentId;
            const isWinner = agent.id === winnerAgentId;
            const toolchainName = TOOLCHAIN_NAMES[agent.toolchain] ?? agent.toolchain;
            return (
              <button
                key={agent.id}
                className={`process-transparency-agent ${isActive ? "active" : ""}`}
                onClick={() => handleSelect(agent.id)}
              >
                <span className="process-transparency-agent-name">{toolchainName}</span>
                <span className="process-transparency-agent-fitness">
                  {agent.fitness.toFixed(2)}
                </span>
                {isLeading && <span className="process-transparency-agent-badge">Leading</span>}
                {isWinner && <span className="process-transparency-agent-badge">Winner</span>}
              </button>
            );
          })}
        </div>
        <div className="process-transparency-log">
          {activeAgent ? (
            <AgentLog events={activeAgent.events} agentId={activeAgent.id} maxEvents={200} />
          ) : (
            <div className="process-transparency-log-empty">
              <span>No telemetry events yet...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProcessTransparencyPanel;
