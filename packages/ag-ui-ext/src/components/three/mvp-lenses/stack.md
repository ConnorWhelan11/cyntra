# Stack Lens (Next 1–3 Things)

> **Core Question:** "What do I do _right now_?"

## Purpose

The Stack lens is the execution interface—a minimal vertical stack showing only Now → Next → Maybe. This is where actual work happens. A timer runs for the current item, progress is tracked, and enforcement mode (via Leaks integration) can block distractions. When a task completes, Debrief triggers automatically. This lens eliminates decision fatigue by hiding everything except the immediate action.

## Entry Points (Triggers)

| Trigger                       | Source               | Initial State                   |
| ----------------------------- | -------------------- | ------------------------------- |
| Tap block in Today            | Today                | Stack loaded with block's tasks |
| "Just tell me the next thing" | Any lens, voice      | Stack with AI-selected task     |
| "Start focus session"         | Graph, Goals         | Stack with focus target         |
| Timer resumes                 | System (after pause) | Stack with paused task          |
| Quick action widget           | OS widget            | Stack with first pending task   |

## Exit Points (Destinations)

| CTA / Gesture          | Destination           | Passed State                           |
| ---------------------- | --------------------- | -------------------------------------- |
| "Zoom out"             | Today                 | `{ activeBlockId }`                    |
| "I'm distracted"       | Leaks                 | `{ stackContext, distractionTrigger }` |
| Timer ends / task done | Debrief (block-level) | `{ period: 'block', blockId }`         |
| "Show context"         | Graph                 | `{ focusNodeId: currentTaskNodeId }`   |
| "Skip all"             | Today                 | `{ skippedBlockId }`                   |
| Swipe down / back      | Today                 | —                                      |

