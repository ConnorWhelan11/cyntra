# Today Lens (Day Timeline / Mission Loop)

> **Core Question:** "What's the shape of _today_?"

## Purpose

The Today lens is the day-level operating view where 4–8 blocks form a linear timeline or mission ring for the current day. This is where users start their morning, reorient mid-day, and see their progress unfold. Each block maps to one or more LifeGraph nodes. Tapping a block opens Stack for execution. The Now marker shows current position in the day.

## Entry Points (Triggers)

| Trigger                    | Source          | Initial State                     |
| -------------------------- | --------------- | --------------------------------- |
| App open (morning)         | Boot            | Today with morning prompt         |
| "What's today look like?"  | Any lens, voice | Today for current date            |
| Tap day in Week            | Week            | Today for selected date           |
| "Focus on today"           | Graph           | Today with any focus bias         |
| Timer end → "What's next?" | Stack           | Today with next block highlighted |

## Exit Points (Destinations)

| CTA / Gesture     | Destination         | Passed State                         |
| ----------------- | ------------------- | ------------------------------------ |
| Tap block         | Stack               | `{ blockId, nodeIds }`               |
| "Zoom out"        | Week                | `{ dayIndex: todayIndex }`           |
| "Show context"    | Graph               | `{ focusNodeId: activeBlockNodeId }` |
| "End my day"      | Debrief (day-level) | `{ period: 'day' }`                  |
| Swipe down / back | Previous lens       | —                                    |

## Visual Composition

### Timeline View (Default)

```
┌─────────────────────────────────────────────────────────────┐
│  Wednesday, Nov 26                      [Ring] [Zoom out]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            [Mini Graph3D - context preview]         │   │
│  │                 ◉ active node glows                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ════════════════════════════════════════════════════════   │
│                                                             │
│  6:30  ┌──────────────────────────────────────────┐ ✓      │
│        │ ☀ Morning Routine (45min)                │        │
│        │   Journal → Coffee → Stretch             │        │
│        └──────────────────────────────────────────┘        │
│                                                             │
│  8:00  ┌──────────────────────────────────────────┐ ◉ NOW  │
│        │ ◉ Deep Work: Orgo Review (90min)         │ ←──┐   │
│        │   Chapter 12, Practice Problems          │     │   │
│        └──────────────────────────────────────────┘     │   │
│                                                         │   │
│  9:30  ┌──────────────────────────────────────────┐   Glyph│
│        │ ○ Break (15min)                          │        │
│        └──────────────────────────────────────────┘        │
│                                                             │
│  9:45  ┌──────────────────────────────────────────┐        │
│        │ ○ Gym (60min)                            │        │
│        └──────────────────────────────────────────┘        │
│                                                             │
│  ...                                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Glyph] "Ready for Deep Work? Let's go." [Start]    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Mission Ring View (Toggle)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ○ Evening Ritual                         │
│                   /                 \                       │
│            ○ Gym                     ○ Break                │
│             /                           \                   │
│       ◉ Deep Work ←── [Glyph] ──→ ○ Break                  │
│             \                           /                   │
│            ○ Lunch                   ○ Admin                │
│                   \                 /                       │
│                    ○ Morning Routine ✓                      │
│                                                             │
│  [You are here: Deep Work]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Block States & Styling

| State      | Visual               | Icon | Tap Behavior         |
| ---------- | -------------------- | ---- | -------------------- |
| `planned`  | Normal opacity       | ○    | Opens Stack          |
| `active`   | Glow border, pulse   | ◉    | Opens Stack (resume) |
| `done`     | Muted, strikethrough | ✓    | Shows summary        |
| `deferred` | Amber, italic        | →    | Reschedule modal     |
| `skipped`  | Gray, strikethrough  | ✗    | Shows skip reason    |

### Now Marker

- Red horizontal line at current time position
- Animates smoothly as time passes
- Label: "NOW" with current time

## Glyph Behavior

| Context         | Glyph State  | Position                | Dialogue Hooks                            |
| --------------- | ------------ | ----------------------- | ----------------------------------------- |
| Morning startup | `responding` | Near first block        | "Good morning! Here's your day."          |
| Active block    | `idle`       | Beside active block     | "You're in Deep Work. 45 min left."       |
| Between blocks  | `thinking`   | Near Now marker         | "Break's over. Ready for Gym?"            |
| Mid-day chaos   | `responding` | Center                  | "Things shifted. Want to re-plan?"        |
| Day complete    | `success`    | Center with celebration | "You crushed it today. Time for Debrief?" |

## Data Model

### Inputs

```typescript
interface TodayLensProps {
  graph: GraphSnapshot;
  date: Date; // Which day to display
  blocks: TodayBlock[]; // From weekStore filtered to today
  viewMode: "timeline" | "ring";
  currentTime: Date; // For Now marker
}

