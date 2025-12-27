/**
 * Home feature barrel export
 */

// Main views
export { HomeWorldBuilderView } from "./HomeWorldBuilderView";
export { BuildingConsole } from "./BuildingConsole";

// Console components
export { WorldBuilderConsole } from "./WorldBuilderConsole";
export { TemplateGallery } from "./TemplateGallery";
export { TemplateCard } from "./TemplateCard";
export { RecentWorldsRow } from "./RecentWorldsRow";
export { RecentWorldCard } from "./RecentWorldCard";

// Building console components
export { AgentPanel } from "./AgentPanel";
export { AgentLog } from "./AgentLog";
export { WorldPreview } from "./WorldPreview";
export { RefinementInput } from "./RefinementInput";
export { RefinementQueue } from "./RefinementQueue";
export { ProcessTransparencyPanel } from "./components/ProcessTransparencyPanel";
export { ProgressivePreview } from "./components/ProgressivePreview";

// Hooks
export { useWorldBuilder } from "./useWorldBuilder";
export type { UseWorldBuilderConfig, WorldBuilderState } from "./useWorldBuilder";

// Data
export { WORLD_TEMPLATES, getTemplateById, getTemplatesByTag } from "./templates";
