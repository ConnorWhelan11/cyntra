import { z } from "zod";

const WorkspaceSlotSchema = z.enum(["primary", "secondary", "dock", "modal"]);

const FocusTimerPropsSchema = z
  .object({
    durationSeconds: z.number().int().finite().optional(),
    label: z.string().max(80).optional(),
    autoStart: z.boolean().optional(),
    mode: z.enum(["countdown", "countup"]).optional(),
  })
  .transform((raw) => ({
    durationSeconds: Math.min(7200, Math.max(60, raw.durationSeconds ?? 25 * 60)),
    label: raw.label ?? "",
    autoStart: raw.autoStart ?? false,
    mode: raw.mode ?? "countdown",
  }));

export const GliaFocusTimerPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("focus_timer"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: FocusTimerPropsSchema,
});

export type GliaFocusTimerPanel = z.infer<typeof GliaFocusTimerPanelSchema>;

const ObjectiveStepperStepSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  status: z.enum(["todo", "doing", "done"]),
});

const ObjectiveStepperPropsSchema = z
  .object({
    steps: z.array(ObjectiveStepperStepSchema).min(1).max(20),
    activeId: z.string().min(1).max(120),
    showCounts: z.boolean().optional(),
  })
  .superRefine((raw, ctx) => {
    const ids = raw.steps.map((step) => step.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Step ids must be unique",
      });
    }
    if (!unique.has(raw.activeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "activeId must match a step id",
      });
    }
  })
  .transform((raw) => ({
    ...raw,
    showCounts: raw.showCounts ?? false,
  }));

export const GliaObjectiveStepperPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("objective_stepper"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: ObjectiveStepperPropsSchema,
});

export type GliaObjectiveStepperPanel = z.infer<
  typeof GliaObjectiveStepperPanelSchema
>;

const CheckpointActionSchema = z
  .object({
    id: z.string().min(1).max(120),
    label: z.string().min(1).max(40),
    action: z.enum(["dismiss", "open_tool", "complete_step"]),
    targetId: z.string().min(1).max(120).optional(),
  })
  .superRefine((raw, ctx) => {
    if (raw.action === "open_tool" || raw.action === "complete_step") {
      if (!raw.targetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "targetId is required for open_tool/complete_step",
        });
      }
    }
  });

const CheckpointModalPropsSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(500),
  actions: z.array(CheckpointActionSchema).max(3).optional(),
});

export const GliaCheckpointModalPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("checkpoint_modal"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: CheckpointModalPropsSchema,
});

export type GliaCheckpointModalPanel = z.infer<
  typeof GliaCheckpointModalPanelSchema
>;

const NotesPanelPropsSchema = z
  .object({
    placeholder: z.string().max(120).optional(),
    template: z.enum(["blank", "cornell", "outline"]).optional(),
    initialText: z.string().max(5000).optional(),
  })
  .transform((raw) => ({
    placeholder: raw.placeholder ?? "",
    template: raw.template ?? "blank",
    initialText: raw.initialText ?? "",
  }));

export const GliaNotesPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("notes_panel"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: NotesPanelPropsSchema,
});

export type GliaNotesPanel = z.infer<typeof GliaNotesPanelSchema>;

const PracticeChoiceSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().min(1).max(160),
});

const PracticeQuestionPropsSchema = z
  .object({
    prompt: z.string().min(1).max(600),
    choices: z.array(PracticeChoiceSchema).min(2).max(6),
    revealMode: z.enum(["onSubmit", "never"]).optional(),
    answerKeyId: z.string().min(1).max(120).optional(),
  })
  .superRefine((raw, ctx) => {
    const ids = raw.choices.map((choice) => choice.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choice ids must be unique",
      });
    }
    if (raw.answerKeyId && !unique.has(raw.answerKeyId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "answerKeyId must match a choice id",
      });
    }
  })
  .transform((raw) => ({
    ...raw,
    revealMode: raw.revealMode ?? "onSubmit",
  }));

export const GliaPracticeQuestionPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("practice_question"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: PracticeQuestionPropsSchema,
});

export type GliaPracticeQuestionPanel = z.infer<
  typeof GliaPracticeQuestionPanelSchema