interface TodayBlock {
  id: string;
  nodeIds: GraphNodeId[];
  label: string;
  description?: string;
  scheduledStart: Date; // Planned start time
  duration: number; // Minutes
  status: "planned" | "active" | "done" | "deferred" | "skipped";
  type: "task" | "habit" | "meeting" | "deepWork" | "buffer";
  actualStart?: Date;
  actualEnd?: Date;
  energyLevel?: "low" | "medium" | "high"; // Optional tag
}
```

### Outputs

```typescript
interface TodayLensOutputs {
  onBlockTap: (blockId: string) => void; // Opens Stack
  onBlockReorder: (orderedBlockIds: string[]) => void;
  onBlockStatusChange: (blockId: string, status: TodayBlock["status"]) => void;
  onDefer: (blockId: string, reason?: string) => void;
  onViewModeChange: (mode: "timeline" | "ring") => void;
  onEndDay: () => void; // Triggers Debrief
}
```

### Now Computation

```typescript
// Find current/next block based on time
const nowMs = currentTime.getTime();
const activeBlock = blocks.find(
  (b) =>
    b.scheduledStart.getTime() <= nowMs &&
    b.scheduledStart.getTime() + b.duration * 60000 > nowMs &&
    b.status !== "done" &&
    b.status !== "skipped"
);
const nextBlock = blocks.find((b) => b.scheduledStart.getTime() > nowMs && b.status === "planned");
```

## Interactions

| Input                | Action                          | Feedback                             |
| -------------------- | ------------------------------- | ------------------------------------ |
| Tap block            | Navigate to Stack for execution | Block pulses, transition to Stack    |
| Long-press block     | Open reorder mode               | Blocks become draggable              |
| Drag block (reorder) | Move block position             | Other blocks shift                   |
| Swipe block left     | Mark as done                    | Checkmark animation, strikethrough   |
| Swipe block right    | Defer to tomorrow               | Block slides off, toast confirmation |
| Tap "Ring" toggle    | Switch to mission ring view     | Morph animation                      |
| Tap completed block  | Show completion summary         | Modal with duration, notes           |
| "End my day"         | Navigate to Debrief             | Day stats summary shown              |

### Quick Actions Overlay

```
┌────────────────────────────────┐
│ [✓ Done] [→ Defer] [✗ Skip]   │
│ [⟳ Reschedule] [◉ Focus]      │
└────────────────────────────────┘
```

## Shared State Contract

```typescript
// Written by Today lens
todayStore.activeBlockId: string | null
todayStore.blocks: TodayBlock[]
todayStore.viewMode: 'timeline' | 'ring'

// Read by Today lens
weekStore.schedule: ScheduledBlock[] // Filtered to today's date
graphStore.graph: GraphSnapshot
currentTime: Date // From system or synced

// Consumed downstream
// Stack reads todayStore.activeBlockId and corresponding block
// Debrief reads todayStore.blocks for day summary
// Graph reads todayStore.activeBlockId for focus
```

## Component Architecture

```
<TodayLensContainer>
  ├── <TodayHeader>
  │   ├── <DateDisplay date={...} />
  │   ├── <ViewModeToggle mode={viewMode} />
  │   └── <ZoomOutButton />
  │
  ├── <ContextPreview>
  │   └── <Canvas>
  │       └── <Graph3D
  │             graph={graph}
  │             embedMode={true}
  │             selectedNodeId={activeBlockNodeId}
  │             maxNodeCountForLabels={5}
  │           />
  │
  ├── {viewMode === 'timeline' ? (
  │     <TimelineView>
  │       ├── <NowMarker time={currentTime} />
  │       └── {blocks.map(b => <TimelineBlock block={b} />)}
  │     </TimelineView>
  │   ) : (
  │     <MissionRingView>
  │       └── <Canvas>
  │           └── <Graph3D
  │                 graph={todayOnlyGraph}
  │                 layout="ring"
  │                 selectedNodeId={activeBlockNodeId}
  │               />
  │       </Canvas>
  │     </MissionRingView>
  │   )}
  │
  └── <GlyphPromptBar state={glyphState} dialogue={...}>
      └── <StartButton blockId={nextBlockId} />
  </GlyphPromptBar>
