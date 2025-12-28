# Backbay Imperium - Vertical Slice Checklist

> This is the minimum playable game that proves the core loop is fun.

---

## Phase 1: Foundation (Milestone: "I can move a unit")

### 1.1 Hex Grid System
- [ ] Cube coordinate system (q, r, s where q + r + s = 0)
- [ ] Coordinate conversions (cube ↔ offset ↔ pixel)
- [ ] Neighbor calculation (6 directions)
- [ ] Distance calculation
- [ ] Line-of-sight / pathfinding (A*)
- [ ] Map wrapping (horizontal wrap, no vertical)

**Data structures:**
```rust
pub struct HexCoord {
    pub q: i32,
    pub r: i32,
}

impl HexCoord {
    pub fn s(&self) -> i32 { -self.q - self.r }
    pub fn neighbors(&self) -> [HexCoord; 6] { ... }
    pub fn distance(&self, other: &HexCoord) -> i32 { ... }
}

pub struct GameMap {
    pub width: u32,
    pub height: u32,
    pub tiles: Vec<Tile>,
}
```

### 1.2 Terrain
- [ ] 6 basic terrain types:
  - Plains (1 food, 1 prod)
  - Grassland (2 food)
  - Hills (1 food, 2 prod, +50% defense)
  - Mountains (impassable, blocks LOS)
  - Coast (1 food, 1 gold)
  - Ocean (1 food, impassable without ships)
- [ ] Terrain rendering (basic tiles, no transitions yet)
- [ ] Fog of war (unexplored, explored, visible)

### 1.3 Camera & Input
- [ ] Pan (WASD or edge scroll)
- [ ] Zoom (scroll wheel)
- [ ] Tile selection (click)
- [ ] Unit selection (click on unit)
- [ ] Context menu (right-click)

### 1.4 Turn Loop
- [ ] Turn counter
- [ ] End turn button
- [ ] Phase system:
  1. Player input phase
  2. AI phase
  3. End-of-turn processing

---

## Phase 2: Units & Movement (Milestone: "I can explore")

### 2.1 Unit System
- [ ] Unit struct with position, HP, moves
- [ ] Unit types (defined in YAML):
  - Scout (2 moves, 1 attack, 1 defense)
  - Warrior (1 move, 2 attack, 2 defense)
  - Settler (1 move, 0 attack, 0 defense)
- [ ] Unit rendering (sprites or 3D models)
- [ ] Unit selection UI (shows stats)

### 2.2 Movement
- [ ] Movement point system
- [ ] Terrain movement costs
- [ ] Path visualization (dotted line)
- [ ] Multi-turn movement (goto)
- [ ] Movement range highlight

### 2.3 Fog of War
- [ ] Visibility calculation (unit sight range)
- [ ] Tile states: unexplored, explored (gray), visible
- [ ] Remembered unit positions (where last seen)

---

## Phase 3: Cities & Yields (Milestone: "I can build a city")

### 3.1 City Founding
- [ ] Settler "found city" action
- [ ] City name assignment
- [ ] City banner rendering
- [ ] Territory borders (1-tile radius)

### 3.2 City Yields
- [ ] Per-tile yield calculation (food, prod, gold)
- [ ] Citizen assignment (auto or manual)
- [ ] Total city yields display
- [ ] Surplus food → growth

### 3.3 City Growth
- [ ] Population (size 1-30)
- [ ] Granary system (food storage)
- [ ] Growth preview ("3 turns to next pop")

### 3.4 Production Queue
- [ ] Build queue UI
- [ ] Production cost for units/buildings
- [ ] Production overflow
- [ ] Build completion notification

---

## Phase 4: Combat (Milestone: "I can fight")

### 4.1 Combat Stats
- [ ] Attack/defense values
- [ ] Hit points
- [ ] Firepower (damage per hit)

### 4.2 Combat Resolution
- [ ] Attack action
- [ ] Combat preview (win chance, expected HP)
- [ ] Animated combat (basic)
- [ ] Death handling

### 4.3 Combat Modifiers
- [ ] Terrain defense bonus (hills +50%)
- [ ] Fortification (+25% per turn, max +50%)
- [ ] Flanking (+10% per adjacent ally)
- [ ] River crossing (-25%)

### 4.4 Zone of Control
- [ ] ZOC calculation (military units only)
- [ ] ZOC visualization (border highlight)
- [ ] Movement stop when entering ZOC

---

## Phase 5: Technology (Milestone: "I can research")

### 5.1 Tech Tree
- [ ] 15-20 technologies (Ancient → Classical → Medieval)
- [ ] Prerequisite chains
- [ ] Tech tree UI (visual graph)

