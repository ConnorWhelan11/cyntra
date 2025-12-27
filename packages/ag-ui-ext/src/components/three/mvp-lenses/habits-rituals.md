# Habits & Rituals Lens (Repeating Scripts)

> **Core Question:** "What should my days reliably start / end / orbit around?"

## Purpose

The Habits & Rituals lens manages repeating behavioral scripts—morning routines, evening shutdowns, weekly anchors—that structure daily life. These are reusable subgraphs that can be dropped into Week/Today as scheduled blocks. The lens handles template creation, adherence tracking, and streak maintenance. Well-designed rituals become the scaffolding that supports everything else.

## Entry Points (Triggers)

| Trigger                         | Source                 | Initial State                      |
| ------------------------------- | ---------------------- | ---------------------------------- |
| "Help me fix my mornings"       | Any lens, voice        | Morning orbit focused, wizard mode |
| "Let's make a shutdown routine" | Any lens, voice        | Evening orbit focused              |
| "Show my habits"                | Any lens               | Full habits overview               |
| Habit streak break              | System (morning)       | Broken habit highlighted           |
| Weekly ritual prompt            | System                 | Review all habits, adjust          |
| "Add ritual to week"            | Week (drag affordance) | Template picker                    |

## Exit Points (Destinations)

| CTA / Gesture      | Destination          | Passed State                   |
| ------------------ | -------------------- | ------------------------------ |
| "Add to Week"      | Week                 | `{ templateId, targetDay }`    |
| "Start now"        | Stack                | `{ templateSteps as tasks }`   |
| Tap habit instance | Today (if scheduled) | `{ blockId }`                  |
| "See in graph"     | Graph                | `{ focusNodeId: habitNodeId }` |
| Swipe down / back  | Previous lens        | —                              |

## Visual Composition

```
┌─────────────────────────────────────────────────────────────┐
│  HABITS & RITUALS                        [+ New] [Wizard]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             MORNING ORBIT ☀️                         │   │
│  │                                                     │   │
│  │         ○ Journal (10m)                             │   │
│  │        /                                            │   │
│  │      ○ Wake ──→ ○ Coffee ──→ ○ Stretch ──→ ○ Plan   │   │
│  │        \                                    ↓       │   │
│  │         ○────────────────────────────→ ○ Deep Work  │   │
│  │                                                     │   │
│  │  ═══════════════════════════════════════════════    │   │
│  │  Total: 55 min │ Streak: 🔥 12 days │ Hit rate: 85% │   │
│  │  [Edit] [Add to Week] [Start now]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             EVENING ORBIT 🌙                         │   │
│  │                                                     │   │
│  │      ○ Review ──→ ○ Journal ──→ ○ Wind Down ──→ 😴  │   │
│  │                                                     │   │
│  │  ═══════════════════════════════════════════════    │   │
│  │  Total: 30 min │ Streak: 🔥 5 days │ Hit rate: 72%  │   │
│  │  [Edit] [Add to Week] [Start now]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             WEEKLY ANCHORS ⚓                        │   │
│  │                                                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Sunday   │  │ Wednesday│  │ Friday   │          │   │
│  │  │ Planning │  │ Check-in │  │ Debrief  │          │   │
│  │  │ 45m      │  │ 15m      │  │ 30m      │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Glyph] "Your morning routine is strong. Evening    │   │
│  │          needs some love—missed 3 days this week."  │   │
│  │          [Fix evening]                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Orbit Visualization

- Morning orbit: Sun icon ☀️, warm gradient (amber → gold)
- Evening orbit: Moon icon 🌙, cool gradient (indigo → purple)
- Weekly anchors: Anchor icon ⚓, neutral (slate)

### Step Styling

| Status          | Visual          | Description                      |
| --------------- | --------------- | -------------------------------- |
| Template step   | Hollow circle ○ | Part of template                 |
| Completed today | Filled circle ● | Instance done                    |
| Missed today    | Red outline ◎   | Instance skipped/missed          |
| Optional        | Dashed circle ○̲ | Can skip without breaking streak |

### Streak Display

```
🔥 12 days │ Best: 21 │ Hit rate: 85% (last 30d)
```

## Glyph Behavior

| Context       | Glyph State  | Position            | Dialogue Hooks                               |
| ------------- | ------------ | ------------------- | -------------------------------------------- |
| Overview      | `idle`       | Bottom bar          | "Your rituals shape your days."              |
| Strong streak | `success`    | Near streak counter | "12 days strong! Keep it going."             |
| Broken streak | `responding` | Near broken habit   | "Morning slipped. Want to simplify it?"      |
| Wizard mode   | `thinking`   | Center              | "Let's design a routine that works for you." |
| Creating new  | `responding` | Following cursor    | "What should this routine include?"          |

## Data Model

### Inputs

```typescript
interface HabitsRitualsLensProps {
  templates: HabitTemplate[];
  instances: HabitInstance[]; // Scheduled/completed instances
  streakData: Map<string, StreakInfo>;
  currentDate: Date;
}

