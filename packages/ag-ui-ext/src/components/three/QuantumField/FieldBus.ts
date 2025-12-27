/**
 * Quantum Field Canvas - Signal Bus
 *
 * A lightweight external store for DOM → Field event communication.
 * Uses the useSyncExternalStore pattern for React 18+ integration.
 */

import type { FieldConfig, FieldEvent, FieldRuntimeState, Impulse, PendingUvEvent } from "./types";
import { DEFAULT_FIELD_CONFIG } from "./types";

// -----------------------------------------------------------------------------
// Bus Types
// -----------------------------------------------------------------------------

export type FieldBusListener = (state: FieldRuntimeState) => void;

export interface FieldBus {
  /** Emit a field event */
  emit: (event: FieldEvent) => void;
  /** Subscribe to state changes */
  subscribe: (listener: FieldBusListener) => () => void;
  /** Get current snapshot (for useSyncExternalStore) */
  getSnapshot: () => FieldRuntimeState;
  /** Get server snapshot (for SSR) */
  getServerSnapshot: () => FieldRuntimeState;
  /** Update configuration */
  setConfig: (config: Partial<FieldConfig>) => void;
  /** Get current configuration */
  getConfig: () => FieldConfig;
  /** Advance frame (called from useFrame) */
  tick: (deltaMs: number, currentTs: number) => void;
  /** Clear all state */
  clear: () => void;
  /** Process pending events with computed UVs (called from FieldLayer) */
  processPendingWithUv: (
    computeUv: (clientX: number, clientY: number) => { x: number; y: number } | null
  ) => void;
}

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

function createInitialState(): FieldRuntimeState {
  return {
    impulses: [],
    anchors: new Map(),
    hover: {
      active: false,
      uv: { x: 0, y: 0 },
      intent: "probe",
      velocity: { x: 0, y: 0 },
      sourceId: null,
      lastTs: 0,
    },
    frame: 0,
    pendingEvents: [],
  };
}

// -----------------------------------------------------------------------------
// Bus Factory
// -----------------------------------------------------------------------------

