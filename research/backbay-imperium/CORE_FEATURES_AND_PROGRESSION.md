# Backbay Imperium — Core Features + Progression Systems Specification

> Purpose: define the game’s **core feature set** and the major **progression systems**
> (tech, culture/government, religion, units, buildings, economy, diplomacy) in a way
> that is fun, “just one more turn” addictive, and implementable under deterministic rules.
>
> This doc is a design-level companion to:
> - `GAMEPLAY_SPEC.md` (core loop + vibe target)
> - `STORYTELLING_DESIGN.md` (how systems create emergent narrative)
> - `DESIGN_LAWS.md` (non-negotiable pillars)
> - `IMPLEMENTATION_SPEC.md` (determinism constraints, data-driven rules)
>
> Design stance: **one map, one arc**; readable main-map tactics; transparent UI; big-empires feel big.

---

## 0) The “Just One More Turn” Requirement (Explicit)

Backbay Imperium must constantly create **near-future promises** without turning into micro:
- “Next turn I finish…”
  - a building/unit,
  - a tech milestone,
  - a policy milestone,
  - an improvement maturation tier,
  - a trade route,
  - a diplomatic timer,
  - a great person,
  - or a war objective.

### Design Rule: At Least 2 Active Progress Bars
At any time after turn ~10, the player should have **at least two** of these progressing:
- research,
- a city production queue item,
- culture/policy progress,
- an improvement tier-up in at least one city’s worked tiles,
- a deal/treaty timer,
- a wonder race,
- or a great person meter.

### Design Rule: End-Turn “Promise Strip”
The end-turn UI should surface imminent completions:
- “1 turn: Library (Capital)”
- “2 turns: Writing”
- “3 turns: Policy milestone”
- “This turn: Farm matures to Tier 2”

This is not cosmetic; it’s a pacing engine.

### 0.1 Open Questions → Defaults (Answered)
**Q: What makes this more addictive than Civ 5’s baseline loop?**
- Multiple overlapping progress ladders that *interlock* (tech ↔ civics ↔ infrastructure ↔ diplomacy), plus an explicit “promise strip” that constantly surfaces imminent wins.
- More map-visible stakes (maturing improvements + trade vulnerability) so “one more turn” isn’t only menus; it’s also the map.

**Q: What prevents “just one more turn” from turning into tedium?**
- Every progress bar has one of: a meaningful choice at completion, a visible map consequence, or a clear strategic tradeoff.
- Low-value micro is automated (rally points, unit orders, worker recommendations) and the UI aggregates spammy notifications.

**Q: How do we measure pacing in playtests?**
Defaults (tunable):
- In the first 80 turns, the player should make a “major choice” (research, policy, city specialization, diplomacy, war) at least every **3–5 turns**.
- At least **60% of turns** should contain either:
  - a completion (build/tech/policy/improvement tier), **or**
  - a new actionable prompt (threat, treaty timer, settlement opportunity).

---

## 1) Core Yield + Meter Model (What Progress Uses)

### 1.1 Primary Yields (Displayed Everywhere)
These align with the current engine scaffolding:
- **Food** → city growth and population capacity
- **Production** → units/buildings/wonders/projects
- **Gold** → maintenance, purchases, diplomacy, upgrades
- **Science** → technology progress
- **Culture** → civics/policies + borders + soft power

### 1.2 Secondary Meters (Not “Yields” Unless Needed)
Secondary meters should exist only if they create strategic decisions and stories:
- **Stability / Amenities**: expansion + war pressure, internal politics
- **Supply**: unit spam control under 1UPT (see `GAMEPLAY_SPEC.md`)
- **Influence**: diplomacy leverage / council votes (if diplomatic victory exists)
- **Faith / Piety**: religion progression (recommended to add; see religion section)

Implementation note (from `IMPLEMENTATION_SPEC.md`): keep these as integer counters in state; avoid floats.

### 1.3 Resources (Progression That Lives on the Map)
Resources are a progression system because:
- they drive settlement choices,
- they shape trade and diplomacy,
- and they gate unit lines and industrial buildings.

Resource taxonomy (recommended):
- **Bonus resources**: modest yield boost; “nice to have.”
- **Luxury resources**: stability/amenity pressure relief and diplomacy leverage.
- **Strategic resources**: required to build/upgrade/maintain certain unit lines and buildings.

Design rules:
- The UI must always show:
  - where a resource is,
  - what it unlocks right now,
  - and what it will unlock later (tech-gated reveals are previewed).
- The map generator should enforce interdependence:
  - no player spawns with all strategic resources in reach.

### 1.4 Trade Routes (A Progression Track, Not Just Income)
Trade is a progression system because it:
- scales with infrastructure and institutions,
- creates entanglement and vulnerability,
- and drives diplomacy stories.

Core model (recommended):
- Each empire has a **Trade Capacity** (number of routes) from tech + government + key buildings.
- Each route is either:
  - **Internal** (growth/production specialization),
  - or **External** (gold + science/culture + diplomacy ties).
- Routes are pillageable; risk is shown as a “threat level” along the path.

Trade design rule:
- A trade route choice must be a real choice, not “always pick max gold.”
  - reward internal development vs external leverage,
  - and make route safety a strategic investment.

### 1.5 City Growth (Food) and Population (Concrete Model)
Open question: “What is the minimum viable, readable growth model?”

Default answer (tunable, integer math):
- Each city has:
  - `population` (u8),
  - `food_storage` (i32),
  - `food_required` for next growth (i32, computed and shown in UI).
- Each population consumes a fixed amount of food per turn:
  - `food_consumption_per_pop = 2` (tunable).
- Each turn:
  - `food_surplus = city_food_yield - (population * food_consumption_per_pop)`
  - If `food_surplus > 0`: add to `food_storage`
  - If `food_surplus < 0`: subtract from `food_storage` (starvation pressure)
- Growth:
  - When `food_storage >= food_required`, city grows by 1 pop and `food_storage -= food_required` (overflow carries).
- Starvation:
  - If `food_storage < 0` for N consecutive turns (default `N=3`), reduce pop by 1 and set `food_storage = food_required / 2`.

Recommended default `food_required` curve:
- `food_required = 15 + (population * 8)` (tunable).

UI requirements:
- City tooltip shows: food yield, consumption, surplus, storage, turns-to-growth.
- Any starvation is surfaced as an actionable alert (“City starving: assign citizens / build food improvement”).

### 1.6 Production, Queues, and Overflow (Concrete Model)
Open question: “How do we keep production satisfying without late-game micro?”

Default answer:
- Cities accumulate production into a single active queue item:
  - `production_progress += production_yield`
- On completion:
  - overflow carries to the next queue item (or to a default project if queue empty).

Overflow rule (tunable):
- Overflow is fully carried, but any single-turn overflow above `overflow_cap = item_cost / 2` converts to gold at a fixed rate.
  - This prevents degenerate “overflow abuse” while still rewarding strong production.

Purchasing rule (tunable):
- Gold can “buy out” remaining production:
  - `buy_cost_gold = remaining_production * buy_rate`
  - `buy_rate` increases with era and/or for wonders to preserve wonder races.
- The UI must preview buy cost and opportunity cost (“This will delay unit upgrades by X” if relevant).

Queue UX requirements:
- Queue supports “repeat” for common items (workers/traders/projects) where appropriate.
- City screen shows “what finishes next turn” prominently to reinforce “one more turn.”

### 1.7 Gold Economy: Sources, Sinks, and Pressure Valves
Open question: “What makes gold feel strategic rather than passive income?”

Default answer:
- Gold is the primary **pivot currency**:
  - emergency defense,
  - upgrades,
  - purchases,
  - diplomatic concessions,
  - and reforms (policy/government switching).

Top-bar breakdown must always show:
- city maintenance (base + distance + instability),
- building maintenance,
- unit maintenance,
- supply over-cap penalties,
- trade income,
- and net.

### 1.8 Stability/Amenities (Recommended v1 Model)
Open question: “Do we need a happiness-like system at launch?”

Default answer: yes, but keep it **simple, city-by-city, and explainable**.

Core model (tunable):
- Each city has `amenities` and `amenity_need`.
- Default `amenity_need`:
  - `amenity_need = 1 + (population / 4)` (integer division; tunable).
- `amenity_balance = amenities - amenity_need`.

Convert amenity balance into a Stability tier:
- **Stable** (`amenity_balance >= 1`): small yield bonus (e.g., +5% all yields).
- **Content** (`amenity_balance == 0`): no modifier.
- **Strained** (`amenity_balance == -1`): small yield penalty (e.g., -5%).
- **Unrest** (`amenity_balance <= -2`): larger penalty (e.g., -15%), plus increased local maintenance.

