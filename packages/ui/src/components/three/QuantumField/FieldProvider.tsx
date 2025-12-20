"use client";

/**
 * Quantum Field Canvas - Provider & Hooks
 *
 * Provides the FieldBus context and helper hooks for DOM components.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { FieldBus } from "./FieldBus";
import { createFieldBus } from "./FieldBus";
import { clientToNdc } from "./domMapping";
import type { FieldConfig, FieldRuntimeState } from "./types";

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

interface FieldContextValue {
  bus: FieldBus;
}

const FieldContext = createContext<FieldContextValue | null>(null);

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export interface FieldProviderProps {
  children: React.ReactNode;
  /** Initial configuration */
  config?: Partial<FieldConfig>;
  /** Optional external bus instance (for sharing across providers) */
  bus?: FieldBus;
}

export function FieldProvider({
  children,
  config,
  bus: externalBus,
}: FieldProviderProps) {
  const busRef = useRef<FieldBus | null>(null);

  // Create or use external bus
  if (!busRef.current) {
    busRef.current = externalBus ?? createFieldBus(config);
  }

  const value = useMemo(
    () => ({
      bus: busRef.current!,
    }),
    []
  );

  return (
    <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
  );
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

/**
 * Get the field bus instance
 */
export function useFieldBus(): FieldBus {
  const context = useContext(FieldContext);
  if (!context) {
    throw new Error("useFieldBus must be used within a FieldProvider");
  }
  return context.bus;
}

/**
 * Subscribe to field state changes
 * Uses useSyncExternalStore for optimal React 18+ integration
 */
export function useFieldState(): FieldRuntimeState {
  const bus = useFieldBus();
  return useSyncExternalStore(
    bus.subscribe,
    bus.getSnapshot,
    bus.getServerSnapshot
  );
}

/**
 * Get field configuration
 */
export function useFieldConfig(): FieldConfig {
  const bus = useFieldBus();
  return bus.getConfig();
}

// -----------------------------------------------------------------------------
// Surface Instrumentation Hook
// -----------------------------------------------------------------------------

export interface UseFieldSurfaceOptions {
  /** Unique identifier for this surface */
  id: string;
  /** Enable hover/probe signals */
  enableHover?: boolean;
  /** Enable click/burst signals */
  enableBurst?: boolean;
  /** Enable selection/latch signals */
  enableLatch?: boolean;
  /** Default burst amplitude */
  burstAmplitude?: number;
  /** Default burst radius */
  burstRadius?: number;
  /** Default latch strength */
  latchStrength?: number;
  /** Custom anchor ID (defaults to surface id) */
  anchorId?: string;
}

export interface UseFieldSurfaceReturn {
  /** Attach to element's onMouseEnter */
  onMouseEnter: (e: React.MouseEvent) => void;
  /** Attach to element's onMouseMove */
  onMouseMove: (e: React.MouseEvent) => void;
  /** Attach to element's onMouseLeave */
  onMouseLeave: (e: React.MouseEvent) => void;
  /** Attach to element's onClick */
  onClick: (e: React.MouseEvent) => void;
  /** Manually emit hover event */
  emitHover: (clientX: number, clientY: number, intent?: "probe" | "etch") => void;
  /** Manually emit burst event */
  emitBurst: (clientX: number, clientY: number) => void;
  /** Manually emit latch event */
  emitLatch: (clientX: number, clientY: number, mode?: "add" | "remove" | "toggle") => void;
  /** Clear latch */
  clearLatch: () => void;
}

/**
 * Hook to instrument a DOM surface for field signals
 */
export function useFieldSurface(
  options: UseFieldSurfaceOptions
): UseFieldSurfaceReturn {
  const {
    id,
    enableHover = true,
    enableBurst = true,
    enableLatch = false,
    burstAmplitude = 0.8,
    burstRadius = 0.1,
    latchStrength = 1.0,
    anchorId = id,
  } = options;

  const bus = useFieldBus();
  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const intentActiveRef = useRef(false);

  const emitHover = useCallback(
    (clientX: number, clientY: number, intent: "probe" | "etch" = "probe") => {
      if (!enableHover) return;
      const ndc = clientToNdc(clientX, clientY);
      bus.emit({
        kind: "hover",
        id,
        clientX,
        clientY,
        ndc,
        intent,
        ts: Date.now(),
      });
    },
    [bus, id, enableHover]
  );

  const emitBurst = useCallback(
    (clientX: number, clientY: number) => {
      if (!enableBurst) return;
      bus.emit({
        kind: "burst",
        id,
        clientX,
        clientY,
        amplitude: burstAmplitude,
        radius: burstRadius,
        ts: Date.now(),
      });
    },
    [bus, id, enableBurst, burstAmplitude, burstRadius]
  );

  const emitLatch = useCallback(
    (
      clientX: number,
      clientY: number,
      mode: "add" | "remove" | "toggle" = "toggle"
    ) => {
      if (!enableLatch) return;
      bus.emit({
        kind: "latch",
        id,
        anchorId,
        clientX,
        clientY,
        mode,
        strength: latchStrength,
        ts: Date.now(),
      });
    },
    [bus, id, anchorId, enableLatch, latchStrength]
  );

  const clearLatch = useCallback(() => {
    bus.emit({
      kind: "latch",
      id,
      anchorId,
      clientX: 0,
      clientY: 0,
      mode: "remove",
      strength: 0,
      ts: Date.now(),
    });
  }, [bus, id, anchorId]);

  const onMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      isHoveringRef.current = true;
      emitHover(e.clientX, e.clientY, "probe");

      // Start intent timer for etch mode
      if (intentTimerRef.current) {
        clearTimeout(intentTimerRef.current);
      }
      intentTimerRef.current = setTimeout(() => {
        if (isHoveringRef.current) {
          intentActiveRef.current = true;
        }
      }, 120);
    },
    [emitHover]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isHoveringRef.current) return;
      const intent = intentActiveRef.current || e.shiftKey ? "etch" : "probe";
      emitHover(e.clientX, e.clientY, intent);

      // Reset intent timer on move
      if (!e.shiftKey) {
        intentActiveRef.current = false;
        if (intentTimerRef.current) {
          clearTimeout(intentTimerRef.current);
        }
        intentTimerRef.current = setTimeout(() => {
          if (isHoveringRef.current) {
            intentActiveRef.current = true;
          }
        }, 120);
      }
    },
    [emitHover]
  );

  const onMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    intentActiveRef.current = false;
    if (intentTimerRef.current) {
      clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }
    bus.emit({
      kind: "hover-leave",
      id,
      ts: Date.now(),
    });
  }, [bus, id]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      emitBurst(e.clientX, e.clientY);
      if (enableLatch) {
        emitLatch(e.clientX, e.clientY, "toggle");
      }
    },
    [emitBurst, emitLatch, enableLatch]
  );

  return {
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick,
    emitHover,
    emitBurst,
    emitLatch,
    clearLatch,
  };
}

