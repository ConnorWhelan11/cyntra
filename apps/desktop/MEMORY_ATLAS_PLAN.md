# Cyntra Memory Atlas — Implementation Plan

## 1. MVP Summary

### Core Concept

Transform the Memory page from a dashboard layout into a **spatial exploration experience**: a persistent 3D Memory Atlas as the hero, with a sliding Notion-style drawer for deep inspection, and a compact "Lens" rail for filtering/focusing.

### What Ships in MVP

| Feature                        | In MVP | Notes                                                                          |
| ------------------------------ | ------ | ------------------------------------------------------------------------------ |
| 3D Memory Atlas (center stage) | ✓      | Nodes rendered as glowing orbs, basic orbit controls                           |
| Lens Rail (left)               | ✓      | Type chips, scope toggle, agent chips, importance dial                         |
| Detail Drawer (right)          | ✓      | Slides in on selection, full editing affordances                               |
| Selection sync                 | ✓      | Click atlas node → opens drawer; click list item → flies camera + opens drawer |
| Camera fly-to                  | ✓      | Smooth transition to selected node                                             |
| Frosted glass panels           | ✓      | Drawer + lens rail have backdrop blur, atlas visible behind                    |
| Mini-list in drawer            | ✓      | Scrollable memory list inside drawer (collapsed by default)                    |
| Search                         | ✓      | Lives in top bar, filters atlas + list simultaneously                          |

### What Gets Demoted/Removed

| Current Feature                   | Change                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| Big filter sidebar (col-span-3)   | → Replaced by compact Lens rail (64px wide)                    |
| Separate "List" vs "Graph" toggle | → Removed; atlas is always present, list is embedded in drawer |
| MemoryList as primary view        | → Demoted to secondary (drawer accordion)                      |
| mc-panel containers               | → Replaced by floating/glass panels                            |

### What Stays (Reused)

- `MemoryItem` type and mock data
- Type/agent/scope filter logic
- Importance threshold filtering
- Detail content rendering (badges, metadata, links)
- Color system (TYPE_CONFIG, AGENT_COLORS)

---

## 2. UX + Interaction Spec

### 2.1 Layout Zones

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Search bar (center) + view controls (right)           │
├────┬────────────────────────────────────────────────────────────┤
│    │                                                        ┌───┤
│ L  │                                                        │ D │
│ E  │              3D MEMORY ATLAS                           │ R │
│ N  │           (full bleed, hero)                           │ A │
│ S  │                                                        │ W │
│    │                                                        │ E │
│ R  │                                                        │ R │
│ A  │                                                        │   │
│ I  │                                                        │   │
│ L  │                                                        └───┤
├────┴────────────────────────────────────────────────────────────┤
│  TIMELINE SCRUBBER (optional phase D)                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 User Flows

#### First Load (No Selection)

1. Atlas renders all memories as orbital nodes
2. Drawer is **collapsed** (0px width, invisible)
3. Lens rail shows all filters in "all" state
4. Camera positioned at default orbit (slightly above, looking at centroid)
5. Subtle ambient node pulsing indicates "alive" system

#### Searching

1. User types in search bar
2. Atlas dims non-matching nodes (opacity 0.15)
3. Matching nodes pulse briefly
4. Lens rail shows "N matching" count
5. Drawer list (if open) filters inline

#### Lens Changes

| Lens Control               | Behavior                                                   |
| -------------------------- | ---------------------------------------------------------- |
| Type chips (multi-select)  | Toggle → atlas fades unmatched nodes, camera doesn't move  |
| Scope radio                | Switch → immediate filter, no animation                    |
| Agent chips (multi-select) | Toggle → atlas fades, agent color rings appear on matching |
| Importance dial            | Drag → realtime fade of nodes below threshold              |

Lens changes do **not** close the drawer or change selection.

#### Selecting from Atlas

