/**
 * Glia Missions v0.1 — Persistence
 * LocalStorage adapter for mission state persistence
 */

import type { MissionPersistenceAdapter, MissionRunId, MissionState } from "./types";

const STORAGE_KEY_PREFIX = "glia-mission-run:";
const RUNS_INDEX_KEY = "glia-mission-runs";

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Fallback Storage (for SSR/no localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const createInMemoryStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };
};

function getStorage(): Storage | ReturnType<typeof createInMemoryStorage> {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      // Test if localStorage is actually available
      localStorage.setItem("__test__", "test");
      localStorage.removeItem("__test__");
      return localStorage;
    } catch {
      // localStorage is not available (e.g., private browsing)
      return createInMemoryStorage();
    }
  }
  return createInMemoryStorage();
}

// ─────────────────────────────────────────────────────────────────────────────
// LocalStorage Persistence Adapter
// ─────────────────────────────────────────────────────────────────────────────

export function createLocalStoragePersistenceAdapter(): MissionPersistenceAdapter {
  const storage = getStorage();

  const updateRunsIndex = (runId: MissionRunId, action: "add" | "remove") => {
    const indexStr = storage.getItem(RUNS_INDEX_KEY);
    let runs: MissionRunId[] = [];
    
    if (indexStr) {
      try {
        runs = JSON.parse(indexStr) as MissionRunId[];
      } catch {
        runs = [];
      }
    }

    if (action === "add" && !runs.includes(runId)) {
      runs.push(runId);
    } else if (action === "remove") {
      runs = runs.filter((id) => id !== runId);
    }

    storage.setItem(RUNS_INDEX_KEY, JSON.stringify(runs));
  };

  return {
    load: (runId: MissionRunId): MissionState | null => {
      const key = `${STORAGE_KEY_PREFIX}${runId}`;
      const data = storage.getItem(key);
      
      if (!data) return null;

      try {
        return JSON.parse(data) as MissionState;
      } catch {
        console.warn(`[MissionPersistence] Failed to parse state for ${runId}`);
        return null;
      }
    },

    save: (state: MissionState): void => {
      const key = `${STORAGE_KEY_PREFIX}${state.runId}`;
      
      try {
        storage.setItem(key, JSON.stringify(state));
        updateRunsIndex(state.runId, "add");
      } catch (error) {
        console.warn(`[MissionPersistence] Failed to save state for ${state.runId}:`, error);
      }
    },

    clear: (runId: MissionRunId): void => {
      const key = `${STORAGE_KEY_PREFIX}${runId}`;
      storage.removeItem(key);
      updateRunsIndex(runId, "remove");
    },

    listRuns: (): MissionRunId[] => {
      const indexStr = storage.getItem(RUNS_INDEX_KEY);
      if (!indexStr) return [];

      try {
        return JSON.parse(indexStr) as MissionRunId[];
      } catch {
        return [];
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// No-Op Persistence Adapter (for Storybook/testing)
// ─────────────────────────────────────────────────────────────────────────────

export function createNoOpPersistenceAdapter(): MissionPersistenceAdapter {
  return {
    load: () => null,
    save: () => {},
    clear: () => {},
    listRuns: () => [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export const defaultPersistenceAdapter = createLocalStoragePersistenceAdapter();

