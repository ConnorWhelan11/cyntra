# Backbay Imperium - Implementation Specification

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Simulation Core | Rust | Deterministic, fast, embeddable, safe |
| Protocol | Rust crate | Command/Event serialization, shared types |
| Client | Godot 4 | Open source, modern, good 2D support |
| Binding | gdext (rust → godot) | Native Rust bindings for Godot 4 |
| Data Format | YAML | Human readable, git-friendly |
| Multiplayer | WebSocket | Works everywhere, async-compatible |
| Wire Format | MessagePack | Fast binary serialization |

---

## Critical Determinism Rules

> These rules are **non-negotiable**. Violating them breaks replays and multiplayer.

### 1. No HashMap iteration in simulation
```rust
// WRONG: iteration order is non-deterministic
for (id, unit) in &self.units { ... }

// RIGHT: use stable indexed storage
for unit in &self.units.values_ordered() { ... }
// or: iterate a sorted Vec<UnitId> separately
```

### 2. No floats in game state or rules
```rust
// WRONG
pub struct Effect { science_per_pop: f32 }

// RIGHT: use milli-units (1000 = 1.0)
pub struct Effect { science_per_pop_milli: i32 }  // 500 means 0.5
```

### 3. All randomness via seeded RNG passed explicitly
```rust
// WRONG
let roll = rand::random::<i32>();

// RIGHT
fn resolve_combat(attacker: &Unit, defender: &Unit, rng: &mut StdRng) -> CombatResult
```

### 4. Entity processing in stable order
```rust
// Store entities with generational IDs, process in ID order
let mut unit_ids: Vec<UnitId> = self.units.keys().collect();
unit_ids.sort();
for id in unit_ids { ... }
```

---

## Core Module Structure

```
crates/
├── backbay-protocol/       # Shared types, commands, events (NO GAME LOGIC)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── ids.rs          # UnitId, CityId, PlayerId (newtype wrappers)
│       ├── command.rs      # All client→sim commands
│       ├── event.rs        # All sim→client events
│       ├── snapshot.rs     # Full/delta state for sync
│       └── wire.rs         # MessagePack serialization
│
├── backbay-core/           # Pure game logic (no Godot deps)
│   ├── Cargo.toml          # depends on backbay-protocol
│   └── src/
│       ├── lib.rs
│       ├── game.rs         # GameState, turn processing
│       ├── map.rs          # HexGrid, Tile
│       ├── unit.rs         # Unit, Movement
│       ├── city.rs         # City, Production
│       ├── player.rs       # Player, Diplomacy
│       ├── combat.rs       # Battle resolution (DP model)
│       ├── tech.rs         # Technology tree
│       ├── entities.rs     # SlotMap-based entity storage
│       ├── rules/
│       │   ├── mod.rs
│       │   ├── loader.rs   # YAML → compiled Rules
│       │   ├── effect.rs   # Effect system + index
│       │   ├── compiled.rs # Vec<UnitType> indexed by RuntimeId
│       │   └── types.rs    # UnitType, BuildingType, etc.
│       └── ai/
│           ├── mod.rs
│           ├── evaluator.rs
│           ├── military.rs
│           └── economy.rs
│
├── backbay-godot/          # Godot bindings (THIN WRAPPER)
│   ├── Cargo.toml          # depends on backbay-core, backbay-protocol
│   └── src/
│       ├── lib.rs
│       ├── bridge.rs       # apply_command(bytes) -> bytes
│       └── rules_loader.rs # FileAccess-based YAML loading
│
└── backbay-server/         # Multiplayer server
    ├── Cargo.toml
    └── src/
        ├── main.rs
        ├── lobby.rs
        └── session.rs
```

### Crate Dependency Graph
```
backbay-protocol  (ids, commands, events, wire format)
       │
       ├──────────────────┐
       ▼                  ▼
backbay-core         backbay-server
(game simulation)    (multiplayer)
       │
       ▼
backbay-godot
(thin bridge)
```

---

## Protocol Crate (backbay-protocol)

### IDs: String vs Runtime (ids.rs)
```rust
use serde::{Deserialize, Serialize};

/// Data IDs are strings used in YAML files (human-readable, stable across versions)
pub type DataId = String;  // "warrior", "plains", "library"

/// Runtime IDs are integers compiled at rules-load (fast, deterministic)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RuntimeId<T>(pub u16, std::marker::PhantomData<T>);

// Type-safe runtime IDs
pub struct UnitTypeTag;
pub struct TerrainTag;
pub struct BuildingTag;
pub struct TechTag;

pub type UnitTypeId = RuntimeId<UnitTypeTag>;
pub type TerrainId = RuntimeId<TerrainTag>;
pub type BuildingId = RuntimeId<BuildingTag>;
pub type TechId = RuntimeId<TechTag>;

/// Entity IDs are generational (safe handles to mutable storage)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EntityId {
    pub index: u32,
    pub generation: u32,
}

pub type UnitId = EntityId;
pub type CityId = EntityId;

/// Player ID is a simple index (max 16 players)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PlayerId(pub u8);
```

### Commands (command.rs)
```rust
/// All possible client→sim commands. Fully serializable.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Command {
    // Unit commands
    MoveUnit { unit: UnitId, path: Vec<Hex> },
    AttackUnit { attacker: UnitId, target: UnitId },
    Fortify { unit: UnitId },
    SetOrders { unit: UnitId, orders: UnitOrders },
    CancelOrders { unit: UnitId },

    // City commands
    FoundCity { settler: UnitId, name: String },
    SetProduction { city: CityId, item: ProductionItem },
    BuyProduction { city: CityId },
    AssignCitizen { city: CityId, tile_index: u8 },
    UnassignCitizen { city: CityId, tile_index: u8 },

    // Player commands
    SetResearch { tech: TechId },
    EndTurn,

    // Diplomacy
    DeclarePeace { target: PlayerId },
    DeclareWar { target: PlayerId },
}
```