1. Hover node → tooltip preview (content snippet, type badge)
2. Click node →
   - Camera flies to node (0.6s ease-out-cubic)
   - Node scales up 1.2x with glow
   - Drawer slides open from right (0.4s)
   - Drawer shows full detail
3. Click empty space → deselect, drawer slides closed

#### Selecting from List (inside drawer)

1. User expands "Memory List" accordion in drawer
2. Click list item →
   - Selection state updates
   - Camera flies to that node in atlas
   - Drawer content swaps to new memory (crossfade)

#### Drawer States

| State     | Width | Trigger                                   |
| --------- | ----- | ----------------------------------------- |
| Collapsed | 0px   | No selection / click outside / press Esc  |
| Peek      | 320px | Hover near right edge (optional, phase C) |
| Open      | 400px | Click node or list item                   |
| Expanded  | 560px | Click expand button in drawer header      |

#### Empty States

| Condition              | Display                                                     |
| ---------------------- | ----------------------------------------------------------- |
| No memories in project | Atlas shows placeholder nebula + "No memories yet"          |
| Filters return zero    | Atlas shows all nodes dimmed + "No matches" floating label  |
| No selection           | Drawer hidden, atlas shows "Click a memory to explore" hint |

### 2.3 Keyboard Shortcuts

| Key       | Action                                                 |
| --------- | ------------------------------------------------------ |
| `/`       | Focus search                                           |
| `Esc`     | Close drawer / clear search                            |
| `←` / `→` | Previous / next memory (when drawer open)              |
| `Space`   | Toggle drawer expanded/normal                          |
| `R`       | Reset camera to default orbit                          |
| `1-4`     | Quick filter by type (Pattern/Failure/Dynamic/Context) |

---

## 3. Component/State Architecture

### 3.1 Component Tree

```
MemoryAtlasView (root)
├── AtlasHeader
│   ├── SearchInput
│   └── ViewControls (reset camera, expand/collapse)
│
├── AtlasCanvas (THREE.js / React Three Fiber)
│   ├── CameraController (orbit + fly-to)
│   ├── AmbientEnvironment (stars, nebula fog)
│   ├── MemoryNodes (instanced mesh)
│   │   └── NodeTooltip (HTML overlay)
│   └── MemoryEdges (optional, line segments)
│
├── LensRail (left, fixed)
│   ├── TypeChips
│   ├── ScopeToggle
│   ├── AgentChips
│   └── ImportanceDial
│
├── DetailDrawer (right, animated)
│   ├── DrawerHeader (type icon, close button, expand)
│   ├── MemoryContent (title, content, metadata)
│   ├── MemoryLinks (clickable connections)
│   ├── MemoryListAccordion (collapsed list view)
│   └── DrawerActions (edit, link, delete)
│
└── TimelineScrubber (bottom, phase D)
```

### 3.2 State Model

```typescript
interface MemoryAtlasState {
  // Selection
  selectedMemoryId: string | null;
  hoveredMemoryId: string | null;

  // Lens (filter state)
  lens: {
    types: MemoryType[]; // multi-select
    scope: MemoryScope; // single
    agents: Agent[]; // multi-select
    importanceMin: number; // 0-1
    searchQuery: string;
  };

  // Camera
  camera: {
    target: [number, number, number]; // look-at point
    position: [number, number, number]; // camera position
    isAnimating: boolean;
  };

  // Drawer
  drawer: {
    state: "collapsed" | "open" | "expanded";
    listExpanded: boolean;
  };

  // Derived (computed)
  filteredMemories: MemoryItem[];
  nodePositions: Map<string, [number, number, number]>;
}
```

---

## Lifecycle Strata (prototype) — Mapping Rules

This repo now includes an alternate Memory scene (`Lifecycle Strata`) that mirrors the real memory lifecycle (runs → extraction → dedup → vault → linking → sleeptime → collective). The mapping is intentionally deterministic and minimal.

- **Layers + spacing**: `apps/desktop/src/features/memory/lifecycle/strata.ts`
  - Vault is anchored at `y=0` in both modes.
  - `Vault View` uses tight spacing; `Lifecycle View` spreads layers (camera reframes).
