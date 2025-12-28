# Sulla's "Designing Civilization" — Analysis for Backbay Imperium

> Source: [sullla.com/designingciv.html](https://sullla.com/designingciv.html)
>
> This document translates Sulla's design essay into actionable guidance for
> Backbay Imperium, filtered through our "modern Civ 5" identity.

---

## TL;DR: What Sulla Wants

Sulla's pitch is a **"New Civ"** that keeps the empire-builder fantasy but fixes late-game tedium and "solved" optimal play:

- **Meaningful choices, minimal punishment, minimal tedium** — fewer "unfun" penalties, less micromanagement
- **"Go Big or Go Home"** — reward large empires; one-city play is allowed but intentionally hard
- **Stacks on the world map, battles on a tactical map** — his biggest structural swing
- **Semi-randomized tech trees** — prevent solved beelines
- **Transparent diplomacy** — show the math
- **Improvements that mature over time** — make tiles worth defending

---

## 1) STEAL — High-Leverage Ideas That Fit "Modern Civ 5"

These ideas align with our four pillars and are worth adopting.

### 1.1 Empire Should Feel *Big*

> Design for **large, powerful empires** as the "normal" end state.

- Small empires can still win via specific victory paths, but shouldn't feel equally strong at equal tech
- Don't punish expansion by default — make it feel *rewarding*
- The "going wide" penalty should come from strategic tension (defending borders, managing happiness), not arbitrary maluses

**Implementation**: Expansion costs come from real tradeoffs (maintenance, instability, military stretch), not from invisible "empire size penalty" multipliers.

---

### 1.2 "Explain Everything" Diplomacy

> Make diplomacy **transparent**: show + / − modifiers, show consequences *before* you click.

- Every diplomatic attitude should have visible numbers: `+3 We have a trade deal`, `-5 You declared war on our ally`
- Show predicted AI response before committing to an action
- Eliminate "hidden" modifiers that players only learn from wikis
- Optional "immersion mode" can hide the numbers for players who hate seeing the math

**Implementation**: Diplomacy screen shows a stacked bar of all modifiers. Hovering over "Declare War" shows projected reputation hit and likely AI responses.

---

### 1.3 Tech System That Kills Rote Beelines

> Avoid "research = population" if you want the Civ4/Civ5 hybrid feel.

**Option A: Slider Economy**
- Bring back commerce allocation (research/gold/culture slider)
- Creates tension: do I invest in science or save gold for emergency?

**Option B: Semi-Randomized Tech Tree (Master of Orion style)**
- Each game, ~20-30% of techs in each "field" are missing
- Gaps are clearly shown in the UI (grayed out, marked "unavailable this game")
- Missing techs can be acquired via: trade, espionage, conquest, or Great Scientist
- Forces adaptation: "We're missing Gunpowder, so we must trade with Rome or conquer them"

**Option C: Asymmetric Eras**
- You can be Industrial in one field and Medieval in another
- No hard "era gates" — just prerequisite chains
- Creates stories: "We have Tanks but no Radio"

**Safety valve**: "All Techs Available" option for competitive multiplayer.

---

### 1.4 Expansion Economics via State Capacity

> Replace "# of cities" maintenance with **instability** that decreases as government tech improves.

**The Problem**: Civ 5's "happiness per city" and "science cost per city" feel like arbitrary punishment.

**Sulla's Solution**:
- City maintenance = `base + distance_from_capital + instability_modifier`
- **Instability starts high** (early empires struggle to hold distant cities)
- **Government techs/policies reduce instability** (Bureaucracy, Civil Service, etc.)
- Result: early expansion is expensive, late expansion is cheap — matches historical state capacity growth

**Why it's better**: Players feel like they're building *capability*, not fighting the game's punishment systems.

---

### 1.5 Tile Improvements That Matter and Mature

> Make improved tiles **MUCH** better than unimproved. Consider **tiered improvements that grow over time**.

**Core Idea**: Extend Civ 4's cottage → hamlet → village → town to ALL improvements:

| Improvement | Tier 1 | Tier 2 | Tier 3 | Turns to Mature |
|-------------|--------|--------|--------|-----------------|
| Farm | +1 food | +2 food | +3 food, +1 gold | 20 → 40 |
| Mine | +1 prod | +2 prod | +3 prod | 15 → 30 |
| Lumber Mill | +1 prod | +2 prod, +1 gold | +3 prod, +1 gold | 25 → 50 |
| Trading Post | +1 gold | +2 gold | +3 gold, +1 science | 20 → 40 |

**Consequences**:
- Pillaging becomes *devastating* (you're destroying 40 turns of investment)
- Defense matters — you actually want to protect your countryside
- Tall cities eventually outproduce recently-settled wide cities
- No forest-chop burst production (forests have long-term lumber mill value)

---

### 1.6 Policies That Reward Commitment

> Add a "**tenure bonus**": policies get stronger the longer you keep them.

**The Problem**: Civ 5's policy trees are mostly "pick once, forget." Civ 6's government swapping is too fluid.

**Sulla's Solution**:
- No Anarchy (good — Civ 5 already removed it)
- Policies gain **+10% effectiveness per era** you keep them active
- Switching policies resets the tenure bonus
- Creates real tension: "Do I swap to Oligarchy for the war, or keep my 40-turn-old Republic bonus?"

**Variant**: Policies have a "reform cost" (gold, happiness, or stability) that scales with how long they've been active.

---

## 2) IGNORE — Ideas That Clash With "Modern Civ 5" Identity

These are Sulla's biggest ideas, but they conflict with our stated pillars.

### 2.1 Separate Tactical Battle Map + Strategic Stacking

> His biggest swing: stack on the strategic map, fight on a separate tactical map.

**What Sulla wants**:
- World map has armies (stacks of units)
- When combat occurs, zoom into a separate tactical map
- Each battle is its own mini-game with positioning, terrain, flanking
- AI can auto-resolve battles; players can manually control

**Why it conflicts with our pillars**:

| Our Pillar | Conflict |
|------------|----------|
| *One map, one mental model* | Two maps = two mental models |
| *Tactical readability* | Tactical decisions hidden inside battle screens |
| *Pacing* | Each battle interrupts strategic flow |
| *Scope* | 2 AIs to build (strategic + tactical), 2 UX loops |

**What to steal instead**:
- Rally points and group movement UX (move 5 units as one selection)
- "Combine into Army" mechanic (2-3 units become one stack with combined HP)
- But keep combat resolution on the main map with clear previews

**Verdict**: Don't implement. The scope explosion isn't worth it for "modern Civ 5."

---

### 2.2 "Big Yields + Massive Production + Cheap Units"

> His vision pushes huge output and unit volume because grouping removes micro.

**The Problem**: If you keep 1UPT, high production + cheap units = map covered in units = micro nightmare.

Sulla's design assumes stacking removes unit micro. Without stacking, you need:
- Hard unit caps (supply limit)
- Expensive units
- Strong automation (auto-explore, auto-garrison)

**Verdict**: Only adopt big yields if you also adopt strong unit caps. Don't cargo-cult the numbers without the system that makes them work.

---

### 2.3 "AI Should Not Play to Win"

> He argues AIs shouldn't "betray at the last second just to stop you winning."

**His argument**: It feels unfair when the AI backstabs you right before victory, purely because you're about to win.

**Counter-argument**: If AI never plays to win, it feels like playing against training dummies. Competitive players want AI that *tries*.

**Compromise**: Make this a difficulty/AI personality option:
- "Honorable" AI: keeps deals, doesn't backstab
- "Machiavellian" AI: will betray if it calculates a winning move
- "Historical" AI: personality-based (Gandhi keeps word, Caesar doesn't)

**Verdict**: Treat as a difficulty option, not a design doctrine.

---

## 3) BUILD-FIRST PROTOTYPES — De-Risk Before Content

If you adopt even 30% of Sulla's ideas, the hard parts are **systems**, not rendering. Prototype these before you build content.

### Prototype A: Randomized Tech Tree with Gaps

**Goal**: Prove it's *fun*, not frustrating.

**Build**:
1. Generate 5 "fields" × 3 eras (15 tech slots per field)
2. Randomly mark ~25% as "unavailable this game"
3. Surface gaps clearly in UI (grayed out, tooltip explains)
4. Add trade/steal/conquer as ways to acquire missing techs

**Test**:
- Do players form emergent stories? ("We're missing Iron Working, must trade with Egypt")
- Or do they feel screwed? ("I can't win because RNG hid Gunpowder")

**Time**: 1-2 evenings for a CLI prototype with fake tech names.

---

### Prototype B: Instability Maintenance + Government Unlocks

**Goal**: Make expansion feel rewarding but still strategic.

**Build**:
1. City maintenance = `base(5) + distance(1 per tile) + instability(starts at 3 per city)`
2. Government techs reduce instability: Pottery → -0.5, Writing → -0.5, Civil Service → -1.0
3. Simulate 100 turns with 2 expansion strategies (fast vs slow)

**Test**:
- Does early expansion feel punishing? (good)
- Does late expansion feel rewarding? (good)
- Is there a "sweet spot" turn to expand, or is it always "wait as long as possible"? (bad)

**Time**: 1 evening, spreadsheet or CLI.

---

### Prototype C: Tiered Improvements That Mature

**Goal**: Validate the "protect your economy" gameplay loop.

**Build**:
1. Implement 3 improvements with 3 tiers each (Farm, Mine, Trading Post)
2. Maturation: +1 tier every 20 worked turns
3. Pillaging resets to tier 0
4. Simulate AI raids and player response

**Test**:
- Does pillaging create real strategic tension? (good)
- Or does it create unrecoverable snowballs? (bad: loser's improvements reset, winner's don't)

**Mitigation if snowbally**: Pillaging only reduces by 1 tier, not full reset.

**Time**: 1-2 evenings.

---

### Prototype D: Separate Tactical Battle Map (Only If Tempted)

**Goal**: Kill the idea quickly if it doesn't immediately feel incredible.

**Build**:
1. One battle type (melee vs melee)
2. One unit triangle (swords > spears > horses > swords)
3. One tactical map size (7×7 hex)
4. Auto-resolve comparison (compare manual win rate vs auto-resolve)

**Test**:
- Is manual combat *so much better* than auto-resolve that players will tolerate the pacing hit?
- If auto-resolve is "good enough," the feature isn't worth shipping.

**Verdict**: If it's not instantly incredible, drop it and double down on main-map combat clarity.

**Time**: 1 week minimum. Only attempt if you're seriously considering pivoting the whole game identity.

---

## 4) Summary: What Backbay Imperium Should Adopt

### Adopt (high confidence)

| Idea | Why |
|------|-----|
| Transparent diplomacy with visible modifiers | Fits "UI explains everything" pillar |
| Expansion via state capacity (instability → government reduces it) | Feels like building capability, not fighting punishment |
| Improvements that mature over time | Creates "defend your economy" tension |
| Policies with tenure bonus | Adds commitment vs flexibility tradeoff |
| Anti-beeline tech variety (randomized gaps OR slider economy) | Prevents solved optimal play |

### Consider (medium confidence, prototype first)

| Idea | Risk |
|------|------|
| Tech tree with missing techs | Could feel frustrating if gaps are too punishing |
| Big yields + maturing tiles | Could snowball if pillaging is too devastating |
| "Empire should feel big" ethos | Need to balance against happiness/logistics |

### Reject (doesn't fit identity)

| Idea | Why |
|------|-----|
| Separate tactical battle map | Scope explosion, breaks "one map" pillar |
| Strategic stacking (armies) | Conflicts with 1UPT tactical readability |
| "AI doesn't play to win" as doctrine | Makes game feel non-competitive |
| 21-tile fat cross (square grid) | We're committed to hex |
| No unit promotions | Promotions add tactical depth |

---

## Appendix: Sulla's Original Design Summary

For reference, here's what Sulla's full design includes:

### Units & Combat
- Strategic map = armies (stacks)
- Tactical screen = the fight (like Master of Magic)
- Cities produce *many* cheap units per turn
- Combat model: strength / HP / accuracy / movement
- AI gets production bonuses on higher difficulties
- Auto-resolve option for multiplayer
- City defense via walls (HP tiers) + buildable towers
- No individual unit XP; Great Generals attached to armies level up instead

### Research
- Bring back commerce sliders (research/gold/culture allocation)
- Semi-randomized tech tree: some techs missing each game
- "All Techs Available" option for competitive MP

### Economy
- Cities have maintenance (buildings don't)
- Instability maintenance replaces "# of cities" penalty
- Government tech reduces instability over time
- Reserve fund (rush system) with harsh efficiency loss + cap
- Unit maintenance + tower upkeep to prevent gold explosion

### Tiles/Cities
- No forest-chop burst production
- All improvements grow over time (like cottages)
- Civ4-style health + happiness
- 21-tile fat cross (argues against hex)

### Government
- No anarchy, but cooldown between swaps
- Any 5 civics (not locked to columns)
- Civics get stronger the longer you keep them

### Religion & Diplomacy
- Religion founding via wonder (less random than Civ4)
- Transparent diplomacy with visible modifiers
- AI shouldn't gang up just because you're winning

### Victory
- Conquest = eliminate everyone (not capture capitals)
- Diplomacy via civ-vs-civ UN voting
- Culture victory shouldn't be "slider to 100% and wait"

### Systems He'd Cut
- City-states
- Vassal states
- Corporations
- Friendship/denunciation mechanics
