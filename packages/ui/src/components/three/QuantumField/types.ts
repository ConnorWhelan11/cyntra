/**
 * Quantum Field Canvas - Event Types & Schemas
 *
 * Defines the signal bus events for DOM → Field communication.
 */

// -----------------------------------------------------------------------------
// Event Types (DOM → Bus)
// -----------------------------------------------------------------------------

/** Hover/probe event - emitted on mouse move over instrumented surfaces */
export interface FieldHoverEvent {
  kind: "hover";
  /** Unique identifier for the emitting element/surface */
  id: string;
  /** Client coordinates (relative to viewport) */
  clientX: number;
  clientY: number;
  /** Pre-computed NDC (optional, calculated if missing) */
  ndc?: { x: number; y: number };
  /** Intent level: probe (light hover) or etch (held/intent hover) */
  intent: "probe" | "etch";
  /** Pointer pressure (future, 0-1) */
  pressure?: number;
  /** Event timestamp */
  ts: number;
}

/** Burst event - emitted on click */
export interface FieldBurstEvent {
  kind: "burst";
  /** Unique identifier for the emitting element */
  id: string;
  /** Client coordinates */
  clientX: number;
  clientY: number;
  /** Impulse amplitude (0-1, default ~0.8) */
  amplitude: number;
  /** Impulse radius in UV space (0-1, default ~0.1) */
  radius: number;
  /** Event timestamp */
  ts: number;
}

/** Latch event - emitted when an element becomes selected/anchored */
export interface FieldLatchEvent {
  kind: "latch";
  /** Unique identifier for the emitting element */
  id: string;
  /** Anchor identifier (for multiple anchors per element) */
  anchorId: string;
  /** Mode: add, remove, or toggle the anchor */
  mode: "add" | "remove" | "toggle";
  /** Client coordinates */
  clientX: number;
  clientY: number;
  /** Anchor strength (0-1) */
  strength: number;
  /** Event timestamp */
  ts: number;
}

/** Hover leave event - emitted when pointer exits an element */
export interface FieldHoverLeaveEvent {
  kind: "hover-leave";
  /** Element that was left */
  id: string;
  /** Event timestamp */
  ts: number;
}

/** Union of all field events */
export type FieldEvent =
  | FieldHoverEvent
  | FieldBurstEvent
  | FieldLatchEvent
  | FieldHoverLeaveEvent;

// -----------------------------------------------------------------------------
// Internal Runtime State
// -----------------------------------------------------------------------------

/** A single impulse (from burst events) */
export interface Impulse {
  /** Position in UV space (0-1) */
  uv: { x: number; y: number };
  /** World position (for 3D effects) */
  world?: { x: number; y: number; z: number };
  /** Start timestamp */
  startTs: number;
  /** Amplitude (0-1) */
  amplitude: number;
  /** Radius in UV space */
  radius: number;
}

/** A persistent anchor (from latch events) */
export interface Anchor {
  /** Anchor identifier */
  id: string;
  /** Source element id */
  sourceId: string;
  /** Position in UV space */
  uv: { x: number; y: number };
  /** Anchor strength */
  strength: number;
  /** Creation timestamp */
  createdTs: number;
}

/** Current hover state */
export interface HoverState {
  /** Whether hover is active */
  active: boolean;
  /** Position in UV space */
  uv: { x: number; y: number };
  /** Intent level */
  intent: "probe" | "etch";
  /** Velocity (for etch trails) */
  velocity: { x: number; y: number };
  /** Last update timestamp */
  lastTs: number;
  /** Source element id */
  sourceId: string | null;
}

/** Pending event that needs UV computation via raycast */
export interface PendingUvEvent {
  kind: "hover" | "burst" | "latch";
  id: string;
  clientX: number;
  clientY: number;
  // Additional data depending on kind
  intent?: "probe" | "etch";
  amplitude?: number;
  radius?: number;
  anchorId?: string;
  mode?: "add" | "remove" | "toggle";
  strength?: number;
  ts: number;
}