export function createFieldBus(initialConfig: Partial<FieldConfig> = {}): FieldBus {
  let state: FieldRuntimeState = createInitialState();
  let config: FieldConfig = { ...DEFAULT_FIELD_CONFIG, ...initialConfig };
  const listeners = new Set<FieldBusListener>();

  // Notify all listeners
  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  // Process hover event - queue for UV computation
  const handleHover = (event: FieldEvent & { kind: "hover" }) => {
    // Queue for UV computation in FieldLayer
    state = {
      ...state,
      pendingEvents: [
        ...state.pendingEvents.filter((e) => e.kind !== "hover"), // Only keep one hover pending
        {
          kind: "hover",
          id: event.id,
          clientX: event.clientX,
          clientY: event.clientY,
          intent: event.intent,
          ts: event.ts,
        },
      ],
    };
  };

  // Apply hover with computed UV
  const applyHover = (event: PendingUvEvent, uv: { x: number; y: number }) => {
    const prevHover = state.hover;

    // Compute velocity from previous position
    const dt = event.ts - prevHover.lastTs;
    const velocity =
      dt > 0 && prevHover.active
        ? {
            x: (uv.x - prevHover.uv.x) / dt,
            y: (uv.y - prevHover.uv.y) / dt,
          }
        : { x: 0, y: 0 };

    state = {
      ...state,
      hover: {
        active: true,
        uv,
        intent: event.intent || "probe",
        velocity,
        lastTs: event.ts,
        sourceId: event.id,
      },
    };
  };

  // Process hover leave event
  const handleHoverLeave = () => {
    state = {
      ...state,
      hover: {
        ...state.hover,
        active: false,
        sourceId: null,
      },
    };
  };

  // Process burst event - queue for UV computation
  const handleBurst = (event: FieldEvent & { kind: "burst" }) => {
    state = {
      ...state,
      pendingEvents: [
        ...state.pendingEvents,
        {
          kind: "burst",
          id: event.id,
          clientX: event.clientX,
          clientY: event.clientY,
          amplitude: event.amplitude,
          radius: event.radius,
          ts: event.ts,
        },
      ],
    };
  };

  // Apply burst with computed UV
  const applyBurst = (event: PendingUvEvent, uv: { x: number; y: number }) => {
    const impulse: Impulse = {
      uv,
      startTs: event.ts,
      amplitude: event.amplitude || 0.8,
      radius: event.radius || 0.1,
    };

    // Add impulse, capping at max
    const newImpulses = [...state.impulses, impulse].slice(-config.maxImpulses);

    state = {
      ...state,
      impulses: newImpulses,
    };
  };

  // Process latch event - queue for UV computation (except removes)
  const handleLatch = (event: FieldEvent & { kind: "latch" }) => {
    // Removes don't need UV computation
    if (event.mode === "remove") {
      const newAnchors = new Map(state.anchors);
      newAnchors.delete(event.anchorId);
      state = { ...state, anchors: newAnchors };
      return;
    }

    // Toggle that removes also doesn't need UV
    if (event.mode === "toggle" && state.anchors.has(event.anchorId)) {
      const newAnchors = new Map(state.anchors);
      newAnchors.delete(event.anchorId);
      state = { ...state, anchors: newAnchors };
      return;
    }

    // Queue for UV computation
    state = {
      ...state,
      pendingEvents: [
        ...state.pendingEvents,
        {
          kind: "latch",
          id: event.id,
          clientX: event.clientX,
          clientY: event.clientY,
          anchorId: event.anchorId,
          mode: event.mode,
          strength: event.strength,
          ts: event.ts,
        },
      ],
    };
  };

  // Apply latch with computed UV
  const applyLatch = (event: PendingUvEvent, uv: { x: number; y: number }) => {
    const newAnchors = new Map(state.anchors);

    newAnchors.set(event.anchorId!, {
      id: event.anchorId!,
      sourceId: event.id,
      uv,
      strength: event.strength || 1,
      createdTs: event.ts,
    });

    // Cap anchors
    if (newAnchors.size > config.maxAnchors) {
      const entries = Array.from(newAnchors.entries());
      const trimmed = entries.slice(-config.maxAnchors);
      newAnchors.clear();
      trimmed.forEach(([k, v]) => newAnchors.set(k, v));
    }

    state = {
      ...state,
      anchors: newAnchors,
    };
  };

  return {
    emit(event: FieldEvent) {
      switch (event.kind) {
        case "hover":
          handleHover(event);
          break;
        case "hover-leave":
          handleHoverLeave();
          break;
        case "burst":
          handleBurst(event);
          break;
        case "latch":
          handleLatch(event);
          break;
      }
      notify();
    },

    subscribe(listener: FieldBusListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return state;
    },

    getServerSnapshot() {
      return createInitialState();
    },

    setConfig(newConfig: Partial<FieldConfig>) {
      config = { ...config, ...newConfig };
    },

    getConfig() {
      return config;
    },

    tick(_deltaMs: number, currentTs: number) {
      // Decay impulses
      const decayThreshold = config.impulseDecayMs;
      const activeImpulses = state.impulses.filter(
        (imp) => currentTs - imp.startTs < decayThreshold
      );

      // Only update if something changed
      if (activeImpulses.length !== state.impulses.length) {
        state = {
          ...state,
          impulses: activeImpulses,
          frame: state.frame + 1,
        };
        notify();
      } else {
        state = {
          ...state,
          frame: state.frame + 1,
        };
      }
    },

    clear() {
      state = createInitialState();
      notify();
    },

    processPendingWithUv(
      computeUv: (clientX: number, clientY: number) => { x: number; y: number } | null
    ) {
      const pending = state.pendingEvents;
      if (pending.length === 0) return;

      // Process all pending events
      for (const event of pending) {
        const uv = computeUv(event.clientX, event.clientY);
        if (!uv) continue;

        switch (event.kind) {
          case "hover":
            applyHover(event, uv);
            break;
          case "burst":
            applyBurst(event, uv);
            break;
          case "latch":
            applyLatch(event, uv);
            break;
        }
      }

      // Clear pending events
      state = {
        ...state,
        pendingEvents: [],
      };

      notify();
    },
  };
}

// -----------------------------------------------------------------------------
// Singleton instance (for simple usage)
// -----------------------------------------------------------------------------

let globalBus: FieldBus | null = null;

export function getGlobalFieldBus(): FieldBus {
  if (!globalBus) {
    globalBus = createFieldBus();
  }
  return globalBus;
}