Amenity sources (examples, not exhaustive):
- Luxuries (empire pool distributed to cities; UI shows assignment)
- Entertainment/civic buildings
- Religion beliefs/edicts
- Policies/government
- Garrison (small, frontier-focused bonus)

Design rule:
- No hidden multipliers. The city tooltip shows the full amenity breakdown and the yield impact.

### 1.9 War Weariness (Recommended v1 Model)
Open question: “How do we create pressure for wars to end without forcing peace?”

Default answer: a transparent empire-level meter that feeds into city amenities/stability.

Core model (tunable):
- Each player has `war_weariness` (i32, >= 0).
- Increases from:
  - time at war (per turn),
  - losing units,
  - fighting near home territory,
  - city captures (especially losing cities).
- Decreases slowly at peace.

Effect:
- `war_weariness` converts into a flat amenity penalty distributed across cities (or a per-city stability penalty).
- The UI previews “If you declare war: expected weariness per 10 turns.”

### 1.10 Numeric Conventions (Determinism-Friendly)
Open question: “How do we specify percentages and curves without floats?”

Default answer:
- Use **basis points** (bp) for percentages (`100 bp = 1%`, `10000 bp = 100%`).
- Use integer thresholds and piecewise curves rather than float formulas.
- Any RNG used for generation (map/tech availability) must be seeded and recorded in the chronicle/replay.

---

## 2) The Progression Axes (At a Glance)

Backbay Imperium’s “addiction” comes from **multiple interlocking ladders**:

| Axis | What It Unlocks | What It Costs | What It Creates (Story/Play) |
|------|------------------|---------------|-------------------------------|
| Science (Tech) | units, buildings, improvements, wonders, governments | science + time | “We raced to X / we adapted without X” |
| Culture (Civics) | policies, border growth, institutions | culture + commitment | doctrine identity + tradeoffs |
| Religion (Beliefs) | stability tools, diplomacy tools, unique bonuses | faith/piety + tradeoffs | ideological blocs, schisms, alliances |
| Economy (Infrastructure) | matured improvements, trade network, upgrades | workers + gold + defense | raids, frontlines, vulnerability |
| Military (Army Quality) | promotions, combined-arms bonuses | supply + gold + risk | “veterans,” decisive campaigns |
| Diplomacy (Reputation) | treaties, councils, alliances | concessions + time | grudges, coalitions, endings |

The goal is not more systems; it’s **more reasons to take one more turn**.

### 2.1 Open Questions → Defaults (Answered)
**Q: How do we stop one progression axis from dominating the game?**
- Default: each axis has a counterpressure and a dependency:
  - tech needs gold and safety,
  - culture needs stability and contact,
  - economy needs defense,
  - war needs supply and maintenance,
  - diplomacy needs reputation and commitments.

**Q: What is the default “power loop” the player should feel?**
- “I invest (build/improve), I gain capability (yields/slots), I unlock (tech/civics), I project (trade/diplomacy/war), and the map changes visibly.”

---

## 3) Technology System (Science Progression)

### 3.1 Design Goals
- Avoid solved beelines (see `SULLA_ANALYSIS.md`).
- Preserve long-term planning (see “one map, one arc” in `DESIGN_LAWS.md`).
- Make missing knowledge a story (see `STORYTELLING_DESIGN.md`), not a frustration.

### 3.2 Structure: Fields, Tiers, and Eras (No Resets)
Techs live in:
- **Fields**: e.g., Military, Economy, Governance, Culture, Science
- **Tiers**: increasing prerequisite depth
- **Era tags**: for pacing/UI/music only (no gameplay reset)

Each tech defines:
- prerequisites (graph)
- cost (science points)
- field + era tags
- unlocks (content + rules)

### 3.3 Anti-Beeline Mechanism (Recommended Default)
Use **semi-random tech availability** per game (Master of Orion style, per `SULLA_ANALYSIS.md`):
- At game start, ~20–30% of techs in each field are marked **Unavailable This Game**.
- Unavailable techs remain visible (greyed) with:
  - “Unavailable this game”
  - “You can still acquire this via trade / espionage / conquest / breakthrough”

Key fairness rules:
- The generator must never remove *all* paths to a victory condition.
- Missing techs must have visible substitutes or acquisition routes.

Multiplayer option:
- “All Techs Available” for competitive fairness.

### 3.4 Knowledge Acquisition (How You Get “Missing” Tech)
Missing techs can be acquired via **intentional play**:
- **Trade**: research agreements / direct tech exchange (if allowed)
- **Espionage** (later): steal tech progress or complete tech
- **Conquest**: capture a city with a key institution or wonder
- **Breakthroughs**: Great People / projects that grant a missing tech

Design requirement:
- The UI must show which rivals possess missing techs and how you might obtain them.

### 3.5 Research Sources and Directionality
Science should be a mix of:
- baseline from population (small, steady),
- buildings (large, directional),
- policies (doctrine),
- and diplomacy/trade (interdependence).

Research UI must always show a breakdown (see `GAMEPLAY_SPEC.md`).

### 3.6 “Tech Feels Like Progress” (Milestone Packaging)
To sustain “one more turn,” techs should unlock **packages**, not crumbs:
- a unit line step,
- a building line step,
- an improvement tier unlock,
- a government or policy slot,
- or a wonder race.

Avoid techs that only give tiny invisible percentages unless they are clearly explained and strategically meaningful.

### 3.7 Resource Reveal + Exploitation (Map Progression)
Tech should progressively “deepen” the map:
- early game: obvious food/production terrains matter most
- mid game: strategic resources appear and reshape priorities
- late game: industrial resources and logistics become decisive

Recommended pattern:
- Some resources are visible from turn 1 (bonus/luxury).
- Some strategic resources are **revealed by tech**.
- Extraction is **unlocked by improvements/buildings** and may require infrastructure:
  - e.g., “Requires Mine + Road connection,” “Requires Refinery building,” etc.

Design rule:
- Revealing a resource should create at least one immediate story prompt:
  - settle/expand,
  - trade,
  - negotiate,
  - or plan a war.

### 3.8 Research Queue + Overflow (No Dead Turns)
Research UX requirements:
- Overflow carries forward.
- Research can be queued (optional) but the player is prompted on completion if no queue is set.
- “Unavailable this game” techs remain visible with acquisition methods and rival possession indicators.

### 3.9 “Unavailable Tech” Generation (Deterministic Algorithm)
Open question: “How do we generate tech gaps without unfairness?”

Default answer: deterministic per-game generation with hard constraints.

Inputs:
- world seed (recorded for replays)
- ruleset version hash (so older replays stay valid)
- tech list grouped by `field` and `era`

Algorithm (high level):
1. For each field × era bucket, compute a target missing count:
   - `missing_count = round(bucket_size * missing_pct_bp / 10000)`
   - default `missing_pct_bp = 2500` (25%).
2. Exclude “critical techs” from being missing:
   - defined by tags like `critical_science_victory`, `critical_movement`, `critical_admin`
   - (the tags are content-defined, not hardcoded).
3. Only select from techs marked as “optional” within that bucket:
   - avoids deleting the spine of the tree.
4. Run a constraint check:
   - at least one path to each victory endgame exists,
   - at least one strategic resource unlock exists in the midgame,
   - no field has > X consecutive missing techs on the same prerequisite chain (default `X=1`).
5. If constraints fail, resample deterministically (advance RNG) until they pass.

UI requirement:
- The tech tree marks missing techs clearly and lists acquisition routes and who has them.

### 3.10 Tech Cost Curve (Pacing Targets)
Open question: “How long should a tech take across the arc?”

Default pacing targets (tunable):
- Early: most techs complete in **4–8 turns**
- Mid: **8–12 turns**
- Late: **12–20 turns**

Implementation approach:
- Each tech has a data-defined `cost`.
- Global pace is tuned by:
  - baseline science yields (population/buildings),
  - and era tech costs (content balancing).

Design rule:
- Do **not** scale tech costs directly by number of cities; wide-play costs should be paid via state capacity, maintenance, and defense obligations.

### 3.11 Tech Tree Content Structure (What Unlocks What)
Open question: “What are the minimum ‘packages’ a tech should unlock?”