## Visual Composition

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              ╔═══════════════════════════════╗              │
│              ║                               ║              │
│              ║        ORGO REVIEW            ║              │
│              ║     Chapter 12 Problems       ║              │
│              ║                               ║              │
│              ║     ┌─────────────────┐       ║              │
│              ║     │    42:18        │       ║              │
│              ║     │  ═══════░░░░░   │       ║              │
│              ║     └─────────────────┘       ║              │
│              ║                               ║              │
│              ║  [Pause]  [Done ✓]  [Skip →]  ║              │
│              ║                               ║              │
│              ╚═══════════════════════════════╝              │
│                           │                                 │
│                           ▼                                 │
│              ┌───────────────────────────────┐              │
│              │ Next: Practice Problems Set 3 │              │
│              └───────────────────────────────┘              │
│                           │                                 │
│                           ▼                                 │
│              ┌───────────────────────────────┐              │
│              │ Maybe: Review Chapter 11      │              │
│              │         (if time)             │              │
│              └───────────────────────────────┘              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🛡 Enforcement ON │ YouTube, Twitter blocked        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Glyph] "Deep in it. 42 minutes left. You got this."│   │
│  │         [I'm distracted]  [Zoom out]                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Stack Item Styling

| Position | Size              | Opacity | Interactivity            |
| -------- | ----------------- | ------- | ------------------------ |
| Now      | Large, full width | 1.0     | Timer, Done, Skip, Pause |
| Next     | Medium, 70% width | 0.8     | Tap to promote, reorder  |
| Maybe    | Small, 60% width  | 0.5     | Tap to promote, dismiss  |

### Timer Display

- Large countdown: `MM:SS` format
- Progress bar: elapsed / planned duration
- Color coding: Green (on track) → Amber (80%+) → Red (overtime)
- Pulse animation when <5 minutes remain

### Enforcement Badge

```
┌──────────────────────────────────────────┐
│ 🛡 Enforcement ON │ 3 sites blocked      │
│    Ends in 42:18  │ [Disable]            │
└──────────────────────────────────────────┘
```

## Glyph Behavior

| Context              | Glyph State  | Position                 | Dialogue Hooks                            |
| -------------------- | ------------ | ------------------------ | ----------------------------------------- |
| Task started         | `responding` | Bottom bar               | "Let's do this. [duration] on the clock." |
| Mid-task             | `idle`       | Minimized/hidden         | (Surfaces only on interaction)            |
| 5 min warning        | `thinking`   | Bottom bar pulses        | "5 minutes left. Wrap up or extend?"      |
| Task complete        | `success`    | Expands with celebration | "Nice work! Ready for next?"              |
| Distraction detected | `responding` | Center                   | "Looks like you're wandering. Need help?" |
| All items done       | `success`    | Full screen              | "Stack cleared! Time for a break?"        |

## Data Model

### Inputs

```typescript
interface StackLensProps {
  blockId: string; // Parent block from Today
  tasks: StackTask[]; // Ordered task list (1–3)
  enforcementState?: EnforcementState;
  currentTime: Date;
}

interface StackTask {
  id: string;
  nodeId: GraphNodeId; // Underlying graph node
  label: string;
  description?: string;
  plannedDuration: number; // Minutes
  status: "pending" | "active" | "done" | "skipped";
  startedAt?: Date;
  completedAt?: Date;
  elapsedSeconds?: number; // For pause/resume
}

interface EnforcementState {
  active: boolean;
  suppressedNodeIds: GraphNodeId[]; // Distraction nodes
  suppressedSites?: string[]; // For display
  endsAt: Date;
}
```

### Outputs

```typescript
interface StackLensOutputs {
  onTaskStart: (taskId: string) => void;
  onTaskPause: (taskId: string) => void;
  onTaskResume: (taskId: string) => void;
  onTaskComplete: (taskId: string) => void;
  onTaskSkip: (taskId: string, reason?: string) => void;
  onReorder: (orderedTaskIds: string[]) => void;
  onDistractionTrigger: () => void; // Opens Leaks
  onEnforcementToggle: (enabled: boolean) => void;
  onBlockComplete: () => void; // Triggers Debrief
}
```

### Timer Logic

```typescript
interface TimerState {
  status: "idle" | "running" | "paused" | "complete" | "overtime";
  elapsedSeconds: number;
  plannedSeconds: number;
  startedAt: Date | null;
  pausedAt: Date | null;
}

// Timer tick (every second when running)
const tick = () => {
  if (timerState.status === "running") {
    const now = Date.now();
    const elapsed = Math.floor((now - timerState.startedAt!) / 1000) + timerState.elapsedSeconds;
    setTimerState((prev) => ({
      ...prev,
      elapsedSeconds: elapsed,
      status: elapsed >= prev.plannedSeconds ? "overtime" : "running",
    }));
  }
};
```

## Interactions

| Input                | Action                               | Feedback                               |
| -------------------- | ------------------------------------ | -------------------------------------- |
| Tap "Done ✓"         | Complete current task, advance stack | Checkmark animation, next slides up    |
| Tap "Skip →"         | Skip current task, advance stack     | Task fades right, next slides up       |
| Tap "Pause"          | Pause timer                          | Timer freezes, button becomes "Resume" |
| Tap Next task        | Promote to Now                       | Cards shuffle animation                |
| Long-press task      | Open reorder mode                    | Cards become draggable                 |
| Tap "I'm distracted" | Navigate to Leaks                    | Transition with context                |
| Tap "Zoom out"       | Navigate to Today                    | Stack collapses into block             |
| Swipe task right     | Skip with quick gesture              | Same as Skip button                    |
| Timer hits 0         | Auto-trigger completion prompt       | Glyph surfaces, celebration            |

### Completion Flow

```
Timer ends
    ↓
Glyph: "Time's up! How did it go?"
    ↓
[Done ✓] → Complete task, show next
[+5 min] → Extend timer
[Skip] → Mark incomplete, show next
    ↓
If last task: → Debrief (block-level)
```

## Shared State Contract

```typescript
// Written by Stack lens
stackStore.activeTaskId: string | null
stackStore.tasks: StackTask[]
stackStore.timerState: TimerState
stackStore.blockId: string

// Read by Stack lens
todayStore.activeBlockId: string // Parent block
leaksStore.enforcementState: EnforcementState
graphStore.graph: GraphSnapshot

// Consumed downstream
// Debrief reads stackStore for block completion data
// Today reads stackStore.timerState for progress display
// Leaks reads stackStore context for enforcement
```

## Component Architecture

```
<StackLensContainer>
  ├── <StackHeader>
  │   └── <BlockLabel label={blockLabel} />
  │
  ├── <TaskStack>
  │   ├── <NowCard task={tasks[0]}>
  │   │   ├── <TaskLabel label={...} description={...} />
  │   │   ├── <TimerDisplay state={timerState} />
  │   │   └── <TaskActions>
  │   │       └── [Pause] [Done] [Skip]
  │   │   </TaskActions>
  │   </NowCard>
  │   │
  │   ├── <NextCard task={tasks[1]} />
  │   │
  │   └── <MaybeCard task={tasks[2]} />
  │
  ├── <EnforcementBadge state={enforcementState} />
  │
  └── <GlyphBar state={glyphState} dialogue={...}>
      └── [I'm distracted] [Zoom out]
  </GlyphBar>
</StackLensContainer>
```

### Timer Component

```typescript
<TimerDisplay state={timerState}>
  ├── <CountdownText>
  │   └── {formatTime(plannedSeconds - elapsedSeconds)}
  │
  ├── <ProgressBar
  │     progress={elapsedSeconds / plannedSeconds}
  │     color={getTimerColor(timerState)}
  │   />
  │
  └── <WarningPulse active={remainingSeconds < 300} />
</TimerDisplay>
```

## Animations & Transitions

| Event         | Animation                                        | Duration             | Easing            |
| ------------- | ------------------------------------------------ | -------------------- | ----------------- |
| Enter Stack   | Cards cascade from bottom                        | 400ms, 100ms stagger | `easeOutBack`     |
| Task complete | Now card flies up with checkmark, Next slides up | 500ms                | `spring(400, 25)` |
| Task skip     | Now card slides right and fades, Next slides up  | 400ms                | `easeInOutQuad`   |
| Promote Next  | Next scales up, slides to Now position           | 300ms                | `spring`          |
| Timer warning | Timer pulses with amber glow                     | 500ms loop           | `easeInOut`       |
| Overtime      | Timer turns red, gentle pulse                    | —                    | linear            |
| Stack cleared | Cards collapse, celebration particles            | 800ms                | `easeOutExpo`     |

### Timer Progress Animation

```typescript
// Smooth progress bar with CSS transition
<div
  className="progress-bar"
  style={{
    width: `${progress * 100}%`,
    transition: 'width 1s linear',
    backgroundColor: timerColor,
  }}
/>
```

## Edge Cases

| Scenario                     | Handling                                            |
| ---------------------------- | --------------------------------------------------- |
| Single task (no Next/Maybe)  | Show only Now card; "More tasks in Today" link      |
| All tasks skipped            | Show empty state: "All skipped. Return to Today?"   |
| Timer paused for >30min      | Glyph: "Still here? Resume or call it?"             |
| Enforcement expires mid-task | Toast: "Enforcement ended." Badge updates           |
| Task with no duration        | No timer; show "Open-ended" with manual done        |
| App backgrounded             | Timer continues (native); notification at intervals |

## Acceptance Criteria

- [ ] **AC-1:** Timer counts down accurately and updates every second without drift.
- [ ] **AC-2:** Completing a task marks it `done`, records `completedAt`, and advances stack.
- [ ] **AC-3:** Skipping a task marks it `skipped` and advances without recording completion.
- [ ] **AC-4:** "I'm distracted" navigates to Leaks with current stack context preserved.
- [ ] **AC-5:** Enforcement badge shows active suppression and countdown correctly.
- [ ] **AC-6:** Completing final task triggers Debrief (block-level) automatically.
- [ ] **AC-7:** Timer warning fires at 5 minutes remaining with visual pulse.
- [ ] **AC-8:** Pause/Resume correctly freezes and restores timer state.

---

## Tech Notes

- **Timer accuracy:** Use `Date.now()` delta rather than interval counting to prevent drift.
- **Background handling:** For mobile, use native background task APIs; for web, consider Web Workers.
- **Enforcement integration:** Read `leaksStore.enforcementState`; badge reflects real suppression.
- **Debrief trigger:** On block complete, emit event that Debrief subscribes to.
- **Haptics:** Add haptic feedback on complete/skip actions (mobile).
