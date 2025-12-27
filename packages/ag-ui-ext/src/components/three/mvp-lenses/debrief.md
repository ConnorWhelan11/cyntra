# Debrief Lens (Reflection / Diff)

> **Core Question:** "What actually happened, and what changed in my graph?"

## Purpose

The Debrief lens is the reflection surface that closes the Plan–Do–Reflect loop. After a focus block, day, or week, it shows what actually happened versus what was planned, visualizes changes in the LifeGraph (new nodes, strengthened edges, habit streaks), and prompts lightweight micro-journaling. This is where learning happens—patterns surface, adjustments are made, and the graph evolves based on reality.

## Entry Points (Triggers)

| Trigger             | Source                 | Initial State                     |
| ------------------- | ---------------------- | --------------------------------- |
| Stack timer ends    | Stack                  | Block-level debrief (30–60s flow) |
| "End my day"        | Today                  | Day-level debrief                 |
| Weekly ritual start | System (Sunday/Monday) | Week-level debrief                |
| "What happened?"    | Any lens, voice        | Context-appropriate level         |
| Manual trigger      | Anywhere               | Choose level: block/day/week      |

## Exit Points (Destinations)

| CTA / Gesture           | Destination                 | Passed State                             |
| ----------------------- | --------------------------- | ---------------------------------------- |
| "Save & continue"       | Previous lens (Stack/Today) | Applied adjustments                      |
| "View graph diff"       | Graph                       | `{ highlightedNodeIds: changedNodeIds }` |
| "Retry missed tomorrow" | Week                        | `{ missedTaskIds, rescheduleDate }`      |
| "Plan tomorrow"         | Today (next day)            | —                                        |
| "Start weekly planning" | Goals → Week                | Week-level flow                          |
| Swipe down / back       | Previous lens               | —                                        |

## Visual Composition

### Block-Level Debrief (Compact)

```
┌─────────────────────────────────────────────────────────────┐
│  DEBRIEF: Orgo Review Block                    [Skip →]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WHAT HAPPENED                                      │   │
│  │                                                     │   │
│  │  ◉ Orgo Review ────── 45 min planned │ 52 min actual│   │
│  │  ✓ Practice Problems ─ Done                         │   │
│  │  → Chapter 11 Review ─ Deferred                     │   │
│  │                                                     │   │
│  │  Focus score: 🎯 82% │ Violations: 1 (YouTube)      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  QUICK REFLECTION                                   │   │
│  │                                                     │   │
│  │  How did it feel? [😤] [😐] [😊] [🚀]               │   │
│  │                                                     │   │
│  │  One thing learned (optional):                      │   │
│  │  [_________________________________________]        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Glyph] "Nice session! 52 min is solid. Ready for   │   │
│  │          break or next block?"                      │   │
│  │                                                     │   │
│  │         [Save & continue]   [View details]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Day-Level Debrief

```
┌─────────────────────────────────────────────────────────────┐
│  DEBRIEF: Wednesday, Nov 26                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DAY TIMELINE                                       │   │
│  │                                                     │   │
│  │  6:30  ✓ Morning Routine ─────────── 45m           │   │
│  │  8:00  ✓ Deep Work: Orgo ─────────── 90m (+7m)     │   │
│  │  9:45  ✓ Gym ─────────────────────── 60m           │   │
│  │  11:00 ✓ Lunch + Admin ───────────── 75m           │   │
│  │  12:30 ✗ Project Work ────────────── (skipped)     │   │
│  │  14:00 ✓ Reading ─────────────────── 45m           │   │
│  │  16:00 → Meeting ─────────────────── (deferred)    │   │
│  │  18:00 ✓ Evening Routine ─────────── 30m           │   │
│  │                                                     │   │
│  │  Planned: 6h 45m │ Actual: 5h 45m │ Hit: 75%       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  GRAPH DIFF                                         │   │
│  │                                                     │   │
│  │  [Mini Graph3D showing changes]                     │   │
│  │                                                     │   │
│  │  + 2 nodes completed (Orgo Ch12, Practice Set)      │   │
│  │  ↑ Edge strengthened: NOW → Med School goal         │   │
│  │  🔥 Habit streaks: Morning +1, Evening +1           │   │
│  │  ⚠ Attention leak: YouTube (12 min total)           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  REFLECTION PROMPTS                                 │   │
│  │                                                     │   │
│  │  Day rating: ★ ★ ★ ★ ☆ (4/5)                       │   │
│  │                                                     │   │
│  │  What went well?                                    │   │
│  │  [Orgo session was focused___________________]      │   │
│  │                                                     │   │
│  │  What to adjust?                                    │   │
│  │  [Project work keeps getting skipped_________]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  QUICK ACTIONS                                      │   │
│  │                                                     │   │
│  │  [Retry "Project Work" tomorrow]                    │   │
│  │  [Reschedule "Meeting" to Friday]                   │   │
│  │  [Celebrate "Morning Routine" streak 🎉]            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Glyph] "75% execution rate. Project work is        │   │
│  │          struggling—want to break it down smaller?" │   │
│  │                                                     │   │
│  │         [Save & close]   [View graph diff]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Week-Level Debrief (Summary)

