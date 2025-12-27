# Leaks Lens (Distraction Firewall)

> **Core Question:** "What's pulling me off-course, and can you fence it off?"

## Purpose

The Leaks lens detects and suppresses distraction nodes in the LifeGraph—the branches that leak attention away from the current focus. It visualizes which nodes are pulling focus (YouTube, Twitter, random tabs) and offers time-boxed enforcement to mute them. This is the firewall between intent and impulse, integrated tightly with Stack for seamless focus protection.

## Entry Points (Triggers)

| Trigger                          | Source                      | Initial State                               |
| -------------------------------- | --------------------------- | ------------------------------------------- |
| "I'm distracted"                 | Stack                       | Show leaks from current goal/path           |
| "Show my leaks"                  | Graph, voice                | Full distraction inventory                  |
| Auto-trigger (tab-hop telemetry) | System                      | Surfaced leaks + Glyph prompt               |
| "Prune distractions"             | Graph (attentionLeaks mode) | Pre-populated with highlighted distractions |
| Pre-focus ritual                 | Stack (before start)        | Suggest preemptive suppression              |

## Exit Points (Destinations)

| CTA / Gesture       | Destination            | Passed State                          |
| ------------------- | ---------------------- | ------------------------------------- |
| Confirm suppression | Stack (return)         | `{ enforcementState: active }`        |
| "Cancel"            | Previous lens          | —                                     |
| "Show why"          | Graph (attentionLeaks) | `{ distractionNodeIds, focusedPath }` |
| Timer expires       | Stack (auto-return)    | `{ enforcementState: expired }`       |
| Manual unmute       | Stack                  | `{ enforcementState: disabled }`      |

## Visual Composition

```
┌─────────────────────────────────────────────────────────────┐
│  ATTENTION LEAKS                              [Cancel]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │   [Graph3D - attentionLeaks mode]                   │   │
│  │                                                     │   │
│  │      ◉ NOW ──────→ ◉ Orgo Review                    │   │
│  │         \                                           │   │
│  │          \──→ 🔴 YouTube (leak!)                    │   │
│  │           \                                         │   │
│  │            └→ 🔴 Twitter (leak!)                    │   │
│  │                                                     │   │
│  │      [Glyph pointing at leaks]                      │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DETECTED LEAKS                                     │   │
│  │                                                     │   │
│  │  🔴 YouTube        ├─ [Block site] [Mute] [Allow]   │   │
│  │     Last: 15m ago  │                                │   │
│  │                    │                                │   │
│  │  🔴 Twitter        ├─ [Block site] [Mute] [Allow]   │   │
│  │     Last: 8m ago   │                                │   │
│  │                    │                                │   │
│  │  🟡 Reddit         ├─ [Block site] [Mute] [Allow]   │   │
│  │     Last: 2h ago   │                                │   │
│  │                    │                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SUPPRESSION TIMER                                  │   │
│  │                                                     │   │
│  │  [25 min]  [50 min]  [90 min]  [Custom...]          │   │
│  │     ◉          ○          ○                         │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Glyph] "These branches leak from your Orgo goal.   │   │
│  │          Mute for 25 min?"                          │   │
│  │                                                     │   │
│  │         [Confirm Suppression]   [Show why]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Leak Item Styling

| Severity     | Color    | Icon    | Criteria                      |
| ------------ | -------- | ------- | ----------------------------- |
| Hot (recent) | Red 🔴   | flame   | Accessed within last 30min    |
| Warm         | Amber 🟡 | warning | Accessed within last 2h       |
| Cool         | Gray ⚪  | circle  | Known distraction, not recent |

### Graph Visualization

- `attentionLeaks` mode from `GraphGodSceneInner`
- Focus path (NOW → current goal) stays bright
- Distraction edges glow red and pulse
- Non-distraction nodes dimmed to 20% opacity

## Glyph Behavior

| Context               | Glyph State  | Position               | Dialogue Hooks                            |
| --------------------- | ------------ | ---------------------- | ----------------------------------------- |
| Leaks detected        | `responding` | Points at leak cluster | "These are pulling you off-course."       |
| User reviewing list   | `idle`       | Bottom corner          | "Take your time. Decide what to mute."    |
| Suppression confirmed | `success`    | Center briefly         | "Firewall up. Back to work!"              |
| No leaks found        | `success`    | Center                 | "No leaks detected. Your focus is clean!" |
| Suppression expires   | `responding` | Stack bar              | "Enforcement ended. Stay on course?"      |

## Data Model

### Inputs

```typescript
interface LeaksLensProps {
  graph: GraphSnapshot;
  focusNodeId: GraphNodeId; // Current focus (NOW or active task)
  goalNodeId?: GraphNodeId; // Goal being worked toward
  focusedPath?: GraphNodeId[]; // Path from NOW to goal
  telemetryData?: TelemetrySignal[]; // Tab/app activity
}