Default answer: each tech should unlock at least one of:
- a unit line step (new unit or upgrade enabling),
- a building line step,
- a new improvement or improvement tier cap,
- a government/policy slot or reform,
- a resource reveal/extraction,
- a wonder,
- or a new treaty/agreement type.

### 3.12 Example Field Ladders (Illustrative)
These are placeholders to guide content structure (names are not final).

- **Governance**
  - “Census” → “Civil Service” → “Bureaucracy” → “Central Administration”
  - Unlocks: admin buildings, stability tools, lower instability maintenance
- **Economy**
  - “Currency” → “Banking” → “Industrial Capital” → “Global Markets”
  - Unlocks: trade capacity, gold buildings, purchasing efficiency, commercial wonders
- **Military**
  - “Metallurgy” → “Professional Armies” → “Gunpowder Doctrine” → “Mechanized Warfare”
  - Unlocks: unit lines, upgrades, supply tools, siege improvements
- **Culture**
  - “Philosophy” → “Rhetoric” → “Printing” → “Mass Media”
  - Unlocks: policies, border growth tools, cultural works slots, diplomacy posture
- **Science**
  - “Mathematics” → “Physics” → “Chemistry” → “Computing”
  - Unlocks: science buildings, research projects, endgame science victory stages

---

## 4) Culture + Government System (Civics, Policies, State Capacity)

### 4.1 Design Goals
- Provide a second major progression ladder parallel to tech.
- Force commitment tradeoffs (tenure) so choices define identity.
- Make expansion feel like building capability (state capacity) rather than arbitrary penalties.

### 4.2 Culture as Civic Progress
Culture accumulates and periodically triggers a **Policy Milestone**.
At each milestone, the player chooses:
- a new policy, **or**
- a government reform, **or**
- a doctrine upgrade (depending on era/government).

### 4.3 Policy Trees (Mutually Exclusive Branches)
Policies are organized into a small set of trees where early choices lock out alternatives:
- Tradition vs Liberty (core identity)
- Commerce vs Industry (economy posture)
- Authority vs Republic (military vs civic posture)
- Scholarship vs Craft (science vs production posture)

Design requirement:
- The UI must clearly show what is locked out and why.

### 4.4 Tenure (Policies Get Stronger When Kept)
Per `SULLA_ANALYSIS.md` and `GAMEPLAY_SPEC.md`:
- Policies gain a **tenure bonus** the longer they remain active.
- Switching policies resets tenure (or applies a reform cost + partial reset).

Tenure exists to create:
- meaningful reform moments,
- long-term doctrines,
- and a narrative of “we became this.”

### 4.5 Government as State Capacity (The Expansion Backbone)
Government progression provides the main “wide-play feels good” arc:
- early empires are administratively strained (high instability maintenance),
- later governments reduce instability and increase supply/administrative tools.

Government should affect:
- policy slots,
- supply cap,
- stability ceiling,
- and diplomatic posture.

### 4.6 Borders and Soft Power
Culture contributes to:
- border expansion,
- cultural influence pressure,
- and (optionally) diplomatic influence/votes.

Soft power should be interactive:
- routes and agreements spread influence,
- rivals can counter with investment, diplomacy, or pressure.

### 4.7 Cultural Works / Heritage (Optional, High-Leverage for “Culture Victory”)
To make culture more than “accumulate points,” add a concrete object layer:
- **Works** (artifacts, texts, performances) created by:
  - Great People,
  - wonders,
  - and city projects.
- Works are stored in specific buildings (“archives,” “museums,” etc.).
- Works generate culture/influence and can create diplomatic leverage (exhibitions, exchanges).

Design goals:
- Works should create **placement decisions** (“where do I house this?”).
- Works should create **targets and stakes** (raids, capture, blockades).
- The system must remain low-micro:
  - limited slots,
  - clear recommendations,
  - and no constant shuffling.

### 4.8 Civic Cost Curve (Pacing Targets)
Open question: “How often should policy/government choices happen?”

Default pacing targets (tunable):
- Early: a policy milestone every **8–12 turns**
- Mid: every **10–15 turns**
- Late: every **12–20 turns**

Implementation approach:
- Culture yields are tuned by buildings/policies and city size.
- Each milestone has a data-defined `cost` curve:
  - recommended default: `next_cost = base + (policies_taken * step)`
  - where `base=30`, `step=15` (illustrative).

Design rule:
- Culture progression should remain meaningful even for wide play; do not add harsh “per city” culture cost multipliers that punish expansion by default.

### 4.9 Tenure Mechanics (Exact Model)
Open question: “How do we compute tenure without confusing players?”

Default answer: tenure is counted in **eras retained**, derived from tech-era progression (monotonic).

Definitions:
- Each tech has an `era` tag (content-defined).
- A player’s `current_era` is the maximum era among researched techs.
- When a policy is adopted, record `policy_adopted_era = current_era`.

Tenure bonus:
- `policy_tenure_eras = current_era - policy_adopted_era`
- `tenure_step_bp = 1000` (10% per era; tunable)
- `tenure_cap_bp = 5000` (50% cap; tunable)
- `tenure_bonus_bp = min(tenure_cap_bp, policy_tenure_eras * tenure_step_bp)`

Effect application:
- Any numeric effect from that policy is multiplied by `(10000 + tenure_bonus_bp) / 10000`.

Switching rules (default):
- Swapping a policy resets its `policy_adopted_era` (tenure goes to 0).
- A reform incurs:
  - a gold cost, and
  - a temporary amenity/stability hit (so reforms feel like political disruption).

UI requirements:
- Each policy shows: “Tenure: 2 eras (+20%)” with exact bonus and cap.
- Hover shows what era milestones will increase tenure next.

### 4.10 Government Types, Slots, and Identity (Default Set)
Open question: “What is a ‘government’ in Backbay Imperium?”

Default answer: a government is a package of:
- base empire modifiers (administration, supply, stability),
- a number of policy slots by category,
- and access to certain reforms/treaties.

Suggested slot categories:
- **Civic** (culture/stability/borders),
- **Economic** (gold/trade),
- **Military** (supply/war posture),
- **Religious** (if religion exists),
- **Diplomatic** (if influence exists).

Suggested government ladder (illustrative; content-defined unlocks):
| Government | Unlock (tech/civic) | Identity | Slots (C/E/M/R/D) | Notes |
|-----------|----------------------|----------|-------------------|------|
| Council | start | local cohesion | 1/0/0/0/0 | high early instability cost |
| Republic | early | economy + civic | 1/1/0/0/0 | trade capacity bonus |
| Monarchy | early | military + order | 1/0/1/0/0 | garrison/stability tools |
| Bureaucracy | mid | administration | 1/1/0/0/0 | reduces distance/instability |
| Constitutional | mid | balanced | 1/1/1/0/0 | reforms cheaper |
| Industrial State | late | scale | 1/2/1/0/0 | large supply + admin tools |
| Global Order | late | diplomacy | 1/1/1/0/1 | council/influence focus |

Design rule:
- Governments must be mutually distinct and should unlock new play patterns, not just +X%.

### 4.11 State Capacity: City Maintenance (Exact Breakdown)
Open question: “How do we make expansion costly early and comfortable late without arbitrary penalties?”

Default answer: city maintenance is transparent and reducible via institutions.

For each city:
```
maintenance = base + distance + instability + occupation
```

Defaults (tunable):
- `base = 5`
- `distance = distance_to_capital_tiles * 1`
- `instability = max(0, base_instability - gov_admin - admin_building - connection_bonus)`
  - `base_instability = 3`
  - `gov_admin` is a government-derived integer (0–3+)
  - `admin_building` is local (0–2 depending on admin tier)
  - `connection_bonus = 1` if connected to capital via roads/sea-lanes
- `occupation = 2` for conquered cities, decays by 1 per era or after N turns of peace (tunable)

Why this works:
- Early: distance + instability make frontier cities expensive.
- Mid/late: government + admin buildings + connectivity reduce instability, making scale feel achievable.

UI requirement:
- City maintenance tooltip shows the exact breakdown (no hidden global multipliers).

### 4.12 Border Growth (Exact Mechanic)
Open question: “Manual border painting or automatic?”

Default answer: automatic by default with optional override (to avoid micro).

Per city:
- Each turn add `border_progress += city_culture_yield`.
- When `border_progress >= border_cost`:
  - claim exactly one adjacent unclaimed tile,
  - subtract `border_cost` (overflow carries),
  - increase `border_cost`.

Default `border_cost` curve (tunable):
- `border_cost = 20 + (tiles_claimed_by_city * 5)`