```
┌─────────────────────────────────────────────────────────────┐
│  WEEK IN REVIEW: Nov 20–26                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────┬────────┬────────┬────────┬────────┐            │
│  │  Mon   │  Tue   │  Wed   │  Thu   │  Fri   │            │
│  │  ███   │  ████  │  ███   │  ██    │  ████  │            │
│  │  65%   │  90%   │  75%   │  40%   │  85%   │            │
│  └────────┴────────┴────────┴────────┴────────┘            │
│                                                             │
│  Week score: 71% │ Best day: Tuesday │ Tough day: Thursday │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  GOAL PROGRESS                                      │   │
│  │                                                     │   │
│  │  Med School    ████████░░ 80% (+15%)                │   │
│  │  Fitness       ██████░░░░ 60% (+5%)                 │   │
│  │  Portfolio     ████░░░░░░ 40% (-10%)                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PATTERNS                                           │   │
│  │                                                     │   │
│  │  📈 Strong: Orgo review consistency                 │   │
│  │  📉 Weak: Project work repeatedly skipped           │   │
│  │  💡 Insight: Thursday afternoons are low-energy     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Continue to Goals] [Start weekly planning]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Glyph Behavior

| Context                | Glyph State  | Position             | Dialogue Hooks                                             |
| ---------------------- | ------------ | -------------------- | ---------------------------------------------------------- |
| Block complete (good)  | `success`    | Near summary         | "Nice session! 82% focus is solid."                        |
| Block complete (tough) | `responding` | Near summary         | "Rough one. What got in the way?"                          |
| Day end                | `responding` | Below timeline       | "75% execution. Not bad! Project work needs love."         |
| Week end               | `thinking`   | Near patterns        | "I see Thursday is consistently tough. Protect that slot?" |
| Streak celebration     | `success`    | Center with confetti | "🔥 12-day streak! You're building something."             |
| Pattern detected       | `thinking`   | Near insight         | "I noticed [pattern]. Worth adjusting?"                    |

## Data Model

### Inputs

```typescript
interface DebriefLensProps {
  period: "block" | "day" | "week";
  periodStart: Date;
  periodEnd: Date;
  blockId?: string; // For block-level
  snapshotBefore: GraphSnapshot;
  snapshotAfter: GraphSnapshot;
  taskResults: TaskResult[];
  habitResults: HabitResult[];
  leakEvents: LeakEvent[];
  existingReflection?: Reflection; // If resuming
}

interface TaskResult {
  taskId: string;
  nodeId: GraphNodeId;
  label: string;
  plannedDuration: number;
  actualDuration: number | null;
  status: "completed" | "skipped" | "deferred" | "partial";
  completedAt?: Date;
}

interface HabitResult {
  templateId: string;
  label: string;
  instanceId: string;
  status: "completed" | "partial" | "missed";
  streakBefore: number;
  streakAfter: number;
}

interface LeakEvent {
  nodeId: GraphNodeId;
  label: string;
  totalDuration: number; // Seconds
  violationCount: number;
}

interface GraphDiff {
  nodesAdded: GraphNodeId[];
  nodesCompleted: GraphNodeId[];
  nodesRemoved: GraphNodeId[];
  edgesStrengthened: { edgeId: string; delta: number }[];
  edgesWeakened: { edgeId: string; delta: number }[];
}
```

### Outputs

```typescript
interface DebriefLensOutputs {
  onReflectionSave: (reflection: Reflection) => void;
  onReschedule: (taskId: string, newDate: Date) => void;
  onRetryTomorrow: (taskIds: string[]) => void;
  onCelebrateStreak: (templateId: string) => void;
  onDropTask: (taskId: string) => void;
  onViewGraphDiff: () => void;
  onAdjustGoalWeight: (goalId: GraphNodeId, delta: number) => void;
  onContinueToPlanning: () => void;
}