interface HabitTemplate {
  id: string;
  label: string; // "Morning Routine"
  category: "morning" | "evening" | "weekly" | "custom";
  steps: HabitStep[];
  totalDuration: number; // Computed from steps
  recurrence: RecurrenceRule;
  createdAt: Date;
  lastModified: Date;
}

interface HabitStep {
  id: string;
  label: string; // "Journal"
  duration: number; // Minutes
  optional: boolean;
  nodeId?: GraphNodeId; // Link to LifeGraph node (optional)
  order: number;
}

interface RecurrenceRule {
  type: "daily" | "weekdays" | "weekends" | "weekly" | "custom";
  daysOfWeek?: number[]; // 0=Sun, 6=Sat
  frequency?: number; // Every N days/weeks
}

interface HabitInstance {
  id: string;
  templateId: string;
  scheduledDate: Date;
  status: "scheduled" | "in_progress" | "completed" | "partial" | "missed";
  stepResults: Map<string, "done" | "skipped" | "pending">;
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
}

interface StreakInfo {
  templateId: string;
  currentStreak: number;
  bestStreak: number;
  hitRate: number; // 0–1, last 30 days
  lastCompleted: Date | null;
  lastMissed: Date | null;
}
```

### Outputs

```typescript
interface HabitsRitualsLensOutputs {
  onTemplateCreate: (template: Omit<HabitTemplate, "id">) => void;
  onTemplateEdit: (templateId: string, updates: Partial<HabitTemplate>) => void;
  onTemplateDelete: (templateId: string) => void;
  onAddToWeek: (templateId: string, targetDate: Date) => void;
  onStartNow: (templateId: string) => void;
  onInstanceComplete: (instanceId: string, stepResults: Map<string, "done" | "skipped">) => void;
  onViewInGraph: (nodeId: GraphNodeId) => void;
}
```

### Graph Integration

```typescript
// When template is created, optionally create nodes in LifeGraph
const templateToGraphNodes = (template: HabitTemplate): GraphNode[] => {
  return template.steps.map((step) => ({
    id: step.nodeId || `habit:${template.id}:${step.id}`,
    label: step.label,
    category: "Habit",
    weight: 0.6,
    meta: {
      templateId: template.id,
      stepId: step.id,
      duration: step.duration,
    },
  }));
};

// When instance is scheduled, create edges
const instanceToEdges = (instance: HabitInstance, dayNodeId: string): GraphEdge[] => {
  return [
    {
      id: `instance:${instance.id}`,
      source: instance.templateId,
      target: dayNodeId,
      type: "scheduled_for",
    },
  ];
};
```

## Interactions

| Input                 | Action                                | Feedback                               |
| --------------------- | ------------------------------------- | -------------------------------------- |
| Tap template          | Expand to show steps + stats          | Accordion animation                    |
| "Edit" button         | Open template editor                  | Modal or inline edit                   |
| "Add to Week"         | Open day picker, create instance      | Navigates to Week with template placed |
| "Start now"           | Navigate to Stack with steps as tasks | Transition to Stack                    |
| Drag step (edit mode) | Reorder steps                         | Steps shift                            |
| "+ New" button        | Open creation wizard                  | Modal flow                             |
| Tap step              | Toggle optional status                | Dashed/solid border change             |
| Swipe template        | Delete with confirmation              | Slide to reveal delete                 |

### Creation Wizard

```
Step 1: Choose type
  [Morning ☀️] [Evening 🌙] [Weekly ⚓] [Custom]

Step 2: Name it
  "What do you want to call this routine?"
  [_____________________]

Step 3: Add steps
  [+ Add step]
  ○ Wake (5m)
  ○ Journal (10m)
  [+ Add step]

Step 4: Set recurrence
  [Daily] [Weekdays] [Weekends] [Custom...]

Step 5: Review
  "Morning Routine" - 5 steps, 45 min, daily
  [Create] [Back]
```

## Shared State Contract

```typescript
// Written by Habits & Rituals lens
habitsStore.templates: HabitTemplate[]
habitsStore.instances: HabitInstance[]
habitsStore.streaks: Map<string, StreakInfo>

// Read by Habits & Rituals lens
graphStore.graph: GraphSnapshot // For node linking
currentDate: Date

