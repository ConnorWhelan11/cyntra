import type { ComponentType } from "react";

import type { GliaWorkspacePanel } from "./schema";
import { FocusTimerPanel } from "./primitives/FocusTimerPanel";
import { ObjectiveStepperPanel } from "./primitives/ObjectiveStepperPanel";
import { CheckpointModalPanel } from "./primitives/CheckpointModalPanel";
import { NotesPanel } from "./primitives/NotesPanel";
import { PracticeQuestionPanel } from "./primitives/PracticeQuestionPanel";
import { DrawboardPanel } from "./primitives/DrawboardPanel";
import { ProgressBadgesPanel } from "./primitives/ProgressBadgesPanel";
import type { AgUiWorkspaceActionHandler } from "./types";

export type GliaPanelRenderer = ComponentType<{
  panel: GliaWorkspacePanel;
  onAction?: AgUiWorkspaceActionHandler;
}>;

export const gliaComponentRegistry = {
  focus_timer: FocusTimerPanel,
  objective_stepper: ObjectiveStepperPanel,
  checkpoint_modal: CheckpointModalPanel,
  notes_panel: NotesPanel,
  practice_question: PracticeQuestionPanel,
  drawboard: DrawboardPanel,
  progress_badges: ProgressBadgesPanel,
} as const;

export type GliaComponentRegistry = typeof gliaComponentRegistry;