- **Type → sigil**: `apps/desktop/src/features/memory/lifecycle/mappings.ts`
  - `pattern→diamond`, `failure→tetra`, `dynamic→ring`, `context→slab`, `playbook→pill`, `frontier→poly`
- **Importance → glow**: `getGlowForImportance(importance)` yields restrained emissive intensity.
- **Scope → style**: `getScopeStyle(scope)` currently elevates + crowns `collective`.
- **Links (no spaghetti)**: only `supersedes` + `instance_of` render in 3D, and only when focused (0–2 hops).
- **Playback Run**: simulated shards flow through layers and append deterministic `mem-live-*` tiles into the Vault.

**State location:** Single `useMemoryAtlas` hook with `useReducer` or Zustand store. Shared between all components via context.

### 3.3 Camera Control API

```typescript
interface CameraController {
  // Fly camera to focus on a specific memory
  flyTo(
    memoryId: string,
    options?: {
      duration?: number; // default 0.6s
      offset?: [number, number, number]; // camera offset from node
    }
  ): void;

  // Reset to default overview
  resetOrbit(): void;

  // Lock/unlock orbit controls during animation
  setOrbitEnabled(enabled: boolean): void;

  // Get current camera state
  getCameraState(): CameraState;
}
```

Implementation: Use `@react-three/drei`'s `CameraControls` with programmatic API, or custom spring-based controller with `@react-spring/three`.

### 3.4 Performance Strategy

| Concern             | Strategy                                         |
| ------------------- | ------------------------------------------------ |
| Many nodes (100+)   | Use `InstancedMesh` for all memory nodes         |
| Hover detection     | Raycasting with throttle (16ms)                  |
| Filter updates      | Memoize `filteredMemories` with `useMemo`        |
| Camera animation    | Use `@react-spring/three` for smooth 60fps       |
| Drawer transition   | CSS transform + will-change, no React re-renders |
| Tooltip positioning | Portal to body, position via `useFrame`          |

---

## 4. Data Mapping

### 4.1 Node Position Strategy

**MVP Approach (No Embeddings):**

Position nodes using deterministic layout based on metadata:

```typescript
function computeNodePosition(
  memory: MemoryItem,
  index: number,
  total: number
): [number, number, number] {
  // Cluster by type (4 quadrants on XZ plane)
  const typeAngle = TYPE_INDEX[memory.type] * (Math.PI / 2);
  const baseRadius = 3;

  // Spread within cluster by agent
  const agentOffset = AGENT_INDEX[memory.agent] * 0.8;

  // Height by importance (more important = higher)
  const y = (memory.importance - 0.5) * 2;

  // Jitter for visual interest
  const jitter = seededRandom(memory.id) * 0.5;

  const x = Math.cos(typeAngle) * (baseRadius + agentOffset + jitter);
  const z = Math.sin(typeAngle) * (baseRadius + agentOffset + jitter);

  return [x, y, z];
}
```

**Future (With Embeddings):**

If memory embeddings become available:

1. Precompute UMAP/t-SNE projection (server-side or build-time)
2. Store as `embedding: [x, y, z]` on MemoryItem
3. Use directly as position, scale to scene bounds

### 4.2 Visual Mappings

| Memory Property | Visual Encoding                                         |
| --------------- | ------------------------------------------------------- |
| `type`          | Node color (gold/coral/cyan/blue)                       |
| `importance`    | Node size (0.3 → 0.6 radius) + glow intensity           |
| `agent`         | Small ring color around node                            |
| `scope`         | Node shape (sphere=individual, dodecahedron=collective) |
| `links`         | Edge lines (dashed, low opacity) — optional in MVP      |
| `accessCount`   | Subtle pulse speed (more access = faster pulse)         |
| `createdAt`     | Position on timeline scrubber (phase D)                 |

### 4.3 Filtered State Visual

