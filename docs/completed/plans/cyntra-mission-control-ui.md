# Cyntra: Mission Control UI Design Specification

## Design Philosophy

**Mission Control is not a dashboard—it's a command center for orchestrating universes.**

The interface should feel like piloting a spacecraft through a cosmos of evolving worlds, agent swarms, and emergent intelligence. Every pixel serves the mission: observe, command, evolve.

### Core Principles

1. **Ambient Intelligence**: The UI breathes with the system—particles drift, glyphs pulse, data flows like starlight
2. **Information Density Without Clutter**: Power users need data; we achieve this through layered depth, not sprawl
3. **Dramatic Restraint**: Bold when it matters, quiet when it doesn't—reserve spectacle for meaningful moments
4. **Temporal Awareness**: Show not just state, but trajectory—where things came from, where they're going

### Anti-Patterns to Avoid

- Generic dashboard grids with cards
- Excessive whitespace masquerading as "clean design"
- Rainbow gradients and purple-on-white (AI slop)
- Emoji-heavy interfaces
- Flat, lifeless color schemes
- Information hidden behind clicks

---

## Visual Identity

### Color System: "Deep Space Observatory"

Built on OKLCH for perceptual uniformity. The palette evokes deep space observation stations—technical precision with cosmic wonder.

```css
/* Foundation */
--void: oklch(8% 0.02 260); /* Near-black, slight blue */
--abyss: oklch(12% 0.02 260); /* Panel backgrounds */
--obsidian: oklch(18% 0.015 260); /* Elevated surfaces */
--slate: oklch(25% 0.01 260); /* Borders, dividers */

/* Text Hierarchy */
--text-primary: oklch(92% 0.01 260); /* Bright, high contrast */
--text-secondary: oklch(65% 0.01 260); /* Muted, secondary info */
--text-tertiary: oklch(45% 0.01 260); /* Timestamps, metadata */

/* Signal Colors (semantic) */
--signal-active: oklch(75% 0.18 160); /* Cyan - running, active */
--signal-success: oklch(72% 0.16 145); /* Teal - passed, complete */
--signal-warning: oklch(78% 0.16 85); /* Amber - attention, blocked */
--signal-error: oklch(65% 0.22 25); /* Coral - failed, error */
--signal-info: oklch(70% 0.14 250); /* Soft blue - info, neutral */

/* Accent - The Signature */
--accent-primary: oklch(78% 0.12 65); /* Warm gold - primary actions */
--accent-glow: oklch(85% 0.15 65); /* Brighter gold - hover states */
--accent-subtle: oklch(78% 0.06 65); /* Desaturated - backgrounds */

/* Agent Colors (distinct per toolchain) */
--agent-claude: oklch(70% 0.16 30); /* Terracotta */
--agent-codex: oklch(72% 0.14 145); /* Emerald */
--agent-opencode: oklch(70% 0.15 280); /* Violet */
--agent-crush: oklch(75% 0.18 200); /* Electric blue */

/* Evolution Spectrum (generation fitness) */
--evo-low: oklch(60% 0.15 25); /* Red - low fitness */
--evo-mid: oklch(75% 0.15 85); /* Yellow - medium */
--evo-high: oklch(75% 0.16 145); /* Green - high fitness */
--evo-frontier: oklch(80% 0.18 65); /* Gold - Pareto optimal */
```

### Typography

```css
/* Primary: Technical precision */
--font-mono: "JetBrains Mono", "Fira Code", monospace;
--font-sans: "Inter", "SF Pro", system-ui;

/* Scale (modular, 1.2 ratio) */
--text-xs: 0.694rem; /* 11px - timestamps, metadata */
--text-sm: 0.833rem; /* 13px - secondary text */
--text-base: 1rem; /* 16px - body text */
--text-lg: 1.2rem; /* 19px - section headers */
--text-xl: 1.44rem; /* 23px - panel titles */
--text-2xl: 1.728rem; /* 28px - view titles */
--text-3xl: 2.074rem; /* 33px - dramatic headers */

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;

/* Letter spacing */
--tracking-tight: -0.02em;
--tracking-normal: 0;
--tracking-wide: 0.05em;
--tracking-wider: 0.1em; /* All-caps labels */
```

### Ambient Layer

The background is never static. Subtle particle systems create depth and life.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│     ·                              ·                                │
│            ·      ·                       ·                         │
│                          ·    ·                    ·                │
│       ·                              ·                              │
│                   ·           ·                         ·           │
│            ·                                    ·                   │
│                        ·                  ·                         │
│      ·           ·              ·                    ·              │
│                                        ·                            │
│               ·          ·                     ·            ·       │
│                                   ·                                 │
│        ·                ·                  ·           ·            │
└─────────────────────────────────────────────────────────────────────┘

