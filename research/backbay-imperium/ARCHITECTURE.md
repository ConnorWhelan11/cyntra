# Backbay Imperium - Architecture & Design Document

## Freeciv Analysis Summary

After analyzing the Freeciv codebase (~1350 C source files, 25+ years of development), here are the key architectural insights for building a modern Civ-like game.

---

## 1. High-Level Architecture

### Freeciv's Client-Server Split
```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (Dumb Terminal)                                      │
│  - Rendering / UI                                            │
│  - Input handling                                            │
│  - Local caching of visible game state                       │
│  - NO game logic except display calculations                 │
└─────────────────────────────┬───────────────────────────────┘
                              │ Packets (serialized structs)
┌─────────────────────────────▼───────────────────────────────┐
│  SERVER (Authoritative)                                      │
│  - ALL game rules and logic                                  │
│  - AI players                                                │
│  - Turn processing                                           │
│  - Network protocol                                          │
│  - Savegame/loadgame                                         │
└─────────────────────────────────────────────────────────────┘
```

### Recommended for Backbay Imperium
```
┌─────────────────────────────────────────────────────────────┐
│  Godot Client                                                │
│  - GDScript/Rust for UI and rendering                        │
│  - Local prediction for smooth movement                      │
│  - WebSocket/TCP to server                                   │
└─────────────────────────────┬───────────────────────────────┘
                              │ JSON/MessagePack protocol
┌─────────────────────────────▼───────────────────────────────┐
│  Rust Simulation Core                                        │
│  - Deterministic game rules                                  │
│  - Embeddable in client for single-player                    │
│  - Runs as server for multiplayer                            │
│  - All data in YAML/JSON for modding                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Data Structures (from Freeciv)

### Tile (map.h, tile.h)
```c
struct tile {
    const struct terrain *terrain;  // Plains, Ocean, Desert, etc.
    struct unit_list *units;        // Units on this tile
    struct city *worked;            // City working this tile (nullable)
    struct player *owner;           // For borders
    bv_extras extras;               // Rivers, roads, improvements
    Continent_id continent;         // Land mass ID
    int index;                      // Position in map array
};
```

**Key insight**: Tiles are stored as a flat array `wld.map.tiles[index]`. Coordinate systems are abstracted (map coords, native coords, natural coords) to support different topologies (hex, iso, wrap modes).

### Unit (unit.h)
```c
struct unit {
    const struct unit_type *utype;  // Warrior, Settler, etc.
    struct tile *tile;              // Current location
    struct player *owner;           // Owner player
    int id;                         // Unique ID
    int homecity;                   // Home city ID

    int moves_left;                 // Movement points remaining
    int hp;                         // Hit points
    int veteran;                    // Experience level (0-3 typically)
    int fuel;                       // For aircraft

    enum unit_activity activity;    // IDLE, FORTIFYING, MINING, etc.
    struct unit_order *orders;      // Goto queue

    struct unit *transporter;       // Carrier/transport
    struct unit_list *transporting; // Cargo units
};
```

**Key insight**: Units have a rich order system (`struct unit_order`) allowing multi-turn automation (goto, patrol, automate). The `orders` field holds a queue.

### City (city.h)
```c
struct city {
    char *name;
    struct tile *tile;
    struct player *owner;
    int id;

    citizens size;                  // Population (1-255)
    citizens feel[CITIZEN_LAST][FEELING_LAST];  // Happy/content/unhappy tracking
    citizens specialists[SP_MAX];   // Scientists, merchants, etc.

    int surplus[O_LAST];            // Food, shields, trade, gold, luxury, science
    int prod[O_LAST];               // Production after waste
    int usage[O_LAST];              // Consumption

    int food_stock;                 // Accumulated food
    int shield_stock;               // Production progress

    struct built_status built[B_LAST];  // Buildings/wonders built
    struct universal production;        // Currently building
    struct worklist worklist;           // Build queue