### 5.2 Research
- [ ] Science per turn calculation
- [ ] Research selection
- [ ] Research progress bar
- [ ] Tech completion effects (unlock units/buildings)

**Minimal tech tree:**
```
                    ┌─ Archery (unlocks Archer)
                    │
Pottery ──┬── Writing ──── Philosophy
          │
          └── Mining ──── Bronze Working ──── Iron Working
                              │
                              └── unlocks Swordsman
```

---

## Phase 6: Basic Buildings

### 6.1 Building Types
- [ ] 8-10 buildings for v1:
  - Monument (+1 culture)
  - Granary (+2 food, +1 housing)
  - Barracks (+1 veteran level)
  - Library (+1 science per 2 pop)
  - Walls (+50% city defense)
  - Market (+2 gold, +25% gold)
  - Workshop (+2 production)
  - Aqueduct (+2 housing, fresh water required)

### 6.2 Building Requirements
- [ ] Tech requirements
- [ ] Resource requirements (later)
- [ ] City size requirements

---

## Phase 7: AI (Milestone: "I can play against someone")

### 7.1 AI Framework
- [ ] AI player type flag
- [ ] AI turn processing hook
- [ ] Difficulty settings (easy/normal/hard)

### 7.2 Heuristic AI
- [ ] **Exploration**: Scout unexplored areas
- [ ] **Expansion**: Build settlers, found cities
- [ ] **Defense**: Garrison cities, respond to threats
- [ ] **Production**: Reasonable build choices
- [ ] **Research**: Pick reasonable techs

### 7.3 Combat AI
- [ ] Threat assessment (what units threaten me)
- [ ] Attack evaluation (should I attack this unit?)
- [ ] Retreat logic (when to fall back)
- [ ] Focus fire (attack weak enemies first)

---

## Phase 8: Game Flow

### 8.1 Game Setup
- [ ] Map size selection (small/standard/large)
- [ ] Number of players
- [ ] Civilization selection
- [ ] Random map generation

### 8.2 Victory Conditions
- [ ] Domination (capture all capitals)
- [ ] Score (highest score at turn limit)

### 8.3 End Game
- [ ] Victory screen
- [ ] Statistics (graphs, demographics)
- [ ] Replay option

---

## Phase 9: Polish

### 9.1 UI Polish
- [ ] Tooltips with full breakdowns
- [ ] Mini-map
- [ ] Unit cycling (tab through idle units)
- [ ] End turn warnings ("unit needs orders")

### 9.2 Visual Polish
- [ ] Terrain transitions
- [ ] Unit animations
- [ ] City growth visualization
- [ ] Combat animations

### 9.3 Audio
- [ ] UI sounds (click, select)
- [ ] Ambient music
- [ ] Combat sounds

---

## Success Criteria

The vertical slice is DONE when:

1. **Playable loop**: Start game → explore → settle → build → fight → win/lose
2. **AI opponent**: Can play a full game vs AI
3. **Fun check**: Is it fun for 30 minutes? (ask 5 playtesters)
4. **Story potential**: Do players tell stories about their games?

---

## Technical Milestones

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1-2 | Hex grid | Map renders, camera works |
| 3-4 | Units | Can move units, fog of war |
| 5-6 | Cities | Can found cities, produce units |
| 7-8 | Combat | Can fight with preview |
| 9-10 | Tech | Can research, unlock content |
| 11-12 | AI | AI can play a game |
| 13-14 | Polish | Tooltips, minimap, sounds |
| 15-16 | Testing | Playtesting, balancing, bugs |

---

## Data Schemas

### Unit Type (units.yaml)
```yaml
warrior:
  name: "Warrior"
  class: land
  attack: 2
  defense: 2
  moves: 2
  hp: 100
  cost: 40
  tech_required: null
  abilities: []
  tags: [melee, military]
```

### Building (buildings.yaml)
```yaml
library:
  name: "Library"
  cost: 75
  maintenance: 1
  tech_required: writing
  effects:
    - type: science_per_pop
      value: 0.5
  requirements: []
```

### Technology (techs.yaml)
```yaml
bronze_working:
  name: "Bronze Working"
  cost: 60
  era: ancient
  prerequisites: [mining]
  unlocks:
    units: [spearman]
    buildings: [barracks]
```

### Terrain (terrain.yaml)
```yaml
plains:
  name: "Plains"
  movement_cost: 1
  defense_bonus: 0
  yields:
    food: 1
    production: 1
    gold: 0
  passable: true
```
