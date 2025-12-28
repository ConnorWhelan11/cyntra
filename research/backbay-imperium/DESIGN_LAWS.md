# Backbay Imperium - Design Laws

> These are non-negotiable design principles. Every feature must pass these tests.
>
> See also:
> - [GAMEPLAY_SPEC.md](./GAMEPLAY_SPEC.md) for comprehensive gameplay + vibe targets
> - [CORE_FEATURES_AND_PROGRESSION.md](./CORE_FEATURES_AND_PROGRESSION.md) for progression system specifics
> - [STORYTELLING_DESIGN.md](./STORYTELLING_DESIGN.md) for emergent narrative/retellability principles
> - [SULLA_ANALYSIS.md](./SULLA_ANALYSIS.md) for additional design inspiration filtered through these pillars.

---

## The Four Pillars

### 1. ONE MAP, ONE RULESET, ONE MENTAL MODEL

**The Problem**: Civ 7's era system fragments the game into disconnected segments. Players can't plan long-term. The game feels like three mini-games.

**Our Solution**:
- Single contiguous game from Ancient to Future
- All civilizations available from start
- Technologies unlock linearly (no era resets)
- Units and buildings persist (with obsolescence)
- Same map from turn 1 to victory

**Test**: Can a player explain "what I'm building toward" at any point?

---

### 2. TACTICAL COMBAT THAT'S READABLE

**The Problem**: Stacks of doom (Civ 4) hide complexity. Abstract battles feel random.

**Our Solution**:
- **1 Unit Per Tile (1UPT)** for military units
- **Visible Zone of Control** - colored tile borders
- **Positioning matters**:
  - Flanking bonuses (+10% per adjacent ally)
  - Terrain height advantage
  - River crossing penalty
  - Fortification visible as unit stance
- **Combat preview** that's never wrong:
  ```
  ┌─────────────────────────────┐
  │ ATTACK: Swordsman → Archer  │
  │─────────────────────────────│
  │ Your HP: 85 → ~62 (win 78%) │
  │ Enemy HP: 100 → 0 (die 78%) │
  │                             │
  │ Bonuses:                    │
  │  +20% Flanking (2 allies)   │
  │  -25% River crossing        │
  │  +50% vs Ranged             │
  └─────────────────────────────┘
  ```

**Test**: Can a player tell why they won/lost a battle by looking at the map?

---

### 3. MEANINGFUL MACRO DECISIONS

**The Problem**: If optimal play is obvious, there's no game.

**Our Solution**:

#### Expansion vs Tall
- Expansion costs come from **state capacity** and real tradeoffs (maintenance, instability, defense stretch)
- Stability/amenities limit reckless sprawl but shouldn’t feel like arbitrary punishment
- Trade routes create interdependence and vulnerability (routes worth defending)
- Long-term investment (maturing improvements, specialization) keeps tall play viable

#### Policy Trees (Mutually Exclusive Branches)
```
TRADITION ─────vs───── LIBERTY
   │                      │
   ▼                      ▼
 Capital               Wide empire
 bonuses               bonuses
```
Choosing one locks out the other until late game.

#### Diplomacy With Teeth
- War weariness scales with war length
- Broken treaties have long-term reputation cost
- City-states provide unique bonuses (units, resources, votes)
- Trade creates mutual vulnerability

#### Victory Paths Require Commitment
| Victory | What You Sacrifice |
|---------|-------------------|
| Domination | Diplomatic standing, science (military spending) |
| Science | Military strength, early growth |
| Culture | Production, military |
| Diplomacy | Autonomy (pleasing city-states) |

**Test**: Do players agonize over decisions? If it's obvious, it's not a decision.

---

### 4. UI THAT EXPLAINS EVERYTHING

**The Problem**: Hidden mechanics feel unfair. Players shouldn't need wikis.

**Our Solution**:

#### Tooltips Everywhere
Every number shows its breakdown:
```
SCIENCE: +45/turn
├─ Base from population: 12
├─ Library: +1 per citizen = 6
├─ University: +33% = 6
├─ Great Library: +3
├─ Trade route from Rome: 8
└─ Research Agreement: +10
```

#### Lenses (Map Overlays)
- **Yield lens**: Food/production/gold on every tile
- **Appeal lens**: Tourism potential
- **Religion lens**: Religious pressure
- **Loyalty lens**: Cultural influence
- **Strategic lens**: Resources you need

#### Civlopedia
Searchable in-game encyclopedia with:
- Every mechanic explained
- Every unit/building with stats
- Historical flavor text
- "See also" links between entries

#### Advisor System
Non-intrusive hints:
- "Your army is weak compared to neighbors"
- "This city would benefit from a harbor"
- "You're 3 turns from unlocking Industrialization"