Tile selection:
- Default: deterministic “best tile” function (yield + resources + strategic value).
- Optional: player can choose from the top N suggested tiles (N=3) to retain agency without micro.

### 4.13 Open Questions → Defaults (Answered)
**Q: Do policy trees lock forever?**
- Default: early branches lock until a late-game “Reform Era” unlocks a limited cross-tree pick (keeps identity, enables late pivots).

**Q: Do governments swap freely?**
- Default: swapping is allowed but requires a cooldown + reform cost and triggers temporary stability pressure.

---

## 5) Religion System (Belief Progression Without Micromanagement)

### 5.1 Design Goals
- Add an identity layer that produces diplomacy blocs and internal politics.
- Avoid “religious unit spam” and avoid opaque pressure rules.
- Make religion legible, choice-driven, and story-generative.

### 5.2 Recommended Core Model: Passive Spread + Institutional Choices
Religion spreads primarily through:
- adjacency/city proximity,
- trade routes,
- and dedicated religious buildings.

Religious actions are mostly **policy/building** decisions, not unit micro.

### 5.3 Founding and Growth
Suggested arc:
1. **Local Beliefs** (early): choose a “pantheon-style” local doctrine from a short list.
2. **Found a Religion** (mid): triggered by a tech + building/wonder threshold (not pure RNG).
3. **Reformation / Schism** (mid/late): major reform choice that changes bonuses and diplomacy alignments.

### 5.4 Belief Slots (Make Choices Clean)
Define a small, readable schema:
- **Founder Belief**: empire-wide identity bonus
- **Follower Belief**: city-level benefit that scales with adherence
- **Institution Belief**: unlocks a unique building/improvement effect
- **Diplomatic Belief**: affects treaties, influence, or war weariness

### 5.5 Religion as a Source of Stakes
Religion should matter because it changes:
- stability (internal cohesion),
- diplomacy (alliances and rivalries),
- and culture (identity).

Storytelling requirement (from `STORYTELLING_DESIGN.md`):
- show religious pressure and adherence clearly via a lens and city tooltips,
- show why a city converted,
- show what the player can do about it.

### 5.6 Religious Actions (Low Micro, High Consequence)
Religion should offer a small set of high-leverage actions that create stories:
- **Edicts** (policy-like toggles): temporary empire-wide stance with a cost (piety/stability).
- **Councils**: periodic choices that adjust doctrine and international posture.
- **Pilgrimage / Mission** projects: city projects that boost spread or generate a Great Person–style effect.

Design constraints:
- Avoid tactical “religion combat” units.
- Avoid constant per-city clicking; decisions should be periodic and weighty.
- Always preview consequences (“If you adopt this edict: +X stability, -Y gold, relations -Z with rivals of doctrine Q”).

### 5.7 Implementation Note (Yields vs Meter)
If the engine keeps only the five primary yields, religion can still work by tracking:
- a **Piety/Faith** meter in player/city state derived from buildings/policies,
or (later) adding Faith as a proper yield.

### 5.8 Religion State Model (Cities, Pressure, and Adherence)
Open question: “How do we model religion without unit micro and without opaque pressure?”

Default answer: cities track **pressure** as integers; conversion uses hysteresis.

Per city state (recommended):
- `dominant_religion: Option<ReligionId>`
- `religion_pressure: Vec<(ReligionId, i32)>` (store top K religions, default `K=3`)
- `piety: i32` (city contribution to player pool, if using a meter)

Interpretation:
- Pressure is not “percent.” It’s a relative strength value.
- The dominant religion is the one with highest pressure, subject to conversion rules below.

### 5.9 Passive Spread Algorithm (Deterministic, Explainable)
Open question: “How does pressure change turn to turn?”

Default sources of pressure (tunable):
- **Local institutions**: shrines/temples add pressure each turn.
- **Adjacency**: neighboring cities project a small fraction of their pressure onto you.
- **Trade routes**: an external route can project pressure along the route endpoints.
- **Edicts/projects**: temporary boosts to local or outgoing pressure.

Conversion (anti-flip-flop):
- Let `A` be current dominant religion, `B` be the strongest challenger.
- A city only converts from `A` to `B` if:
  - `pressure[B] >= pressure[A] + conversion_margin` for `conversion_delay` consecutive turns.
- Defaults (tunable):
  - `conversion_margin = 10`
  - `conversion_delay = 5`

UI requirements:
- City religion tooltip shows:
  - dominant religion,
  - top pressures and their sources (“+3 trade route,” “+2 shrine,” “+1 neighbor”),
  - and “X turns until conversion” if a challenger is winning.
- Religion lens shows dominant religion by color and “contested” cities with a border highlight.

### 5.10 Founding, Reforming, and Schisms (Milestone-Driven)
Open question: “How does a player intentionally progress religion?”

Default arc:
1. **Local Belief** (early):
   - Unlock condition: first city reaches a small culture or piety threshold.
   - Choice: pick 1 local belief from a short list (6–10).
2. **Found Religion** (mid):
   - Unlock condition (tunable): a tech + a building + a piety threshold.
     - e.g., requires “Theology”-equivalent tech, a shrine/temple, and `piety_pool >= 100`.
   - Choice: select religion name/symbol + pick Founder/Follower/Institution/Diplomatic beliefs.
3. **Reformation / Schism** (mid/late):
   - Unlock condition: later tech/civic + piety threshold + optional world condition (e.g., number of foreign cities converted).
   - Choice: either reform (strengthen cohesion bonuses) or schism (create a new branch with diplomatic consequences).

Design rule:
- Religion choices must be consequential and identity-defining; avoid dozens of tiny belief picks.

### 5.11 Belief Catalog (Example Effects)
Open question: “What kind of bonuses belong in religion?”

Default answer: religion should mostly touch:
- stability/amenities,
- diplomacy alignment,
- and a small number of economic/science hooks (directional, not dominant).

Examples (illustrative):
- **Founder**:
  - “Civic Unity”: +1 amenity in cities of the faith; +influence from treaties with same-faith empires.
- **Follower**:
  - “Hospices”: cities of the faith gain +food surplus buffer (reduced starvation risk).
- **Institution**:
  - “Scriptoria”: shrine buildings add +culture (and later +science) with tenure-like scaling.
- **Diplomatic**:
  - “Sanctions”: breaking treaties with same-faith empires has harsher penalties; but treaties are easier to form.

Design rule:
- Every belief effect must be surfaced in the relevant breakdown UI (city yields, amenities, diplomacy modifiers).

### 5.12 Religious Diplomacy (Blocs That Create Stories)
Open question: “How does religion create international politics without being a mini-game?”

Default answer:
- Same-faith empires gain a visible relationship bonus.
- Opposing-faith empires gain border tension faster and have higher suspicion.
- Certain treaties are easier/harder depending on alignment.
- Councils/edicts can trigger “doctrine stances” that affect relations for a fixed duration.

### 5.13 Open Questions → Defaults (Answered)
**Q: Is religion v1 or v2?**
- Default: v1 includes a **light** religion system (passive spread + 1–2 milestone choices). Avoid religious units and deep micro until later.

---

## 6) Units, Promotions, and the Military Progression Ladder

### 6.1 Unit Line Philosophy (Readable Combined Arms)
Units should fall into clear roles with counters:
- Melee (frontline control, captures)
- Ranged (zone denial, focus fire)
- Cavalry (flanks, raids, mobility)
- Siege (city breaking)
- Naval (trade control, coastal wars)

The player should be able to “read” a battlefield at a glance.

### 6.2 Promotions (Identity, Not Tiny Math)
Promotions are:
- shallow trees with meaningful branches,
- always surfaced in combat preview,
- and designed to create veteran stories.

Example structure (per class):
- Tier 1: pick 1 of 2 (e.g., “Woodsman” vs “Shock”)
- Tier 2: pick 1 of 2
- Tier 3: capstone style

Avoid:
- long ladders of +1% noise,
- hidden situational bonuses the player can’t plan around.

### 6.3 Upgrades (Keep Armies Relevant)
When a new unit is unlocked:
- old units can upgrade for gold (and possibly resources),
- keeping promotions and identity intact.

Upgrade rules must be UI-transparent:
- cost,
- requirements,
- and resulting stat deltas.

### 6.4 Supply + Logistics (Prevent Carpet, Create Strategy)
Under 1UPT, the “unit spam” control must be explicit:
- supply cap scales with population and government,
- exceeding cap has clear penalties,
- roads and connections matter for reinforcement speed,
- and war weariness pressures closure.

