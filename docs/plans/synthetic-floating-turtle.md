# World Builder Redesign Plan

## Summary

Refactor and enhance the World Builder feature in `apps/desktop/src/features/home/` with:

1. **Hook decomposition** - Split 1000-line monolithic hook into composable units
2. **State machine** - Explicit build lifecycle with type-safe transitions
3. **UI enhancements** - Process transparency, progressive preview, unified console
4. **Testing improvements** - Unit tests per hook, integration tests, visual regression

---

## Phase 1: Hook Decomposition

### New File Structure

```
apps/desktop/src/features/home/
  hooks/
    index.ts                      # Barrel export
    usePromptState.ts             # Prompt text, focus, validation
    useBlueprintDraft.ts          # Blueprint configuration
    useTemplateSelection.ts       # Template gallery state
    useRecentWorlds.ts            # localStorage persistence
    useWorldBuildJob.ts           # Kernel job lifecycle (start/stop)
    useWorldBuildEvents.ts        # SSE event processing
    useRefinements.ts             # Refinement queue
    useBuildStateMachine.ts       # State machine for build lifecycle
    types.ts                      # Shared hook types
  useWorldBuilder.ts              # Composed facade (same external interface)
```

### Hook Specifications

| Hook                   | Lines | Responsibilities                                    |
| ---------------------- | ----- | --------------------------------------------------- |
| `usePromptState`       | ~50   | Prompt text, focus state, validation                |
| `useBlueprintDraft`    | ~80   | Blueprint config, template defaults, tag generation |
| `useTemplateSelection` | ~60   | Template selection, mode switching                  |
| `useRecentWorlds`      | ~100  | localStorage CRUD, max 8 items                      |
| `useWorldBuildJob`     | ~80   | Tauri job lifecycle, cleanup on unmount             |
| `useWorldBuildEvents`  | ~120  | Event filtering, action mapping                     |
| `useRefinements`       | ~100  | Queue management, child issue creation              |
| `useBuildStateMachine` | ~200  | Reducer + guards + transitions                      |

### Migration Strategy

1. Create hooks directory with new files (non-breaking)
2. Implement and test each hook in isolation
3. Refactor `useWorldBuilder.ts` to compose hooks internally
4. **External interface remains unchanged** - zero breaking changes

---

## Phase 2: State Machine for Build Lifecycle

### State Transitions

```
idle → queued → scheduling → generating → rendering → critiquing
                                ↓              ↓           ↓
                            repairing ←───────┘           │
                                ↓                         │
                            exporting ────────────────────┘
                                ↓
                            voting (if speculating)
                                ↓
                            complete / failed

Any active state → paused → resume (restart) → queued
Any state → failed (on error)
```

### Implementation Approach

Using **XState library** for robust state management with devtools:

```typescript
// Install: bun add xstate @xstate/react

import { createMachine, assign } from "xstate";

const buildMachine = createMachine({
  id: "worldBuild",
  initial: "idle",
  context: {
    issueId: null,
    runId: null,
    prompt: "",
    blueprint: null,
    agents: [],
    bestFitness: 0,
    previewUrls: { concept: null, geometry: null, textured: null, final: null },
    error: null,
  },
  on: { PAUSE: "paused" },
  states: {
    idle: {
      on: { START: { target: "queued", actions: "initBuild" } },
    },
    queued: {
      on: { JOB_STARTED: { target: "scheduling", actions: "setRunId" } },
    },
    scheduling: {
      on: { WORKCELL_CREATED: { target: "generating", actions: "addAgent" } },
    },
    generating: {
      on: {
        RENDER_START: "rendering",
      },
    },
    rendering: {
      on: {
        CRITIQUE_START: "critiquing",
        PREVIEW_AVAILABLE: { actions: "updatePreview" },
      },
    },
    critiquing: {
      on: {
        REPAIR_START: "repairing",
        EXPORT_START: "exporting",
        VOTE_START: "voting",
      },
    },
    repairing: { on: { CRITIQUE_START: "critiquing" } },
    exporting: { on: { COMPLETE: "complete" } },
    voting: { on: { COMPLETE: "complete" } },
    paused: {
      on: { RESUME: "queued", CANCEL: "idle" },
    },
    complete: { on: { RESET: "idle", START: "queued" } },
    failed: { on: { RETRY: "queued", DISMISS: "idle" } },
  },
});

// Usage in hook:
import { useMachine } from "@xstate/react";
const [state, send] = useMachine(buildMachine);
```

**Pause/Resume Semantics (current kernel behavior)**