Particle properties:
- Count: 40-60 particles
- Size: 1-3px, gaussian distribution
- Opacity: 0.1-0.4, subtle
- Motion: Gentle drift (0.02-0.05 px/frame), slight parallax on scroll
- Color: Varies by theme (cyan-white for Nebula, warm-gold for Solarpunk)
```

Use `NebulaStarsLayer` from `@oos/ag-ui-ext` as base, tuned for subtlety.

---

## Layout Architecture

### Primary Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMMAND BAR                                                          ─ □ × │
├────────┬────────────────────────────────────────────────────────────────────┤
│        │                                                                    │
│   N    │                                                                    │
│   A    │                         MAIN VIEWPORT                              │
│   V    │                                                                    │
│        │                    (View-specific content)                         │
│   R    │                                                                    │
│   A    │                                                                    │
│   I    │                                                                    │
│   L    │                                                                    │
│        ├────────────────────────────────────────────────────────────────────┤
│        │  CONTEXT STRIP (contextual info for current selection)             │
├────────┴────────────────────────────────────────────────────────────────────┤
│  STATUS BAR                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Command Bar (48px height)

The nerve center—always visible, always responsive.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◈ CYNTRA   │  ⌘K Search & Command...           │  ◉ claude  │  gen:42 │ ⚡ │
└─────────────────────────────────────────────────────────────────────────────┘
     │              │                                    │          │      │
     │              │                                    │          │      └─ Kernel status glyph
     │              │                                    │          └─ Current generation
     │              │                                    └─ Active agent indicator
     │              └─ Command palette (⌘K)
     └─ Logo/home (animated glyph)

```

**Logo Glyph**: A subtle 3D geometric shape that rotates slowly when idle, pulses when kernel is active, glows on hover. Use `GlyphScene` from `@oos/ag-ui-ext`.

**Command Palette**: Spotlight-style search that indexes:

- Issues by title, ID, tags
- Runs by ID, date
- Worlds by name
- Commands (create issue, run kernel, etc.)
- Navigation (go to Kernel, go to Viewer, etc.)

**Kernel Status Glyph**: Small animated indicator

- ○ Idle (static, dim)
- ◉ Running (pulsing, bright)
- ◈ Processing (rotating)
- ⚠ Error (flashing amber)

### Navigation Rail (64px width)

Vertical icon navigation with tooltips. Icons only—no text labels in collapsed state.

```
┌────────┐
│   ◈    │  ← Logo (home/overview)
├────────┤
│   🌐   │  ← Universe (worlds browser)
│   ⬡    │  ← Kernel (issues, workcells)
│   🧬   │  ← Evolution (generations, frontiers)
│   🧠   │  ← Memory (patterns, dynamics)
│   📺   │  ← Terminals (PTY sessions)
│   🎨   │  ← Gallery (3D assets, renders)
├────────┤
│        │
│        │  ← Spacer
│        │
├────────┤
│   ⚙    │  ← Settings
│   👤   │  ← Profile/Project
└────────┘
```

**Hover behavior**: Icon scales slightly (1.1x), tooltip appears after 300ms delay.

**Active indicator**: Left edge accent bar (4px, gold), icon filled instead of outlined.

**Notification badges**: Small dot (6px) in top-right of icon for attention items.

### Context Strip (48px height, collapsible)