interface Reflection {
  periodType: "block" | "day" | "week";
  periodStart: Date;
  periodEnd: Date;
  rating?: number; // 1–5
  moodEmoji?: string; // For block
  whatWentWell?: string;
  whatToAdjust?: string;
  oneLearning?: string;
  savedAt: Date;
}
```

### Diff Computation

```typescript
const computeGraphDiff = (before: GraphSnapshot, after: GraphSnapshot): GraphDiff => {
  const beforeNodeIds = new Set(before.nodes.map((n) => n.id));
  const afterNodeIds = new Set(after.nodes.map((n) => n.id));

  return {
    nodesAdded: after.nodes.filter((n) => !beforeNodeIds.has(n.id)).map((n) => n.id),
    nodesCompleted: after.nodes
      .filter(
        (n) =>
          n.status === "completed" &&
          before.nodes.find((bn) => bn.id === n.id)?.status !== "completed"
      )
      .map((n) => n.id),
    nodesRemoved: before.nodes.filter((n) => !afterNodeIds.has(n.id)).map((n) => n.id),
    edgesStrengthened: computeEdgeDeltas(before.edges, after.edges, "increase"),
    edgesWeakened: computeEdgeDeltas(before.edges, after.edges, "decrease"),
  };
};
```

## Interactions

| Input              | Action                            | Feedback                     |
| ------------------ | --------------------------------- | ---------------------------- |
| Select mood emoji  | Set reflection mood               | Emoji highlights             |
| Type in text field | Update reflection text            | Auto-save indicator          |
| Star rating        | Set day/week rating               | Stars fill                   |
| "Retry tomorrow"   | Schedule task for tomorrow        | Task card animates to right  |
| "Drop task"        | Remove from graph                 | Task fades with confirmation |
| "View graph diff"  | Navigate to Graph with highlights | Transition to Graph          |
| "Celebrate"        | Trigger streak celebration        | Confetti animation           |
| "Save & continue"  | Persist reflection, exit          | Brief save animation         |

### Block-Level Constraints

- **Time limit:** <60 seconds suggested flow
- **Required:** None (can skip entirely)
- **Optional:** Mood emoji, one learning sentence

### Day-Level Flow

1. Review timeline (auto-generated)
2. See graph diff summary
3. Optional: 2 text prompts
4. Quick actions for missed tasks
5. Save

### Week-Level Flow

1. Review daily scores
2. Goal progress bars
3. Pattern insights (AI-generated)
4. Transition to Goals → Week planning

## Shared State Contract

```typescript
// Written by Debrief lens
debriefStore.reflections: Reflection[]
debriefStore.lastDebriefAt: Date

// Also updates:
graphStore.graph: GraphSnapshot // Node statuses, edge weights
weekStore.schedule: ScheduledBlock[] // Rescheduled items
habitsStore.streaks: Map<string, StreakInfo> // Celebrations

// Read by Debrief lens
stackStore.tasks: StackTask[] // For block results
todayStore.blocks: TodayBlock[] // For day results
weekStore.schedule: ScheduledBlock[] // For week results
leaksStore.suppressionHistory: SuppressionConfig[] // For leak events
```

## Component Architecture

```
<DebriefLensContainer period={period}>
  ├── <DebriefHeader period={period} dateRange={...} />
  │
  ├── {period === 'block' && (
  │     <BlockDebrief>
  │       ├── <TaskSummary results={taskResults} />
  │       ├── <FocusScore score={...} violations={...} />
  │       └── <QuickReflection>
  │           ├── <MoodPicker selected={mood} />
  │           └── <OneLearningInput />
  │       </QuickReflection>
  │     </BlockDebrief>
  │   )}
  │
  ├── {period === 'day' && (
  │     <DayDebrief>
  │       ├── <DayTimeline blocks={blocks} results={results} />
  │       ├── <GraphDiffSummary diff={graphDiff} />
  │       ├── <ReflectionPrompts>
  │       │   ├── <StarRating />
  │       │   ├── <TextPrompt label="What went well?" />
  │       │   └── <TextPrompt label="What to adjust?" />
  │       </ReflectionPrompts>
  │       └── <QuickActions tasks={missedTasks} habits={...} />
  │     </DayDebrief>
  │   )}
  │
  ├── {period === 'week' && (
  │     <WeekDebrief>
  │       ├── <WeekOverview days={dailyScores} />
  │       ├── <GoalProgress goals={goalDeltas} />
  │       ├── <PatternInsights patterns={...} />
  │       └── <WeekActions> [Continue to Goals] [Start planning] </WeekActions>
  │     </WeekDebrief>
  │   )}
  │
  ├── <GraphDiffPreview>
  │   └── <Canvas>
  │       └── <Graph3D
  │             graph={snapshotAfter}
  │             highlightedNodeIds={changedNodeIds}
  │             embedMode={true}
  │           />
  │
  └── <GlyphBar state={glyphState} dialogue={...}>
      └── [Save & continue] [View graph diff]
  </GlyphBar>