</TodayLensContainer>
```

### Mission Ring Graph

```typescript
// Create ring-specific graph from today's blocks
const todayRingGraph: GraphSnapshot = {
  nodes: blocks.map((b) => ({
    id: b.id,
    label: b.label,
    category: b.type,
    status: b.status === "done" ? "completed" : b.status === "active" ? "active" : "normal",
    weight: b.status === "active" ? 1.0 : 0.7,
  })),
  edges: blocks.slice(0, -1).map((b, i) => ({
    id: `ring-${i}`,
    source: b.id,
    target: blocks[i + 1].id,
    type: "default",
  })),
};
```

## Animations & Transitions

| Event             | Animation                             | Duration            | Easing          |
| ----------------- | ------------------------------------- | ------------------- | --------------- |
| Enter Today       | Blocks cascade in top-to-bottom       | 300ms, 50ms stagger | `easeOutBack`   |
| Now marker        | Continuous slide as time passes       | —                   | linear          |
| Block complete    | Checkmark draws, block fades to muted | 400ms               | `easeOutCubic`  |
| Timeline → Ring   | Blocks morph from list to circle      | 600ms               | `easeInOutQuad` |
| Block reorder     | Blocks slide to new positions         | 300ms               | `spring`        |
| Tap block → Stack | Block zooms up, other blocks fade     | 400ms               | `easeInCubic`   |

### Now Marker Animation

```typescript
// Update Now position every minute
useEffect(() => {
  const interval = setInterval(() => {
    setNowPosition(calculateNowPosition(currentTime, blocks));
  }, 60000);
  return () => clearInterval(interval);
}, [blocks]);
```

## Edge Cases

| Scenario               | Handling                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| No blocks today        | Empty state: "Your day is open. Pull from Week or add something new." |
| All blocks done early  | Celebration: "You finished early! Rest or bonus task?"                |
| Past day (not today)   | Read-only view with completion stats; can trigger Debrief             |
| Active block overrun   | Amber warning; Glyph: "Running over. Wrap up or extend?"              |
| Morning without plan   | "No plan yet. Quick 3-block suggestion?" → AI fills                   |
| Ring view with 1 block | Single node with self-loop; suggest adding more                       |

## Acceptance Criteria

- [ ] **AC-1:** Tapping a `planned` or `active` block navigates to Stack with correct `blockId`.
- [ ] **AC-2:** Now marker position updates in real-time and reflects actual current time.
- [ ] **AC-3:** Swiping left on a block marks it `done` and updates `todayStore`.
- [ ] **AC-4:** Timeline ↔ Ring toggle morphs smoothly without data loss.
- [ ] **AC-5:** Active block is visually distinct (glow, icon) from planned/done blocks.
- [ ] **AC-6:** Reordering blocks updates both `todayStore` and `weekStore.schedule`.
- [ ] **AC-7:** "End my day" triggers Debrief with day-level context.
- [ ] **AC-8:** Mini Graph3D preview highlights `activeBlockNodeId` in real-time.

---

## Calendar Component Integration

> **Reuse the existing calendar module at `packages/ag-ui-ext/src/components/calendar` for the Timeline view.**

The Today lens timeline view should leverage the `CalendarDayView` component, adapted for the Out of Scope aesthetic and rendered inside the R3F canvas.

### Existing Component Reference

```
packages/ag-ui-ext/src/components/calendar/views/week-and-day-view/
├── calendar-day-view.tsx       # Single-day vertical timeline with hours
├── calendar-time-line.tsx      # Now marker (CalendarTimeline)
├── event-block.tsx             # Event cards with duration-based height
├── render-grouped-events.tsx   # Overlapping event layout
└── day-view-multi-day-events-row.tsx
```

Key features from `CalendarDayView`:

- 24-hour vertical grid (96px per hour)
- `CalendarTimeline` component for Now marker
- Droppable hour slots for rescheduling
- Grouped event rendering for overlaps
- Side panel with "Happening now" context

### R3F Canvas Integration

For the **Timeline view**, embed the calendar day view using `@react-three/drei`'s `Html` component:

```tsx
import { Html } from "@react-three/drei";
import { CalendarDayView } from "@/components/calendar/views/week-and-day-view/calendar-day-view";

// Inside the unified R3F Canvas
{
  viewMode === "timeline" && (
    <Html
      transform
      position={[0, -1, 0.3]}
      distanceFactor={6}
      style={{
        width: "480px",
        height: "600px",
        pointerEvents: "auto",
      }}
      className="today-timeline-container"
    >
      <CalendarProvider events={blocksAsEvents} users={[]} view="day">
        <DndProvider showConfirmation={false}>
          <ScrollArea className="h-full">
            <CalendarDayView singleDayEvents={singleDayEvents} multiDayEvents={[]} />
          </ScrollArea>
        </DndProvider>
      </CalendarProvider>
    </Html>
  );
}
```

For the **Ring view**, use the pure 3D `Graph3D` with `layout="ring"` (no HTML embedding needed).

### Styling Adaptations for Dark 3D Aesthetic

Override the calendar's light theme for the cinematic Out of Scope look:

```css
/* packages/ag-ui-ext/src/components/calendar/today-lens-overrides.css */