This keeps combat readable and makes wars about planning, not volume.

### 6.5 Combined Arms Bonuses (Make Composition Matter)
To avoid “spam the best unit,” reward mixed formations:
- adjacency synergies (“infantry adjacent to siege: siege is protected”),
- flanking and screening (“cavalry enables flanks, infantry holds lines”),
- support units (rare) that buff nearby units without adding combat clutter.

Design rule:
- Any combined-arms bonus must be visible on-map and in combat preview.

### 6.6 Veteran Continuity (Keep Stories Alive)
Veterans are a narrative asset:
- promotions should be meaningful,
- upgrading preserves identity,
- and the chronicle records “famous” units (optional) when they hit key milestones.

### 6.7 Unit Roster and Upgrade Lines (Illustrative Skeleton)
Open question: “What does the unit progression ladder look like from ancient to modern?”

Default answer: a small number of readable lines with clear counters and upgrade continuity.

Illustrative land lines:
- **Infantry (melee)**: Warrior → Swordsman → Heavy Infantry → Rifle Infantry → Modern Infantry
- **Anti-cavalry**: Spearman → Pike → Anti-Armor Infantry
- **Ranged**: Archer → Crossbow → Gunline → Modern Ranged Infantry
- **Cavalry**: Horseman → Cavalry → Armored Cavalry → Tank
- **Siege**: Catapult → Cannon → Artillery → Rocket Artillery

Illustrative naval lines (later):
- **Coastal**: Galley → Frigate → Destroyer
- **Capital ships**: Ship-of-the-Line → Battleship → Carrier group (if air exists)

Gating rules:
- Some units require strategic resources to build and/or maintain.
- Upgrades require:
  - the enabling tech,
  - gold cost,
  - and any resource requirements for the new unit.

Design rule:
- Every era should introduce at least one new tactical relationship (range, mobility, siege, naval control) to keep battles evolving.

### 6.8 Supply and Unit Maintenance (Exact Model)
Open question: “How do we prevent unit carpet while keeping big wars possible?”

Default answer: supply cap + transparent penalties (not hard bans).

Definitions:
- Each unit has `supply_cost` (default 1; siege/armor may be 2; tunable).
- Empire totals:
  - `supply_used = sum(unit.supply_cost)`
  - `supply_cap = base + pop_factor + gov_bonus + building_bonus + policy_bonus`

Default supply cap formula (tunable, integer):
- `base = 6`
- `pop_factor = total_population / 2`
- `gov_bonus` depends on government (0–12)
- `building_bonus` from barracks/admin/industrial buildings
- `policy_bonus` from military policies

Over-cap penalties (tunable, simple):
- `over = max(0, supply_used - supply_cap)`
- Extra gold upkeep: `over * supply_overcap_gold_per_supply`
  - default `supply_overcap_gold_per_supply = 3`
- Empire-wide amenity pressure:
  - for every `supply_overcap_amenity_step = 5` over-cap, each city gets `-1` amenity.

Unit maintenance (baseline):
- Units have per-turn gold upkeep by era/class (data-defined).
- The UI shows:
  - base unit maintenance,
  - plus over-cap penalties as a separate line item.

### 6.9 Promotions (Example Branches)
Open question: “What kinds of promotions create stories and tactical choices?”

Default: short, branching trees with map-relevant effects that appear in combat previews.

Examples (illustrative):
- **Melee**
  - “Shock”: +attack in open terrain
  - “Drill”: +attack/defense in rough terrain
  - “Guardian”: stronger ZOC / protects adjacent units
- **Ranged**
  - “Accuracy”: +damage
  - “Cover”: reduced damage from ranged retaliation
  - “Spotter”: improved line-of-sight (if LOS exists)
- **Cavalry**
  - “Raider”: pillage costs 0 movement; extra pillage yield
  - “Flanker”: increased flanking bonus
  - “Withdrawal”: improved retreat chance (if enabled; previewed)
- **Siege**
  - “Engineer Corps”: faster setup / ignores part of city defense bonus
  - “Barrage”: extra damage vs cities

Design rule:
- Promotions should change *how a unit is used*, not just its stats.

### 6.10 War Posture (Declaring War Is a Commitment)
Open question: “How do we make wars feel like campaigns with beginnings and ends?”

Default answer:
- War has explicit **war goals** (see diplomacy section).
- War weariness creates pressure for closure (see section 1.9).
- Supply and maintenance create logistical constraints.

### 6.11 Open Questions → Defaults (Answered)
**Q: Do we allow stacking/armies?**
- Default: military remains 1UPT (per `DESIGN_LAWS.md`); use group-move UX and supply to keep it playable.

---

## 7) Buildings and City Specialization (The Economic Progression Ladder)

### 7.1 Design Goals
- Cities should feel distinct (see `GAMEPLAY_SPEC.md`).
- Buildings should create specialization paths, not linear “build everything” lists.
- Each building should answer: “What strategic problem does this solve?”

### 7.2 Building Lines (Readable Families)
Organize buildings into families that clearly map to city roles:
- **Growth**: granary/aqueduct equivalents
- **Production**: workshop/foundry equivalents
- **Science**: library/university equivalents
- **Culture**: monument/theatre equivalents
- **Trade**: market/port equivalents
- **Military**: barracks/armory/walls equivalents
- **Religion** (if present): shrine/temple equivalents
- **Administration**: institutions that reduce instability or distance burdens

Each family should have 2–4 meaningful tiers across the full arc.

### 7.3 Requirements as Story + Strategy
Requirements should create map-driven stories:
- terrain requirements (coast for harbor, river for mill),
- resource requirements (iron for foundry, oil for refinery),
- population thresholds (wonders and advanced institutions),
- government/policy prerequisites (ideological alignment).

Every requirement must be explained in the UI (“locked because…”).

### 7.4 Purchases and Projects
Gold purchasing should enable strategic pivots:
- emergency defense,
- finishing a wonder race,
- upgrading an army,
- or stabilizing a city.

Projects exist to give cities something meaningful to do when “everything is built”:
- research project,
- cultural festival,
- military training,
- diplomatic mission.

Projects are an anti-tedium tool and a pacing tool.

### 7.5 Specialization Constraints (Prevent “Build Everything”)
To keep city-building strategic, cities should face real specialization constraints:
- **Maintenance pressure**: building everything should be economically painful (visible sinks).
- **Slot pressure** (optional): certain powerful building families require limited “institution slots.”
- **Mutual exclusivity** (recommended): at key tiers, you must choose one of two buildings:
  - e.g., “University” vs “War College,” “Merchant Guild” vs “State Foundry.”

Design rules:
- Specialization constraints must be explicit in UI (no hidden caps).
- Constraints should create stories:
  - “This is our fortress city,” “this is our scholarly capital,” “this is our trade port.”

### 7.6 Administration Buildings (Make State Capacity Concrete)
State capacity should have visible, buildable anchors:
- local administrative buildings reduce distance/instability burdens,
- roads and connected networks improve administrative cohesion,
- governments unlock stronger institutions.

These buildings are progression:
- they unlock new expansion windows and “empire feels big” moments.

### 7.7 Building Slots and Exclusivity (Prevent “Build Everything”)
Open question: “How do we prevent ‘optimal play = build all buildings everywhere’?”

Default answer: combine **maintenance pressure** with a light **institution slot** system.

Institution slots (tunable):
- Each city has `institution_slots = 1 + (population / 4)`
- Some buildings are tagged `infrastructure` (no slot).
- Some buildings are tagged `institution` (consume 1 slot).
- Wonders do not consume slots but may require a minimum number of filled slots (population/institution threshold).

Exclusivity groups (recommended):
- Powerful buildings belong to an `exclusive_group`:
  - only one building in that group can exist in a city.
  - Example groups:
    - “Academy”: University vs War College
    - “Commerce”: Merchant Guild vs State Foundry
    - “Faith”: Temple of Unity vs Temple of Zeal

UI requirements:
- The city screen shows slots, what consumes them, and what is mutually exclusive (with “why locked” tooltips).

### 7.8 Building Families (Illustrative Tiered Lines)
Open question: “What are the building progression lines players should learn?”

Default answer: a small set of families with 2–4 tiers each and clear city-role mapping.

Illustrative families:
- **Growth**
  - Granary (food storage) → Aqueduct (housing/fresh water) → Public Works (late growth/stability)
- **Science**
  - Library → University → Research Institute
- **Culture**
  - Monument → Theatre/Forum → National Archive
- **Trade**
  - Market → Exchange/Harbor Office → Stockhouse/Port Authority
