/**
 * MutationTree - SVG-based branching visualization of genome evolution
 * Shows mutation history as an organic tree with cell-like nodes
 */

import React, { useMemo, useState, useCallback } from "react";
import type { MutationNode } from "@/types";

interface MutationTreeProps {
  history: MutationNode[];
  selectedNodeId?: string | null;
  highlightedPath?: string[];
  onNodeClick?: (node: MutationNode) => void;
  onNodeHover?: (node: MutationNode | null) => void;
  maxGenerationsVisible?: number;
  className?: string;
}

interface LayoutNode extends MutationNode {
  x: number;
  y: number;
  depth: number;
  childCount: number;
}

// Mutation type colors
const mutationColors = {
  initial: "var(--text-secondary)",
  mutation: "var(--evo-mitosis)",
  crossover: "var(--evo-dna-helix)",
  selection: "var(--evo-nucleus)",
};

// Calculate tree layout using modified Reingold-Tilford
function layoutTree(
  nodes: MutationNode[],
  maxGen: number
): Map<string, LayoutNode> {
  const layout = new Map<string, LayoutNode>();
  const _nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Group nodes by generation
  const generations = new Map<number, MutationNode[]>();
  for (const node of nodes) {
    if (node.generation > maxGen) continue;
    const gen = node.generation;
    if (!generations.has(gen)) generations.set(gen, []);
    generations.get(gen)!.push(node);
  }

  // Layout each generation
  const genKeys = Array.from(generations.keys()).sort((a, b) => a - b);
  const maxWidth = 400;
  const height = 280;
  const marginX = 40;
  const marginY = 30;

  for (let i = 0; i < genKeys.length; i++) {
    const gen = genKeys[i];
    const genNodes = generations.get(gen)!;
    const y = marginY + (i / Math.max(1, genKeys.length - 1)) * (height - 2 * marginY);

    // Sort by parent x position for visual continuity
    genNodes.sort((a, b) => {
      const parentA = a.parentId ? layout.get(a.parentId)?.x ?? 0 : 0;
      const parentB = b.parentId ? layout.get(b.parentId)?.x ?? 0 : 0;
      return parentA - parentB;
    });

    // Distribute horizontally
    const totalWidth = maxWidth - 2 * marginX;
    const spacing = genNodes.length > 1 ? totalWidth / (genNodes.length - 1) : 0;
    const startX = genNodes.length > 1 ? marginX : maxWidth / 2;

    for (let j = 0; j < genNodes.length; j++) {
      const node = genNodes[j];
      let x = startX + j * spacing;

      // Nudge towards parent position for organic feel
      if (node.parentId) {
        const parentLayout = layout.get(node.parentId);
        if (parentLayout) {
          x = x * 0.6 + parentLayout.x * 0.4;
        }
      }

      layout.set(node.id, {
        ...node,
        x,
        y,
        depth: i,
        childCount: node.children.length,
      });
    }
  }

  return layout;
}

