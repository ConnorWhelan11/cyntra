import * as THREE from "three";
import { GraphEdge, GraphNode, LayoutOptions } from "./types";

export const CATEGORY_COLORS: Record<string, string> = {
  ADHD: "#00d4e6", // Neon Cyan (slightly desaturated from #00f0ff)
  AI: "#d000ff", // Magenta (slightly desaturated from #f000ff)
  Infrastructure: "#cfd8ff", // Cool white/blue (softer than #e0e7ff)
  Systems: "#00e08a", // Emerald (shifted from #00ff99)
  Personal: "#f4c948", // Soft Gold (shifted from #ffd700)

  // Mission Clusters
  Mission: "#00d4e6", // Default Mission = Cyan
  MissionA: "#00d4e6", // Cyan
  MissionB: "#00e08a", // Emerald
  MissionC: "#f4c948", // Gold

  // Distraction
  Distraction: "#ff4d4d", // Red/Warning

  // Generic
  Plan: "#00f0ff",
  Step: "#a0b0d0",
  Task: "#a0b0d0",
  Rest: "#a0b0d0",
  Admin: "#a0b0d0",
};

export const getCategoryColor = (category?: string) => {
  // Check direct match
  if (CATEGORY_COLORS[category || ""]) return CATEGORY_COLORS[category || ""];

  // Fallback or "Task" variants
  if (category?.startsWith("Mission")) return CATEGORY_COLORS["Mission"];

  return "#888888";
};

// Helper to get node size based on weight
export const getNodeSize = (weight: number = 0.5) => {
  const baseRadius = 0.14; // slightly bigger base
  const maxBump = 0.05; // but less spread between min/max
  return baseRadius + weight * maxBump;
};

// Layout Algorithms

export function layoutFibonacci(
  nodes: GraphNode[],
  options: LayoutOptions = {}
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  const radius = options.radius ?? 4; // Increased default radius for "Universe" feel

  nodes.forEach((node, i) => {
    // Fibonacci sphere distribution
    const phi = Math.acos(-1 + (2 * i) / nodes.length);
    const theta = Math.sqrt(nodes.length * Math.PI) * phi;

    positions.set(
      node.id,
      new THREE.Vector3(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi)
      )
    );
  });

  return positions;
}

export function layoutRing(
  nodes: GraphNode[],
  options: LayoutOptions = {}
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  const radius = options.radius ?? 4;

  // Arrange in a ring on the XZ plane
  // "Top" of the circle (negative Z?) as start?
  // Let's start at -Z (top in top-down view) and go clockwise.
  // Standard math: 0 is +X. Clockwise means decreasing angle?
  // Let's just do standard circle and rotate if needed.
  // Start at -PI/2 (top) and go clockwise (+angle in 3D usually CCW around Y).
  // Let's do: Top is -Z.

  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    // Offset by -PI/2 to start at "top" (negative Z) if we map to X/Z appropriately
    // x = sin(angle), z = -cos(angle) starts at (0, -1) and goes clockwise?
    // i=0 -> x=0, z=-1 (Top)
    // i=small -> x>0, z~-1 (Top Right) -> Clockwise

    positions.set(
      node.id,
      new THREE.Vector3(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius)
    );
  });

  return positions;
}

export function layoutCustom(nodes: GraphNode[]): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();

  nodes.forEach((node) => {
    if (node.positionHint) {
      positions.set(node.id, new THREE.Vector3(...node.positionHint));
    } else {
      positions.set(node.id, new THREE.Vector3(0, 0, 0));
    }
  });

  return positions;
}

// Force-directed layout
export function layoutForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = {}
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  const velocities = new Map<string, THREE.Vector3>();

  // Initialize
  nodes.forEach((node, i) => {
    // Use fibonacci as seed if no prev positions, to avoid initial explosion
    const phi = Math.acos(-1 + (2 * i) / nodes.length);
    const theta = Math.sqrt(nodes.length * Math.PI) * phi;
    const r = options.radius ?? 4;

    positions.set(
      node.id,
      new THREE.Vector3(
        r * Math.cos(theta) * Math.sin(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(phi)
      )
    );
    velocities.set(node.id, new THREE.Vector3(0, 0, 0));
  });

  const iterations = options.iterations ?? 120; // Increased default iterations
  const repelStrength = options.repelStrength ?? 8;
  const linkStrength = options.linkStrength ?? 0.8;
  const gravity = options.gravity ?? 0.05;
  const damping = 0.8;

  for (let i = 0; i < iterations; i++) {
    // Repulsion
    for (let j = 0; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const nodeA = nodes[j];
        const nodeB = nodes[k];
        const posA = positions.get(nodeA.id)!;
        const posB = positions.get(nodeB.id)!;

        const delta = new THREE.Vector3().subVectors(posA, posB);
        let dist = delta.length();
        if (dist === 0) {
          dist = 0.01;
          delta.set(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
          );
        }

        const force = delta
          .normalize()
          .multiplyScalar(repelStrength / (dist * dist));
        velocities.get(nodeA.id)!.add(force);
        velocities.get(nodeB.id)!.sub(force);
      }
    }

    // Attraction
    edges.forEach((edge) => {
      if (!positions.has(edge.source) || !positions.has(edge.target)) return;
      const posA = positions.get(edge.source)!;
      const posB = positions.get(edge.target)!;

      const delta = new THREE.Vector3().subVectors(posB, posA);
      const dist = delta.length();
      const idealDist = options.spacing ?? 1.5;

      const force = delta
        .normalize()
        .multiplyScalar((dist - idealDist) * linkStrength);

      velocities.get(edge.source)!.add(force);
      velocities.get(edge.target)!.sub(force);
    });

    // Gravity
    nodes.forEach((node) => {
      const pos = positions.get(node.id)!;
      const force = pos.clone().negate().multiplyScalar(gravity);
      velocities.get(node.id)!.add(force);
    });

    // Apply
    nodes.forEach((node) => {
      const vel = velocities.get(node.id)!;
      vel.multiplyScalar(damping);
      positions.get(node.id)!.add(vel);
    });
  }

  return positions;
}
