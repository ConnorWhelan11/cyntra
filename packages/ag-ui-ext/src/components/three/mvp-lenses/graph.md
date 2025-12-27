# Graph Lens (Life / Context View)

> **Core Question:** "How does everything in my life connect right now?"

## Purpose

The Graph lens is the big-picture orienting view of the entire LifeGraph. It allows users to see all commitments, goals, habits, and distractions in spatial context, anchored around a dynamically computed `NOW` node. This is the "god view" where users can zoom out, select focus areas, and understand topology before diving into planning or execution.

## Entry Points (Triggers)

| Trigger                      | Source             | Initial Mode                  |
| ---------------------------- | ------------------ | ----------------------------- |
| "Zoom out" voice/text        | Stack, Today, Week | `overview`                    |
| "Show my whole graph"        | Any lens           | `overview`                    |
| "Show context for [node]"    | Goals, Today       | `shrinkToNow` focused on node |
| "Where does [goal] connect?" | Goals              | `routePlanning`               |
| "Show my leaks"              | Stack, Debrief     | `attentionLeaks`              |
| App cold start (no session)  | Boot               | `overview` with gentle drift  |

## Exit Points (Destinations)

| CTA / Gesture         | Destination                                 | Passed State                              |
| --------------------- | ------------------------------------------- | ----------------------------------------- |
| "Plan this" button    | Week                                        | `{ focusNodeId, goalNodeId, bias: true }` |
| "Focus on today"      | Today                                       | `{ focusNodeId }`                         |
| Double-click node     | Goals (if goal node) / Today (if scheduled) | `{ nodeId }`                              |
| "Prune distractions"  | Leaks                                       | `{ distractionNodeIds }`                  |
| Background swipe down | Previous lens                               | —                                         |

## Visual Composition

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                     │   │
│   │           [Graph3D canvas - full bleed]             │   │
│   │                                                     │   │
│   │      ○──○                                           │   │
│   │     /    \      ◉ NOW                               │   │
│   │    ○      ○────[Glyph hovers here]                  │   │
│   │     \    /                                          │   │
│   │      ○──○──○ (distraction, dimmed in focus modes)   │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Mode: overview │ Focus: NOW │ [Plan this] [Leaks]  │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Mode-Specific Visuals

| Mode             | Labels             | Dimming                  | Glyph Position                | Camera                     |
| ---------------- | ------------------ | ------------------------ | ----------------------------- | -------------------------- |
| `overview`       | ~40 visible        | None                     | Slow orbit around NOW         | Auto-rotate                |
| `shrinkToNow`    | Only highlighted   | Yes, unhighlighted nodes | Hovers near NOW + high-impact | Locked on NOW              |
| `routePlanning`  | Path nodes only    | Yes                      | Oscillates along path         | Lerps between start/goal   |
| `attentionLeaks` | Distraction labels | Dim non-distractions     | Points at leaks               | Frames distraction cluster |

## Glyph Behavior

| Mode             | Glyph State  | Movement                                                  | Dialogue Hooks                             |
| ---------------- | ------------ | --------------------------------------------------------- | ------------------------------------------ |
| `overview`       | `idle`       | Patrol orbit (`targetPosRef` = `sin/cos` path around NOW) | "This is your whole life graph..."         |
| `shrinkToNow`    | `responding` | Hover 2.5 units above NOW                                 | "Here's what matters most right now."      |
| `routePlanning`  | `thinking`   | Lerp between NOW and goal positions                       | "I'm weaving a route to [goal]..."         |
| `attentionLeaks` | `responding` | Point toward distraction cluster                          | "These branches leak away from your goal." |

## Data Model

### Inputs

```typescript
interface GraphLensProps {
  graph: GraphSnapshot; // Full LifeGraph
  mode: "overview" | "shrinkToNow" | "routePlanning" | "attentionLeaks";
  focusNodeId?: GraphNodeId; // Required for non-overview modes
  goalNodeId?: GraphNodeId; // For routePlanning
  routeNodeIds?: GraphNodeId[]; // Computed path
  highImpactNodeIds?: GraphNodeId[]; // Hot nodes (deadlines, neglected)
  distractionNodeIds?: GraphNodeId[]; // For attentionLeaks
  layout?: LayoutMode; // Default 'fibonacci', 'ring' for mission view
}
```

### Outputs (via callbacks or shared state)

```typescript
interface GraphLensOutputs {
  onFocusChange: (nodeId: GraphNodeId | null) => void;
  onModeChange: (mode: GraphLensMode) => void;
  onPlanRequest: (context: { focusNodeId: string; goalNodeId?: string }) => void;
  onLeaksRequest: (distractionIds: string[]) => void;
}
```

### Required Node Categories