interface TelemetrySignal {
  nodeId: GraphNodeId; // Matched distraction node
  timestamp: Date;
  source: "tab_switch" | "app_open" | "url_visit" | "manual";
  duration?: number; // Seconds spent
}

interface DistractionNode {
  nodeId: GraphNodeId;
  label: string;
  severity: "hot" | "warm" | "cool";
  lastAccessed?: Date;
  totalTimeToday?: number; // Minutes
  sites?: string[]; // Associated URLs (youtube.com, etc.)
  apps?: string[]; // Associated apps (YouTube, Twitter)
}
```

### Outputs

```typescript
interface LeaksLensOutputs {
  onSuppressionConfirm: (config: SuppressionConfig) => void;
  onSuppressionCancel: () => void;
  onLeakToggle: (nodeId: GraphNodeId, action: "block" | "mute" | "allow") => void;
  onShowWhy: (nodeId: GraphNodeId) => void; // Opens Graph with edge highlighted
  onDurationSelect: (minutes: number) => void;
}

interface SuppressionConfig {
  targetNodeIds: GraphNodeId[];
  duration: number; // Minutes
  enforcement: EnforcementLevel;
  blockedSites?: string[];
  blockedApps?: string[];
  startedAt: Date;
  endsAt: Date;
}

type EnforcementLevel =
  | "soft" // Visual reminder only
  | "medium" // Browser extension blocks
  | "hard"; // System-level blocking (Sideglyph)
```

### Enforcement State

```typescript
interface EnforcementState {
  active: boolean;
  config: SuppressionConfig | null;
  remainingSeconds: number;
  suppressedNodeIds: GraphNodeId[];
  blockedUrls: string[];
  violationCount: number; // Attempts to access blocked
}
```

## Interactions

| Input                 | Action                                | Feedback                        |
| --------------------- | ------------------------------------- | ------------------------------- |
| Select duration       | Set suppression timer                 | Radio button highlights         |
| Toggle leak item      | Change individual leak action         | Per-item badge updates          |
| "Confirm Suppression" | Activate enforcement, return to Stack | Firewall animation, transition  |
| "Show why"            | Navigate to Graph showing leak edge   | Camera zooms to leak connection |
| "Cancel"              | Return to previous lens               | No state change                 |
| Tap leak in graph     | Highlight in list below               | List item pulses                |
| Swipe leak left       | Quick-mute that leak                  | Mute badge appears              |

### Duration Presets

| Duration | Use Case                 |
| -------- | ------------------------ |
| 25 min   | Pomodoro sprint          |
| 50 min   | Deep work session        |
| 90 min   | Extended focus block     |
| Custom   | User-defined (5–180 min) |

## Shared State Contract

```typescript
// Written by Leaks lens
leaksStore.enforcementState: EnforcementState
leaksStore.knownDistractions: DistractionNode[]
leaksStore.suppressionHistory: SuppressionConfig[]

// Read by Leaks lens
graphStore.graph: GraphSnapshot
stackStore.activeTaskId: string | null
stackStore.blockId: string | null
telemetryStore.recentSignals: TelemetrySignal[]

