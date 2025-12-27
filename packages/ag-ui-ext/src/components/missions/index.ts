/**
 * Glia Missions v0.1 — Component Exports
 */

// Setup
export { setupMissionSystem, defaultTools, defaultLayouts } from "./setup";

// Shell
export { MissionShell } from "./MissionShell";
export type { MissionShellProps } from "./MissionShell";

// Layouts
export { FocusSplitLayout } from "./layouts/FocusSplitLayout";
export { TabsWorkspaceLayout } from "./layouts/TabsWorkspaceLayout";
export { ExternalSidecarLayout } from "./layouts/ExternalSidecarLayout";

// Tools
export { NotesTool, NotesToolPanel } from "./tools/NotesTool";
export { DrawboardTool, DrawboardToolPanel } from "./tools/DrawboardTool";
export { PracticeQuestionTool, PracticeQuestionToolPanel } from "./tools/PracticeQuestionTool";
export { CommsTool, CommsToolPanel } from "./tools/CommsTool";

// Widgets
export { ObjectiveStepper } from "./widgets/ObjectiveStepper";
export type { ObjectiveStepperProps } from "./widgets/ObjectiveStepper";
export { FocusTimer } from "./widgets/FocusTimer";
export type { FocusTimerProps } from "./widgets/FocusTimer";
export { ProgressBar } from "./widgets/ProgressBar";
export type { ProgressBarProps } from "./widgets/ProgressBar";
export { CheckpointModal } from "./widgets/CheckpointModal";
export type { CheckpointModalProps } from "./widgets/CheckpointModal";
