import type { MemoryItem, MemoryLink } from "@/types";

export type LifecycleMemoryType = MemoryItem["type"];
export type LifecycleMemoryScope = MemoryItem["scope"];
export type LifecycleLinkType = MemoryLink["type"];

export interface LifecycleRun {
  run_id: string;
  created_at: string; // ISO
}

export interface ExtractedMemoryShard {
  temp_id: string;
  run_id: string;
  text: string;
  type: LifecycleMemoryType;
  provisional_importance: number; // 0..1
}

export interface AgentMemoryRecord {
  id: string;
  text: string;
  type: LifecycleMemoryType;
  scope: LifecycleMemoryScope;
  importance: number; // 0..1
  accessed_count: number;
  created_run_id: string;
  last_access_run_id: string;
  agent: string;
}

export interface MemoryLinkRecord {
  a: string;
  b: string;
  link_type: LifecycleLinkType;
}

export interface MockLifecycleDataset {
  runs: LifecycleRun[];
  extracted: ExtractedMemoryShard[];
  memories: AgentMemoryRecord[];
  links: MemoryLinkRecord[];
}

function hashToUint32(seed: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function shortTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

const TYPE_POOL: LifecycleMemoryType[] = [
  "pattern",
  "failure",
  "dynamic",
  "context",
  "playbook",
  "frontier",
];
const AGENT_POOL = ["claude", "codex", "opencode", "crush"] as const;

const TEXT_BANK: Record<LifecycleMemoryType, readonly string[]> = {
  pattern: [
    "Prefer deterministic seeds for renders; pin versions before tuning prompts.",
    "When a gate fails, minimize the diff: fix inputs before changing critics.",
    "Treat routing rules as contracts: labels control toolchains and gates.",
  ],
  failure: [
    "Non-determinism detected: seed drift across runs; stabilize RNG plumbing.",
    "Workcell isolation broke: leaked state from previous worktree.",
    "Vector store merge collapsed unrelated shards; tighten dedup threshold.",
  ],
  dynamic: [
    "Exploration band too narrow; increase temperature until trap probability drops.",
    "ΔV slope suggests exploitation; schedule speculative branches sparingly.",
    "Action entropy indicates oscillation; reduce parallelism for stability.",
  ],
  context: [
    "Beads in `.beads/issues.jsonl` are the source of truth; avoid manual edits.",
    "Runs are persisted under `.cyntra/runs/<run_id>/` with proofs and artifacts.",
    "Blender rendering is CPU-only with fixed seeds for determinism.",
  ],
  playbook: [
    "If pytest fails, reproduce in a clean workcell and bisect recent changes.",
    "For gate regressions, capture proof pack: renders + critics + verdict.",
    "When links look wrong, inspect instance_of chains before supersedes.",
  ],
  frontier: [
    "Promote only non-dominated memories: maximize quality and determinism.",
    "Cull stale patterns when access count decays across multiple releases.",
    "A memory earns a crown when adopted by multiple agents and reused.",
  ],
};

export function createMockLifecycleDataset(seed: string): MockLifecycleDataset {
  const rng = mulberry32(hashToUint32(seed));

  const runCount = 10;
  const baseRun = 80 + Math.floor(rng() * 25);
  const baseTime = Date.parse("2025-12-01T00:00:00Z") + Math.floor(rng() * 14) * 86400000;

  const runs: LifecycleRun[] = Array.from({ length: runCount }, (_, i) => {
    const runNumber = baseRun + i;
    return {
      run_id: pad3(runNumber),
      created_at: new Date(baseTime + i * 6 * 60 * 60 * 1000).toISOString(),
    };
  });

  const extracted: ExtractedMemoryShard[] = [];
  runs.forEach((run) => {
    const shardCount = 7 + Math.floor(rng() * 7);
    for (let i = 0; i < shardCount; i++) {
      const type = pick(rng, TYPE_POOL);
      const text = pick(rng, TEXT_BANK[type]);
      extracted.push({
        temp_id: `tmp-${run.run_id}-${pad3(i)}`,
        run_id: run.run_id,
        text,
        type,
        provisional_importance: clamp01(0.2 + rng() * 0.8),
      });
    }
  });

  const memoryCount = 26;
  const memories: AgentMemoryRecord[] = Array.from({ length: memoryCount }, (_, i) => {
    const type = pick(rng, TYPE_POOL);
    const scope: LifecycleMemoryScope = rng() < 0.34 ? "collective" : "individual";
    const createdRun = pick(rng, runs);
    const lastAccessRun = pick(rng, runs);

    const importance = clamp01(0.22 + Math.pow(rng(), 0.55) * 0.78);
    const accessedCount = Math.floor(1 + Math.pow(rng(), 0.35) * 48);

    const agent = pick(rng, AGENT_POOL);
    const text = pick(rng, TEXT_BANK[type]);

    return {
      id: `mem-${pad3(baseRun)}-${pad3(i + 1)}`,
      text,
      type,
      scope,
      importance,
      accessed_count: accessedCount,
      created_run_id: createdRun.run_id,
      last_access_run_id: lastAccessRun.run_id,
      agent,
    };
  });

  const runIndexById = new Map(runs.map((r, i) => [r.run_id, i] as const));

  const links: MemoryLinkRecord[] = [];

  // Instance_of: individual memories point to a collective archetype of same type.
  const archetypeByType = new Map<LifecycleMemoryType, string>();
  TYPE_POOL.forEach((type) => {
    const archetype = memories.find((m) => m.type === type && m.scope === "collective");
    if (archetype) archetypeByType.set(type, archetype.id);
  });
  memories.forEach((m) => {
    if (m.scope !== "individual") return;
    const archetypeId = archetypeByType.get(m.type);
    if (!archetypeId) return;
    if (rng() < 0.65) {
      links.push({ a: m.id, b: archetypeId, link_type: "instance_of" });
    }
  });

  // Supersedes: newer memories supersede older ones within the same type.
  TYPE_POOL.forEach((type) => {
    const sameType = memories
      .filter((m) => m.type === type)
      .slice()
      .sort((a, b) => {
        const ia = runIndexById.get(a.created_run_id) ?? 0;
        const ib = runIndexById.get(b.created_run_id) ?? 0;
        return ia - ib;
      });
    for (let i = 1; i < sameType.length; i += 2) {
      const older = sameType[i - 1];
      const newer = sameType[i];
      links.push({ a: newer.id, b: older.id, link_type: "supersedes" });
    }
  });

  // A few cross-links for texture, still hidden unless focused.
  for (let i = 0; i < 6; i++) {
    const a = pick(rng, memories);
    const b = pick(rng, memories);
    if (a.id === b.id) continue;
    const linkType: LifecycleLinkType = rng() < 0.5 ? "derived_from" : "related_to";
    links.push({ a: a.id, b: b.id, link_type: linkType });
  }

  return { runs, extracted, memories, links };
}

export function createMockLifecycleAtlasMemories(seed: string): {
  dataset: MockLifecycleDataset;
  memories: MemoryItem[];
} {
  const dataset = createMockLifecycleDataset(seed);
  const memoryById = new Map(dataset.memories.map((m) => [m.id, m] as const));

  const linksByA = new Map<string, MemoryLink[]>();
  dataset.links.forEach((l) => {
    const target = memoryById.get(l.b);
    if (!target) return;
    const next: MemoryLink = {
      type: l.link_type,
      targetId: l.b,
      targetTitle: shortTitle(target.text),
    };
    linksByA.set(l.a, [...(linksByA.get(l.a) ?? []), next]);
  });

  const memories: MemoryItem[] = dataset.memories.map((m) => ({
    id: m.id,
    type: m.type,
    agent: m.agent,
    scope: m.scope,
    importance: m.importance,
    content: m.text,
    sourceRun: m.created_run_id,
    accessCount: m.accessed_count,
    createdAt: m.created_run_id ? `Run #${m.created_run_id}` : undefined,
    links: linksByA.get(m.id),
  }));

  return { dataset, memories };
}