</DebriefLensContainer>
```

### Graph Diff Visualization

```typescript
// Highlight changed nodes in mini Graph3D
<Graph3D
  graph={snapshotAfter}
  highlightedNodeIds={[
    ...graphDiff.nodesAdded,
    ...graphDiff.nodesCompleted,
  ]}
  // Custom styling for diff
  nodeStyleOverrides={{
    [completedNodeId]: { color: 'green', pulse: true },
    [addedNodeId]: { color: 'cyan', glow: true },
  }}
/>
```

## Animations & Transitions

| Event                   | Animation                         | Duration   | Easing          |
| ----------------------- | --------------------------------- | ---------- | --------------- |
| Enter block debrief     | Slide up as overlay               | 300ms      | `easeOutCubic`  |
| Enter day debrief       | Full page transition              | 400ms      | `easeInOutQuad` |
| Task complete indicator | Checkmark draws                   | 300ms      | `easeOutBack`   |
| Streak celebration      | Confetti burst, number increments | 1000ms     | `spring`        |
| Graph diff nodes        | Pulse glow for changed nodes      | 600ms loop | `easeInOut`     |
| Save & exit             | Collapse/fade out                 | 300ms      | `easeInCubic`   |
| Retry tomorrow          | Task card flies right             | 400ms      | `easeInBack`    |

### Confetti Animation

```typescript
// On streak milestone (7, 14, 21, 30, etc.)
<Confetti
  trigger={streakMilestone}
  pieces={50}
  duration={2000}
  colors={['#FFD700', '#FF6B6B', '#4ECDC4']}
/>
```

## Edge Cases

| Scenario                  | Handling                                                     |
| ------------------------- | ------------------------------------------------------------ |
| No tasks completed        | Supportive message: "Tough block. Tomorrow's a new day."     |
| All tasks skipped         | Prompt: "Everything skipped. Need to adjust your plan?"      |
| Block <5 min              | Skip detailed debrief; just confirm completion               |
| Week with 0% execution    | Compassionate framing + offer to simplify next week          |
| Reflection already exists | Load and allow editing                                       |
| Graph unchanged           | "Your graph held steady. Sometimes consistency is progress." |
| Negative pattern detected | Frame as opportunity: "I see [pattern]. Want to experiment?" |

## Acceptance Criteria

- [ ] **AC-1:** Block-level debrief completes in <60 seconds with optional fields.
- [ ] **AC-2:** Day-level debrief shows accurate timeline with planned vs actual durations.
- [ ] **AC-3:** Graph diff correctly identifies added, completed, and removed nodes.
- [ ] **AC-4:** "Retry tomorrow" creates scheduled block for missed task on next day.
- [ ] **AC-5:** Streak celebrations trigger on milestones (7, 14, 21, 30, etc.).
- [ ] **AC-6:** Reflection text persists to `debriefStore.reflections`.
- [ ] **AC-7:** Week-level debrief shows goal progress deltas accurately.
- [ ] **AC-8:** "View graph diff" navigates to Graph with changed nodes highlighted.

---

## Calendar Component Integration

> **For Day-Level Debrief timeline, reuse components from `packages/ag-ui-ext/src/components/calendar`.**

The day-level debrief "DAY TIMELINE" section should leverage existing calendar components for visual consistency with the Today lens, adapted for read-only reflection mode.

### Existing Component Reference

```
packages/ag-ui-ext/src/components/calendar/views/week-and-day-view/
├── calendar-day-view.tsx       # Day timeline structure
├── event-block.tsx             # Event cards (can show planned vs actual)
└── calendar-time-line.tsx      # Timeline visualization
```

### R3F Integration for Debrief Timeline

The debrief renders inside the unified R3F canvas. Use `@react-three/drei`'s `Html` for the timeline:

```tsx
import { Html } from "@react-three/drei";