    struct unit_list *units_supported;  // Units with this home city
};
```

**Key insight**: Output types are abstracted as `O_FOOD, O_SHIELD, O_TRADE, O_GOLD, O_LUXURY, O_SCIENCE`. Cities calculate yields per tile, apply modifiers, and track happiness through multiple phases.

### Player (player.h)
```c
struct player {
    char name[MAX_LEN_NAME];
    struct nation_type *nation;
    struct government *government;
    struct team *team;

    struct city_list *cities;
    struct unit_list *units;

    struct player_economic economic;  // gold, tax/science/luxury rates
    struct player_score score;        // Demographics
    struct player_ai ai_common;       // AI state

    bv_player real_embassy;           // Diplomatic visibility
    struct player_diplstate **diplstates;  // Relations with each player

    struct tech_info techs;           // Known technologies
    struct player_spaceship spaceship;
};
```

---

## 3. Turn Processing (Server Main Loop)

From `server/srv_main.c`:
```c
while (server_state == RUN_GAME_STATE) {
    do_ai_stuff();       // AI players make decisions
    sniff_packets();     // Handle human player input (blocking select())
    end_turn();          // Process turn changes
    game_next_year();    // Advance calendar
}
```

### End-of-Turn Processing Order
1. **Upkeep phase**: Unit/building costs, city maintenance
2. **City production**: Buildings complete, units produced
3. **City growth**: Food surplus → population
4. **Technology**: Research completion
5. **Government**: Revolution timers
6. **Diplomacy**: Treaty timers
7. **Disasters/Events**: Random events
8. **AI reassessment**: AI updates plans
9. **Shuffle turn order**: For fairness

---

## 4. Combat System (combat.c)

### Core Formula
```c
// Attack power = unit_attack_strength * veteran_bonus * terrain_modifiers
int get_attack_power(unit) {
    base = unit->utype->attack_strength * POWER_FACTOR;
    base *= veteran_power_factor[unit->veteran];  // 100%, 150%, 175%, 200%
    if (is_tired_attack(unit->moves_left)) base /= 2;  // Penalty if low moves
    return base;
}

// Defense power = defense_strength * terrain * fortification * city_walls
int get_defense_power(unit, tile) {
    base = unit->utype->defense_strength * POWER_FACTOR;
    base *= terrain_defense_bonus(tile);  // +50% hills, etc.
    if (unit->activity == FORTIFIED) base *= 1.5;
    if (tile_has_city(tile)) base *= city_defense_multiplier();
    return base;
}

// Combat resolution: probabilistic rounds
double win_chance(att_str, att_hp, att_fp, def_str, def_hp, def_fp) {
    // Markov chain model - each round, probability of hit = str / (str + enemy_str)
    // Firepower determines HP lost per hit
}
```

**Key insight**: Combat is NOT deterministic. The `win_chance()` function calculates the probability that attacker wins given current HP and firepower. Actual combat rolls dice each round.

### Zone of Control (ZOC)
Units with ZOC prevent enemy movement through adjacent tiles. Implemented via `is_my_zoc()` which checks for enemy units on adjacent tiles.

---

## 5. Data-Driven Design (Rulesets)

### Ruleset Structure
```
data/civ2civ3/
├── actions.ruleset      # What actions units can perform
├── buildings.ruleset    # City improvements and wonders
├── cities.ruleset       # City mechanics (specialists, outputs)
├── effects.ruleset      # Effect system (bonuses, requirements)
├── game.ruleset         # Victory conditions, calendar, settings
├── governments.ruleset  # Government types and bonuses
├── nations.ruleset      # Civilizations and leaders
├── techs.ruleset        # Technology tree
├── terrain.ruleset      # Terrain types, movements, yields
├── units.ruleset        # Unit types, classes, abilities
└── script.lua           # Lua scripting hooks
```

### Sample Unit Definition (units.ruleset)
```ini
[unit_warrior]
name          = _("Warriors")
class         = "Land"
tech_req      = "None"
obsolete_by   = "Musketeers"
attack        = 1
defense       = 1
hitpoints     = 10
firepower     = 1
move_rate     = 1
cost          = 10
flags         = "Cities"
roles         = "DefendOk", "Hut", "BarbarianBuild"
```

### Effects System (effects.ruleset)
The effects system is extremely powerful - it's how bonuses work:
```ini
[effect_barracks_veteran]
type    = "Veteran_Build"
value   = 1
reqs    =
    { "type", "name", "range"
      "Building", "Barracks", "City"
    }
