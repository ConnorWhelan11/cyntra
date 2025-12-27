# Goals Lens (North Star)

> **Core Question:** "Why am I doing all of this?"

## Purpose

The Goals lens surfaces 3–7 North Star nodes that anchor all downstream planning and prioritization. This is the "why" layer—used during onboarding to establish direction and during weekly reorientation to recalibrate effort. Everything else in the LifeGraph fades into faint threads feeding into these anchors. From here, users can bias the Week/Today planners toward a specific goal or dive into Graph context.

## Entry Points (Triggers)

| Trigger                | Source     | Initial State                        |
| ---------------------- | ---------- | ------------------------------------ |
| "Why am I doing this?" | Any lens   | Show all goals, no selection         |
| "What are my goals?"   | Voice/chat | Show all goals                       |
| Weekly ritual start    | System     | Show goals + last week's goal health |
| Onboarding flow        | First run  | Wizard mode to create 3–7 goals      |
| "Reprioritize"         | Debrief    | Show goals with health metrics       |

## Exit Points (Destinations)

| CTA / Gesture     | Destination         | Passed State                 |
| ----------------- | ------------------- | ---------------------------- |
| "Plan this goal"  | Week                | `{ goalNodeId, bias: true }` |
| "Show context"    | Graph (shrinkToNow) | `{ focusNodeId: goalId }`    |
| Double-click goal | Graph (focused)     | `{ focusNodeId: goalId }`    |
| "Start today"     | Today               | `{ goalBias: goalId }`       |
| Swipe down / back | Previous lens       | —                            |

## Visual Composition

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │           [Graph3D - Goals as large anchors]        │   │
│   │                                                     │   │
│   │         ◉ Med School        ◉ Mental Health         │   │
│   │              \                 /                    │   │
│   │               ·───·───·───·───·  (faint threads)    │   │
│   │              /                 \                    │   │
│   │         ◉ Portfolio         ◉ Fitness               │   │
│   │                                                     │   │
│   │              [Glyph at center]                      │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Selected: Med School │ Health: 72% │ Streak: 5d    │   │
│   │  [Plan this goal]  [Show context]                   │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Goal Node Styling

| Property | Value                                                                   |
| -------- | ----------------------------------------------------------------------- |
| Scale    | 2.5× normal node size                                                   |
| Color    | Domain-derived (School=blue, Health=green, Creative=purple, Work=amber) |
| Halo     | Glow intensity = confidence score (0–1)                                 |
| Label    | Always visible, larger font                                             |

### Supporting Nodes

- Fade to 15% opacity
- Edges become thin, desaturated lines
- No labels unless hovered

## Glyph Behavior

| State         | Glyph State  | Position                        | Dialogue Hooks                                               |
| ------------- | ------------ | ------------------------------- | ------------------------------------------------------------ |
| No selection  | `idle`       | Center of goal constellation    | "These are your North Stars. What drives you this week?"     |
| Goal selected | `responding` | Floats toward selected goal     | "This goal connects to 12 tasks and 3 habits."               |
| Health review | `thinking`   | Cycles between low-health goals | "Your [goal] hasn't gotten love lately. Want to focus here?" |

## Data Model

### Inputs

```typescript
interface GoalsLensProps {
  graph: GraphSnapshot;
  goalNodeIds: GraphNodeId[]; // 3–7 goals, pre-filtered
  goalHealth?: Map<GraphNodeId, GoalHealth>; // Optional health metrics
  selectedGoalId?: GraphNodeId | null;
}

interface GoalHealth {
  confidence: number; // 0–1, recent task completion rate
  freshness: number; // 0–1, days since last activity (inverted)
  streak: number; // consecutive days with goal-related activity
  lastActivity: Date;
}
```

### Outputs

```typescript
interface GoalsLensOutputs {
  onGoalSelect: (goalId: GraphNodeId | null) => void;
  onPlanGoal: (goalId: GraphNodeId) => void;
  onShowContext: (goalId: GraphNodeId) => void;
  onReorder: (orderedGoalIds: GraphNodeId[]) => void; // Priority adjustment
}
```

### Goal Node Requirements

```typescript
// Goals are GraphNodes with:
{
  id: string;
  label: string; // e.g., "Get into Med School"
  category: 'Goal';
  weight: number; // 0.9–1.0 (always high)
  meta: {
    domain: 'School' | 'Health' | 'Work' | 'Creative' | 'Relationship';
    targetDate?: Date;
    description?: string;
  }
}
```

## Interactions