When a node is filtered out:

- Opacity → 0.1
- Scale → 0.5x
- No hover interaction
- Excluded from keyboard navigation

---

## 5. Implementation Phases

### Phase A: Layout + Drawer + Lens Rail Skeleton

**Duration:** 3-4 hours

#### Tasks

- [ ] Create `MemoryAtlasView.tsx` with grid layout (lens rail | main | drawer)
- [ ] Implement `LensRail` component with filter chips (reuse filter logic from current)
- [ ] Implement `DetailDrawer` with slide animation (CSS transform)
- [ ] Wire up selection state (clicking placeholder triggers drawer)
- [ ] Add frosted glass styling (backdrop-filter: blur)
- [ ] Port search input to header

#### Validation

- [ ] Drawer slides open/closed on selection change
- [ ] Lens rail filters update state correctly
- [ ] Glass effect visible (check browser support)
- [ ] Layout responsive (no overflow issues)

#### Definition of Done

Skeleton layout functional with mock canvas placeholder. Can select/deselect and see drawer animate. Filters change state but don't connect to 3D yet.

---

### Phase B: 3D Atlas MVP

**Duration:** 4-6 hours

#### Tasks

- [ ] Set up React Three Fiber canvas in main area
- [ ] Create `MemoryNodes` component with `InstancedMesh`
- [ ] Implement node position calculation (deterministic layout)
- [ ] Add basic orbit controls (constrained pitch/zoom)
- [ ] Implement raycasting for hover/click detection
- [ ] Create `NodeTooltip` HTML overlay on hover
- [ ] Implement `flyTo` camera animation on selection
- [ ] Connect selection state to 3D (selected node glows)
- [ ] Add ambient environment (star field, subtle fog)

#### Validation

- [ ] Nodes render at correct positions by type cluster
- [ ] Hover shows tooltip with memory preview
- [ ] Click selects and opens drawer
- [ ] Camera flies smoothly to selected node
- [ ] Orbit controls work (drag to rotate, scroll to zoom)
- [ ] 60fps maintained with 50+ nodes

#### Definition of Done

Fully interactive atlas. Selection syncs between atlas and drawer. Camera fly-to works. Visual styling matches design system colors.

---

### Phase C: Bleed-Through Visual Treatment

**Duration:** 2-3 hours

#### Tasks

- [ ] Adjust z-index layering (canvas behind, panels float)
- [ ] Fine-tune backdrop-blur values for lens rail + drawer
- [ ] Add faint parallax offset to lens rail (slight 3D shift on camera move)
- [ ] Implement subtle vignette/gradient at panel edges
- [ ] Add "depth mist" to atlas (nodes fade with distance)
- [ ] Polish node glow shaders (importance-based bloom)

#### Validation

- [ ] Atlas clearly visible through glass panels
- [ ] Text remains legible over atlas background
- [ ] Parallax effect subtle, not distracting
- [ ] Works with reduced-motion preference (disable parallax)

#### Definition of Done

Hero atlas feeling achieved. Panels feel like floating glass over a living space. Visual polish complete.

---

### Phase D: Timeline Scrubber + Replay (Optional)

**Duration:** 3-4 hours

#### Tasks

- [ ] Create `TimelineScrubber` component (horizontal, bottom)
- [ ] Parse `createdAt` into timeline positions
- [ ] Implement scrub interaction (drag to filter by time range)
- [ ] Add "replay" mode (animate through memories chronologically)
- [ ] Show creation events as ticks on timeline
- [ ] Highlight current time range in atlas (dim nodes outside range)

#### Validation

- [ ] Scrubbing filters atlas in real-time
- [ ] Replay animates camera through memories
- [ ] Performance remains acceptable during scrub

#### Definition of Done

Full temporal exploration. Users can "rewind" memory formation.

---

## 6. Acceptance Criteria

### Interaction Correctness