- **Production**
  - Workshop → Foundry → Industrial Complex
- **Military**
  - Barracks → Armory → War Department
  - Walls → Fortifications → Modern Defenses (city defense line)
- **Administration**
  - Magistrate → Governor’s Office → Provincial Bureau (reduces instability/distance)

Design rule:
- Each tier should unlock a new strategic capability (not just more of the same yield).

### 7.9 Building Maintenance (Keep Choices Real)
Open question: “How do we make buildings feel like commitments?”

Default answer:
- Most buildings have ongoing maintenance.
- Maintenance is visible and large enough to matter, especially early.
- Late-game economies can support more institutions (matching state capacity fantasy).

### 7.10 City Projects (Concrete List)
Open question: “What do cities do when the queue is empty?”

Default project set (v1-ready):
- **Research Grants**: converts production into science (at a disclosed rate).
- **Cultural Festival**: converts production into culture/influence.
- **Military Drills**: converts production into unit XP for garrisoned units (or produces a veteran unit).
- **Trade Expedition**: converts production into gold and/or trade capacity for a duration.
- **Relief Effort**: converts production into amenities/stability recovery.

Design rule:
- Projects must create a choice (why this project now?) and must be visible in the city yield breakdown.

### 7.11 Open Questions → Defaults (Answered)
**Q: Are we using Civ 6-style districts?**
- Default: no. We use slots/exclusivity + map-based improvements and resources to keep the city layer strategic but readable.

---

## 8) Improvements, Maturation, and Infrastructure (The “Defend Your Economy” Loop)

### 8.1 Improvement Tiers (Core Feature)
Per `SULLA_ANALYSIS.md` and `GAMEPLAY_SPEC.md`:
- Improvements mature as they are worked.
- Maturity is visible and valuable.
- Pillaging hurts but isn’t irreversible by default.

Recommended baseline:
- Tier-up after N worked turns (tunable per improvement).
- Pillage reduces tier by 1 and disables yields until repaired.

### 8.2 Roads and Connection Effects
Roads should be:
- a logistics multiplier (reinforcements),
- a trade multiplier (routes),
- and a cohesion tool (administration).

Connections should have explicit effects:
- “Connected to capital: +X gold / -Y distance maintenance / +Z stability”

### 8.3 Worker/Engineer UX (Less Clicking)
Workers should be strategic, not spammy:
- improvements take time (commitment),
- recommendations explain themselves,
- queueing and automation exist for low-value repetition.

### 8.4 Improvement Families (Example Targets)
Improvements should be a small, legible set that grows with tech eras.

Examples (illustrative, not final names):
- **Farm**: Food → more Food → Food + small Gold (matured markets)
- **Mine**: Production → more Production → Production + small Gold (industrial output)
- **Lumber**: Production → Production + Gold → more Production + Gold
- **Trading Post**: Gold → more Gold → Gold + small Science/Culture (knowledge exchange)
- **Plantation** (luxury): stability/amenity + trade value
- **Pasture** (bonus/luxury): food/production mix + stability

Tier scheduling rules:
- Early tiers come quickly (reward the first investment).
- Late tiers take meaningful time (create defendable stakes).
- The UI must show “worked turns” toward maturity and what interrupts it (pillage, city capture).

### 8.5 Maturation Mechanics (Exact Model)
Open question: “What counts as ‘worked’ for maturity?”

Default answer:
- A tile’s improvement maturity advances only when the tile is **actively worked by a city**.
- Maturity is stored as:
  - `tier` (0–3; 0 = unimproved or destroyed),
  - `worked_turns` (toward next tier).

Tier thresholds (tunable; per improvement type):
- Example default:
  - Tier 1: on completion of build action
  - Tier 2: +20 worked turns at Tier 1
  - Tier 3: +40 worked turns at Tier 2

Rules:
- If a citizen is reassigned off the tile, `worked_turns` pauses (does not decay).
- If the tile is pillaged, maturity pauses until repaired.

UI requirement:
- Tile tooltip shows “Tier 2 (13/40 worked turns toward Tier 3).”

### 8.6 Pillage and Repair (Exact Model)
Open question: “How devastating is pillaging?”

Default answer (balanced, tunable):
- Pillage immediately:
  - disables yields,
  - reduces tier by 1 (minimum 0),
  - sets `pillaged = true`.
- Repair:
  - worker action taking `repair_turns = 2` (tunable),
  - clears `pillaged`,
  - restores yields at the reduced tier.

Conquest interaction (default):
- Capturing a city does **not** automatically destroy improvements, but:
  - contested border tiles can be pillaged in war,
  - and occupation pressure makes newly conquered territory harder to exploit immediately.

Design rule:
- Pillaging must create immediate strategic pain (trade disruption, yield loss) but not a permanent “winner keeps compounding forever” spiral.

### 8.7 Worker/Engineer Actions (Concrete List)
Open question: “What do workers actually do in v1?”

Default worker action set:
- Build improvement (multi-turn; per improvement type)
- Build road (multi-turn; per road tier)
- Repair pillaged improvement (2 turns)
- Remove improvement (optional; later)
- Build resource extractor variants (e.g., mine on iron) when unlocked

Worker UX:
- The UI recommends the top 2–3 improvements with explicit reasoning (per `GAMEPLAY_SPEC.md`).
- Workers support queueing and basic automation (never hides rules).

### 8.8 Roads and Logistics (Exact Model)
Open question: “What do roads do besides movement speed?”

Default answer: roads are infrastructure that binds the empire.

Road tiers (tunable):
- Path (early): reduces movement cost by 1 on road tiles (minimum 1)
- Road (mid): further reduction; increases trade route safety
- Rail (late): major movement/logistics boost; expensive maintenance

Connection:
- A city is “connected to capital” if a continuous road/sea-lane path exists.
- Connection grants:
  - a maintenance reduction and/or stability bonus (see state capacity section),
  - and improves trade yields.

UI requirements:
- City banner shows connected/unconnected status with a tooltip explaining exact effects and how to fix it.

### 8.9 Open Questions → Defaults (Answered)
**Q: Do we allow forest chop / instant production bursts?**
- Default: no large early “chop burst” economy; long-term improvement value (lumber) should matter (aligned with `SULLA_ANALYSIS.md`).

---

## 9) Great People + Wonders (Milestones That Feel Like Chapters)

### 9.1 Wonders
Wonders should be:
- visible races,
- strategic commitments,
- identity statements.

Design requirement:
- wonders must be “big enough to feel,” not tiny hidden percentages.

### 9.2 Great People
Great People should:
- be earned via transparent point sources,
- offer a small set of powerful, directional actions,
- and create story beats (breakthroughs, institutions, cultural works).

Breakthroughs are a key synergy with tech variety:
- Great People can fill missing tech gaps in a controlled, story-driven way.

### 9.3 Great People Categories and Point Sources (Concrete Model)
Open question: “How are Great People earned without RNG?”

Default answer: city buildings and projects generate category points; thresholds recruit.

Suggested categories:
- Scientist, Engineer, Merchant, Artist, Diplomat, Prophet (if religion exists)

Point sources (examples):
- Library/University: Scientist points
- Workshop/Foundry: Engineer points
- Market/Exchange: Merchant points
- Theatre/Archive: Artist points
- Embassy/Forum: Diplomat points
- Shrine/Temple: Prophet points

Recruitment:
- Each category has a `points_required` threshold.
- When reached, the player recruits the next Great Person in that category (choice from 2–3 candidates).

UI requirements:
- Show per-city point generation breakdown.
- Show category progress bars and next candidates (names/actions).

### 9.4 Great People Cost Curve
Open question: “How do we prevent infinite Great People snowball?”

Default answer:
- Each recruitment increases the next threshold:
  - `next_required = base + (recruited_count * step)`
  - or multiply by a modest factor (using basis points).

Design rule:
- Great People should be powerful, but they must compete with other investments (buildings, army, wonders).

### 9.5 Great People Actions (Examples)
Open question: “What do Great People do that creates ‘chapter’ moments?”

Default: each Great Person offers 2–3 actions, all previewed and directional.

Examples:
- Scientist:
  - “Breakthrough”: grant a missing tech (if any) or a large research boost toward current tech.
  - “Found Academy”: place a unique building that boosts science and generates future points.
- Engineer:
  - “Rush Wonder”: add production to a wonder build.
  - “Infrastructure Plan”: instantly complete one improvement repair + add maturity progress in a city.