// -----------------------------------------------------------------------------
// Optional: Hook that returns no-ops if outside provider
// -----------------------------------------------------------------------------

const noopHandlers: UseFieldSurfaceReturn = {
  onMouseEnter: () => {},
  onMouseMove: () => {},
  onMouseLeave: () => {},
  onClick: () => {},
  emitHover: () => {},
  emitBurst: () => {},
  emitLatch: () => {},
  clearLatch: () => {},
};

/**
 * Hook that returns field surface handlers if inside a FieldProvider,
 * otherwise returns no-op handlers. Safe to use anywhere.
 */
export function useFieldSurfaceOptional(
  options: UseFieldSurfaceOptions
): UseFieldSurfaceReturn {
  const context = useContext(FieldContext);
  
  const {
    id,
    enableHover = true,
    enableBurst = true,
    enableLatch = false,
    burstAmplitude = 0.8,
    burstRadius = 0.1,
    latchStrength = 1.0,
    anchorId = id,
  } = options;

  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const intentActiveRef = useRef(false);

  // If no context, return no-ops
  if (!context) {
    return noopHandlers;
  }

  const bus = context.bus;

  const emitHover = (clientX: number, clientY: number, intent: "probe" | "etch" = "probe") => {
    if (!enableHover) return;
    const ndc = clientToNdc(clientX, clientY);
    bus.emit({
      kind: "hover",
      id,
      clientX,
      clientY,
      ndc,
      intent,
      ts: Date.now(),
    });
  };

  const emitBurst = (clientX: number, clientY: number) => {
    if (!enableBurst) return;
    bus.emit({
      kind: "burst",
      id,
      clientX,
      clientY,
      amplitude: burstAmplitude,
      radius: burstRadius,
      ts: Date.now(),
    });
  };

  const emitLatch = (
    clientX: number,
    clientY: number,
    mode: "add" | "remove" | "toggle" = "toggle"
  ) => {
    if (!enableLatch) return;
    bus.emit({
      kind: "latch",
      id,
      anchorId,
      clientX,
      clientY,
      mode,
      strength: latchStrength,
      ts: Date.now(),
    });
  };

  const clearLatch = () => {
    bus.emit({
      kind: "latch",
      id,
      anchorId,
      clientX: 0,
      clientY: 0,
      mode: "remove",
      strength: 0,
      ts: Date.now(),
    });
  };

  const onMouseEnter = (e: React.MouseEvent) => {
    isHoveringRef.current = true;
    emitHover(e.clientX, e.clientY, "probe");

    if (intentTimerRef.current) {
      clearTimeout(intentTimerRef.current);
    }
    intentTimerRef.current = setTimeout(() => {
      if (isHoveringRef.current) {
        intentActiveRef.current = true;
      }
    }, 120);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isHoveringRef.current) return;
    const intent = intentActiveRef.current || e.shiftKey ? "etch" : "probe";
    emitHover(e.clientX, e.clientY, intent);

    if (!e.shiftKey) {
      intentActiveRef.current = false;
      if (intentTimerRef.current) {
        clearTimeout(intentTimerRef.current);
      }
      intentTimerRef.current = setTimeout(() => {
        if (isHoveringRef.current) {
          intentActiveRef.current = true;
        }
      }, 120);
    }
  };

  const onMouseLeave = () => {
    isHoveringRef.current = false;
    intentActiveRef.current = false;
    if (intentTimerRef.current) {
      clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }
    bus.emit({
      kind: "hover-leave",
      id,
      ts: Date.now(),
    });
  };

  const onClick = (e: React.MouseEvent) => {
    emitBurst(e.clientX, e.clientY);
    if (enableLatch) {
      emitLatch(e.clientX, e.clientY, "toggle");
    }
  };

  return {
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick,
    emitHover,
    emitBurst,
    emitLatch,
    clearLatch,
  };
}