>;

const DrawboardPropsSchema = z
  .object({
    readOnly: z.boolean().optional(),
    initialXml: z.string().max(200_000).optional(),
    shareScope: z.enum(["local", "pod"]).optional(),
  })
  .transform((raw) => ({
    readOnly: raw.readOnly ?? false,
    initialXml: raw.initialXml ?? "",
    shareScope: raw.shareScope ?? "local",
  }));

export const GliaDrawboardPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("drawboard"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: DrawboardPropsSchema,
});

export type GliaDrawboardPanel = z.infer<typeof GliaDrawboardPanelSchema>;

const ProgressBadgeSchema = z.object({
  label: z.string().min(1).max(40),
  tone: z.enum(["cyan", "emerald", "amber", "magenta"]),
});

const ProgressStatSchema = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(20),
});

const ProgressBadgesPropsSchema = z.object({
  badges: z.array(ProgressBadgeSchema).max(8).optional(),
  stats: z.array(ProgressStatSchema).max(6).optional(),
});

export const GliaProgressBadgesPanelSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.literal("progress_badges"),
  slot: WorkspaceSlotSchema,
  title: z.string().max(120).optional(),
  props: ProgressBadgesPropsSchema,
});

export type GliaProgressBadgesPanel = z.infer<
  typeof GliaProgressBadgesPanelSchema
>;

export const GliaWorkspacePanelSchema = z.discriminatedUnion("kind", [
  GliaFocusTimerPanelSchema,
  GliaObjectiveStepperPanelSchema,
  GliaCheckpointModalPanelSchema,
  GliaNotesPanelSchema,
  GliaPracticeQuestionPanelSchema,
  GliaDrawboardPanelSchema,
  GliaProgressBadgesPanelSchema,
]);

export type GliaWorkspacePanel = z.infer<typeof GliaWorkspacePanelSchema>;

const ToastActionSchema = z.object({
  label: z.string().min(1).max(20),
  action: z.literal("open_tool"),
  targetId: z.string().min(1).max(120),
});

const ToastSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: z.enum(["info", "success", "warning", "nudge"]),
    message: z.string().min(1).max(160),
    ttlMs: z.number().int().finite().optional(),
    action: ToastActionSchema.optional(),
  })
  .transform((raw) => ({
    ...raw,
    ttlMs: Math.min(15_000, Math.max(1000, raw.ttlMs ?? 4000)),
  }));

export type GliaToast = z.infer<typeof ToastSchema>;

const HighlightSchema = z.object({
  id: z.string().min(1).max(120),
  target: z.string().min(1).max(160),
  message: z.string().min(1).max(160),
});

export type GliaHighlight = z.infer<typeof HighlightSchema>;

const WorkspaceRawSchema = z.object({
  schemaVersion: z.literal(1),
  panels: z.array(z.unknown()),
  toasts: z.array(z.unknown()).optional(),
  highlights: z.array(z.unknown()).optional(),
  meta: z
    .object({
      createdByUserId: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional(),
});

export type GliaWorkspaceState = {
  schemaVersion: 1;
  panels: GliaWorkspacePanel[];
  toasts: GliaToast[];
  highlights: GliaHighlight[];
  meta?: {
    createdByUserId?: string;
    scope?: string;
  };
};

export function sanitizeGliaWorkspaceState(
  input: unknown
): GliaWorkspaceState | null {
  const parsed = WorkspaceRawSchema.safeParse(input);
  if (!parsed.success) return null;

  const panels = parsed.data.panels
    .map((panel) => GliaWorkspacePanelSchema.safeParse(panel))
    .filter((result) => result.success)
    .map((result) => result.data);

  const toasts = (parsed.data.toasts ?? [])
    .map((toast) => ToastSchema.safeParse(toast))
    .filter((result) => result.success)
    .map((result) => result.data);

  const highlights = (parsed.data.highlights ?? [])
    .map((highlight) => HighlightSchema.safeParse(highlight))
    .filter((result) => result.success)
    .map((result) => result.data);

  return {
    schemaVersion: parsed.data.schemaVersion,
    panels,
    toasts,
    highlights,
    meta: parsed.data.meta,
  };
}