**Test**: Can a new player understand why something happened without alt-tabbing?

---

## Anti-Patterns to Avoid

### ❌ Feature Bloat
Bad: "Let's add 12 more victory types!"
Good: "Let's make 4 victory types deeply interesting."

### ❌ Fake Choices
Bad: Government bonuses that are obviously better.
Good: Governments with real tradeoffs for different strategies.

### ❌ Invisible Modifiers
Bad: +5% combat bonus you only find on fan wikis.
Good: Every bonus visible in tooltips.

### ❌ Grinding
Bad: Clicking "end turn" 50 times waiting for something.
Good: Always having meaningful decisions available.

### ❌ AI Cheating (Feels Unfair)
Bad: AI gets free units on higher difficulties.
Better: AI makes smarter decisions on higher difficulties.
(Some cheating is acceptable if disclosed: "AI has +20% production")

---

## Content Constraints

### Launch Scope
| Category | Count | Rationale |
|----------|-------|-----------|
| Civilizations | 8-12 | Deep identity > breadth |
| Unit types | 15-20 | Clear rock-paper-scissors |
| Buildings | 25-30 | Meaningful specialization |
| Technologies | 60-80 | 2-3 choices per era |
| Wonders | 20-25 | Race conditions, not RNG |
| Victory types | 3-4 | Science, Domination, Culture, (Diplomatic?) |

### Per-Civilization Identity
Each civ needs:
- 1-2 unique units (replace standard unit)
- 1 unique building or improvement
- 1 passive ability (always active)
- 1 active ability (player-triggered or conditional)

Example:
```yaml
rome:
  name: "Roman Empire"
  leader: "Trajan"
  unique_ability:
    name: "All Roads Lead to Rome"
    effect: "Trade routes to your capital give +2 gold to both cities"
  unique_unit:
    name: "Legion"
    replaces: "Swordsman"
    bonus: "Can build roads and forts"
  unique_building:
    name: "Bath"
    replaces: "Aqueduct"
    bonus: "+2 housing, +1 amenity"
```

---

## The "Turn 80 Test"

By turn 80 (~30 minutes of play), a player should:

1. **Have founded 3-4 cities** (or made a deliberate choice not to)
2. **Fought at least one tactical battle** (barbarians or neighbor)
3. **Researched ~10 technologies** (with meaningful choices)
4. **Built a wonder or lost one to a rival**
5. **Have a clear strategic direction** ("I'm going science via coastal cities")
6. **Know who their friends and enemies are**

If any of these is missing, the early game pacing is wrong.

---

## Legal Boundaries

### What We CAN Do
- Hex grid, turn-based, 4X mechanics (genre conventions)
- Similar UI layouts (common UX patterns)
- Similar game concepts (cities, units, technologies)

### What We CAN'T Do
- Use "Civilization" or "Civ" in name or marketing
- Copy exact tech names, civ names, leader names
- Use Firaxis art, music, UI assets
- Copy specific ruleset values or formulas word-for-word
- Replicate the exact Civ V/VI color palettes and visual style

### Our Differentiation
- **Setting**: Backbay Imperium (original world? alt-history?)
- **Art Direction**: TBD but distinct from Civ's style
- **Unique mechanics**: TBD (what's our hook?)

---

## Extended Principles (from Sulla Analysis)

These ideas from Sulla's design essay passed the pillar filter and are worth adopting.

### 5. Expansion Should Feel Like Building Capability

**Replace arbitrary penalties with state capacity:**
- City maintenance = `base + distance + instability`
- Government techs *reduce* instability over time
- Result: early expansion is expensive, late expansion is cheap
- Players feel like they're building capability, not fighting the game

**Test**: Does founding city #5 feel like an achievement or a burden?

### 6. Improvements Mature With Investment

**All tile improvements grow over time:**
- Farm Tier 1 (+1 food) → Tier 3 (+3 food, +1 gold) over 40 worked turns
- Pillaging destroys decades of investment
- Creates "defend your economy" gameplay loop

**Test**: Do players actually care when their tiles get pillaged?

### 7. Policies Reward Commitment

**Tenure bonus: policies get stronger the longer you keep them:**
- +10% effectiveness per era of continuous use
- Switching resets the bonus
- Creates tension: adapt vs. stay the course

**Test**: Do players agonize over policy swaps, or is the answer always obvious?

### 8. Tech Variety Prevents Solved Games

**Anti-beeline mechanics (pick one):**
- **Slider economy**: allocate commerce to research/gold/culture
- **Missing techs**: each game, ~25% of techs are randomly unavailable (can trade/steal/conquer to fill gaps)
- **Asymmetric eras**: you can be Industrial in military, Medieval in culture

**Test**: Do players discover different strategies each game?