- Merchant:
  - “Trade Charter”: +trade capacity for 30 turns and a one-time gold infusion.
  - “Market Network”: establish a protected trade route with reduced pillage risk (tunable).
- Diplomat:
  - “Treaty Architect”: improve acceptance of one treaty type and reduce reputation penalties for a duration.
  - “Council Maneuver”: gain influence/votes in the next council session.

### 9.6 Wonders (Rules and Visibility)
Open question: “How do wonders create races without frustrating secrecy?”

Default answer:
- Wonders are globally unique.
- Building a wonder is visible to:
  - your own empire always,
  - other empires if they have sufficient diplomatic visibility (trade, embassy, espionage later),
  - otherwise as “rumors” (optional) with partial certainty.

Wonders should have:
- hard requirements (tech, city size/institution slots, terrain/resource),
- large, identity-defining effects,
- and chronicle events on start/finish/loss.

### 9.7 Open Questions → Defaults (Answered)
**Q: Can wonders be captured?**
- Default: yes, but captured wonders may have:
  - reduced effectiveness during occupation,
  - and may create diplomatic/religious backlash (story stakes).

---

## 10) Diplomacy, Influence, and the Progression of International Politics

### 10.1 Diplomacy Must Be Math + Gravitas
Per `GAMEPLAY_SPEC.md`:
- every modifier is visible,
- every action previews consequences,
- reputation persists.

### 10.2 Treaties, Timers, and “One More Turn”
Diplomacy is a progression system when it has:
- treaty durations,
- expiring agreements,
- escalating obligations,
- and meaningful renewal choices.

These create natural “just one more turn” moments:
- “Next turn the treaty expires; will they renew?”
- “In 3 turns the council votes.”

### 10.3 Influence (Optional, High-Leverage)
If diplomatic victory exists, introduce an Influence resource:
- earned via diplomacy buildings, agreements, and great people,
- spent on council votes and international actions.

Keep it transparent and avoid hidden modifiers.

### 10.4 Minor Powers / City-States (Optional, If They Add Stories)
Minor powers can be a high-leverage storytelling system when they:
- create contested objectives on the map,
- provide distinct rewards (not just generic yields),
- and generate diplomatic dilemmas (who you protect, who you anger).

If included:
- keep the number small,
- keep their rules transparent,
- and avoid turning them into quest spam.

### 10.5 Relationship Model (Exact, Transparent)
Open question: “What is ‘diplomatic attitude’ mechanically?”

Default answer: a visible score composed of named modifiers.

For each pair of empires:
- `relation_score` ranges from `-100..+100`.
- `relation_score = clamp(sum(modifiers), -100, 100)`

Modifier examples (illustrative):
- +10 “Active trade routes”
- +8 “Shared religion / doctrine”
- +6 “Mutual enemy”
- -12 “Border encroachment”
- -20 “Broke treaty”
- -15 “Captured our city”
- -8 “Different ideology” (if applicable)

Decay rules:
- Some modifiers decay per turn (e.g., border incidents).
- Some decay only on peace or never (e.g., broke treaty, razed cities).

UI requirements:
- The diplomacy screen shows the full modifier stack and previews deltas for actions.

### 10.6 Treaty and Agreement Catalog (v1 Target)
Open question: “Which diplomatic instruments matter most for ‘one more turn’ pacing?”

Default answer: treaties with timers, obligations, and clear break penalties.

Suggested v1 set (tunable durations):
| Instrument | Duration | Core Effect | Breaking Penalty |
|-----------|----------|-------------|------------------|
| Peace Treaty | 10 | ends war; no-declare window | severe reputation hit |
| Non-Aggression Pact | 20 | no-declare, border tension reduced | large reputation hit |
| Open Borders / Transit | 20 | movement rights, trade boost | medium reputation hit |
| Research Agreement | 30 | shared science boost | large reputation hit |
| Cultural Exchange | 20 | culture/influence boost | medium reputation hit |
| Defensive Pact | 30 | auto-joins defensive wars | huge reputation hit |
| Embargo | 20 | blocks trade with target | reputation impact varies |

Design rule:
- Every treaty must be previewable: “If you sign this, you gain X and commit to Y.”

### 10.7 War Goals and Peace Terms (Campaign Structure)
Open question: “How do we make wars feel like campaigns, not endless grinding?”

Default answer: war declarations include a war goal, and peace terms are structured.

War goal examples:
- **Seize Territory**: target city/region; reduced weariness if goal achieved.
- **Secure Resource**: target resource region; peace terms favor resource concessions.
- **Punitive War**: force reparations; limited territorial claims.
- **Liberation** (if minors/city-states exist): restore an ally; diplomacy rewards.

Peace terms (v1 target):
- cede city (or return city),
- gold reparations (lump + per-turn),
- forced treaty (open borders, embargo, pact),
- influence/vote concessions (if council exists),
- recognition/guarantee (no-declare window).

UI requirements:
- “Declare War” screen previews:
  - immediate reputation deltas,
  - expected war weariness pressure,
  - and how allies/rivals will respond.

### 10.8 Influence and Council Sessions (If Diplomatic Victory Exists)
Open question: “How do we make diplomacy a progression ladder, not just vibes?”

Default answer: a periodic council with explicit vote math.

Core model (tunable):
- Influence is a spendable resource.
- A “council session” occurs every `council_period_turns = 25` turns after a trigger tech/civic.
- Each session presents a small set of resolutions (2–4).

Votes:
- Each empire has a baseline vote weight (e.g., population-based) plus influence spending.
- Influence spent is visible and committed until the session resolves.

Diplomatic victory (one recommended structure):
- Each council session includes (sometimes) a “World Leader” vote.
- Winning votes grants **Diplomatic Victory Points** (DVP).
- First to `DVP_target` wins (e.g., 20; tunable).

Design rules:
- The UI must show the vote threshold and current DVP progress at all times.
- Backstabs must be legible (treaty breaking penalties previewed).

### 10.9 Open Questions → Defaults (Answered)
**Q: Are there hidden diplomacy modifiers?**
- Default: no. If a modifier exists, it is visible (with an optional “immersion mode” that hides numbers but not causes).

---

## 11) Victory Progression (Endgames That Don’t Become Waiting)

### 11.1 Domination
Domination is about:
- logistics + supply,
- economic disruption (trade/pillage),
- and diplomatic fallout.

Default victory condition:
- **Control all capitals** (capture and hold every rival capital simultaneously).

Rules (tunable):
- Capitals are designated at founding (first city) or at game start.
- If a capital is razed (if razing exists), the next-largest city becomes the capital (or razing capitals is disallowed).
- Holding capitals matters (not just capturing once), so counterattacks create stories.

### 11.2 Science (Project Race)
Open question: “What is the science endgame structure?”

Default answer: a multi-stage project race with map-visible vulnerability.

Design goals:
- Science victory is not “research and wait.”
- It creates:
  - production commitments,
  - strategic targets (launch sites, key cities),
  - and counterplay (raids, sabotage later, invasion).

Recommended stage structure (illustrative; names not final):
1. **National Program** (tech-gated):
   - Requirement: build advanced science institutions in N cities (default `N=3`), or complete “Research Initiative” projects.
2. **Launch Complex** (wonder-like project):
   - Requirement: build a unique “Launch Complex” in one city (one per empire).
   - Counterplay: if the city is captured, the complex is disabled until occupation ends (tunable).
3. **Mission Components** (parallelizable):
   - Build 3–5 components (e.g., Drive, Habitat, Navigation, Life Support).
   - Components can be built in any city, but the final assembly requires the Launch Complex city.
4. **Final Launch**:
   - A final timed project that can be disrupted by war pressure and supply strain.

UI requirements:
- The victory screen lists:
  - all stages,
  - exact requirements,
  - your progress and rivals’ known progress (based on visibility).

### 11.3 Culture
Open question: “How do we define culture victory concretely without copying Civ systems?”

Default answer: a transparent “cultural influence over rivals” model that is driven by:
- cultural output,
- works/wonders,
- and diplomatic contact (routes/treaties/open borders).

Core counters (per empire):
- `lifetime_culture`: sum of culture produced over the game (i32).
- `cultural_export`: derived output used to influence others (i32, shown in UI).

Per rival pair (A influencing B):
- `influence_over[B]`: accumulated influence points (i32).

Each turn:
- B increases `lifetime_culture += culture_per_turn`.
- A increases `influence_over[B] += (A.cultural_export * contact_multiplier_bp) / 10000`