// Consumed downstream
// Week reads habitsStore.templates for drag-drop blocks
// Today reads habitsStore.instances for scheduled habits
// Stack reads template steps when habit is started
// Debrief reads streaks and instance results
```

## Component Architecture

```
<HabitsRitualsLensContainer>
  ├── <HabitsHeader>
  │   └── [+ New] [Wizard]
  │
  ├── <OrbitSection category="morning">
  │   ├── <OrbitVisualization>
  │   │   └── <Canvas> (optional 3D orbit) or
  │   │   └── <SVGOrbit steps={steps} />
  │   │
  │   ├── <OrbitStats streak={...} hitRate={...} />
  │   │
  │   └── <OrbitActions>
  │       └── [Edit] [Add to Week] [Start now]
  │
  ├── <OrbitSection category="evening">
  │   └── ... (same structure)
  │
  ├── <WeeklyAnchors>
  │   └── {weeklyTemplates.map(t => <AnchorCard template={t} />)}
  │
  └── <GlyphBar state={glyphState} dialogue={...}>
      └── [Fix evening] (context-dependent CTA)
  </GlyphBar>
</HabitsRitualsLensContainer>
```

### Orbit Visualization Options

```typescript
// Option 1: Simple SVG arc
<svg viewBox="0 0 200 100">
  <path d="M 10 90 Q 100 10 190 90" fill="none" stroke="currentColor" />
  {steps.map((step, i) => (
    <circle cx={...} cy={...} r={8} key={step.id} />
  ))}
</svg>

// Option 2: Mini Graph3D with ring layout
<Canvas>
  <Graph3D
    graph={templateAsGraph}
    layout="ring"
    embedMode={true}
    maxNodeCountForLabels={10}
  />
</Canvas>
```

## Animations & Transitions

| Event                  | Animation                          | Duration             | Easing          |
| ---------------------- | ---------------------------------- | -------------------- | --------------- |
| Enter lens             | Orbits fade in sequentially        | 400ms, 150ms stagger | `easeOutCubic`  |
| Expand template        | Accordion reveals steps            | 300ms                | `easeInOutQuad` |
| Step complete          | Circle fills with checkmark        | 200ms                | spring          |
| Streak increment       | Fire emoji pulses, number ticks up | 400ms                | `easeOutBack`   |
| Add to Week            | Template flies toward Week lens    | 500ms                | `easeInCubic`   |
| Wizard step transition | Slide left/right                   | 300ms                | `easeInOutQuad` |

### Streak Animation

```typescript
// On streak increment
<motion.div
  animate={{ scale: [1, 1.3, 1] }}
  transition={{ duration: 0.4 }}
>
  🔥 {streak}
</motion.div>
```

## Edge Cases

| Scenario                        | Handling                                                     |
| ------------------------------- | ------------------------------------------------------------ |
| No templates                    | Empty state: "No rituals yet. Start with a morning routine?" |
| Streak broken today             | Highlight broken habit; Glyph offers to simplify             |
| Template with 0 steps           | Invalid; require at least 1 step to save                     |
| Instance partially complete     | Mark as 'partial'; count toward streak if >50% done          |
| Template edited after instances | Future instances use new template; past unaffected           |
| Weekly anchor missed            | Show makeup option: "Reschedule this week's planning?"       |
| Conflicting instances same day  | Warn: "Two morning routines scheduled. Merge or pick one?"   |

## Acceptance Criteria

- [ ] **AC-1:** Morning/Evening orbits display all steps with correct duration and order.
- [ ] **AC-2:** Streak counter updates in real-time when instance completes.
- [ ] **AC-3:** "Add to Week" creates `HabitInstance` and navigates to Week with block placed.
- [ ] **AC-4:** "Start now" navigates to Stack with template steps as `StackTask[]`.
- [ ] **AC-5:** Editing a template updates future instances but not past completions.
- [ ] **AC-6:** Hit rate computes correctly from last 30 days of instances.
- [ ] **AC-7:** Wizard flow creates valid template with at least 1 step.
- [ ] **AC-8:** Templates link to LifeGraph nodes (optional) and edges appear when scheduled.

---

## Tech Notes

- **Streak logic:** Streak breaks if today is a scheduled day and instance is not 'completed' or 'partial' by end of day.
- **Instance generation:** Auto-create instances for the next 7 days based on recurrence rule.
- **Template versioning:** Store `version` on template; instances reference specific version.
- **Graph sync:** Creating a template can optionally auto-create `category: 'Habit'` nodes.
- **Partial completion:** >50% of non-optional steps = partial; counts as 0.5 toward hit rate.