// Consumed downstream
// Stack reads leaksStore.enforcementState for badge
// Debrief reads suppressionHistory for reflection
// Graph reads for attentionLeaks visualization
```

## Component Architecture

```
<LeaksLensContainer>
  ├── <LeaksHeader>
  │   └── [Cancel] button
  │
  ├── <LeaksGraphView>
  │   └── <Canvas>
  │       └── <GraphGodSceneInner
  │             mode="attentionLeaks"
  │             focusNodeId={focusNodeId}
  │             distractionNodeIds={distractionIds}
  │           />
  │
  ├── <LeaksList>
  │   └── {distractions.map(d => (
  │       <LeakItem
  │         distraction={d}
  │         onAction={handleLeakAction}
  │       >
  │         ├── <SeverityBadge severity={d.severity} />
  │         ├── <LeakLabel label={d.label} lastAccessed={d.lastAccessed} />
  │         └── <LeakActions> [Block] [Mute] [Allow] </LeakActions>
  │       </LeakItem>
  │     ))}
  │
  ├── <DurationPicker>
  │   └── <RadioGroup options={[25, 50, 90, 'custom']} />
  │
  └── <GlyphBar state={glyphState} dialogue={...}>
      └── [Confirm Suppression] [Show why]
  </GlyphBar>
</LeaksLensContainer>
```

### Enforcement Layer Integration

```typescript
// Enforcement hooks (platform-specific)
interface EnforcementHooks {
  // Browser extension
  blockUrls: (urls: string[], duration: number) => Promise<void>;
  unblockUrls: (urls: string[]) => Promise<void>;

  // Desktop app (Sideglyph)
  blockApps: (appIds: string[], duration: number) => Promise<void>;
  unblockApps: (appIds: string[]) => Promise<void>;

  // Telemetry
  onViolationAttempt: (nodeId: GraphNodeId) => void;
}
```

## Animations & Transitions

| Event               | Animation                                             | Duration    | Easing          |
| ------------------- | ----------------------------------------------------- | ----------- | --------------- |
| Enter Leaks         | Graph transitions to attentionLeaks mode, leaks pulse | 500ms       | `easeOutCubic`  |
| Leak pulse          | Red glow expands and fades                            | 1000ms loop | `easeInOut`     |
| Suppression confirm | Shield icon grows, graph fades, return to Stack       | 600ms       | `easeInBack`    |
| Duration select     | Selected option scales up briefly                     | 200ms       | spring          |
| Leak muted          | Item fades to gray, muted badge appears               | 300ms       | linear          |
| Show why            | Camera flies to leak edge in Graph                    | 800ms       | `easeInOutQuad` |

### Leak Edge Animation

```typescript
// Distraction edges in Graph pulse red
<GraphEdge
  edge={edge}
  type="distraction"
  animationConfig={{
    color: '#ff3366',
    pulseIntensity: 0.8,
    pulseFrequency: 1.5, // Hz
  }}
/>
```

## Edge Cases

| Scenario                                | Handling                                        |
| --------------------------------------- | ----------------------------------------------- |
| No distractions detected                | Success state: "No leaks! Your graph is clean." |
| Telemetry unavailable                   | Manual mode: "Select distractions to mute."     |
| User has no Sideglyph                   | Soft enforcement only; explain limitation       |
| Suppression active, user triggers again | Show current suppression; offer extend/modify   |
| Violation during suppression            | Increment counter; optional Glyph nudge         |
| All leaks set to "Allow"                | Warn: "Nothing to suppress. Continue anyway?"   |

## Acceptance Criteria

- [ ] **AC-1:** Distraction nodes display with correct severity (hot/warm/cool) based on recency.
- [ ] **AC-2:** Graph visualization uses `attentionLeaks` mode with focus path bright and leaks pulsing red.
- [ ] **AC-3:** Selecting duration and confirming creates `EnforcementState` with correct `endsAt`.
- [ ] **AC-4:** Returning to Stack shows enforcement badge with countdown.
- [ ] **AC-5:** "Show why" navigates to Graph with leak edge highlighted.
- [ ] **AC-6:** Individual leak toggles (Block/Mute/Allow) update per-node enforcement config.
- [ ] **AC-7:** Suppression timer expiry clears `enforcementState.active` and notifies Stack.
- [ ] **AC-8:** Telemetry signals correctly map to distraction nodes and update severity.

---

## Tech Notes

- **Graph mode:** Reuse `GraphGodSceneInner` with `mode="attentionLeaks"` from stories.
- **Telemetry:** Browser extension sends URL visits; desktop app sends app focus events.
- **Enforcement expiry:** Use `setTimeout` or background task; clean up state on expiry.
- **Site mapping:** Store URL patterns (e.g., `*.youtube.com`) in distraction node `meta`.
- **Violation tracking:** Increment `violationCount` when user attempts blocked site; surface in Debrief.