### Events (event.rs)
```rust
/// All possible sim→client events. Fully serializable.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Event {
    // Game flow
    TurnStarted { turn: u32, player: PlayerId },
    TurnEnded { turn: u32 },
    GameEnded { winner: Option<PlayerId>, reason: VictoryReason },

    // Unit events
    UnitCreated { unit: UnitId, type_id: UnitTypeId, pos: Hex, owner: PlayerId },
    UnitMoved { unit: UnitId, path: Vec<Hex>, moves_left: i32 },
    UnitDied { unit: UnitId, killer: Option<UnitId> },
    UnitDamaged { unit: UnitId, new_hp: i32, source: DamageSource },
    UnitPromoted { unit: UnitId, new_level: u8 },
    OrdersCompleted { unit: UnitId },

    // City events
    CityFounded { city: CityId, name: String, pos: Hex, owner: PlayerId },
    CityGrew { city: CityId, new_pop: u8 },
    CityProduced { city: CityId, item: ProductionItem },
    CityConquered { city: CityId, new_owner: PlayerId, old_owner: PlayerId },
    BordersExpanded { city: CityId, new_tiles: Vec<Hex> },

    // Combat
    CombatStarted { attacker: UnitId, defender: UnitId },
    CombatRound { attacker_hp: i32, defender_hp: i32 },
    CombatEnded { winner: UnitId, loser: UnitId },

    // Research
    TechResearched { player: PlayerId, tech: TechId },
    ResearchProgress { player: PlayerId, tech: TechId, progress: i32, required: i32 },

    // Visibility
    TileRevealed { hex: Hex, terrain: TerrainId },
    TileHidden { hex: Hex },
}
```

### Snapshot (snapshot.rs)
```rust
/// Full game state for initial sync or rejoin
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub turn: u32,
    pub current_player: PlayerId,
    pub map: MapSnapshot,
    pub players: Vec<PlayerSnapshot>,
    pub units: Vec<UnitSnapshot>,
    pub cities: Vec<CitySnapshot>,
    pub rng_state: [u8; 32],  // For determinism verification
}

/// Compact unit state for network
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnitSnapshot {
    pub id: UnitId,
    pub type_id: UnitTypeId,
    pub owner: PlayerId,
    pub pos: Hex,
    pub hp: i32,
    pub moves_left: i32,
    pub veteran_level: u8,
    pub orders: Option<UnitOrders>,
}
```

### Wire Format (wire.rs)
```rust
use rmp_serde::{decode, encode};

pub fn serialize_command(cmd: &Command) -> Vec<u8> {
    encode::to_vec(cmd).expect("serialization never fails")
}

pub fn deserialize_command(bytes: &[u8]) -> Result<Command, DecodeError> {
    decode::from_slice(bytes)
}

pub fn serialize_events(events: &[Event]) -> Vec<u8> {
    encode::to_vec(events).expect("serialization never fails")
}

pub fn deserialize_events(bytes: &[u8]) -> Result<Vec<Event>, DecodeError> {
    decode::from_slice(bytes)
}
```

---

## Core Data Types

### Hex Coordinates (map.rs)
```rust
use serde::{Deserialize, Serialize};

/// Cube coordinates for hex grid. Invariant: q + r + s = 0
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Hex {
    pub q: i32,
    pub r: i32,
}

impl Hex {
    pub const DIRECTIONS: [Hex; 6] = [
        Hex { q: 1, r: 0 },   // East
        Hex { q: 1, r: -1 },  // Northeast
        Hex { q: 0, r: -1 },  // Northwest
        Hex { q: -1, r: 0 },  // West
        Hex { q: -1, r: 1 },  // Southwest
        Hex { q: 0, r: 1 },   // Southeast
    ];

    pub fn s(&self) -> i32 {
        -self.q - self.r
    }

    pub fn neighbors(&self) -> impl Iterator<Item = Hex> + '_ {
        Self::DIRECTIONS.iter().map(move |d| *self + *d)
    }

    pub fn distance(&self, other: Hex) -> i32 {
        ((self.q - other.q).abs()
         + (self.r - other.r).abs()
         + (self.s() - other.s()).abs()) / 2
    }

    pub fn ring(&self, radius: i32) -> impl Iterator<Item = Hex> {
        // Returns all hexes at exactly `radius` distance
        RingIterator::new(*self, radius)
    }
}

impl std::ops::Add for Hex {
    type Output = Hex;
    fn add(self, other: Hex) -> Hex {
        Hex { q: self.q + other.q, r: self.r + other.r }
    }
}
```

### Tile (map.rs)
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub terrain: TerrainId,
    pub improvement: Option<ImprovementId>,
    pub resource: Option<ResourceId>,
    pub owner: Option<PlayerId>,
    pub city: Option<CityId>,
}

#[derive(Clone, Debug)]
pub struct GameMap {
    width: u32,
    height: u32,
    tiles: Vec<Tile>,
    wrap_horizontal: bool,
}

impl GameMap {
    pub fn get(&self, hex: Hex) -> Option<&Tile> {
        self.hex_to_index(hex).map(|i| &self.tiles[i])
    }

    pub fn get_mut(&mut self, hex: Hex) -> Option<&mut Tile> {
        self.hex_to_index(hex).map(move |i| &mut self.tiles[i])
    }

