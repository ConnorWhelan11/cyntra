# Week Lens (Planning)

> **Core Question:** "What does this week look like?"

## Purpose

The Week lens is the primary planning surface where users sketch their week by projecting LifeGraph nodes onto a 7-day scaffold. A ghost graph in the background preserves spatial context while a familiar calendar grid handles scheduling. Dragging blocks between days updates the underlying graph edges. This is where habits/rituals become concrete scheduled blocks and where goal-biased AI suggestions help fill gaps.

## Entry Points (Triggers)

| Trigger              | Source                 | Initial State                                 |
| -------------------- | ---------------------- | --------------------------------------------- |
| "Plan my week"       | Any lens, voice        | Current week, goal bias from Goals if set     |
| "Re-plan this week"  | Today, Stack           | Current week, preserve existing blocks        |
| "Plan this goal"     | Goals                  | Week + `goalNodeId` bias active               |
| Weekly ritual prompt | System (Sunday/Monday) | Fresh week, last week's Debrief summary shown |
| Tap day header       | Today                  | Scroll to that day                            |

## Exit Points (Destinations)

| CTA / Gesture           | Destination                     | Passed State           |
| ----------------------- | ------------------------------- | ---------------------- |
| Tap day → "Go to today" | Today                           | `{ dayDate }`          |
| Double-click block      | Graph (focused on block's node) | `{ focusNodeId }`      |
| "Done planning"         | Today (if current day)          | Updated schedule       |
| Swipe down / back       | Previous lens                   | —                      |
| "See full graph"        | Graph                           | `{ mode: 'overview' }` |

## Visual Composition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Nov 24–30, 2025                              [Autofill] [Clear] [Done]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     [Ghost Graph3D - 15% opacity]                      │ │
│  │    ·○··○··○·  (topology visible behind calendar)                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┐                 │
│  │  Mon  │  Tue  │  Wed  │  Thu  │  Fri  │  Sat  │  Sun  │                 │
│  ├───────┼───────┼───────┼───────┼───────┼───────┼───────┤                 │
│  │ ┌───┐ │ ┌───┐ │ ┌───┐ │       │ ┌───┐ │       │       │                 │
│  │ │Gym│ │ │Orgo│ │ │Deep│ │       │ │Port│ │       │       │                 │
│  │ │   │ │ │Exam│ │ │Work│ │       │ │folio│ │       │       │                 │
│  │ └───┘ │ └───┘ │ └───┘ │       │ └───┘ │       │       │                 │
│  │ ┌───┐ │       │ ┌───┐ │ ┌───┐ │       │ ┌───┐ │ ┌───┐ │                 │
│  │ │AM │ │       │ │Meet│ │ │Gym│ │       │ │Rest│ │ │Week│ │                 │
│  │ │Rtn │ │       │ │ing│ │ │   │ │       │ │   │ │ │Plan│ │                 │
│  │ └───┘ │       │ └───┘ │ └───┘ │       │ └───┘ │ └───┘ │                 │
│  └───────┴───────┴───────┴───────┴───────┴───────┴───────┘                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │ Suggestions: [+ Morning Routine] [+ Deep Work 2h] [+ Gym]       │       │
│  │ From goal "Med School": [+ Orgo Review] [+ MCAT Prep]           │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐         │
│  │ [Glyph mini] "Your Tuesday looks light. Want Orgo prep there?" │         │
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Block Styling

| Block Type       | Color             | Icon | Border |
| ---------------- | ----------------- | ---- | ------ |
| Task (from goal) | Goal domain color | ○    | Solid  |
| Habit/Ritual     | Teal              | ↻    | Dashed |
| Meeting          | Gray              | ◷    | Solid  |
| Deep Work        | Purple            | ◉    | Thick  |
| Rest/Buffer      | Soft green        | ~    | Dotted |

### Ghost Graph

- `Graph3D` with `embedMode={true}`, opacity 0.15
- No labels; nodes glow when corresponding block is hovered
- `selectedNodeId` updates as user hovers blocks

## Glyph Behavior

| Context            | Glyph State  | Position                  | Dialogue Hooks                                       |
| ------------------ | ------------ | ------------------------- | ---------------------------------------------------- |
| Idle planning      | `idle`       | Bottom-left corner, small | "Drag blocks to plan your week."                     |
| Goal bias active   | `responding` | Near suggestion bar       | "I've surfaced tasks for [goal]. Add what fits."     |
| Empty day detected | `thinking`   | Points at empty column    | "Tuesday is open. Rest day or catch-up?"             |
| Conflict detected  | `responding` | Near conflict             | "You've got 10 hours on Thursday. That's ambitious." |

## Data Model

### Inputs

```typescript
interface WeekLensProps {
  graph: GraphSnapshot;
  weekStart: Date; // Monday of target week
  goalBias?: GraphNodeId; // Optional goal to prioritize
  habitTemplates: HabitTemplate[]; // Reusable ritual blocks
  existingSchedule: ScheduledBlock[]; // Pre-placed blocks
}

interface ScheduledBlock {
  id: string;
  nodeIds: GraphNodeId[]; // 1+ nodes this block represents
  dayIndex: number; // 0=Mon, 6=Sun
  order: number; // Position within day
  duration: number; // Minutes
  type: "task" | "habit" | "meeting" | "deepWork" | "buffer";
  label: string;
}

interface HabitTemplate {
  id: string;
  label: string; // "Morning Routine"
  steps: { nodeId: string; duration: number }[];
  totalDuration: number;
  recurrence: "daily" | "weekdays" | "weekends" | "custom";
}
```

### Outputs

```typescript
interface WeekLensOutputs {
  onScheduleChange: (blocks: ScheduledBlock[]) => void;
  onBlockMove: (blockId: string, newDay: number, newOrder: number) => void;
  onBlockAdd: (block: Omit<ScheduledBlock, "id">) => void;
  onBlockRemove: (blockId: string) => void;
  onDaySelect: (dayIndex: number) => void;
  onGraphFocus: (nodeId: GraphNodeId) => void;
}
```

### Graph Edge Updates

When a block is scheduled:

```typescript
// Add/update edge in GraphSnapshot
{
  id: `scheduled:${blockId}`,
  source: nodeId,
  target: `day:${weekStart.toISOString()}:${dayIndex}`,
  type: 'scheduled_for',
  meta: { order, duration }
}
```

## Interactions

| Input                 | Action                                | Feedback                          |
| --------------------- | ------------------------------------- | --------------------------------- |
| Drag block to day     | Move/schedule block                   | Ghost preview, snap to day column |
| Drag block resize     | Adjust duration                       | Duration tooltip updates live     |
| Double-click block    | Open Graph focused on node            | Camera transition to Graph        |
| Hover block           | Highlight corresponding graph node    | Ghost graph node glows            |
| Click suggestion      | Add block to first available slot     | Block animates into place         |
| "Autofill" button     | AI spreads tasks across gaps          | Blocks animate in sequentially    |
| "Clear day"           | Remove all blocks from day            | Blocks fade out                   |
| "Pull forward missed" | Move incomplete blocks from past days | Blocks slide right                |

### Drag & Drop Spec

```typescript
// Using @dnd-kit or react-beautiful-dnd
interface DragData {
  blockId: string;
  sourceDay: number;
  sourceOrder: number;
}

interface DropTarget {
  dayIndex: number;
  insertOrder: number; // Where in the day's stack
}

// On drop:
// 1. Update block's dayIndex and order
// 2. Recompute orders for affected days
// 3. Emit onScheduleChange
// 4. Update graph edge with new scheduled_for
```

## Shared State Contract

```typescript
// Written by Week lens
weekStore.schedule: ScheduledBlock[]
weekStore.weekStart: Date
graphStore.graph.edges: GraphEdge[] // scheduled_for edges updated

// Read by Week lens
goalsStore.selectedGoalId: GraphNodeId | null // For bias
goalsStore.goalPriority: GraphNodeId[] // Affects suggestion order
habitsStore.templates: HabitTemplate[]
graphStore.graph: GraphSnapshot

// Consumed downstream
// Today reads weekStore.schedule filtered to today
// Stack reads from Today's active block
```

## Component Architecture

```
<WeekLensContainer>
  ├── <WeekHeader>
  │   ├── <WeekNavigation weekStart={...} />
  │   └── <ActionBar> [Autofill] [Clear] [Done] </ActionBar>
  │
  ├── <GhostGraphBackground>
  │   └── <Canvas>
  │       └── <Graph3D
  │             graph={graph}
  │             embedMode={true}
  │             selectedNodeId={hoveredBlockNodeId}
  │             opacity={0.15}
  │           />
  │
  ├── <WeekGrid>
  │   ├── <DayColumn dayIndex={0..6}>
  │   │   ├── <DayHeader date={...} />
  │   │   └── <DroppableArea>
  │   │       └── <ScheduledBlockCard block={...} />
  │   │
  │   └── ...
  │
  ├── <SuggestionBar>
  │   ├── <SuggestionChip template={habitTemplate} />
  │   └── <GoalSuggestions goalId={goalBias} />
  │
  └── <GlyphMini state={glyphState} dialogue={...} />
</WeekLensContainer>
```

### 2D + 3D Composition

```typescript
// GhostGraphBackground positioned behind WeekGrid via z-index
// opacity: 0.15, pointerEvents: 'none'
// selectedNodeId syncs with hovered block for glow effect
```

## Animations & Transitions

| Event                 | Animation                                            | Duration     | Easing            |
| --------------------- | ---------------------------------------------------- | ------------ | ----------------- |
| Enter Week lens       | Grid slides up, ghost graph fades in                 | 400ms        | `easeOutCubic`    |
| Block drag            | Ghost follows cursor, day columns highlight on hover | —            | linear            |
| Block drop            | Block snaps with bounce                              | 200ms        | `spring(300, 20)` |
| Autofill              | Blocks cascade in left-to-right, top-to-bottom       | 50ms stagger | `easeOutBack`     |
| Exit to Today         | Week collapses to single day, other days slide away  | 500ms        | `easeInOutQuad`   |
| Ghost graph node glow | Opacity 0.15→0.6                                     | 200ms        | linear            |

## Edge Cases

| Scenario                        | Handling                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------- |
| No blocks scheduled             | Show empty state: "Your week is a blank canvas. Start with a goal or habit."  |
| Overloaded day (>10h)           | Warn with amber highlight; Glyph: "That's ambitious. Consider spreading out." |
| Habit template missing steps    | Skip broken template; toast: "Template needs repair."                         |
| Week in past                    | Read-only mode; show completion stats instead of editing                      |
| Goal bias but no matching tasks | Glyph: "No tasks found for [goal]. Want to create some?"                      |

## Acceptance Criteria

- [ ] **AC-1:** Dragging a block to a new day updates `scheduled_for` edge in graph and persists to `weekStore`.
- [ ] **AC-2:** Ghost graph node glows when corresponding block is hovered.
- [ ] **AC-3:** Goal bias surfaces goal-related tasks first in suggestions.
- [ ] **AC-4:** "Autofill" distributes unscheduled tasks across days respecting existing blocks.
- [ ] **AC-5:** Double-clicking a block navigates to Graph with `focusNodeId` set.
- [ ] **AC-6:** Habit templates can be dropped as blocks with correct duration sum.
- [ ] **AC-7:** Schedule changes propagate to Today lens within 100ms.
- [ ] **AC-8:** Overloaded days (>8h default) show visual warning.

---

## Calendar Component Integration

> **Reuse the existing calendar module at `packages/ui/src/components/calendar`.**

The Week lens calendar grid should be built on top of the existing `CalendarWeekView` component, adapted for the Out of Scope aesthetic and rendered inside the R3F canvas.

### Existing Component Reference

```
packages/ui/src/components/calendar/
├── calendar.tsx              # Main async wrapper
├── calendar-body.tsx         # View router
├── contexts/
│   ├── calendar-context.tsx  # CalendarProvider (events, users, view state)
│   └── dnd-context.tsx       # DndProvider (drag confirmation)
├── views/
│   └── week-and-day-view/
│       ├── calendar-week-view.tsx   # 7-day grid with hour slots
│       ├── event-block.tsx          # Draggable event card
│       └── render-grouped-events.tsx
├── dnd/
│   └── droppable-area.tsx    # Drop zones per hour/day
├── interfaces.ts             # IEvent, IUser, ICalendarCell
└── types.ts                  # TCalendarView, TEventColor
```

### R3F Canvas Integration

The calendar must render inside the unified R3F canvas alongside the ghost `Graph3D`. Use `@react-three/drei`'s `Html` component to embed DOM content in 3D space:

```tsx
import { Html } from "@react-three/drei";

// Inside the R3F Canvas
<Html
  transform
  position={[0, 0, 0.5]} // Slightly in front of graph
  distanceFactor={8}
  style={{
    width: "900px",
    pointerEvents: "auto",
  }}
  className="week-calendar-container"
>
  <CalendarProvider events={scheduleAsEvents} users={[]} view="week">
    <DndProvider showConfirmation={false}>
      <CalendarWeekView
        singleDayEvents={singleDayEvents}
        multiDayEvents={multiDayEvents}
      />
    </DndProvider>
  </CalendarProvider>
</Html>;
```

### Styling Adaptations for Dark 3D Aesthetic

The existing calendar uses light theme classes. Override with Out of Scope design tokens:

```css
/* packages/ui/src/components/calendar/week-lens-overrides.css */

.week-calendar-container {
  --calendar-bg: rgba(5, 8, 18, 0.85);
  --calendar-border: rgba(255, 255, 255, 0.08);
  --calendar-text: rgba(255, 255, 255, 0.9);
  --calendar-text-muted: rgba(255, 255, 255, 0.4);
  --calendar-hover: rgba(80, 200, 255, 0.1);
  --calendar-accent: #50c8ff;

  background: var(--calendar-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--calendar-border);
  border-radius: 1rem;
  color: var(--calendar-text);
}

/* Event blocks inherit LifeGraph node colors */
.week-calendar-container [data-event-color="blue"] {
  background: linear-gradient(135deg, #4060ff33, #4060ff11);
  border-left: 3px solid #4060ff;
}
```

### Data Adapter: ScheduledBlock → IEvent

Map the lens data model to the existing calendar interface:

```typescript
import type { IEvent } from "@/components/calendar/interfaces";
import type { ScheduledBlock } from "./types";

const blockToCalendarEvent = (
  block: ScheduledBlock,
  weekStart: Date
): IEvent => {
  const dayDate = addDays(weekStart, block.dayIndex);
  const startDate = setHours(dayDate, Math.floor(block.order * 0.5)); // Rough slot mapping

  return {
    id: hashCode(block.id), // IEvent uses number id
    title: block.label,
    startDate: startDate.toISOString(),
    endDate: addMinutes(startDate, block.duration).toISOString(),
    color: blockTypeToEventColor(block.type),
    description: block.nodeIds.join(", "),
    user: { id: "system", name: "Out of Scope", picturePath: null },
  };
};

const blockTypeToEventColor = (type: ScheduledBlock["type"]): TEventColor => {
  const map: Record<ScheduledBlock["type"], TEventColor> = {
    task: "blue",
    habit: "green",
    meeting: "purple",
    deepWork: "orange",
    buffer: "yellow",
  };
  return map[type];
};
```

### Calendar → Graph Sync

When the calendar's drag-drop updates an event:

```typescript
// In DndProvider's onDrop callback
const handleCalendarDrop = (
  eventId: number,
  newDate: Date,
  newHour: number
) => {
  const block = findBlockByEventId(eventId);
  if (!block) return;

  // Update block position
  const newDayIndex = differenceInDays(newDate, weekStart);
  onBlockMove(block.id, newDayIndex, newHour);

  // Sync graph edge
  graphStore.updateEdge({
    id: `scheduled:${block.id}`,
    target: `day:${weekStart.toISOString()}:${newDayIndex}`,
    meta: { hour: newHour },
  });
};
```

### Performance Considerations

- **Html occlude:** Set `occlude` prop to prevent calendar rendering when behind 3D objects.
- **Pointer events:** Only enable `pointerEvents: 'auto'` on interactive areas.
- **Transform updates:** Avoid re-parenting `Html` component; use CSS transforms for animations.

---

## Tech Notes

- **Ghost graph:** Use `Graph3D` with `embedMode={true}` positioned behind the `Html` calendar via z-position.
- **Calendar reuse:** Adapt `CalendarWeekView` from `packages/ui/src/components/calendar/views/week-and-day-view/`.
- **Drag library:** The existing calendar uses its own `DndProvider`; ensure it works within R3F's event system.
- **Edge updates:** Batch edge updates to avoid re-renders per block move.
- **Suggestions:** Compute from `graph.nodes` where `status !== 'completed'` and no `scheduled_for` edge this week.