Shows contextual information for current selection. Collapses when nothing selected.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ISSUE #42: Fix authentication bug  │  claude  │  ready  │  2h ago  │  ✕   │
└─────────────────────────────────────────────────────────────────────────────┘
```

Actions available inline: change status, assign toolchain, view in detail, dismiss.

### Status Bar (24px height)

Persistent system status at bottom edge.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ● Connected  │  3 workcells  │  12 issues  │  gen:42  │  fit:0.87  │  CPU: 45%  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Views

### 1. Universe View (Home)

The overview—see all worlds, their states, and relationships at a glance.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                              CYNTRA UNIVERSE                                │
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │                                                                 │     │
│     │                        3D WORLD GRAPH                           │     │
│     │                                                                 │     │
│     │              ┌───┐                                              │     │
│     │              │ M │ ← Medica (project)                           │     │
│     │              └─┬─┘                                              │     │
│     │          ┌────┴────┐                                            │     │
│     │       ┌──┴──┐   ┌──┴──┐                                         │     │
│     │       │ OL  │   │ CC  │  ← Outora Library, Car Config           │     │
│     │       └──┬──┘   └─────┘                                         │     │
│     │          │                                                      │     │
│     │       ◆ gen:42 (building)                                       │     │
│     │                                                                 │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│     │  OUTORA LIBRARY  │  │   CAR CONFIG     │  │    + NEW WORLD   │        │
│     │  ━━━━━━━━━━━░░   │  │   ○ idle         │  │                  │        │
│     │  gen:42 building │  │   gen:12 stable  │  │       +          │        │
│     │  fit: 0.87       │  │   fit: 0.94      │  │                  │        │
│     └──────────────────┘  └──────────────────┘  └──────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**3D World Graph**: Interactive graph using `Graph3D` from `@oos/ag-ui-ext`:

- Projects as parent nodes (large, labeled)
- Worlds as child nodes (medium, colored by status)
- Current generation as orbiting particle
- Click to select, double-click to navigate

**World Cards**: Quick-glance cards for each world:

- Progress bar (if building)
- Status indicator (idle/building/failed)
- Generation number and fitness score
- Click to expand or navigate

**Interactions**:

- Hover world node → highlight card below
- Click world → select, show in Context Strip
- Double-click → navigate to world detail
- Right-click → context menu (build, evolve, inspect)

---

### 2. Kernel View (Mission Control Core)

The command center for orchestrating agents and issues.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  KERNEL                                                          ⟳  ▶  ⏸   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ ISSUE BOARD ─────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │   OPEN          READY         RUNNING        BLOCKED       DONE       │  │
│  │   ─────         ─────         ───────        ───────       ────       │  │
│  │                                                                       │  │
│  │   ┌───────┐     ┌───────┐     ┌───────┐                   ┌───────┐   │  │
│  │   │ #45   │     │ #42   │     │ #41   │                   │ #38   │   │  │
│  │   │ auth  │     │ auth  │     │ perf  │                   │ done  │   │  │
│  │   │ ◉ cla │     │ ◉ cla │     │ ◉ cdx │                   │ ✓     │   │  │
│  │   └───────┘     └───────┘     └───────┘                   └───────┘   │  │
│  │                                                                       │  │
│  │   ┌───────┐     ┌───────┐                                 ┌───────┐   │  │
│  │   │ #44   │     │ #40   │                                 │ #37   │   │  │
│  │   │ ui    │     │ fab   │                                 │ done  │   │  │
│  │   │       │     │ ◉ opc │                                 │ ✓     │   │  │
│  │   └───────┘     └───────┘                                 └───────┘   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ WORKCELLS ───────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │   workcell-01 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░ #41 codex       │  │
│  │   workcell-02 ━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░ #42 claude      │  │
│  │   workcell-03 ○ idle                                                  │  │
│  │   workcell-04 ○ idle                                                  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ LIVE OUTPUT ─────────────────────────────────────────────────────────┐  │
│  │  [workcell-01] Generating patch for issue #41...                      │  │
│  │  [workcell-01] Running pytest -v...                                   │  │
│  │  [workcell-02] Analyzing codebase structure...                        │  │
│  │  [workcell-01] Gate: pytest ✓ passed (12 tests, 0.8s)                 │  │
│  │  ▌                                                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Issue Board** (Kanban-style):

- Columns: Open → Ready → Running → Blocked → Done
- Cards show: ID, title snippet, toolchain indicator, tags
- Drag-drop to change status
- Click to select (shows in Context Strip)
- Double-click to open detail panel
- Toolchain indicator: colored dot with initial (◉ cla = claude)

**Workcells** (Timeline view):

- Horizontal bars showing workcell lifecycle
- Progress indicator (filled portion)
- Issue ID and toolchain assignment
- Color-coded by toolchain
- Click to focus output

**Live Output** (Terminal-style):

- Streaming output from all workcells
- Color-coded by source [workcell-01], [workcell-02]
- Auto-scroll with scroll-lock on user scroll
- Click line to jump to source workcell

**Header Actions**:

- ⟳ Refresh snapshot
- ▶ Run kernel (process next issue)
- ⏸ Pause kernel

---

### 3. Evolution View

Track generations, fitness trajectories, and Pareto frontiers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EVOLUTION: OUTORA LIBRARY                                        gen:42   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ PARETO FRONTIER ─────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │   Quality │                                                           │  │
│  │      1.0  │                           ◆ 42                            │  │
│  │           │                       ◆ 41                                │  │
│  │      0.9  │                   ◆ 39  ◆ 40                              │  │
│  │           │               ◆ 38                                        │  │
│  │      0.8  │           ◆ 35                                            │  │
│  │           │       ◆ 32                                                │  │
│  │      0.7  │   ◆ 28                                                    │  │
│  │           │                                                           │  │
│  │      0.6  └───────────────────────────────────────────── Speed        │  │
│  │               0.5      0.6      0.7      0.8      0.9      1.0        │  │
│  │                                                                       │  │
│  │   ◆ Pareto-optimal   ○ Dominated   ● Current generation               │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ FITNESS TIMELINE ────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │   1.0 │                                              ╭─────           │  │
│  │       │                                         ╭────╯                │  │
│  │   0.8 │                                    ╭────╯                     │  │
│  │       │                               ╭────╯                          │  │
│  │   0.6 │                          ╭────╯                               │  │
│  │       │                     ╭────╯                                    │  │
│  │   0.4 │                ╭────╯                                         │  │
│  │       │           ╭────╯                                              │  │
│  │   0.2 │      ╭────╯                                                   │  │
│  │       └──────────────────────────────────────────────────────────     │  │
│  │         gen:1    10       20       30       40       42               │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ GENOME ──────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │   lighting.preset     ━━━━━━━━━●━━━━━━━━  dramatic                    │  │
│  │   layout.bay_size_m   ━━━━━●━━━━━━━━━━━━  6.2                         │  │
│  │   furniture.density   ━━━━━━━━━━━━●━━━━━  0.75                        │  │
│  │   materials.stone     ━━━━━━━━━━━━━━━●━━  limestone_weathered         │  │
│  │                                                                       │  │
│  │   [Mutate Random]  [Crossover]  [Reset to Best]                       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pareto Frontier** (Scatter plot):

- X-axis: Speed (build time, performance)
- Y-axis: Quality (gate scores, critic ratings)
- Points colored by generation (older = dimmer)
- Pareto-optimal points highlighted (◆ gold)
- Hover to see generation details
- Click to load that generation's config

**Fitness Timeline** (Line chart):

- X-axis: Generation number
- Y-axis: Fitness score
- Area fill for visual weight
- Vertical line at current generation
- Click to jump to generation

**Genome Panel**:

- Sliders for each evolvable parameter
- Current value displayed
- Range visualization
- Action buttons for mutation/crossover

---

### 4. Memory View

Explore agent memory: patterns, dynamics, failures.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MEMORY                                                    🔍 Search...     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ FILTERS ─────┐  ┌─ MEMORY GRAPH ─────────────────────────────────────┐  │
│  │               │  │                                                    │  │
│  │  Type         │  │                    ┌───┐                           │  │
│  │  ☑ pattern    │  │               ┌────┤ P ├────┐                      │  │
│  │  ☑ failure    │  │          ┌────┤    └───┘    ├────┐                 │  │
│  │  ☑ dynamic    │  │     ┌────┤    │             │    ├────┐            │  │
│  │  ☐ context    │  │     │ D  │    │             │    │ F  │            │  │
│  │               │  │     └────┘    │             │    └────┘            │  │
│  │  Scope        │  │               │             │                      │  │
│  │  ○ individual │  │          ┌────┤             ├────┐                 │  │
│  │  ○ collective │  │          │ P  │             │ P  │                 │  │
│  │  ● all        │  │          └────┘             └────┘                 │  │
│  │               │  │                                                    │  │
│  │  Agent        │  │   P = pattern  D = dynamic  F = failure            │  │
│  │  ☑ claude     │  │   Line thickness = link strength                   │  │
│  │  ☑ codex      │  │                                                    │  │
│  │  ☑ opencode   │  │                                                    │  │
│  │  ☐ crush      │  │                                                    │  │
│  │               │  └────────────────────────────────────────────────────┘  │
│  │  Importance   │                                                          │
│  │  ━━━━━●━━━━━  │  ┌─ SELECTED MEMORY ──────────────────────────────────┐  │
│  │  0.3    1.0   │  │                                                    │  │
│  │               │  │  PATTERN  │  claude  │  collective  │  imp: 0.89   │  │
│  └───────────────┘  │                                                    │  │
│                     │  "When fixing auth bugs in FastAPI, check          │  │
│                     │   middleware order first. Common issue: token      │  │
│                     │   expiry handler runs after validation."           │  │
│                     │                                                    │  │
│                     │  Source: Run #89 (issue #38)                       │  │
│                     │  Accessed: 12 times  │  Created: 3 days ago        │  │
│                     │                                                    │  │
│                     │  Links:                                            │  │
│                     │  ├─ supersedes: "Check auth.py for token bugs"     │  │
│                     │  └─ instance_of: "Middleware ordering patterns"    │  │
│                     │                                                    │  │
│                     └────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Memory Graph**: Interactive 3D graph using `Graph3D`:

- Nodes = memories (sized by importance, colored by type)
- Edges = relationships (thickness = confidence)
- Cluster by type or agent
- Physics simulation for organic layout
- Click to select, drag to rotate

**Filters Panel**:

- Type checkboxes (pattern, failure, dynamic, context)
- Scope radio (individual, collective, all)
- Agent checkboxes
- Importance slider (filter out low-importance)

**Selected Memory Panel**:

- Full memory text
- Metadata badges (type, agent, scope, importance)
- Source information (run, issue)
- Access statistics
- Linked memories (expandable tree)

---

### 5. Terminal View

Unified terminal management for all PTY sessions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TERMINALS                                              + New  │  ≡ Grid   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ SESSION TABS ────────────────────────────────────────────────────────┐  │
│  │  ● main     ● workcell-01     ○ workcell-02     + new                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  connor@macbook:~/Medica/cyntra$ cyntra status                         ││
│  │                                                                         ││
│  │  Cyntra Kernel Status                                                   ││
│  │  ═══════════════════                                                    ││
│  │                                                                         ││
│  │  State: running                                                         ││
│  │  Workcells: 2/4 active                                                  ││
│  │  Issues: 3 ready, 1 running, 12 done                                    ││
│  │  Generation: 42 (fitness: 0.87)                                         ││
│  │                                                                         ││
│  │  Active Jobs:                                                           ││
│  │    [workcell-01] #41 - Performance optimization (codex)                 ││
│  │    [workcell-02] #42 - Fix auth bug (claude)                            ││
│  │                                                                         ││
│  │  connor@macbook:~/Medica/cyntra$ █                                      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Grid Mode** (≡ button):

```
┌──────────────────────────────┬──────────────────────────────┐
│  ● main                      │  ● workcell-01               │
│  ~/cyntra$                   │  running pytest...           │
│                              │                              │
│                              │                              │
├──────────────────────────────┼──────────────────────────────┤
│  ○ workcell-02               │  ○ workcell-03               │
│  analyzing structure...      │  idle                        │
│                              │                              │
│                              │                              │
└──────────────────────────────┴──────────────────────────────┘
```

**Features**:

- Tab bar with session indicators (● active, ○ idle)
- Session activity indicator (last output time)
- Grid view for monitoring multiple sessions
- Click to focus, double-click to maximize
- Keyboard shortcuts (⌘1-4 for quick switch)

---

### 6. Gallery View

3D asset browser and render gallery.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GALLERY                                         🔍   Filter ▼   Sort ▼    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │            │  │            │  │            │  │            │            │
│  │   [3D]     │  │   [3D]     │  │   [3D]     │  │   [3D]     │            │
│  │  rotating  │  │  rotating  │  │  rotating  │  │  rotating  │            │
│  │  preview   │  │  preview   │  │  preview   │  │  preview   │            │
│  │            │  │            │  │            │  │            │            │
│  ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤            │
│  │ outora_lib │  │ car_v3     │  │ desk_01    │  │ chair_02   │            │
│  │ gen:42     │  │ gen:12     │  │ furniture  │  │ furniture  │            │
│  │ ✓ 0.87     │  │ ✓ 0.94     │  │ ✓ 0.91     │  │ ✓ 0.88     │            │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
│                                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │            │  │            │  │            │  │            │            │
│  │   [3D]     │  │   [3D]     │  │   [3D]     │  │   [3D]     │            │
│  │            │  │            │  │            │  │            │            │
│  │            │  │            │  │            │  │            │            │
│  │            │  │            │  │            │  │            │            │
│  ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤            │
│  │ shelf_03   │  │ lamp_01    │  │ column_g   │  │ arch_01    │            │
│  │ furniture  │  │ lighting   │  │ structure  │  │ structure  │            │
│  │ ✓ 0.85     │  │ ✓ 0.92     │  │ ✓ 0.89     │  │ ✓ 0.90     │            │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**3D Thumbnails**: Each card contains a live Three.js canvas:

- Auto-rotating model preview
- Pause on hover, resume on leave
- Click to open full viewer
- Lazy-load models as they scroll into view

**Card Information**:

- Asset name
- Category/generation
- Gate verdict (✓ passed, ✗ failed) with fitness score

**Full Viewer** (modal or dedicated view):

- Orbit controls, zoom, pan
- Wireframe/solid/textured toggle
- Metadata sidebar (vertices, materials, critic scores)
- Compare mode (side-by-side with previous version)

---

## Components Specification

### Panel Component

The fundamental container for all content sections.

```tsx
interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode; // Right-aligned header actions
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