```

Any bonus is expressed as `type + value + requirements`. Requirements can test for buildings, terrain, government, tech, unit type, etc.

---

## 6. AI Architecture (ai/default/)

### AI Module Structure
```
ai/default/
├── daicity.c      # City management (production, specialists)
├── daimilitary.c  # Military strategy, unit selection
├── daisettler.c   # Expansion, city placement
├── daitech.c      # Technology selection
├── daidiplomacy.c # Treaty decisions
├── daiferry.c     # Naval transport coordination
├── daiguard.c     # Defensive unit assignment
├── daihunter.c    # Offensive unit targeting
└── daiunit.c      # Individual unit movement
```

### Key AI Concepts

1. **Want System**: AI decisions use a "want" value (float) representing desirability
   - `want > 0`: Build/do this
   - `want < 0`: Build a boat first
   - Higher want = higher priority

2. **Amortization**: Future benefits are discounted exponentially
   ```c
   amortize(benefit, delay) = benefit * ((MORT-1)/MORT)^delay
   ```
   Where MORT=24 corresponds to ~4.3% "inflation rate"

3. **Threat Assessment**: AI maintains threat maps for defense allocation

4. **Skill Levels**: Controlled via handicaps (cheating permissions + fuzzy decision making)

---

## 7. Network Protocol

### Packet-Based Communication
All game state changes are communicated via typed packets:
```c
struct packet_unit_info {
    int id;
    int owner;
    int tile;
    int type;
    int moves_left;
    int hp;
    // ... more fields
};
```

Packets are generated from `common/networking/packets.def` using `generate_packets.py`.

### Delta Compression
Only changed fields are sent on updates, reducing bandwidth.

---

## 8. Recommended Architecture for Backbay Imperium

### Tech Stack
- **Simulation Core**: Rust (deterministic, embeddable, fast)
- **Client**: Godot 4 with GDScript/Rust bindings
- **Data Format**: YAML for rulesets (human-readable, git-friendly)
- **Multiplayer**: WebSocket with JSON-RPC or MessagePack

### Project Structure
```
backbay-imperium/
├── core/                    # Rust simulation library
│   ├── src/
│   │   ├── game/
│   │   │   ├── mod.rs
│   │   │   ├── map.rs       # Hex grid, terrain
│   │   │   ├── city.rs      # City mechanics
│   │   │   ├── unit.rs      # Unit logic
│   │   │   ├── combat.rs    # Battle resolution
│   │   │   ├── tech.rs      # Technology tree
│   │   │   ├── player.rs    # Player state
│   │   │   └── turn.rs      # Turn processing
│   │   ├── ai/
│   │   │   ├── mod.rs
│   │   │   ├── evaluator.rs # Position evaluation
│   │   │   ├── military.rs  # Combat AI
│   │   │   ├── economy.rs   # Build decisions
│   │   │   └── diplo.rs     # Diplomatic AI
│   │   ├── rules/
│   │   │   ├── mod.rs
│   │   │   ├── loader.rs    # YAML parsing
│   │   │   └── effects.rs   # Effect system
│   │   └── lib.rs
│   └── Cargo.toml
│
├── data/                    # Rulesets (data-driven)
│   ├── base/
│   │   ├── units.yaml
│   │   ├── buildings.yaml
│   │   ├── techs.yaml
│   │   ├── terrain.yaml
│   │   ├── civs.yaml
│   │   └── effects.yaml
│   └── mods/
│
├── client/                  # Godot project
│   ├── project.godot
│   ├── addons/
│   │   └── rust_bridge/     # GDExtension bindings
│   ├── scenes/
│   │   ├── main_menu.tscn
│   │   ├── game_view.tscn
│   │   ├── city_dialog.tscn
│   │   └── tech_tree.tscn
│   ├── scripts/
│   ├── assets/
│   └── ui/
│
├── server/                  # Multiplayer server (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lobby.rs
│   │   ├── session.rs
│   │   └── protocol.rs
│   └── Cargo.toml
│
└── docs/
    ├── design/
    │   ├── combat.md
    │   ├── economy.md
    │   └── ai.md
    └── modding/
