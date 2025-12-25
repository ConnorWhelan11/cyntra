import { useMemo, useRef, useEffect } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force-3d";
import type { ConstellationNode, ConstellationEdge } from "./useConstellationState";

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  // Extras for simulation
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

interface LayoutEdge {
  source: string | LayoutNode;
  target: string | LayoutNode;
  strength: number;
}

export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Force-directed 3D layout for constellation nodes.
 * Uses d3-force-3d for physics simulation.
 */
export function useConstellationLayout(
  nodes: ConstellationNode[],
  edges: ConstellationEdge[]
): Map<string, NodePosition> {
  // Cache the previous layout to enable smooth transitions
  const prevPositionsRef = useRef<Map<string, NodePosition>>(new Map());

  const positions = useMemo(() => {
    if (nodes.length === 0) {
      return new Map<string, NodePosition>();
    }

    const hashString = (input: string): number => {
      // FNV-1a 32-bit
      let hash = 2166136261;
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };

    const mulberry32 = (seed: number) => {
      let t = seed;
      return () => {
        t += 0x6D2B79F5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
    };

    // Initialize node positions
    // Use previous positions if available, otherwise random
    const layoutNodes: LayoutNode[] = nodes.map((node) => {
      const prev = prevPositionsRef.current.get(node.id);
      if (prev) {
        return {
          id: node.id,
          x: prev.x,
          y: prev.y,
          z: prev.z,
        };
      }

      // Initial placement: deterministic pseudo-random distribution for new nodes
      const rnd = mulberry32(hashString(node.id));
      const angle = rnd() * Math.PI * 2;
      const radius = 2 + rnd() * 2;
      const height = (rnd() - 0.5) * 4;

      return {
        id: node.id,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: height,
      };
    });

    // Create edges for simulation
    const layoutEdges: LayoutEdge[] = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      strength: edge.strength,
    }));

    // Run force simulation
    const simulation = forceSimulation(layoutNodes, 3)
      .force(
        "link",
        forceLink(layoutEdges)
          .id((d: LayoutNode) => d.id)
          .distance((d: LayoutEdge) => {
            // Shorter links for same-issue, longer for dependencies
            return d.strength > 0.7 ? 1.5 : 3;
          })
          .strength((d: LayoutEdge) => d.strength * 0.5)
      )
      .force(
        "charge",
        forceManyBody()
          .strength(-50)
          .distanceMax(15)
      )
      .force("center", forceCenter(0, 0, 0))
      .force(
        "collide",
        forceCollide()
          .radius(0.8)
          .strength(0.7)
      )
      .stop();

    // Run simulation for fixed iterations
    const iterations = Math.min(300, 100 + nodes.length * 2);
    for (let i = 0; i < iterations; i++) {
      simulation.tick();
    }

    // Extract final positions
    const result = new Map<string, NodePosition>();
    for (const node of layoutNodes) {
      result.set(node.id, {
        x: node.x,
        y: node.y,
        z: node.z,
      });
    }

    return result;
  }, [nodes, edges]);

  // Update cache for next render
  useEffect(() => {
    prevPositionsRef.current = positions;
  }, [positions]);

  return positions;
}

/**
 * Get camera target position for a node (offset towards camera)
 */
export function getCameraTargetForNode(
  nodeId: string,
  positions: Map<string, NodePosition>
): [number, number, number] | null {
  const pos = positions.get(nodeId);
  if (!pos) return null;
  return [pos.x, pos.y, pos.z];
}
