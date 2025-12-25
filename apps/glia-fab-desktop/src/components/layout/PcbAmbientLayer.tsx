"use client";

import React, {
  useMemo,
  useEffect,
  useRef,
  useCallback,
  Component,
  type ReactNode,
} from "react";
// Import directly from QuantumField source via vite alias
import {
  FieldProvider,
  FieldLayer,
  createFieldBus,
  type FieldBus,
  type FieldConfig,
  type FieldPerformanceLevel,
  getConfigForPerformance,
} from "@quantum-field";

// Error boundary to catch Three.js/R3F errors
class FieldErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PcbAmbientLayer] Three.js error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            background: "oklch(8% 0.02 260)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "red",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          PCB Error: {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Hexagonal PCB Background Substrate
 *
 * Renders a hexagonal lattice PCB shader as a background layer.
 * Uses glia-cyan palette with iridescent accents.
 */

const CYNTRA_PCB_CONFIG: Partial<FieldConfig> = {
  style: "pcb",
  latticeMode: "hex",
  paletteMode: "amber",

  // Lattice - prominent always-on background
  microGrid1: 80,
  microGrid2: 120,
  microGridStrength: 0.85,
  baseVisibility: 0.72,
  revealStrength: 1.4,
  microWarp: 0.012,

  // Lens - disabled
  lensEnabled: false,

  // Atmosphere - warm amber tones
  exposure: 1.1,
  filmic: 0.85,
  grainStrength: 0.01,
  crtStrength: 0.12,
  copperStrength: 0.22,
  accentIntensity: 0.5,
  iridescenceStrength: 0.15,
  iridescenceScale: 16,
};

interface PcbAmbientLayerProps {
  /** Disable the PCB layer entirely */
  disabled?: boolean;
  /** Performance level */
  performance?: FieldPerformanceLevel;
}

export function PcbAmbientLayer({
  disabled = false,
  performance = "medium",
}: PcbAmbientLayerProps) {
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Create bus once
  const busRef = useRef<FieldBus | null>(null);
  if (!busRef.current) {
    busRef.current = createFieldBus();
  }

  // Track mouse state for click+drag
  const isDraggingRef = useRef(false);

  const config = useMemo(
    () => ({
      ...getConfigForPerformance(performance),
      ...CYNTRA_PCB_CONFIG,
    }),
    [performance]
  );

  // Global mouse tracking for click+drag etch
  const handleMouseDown = useCallback((e: MouseEvent) => {
    isDraggingRef.current = true;
    busRef.current?.emit({
      kind: "hover",
      id: "pcb-background",
      clientX: e.clientX,
      clientY: e.clientY,
      intent: "etch",
      ts: Date.now(),
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    busRef.current?.emit({
      kind: "hover",
      id: "pcb-background",
      clientX: e.clientX,
      clientY: e.clientY,
      intent: "etch",
      ts: Date.now(),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      busRef.current?.emit({
        kind: "hover-leave",
        id: "pcb-background",
        ts: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseleave", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseleave", handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  if (disabled || prefersReducedMotion) {
    // Static gradient fallback matching void/abyss tokens
    return (
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 120% 80% at 20% 10%, oklch(12% 0.02 260), transparent),
            radial-gradient(ellipse 80% 60% at 80% 90%, oklch(10% 0.02 280), transparent),
            oklch(8% 0.02 260)
          `,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <FieldErrorBoundary>
      <FieldProvider bus={busRef.current}>
        <FieldLayer
          config={config}
          pinToViewport={true}
          zIndex={0}
          fov={50}
          cameraZ={10}
        />
      </FieldProvider>
    </FieldErrorBoundary>
  );
}