- `Mission` — Ring/timeline anchors
- `School`, `Work`, `Health`, `Creative` — Life domains
- `Distraction` — Leak nodes (YouTube, Twitter, etc.)
- `Habit` — Recurring behavior nodes
- `Goal` — North Star nodes (may overlap with domain)

## Interactions

| Input                        | Action                        | Feedback                                           |
| ---------------------------- | ----------------------------- | -------------------------------------------------- |
| Single-click node            | Select as `focusNodeId`       | Node pulses, label enlarges, Glyph turns toward it |
| Double-click node            | Toggle overview ↔ shrinkToNow | Smooth camera transition, labels fade in/out       |
| Click background             | Deselect, return to overview  | Glyph resumes patrol                               |
| Pinch/scroll                 | Zoom in/out                   | Camera dollies; fog density adjusts                |
| "Plan this" CTA              | Navigate to Week with bias    | Crossfade transition                               |
| "Prune" CTA (attentionLeaks) | Navigate to Leaks             | Distraction nodes pulse red before exit            |

## Shared State Contract

```typescript
// Written by Graph lens
graphStore.focusNodeId: GraphNodeId | null
graphStore.currentMode: GraphLensMode
graphStore.cameraTarget: THREE.Vector3

// Read by Graph lens
graphStore.graph: GraphSnapshot // Source of truth
goalsStore.activeGoalId: GraphNodeId | null // Biases shrinkToNow
leaksStore.suppressedNodeIds: GraphNodeId[] // Dims these in all modes
```

## Component Architecture

```
<GraphLensContainer>
  ├── <Canvas> (from @react-three/fiber)
  │   └── <GraphLensScene>
  │       ├── <EnvironmentSetup /> (fog, lights, stars)
  │       ├── <Graph3D ref={graphRef} embedMode={false} ... />
  │       ├── <GraphGlyph targetPosRef={...} state={glyphState} />
  │       └── <EffectComposer> <Bloom /> </EffectComposer>
  │
  └── <GraphLensHUD>
      ├── <ModeIndicator mode={mode} />
      ├── <FocusChip nodeId={focusNodeId} />
      └── <CTABar> [Plan this] [Show leaks] </CTABar>
</GraphLensContainer>
```

### Reuse from Existing Code

- `GraphGodSceneInner` → rename/adapt to `GraphLensScene`
- `Graph3D` — use as-is with props from mode config
- `GraphGlyph` → wrapper around `GlyphObject` with lerped target

## Animations & Transitions

| Event                | Animation                              | Duration | Easing          |
| -------------------- | -------------------------------------- | -------- | --------------- |
| Mode switch          | Labels fade, Glyph lerps to new target | 600ms    | `easeOutCubic`  |
| Node selection       | Selected node scales 1.0→1.3→1.15      | 300ms    | spring          |
| Camera refocus       | `controlsRef.target.lerp()`            | 800ms    | `easeInOutQuad` |
| Enter attentionLeaks | Distraction edges glow red, pulse      | 400ms    | linear          |
| Exit to Week         | Graph fades to ghost (opacity 0.15)    | 500ms    | `easeOutQuad`   |

## Edge Cases

| Scenario                       | Handling                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Empty graph (new user)         | Show single NOW node + Glyph greeting: "Let's build your life graph together." |
| No distractions found          | attentionLeaks mode shows empty state: "No leaks detected. Nice focus!"        |
| Selected node deleted mid-view | Auto-switch to overview, toast: "Node removed."                                |
| > 200 nodes                    | Increase fog density, reduce `maxNodeCountForLabels` to 10                     |

## Acceptance Criteria

- [ ] **AC-1:** All four modes render without layout recomputation jank (<16ms frame time).
- [ ] **AC-2:** Focus transitions (lerp to new target) complete in <800ms with no camera stutter.
- [ ] **AC-3:** Hot nodes in `shrinkToNow` have visible glow/halo; unhighlighted nodes are visibly dimmed (opacity ≤0.3).
- [ ] **AC-4:** Selecting a node updates `graphStore.focusNodeId` within the same frame.
- [ ] **AC-5:** "Plan this" CTA navigates to Week with `goalNodeId` pre-filled and bias flag set.
- [ ] **AC-6:** `attentionLeaks` mode correctly highlights only nodes with `category: 'Distraction'`.
- [ ] **AC-7:** Glyph state matches mode (idle/responding/thinking) and dialogue hooks fire.
- [ ] **AC-8:** `ring` layout option correctly renders mission nodes in a circle when toggled.

---

## Tech Notes

- **Reuse:** `GraphGodSceneInner` from `GlyphGraphGod.stories.tsx` is the reference implementation.
- **Glyph target:** Use `targetPosRef` (mutable ref) to avoid re-renders on every frame.
- **Labels:** `maxNodeCountForLabels` should be mode-driven (40 for overview, 0 for focused).
- **Performance:** For graphs >100 nodes, enable instancing (`enableInstancing` prop on Graph3D).