- Pause is a best-effort stop of the active job.
- Resume restarts the issue from `queued` with the same prompt/blueprint (not a true kernel resume).

### Event Mapping Contract (Kernel → UI)

| Kernel event         | Build status |
| -------------------- | ------------ |
| `schedule.computed`  | `scheduling` |
| `workcell.created`   | `generating` |
| `fab.stage.generate` | `generating` |
| `fab.stage.render`   | `rendering`  |
| `fab.stage.critics`  | `critiquing` |
| `fab.stage.repair`   | `repairing`  |
| `fab.stage.godot`    | `exporting`  |
| `speculate.voting`   | `voting`     |
| `issue.completed`    | `complete`   |
| `issue.failed`       | `failed`     |

Ordering rules:

- Filter by `issueId` before any state updates.
- Only advance forward (ignore out-of-order events that would regress state).
- Attach `telemetry.*` events to the owning agent stream without changing build status.

**Benefits of XState:**

- Visual state chart via `@xstate/inspect`
- Devtools integration for debugging (dev-only)
- Guards, actions, and services built-in
- Serializable state for persistence

Devtools wiring should be guarded behind `NODE_ENV !== "production"`.

---

## Phase 3: UI Enhancements

### 3.1 Process Transparency Panel (NEW)

**Location:** `components/ProcessTransparencyPanel.tsx`

Shows agent "thinking" stream (DeepSeek-inspired):

- Real-time event streaming per agent
- Collapsible sections
- Syntax highlighting for code/commands
- Auto-scroll with "stick to bottom" toggle
- Source: `telemetry.*` events already mirrored into the kernel event stream (`response_chunk`, `thinking`, `tool_call`, `tool_result`, `bash_command`, `bash_output`, `file_read`, `file_write`, `error`, `started`, `completed`)
- Retention: cap per-agent event buffer (e.g., last 200) and virtualize long lists to avoid perf regressions
- Fallback: if telemetry events are unavailable, show an empty state without impacting build progress UI

```tsx
<ProcessTransparencyPanel
  agents={agents}
  activeAgentId={leadingAgentId}
  onAgentSelect={setActiveAgent}
/>
```

### 3.2 Progressive Preview (FULL IMPLEMENTATION)

**Frontend:** `components/ProgressivePreview.tsx`
**Kernel:** `kernel/src/cyntra/fab/` stage emitters

**Canonical Preview Stages**

- `concept`, `geometry`, `textured`, `final` (GLB previews)
- Godot web preview stays separate in the existing game-mode toggle (`previewGodotUrl`)

#### Frontend Component

Shows asset evolution through build stages:

- Stage indicator (concept → geometry → textured → final)
- Smooth transitions between available stages
- Fallback to lower stage if current unavailable

```tsx
<ProgressivePreview
  stages={{ concept, geometry, textured, final }}
  currentStage={buildState.currentStage}
/>
```

#### Kernel Changes Required

1. **Emit preview URLs** from fab pipeline stages (GLB):
   - `fab.stage.generate` → `previewUrls.concept`, also set `previewGlbUrl`
   - `fab.stage.render` → `previewUrls.geometry`, `previewUrls.textured`, also update `previewGlbUrl` to latest
   - `fab.stage.godot` → `previewUrls.final`, plus `previewGodotUrl`

2. **New event payload fields:**

```python
# In kernel/src/cyntra/fab/pipeline.py
emit_event(EventType.FAB_STAGE_RENDER, {
    "stage": "render",
    "previewUrls": {
        "geometry": f"{preview_base_url}/preview_geometry.glb",
        "textured": f"{preview_base_url}/preview_textured.glb",
    },
    "previewGlbUrl": f"{preview_base_url}/preview_textured.glb"
})
```

3. **Publish intermediate assets** to the viewer directory with a stable URL scheme
   - Example: `viewer/assets/previews/<issue_id>/<stage>.glb`
   - Keep `previewGlbUrl`/`previewGodotUrl` for backward compatibility

Frontend handling:

- Prefer `previewUrls` when present; fall back to `previewGlbUrl`/`previewGodotUrl` when missing.
- Treat all preview fields as optional to avoid regressions during rollout.

### 3.3 Unified Prompt Console (REFACTORED)

**Changes to:** `WorldBuilderConsole.tsx`

- **Templates as prompt starters** - Chips below textarea, not separate section
- **Blueprint controls visible** - Always-visible runtime/output pills
- **Expandable advanced options** - Gates, tags in collapsible panel

### 3.4 Updated Layout

**BuildingConsole (active build):**