```

### Key Design Decisions

#### 1. Deterministic Simulation
The core game logic must be fully deterministic:
- Use seeded RNG for combat/events
- No floating-point in game state
- Same inputs → same outputs always

This enables:
- Multiplayer via lockstep
- Perfect replays
- Easier testing/debugging

#### 2. Effect System
Steal Freeciv's effect system design:
```yaml
effects:
  - type: "UnitVeteranBonus"
    value: 1
    requires:
      - building: "Barracks"
        range: "City"
```

Every bonus, ability, and modifier is an effect with requirements.

#### 3. Component-Based Units
Rather than inheritance:
```yaml
units:
  warrior:
    class: land
    attack: 1
    defense: 1
    moves: 2
    components:
      - CanCapture
      - MeleeAttack
      - ZoneOfControl
```

#### 4. Hex Grid with Readable Combat
Your design doc emphasizes tactical readability. Key points:
- 1 unit per tile (stackable support units as exception?)
- Visible ZOC indicators
- Combat preview showing odds
- Clean movement range highlighting

---

## 9. Vertical Slice: Build Order

### Phase 1: Core Loop (Weeks 1-4)
1. ✅ Hex grid with coordinate system (cube coordinates recommended)
2. ✅ Tile rendering and camera controls
3. ✅ Basic terrain types (land/water/mountain)
4. ✅ Single unit type, movement, fog of war
5. ✅ Turn loop skeleton

### Phase 2: Cities & Production (Weeks 5-8)
6. City founding and basic UI
7. Population growth (food/granary)
8. Production queue (buildings/units)
9. Tile yields (food/production/gold)
10. 4-5 unit types with combat

### Phase 3: Combat & Tactics (Weeks 9-12)
11. Zone of Control
12. Combat resolution with preview
13. City combat (walls, garrison)
14. Ranged units
15. Basic terrain bonuses

### Phase 4: Technology & Civs (Weeks 13-16)
16. Technology tree (15-20 techs)
17. 2-3 civilizations with unique units
18. Basic diplomacy (war/peace)
19. Victory conditions (conquest, score)

### Phase 5: AI & Polish (Weeks 17-20)
20. Heuristic AI (expand, defend, attack)
21. UI polish and tooltips
22. Civlopedia/encyclopedia
23. Savegame system
24. Balance tuning

---

## 10. Critical Lessons from Freeciv

### What Works Well
1. **Extreme data-driven design**: Almost nothing is hardcoded
2. **Effect system**: Flexible bonus/requirement framework
3. **Clear server authority**: Client never computes game logic
4. **Abstracted coordinates**: Clean separation of map topology
5. **Iterator macros**: Safe list iteration patterns

### What to Avoid
1. **C complexity**: Years of macro-heavy code is hard to maintain
2. **Mixed concerns**: Some UI code leaked into common/
3. **Documentation gaps**: Comments often outdated
4. **Too many special cases**: Rules have many exceptions

### Modern Improvements
1. Use Rust's type system to prevent many bugs
2. Entity-Component-System for flexible game objects
3. Clear serialization format (not INI files)
4. Automated testing of game rules
5. Hot-reloading of rulesets during development

---

## Appendix: Key Freeciv Files to Study

| Purpose | File | Notes |
|---------|------|-------|
| Game state | `common/game.h` | Global game struct |
| Map logic | `common/map.c` | Coordinate math, iteration |
| Units | `common/unit.c` | Unit mechanics |
| Cities | `common/city.c` | City yield calculations |
| Combat | `common/combat.c` | Battle resolution |
| Effects | `common/effects.c` | Bonus system |
| Server loop | `server/srv_main.c` | Turn processing |
| AI core | `ai/default/daihand.c` | AI entry point |
| Ruleset loading | `server/ruleload.c` | Data parsing |
| Network | `common/networking/packets.def` | Protocol spec |

---

*Document generated from analysis of Freeciv v3.x codebase*
*For Backbay Imperium project*