Contact multipliers (examples, tunable, all visible):
- +2500 bp (25%) if open borders
- +2500 bp if an active trade route exists
- +2500 bp if a cultural exchange treaty exists
- +1000 bp if shared religion/doctrine exists
- -5000 bp if at war (reduced cultural exchange)

Dominance condition (default):
- A is culturally dominant over B when:
  - `influence_over[B] >= B.lifetime_culture`
- Culture victory when dominant over all major rivals.

Why this works:
- Strong rivals resist naturally by producing more culture (higher `lifetime_culture`), but victory remains possible with enough export and contact.
- The system creates diplomacy and war stories (routes, borders, treaties matter).

### 11.4 Diplomacy (Optional)
Diplomacy victory works best when it is:
- a visible vote math problem,
- driven by explicit alliances and obligations,
- and fueled by an Influence resource that is earned and spent transparently.

If included:
- define “council sessions” on a schedule,
- define how votes are earned (alliances, minor powers, treaties),
- and make backstabbing legible (reputation consequences are previewed).

### 11.5 Time/Score (Backstop)
Time/score exists to prevent endless stalemates and to support competitive formats.

Default time limit options (tunable):
- Standard: 300 turns
- Quick: 200 turns
- Marathon: 500 turns

Score (must be fully transparent):
- Score is a weighted sum of:
  - population,
  - cities (with diminishing returns),
  - techs/civics completed,
  - wonders,
  - territory controlled,
  - and victory progress (science/culture/diplomacy milestones).

UI requirement:
- The score breakdown is always visible and explains itself.

---

## 12) Content Scope Guidelines (So This Ships)

“Comprehensive system” does not mean “infinite content at launch.”

Recommended launch targets (v1):
- 8–12 civilizations with real identity packages
- 60–80 techs (enough for branching and variety)
- 30–40 policies across 4–6 trees (with tenure)
- 15–20 unit types (clear combined arms)
- 25–35 buildings (city specialization coverage)
- 20–25 wonders (race moments)
- 10–15 improvements (with tier maturation)
- Religion: either v1 “light” (passive model) or v2 (if it risks scope)

### 12.1 Open Questions → Defaults (Answered)
**Q: What is “must ship” for the core loop to feel complete?**
- Tech + city production + combat preview + diplomacy transparency (baseline).
- At least one additional “progress promise” system beyond Civ 5 baseline:
  - maturing improvements (recommended must-ship),
  - and/or tenure policies (recommended must-ship).

**Q: What is explicitly deferred to avoid scope traps?**
- Deep espionage systems (v2).
- Complex religious unit gameplay (v2; keep religion passive in v1).
- Large quest systems for minors/city-states (v2; if included, keep minimal).

---

## 13) Data-Driven Design (Implementation-Friendly)

Per `IMPLEMENTATION_SPEC.md`, these systems should be data-defined where possible:
- techs, units, buildings, improvements, policies, beliefs

Recommended data files (illustrative):
- `terrain.yaml`
- `resources.yaml`
- `improvements.yaml`
- `units.yaml`
- `buildings.yaml`
- `wonders.yaml`
- `techs.yaml`
- `policies.yaml`
- `governments.yaml` (if governments are data-driven)
- `religions.yaml` / `beliefs.yaml` (if religion is included)

Design rule:
- every content item must declare:
  - unlock prerequisites,
  - yields/effects (integer math),
  - and UI strings needed to explain itself.

Design rule:
- if something affects gameplay, it must be representable as:
  - a requirement,
  - an effect,
  - or a state transition that can be replayed deterministically.

### 13.1 Schema Outlines (v1 Target)
Open question: “What data do we need to express these systems?”

Default answer: keep schemas minimal and composable: `requirements + effects + tags`.

Illustrative schema requirements (not final format; align with `IMPLEMENTATION_SPEC.md` loaders):

- **Tech**
  - `id`, `name`, `field`, `era`, `cost`
  - `prerequisites: [tech_id]`
  - `tags: [critical_*, optional_*]`
  - `unlocks: { units: [], buildings: [], improvements: [], wonders: [], treaties: [] }`

- **Policy**
  - `id`, `name`, `tree`, `tier`
  - `description`
  - `requirements`
  - `effects`
  - `exclusive_with: [policy_id]` (optional)

- **Government**
  - `id`, `name`
  - `requirements` (tech/civic)
  - `slots: { civic: n, economic: n, military: n, religious: n, diplomatic: n }`
  - `modifiers` (admin/supply/stability, as effects)

- **Unit**
  - `id`, `name`, `class`, `era`
  - `stats: { attack, defense, hp, moves, range? }`
  - `cost`, `maintenance`
  - `tech_required`
  - `resource_requirements` (build/maintain)
  - `upgrade_to` (optional)
  - `tags` (melee/ranged/siege/etc)

- **Building**
  - `id`, `name`, `family`, `tier`
  - `cost`, `maintenance`
  - `tech_required`
  - `requirements` (terrain/resources/population/government)
  - `effects`
  - `slot_type: infrastructure|institution`
  - `exclusive_group` (optional)

- **Improvement**
  - `id`, `name`
  - `valid_terrain`, `valid_features`, `resource_required?`
  - `build_turns`, `repair_turns`
  - `tiers: [{ turns_worked, yields/effects }]`
  - `pillage_behavior` (default: tier_down_1)

- **Resource**
  - `id`, `name`, `category: bonus|luxury|strategic`
  - `revealed_by_tech` (optional)
  - `extracted_by_improvement` (optional)
  - `effects` (amenities, unit enabling, etc)

- **Religion/Belief** (if included)
  - `religion_id`, `name`, `symbol`
  - `belief_slots` definitions and allowed beliefs
  - `belief` items: `id`, `name`, `slot_type`, `effects`, `requirements`

Design rule:
- Every schema element must be fully explainable in UI:
  - include `description` fields and “why locked” error messages.

### 13.2 Open Questions → Defaults (Answered)
**Q: Do we hardcode anything?**
- Default: only engine invariants (determinism rules, core processing order). All content and most balancing values are data-driven.

---

## 14) Chronicle Hooks (Making Progress Retellable)

Per `STORYTELLING_DESIGN.md`, major progression beats should emit chronicle events:
- tech completed,
- policy milestone chosen,
- government reformed,
- religion founded/reformed,
- wonder started/completed/lost,
- great person recruited/used,
- war declared/peace signed (with terms),
- improvement tiered up (aggregated by city).

This is how the game becomes “tellable,” not just “winnable.”

### 14.1 Chronicle Goals (What It Must Do)
Open question: “What does the chronicle exist for?”

Default answer:
- Make the game retellable (“what happened and why?”).
- Support replays and debugging (especially with determinism requirements).
- Provide pacing reinforcement (milestones feel like chapters).

Minimum UI:
- A timeline list with filters (wars, tech, wonders, diplomacy, cities).
- Clicking an event jumps the camera to the location and opens the relevant breakdown UI.

### 14.2 Chronicle Event Schema (Design-Level)
Open question: “What data should each chronicle event contain?”

Default answer: keep events small, typed, and linkable to game objects.

Each event should include:
- `turn`
- `event_type`
- `primary_actor` (player)
- `location` (if relevant)
- `summary_text` (one line)
- `details` (structured fields for UI)

Examples:
- `TECH_COMPLETED`:
  - `tech_id`, `unlocks[]`
- `POLICY_CHOSEN`:
  - `policy_id`, `tree`, `tenure_reset?`
- `GOVERNMENT_REFORMED`:
  - `old`, `new`, `reform_cost`
- `RELIGION_FOUNDED`:
  - `religion_id`, `beliefs[]`
- `WONDER_STARTED/COMPLETED/LOST`:
  - `wonder_id`, `city_id`, `rival_id?`
- `WAR_DECLARED/PEACE_SIGNED`:
  - `target_player`, `war_goal`, `terms[]`, `reputation_deltas`
- `IMPROVEMENT_TIERED_UP` (aggregated):
  - `city_id`, `improvement_id`, `count`, `new_tier`

### 14.3 Replay Integrity Hooks (Determinism Support)
Open question: “What must we record to replay a game exactly?”

Default answer:
- world generation seed
- ruleset hash/version
- ordered command log (player inputs)
- and any RNG draws (if any) as part of the deterministic RNG stream

The chronicle doesn’t replace the replay log, but it gives the replay meaning and navigation.

### 14.4 Open Questions → Defaults (Answered)
**Q: Does the chronicle include private information?**
- Default: chronicle has two views:
  - player view (fog-respecting),
  - and omniscient replay/debug view.