- [ ] Clicking atlas node opens drawer with correct memory
- [ ] Clicking list item in drawer flies camera to correct node
- [ ] Deselecting (Esc / click empty) closes drawer
- [ ] Lens changes filter atlas without closing drawer
- [ ] Search filters both atlas and drawer list
- [ ] Keyboard navigation (← →) cycles through visible memories

### Visual Goals

- [ ] Atlas is unmistakably the hero (>60% of viewport)
- [ ] Bleed-through visible but text remains 100% legible
- [ ] Node colors match design system exactly
- [ ] Selected node has clear visual distinction (glow + scale)
- [ ] Empty state feels intentional, not broken

### Performance Goals

- [ ] 60fps with 100 nodes on M1 MacBook
- [ ] Drawer animation completes in <400ms
- [ ] Camera fly-to completes in <600ms
- [ ] No jank during filter changes

### Accessibility Goals

- [ ] All interactive elements keyboard-accessible
- [ ] Reduced motion: disable fly-to animation, use instant transitions
- [ ] Screen reader: atlas nodes have aria-labels with memory summary
- [ ] Focus visible on all controls

---

## 7. Risks & Mitigations

| Risk                            | Likelihood | Impact | Mitigation                                                         |
| ------------------------------- | ---------- | ------ | ------------------------------------------------------------------ |
| Three.js bundle size bloat      | Medium     | Medium | Tree-shake imports, use `@react-three/fiber` selective imports     |
| Mobile/low-end performance      | High       | Medium | Detect GPU tier, fall back to 2D SVG atlas on weak devices         |
| Backdrop-filter browser support | Low        | Low    | Progressive enhancement—solid bg fallback                          |
| Camera fly-to motion sickness   | Medium     | High   | Keep duration short (0.6s), ease-out-cubic, respect reduced-motion |
| Tooltip positioning edge cases  | Medium     | Low    | Clamp to viewport bounds, flip direction near edges                |
| Z-fighting with glass + 3D      | Medium     | Medium | Careful z-index layering, use CSS isolation                        |

---

## 8. Open Questions / Assumptions

### Assumptions Made

1. **No real embeddings available** — Using deterministic position based on type/agent clustering. If embeddings exist, plan can adapt easily.

2. **React Three Fiber is acceptable** — Assuming Three.js via R3F is fine for the stack. Alternative: raw Three.js, but R3F integrates better with React state.

3. **Memory count stays <500** — Performance strategy assumes hundreds, not thousands. If more, need virtualization or LOD.

4. **Mock data structure stays stable** — Current `MemoryItem` type has all needed fields.

5. **No real-time updates** — Memories are static during session. If memories can be created live, need subscription/polling.

### Questions (If I Had Access)

1. **Are memory embeddings planned?** → If yes, add `embedding: number[]` field now, compute positions from them.

2. **What's the target node count?** → If >500, need LOD strategy in Phase B.

3. **Should drawer support editing?** → Plan assumes read-only display. If edit, need form state + save handlers.

4. **Is there a design reference for the "Notion-style" drawer?** → Assuming clean, document-like layout with clear typography.

5. **Timeline data source?** → `createdAt` is a string ("3 days ago"). Need actual timestamps for timeline phase.

### Default Decisions Made

- **Drawer width:** 400px open, 560px expanded (based on common side-panel patterns)
- **Fly-to duration:** 600ms (fast enough to feel responsive, slow enough to track visually)
- **Node base size:** 0.3-0.6 radius (readable at default zoom, not cluttered)
- **Glass blur:** 12px backdrop-filter (visible depth without obscuring)

---

## Summary

This plan transforms Memory from a dashboard into a **spatial document explorer**. The atlas is always present as the hero, the drawer brings Notion-like depth, and the lens rail provides quick filtering without dominating the view.

**Phase A** gets the layout right. **Phase B** makes it spatial. **Phase C** makes it beautiful. **Phase D** adds temporal exploration.

Ship Phase A+B for a functional MVP. Phase C is the polish pass. Phase D is a delighter if time permits.