```
┌─────────────────────────────────────────────────────────┐
│ Header: Status • Prompt • Actions                       │
├─────────────────────────────┬───────────────────────────┤
│ Process Transparency Panel  │ Progressive Preview       │
│ (agent thinking stream)     │ (stages + 3D viewer)      │
│                             ├───────────────────────────┤
│                             │ Refinement Queue          │
├─────────────────────────────┴───────────────────────────┤
│ Footer: Refinement Input                                │
└─────────────────────────────────────────────────────────┘
```

**HomeWorldBuilder (idle):**

```
┌─────────────────────────────────────────────────────────┐
│                    Hero Section                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Unified Prompt Console                            │  │
│  │ [Textarea with embedded controls]                 │  │
│  │ [Template chips as prompt starters]               │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ Recent Worlds Row                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 4: Testing & Polish

### Test Files

```
hooks/__tests__/
  usePromptState.test.ts
  useBlueprintDraft.test.ts
  useTemplateSelection.test.ts
  useRecentWorlds.test.ts
  useWorldBuildJob.test.ts
  useWorldBuildEvents.test.ts
  useRefinements.test.ts
  useBuildStateMachine.test.ts

components/__tests__/
  ProcessTransparencyPanel.test.tsx
  ProgressivePreview.test.tsx
```

### Testing Strategy

- **Unit tests**: Each hook tested in isolation with `renderHook`
- **State machine**: All transitions + guard conditions
- **Event replay**: Deterministic event-log playback for `useWorldBuildEvents` ordering + regression safety
- **Integration**: Full build lifecycle with mocked Tauri
- **Visual**: Playwright screenshots for new UI components

---

## Critical Files to Modify

| File                                        | Action                                               |
| ------------------------------------------- | ---------------------------------------------------- |
| `src/features/home/useWorldBuilder.ts`      | Refactor to compose hooks                            |
| `src/features/home/hooks/*.ts`              | Create (8 new files)                                 |
| `src/features/home/BuildingConsole.tsx`     | Add ProcessTransparencyPanel                         |
| `src/features/home/WorldBuilderConsole.tsx` | Integrate template starters                          |
| `src/features/home/components/*.tsx`        | Create new UI components                             |
| `src/styles/building.css`                   | Add process transparency styles                      |
| `src/styles/home.css`                       | Update unified console styles                        |
| `src/types/ui.ts`                           | Add `BuildStage`, `BuildEvent`, `PreviewStage` types |

---

## Risks & Mitigations

| Risk                                     | Mitigation                                                        |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Breaking existing functionality          | Maintain exact external interface for `useWorldBuilder`           |
| State machine complexity                 | Use discriminated unions for type safety                          |
| Progressive preview needs kernel changes | Feature flag; graceful fallback to current behavior               |
| Event ordering mismatch                  | Monotonic state guards + event replay tests                       |
| Performance regression                   | Cap event buffers; profile hook re-renders; memoize appropriately |

---

## Implementation Order

1. **hooks/types.ts** - Shared types and interfaces
2. **hooks/usePromptState.ts** - Simplest hook, good starting point
3. **hooks/useBlueprintDraft.ts** - Configuration management
4. **hooks/useRecentWorlds.ts** - localStorage persistence
5. **hooks/useTemplateSelection.ts** - Template system
6. **hooks/useBuildStateMachine.ts** - Core state machine
7. **hooks/useWorldBuildEvents.ts** - Event processing
8. **hooks/useWorldBuildJob.ts** - Tauri integration
9. **hooks/useRefinements.ts** - Refinement queue
10. **Refactor useWorldBuilder.ts** - Compose all hooks
11. **ProcessTransparencyPanel.tsx** - New UI component
12. **ProgressivePreview.tsx** - Enhanced preview
13. **Update BuildingConsole.tsx** - Integrate new components
14. **Update WorldBuilderConsole.tsx** - Unified prompt console
15. **Update CSS** - New styles for transparency/preview
16. **Tests** - Unit + integration + visual

---

## User Decisions (Confirmed)

- ✅ **XState**: Full XState library with devtools (not discriminated unions)
- ✅ **Progressive Preview**: Full implementation including kernel changes
- ✅ **Templates**: Integrated as prompt starters in unified console
- ✅ **Scope**: All 4 phases to be implemented
- ✅ **Pause/Resume**: Best-effort stop; resume restarts from `queued`
- ✅ **Process Transparency Source**: `telemetry.*` events from kernel stream
- ✅ **Preview Format**: GLB for stage previews; Godot preview remains separate
- ✅ **XState Devtools**: Enabled only in dev builds
