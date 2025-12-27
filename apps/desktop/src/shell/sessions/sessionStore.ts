/**
 * Session Store - In-memory store with localStorage persistence
 */
import type { AppId } from "../plugins/types";
import type { Session, SessionFilter, SessionStatus } from "./types";

const STORAGE_KEY = "cyntra:sessions";
const DATA_VERSION = 1;

function generateId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private activeSessionId: string | null = null;
  private activeAppId: AppId | null = null;
  private listeners: Set<() => void> = new Set();
  private saveScheduled = false;
  private legacyRecentWorldsRaw: string | null = null;
  // Cache for getSessions to satisfy useSyncExternalStore's referential equality requirement
  private sessionsCache: Map<string, Session[]> = new Map();
  private sessionsCacheVersion = 0;

  constructor() {
    this.load();
  }

  // === Persistence ===

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version === DATA_VERSION && Array.isArray(data.sessions)) {
          this.sessions = new Map(data.sessions.map((s: Session) => [s.id, s]));
          this.activeSessionId = data.activeSessionId ?? null;
          this.activeAppId = data.activeAppId ?? null;
        }
      }
      // Migrate legacy recent-worlds if no sessions exist
      if (this.sessions.size === 0) {
        this.migrateLegacyWorlds();
      }
    } catch (e) {
      console.warn("[SessionStore] Failed to load:", e);
    }
  }

  private migrateLegacyWorlds(): void {
    try {
      const raw = localStorage.getItem("cyntra:recent-worlds");
      this.legacyRecentWorldsRaw = raw;
      if (raw) {
        const worlds = JSON.parse(raw);
        if (Array.isArray(worlds)) {
          const now = Date.now();
          worlds.forEach((w: { id: string; name?: string; createdAt?: number }, i: number) => {
            const session: Session = {
              id: w.id || generateId(),
              appId: "universe",
              projectKey: "default",
              title: w.name || `World ${i + 1}`,
              pinned: false,
              archived: false,
              status: "idle",
              data: w,
              dataVersion: 1,
              createdAt: w.createdAt || now - i * 1000,
              updatedAt: now,
              lastOpenedAt: now - i * 1000,
            };
            this.sessions.set(session.id, session);
          });
          this.scheduleSave();
        }
      }
    } catch (e) {
      console.warn("[SessionStore] Failed to migrate legacy worlds:", e);
    }
  }

  /**
   * Sync Universe sessions from the legacy `cyntra:recent-worlds` store.
   * This keeps the session drawer aligned with worlds created by the existing WorldBuilder.
   */
  syncLegacyRecentWorlds(): void {
    try {
      const raw = localStorage.getItem("cyntra:recent-worlds");
      if (raw === this.legacyRecentWorldsRaw) return;
      this.legacyRecentWorldsRaw = raw;

      if (!raw) return;
      const worlds = JSON.parse(raw);
      if (!Array.isArray(worlds)) return;

      const now = Date.now();
      let changed = false;

      for (const w of worlds) {
        if (!w || typeof w !== "object") continue;
        const world = w as {
          id?: unknown;
          name?: unknown;
          status?: unknown;
          generation?: unknown;
          fitness?: unknown;
          updatedAt?: unknown;
          createdAt?: unknown;
          lastPrompt?: unknown;
        };

        const id =
          typeof world.id === "string" && world.id.trim().length > 0 ? world.id : generateId();
        const title =
          typeof world.name === "string" && world.name.trim().length > 0 ? world.name : "World";

        const status: SessionStatus =
          world.status === "building"
            ? "running"
            : world.status === "failed"
              ? "error"
              : world.status === "complete"
                ? "completed"
                : "idle";

        const generation = typeof world.generation === "number" ? world.generation : undefined;
        const bestFitness = typeof world.fitness === "number" ? world.fitness : undefined;

        const existing = this.sessions.get(id);
        if (!existing) {
          const createdAt = typeof world.createdAt === "number" ? world.createdAt : now;
          const updatedAt = typeof world.updatedAt === "number" ? world.updatedAt : now;

          const session: Session = {
            id,
            appId: "universe",
            projectKey: "default",
            title,
            subtitle:
              typeof world.lastPrompt === "string" && world.lastPrompt.trim().length > 0
                ? world.lastPrompt
                : undefined,
            pinned: false,
            archived: false,
            status,
            data: world,
            dataVersion: 1,
            createdAt,
            updatedAt,
            lastOpenedAt: updatedAt,
            generation,
            bestFitness,
          };
          this.sessions.set(id, session);
          changed = true;
          continue;
        }

        const next: Session = {
          ...existing,
          title,
          subtitle:
            typeof world.lastPrompt === "string" && world.lastPrompt.trim().length > 0
              ? world.lastPrompt
              : existing.subtitle,
          status,
          data: world,
          updatedAt: Date.now(),
          generation,
          bestFitness,
        };

        // Avoid churn when nothing meaningful changed
        const changedFields =
          next.title !== existing.title ||
          next.subtitle !== existing.subtitle ||
          next.status !== existing.status ||
          next.generation !== existing.generation ||
          next.bestFitness !== existing.bestFitness;

        if (changedFields) {
          this.sessions.set(id, next);
          changed = true;
        }
      }

      if (changed) {
        this.scheduleSave();
        this.notify();
      }
    } catch (e) {
      console.warn("[SessionStore] Failed to sync legacy worlds:", e);
    }
  }

  private scheduleSave(): void {
    if (this.saveScheduled) return;
    this.saveScheduled = true;
    setTimeout(() => {
      this.saveNow();
      this.saveScheduled = false;
    }, 500);
  }

  private saveNow(): void {
    try {
      const data = {
        version: DATA_VERSION,
        sessions: Array.from(this.sessions.values()),
        activeSessionId: this.activeSessionId,
        activeAppId: this.activeAppId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[SessionStore] Failed to save:", e);
    }
  }

  // === Subscriptions ===

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    // Invalidate cache on any state change
    this.sessionsCache.clear();
    this.sessionsCacheVersion++;
    this.listeners.forEach((fn) => fn());
  }

  // === State Getters ===

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  getActiveAppId(): AppId | null {
    return this.activeAppId;
  }

  getSession(id: string): Session | null {
    return this.sessions.get(id) ?? null;
  }

  getSessions(filter?: SessionFilter): Session[] {
    // Create a cache key from filter
    const cacheKey = filter
      ? `${filter.appId ?? ""}_${filter.pinned ?? ""}_${filter.archived ?? ""}_${filter.status ?? ""}`
      : "__all__";

    // Return cached result if available (maintains referential equality for useSyncExternalStore)
    const cached = this.sessionsCache.get(cacheKey);
    if (cached) return cached;

    let result = Array.from(this.sessions.values());

    if (filter?.appId) {
      result = result.filter((s) => s.appId === filter.appId);
    }
    if (filter?.pinned !== undefined) {
      result = result.filter((s) => s.pinned === filter.pinned);
    }
    if (filter?.archived !== undefined) {
      result = result.filter((s) => s.archived === filter.archived);
    }
    if (filter?.status) {
      result = result.filter((s) => s.status === filter.status);
    }

    // Sort by pinned first, then by lastOpenedAt desc
    result = result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastOpenedAt - a.lastOpenedAt;
    });

    // Cache and return
    this.sessionsCache.set(cacheKey, result);
    return result;
  }

  // === Mutations ===

  createSession(appId: AppId, title?: string, data?: unknown): Session {
    const now = Date.now();
    const session: Session = {
      id: generateId(),
      appId,
      projectKey: "default",
      title: title || `New ${appId} session`,
      pinned: false,
      archived: false,
      status: "idle" as SessionStatus,
      data: data ?? null,
      dataVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    this.scheduleSave();
    this.notify();
    return session;
  }

  updateSession(id: string, updates: Partial<Session>): void {
    const session = this.sessions.get(id);
    if (!session) return;

    const updated = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };
    this.sessions.set(id, updated);
    this.scheduleSave();
    this.notify();
  }

  deleteSession(id: string): void {
    if (!this.sessions.has(id)) return;
    this.sessions.delete(id);
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    this.scheduleSave();
    this.notify();
  }

  setActiveSession(id: string | null): void {
    if (id && !this.sessions.has(id)) return;
    if (this.activeSessionId === id) return;

    this.activeSessionId = id;
    if (id) {
      const session = this.sessions.get(id);
      if (session) {
        // Update last opened without triggering nested notify storms
        const updated: Session = { ...session, lastOpenedAt: Date.now(), updatedAt: Date.now() };
        this.sessions.set(id, updated);
      }
    }
    this.scheduleSave();
    this.notify();
  }

  setActiveApp(appId: AppId): void {
    if (this.activeAppId === appId) return;
    this.activeAppId = appId;
    // Clear active session if it's from a different app
    if (this.activeSessionId) {
      const session = this.sessions.get(this.activeSessionId);
      if (session && session.appId !== appId) {
        this.activeSessionId = null;
      }
    }
    this.scheduleSave();
    this.notify();
  }

  togglePin(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.updateSession(id, { pinned: !session.pinned });
  }

  archiveSession(id: string): void {
    this.updateSession(id, { archived: true });
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    this.notify();
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
