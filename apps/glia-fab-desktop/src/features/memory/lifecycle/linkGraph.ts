import type { LifecycleLinkType, MemoryLinkRecord } from "./mockDataset";

export interface VisibleLinkEdge {
  a: string;
  b: string;
  link_type: LifecycleLinkType;
}

export interface VisibleLinkParams {
  selectedId: string | null;
  links: readonly MemoryLinkRecord[];
  maxHops: 0 | 1 | 2;
  allowedTypes: readonly LifecycleLinkType[];
}

export function getVisibleLinkEdges(params: VisibleLinkParams): VisibleLinkEdge[] {
  const { selectedId, links, maxHops, allowedTypes } = params;
  if (!selectedId || maxHops === 0) return [];

  const allowed = new Set<LifecycleLinkType>(allowedTypes);
  const relevant = links.filter((l) => allowed.has(l.link_type));

  const adjacency = new Map<string, string[]>();
  relevant.forEach((l) => {
    adjacency.set(l.a, [...(adjacency.get(l.a) ?? []), l.b]);
    adjacency.set(l.b, [...(adjacency.get(l.b) ?? []), l.a]);
  });

  const dist = new Map<string, number>();
  dist.set(selectedId, 0);
  const queue: string[] = [selectedId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const currentDist = dist.get(current);
    if (currentDist === undefined) continue;
    if (currentDist >= maxHops) continue;

    const neighbors = adjacency.get(current) ?? [];
    neighbors.forEach((n) => {
      if (dist.has(n)) return;
      dist.set(n, currentDist + 1);
      queue.push(n);
    });
  }

  return relevant.filter((l) => {
    const da = dist.get(l.a);
    const db = dist.get(l.b);
    if (da === undefined || db === undefined) return false;

    // Keep the display minimal: only edges that advance one hop away from the selection.
    if (l.a === selectedId || l.b === selectedId) return true;
    return Math.abs(da - db) === 1 && Math.min(da, db) < maxHops;
  });
}