**Visual spec**:

```css
.panel {
  background: var(--abyss);
  border: 1px solid var(--slate);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--obsidian);
  border-bottom: 1px solid var(--slate);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--text-secondary);
}

.panel-content {
  padding: 12px;
}
```

### Issue Card Component

Compact card for Kanban board display.

```tsx
interface IssueCardProps {
  issue: Issue;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
}
```

**Visual spec**:

```
┌─────────────────────────────┐
│  #42                    ◉   │  ← ID + toolchain indicator
│  Fix authentication bug     │  ← Title (truncated)
│  auth  security  P1         │  ← Tags (max 3)
└─────────────────────────────┘

Width: 160px
Height: 80px (min)
```

**States**:

- Default: `--obsidian` background
- Hover: slight lift (translateY -2px), subtle glow
- Selected: `--accent-subtle` background, gold border
- Dragging: elevated shadow, slight scale (1.02)

### Workcell Bar Component

Horizontal progress bar showing workcell state.

```tsx
interface WorkcellBarProps {
  workcell: Workcell;
  onClick?: () => void;
}
```

**Visual spec**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  workcell-01  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░  #41 codex       │
└─────────────────────────────────────────────────────────────────────────┘

Height: 32px
Progress bar: 4px height, rounded
```

**States**:

- Idle: dimmed, no progress bar
- Active: toolchain-colored progress bar, pulsing edge
- Complete: success color, checkmark
- Failed: error color, warning icon

### Memory Node Component

Interactive node for memory graph visualization.

```tsx
interface MemoryNodeProps {
  memory: AgentMemory;
  size: number; // Based on importance
  color: string; // Based on type
  selected?: boolean;
  onClick?: () => void;
}
```

**3D spec** (for Graph3D):

- Sphere geometry
- Size: 0.5 - 2.0 based on importance
- Color: type-specific (pattern=gold, failure=coral, dynamic=cyan)
- Glow effect on hover/selection
- Label on hover (memory snippet)

### Kernel Status Glyph

Animated 3D indicator for kernel state.

```tsx
interface KernelGlyphProps {
  state: "idle" | "running" | "processing" | "error";
  size?: "sm" | "md" | "lg";
}
```

**Animation spec**:

- Idle: Slow rotation (0.5 RPM), dim emission
- Running: Medium rotation (2 RPM), pulsing emission
- Processing: Fast rotation (5 RPM), bright emission
- Error: Wobble animation, red emission, periodic flash

Use `GlyphScene` from `@oos/ag-ui-ext` as base.

---

## Interaction Patterns

### Command Palette (⌘K)

Spotlight-style command interface.

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌘  Search commands, issues, worlds...                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RECENT                                                         │
│  ├─ #42 Fix authentication bug                    issue         │
│  ├─ outora_library                                world         │
│  └─ kernel watch                                  command       │
│                                                                 │
│  COMMANDS                                                       │
│  ├─ Create new issue                              ⌘N            │
│  ├─ Run kernel                                    ⌘R            │
│  ├─ Pause kernel                                  ⌘P            │
│  └─ Open settings                                 ⌘,            │
│                                                                 │
│  NAVIGATION                                                     │
│  ├─ Go to Kernel                                  ⌘1            │
│  ├─ Go to Evolution                               ⌘2            │
│  └─ Go to Memory                                  ⌘3            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior**:

- Fuzzy search across all indexed items
- Categories: Recent, Commands, Navigation, Issues, Worlds, Runs
- Arrow keys to navigate, Enter to select
- Escape to close
- Type `/` prefix for commands only

### Drag & Drop

For issue management on Kanban board.

**Drag start**:

- 150ms delay (prevent accidental drags)
- Card lifts with shadow
- Source column dims slightly
- Ghost card follows cursor

**During drag**:

- Valid drop zones highlight
- Invalid zones show "no drop" cursor
- Auto-scroll near edges

**Drop**:

- Card animates to new position
- Optimistic UI update
- Backend sync (revert on failure)

### Keyboard Navigation

Global shortcuts (⌘ on Mac, Ctrl on Windows):

| Shortcut | Action                                        |
| -------- | --------------------------------------------- |
| ⌘K       | Open command palette                          |
| ⌘1-6     | Navigate to view (1=Universe, 2=Kernel, etc.) |
| ⌘N       | Create new issue                              |
| ⌘R       | Run kernel                                    |
| ⌘P       | Pause kernel                                  |
| ⌘,       | Open settings                                 |
| ⌘/       | Toggle help                                   |
| Esc      | Close modal/deselect                          |
| ↑↓←→     | Navigate lists/boards                         |
| Enter    | Open/select item                              |
| Space    | Toggle item state                             |

---

## Animation Specifications

### Micro-interactions

**Button hover**:

```css
.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--accent-glow);
  transition: all 150ms ease-out;
}
```

**Card selection**:

```css
.card.selected {
  transform: scale(1.02);
  border-color: var(--accent-primary);
  box-shadow:
    0 0 0 1px var(--accent-primary),
    0 0 20px -5px var(--accent-glow);
  transition: all 200ms ease-out;
}
```

**Panel collapse**:

```css
.panel-content {
  max-height: var(--content-height);
  overflow: hidden;
  transition: max-height 300ms ease-in-out;
}