    fn hex_to_index(&self, hex: Hex) -> Option<usize> {
        // Convert hex to offset coordinates, handle wrapping
        let (x, y) = self.hex_to_offset(hex);
        if y >= 0 && y < self.height as i32 {
            let x = if self.wrap_horizontal {
                x.rem_euclid(self.width as i32)
            } else if x >= 0 && x < self.width as i32 {
                x
            } else {
                return None;
            };
            Some((y as usize) * (self.width as usize) + (x as usize))
        } else {
            None
        }
    }
}
```

### Unit (unit.rs)
```rust
pub type UnitId = u32;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Unit {
    pub id: UnitId,
    pub type_id: UnitTypeId,
    pub owner: PlayerId,
    pub position: Hex,
    pub hp: i32,
    pub max_hp: i32,
    pub moves_left: i32,
    pub experience: i32,
    pub fortified_turns: u8,
    pub orders: Option<UnitOrders>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UnitOrders {
    Goto { path: Vec<Hex> },
    Patrol { waypoints: Vec<Hex>, current: usize },
    Fortify,
    Sleep,
    BuildImprovement { improvement: ImprovementId },
}

impl Unit {
    pub fn can_move(&self) -> bool {
        self.moves_left > 0 && self.orders.is_none()
    }

    pub fn veteran_level(&self) -> u8 {
        match self.experience {
            0..=49 => 0,    // Green
            50..=99 => 1,   // Veteran
            100..=199 => 2, // Hardened
            _ => 3,         // Elite
        }
    }

    pub fn attack_strength(&self, rules: &Rules) -> i32 {
        let base = rules.unit_type(self.type_id).attack;
        let vet_bonus = [100, 150, 175, 200][self.veteran_level() as usize];
        base * vet_bonus / 100
    }

    pub fn defense_strength(&self, rules: &Rules, tile: &Tile) -> i32 {
        let base = rules.unit_type(self.type_id).defense;
        let terrain_bonus = rules.terrain(tile.terrain).defense_bonus;
        let fort_bonus = match self.fortified_turns {
            0 => 100,
            1 => 125,
            _ => 150,
        };
        let vet_bonus = [100, 150, 175, 200][self.veteran_level() as usize];

        base * (100 + terrain_bonus) / 100 * fort_bonus / 100 * vet_bonus / 100
    }
}
```

### City (city.rs)
```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct City {
    pub id: CityId,
    pub name: String,
    pub owner: PlayerId,
    pub position: Hex,
    pub population: u8,
    pub specialists: u8,          // Population assigned to specialists (not working tiles)
    pub food_stockpile: i32,
    pub production_stockpile: i32,
    pub buildings: Vec<BuildingId>,
    pub producing: Option<ProductionItem>,

    // Citizen assignment: which tile indices are locked by player
    // (relative to city workable ring, 0 = center, 1-6 = inner ring, etc.)
    // Empty = auto-assign all citizens
    pub locked_assignments: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ProductionItem {
    Unit(UnitTypeId),
    Building(BuildingId),
}

impl City {
    /// Compute which tiles are worked. This is derived, not stored.
    /// Respects locked_assignments, then auto-assigns remaining citizens.
    pub fn compute_worked_tiles(&self, map: &GameMap, rules: &CompiledRules) -> Vec<Hex> {
        let workers = self.population.saturating_sub(self.specialists) as usize;
        if workers == 0 {
            return vec![];
        }

        // Get all workable tiles in city radius
        let workable: Vec<(Hex, i32)> = self.position.ring_inclusive(2)
            .filter(|&hex| self.can_work_tile(hex, map))
            .map(|hex| {
                let score = self.tile_priority_score(hex, map, rules);
                (hex, score)
            })
            .collect();

        // Start with locked assignments
        let mut worked = Vec::with_capacity(workers);
        for &idx in &self.locked_assignments {
            if worked.len() >= workers { break; }
            if let Some(hex) = self.index_to_hex(idx) {
                if self.can_work_tile(hex, map) {
                    worked.push(hex);
                }
            }
        }

        // Auto-assign remaining workers to best tiles
        let mut available: Vec<_> = workable.iter()
            .filter(|(hex, _)| !worked.contains(hex))
            .collect();
        available.sort_by_key(|(_, score)| std::cmp::Reverse(*score));

        for (hex, _) in available {
            if worked.len() >= workers { break; }
            worked.push(*hex);
        }

        worked
    }

    pub fn yields(&self, map: &GameMap, rules: &CompiledRules) -> Yields {
        let mut total = Yields::default();

        // Base yields from city center
        total.food += 2;
        total.production += 1;

        // Worked tiles (computed, not stored)
        let worked_tiles = self.compute_worked_tiles(map, rules);
        for hex in worked_tiles {
            if let Some(tile) = map.get(hex) {
                let terrain = rules.terrain(tile.terrain);
                total.food += terrain.yields.food;
                total.production += terrain.yields.production;
                total.gold += terrain.yields.gold;

                if let Some(imp_id) = tile.improvement {
                    let imp = rules.improvement(imp_id);
                    total = total.add(&imp.yields);
                }
            }
        }

        // Building effects via index (fast lookup)
        for effect in rules.effect_index.city_yield_effects(self, &Player::dummy()) {
            effect.effect.apply(&mut total, self);
        }

        total
    }

    pub fn food_for_growth(&self) -> i32 {
        15 + (self.population as i32 - 1) * 6
    }

    pub fn turns_to_growth(&self, surplus: i32) -> Option<i32> {
        if surplus <= 0 {
            None
        } else {
            let needed = self.food_for_growth() - self.food_stockpile;
            Some((needed + surplus - 1) / surplus)
        }
    }

    fn tile_priority_score(&self, hex: Hex, map: &GameMap, rules: &CompiledRules) -> i32 {
        // Simple heuristic: food > production > gold
        let tile = map.get(hex).unwrap();
        let t = rules.terrain(tile.terrain);
        t.yields.food * 3 + t.yields.production * 2 + t.yields.gold
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Yields {
    pub food: i32,
    pub production: i32,
    pub gold: i32,
    pub science: i32,
    pub culture: i32,
}
```

### Combat (combat.rs)

> Combat uses a Markov chain model solved via dynamic programming.
> This is the correct formulation (not binomial approximation).

```rust
/// Result of a combat calculation - for UI preview
#[derive(Clone, Debug)]
pub struct CombatPreview {
    /// Probability attacker wins (0.0 - 1.0, only for display)
    pub attacker_win_pct: u8,  // 0-100, displayed to user
    /// HP outcomes (for UI display)
    pub attacker_hp_expected: i32,
    pub attacker_hp_best: i32,
    pub attacker_hp_worst: i32,
    pub defender_hp_expected: i32,
    pub defender_hp_best: i32,
    pub defender_hp_worst: i32,
    /// Modifiers breakdown for tooltip
    pub attacker_modifiers: Vec<CombatModifier>,
    pub defender_modifiers: Vec<CombatModifier>,
}

#[derive(Clone, Debug)]
pub struct CombatModifier {
    pub source: String,
    pub value_pct: i32, // Percentage points: +50 means +50%
}

/// Compute combat preview using DP over HP states
pub fn calculate_combat_preview(
    attacker: &Unit,
    defender: &Unit,
    map: &GameMap,
    rules: &Rules,
    game: &GameState,
) -> CombatPreview {
    let (att_str, att_mods) = compute_attack_strength(attacker, defender, map, rules, game);
    let (def_str, def_mods) = compute_defense_strength(defender, attacker, map, rules, game);

    let att_fp = rules.unit_type(attacker.type_id).firepower;
    let def_fp = rules.unit_type(defender.type_id).firepower;

    // DP to compute win probability and HP distribution
    let result = combat_dp(
        att_str, attacker.hp, att_fp,
        def_str, defender.hp, def_fp,
    );

    CombatPreview {
        attacker_win_pct: (result.attacker_win_prob * 100.0).round() as u8,
        attacker_hp_expected: result.att_hp_expected,
        attacker_hp_best: attacker.hp,  // Best case: no damage taken
        attacker_hp_worst: if result.attacker_win_prob > 0.0 { 1 } else { 0 },
        defender_hp_expected: result.def_hp_expected,
        defender_hp_best: defender.hp,
        defender_hp_worst: 0,
        attacker_modifiers: att_mods,
        defender_modifiers: def_mods,
    }
}

struct DpResult {
    attacker_win_prob: f64,  // Only for display, never used in sim
    att_hp_expected: i32,
    def_hp_expected: i32,
}

/// Dynamic programming solution for combat probability
/// State: (attacker_hp, defender_hp) → probability of reaching this state
fn combat_dp(
    att_str: i32, att_hp: i32, att_fp: i32,
    def_str: i32, def_hp: i32, def_fp: i32,
) -> DpResult {
    // P(attacker hits) = att_str / (att_str + def_str)
    // Fixed-point: use milli-probability to avoid floats in hot path
    let p_att_hit_milli = (att_str * 1000) / (att_str + def_str);
    let p_def_hit_milli = 1000 - p_att_hit_milli;

    // DP table: prob[att_hp][def_hp] = probability of reaching state
    // We only need current row for memory efficiency
    let att_hp = att_hp as usize;
    let def_hp = def_hp as usize;
    let att_fp = att_fp as usize;
    let def_fp = def_fp as usize;

    // Use f64 only for the probability calculation (UI display only)
    let p_att = p_att_hit_milli as f64 / 1000.0;
    let p_def = 1.0 - p_att;

    // prob[a][d] = probability state (a, d) is reached
    let mut prob = vec![vec![0.0_f64; def_hp + 1]; att_hp + 1];
    prob[att_hp][def_hp] = 1.0;

    // Process states in order of total HP remaining (decreasing)
    for total in (1..=(att_hp + def_hp)).rev() {
        for a in 1..=att_hp.min(total) {
            let d = total - a;
            if d > def_hp || d == 0 { continue; }

            let p = prob[a][d];
            if p == 0.0 { continue; }

            // Attacker hits: defender loses att_fp HP
            let new_d = d.saturating_sub(att_fp);
            prob[a][new_d] += p * p_att;

            // Defender hits: attacker loses def_fp HP
            let new_a = a.saturating_sub(def_fp);
            prob[new_a][d] += p * p_def;
        }
    }

    // Sum probabilities: attacker wins = defender at 0 HP
    let mut att_wins = 0.0;
    let mut att_hp_sum = 0.0;
    for a in 1..=att_hp {
        att_wins += prob[a][0];
        att_hp_sum += prob[a][0] * (a as f64);
    }

    let mut def_hp_sum = 0.0;
    for d in 1..=def_hp {
        def_hp_sum += prob[0][d] * (d as f64);
    }

    DpResult {
        attacker_win_prob: att_wins,
        att_hp_expected: (att_hp_sum / att_wins.max(0.001)).round() as i32,
        def_hp_expected: (def_hp_sum / (1.0 - att_wins).max(0.001)).round() as i32,
    }
}

/// Resolve actual combat (uses seeded RNG, deterministic)
pub fn resolve_combat(
    attacker: &mut Unit,
    defender: &mut Unit,
    map: &GameMap,
    rules: &Rules,
    game: &GameState,
    rng: &mut StdRng,
) -> CombatResult {
    let (att_str, _) = compute_attack_strength(attacker, defender, map, rules, game);
    let (def_str, _) = compute_defense_strength(defender, attacker, map, rules, game);

    let att_fp = rules.unit_type(attacker.type_id).firepower;
    let def_fp = rules.unit_type(defender.type_id).firepower;

    // Roll combat rounds until one unit dies
    let total_str = att_str + def_str;
    while attacker.hp > 0 && defender.hp > 0 {
        let roll = rng.gen_range(0..total_str);
        if roll < att_str {
            // Attacker hits
            defender.hp = (defender.hp - att_fp).max(0);
        } else {
            // Defender hits
            attacker.hp = (attacker.hp - def_fp).max(0);
        }
    }

    if attacker.hp > 0 {
        CombatResult::AttackerWins { attacker_hp: attacker.hp }
    } else {
        CombatResult::DefenderWins { defender_hp: defender.hp }
    }
}

#[derive(Clone, Debug)]
pub enum CombatResult {
    AttackerWins { attacker_hp: i32 },
    DefenderWins { defender_hp: i32 },
}
```

---

## Rules / Effect System

### Two-Phase Loading: YAML → Compiled (rules/loader.rs)

```rust
use serde::Deserialize;
use std::collections::HashMap;

/// YAML format: string keys, human-readable
#[derive(Debug, Deserialize)]
struct RawRules {
    terrains: HashMap<String, RawTerrainType>,
    units: HashMap<String, RawUnitType>,
    buildings: HashMap<String, RawBuildingType>,
    techs: HashMap<String, RawTechnology>,
}

/// Compiled format: integer IDs, stable ordering, ready for simulation
#[derive(Debug)]
pub struct CompiledRules {
    // Stable arrays indexed by RuntimeId
    pub terrains: Vec<TerrainType>,
    pub unit_types: Vec<UnitType>,
    pub buildings: Vec<BuildingType>,
    pub technologies: Vec<Technology>,

    // String → RuntimeId lookup (for modding/debugging only)
    terrain_ids: HashMap<String, TerrainId>,
    unit_type_ids: HashMap<String, UnitTypeId>,
    building_ids: HashMap<String, BuildingId>,
    tech_ids: HashMap<String, TechId>,

    // Effect index for fast lookups
    pub effect_index: EffectIndex,
}

impl CompiledRules {
    pub fn terrain(&self, id: TerrainId) -> &TerrainType {
        &self.terrains[id.0 as usize]
    }

    pub fn unit_type(&self, id: UnitTypeId) -> &UnitType {
        &self.unit_types[id.0 as usize]
    }

    pub fn building(&self, id: BuildingId) -> &BuildingType {
        &self.buildings[id.0 as usize]
    }
}
```

### No Floats: Milli-Units (rules/types.rs)
```rust
#[derive(Debug, Clone, Deserialize)]
pub struct UnitType {
    pub name: String,
    pub class: UnitClass,
    pub attack: i32,
    pub defense: i32,
    pub moves: i32,      // Movement points × 100 (300 = 3 moves)
    pub hp: i32,
    pub firepower: i32,
    pub cost: i32,
    pub tech_required: Option<TechId>,
    pub obsolete_by: Option<UnitTypeId>,
    pub abilities: Vec<UnitAbility>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BuildingType {
    pub name: String,
    pub cost: i32,
    pub maintenance: i32,
    pub tech_required: Option<TechId>,
    pub effects: Vec<Effect>,
    pub requirements: Vec<Requirement>,
}

/// Effects use milli-units for fractional values
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum Effect {
    /// +X to a yield type
    YieldBonus { yield_type: YieldType, value: i32 },

    /// +X basis points to a yield type (100 = 1%)
    YieldPercentBp { yield_type: YieldType, value_bp: i32 },

    /// +X milli-science per population (1000 = +1 science/pop)
    SciencePerPopMilli { value_milli: i32 },

    /// +X basis points defense for city (5000 = +50%)
    CityDefenseBp { value_bp: i32 },

    /// +X veteran level for new units
    VeteranBonus { unit_class: Option<UnitClass>, value: i32 },

    /// +X housing
    Housing { value: i32 },

    /// +X milli-gold per trade route (1000 = +1 gold)
    TradeGoldMilli { value_milli: i32 },
}

impl Effect {
    /// Apply effect to city yields (integer math only)
    pub fn apply(&self, yields: &mut Yields, city: &City) {
        match self {
            Effect::YieldBonus { yield_type, value } => {
                *yields.get_mut(*yield_type) += value;
            }
            Effect::YieldPercentBp { yield_type, value_bp } => {
                let base = *yields.get(*yield_type);
                // basis points: 10000 = 100%
                *yields.get_mut(*yield_type) += (base * value_bp) / 10000;
            }
            Effect::SciencePerPopMilli { value_milli } => {
                // milli-units: 1000 = 1.0
                yields.science += (city.population as i32 * value_milli) / 1000;
            }
            _ => {}
        }
    }
}
```

### Effect Index for Fast Lookups (rules/effect.rs)
```rust
use std::collections::HashMap;

/// Pre-computed index of effects by trigger and scope
/// Invalidation: rebuild when buildings/techs/policies change
#[derive(Debug, Default)]
pub struct EffectIndex {
    /// Effects that apply to city yields, keyed by building
    pub city_yield_by_building: HashMap<BuildingId, Vec<IndexedEffect>>,

    /// Effects that apply to unit production, keyed by building
    pub unit_production_by_building: HashMap<BuildingId, Vec<IndexedEffect>>,

    /// Global effects from techs/wonders
    pub global_effects: Vec<IndexedEffect>,
}

#[derive(Debug, Clone)]
pub struct IndexedEffect {
    pub source: EffectSource,
    pub effect: Effect,
    pub requirements: Vec<Requirement>,
}

#[derive(Debug, Clone)]
pub enum EffectSource {
    Building(BuildingId),
    Technology(TechId),
    Policy(PolicyId),
    Wonder(BuildingId),
}

impl EffectIndex {
    /// Build index from compiled rules (call once at game start)
    pub fn build(rules: &CompiledRules) -> Self {
        let mut index = EffectIndex::default();

        for (idx, building) in rules.buildings.iter().enumerate() {
            let building_id = BuildingId::new(idx as u16);
            for effect in &building.effects {
                let indexed = IndexedEffect {
                    source: EffectSource::Building(building_id),
                    effect: effect.clone(),
                    requirements: building.requirements.clone(),
                };

                match effect {
                    Effect::YieldBonus { .. }
                    | Effect::YieldPercentBp { .. }
                    | Effect::SciencePerPopMilli { .. } => {
                        index.city_yield_by_building
                            .entry(building_id)
                            .or_default()
                            .push(indexed);
                    }
                    Effect::VeteranBonus { .. } => {
                        index.unit_production_by_building
                            .entry(building_id)
                            .or_default()
                            .push(indexed);
                    }
                    _ => {}
                }
            }
        }

        index
    }

    /// Get all yield effects active for a city
    pub fn city_yield_effects<'a>(
        &'a self,
        city: &City,
        player: &Player,
    ) -> impl Iterator<Item = &'a IndexedEffect> {
        city.buildings.iter()
            .filter_map(|&b| self.city_yield_by_building.get(&b))
            .flatten()
            .filter(move |e| e.requirements.iter().all(|r| r.is_met(city, player)))
    }
}
```

### Rules Loading: Godot-Compatible (rules/loader.rs)
```rust
/// Load rules from embedded strings OR Godot FileAccess
/// This works in both native tests and exported Godot builds
pub fn load_rules(source: RulesSource) -> Result<CompiledRules, RulesError> {
    let raw: RawRules = match source {
        RulesSource::Embedded => {
            // Compile-time embedded for default ruleset
            let terrain_yaml = include_str!("../../data/base/terrain.yaml");
            let units_yaml = include_str!("../../data/base/units.yaml");
            // ... parse all
            parse_raw_rules(terrain_yaml, units_yaml, ...)?
        }
        RulesSource::Path(path) => {
            // For mods: path should be globalized by Godot first
            // e.g., "/Users/.../mods/my_mod/" not "res://mods/my_mod/"
            let terrain_yaml = std::fs::read_to_string(format!("{}/terrain.yaml", path))?;
            // ... load all
            parse_raw_rules(&terrain_yaml, ...)?
        }
        RulesSource::Bytes { terrain, units, buildings, techs } => {
            // For Godot: pass file contents as bytes (loaded via FileAccess)
            parse_raw_rules(
                std::str::from_utf8(terrain)?,
                std::str::from_utf8(units)?,
                // ...
            )?
        }
    };

    compile_rules(raw)
}

pub enum RulesSource<'a> {
    Embedded,
    Path(String),
    Bytes {
        terrain: &'a [u8],
        units: &'a [u8],
        buildings: &'a [u8],
        techs: &'a [u8],
    },
}
```

---

## Godot Integration

> **Key principle**: The Godot bridge is a THIN wrapper. It does NOT expose
> many small functions. Instead: Godot sends `Command` bytes, Rust returns
> `Event` bytes. This prevents N+1 call overhead and keeps the API surface small.

### Bridge (backbay-godot/bridge.rs)
```rust
use godot::prelude::*;
use backbay_core::{GameState, GameEngine};
use backbay_protocol::{Command, Event, Snapshot, wire};

#[derive(GodotClass)]
#[class(base=Node)]
pub struct GameBridge {
    base: Base<Node>,
    engine: Option<GameEngine>,
}

#[godot_api]
impl INode for GameBridge {
    fn init(base: Base<Node>) -> Self {
        Self { base, engine: None }
    }
}

#[godot_api]
impl GameBridge {
    /// Start a new game. Returns initial snapshot as MessagePack bytes.
    #[func]
    fn new_game(&mut self, map_size: i32, num_players: i32, rules_bytes: PackedByteArray) -> PackedByteArray {
        // Load rules from bytes (Godot reads files via FileAccess)
        let rules = load_rules(RulesSource::Bytes {
            terrain: &rules_bytes[0..rules_bytes.len()], // simplified
            // In practice: pass separate byte arrays for each file
            ..
        }).expect("Failed to load rules");

        let engine = GameEngine::new_game(map_size as u32, num_players as u32, rules);
        let snapshot = engine.snapshot();
        self.engine = Some(engine);

        PackedByteArray::from(wire::serialize_snapshot(&snapshot).as_slice())
    }

    /// Apply a command and return resulting events as MessagePack bytes.
    /// This is the MAIN API - Godot calls this for all game actions.
    #[func]
    fn apply_command(&mut self, command_bytes: PackedByteArray) -> PackedByteArray {
        let engine = self.engine.as_mut().expect("No game");

        let command: Command = wire::deserialize_command(&command_bytes.to_vec())
            .expect("Invalid command");

        let events = engine.apply_command(command);

        PackedByteArray::from(wire::serialize_events(&events).as_slice())
    }

    /// Get current game snapshot (for reconnect/sync).
    #[func]
    fn get_snapshot(&self) -> PackedByteArray {
        let engine = self.engine.as_ref().expect("No game");
        let snapshot = engine.snapshot();
        PackedByteArray::from(wire::serialize_snapshot(&snapshot).as_slice())
    }

    /// Query: compute combat preview (doesn't modify state).
    /// Returns CombatPreview as MessagePack bytes.
    #[func]
    fn query_combat_preview(&self, attacker_id: i64, defender_id: i64) -> PackedByteArray {
        let engine = self.engine.as_ref().expect("No game");

        let preview = engine.query_combat_preview(
            UnitId::from_raw(attacker_id as u64),
            UnitId::from_raw(defender_id as u64),
        );

        PackedByteArray::from(wire::serialize_combat_preview(&preview).as_slice())
    }

    /// Query: compute movement range for a unit.
    /// Returns Vec<Hex> as MessagePack bytes.
    #[func]
    fn query_movement_range(&self, unit_id: i64) -> PackedByteArray {
        let engine = self.engine.as_ref().expect("No game");

        let range = engine.query_movement_range(UnitId::from_raw(unit_id as u64));

        PackedByteArray::from(wire::serialize_hexes(&range).as_slice())
    }
}
```

### GDScript: Event-Driven Client (game_client.gd)
```gdscript
extends Node
class_name GameClient

## Thin wrapper around GameBridge that handles serialization
## and maintains client-side view state.

@onready var bridge: GameBridge = $"/root/GameBridge"

# Client-side state (mirrors server, updated via events)
var tiles: Dictionary = {}       # Hex -> TileView
var units: Dictionary = {}       # UnitId -> UnitView
var cities: Dictionary = {}      # CityId -> CityView
var current_turn: int = 0
var current_player: int = 0

# Selection state (client-only, not in sim)
var selected_unit_id: int = -1

signal events_received(events: Array)
signal snapshot_loaded()

func new_game(map_size: int, num_players: int) -> void:
    var rules_bytes = _load_rules_bytes()
    var snapshot_bytes = bridge.new_game(map_size, num_players, rules_bytes)
    _apply_snapshot(MessagePack.decode(snapshot_bytes))
    snapshot_loaded.emit()

func send_command(command: Dictionary) -> Array:
    """Send command to sim, receive and apply events, return events."""
    var cmd_bytes = MessagePack.encode(command)
    var event_bytes = bridge.apply_command(cmd_bytes)
    var events = MessagePack.decode(event_bytes)
    _apply_events(events)
    events_received.emit(events)
    return events

# Convenience methods that build commands
func move_unit(unit_id: int, path: Array[Vector2i]) -> Array:
    return send_command({
        "type": "MoveUnit",
        "unit": unit_id,
        "path": path.map(func(h): return {"q": h.x, "r": h.y})
    })

func attack_unit(attacker_id: int, defender_id: int) -> Array:
    return send_command({
        "type": "AttackUnit",
        "attacker": attacker_id,
        "target": defender_id
    })

func end_turn() -> Array:
    return send_command({"type": "EndTurn"})

func found_city(settler_id: int, name: String) -> Array:
    return send_command({
        "type": "FoundCity",
        "settler": settler_id,
        "name": name
    })

# Queries (don't modify state)
func get_combat_preview(attacker_id: int, defender_id: int) -> Dictionary:
    var bytes = bridge.query_combat_preview(attacker_id, defender_id)
    return MessagePack.decode(bytes)

func get_movement_range(unit_id: int) -> Array[Vector2i]:
    var bytes = bridge.query_movement_range(unit_id)
    var hexes = MessagePack.decode(bytes)
    return hexes.map(func(h): return Vector2i(h.q, h.r))

# Client-side selection (not sent to sim)
func select_unit(unit_id: int) -> void:
    selected_unit_id = unit_id
    # UI updates happen via signals in the view layer

func get_selected_unit_id() -> int:
    return selected_unit_id

# Apply events to client state
func _apply_events(events: Array) -> void:
    for event in events:
        match event.type:
            "UnitCreated":
                units[event.unit] = _make_unit_view(event)
            "UnitMoved":
                if units.has(event.unit):
                    units[event.unit].position = Vector2i(event.path[-1].q, event.path[-1].r)
                    units[event.unit].moves_left = event.moves_left
            "UnitDied":
                units.erase(event.unit)
            "CityFounded":
                cities[event.city] = _make_city_view(event)
            "TurnStarted":
                current_turn = event.turn
                current_player = event.player
            # ... handle other events

func _apply_snapshot(snapshot: Dictionary) -> void:
    tiles.clear()
    units.clear()
    cities.clear()

    for tile_data in snapshot.map.tiles:
        tiles[Vector2i(tile_data.q, tile_data.r)] = tile_data

    for unit_data in snapshot.units:
        units[unit_data.id] = _make_unit_view(unit_data)

    for city_data in snapshot.cities:
        cities[city_data.id] = _make_city_view(city_data)

    current_turn = snapshot.turn
    current_player = snapshot.current_player

func _load_rules_bytes() -> PackedByteArray:
    # Load rules via Godot FileAccess (works in exports)
    var terrain = FileAccess.get_file_as_bytes("res://data/base/terrain.yaml")
    var units_data = FileAccess.get_file_as_bytes("res://data/base/units.yaml")
    # ... combine into single payload or pass separately
    return terrain  # Simplified
```

### View Layer (map_view.gd)
```gdscript
extends Node2D
class_name MapView

## Renders game state. Subscribes to GameClient events.
## Does NOT call GameBridge directly.

@onready var client: GameClient = $"/root/GameClient"
@onready var hex_tilemap: TileMap = $HexTileMap
@onready var unit_sprites: Node2D = $UnitSprites
@onready var selection_highlight: Node2D = $SelectionHighlight
@onready var movement_overlay: Node2D = $MovementOverlay

func _ready():
    client.events_received.connect(_on_events)
    client.snapshot_loaded.connect(_on_snapshot_loaded)

func _on_snapshot_loaded():
    _render_full_map()
    _spawn_all_units()

func _on_events(events: Array):
    for event in events:
        match event.type:
            "UnitMoved":
                _animate_unit_move(event.unit, event.path)
            "UnitDied":
                _remove_unit_sprite(event.unit)
            "CityFounded":
                _spawn_city_banner(event.city, event.pos)
            "CombatStarted":
                _play_combat_animation(event.attacker, event.defender)
            "TurnStarted":
                _update_turn_indicator(event.turn)

func _input(event):
    if event is InputEventMouseButton and event.pressed:
        var hex = _pixel_to_hex(event.position)
        if event.button_index == MOUSE_BUTTON_LEFT:
            _handle_left_click(hex)
        elif event.button_index == MOUSE_BUTTON_RIGHT:
            _handle_right_click(hex)

func _handle_left_click(hex: Vector2i):
    var unit_at_hex = _find_unit_at(hex)
    if unit_at_hex != -1:
        client.select_unit(unit_at_hex)
        _show_movement_range(unit_at_hex)
    else:
        _clear_selection()

func _handle_right_click(hex: Vector2i):
    var selected = client.get_selected_unit_id()
    if selected == -1:
        return

    var enemy = _find_enemy_unit_at(hex)
    if enemy != -1:
        # Attack - show preview first
        var preview = client.get_combat_preview(selected, enemy)
        _show_combat_preview_ui(preview)
    else:
        # Move
        var range = client.get_movement_range(selected)
        if hex in range:
            var path = _compute_path(client.units[selected].position, hex)
            client.move_unit(selected, path)

func _show_movement_range(unit_id: int):
    movement_overlay.clear()
    var hexes = client.get_movement_range(unit_id)
    for hex in hexes:
        movement_overlay.add_highlight(hex)

# Coordinate conversion
func _pixel_to_hex(pixel: Vector2) -> Vector2i:
    var size = 64.0
    var q = (2.0/3.0 * pixel.x) / size
    var r = (-1.0/3.0 * pixel.x + sqrt(3.0)/3.0 * pixel.y) / size
    return _hex_round(Vector2(q, r))

func _hex_to_pixel(hex: Vector2i) -> Vector2:
    var size = 64.0
    var x = size * (3.0/2.0 * hex.x)
    var y = size * (sqrt(3.0)/2.0 * hex.x + sqrt(3.0) * hex.y)
    return Vector2(x, y)
```

---

## Test Strategy

### Unit Tests (Rust)
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_distance() {
        let a = Hex { q: 0, r: 0 };
        let b = Hex { q: 3, r: -1 };
        assert_eq!(a.distance(b), 3);
    }

    #[test]
    fn test_hex_neighbors() {
        let center = Hex { q: 0, r: 0 };
        let neighbors: Vec<_> = center.neighbors().collect();
        assert_eq!(neighbors.len(), 6);
        assert!(neighbors.iter().all(|n| center.distance(*n) == 1));
    }

    #[test]
    fn test_combat_determinism() {
        let mut rng1 = StdRng::seed_from_u64(12345);
        let mut rng2 = StdRng::seed_from_u64(12345);

        let result1 = resolve_combat(&attacker, &defender, &mut rng1);
        let result2 = resolve_combat(&attacker, &defender, &mut rng2);

        assert_eq!(result1, result2);
    }

    #[test]
    fn test_city_growth() {
        let mut city = City::new("Test", Hex { q: 0, r: 0 }, PlayerId(0));
        city.population = 1;

        // Need 15 food for pop 1 → 2
        assert_eq!(city.food_for_growth(), 15);

        city.food_stockpile = 10;
        assert_eq!(city.turns_to_growth(5), Some(1)); // 5 more needed, 5 per turn

        city.population = 5;
        // Need 15 + 4*6 = 39 food for pop 5 → 6
        assert_eq!(city.food_for_growth(), 39);
    }
}
```

### Integration Tests
```rust
#[test]
fn test_full_game_turn() {
    let rules = Rules::load("test_data/minimal").unwrap();
    let mut game = GameState::new_game(20, 2, &rules);

    // Player 0 moves unit
    let unit_id = game.players[0].units[0];
    game.apply_action(Action::MoveUnit {
        unit_id,
        target: Hex { q: 1, r: 0 }
    }).unwrap();

    // End turn
    game.end_turn();

    assert_eq!(game.turn, 2);
    assert_eq!(game.current_player, PlayerId(1));
}
```

---

## Next Steps

1. **Week 1-2**: Set up project structure, implement hex grid in Rust
2. **Week 3-4**: Basic Godot integration, render map
3. **Week 5-6**: Unit movement with pathfinding
4. **Week 7-8**: City founding and basic production
5. **Week 9-10**: Combat system
6. **Week 11-12**: Technology and buildings
7. **Week 13-14**: AI opponent
8. **Week 15-16**: Polish and playtesting

---

## Revision History

### v2 (Current) - Determinism & Performance Hardening

Based on architecture review feedback, the following critical changes were made:

| Issue | Problem | Solution |
|-------|---------|----------|
| **HashMap iteration** | Non-deterministic order breaks replays | Use `Vec` + sort, or stable-order maps; process in ID order |
| **Floats in state** | Cross-platform determinism issues | Milli-units (`1000 = 1.0`) and basis points (`10000 = 100%`) |
| **Combat math** | Binomial approximation was wrong + overflow | Proper DP over HP states |
| **Many small API calls** | N+1 performance death | Single `apply_command(bytes) → events` pattern |
| **`res://` paths in Rust** | Breaks in Godot exports | Use `include_str!` for defaults, `FileAccess` bytes for mods |
| **Effect lookup** | O(buildings × effects) per yield calc | `EffectIndex` with keyed lookups + invalidation |
| **`worked_tiles` stored** | Derived state can desync | Compute on demand from `locked_assignments` |
| **Mixed ID types** | Confusion between string/runtime IDs | Clear split: `DataId` (string) vs `RuntimeId<T>` (u16) |

### Key Architecture Additions

1. **`backbay-protocol` crate**: All shared types, Command/Event enums, wire format
2. **`CompiledRules`**: YAML → stable Vec arrays at load time
3. **`EffectIndex`**: Pre-computed effect lookups by trigger/scope
4. **`CombatPreview` with bands**: Shows win%, expected HP, and best/worst cases
5. **3-layer Godot pattern**: `GameBridge` (Rust) → `GameClient` (GDScript state) → `MapView` (rendering)

### Determinism Checklist

Before shipping multiplayer:

- [ ] All entity iteration uses sorted ID order
- [ ] No floats in `GameState` or `CompiledRules`
- [ ] RNG is seeded and passed explicitly to all random operations
- [ ] HashMap is never iterated in simulation code
- [ ] Snapshot includes RNG state for verification
- [ ] Protocol is versioned and backward-compatible