// Inside Day-Level Debrief
<Html
  transform
  position={[-2, 0.5, 0]}
  distanceFactor={5}
  style={{ width: "360px", pointerEvents: "auto" }}
  className="debrief-timeline-container"
>
  <DebriefTimeline
    blocks={todayBlocks}
    results={taskResults}
    showDelta={true} // Show planned vs actual
  />
</Html>;
```

### Timeline Styling for Debrief Mode

The debrief timeline is **read-only** with visual diff indicators:

```css
/* packages/ag-ui-ext/src/components/calendar/debrief-overrides.css */

.debrief-timeline-container {
  --debrief-bg: rgba(5, 8, 18, 0.95);
  --debrief-success: #22c55e;
  --debrief-skip: #ef4444;
  --debrief-defer: #f59e0b;
  --debrief-overrun: #f59e0b;
}

/* Completed with delta */
.debrief-timeline-container [data-status="done"] {
  border-left: 3px solid var(--debrief-success);
}

.debrief-timeline-container [data-status="done"] .delta {
  color: var(--debrief-overrun);
  font-size: 0.75rem;
}

/* Skipped task */
.debrief-timeline-container [data-status="skipped"] {
  opacity: 0.6;
  border-left: 3px solid var(--debrief-skip);
  text-decoration: line-through;
}

/* Deferred task */
.debrief-timeline-container [data-status="deferred"] {
  border-left: 3px solid var(--debrief-defer);
  font-style: italic;
}
```

### DebriefTimeline Component

A simplified, read-only variant of `CalendarDayView`:

```tsx
interface DebriefTimelineProps {
  blocks: TodayBlock[];
  results: TaskResult[];
  showDelta?: boolean;
}

const DebriefTimeline: React.FC<DebriefTimelineProps> = ({ blocks, results, showDelta = true }) => {
  return (
    <div className="debrief-timeline space-y-2">
      {blocks.map((block) => {
        const result = results.find((r) => r.taskId === block.id);
        const delta =
          result && result.actualDuration ? result.actualDuration - block.duration : null;

        return (
          <div
            key={block.id}
            data-status={block.status}
            className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
          >
            <span className="text-xs text-white/40 w-12">
              {format(block.scheduledStart, "HH:mm")}
            </span>
            <StatusIcon status={block.status} />
            <span className="flex-1 text-sm">{block.label}</span>
            <span className="text-xs text-white/60">{block.duration}m</span>
            {showDelta && delta !== null && delta !== 0 && (
              <span className="delta">
                ({delta > 0 ? "+" : ""}
                {delta}m)
              </span>
            )}
          </div>
        );
      })}

      <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-xs">
        <span>
          Planned: {totalPlanned}m | Actual: {totalActual}m
        </span>
        <span className="font-semibold">Hit: {hitRate}%</span>
      </div>
    </div>
  );
};
```

### Week Overview (Mini Calendar)

For week-level debrief, show a compact week view using the same data model:

```tsx
// Week-level debrief uses a simplified week overview
<Html position={[0, 1, 0]} ...>
  <WeekOverviewMini
    days={dailyScores}
    onDayClick={(day) => setSelectedDay(day)}
  />
</Html>

// WeekOverviewMini renders 7 day columns with completion bars
// Reuses styling from CalendarWeekView but read-only
```

---

## Tech Notes

- **Snapshot caching:** Store `snapshotBefore` at period start; compare to current state.
- **Calendar reuse:** Day timeline in debrief uses simplified read-only variant of `CalendarDayView`.
- **Reflection storage:** Persist reflections for historical queries and AI learning.
- **Pattern detection:** Simple heuristics initially (repeated skips, low days); evolve to ML.
- **Time limit:** Block debrief uses progress indicator; nudge after 45s.
- **Auto-save:** Debounced auto-save (1s) for text fields to prevent loss.
