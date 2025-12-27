/**
 * AgentPanel - Multi-agent accordion showing all parallel agents
 *
 * Displays each agent's fitness, status, and event log.
 * Highlights the leading candidate during speculation.
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import type { AgentState } from "@/types";
import { AgentLog } from "./AgentLog";

interface AgentPanelProps {
  /** All agents working on this build */
  agents: AgentState[];
  /** ID of current leading agent */
  leadingAgentId?: string;
  /** ID of winning agent (after vote) */
  winnerAgentId?: string;
  /** Whether speculation is active */
  isSpeculating: boolean;
}

/** Toolchain display names */
const TOOLCHAIN_NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  crush: "Crush",
};

/** Status indicator colors */
const STATUS_COLORS: Record<string, string> = {
  pending: "var(--text-tertiary)",
  running: "var(--color-active, #f59e0b)",
  verifying: "var(--color-info, #3b82f6)",
  passed: "var(--color-success, #22c55e)",
  failed: "var(--color-error, #ef4444)",
};

export function AgentPanel({
  agents,
  leadingAgentId,
  winnerAgentId,
  isSpeculating,
}: AgentPanelProps) {
  const collapsedByUserRef = useRef(false);

  // Track which agent accordions are expanded
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(agents[0]?.id ?? null);

  // Keep expansion stable as agents list changes
  useEffect(() => {
    if (agents.length === 0) return;
    if (expandedAgentId === null) {
      if (collapsedByUserRef.current) return;
      setExpandedAgentId(agents[0].id);
      return;
    }
    if (agents.some((a) => a.id === expandedAgentId)) return;
    setExpandedAgentId(agents[0].id);
  }, [agents, expandedAgentId]);

  // Sort agents: winner first, then leading, then by fitness
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (a.id === winnerAgentId) return -1;
      if (b.id === winnerAgentId) return 1;
      if (a.id === leadingAgentId) return -1;
      if (b.id === leadingAgentId) return 1;
      return b.fitness - a.fitness;
    });
  }, [agents, leadingAgentId, winnerAgentId]);

  // Toggle accordion
  const handleToggle = (agentId: string) => {
    setExpandedAgentId((prev) => {
      const next = prev === agentId ? null : agentId;
      collapsedByUserRef.current = next === null;
      return next;
    });
  };

  if (agents.length === 0) {
    return (
      <div className="agent-panel agent-panel--empty">
        <div className="agent-panel-empty-message">
          <span className="agent-panel-empty-icon">...</span>
          <span>Waiting for agents to start...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      {/* Header showing speculation status */}
      <div className="agent-panel-header">
        <span className="agent-panel-title">Agents</span>
        {isSpeculating && (
          <span className="agent-panel-badge agent-panel-badge--speculate">Speculate+Vote</span>
        )}
      </div>

      {/* Agent list/accordion */}
      <div className="agent-panel-list">
        {sortedAgents.map((agent) => {
          const isExpanded = expandedAgentId === agent.id;
          const isLeading = agent.id === leadingAgentId && !winnerAgentId;
          const isWinner = agent.id === winnerAgentId;
          const toolchainName = TOOLCHAIN_NAMES[agent.toolchain] ?? agent.toolchain;

          return (
            <div
              key={agent.id}
              className={`agent-panel-item ${isExpanded ? "agent-panel-item--expanded" : ""} ${
                isLeading ? "agent-panel-item--leading" : ""
              } ${isWinner ? "agent-panel-item--winner" : ""}`}
            >
              {/* Accordion header */}
              <button
                className="agent-panel-item-header"
                onClick={() => handleToggle(agent.id)}
                aria-expanded={isExpanded}
              >
                <div className="agent-panel-item-info">
                  <span
                    className="agent-panel-item-status-dot"
                    style={{ backgroundColor: STATUS_COLORS[agent.status] }}
                  />
                  <span className="agent-panel-item-name">{toolchainName}</span>
                  <span className="agent-panel-item-fitness">({agent.fitness.toFixed(2)})</span>
                  {isLeading && (
                    <span className="agent-panel-item-badge agent-panel-item-badge--leading">
                      LEADING
                    </span>
                  )}
                  {isWinner && (
                    <span className="agent-panel-item-badge agent-panel-item-badge--winner">
                      WINNER
                    </span>
                  )}
                </div>
                <span className="agent-panel-item-expand-icon">{isExpanded ? "−" : "+"}</span>
              </button>

              {/* Accordion body */}
              {isExpanded && (
                <div className="agent-panel-item-body">
                  {/* Agent status */}
                  <div className="agent-panel-item-status">
                    <span className="agent-panel-item-status-label">Status:</span>
                    <span className="agent-panel-item-status-value">{agent.status}</span>
                    {agent.currentStage && (
                      <>
                        <span className="agent-panel-item-status-label">Stage:</span>
                        <span className="agent-panel-item-status-value">{agent.currentStage}</span>
                      </>
                    )}
                  </div>

                  {/* Agent log */}
                  <AgentLog events={agent.events} agentId={agent.id} />

                  {/* Error */}
                  {agent.error && <div className="agent-panel-item-error">{agent.error}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AgentPanel;