.panel.collapsed .panel-content {
  max-height: 0;
}
```

### Page Transitions

View changes should feel seamless but intentional.

**Crossfade** (default):

```css
.view-enter {
  opacity: 0;
}
.view-enter-active {
  opacity: 1;
  transition: opacity 200ms ease-out;
}
.view-exit {
  opacity: 1;
}
.view-exit-active {
  opacity: 0;
  transition: opacity 150ms ease-in;
}
```

**Slide** (for detail panels):

```css
.panel-enter {
  transform: translateX(100%);
}
.panel-enter-active {
  transform: translateX(0);
  transition: transform 300ms ease-out;
}
```

### Ambient Animations

**Particle drift**:

```css
@keyframes drift {
  0%,
  100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(10px, -5px);
  }
  50% {
    transform: translate(5px, 10px);
  }
  75% {
    transform: translate(-5px, 5px);
  }
}

.particle {
  animation: drift 20s ease-in-out infinite;
  animation-delay: calc(var(--index) * -2s);
}
```

**Glyph pulse** (kernel running):

```css
@keyframes pulse-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 8px var(--signal-active));
    opacity: 0.8;
  }
  50% {
    filter: drop-shadow(0 0 16px var(--signal-active));
    opacity: 1;
  }
}

.glyph.running {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. **Theme Integration**
   - Port color system to desktop app
   - Replace `app.css` variables with new tokens
   - Add ambient particle layer (`NebulaStarsLayer`)

2. **Layout Restructure**
   - Implement Command Bar
   - Implement Navigation Rail
   - Implement Context Strip
   - Implement Status Bar

3. **Component Migration**
   - Replace local Button/Modal with `@oos/ag-ui-ext` components
   - Add `GlowButton` for primary actions
   - Add `Skeleton` for loading states

### Phase 2: Core Views (Week 2)

4. **Universe View**
   - World cards grid
   - World selection → Context Strip integration
   - (Defer 3D graph to Phase 4)

5. **Kernel View Enhancement**
   - Issue Board (Kanban) with drag-drop
   - Workcell timeline bars
   - Live output panel improvements

6. **Terminal View**
   - Tab management
   - Grid mode toggle
   - Session indicators

### Phase 3: Data Visualization (Week 3)

7. **Evolution View**
   - Fitness timeline chart
   - Genome parameter sliders
   - (Defer Pareto frontier to Phase 4)

8. **Memory View**
   - Filter panel
   - Memory list (table/grid view)
   - Selected memory detail panel
   - (Defer 3D graph to Phase 4)

9. **Gallery View**
   - Asset card grid (static images first)
   - Filter/sort controls
   - Full viewer modal

### Phase 4: 3D & Polish (Week 4)

10. **3D Integrations**
    - Universe 3D world graph
    - Memory 3D relationship graph
    - Gallery 3D thumbnails
    - Kernel status glyph

11. **Command Palette**
    - Fuzzy search implementation
    - Action indexing
    - Keyboard navigation

12. **Animation Polish**
    - View transitions
    - Micro-interactions
    - Loading states

---

## File Structure

```
apps/desktop/src/
├── components/
│   ├── layout/
│   │   ├── CommandBar.tsx
│   │   ├── NavigationRail.tsx
│   │   ├── ContextStrip.tsx
│   │   ├── StatusBar.tsx
│   │   └── MainLayout.tsx
│   ├── kernel/
│   │   ├── IssueBoard.tsx
│   │   ├── IssueCard.tsx
│   │   ├── IssueColumn.tsx
│   │   ├── WorkcellTimeline.tsx
│   │   ├── WorkcellBar.tsx
│   │   └── LiveOutput.tsx
│   ├── evolution/
│   │   ├── ParetoFrontier.tsx
│   │   ├── FitnessTimeline.tsx
│   │   └── GenomePanel.tsx
│   ├── memory/
│   │   ├── MemoryGraph.tsx
│   │   ├── MemoryFilters.tsx
│   │   ├── MemoryDetail.tsx
│   │   └── MemoryList.tsx
│   ├── gallery/
│   │   ├── AssetGrid.tsx
│   │   ├── AssetCard.tsx
│   │   └── AssetViewer.tsx
│   ├── universe/
│   │   ├── WorldGraph.tsx
│   │   ├── WorldCard.tsx
│   │   └── WorldList.tsx
│   └── shared/
│       ├── CommandPalette.tsx
│       ├── KernelGlyph.tsx
│       ├── AgentIndicator.tsx
│       └── StatusBadge.tsx
├── features/
│   ├── universe/
│   │   └── UniverseView.tsx
│   ├── kernel/
│   │   └── KernelView.tsx
│   ├── evolution/
│   │   └── EvolutionView.tsx
│   ├── memory/
│   │   └── MemoryView.tsx
│   ├── terminals/
│   │   └── TerminalsView.tsx
│   └── gallery/
│       └── GalleryView.tsx
├── hooks/
│   ├── useKernelState.ts
│   ├── useCommandPalette.ts
│   ├── useDragDrop.ts
│   └── useKeyboardShortcuts.ts
├── contexts/
│   ├── ProjectContext.tsx
│   ├── KernelContext.tsx
│   └── ThemeContext.tsx
├── styles/
│   ├── tokens.css        # Design tokens
│   ├── components.css    # Component styles
│   └── animations.css    # Animation definitions
└── App.tsx
```

---

## Success Metrics

### Visual Quality

- [ ] Consistent color usage across all views
- [ ] Ambient particles render smoothly (60fps)
- [ ] Animations feel responsive (<100ms feedback)
- [ ] Typography hierarchy is clear and readable
- [ ] Dark theme is comfortable for extended use

### Usability

- [ ] Any view reachable in 2 clicks or 1 shortcut
- [ ] Issue status changeable via drag-drop
- [ ] Command palette finds items in <100ms
- [ ] Terminal grid mode shows 4 sessions simultaneously
- [ ] Memory graph navigable with mouse and keyboard

### Technical

- [ ] No UI package component duplication in desktop app
- [ ] State management extracted to contexts
- [ ] 3D components lazy-loaded
- [ ] Bundle size <5MB (excluding assets)
- [ ] First paint <1s, interactive <2s

---

## Appendix: Component Inventory

### From `@oos/ag-ui-ext` to Use

**Primitives** (high priority):

- `button` - Replace local Button
- `dialog` - Replace local Modal
- `input` - Replace local TextInput
- `badge` - For status indicators
- `skeleton` - For loading states
- `tabs` - For view tabs
- `scroll-area` - For scrollable panels
- `dropdown-menu` - For context menus
- `command` - For command palette
- `tooltip` - For icon hints

**Atoms** (medium priority):

- `GlowButton` - Primary actions
- `AuroraBackground` - Main container background
- `HUDProgressRing` - Circular progress indicators
- `StatBadge` - Metric displays

**Ambient** (high priority):

- `NebulaStarsLayer` - Background particles
- `ThemedAmbientLayer` - Themed ambient effects

**Three** (Phase 4):

- `Graph3D` - Memory/world graphs
- `GlyphScene` - Kernel status glyph
- `GraphNode`, `GraphEdge` - Graph building blocks

### New Components to Build

**Layout**:

- `CommandBar` - Top navigation bar
- `NavigationRail` - Vertical icon nav
- `ContextStrip` - Selection context bar
- `StatusBar` - Bottom status bar
- `MainLayout` - Composition wrapper

**Kernel**:

- `IssueBoard` - Kanban board container
- `IssueCard` - Draggable issue card
- `IssueColumn` - Status column with drop zone
- `WorkcellTimeline` - Workcell state visualization
- `WorkcellBar` - Individual workcell progress
- `LiveOutput` - Streaming output display

**Evolution**:

- `ParetoFrontier` - Scatter plot visualization
- `FitnessTimeline` - Line chart visualization
- `GenomePanel` - Parameter sliders

**Memory**:

- `MemoryGraph` - 3D relationship graph
- `MemoryFilters` - Filter panel
- `MemoryDetail` - Selected memory panel
- `MemoryList` - Tabular memory list

**Gallery**:

- `AssetGrid` - Responsive asset grid
- `AssetCard` - 3D preview card
- `AssetViewer` - Full-screen 3D viewer

**Shared**:

- `CommandPalette` - Global command interface
- `KernelGlyph` - Animated status indicator
- `AgentIndicator` - Toolchain badge
- `StatusBadge` - State indicator