| Input                | Action                            | Feedback                                     |
| -------------------- | --------------------------------- | -------------------------------------------- |
| Single-click goal    | Select goal, show health + CTAs   | Goal pulses, supporting threads highlight    |
| Double-click goal    | Navigate to Graph focused on goal | Camera swoops into Graph lens                |
| Drag goal (reorder)  | Adjust priority ranking           | Other goals shift, order persists            |
| Click background     | Deselect                          | CTAs hide, Glyph returns to center           |
| "Plan this goal" CTA | Navigate to Week                  | Goal-biased week planning                    |
| Hover goal           | Show health tooltip               | Tooltip with confidence/streak/last activity |

## Shared State Contract

```typescript
// Written by Goals lens
goalsStore.selectedGoalId: GraphNodeId | null
goalsStore.goalPriority: GraphNodeId[] // Ordered list

// Read by Goals lens
graphStore.graph: GraphSnapshot
analyticsStore.goalHealth: Map<GraphNodeId, GoalHealth>

// Consumed by downstream lenses
// Week/Today read goalsStore.selectedGoalId for bias
// Graph reads goalsStore.selectedGoalId for focus
```

## Component Architecture

```
<GoalsLensContainer>
  ├── <Canvas>
  │   └── <GoalsLensScene>
  │       ├── <Graph3D
  │       │     graph={filteredGraph}
  │       │     layout="custom"
  │       │     dimUnhighlighted={true}
  │       │     highlightedNodeIds={goalNodeIds}
  │       │     maxNodeCountForLabels={7}
  │       │     embedMode={true}
  │       │   />
  │       ├── <GoalGlyph state={glyphState} />
  │       └── <EffectComposer> <Bloom /> </EffectComposer>
  │
  └── <GoalsLensHUD>
      ├── <SelectedGoalCard goalId={...} health={...} />
      │   ├── <HealthIndicator confidence={...} streak={...} />
      │   └── <CTABar> [Plan this goal] [Show context] </CTABar>
      │
      └── <GoalReorderHandle /> (drag affordance)
</GoalsLensContainer>
```

### Graph Filtering

```typescript
// Create a filtered graph for Goals lens
const filteredGraph: GraphSnapshot = {
  nodes: [
    ...goalNodes, // Full opacity, scaled up
    ...supportingNodes.map((n) => ({ ...n, weight: 0.1 })), // Faded
  ],
  edges: edges.filter((e) => goalNodeIds.includes(e.source) || goalNodeIds.includes(e.target)),
};
```

## Animations & Transitions

| Event              | Animation                                                 | Duration    | Easing           |
| ------------------ | --------------------------------------------------------- | ----------- | ---------------- |
| Enter Goals lens   | Goals fade in at scale 0→1, supporting nodes fade to 0.15 | 500ms       | `easeOutBack`    |
| Goal selection     | Selected goal scales 1→1.2, halo brightens                | 300ms       | spring           |
| Goal reorder       | Goals lerp to new positions                               | 400ms       | `easeInOutCubic` |
| Exit to Graph      | Goals shrink to normal node size, context fades in        | 600ms       | `easeInOutQuad`  |
| Health review mode | Glyph cycles, low-health goals pulse amber                | 2000ms loop | linear           |

## Edge Cases

| Scenario                    | Handling                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| No goals defined (new user) | Show onboarding wizard: "Let's define 3–5 things that matter most." |
| Single goal                 | Center it prominently; suggest adding more                          |
| > 7 goals                   | Warn: "Too many North Stars dilute focus. Consider archiving some." |
| Goal with 0% health         | Pulse red, Glyph suggests: "This goal needs attention or closure."  |
| All goals healthy           | Celebration state: "Your North Stars are aligned. Keep it up!"      |

## Acceptance Criteria

- [ ] **AC-1:** Goals render at 2.5× normal node scale with domain-derived colors.
- [ ] **AC-2:** Supporting nodes fade to 15% opacity and have no labels by default.
- [ ] **AC-3:** Selecting a goal shows health metrics (confidence, streak) within 100ms.
- [ ] **AC-4:** "Plan this goal" navigates to Week with `goalNodeId` and `bias: true` in state.
- [ ] **AC-5:** "Show context" navigates to Graph in `shrinkToNow` mode focused on goal.
- [ ] **AC-6:** Goal reorder persists to `goalsStore.goalPriority` and affects Week/Today suggestions.
- [ ] **AC-7:** Glyph cycles toward low-health goals when in health review mode.
- [ ] **AC-8:** Onboarding wizard appears when `goalNodeIds.length === 0`.

---

## Tech Notes

- **Layout:** Use `layout="custom"` with goal nodes clustered centrally via `positionHint`.
- **Health computation:** Pull from `analyticsStore`; calculate confidence = (completed tasks / planned tasks) over last 7 days.
- **Reorder persistence:** Store `goalPriority` array; affects node `weight` in downstream lens filtering.
- **Performance:** Goal lens is always small (<10 nodes visible), so no instancing needed.