.today-timeline-container {
  --timeline-bg: rgba(5, 8, 18, 0.9);
  --timeline-border: rgba(255, 255, 255, 0.06);
  --timeline-hour-line: rgba(255, 255, 255, 0.08);
  --timeline-hour-line-dashed: rgba(255, 255, 255, 0.04);
  --timeline-text: rgba(255, 255, 255, 0.5);
  --timeline-now: #ff3366;
  --timeline-now-glow: rgba(255, 51, 102, 0.3);

  background: var(--timeline-bg);
  backdrop-filter: blur(16px);
  border-radius: 1rem;
}

/* Now marker with glow effect */
.today-timeline-container [data-timeline-now] {
  background: var(--timeline-now);
  box-shadow: 0 0 12px var(--timeline-now-glow);
}

/* Active block glow */
.today-timeline-container [data-block-status="active"] {
  border: 1px solid var(--timeline-now);
  box-shadow: 0 0 20px var(--timeline-now-glow);
  animation: pulse 2s ease-in-out infinite;
}

/* Done block muted */
.today-timeline-container [data-block-status="done"] {
  opacity: 0.5;
  filter: grayscale(0.3);
}
```

### Data Adapter: TodayBlock → IEvent

Map the Today lens data model to the existing calendar interface:

```typescript
import type { IEvent } from "@/components/calendar/interfaces";
import type { TodayBlock } from "./types";

const todayBlockToEvent = (block: TodayBlock): IEvent => ({
  id: hashCode(block.id),
  title: block.label,
  startDate: block.scheduledStart.toISOString(),
  endDate: addMinutes(block.scheduledStart, block.duration).toISOString(),
  color: blockStatusToColor(block.status, block.type),
  description: block.description || "",
  user: { id: "system", name: "Out of Scope", picturePath: null },
});

const blockStatusToColor = (
  status: TodayBlock["status"],
  type: TodayBlock["type"]
): TEventColor => {
  if (status === "done") return "green";
  if (status === "skipped") return "red";
  if (status === "deferred") return "yellow";
  // Active/planned use type-based colors
  const typeColors: Record<TodayBlock["type"], TEventColor> = {
    deepWork: "purple",
    habit: "green",
    meeting: "blue",
    task: "orange",
    buffer: "yellow",
  };
  return typeColors[type];
};
```

### Now Marker Sync

The `CalendarTimeline` component already handles Now marker positioning. Sync it with our `currentTime` state:

```typescript
// CalendarTimeline already uses current time internally
// For custom styling, wrap or extend it:
const TodayNowMarker: React.FC<{ currentTime: Date }> = ({ currentTime }) => {
  const hour = currentTime.getHours();
  const minute = currentTime.getMinutes();
  const topPosition = (hour + minute / 60) * 96; // 96px per hour

  return (
    <div
      data-timeline-now
      className="absolute left-0 right-0 h-0.5 z-50"
      style={{ top: `${topPosition}px` }}
    >
      <span className="absolute -left-16 -top-2 text-xs font-mono text-[var(--timeline-now)]">
        NOW
      </span>
    </div>
  );
};
```

### Timeline ↔ Ring Toggle

When switching views, the calendar DOM unmounts and the 3D ring takes over:

```tsx
<AnimatePresence mode="wait">
  {viewMode === "timeline" ? (
    <Html key="timeline" ...>
      <CalendarDayView ... />
    </Html>
  ) : (
    <Graph3D
      key="ring"
      graph={todayRingGraph}
      layout="ring"
      selectedNodeId={activeBlockNodeId}
    />
  )}
</AnimatePresence>
```

The morph animation (blocks → ring nodes) is handled by shared `blockId` mapping—both views reference the same underlying `TodayBlock[]`.

### Performance Considerations

- **Scroll sync:** The `ScrollArea` inside `Html` should auto-scroll to current time on mount.
- **Pointer events:** Disable pointer events on the `Html` wrapper when in drag/reorder mode to allow 3D gestures.
- **Re-render:** Memoize `blocksAsEvents` conversion to avoid recalculating on every frame.

---

## Tech Notes

- **Timeline view:** Adapt `CalendarDayView` from `packages/ag-ui-ext/src/components/calendar/views/week-and-day-view/`.
- **Now marker:** Reuse `CalendarTimeline` or custom `TodayNowMarker` with glow styling.
- **Ring view:** Pure 3D using `Graph3D` with `layout="ring"` and blocks converted to graph nodes.
- **Gesture handling:** Use `react-swipeable` or native touch events for swipe actions on `Html` content.
- **Time sync:** Consider syncing `currentTime` with server to handle timezone/daylight issues.
- **Block duration:** Visual height in timeline = `duration / dayTotalMinutes * containerHeight` (96px/hour baseline).