// Generate organic curved path between nodes
function generateCurvePath(
  x1: number, y1: number,
  x2: number, y2: number,
  fitness: number
): string {
  // Bezier curve with organic wobble
  const midY = (y1 + y2) / 2;
  const wobble = (fitness - 0.5) * 20;
  const cp1x = x1 + wobble;
  const cp1y = midY - 10;
  const cp2x = x2 - wobble;
  const cp2y = midY + 10;

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

export function MutationTree({
  history,
  selectedNodeId,
  highlightedPath = [],
  onNodeClick,
  onNodeHover,
  maxGenerationsVisible = 20,
  className = "",
}: MutationTreeProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Calculate max generation to show
  const maxGen = useMemo(() => {
    if (history.length === 0) return 0;
    const maxInHistory = Math.max(...history.map(n => n.generation));
    return Math.min(maxInHistory, maxGenerationsVisible);
  }, [history, maxGenerationsVisible]);

  // Layout the tree
  const layout = useMemo(
    () => layoutTree(history, maxGen),
    [history, maxGen]
  );

  // Build edges
  const edges = useMemo(() => {
    const result: Array<{
      id: string;
      path: string;
      fitness: number;
      isHighlighted: boolean;
      mutationType: MutationNode["mutationType"];
    }> = [];

    for (const [id, node] of layout) {
      if (node.parentId) {
        const parent = layout.get(node.parentId);
        if (parent) {
          const isHighlighted = highlightedPath.includes(id) && highlightedPath.includes(node.parentId);
          result.push({
            id: `edge-${node.parentId}-${id}`,
            path: generateCurvePath(parent.x, parent.y, node.x, node.y, node.fitness),
            fitness: node.fitness,
            isHighlighted,
            mutationType: node.mutationType,
          });
        }
      }
    }

    return result;
  }, [layout, highlightedPath]);

  // Handle node interactions
  const handleNodeClick = useCallback((node: LayoutNode) => {
    onNodeClick?.(node);
  }, [onNodeClick]);

  const handleNodeHover = useCallback((node: LayoutNode | null) => {
    setHoveredNode(node?.id ?? null);
    onNodeHover?.(node);
  }, [onNodeHover]);

  if (history.length === 0) {
    return (
      <div className={`mc-panel ${className}`}>
        <div className="mc-panel-header">
          <span className="mc-panel-title">Mutation History</span>
        </div>
        <div className="p-8 flex items-center justify-center text-tertiary h-[280px]">
          <div className="text-center">
            <span className="text-3xl mb-2 block opacity-50">{"\uD83C\uDF33"}</span>
            <span>No mutation history</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mc-panel ${className}`}>
      <div className="mc-panel-header">
        <span className="mc-panel-title">Mutation History</span>
        <div className="mc-panel-actions">
          <span className="text-xs text-tertiary font-mono">
            {layout.size} nodes
          </span>
        </div>
      </div>

      <div className="p-2 overflow-hidden">
        <svg
          viewBox="0 0 400 280"
          className="w-full h-auto"
          style={{ minHeight: 200, maxHeight: 300 }}
        >
          {/* Background gradient */}
          <defs>
            <radialGradient id="tree-bg-gradient" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="var(--evo-cytoplasm)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Subtle background */}
          <rect x="0" y="0" width="400" height="280" fill="url(#tree-bg-gradient)" />

          {/* Edges */}
          <g className="edges">
            {edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke={mutationColors[edge.mutationType]}
                strokeWidth={edge.isHighlighted ? 3 : 1.5}
                strokeOpacity={edge.isHighlighted ? 0.9 : 0.4}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            ))}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {Array.from(layout.values()).map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isHovered = hoveredNode === node.id;
              const isInPath = highlightedPath.includes(node.id);
              const nodeColor = mutationColors[node.mutationType];

              // Node radius based on fitness
              const baseRadius = 4 + node.fitness * 4;
              const radius = isSelected || isHovered ? baseRadius * 1.3 : baseRadius;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node)}
                  onMouseEnter={() => handleNodeHover(node)}
                  onMouseLeave={() => handleNodeHover(null)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Generation ${node.generation}, fitness ${node.fitness.toFixed(2)}`}
                >
                  {/* Glow for selected/hovered */}
                  {(isSelected || isHovered || isInPath) && (
                    <circle
                      r={radius + 4}
                      fill={nodeColor}
                      opacity={0.3}
                      filter="url(#node-glow)"
                      className="animate-cellular-pulse"
                    />
                  )}

                  {/* Outer membrane */}
                  <circle
                    r={radius + 1}
                    fill="none"
                    stroke={isInPath ? "var(--evo-frontier)" : nodeColor}
                    strokeWidth={isSelected ? 2 : 1}
                    opacity={isSelected || isInPath ? 1 : 0.6}
                  />

                  {/* Inner cell */}
                  <circle
                    r={radius}
                    fill={node.fitness > 0.6 ? "var(--evo-high)" : node.fitness > 0.3 ? "var(--evo-mid)" : "var(--evo-low)"}
                    opacity={0.8}
                    className="transition-all duration-200"
                  />

                  {/* Nucleus dot for high fitness */}
                  {node.fitness > 0.7 && (
                    <circle
                      r={2}
                      fill="var(--evo-nucleus)"
                      className={isSelected ? "animate-nucleus-glow" : ""}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* Hover tooltip */}
          {hoveredNode && layout.has(hoveredNode) && (() => {
            const node = layout.get(hoveredNode)!;
            const tooltipX = Math.min(Math.max(node.x, 80), 320);
            const tooltipY = node.y - 35;

            return (
              <g transform={`translate(${tooltipX}, ${tooltipY})`}>
                <rect
                  x="-70"
                  y="-20"
                  width="140"
                  height="38"
                  rx="4"
                  fill="var(--obsidian)"
                  stroke="var(--slate)"
                  strokeWidth="1"
                  opacity="0.95"
                />
                <text
                  x="0"
                  y="-6"
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  Gen {node.generation} | {node.mutationType}
                </text>
                <text
                  x="0"
                  y="8"
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  Fitness: {node.fitness.toFixed(3)} ({node.fitnessChange >= 0 ? "+" : ""}{node.fitnessChange.toFixed(3)})
                </text>
              </g>
            );
          })()}

          {/* Generation axis labels */}
          <g className="labels">
            <text x="10" y="20" fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--font-mono)">
              Gen 0
            </text>
            <text x="10" y="270" fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--font-mono)">
              Gen {maxGen}
            </text>
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 border-t border-slate/50 flex items-center justify-between text-xs text-tertiary">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: mutationColors.mutation }} />
            Mutation
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: mutationColors.crossover }} />
            Crossover
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: mutationColors.selection }} />
            Selection
          </span>
        </div>
        <span className="text-tertiary">Click node for details</span>
      </div>
    </div>
  );
}

export default MutationTree;
