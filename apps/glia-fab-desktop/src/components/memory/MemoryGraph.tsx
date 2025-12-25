import React, { useMemo, useState, useRef, useEffect } from "react";
import type { MemoryItem } from "@/types";

interface MemoryGraphProps {
  memories: MemoryItem[];
  selectedId?: string | null;
  onSelect?: (memory: MemoryItem) => void;
  className?: string;
}

const TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  pattern: { color: "var(--accent-primary)", icon: "◈" },
  failure: { color: "var(--signal-error)", icon: "⚠" },
  dynamic: { color: "var(--signal-active)", icon: "◎" },
  context: { color: "var(--signal-info)", icon: "◐" },
};

const AGENT_COLORS: Record<string, string> = {
  claude: "var(--agent-claude)",
  codex: "var(--agent-codex)",
  opencode: "var(--agent-opencode)",
  crush: "var(--agent-crush)",
};

interface NodePosition {
  id: string;
  x: number;
  y: number;
  memory: MemoryItem;
}

interface Edge {
  source: string;
  target: string;
  type: string;
}

export function MemoryGraph({
  memories,
  selectedId,
  onSelect,
  className = "",
}: MemoryGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate node positions using force-directed-like layout
  const { nodes, edges } = useMemo(() => {
    if (memories.length === 0) return { nodes: [], edges: [] };

    const padding = 60;
    const availableWidth = dimensions.width - padding * 2;
    const availableHeight = dimensions.height - padding * 2;

    // Arrange nodes in a pleasing pattern based on type and agent
    const nodePositions: NodePosition[] = memories.map((memory, index) => {
      // Create clusters by type
      const typeIndex = ["pattern", "failure", "dynamic", "context"].indexOf(memory.type);
      const typeAngle = (typeIndex / 4) * Math.PI * 2 - Math.PI / 2;

      // Spread within cluster
      const clusterRadius = Math.min(availableWidth, availableHeight) * 0.3;
      const spreadAngle = (index / memories.length) * Math.PI * 0.5 + typeAngle;
      const spreadRadius = clusterRadius * (0.5 + memory.importance * 0.5);

      // Add some deterministic variation
      const jitterX = Math.sin(index * 7.3) * 30;
      const jitterY = Math.cos(index * 11.7) * 30;

      const x = dimensions.width / 2 + Math.cos(spreadAngle) * spreadRadius + jitterX;
      const y = dimensions.height / 2 + Math.sin(spreadAngle) * spreadRadius + jitterY;

      return {
        id: memory.id,
        x: Math.max(padding, Math.min(dimensions.width - padding, x)),
        y: Math.max(padding, Math.min(dimensions.height - padding, y)),
        memory,
      };
    });

    // Generate edges from memory links
    const edges: Edge[] = [];
    memories.forEach((memory) => {
      if (memory.links) {
        memory.links.forEach((link) => {
          // Only create edge if target exists in visible memories
          if (memories.some((m) => m.id === link.targetId)) {
            edges.push({
              source: memory.id,
              target: link.targetId,
              type: link.type,
            });
          }
        });
      }
    });

    return { nodes: nodePositions, edges };
  }, [memories, dimensions]);

  if (memories.length === 0) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="relative mb-4">
          <div className="w-20 h-20 rounded-full bg-obsidian border border-slate flex items-center justify-center">
            <svg className="w-8 h-8 text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="12" cy="20" r="2" />
              <circle cx="4" cy="12" r="2" />
              <circle cx="20" cy="12" r="2" />
              <path d="M12 7v2M12 15v2M7 12h2M15 12h2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <p className="text-tertiary text-sm">No memory connections to visualize</p>
      </div>
    );
  }

  const getNodeById = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div ref={containerRef} className={`h-full relative overflow-hidden ${className}`}>
      {/* Background grid pattern */}
      <svg className="absolute inset-0 pointer-events-none opacity-20">
        <defs>
          <pattern id="memory-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="0.5" fill="var(--slate)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#memory-grid)" />
      </svg>

      {/* Main SVG for edges and nodes */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          {/* Glow filters for each type */}
          {Object.entries(TYPE_CONFIG).map(([type, _config]) => (
            <filter key={type} id={`glow-${type}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}

          {/* Arrow markers for different link types */}
          <marker id="arrow-supersedes" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-primary)" fillOpacity="0.5" />
          </marker>
          <marker id="arrow-derived_from" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--signal-info)" fillOpacity="0.5" />
          </marker>
        </defs>

        {/* Render edges */}
        <g className="edges">
          {edges.map((edge, i) => {
            const source = getNodeById(edge.source);
            const target = getNodeById(edge.target);
            if (!source || !target) return null;

            const isHighlighted =
              hoveredId === edge.source ||
              hoveredId === edge.target ||
              selectedId === edge.source ||
              selectedId === edge.target;

            // Calculate control point for curved line
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const normalX = -dy * 0.2;
            const normalY = dx * 0.2;

            const strokeColor = edge.type === "supersedes"
              ? "var(--accent-primary)"
              : edge.type === "instance_of"
                ? "var(--signal-active)"
                : edge.type === "derived_from"
                  ? "var(--signal-info)"
                  : "var(--slate)";

            return (
              <g key={`${edge.source}-${edge.target}-${i}`}>
                {/* Edge path */}
                <path
                  d={`M ${source.x} ${source.y} Q ${midX + normalX} ${midY + normalY} ${target.x} ${target.y}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2 : 1}
                  strokeOpacity={isHighlighted ? 0.8 : 0.25}
                  strokeDasharray={edge.type === "related_to" ? "4 4" : "none"}
                  markerEnd={edge.type === "supersedes" || edge.type === "derived_from" ? `url(#arrow-${edge.type})` : undefined}
                  className="transition-all duration-300"
                />

                {/* Animated particle along edge when highlighted */}
                {isHighlighted && (
                  <circle r="2" fill={strokeColor} opacity="0.8">
                    <animateMotion
                      dur="2s"
                      repeatCount="indefinite"
                      path={`M ${source.x} ${source.y} Q ${midX + normalX} ${midY + normalY} ${target.x} ${target.y}`}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </g>

        {/* Render nodes */}
        <g className="nodes">
          {nodes.map((node) => {
            const typeConfig = TYPE_CONFIG[node.memory.type] || TYPE_CONFIG.pattern;
            const agentColor = AGENT_COLORS[node.memory.agent] || "var(--text-tertiary)";
            const isSelected = selectedId === node.id;
            const isHovered = hoveredId === node.id;
            const nodeSize = 20 + node.memory.importance * 16;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer"
                onClick={() => onSelect?.(node.memory)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Outer glow ring for selected */}
                {(isSelected || isHovered) && (
                  <circle
                    r={nodeSize + 8}
                    fill="none"
                    stroke={typeConfig.color}
                    strokeWidth="1"
                    strokeOpacity={isSelected ? "0.6" : "0.3"}
                    className="animate-pulse"
                  />
                )}

                {/* Background circle */}
                <circle
                  r={nodeSize}
                  fill="var(--obsidian)"
                  stroke={isSelected ? typeConfig.color : "var(--slate)"}
                  strokeWidth={isSelected ? 2 : 1}
                  className="transition-all duration-200"
                  style={{
                    filter: isSelected || isHovered ? `drop-shadow(0 0 8px ${typeConfig.color})` : "none"
                  }}
                />

                {/* Inner colored ring */}
                <circle
                  r={nodeSize - 4}
                  fill="none"
                  stroke={typeConfig.color}
                  strokeWidth="2"
                  strokeOpacity={isSelected ? 1 : 0.4}
                  strokeDasharray={`${2 * Math.PI * (nodeSize - 4) * node.memory.importance} ${2 * Math.PI * (nodeSize - 4)}`}
                  strokeDashoffset={2 * Math.PI * (nodeSize - 4) * 0.25}
                  className="transition-all duration-300"
                />

                {/* Type icon */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={typeConfig.color}
                  fontSize="14"
                  className="pointer-events-none select-none"
                >
                  {typeConfig.icon}
                </text>

                {/* Agent indicator dot */}
                <circle
                  cx={nodeSize * 0.7}
                  cy={-nodeSize * 0.7}
                  r="4"
                  fill={agentColor}
                  stroke="var(--obsidian)"
                  strokeWidth="2"
                />

                {/* Tooltip on hover */}
                {isHovered && (
                  <g transform={`translate(${nodeSize + 12}, 0)`}>
                    <rect
                      x="0"
                      y="-14"
                      width={Math.min(node.memory.content.length * 5 + 16, 200)}
                      height="28"
                      rx="6"
                      fill="var(--abyss)"
                      stroke="var(--slate)"
                    />
                    <text
                      x="8"
                      y="0"
                      dominantBaseline="central"
                      fill="var(--text-primary)"
                      fontSize="11"
                      className="pointer-events-none"
                    >
                      {node.memory.content.substring(0, 35)}
                      {node.memory.content.length > 35 ? "..." : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 text-xs text-tertiary bg-abyss/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate/30">
        <span className="font-mono uppercase tracking-wider">Types:</span>
        {Object.entries(TYPE_CONFIG).map(([type, config]) => (
          <span key={type} className="flex items-center gap-1" style={{ color: config.color }}>
            <span>{config.icon}</span>
            <span className="capitalize">{type}</span>
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="absolute top-3 right-3 text-xs font-mono text-tertiary bg-abyss/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate/30">
        <span className="text-secondary">{nodes.length}</span> nodes
        <span className="mx-2 text-slate">·</span>
        <span className="text-secondary">{edges.length}</span> edges
      </div>
    </div>
  );
}

export default MemoryGraph;
