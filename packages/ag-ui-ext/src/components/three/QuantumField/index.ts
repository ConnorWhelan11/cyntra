/**
 * Quantum Field Canvas
 *
 * A reactive 3D substrate for UI interactions.
 * Supports hover/probe, etch trails, burst impulses, and latched anchors.
 */

// Types
export type {
  Anchor,
  FieldBurstEvent,
  FieldConfig,
  FieldEvent,
  FieldHoverEvent,
  FieldHoverLeaveEvent,
  FieldLatchEvent,
  FieldPerformanceLevel,
  FieldRuntimeState,
  FieldStyle,
  HoverState,
  Impulse,
  PendingUvEvent,
} from "./types";

export { DEFAULT_FIELD_CONFIG, getConfigForPerformance } from "./types";

// Signal Bus
export type { FieldBus, FieldBusListener } from "./FieldBus";
export { createFieldBus, getGlobalFieldBus } from "./FieldBus";

// DOM Mapping Utilities
export {
  calculatePlaneSizeForViewport,
  clientToNdc,
  clientToPlaneUv,
  clientToUv,
  createFieldPlaneGeometry,
  getElementCenter,
  getElementNdcBounds,
  ndcToUv,
  raycastToPlaneUv,
  raycastToPlaneWorld,
} from "./domMapping";

// Provider & Hooks
export type {
  FieldProviderProps,
  UseFieldSurfaceOptions,
  UseFieldSurfaceReturn,
} from "./FieldProvider";

export {
  FieldProvider,
  useFieldBus,
  useFieldConfig,
  useFieldState,
  useFieldSurface,
  useFieldSurfaceOptional,
} from "./FieldProvider";

// Components
export type { FieldLayerProps, StandaloneFieldLayerProps } from "./FieldLayer";

export { FieldLayer, StandaloneFieldLayer } from "./FieldLayer";

// Style A - Constellation
export { ConstellationField } from "./ConstellationField";
export type { ConstellationUniforms } from "./styles/styleA";
export {
  createConstellationMaterial,
  createConstellationPointsGeometry,
  createConstellationPointsMaterial,
  createConstellationUniforms,
} from "./styles/styleA";

// Style B - PCB
export { PcbField } from "./PcbField";
export type { PcbUniforms } from "./styles/styleB";
export {
  createPcbArrowsGeometry,
  createPcbArrowsMaterial,
  createPcbMaterial,
  createPcbUniforms,
} from "./styles/styleB";

// Style C - Water
export { WaterField } from "./WaterField";
export type { WaterUniforms } from "./styles/styleC";
export { createWaterMaterial, createWaterUniforms } from "./styles/styleC";

// Trail RTT System
export { TrailRTT } from "./TrailRTT";

// Water Simulation RTT
export { WaterSimRTT } from "./WaterSimRTT";