/** Complete runtime state for the field layer */
export interface FieldRuntimeState {
  /** Active impulses (capped) */
  impulses: Impulse[];
  /** Active anchors */
  anchors: Map<string, Anchor>;
  /** Current hover state */
  hover: HoverState;
  /** Frame counter for animations */
  frame: number;
  /** Pending events that need UV computation */
  pendingEvents: PendingUvEvent[];
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/** Style identifiers */
export type FieldStyle = "constellation" | "pcb" | "water";

/** Lattice topology mode (PCB style) */
export type LatticeMode = "rect" | "hex" | "tri";

/** Palette mode for PCB style */
export type PaletteMode = "glia-cyan" | "orchid" | "amber" | "mono" | "ice";

/** Performance level */
export type FieldPerformanceLevel = "high" | "medium" | "low" | "minimal";

/** Field layer configuration */
export interface FieldConfig {
  /** Active visual style */
  style: FieldStyle;
  /** Performance level */
  performance: FieldPerformanceLevel;
  /** Enable postprocessing (bloom, etc.) */
  enablePost: boolean;
  /** Enable RTT trails (for etch) */
  enableTrails: boolean;
  /** Maximum impulses to track */
  maxImpulses: number;
  /** Maximum anchors to track */
  maxAnchors: number;
  /** Impulse decay time in ms */
  impulseDecayMs: number;
  /** Probe effect radius in UV space */
  probeRadius: number;
  /** Etch decay rate (0-1 per frame) */
  etchDecay: number;
  /** Default burst amplitude */
  burstAmplitude: number;
  /** Canvas DPR range */
  dpr: [number, number];
  /** RTT resolution (for trails/water sim) */
  rttResolution: number;
  /** Points count (for constellation style) */
  pointsCount: number;
  // --- PCB Debug Flags ---
  /** Show the PCB plane layer (debug toggle) */
  showPcbPlane: boolean;
  /** Show the arrows layer (debug toggle) */
  showArrows: boolean;
  /** Arrows blending mode: "normal" for debugging, "additive" for final look */
  arrowsBlending: "normal" | "additive";
  /** Maximum point size for arrows (prevents blowout) */
  arrowsMaxPointSize: number;
  // --- Ultra-Fine Lattice Config (PCB) ---
  /** Fine grid frequency (default ~60) */
  microGrid1: number;
  /** Ultra-fine grid frequency (default ~200) */
  microGrid2: number;
  /** Overall micro-lattice visibility (0-1) */
  microGridStrength: number;
  /** How much hover reveals the lattice (0-1) */
  revealStrength: number;
  /** Base visibility of lattice without hover (0-1, default 0.05) */
  baseVisibility: number;
  /** Domain warp amount for organic feel (0-0.1) */
  microWarp: number;
  // --- Etch Inscription Config (PCB) ---
  /** UV distortion in etched areas for engraved look (0-0.05) */
  etchDistortion: number;
  /** Etch stroke radius in UV space */
  etchRadius: number;
  /** Etch stroke strength/intensity */
  etchStrength: number;
  /** Whether to freeze etch decay (strokes persist indefinitely) */
  etchFreeze: boolean;
  // --- Scribble Mode (Storybook) ---
  /** Enable scribble mode: pointer down = continuous etch */
  scribbleMode: boolean;
  // --- Phase Lens Config (PCB) ---
  /** Enable the phase lens cursor effect */
  lensEnabled: boolean;
  /** Lens radius in UV space (default ~0.12) */
  lensRadius: number;
  /** Lens magnification factor (1.0 = no magnification) */
  lensMagnification: number;
  /** Chromatic aberration intensity on lens rim (0-1) */
  lensChromatic: number;
  /** Lens inertia/smoothing (0-1, higher = more lag) */
  lensInertia: number;
  /** How much velocity boosts lens brightness (0-1) */
  lensVelocityBoost: number;
  // --- Lattice Topology Config (PCB) ---
  /** Lattice mode: rect (default), hex, or tri */
  latticeMode: LatticeMode;
  // --- Etch Velocity Taper Config ---
  /** Minimum etch radius at high velocity */
  etchRadiusMin: number;
  /** Maximum etch radius at low velocity */
  etchRadiusMax: number;
  /** How much velocity affects etch radius (0-1) */
  etchVelocityScale: number;
  // --- Palette / Atmosphere Config (PCB) ---
  /** Color palette mode */
  paletteMode: PaletteMode;
  /** Accent color intensity (0-2, default 1.0) */
  accentIntensity: number;
  /** Iridescent interference strength (0-1) */
  iridescenceStrength: number;
  /** Iridescent interference scale (1-40) */
  iridescenceScale: number;
  /** Exposure adjustment (0.6-2.0) */
  exposure: number;
  /** Filmic tonemapping blend (0-1, 0=linear, 1=full filmic) */
  filmic: number;
  /** Film grain strength (0-0.08) */
  grainStrength: number;
  /** CRT/scanline effect strength (0-1) */
  crtStrength: number;
  /** Copper/trace layer strength (0-1, lower = less "PCB demo" feel) */
  copperStrength: number;
}

/** Default configuration */
export const DEFAULT_FIELD_CONFIG: FieldConfig = {
  style: "constellation",
  performance: "high",
  enablePost: true,
  enableTrails: true,
  maxImpulses: 24,
  maxAnchors: 8,
  impulseDecayMs: 1200,
  probeRadius: 0.08,
  etchDecay: 0.02,
  burstAmplitude: 0.8,
  dpr: [1, 2],
  rttResolution: 512,
  pointsCount: 6000,
  // PCB debug defaults - use normal blending and show both layers
  showPcbPlane: true,
  showArrows: true,
  arrowsBlending: "normal",
  arrowsMaxPointSize: 8,
  // Ultra-Fine Lattice defaults
  microGrid1: 60,
  microGrid2: 200,
  microGridStrength: 0.8,
  revealStrength: 1.0,
  baseVisibility: 0.05, // Low default for reveal-based UX, increase for always-visible background
  microWarp: 0.015,
  // Etch Inscription defaults
  etchDistortion: 0.008,
  etchRadius: 0.008,
  etchStrength: 0.9,
  etchFreeze: false,
  // Scribble mode off by default
  scribbleMode: false,
  // Phase Lens defaults
  lensEnabled: true,
  lensRadius: 0.12,
  lensMagnification: 1.0,
  lensChromatic: 0.35,
  lensInertia: 0.18,
  lensVelocityBoost: 0.6,
  // Lattice topology
  latticeMode: "rect",
  // Etch velocity taper
  etchRadiusMin: 0.004,
  etchRadiusMax: 0.015,
  etchVelocityScale: 0.5,
  // Palette / Atmosphere defaults (museum-grade out of the box)
  paletteMode: "orchid",
  accentIntensity: 1.1,
  iridescenceStrength: 0.35,
  iridescenceScale: 14,
  exposure: 1.0,
  filmic: 0.85,
  grainStrength: 0.015,
  crtStrength: 0.25,
  copperStrength: 0.15,
};

/** Get config for performance level */
export function getConfigForPerformance(
  level: FieldPerformanceLevel
): Partial<FieldConfig> {
  switch (level) {
    case "high":
      return {
        enablePost: true,
        enableTrails: true,
        dpr: [1, 2],
        rttResolution: 512,
        pointsCount: 6000,
      };
    case "medium":
      return {
        enablePost: true,
        enableTrails: true,
        dpr: [1, 1.5],
        rttResolution: 256,
        pointsCount: 3000,
      };
    case "low":
      return {
        enablePost: false,
        enableTrails: true,
        dpr: [1, 1],
        rttResolution: 256,
        pointsCount: 1500,
      };
    case "minimal":
      return {
        enablePost: false,
        enableTrails: false,
        dpr: [1, 1],
        rttResolution: 128,
        pointsCount: 500,
      };
  }
}

