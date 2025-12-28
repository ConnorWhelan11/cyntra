# Backbay Imperium — Gameplay + Vibe Specification

> This document specifies **player-facing gameplay** and the intended **tone/vibe**.
> It complements:
> - `DESIGN_LAWS.md` (pillars + non-negotiables)
> - `CORE_FEATURES_AND_PROGRESSION.md` (core systems + progression details)
> - `STORYTELLING_DESIGN.md` (emergent narrative + retellability principles)
> - `IMPLEMENTATION_SPEC.md` (engine + determinism constraints)
> - `SULLA_ANALYSIS.md` (ideas that improve “modern Civ 5” gameplay)

---

## 0) Game Identity (What It Feels Like)

**Backbay Imperium** is a turn-based 4X on a single contiguous hex map from “Ancient” to “Modern/Future,” aiming for the **clean strategic readability** and **intellectual tone** associated with Civ 5—without copying its IP, assets, or exact presentation.

### Non-Negotiables (Pillars, Restated)
- **One map, one ruleset, one mental model.** No mode switches into separate battle screens or era mini-games.
- **Readable tactical combat.** 1UPT for military units, visible ZOC, and a combat preview that’s never wrong.
- **Meaningful macro decisions.** Expansion, research, policy, diplomacy, and victory paths force real tradeoffs.
- **UI explains everything.** Numbers always have breakdowns; diplomacy is explicit; lenses are first-class.

### The “Modern Civ 5” Target
- **Intellectual, not cartoony.** The game treats systems and history (real or fictional) with seriousness.
- **Classical + modern blend.** Marble/brass/ink aesthetics fused with modern information design.
- **Strategic calm, tactical tension.** Long-term planning with punctuated moments of tactical clarity.

---

## 1) Player Fantasy + Core Loop

### Player Fantasy
You are the architect of an empire: deciding *where to grow*, *what to become*, and *who to trust*—while the map itself remains the consistent stage for every choice.

### Core 4X Loop (Turn to Turn)
1. **Explore**: reveal fog, locate resources/chokepoints, meet rivals.
2. **Expand**: found cities, claim territory, establish borders and trade routes.
3. **Exploit**: improve tiles, specialize cities, scale science/culture/economy.
4. **Exert**: use diplomacy and force to shape the balance of power.

### The “Decision Cadence” Goal
Every ~3–5 turns, the player should face a meaningful choice:
- a city specialization pivot,
- a risky settlement,
- a policy lock-in,
- a diplomatic commitment,
- or a military engagement with clear stakes.

### Session Arc (Ancient → Modern/Future, One Continuous Game)
**Early game** (first ~80 turns):
- Explore rapidly, identify a defensible core, found 2–4 cities, and establish an initial doctrine (research + policy).
- Early war is about **positioning and opportunity cost**, not unit spam.

**Mid game**:
- Borders harden, infrastructure and institutions matter, diplomacy becomes binding, and wars are decided by logistics (roads, supply, reinforcements).
- Tile improvements reaching higher tiers become a major source of advantage (and a major vulnerability).

**Late game**:
- Administration “catches up” (lower instability), enabling big empires to feel big without arbitrary penalties.
- Victory paths become explicit project races (science), influence contests (culture/diplomacy), or decisive wars (domination).

### Default Success Shape: “Empire Should Feel Big”
Backbay Imperium is designed so that:
- **Wide play is the normal end state**, not a punished deviation.
- Tall/small play is possible but must leverage sharper specialization and diplomacy (intentionally harder).
- Expansion pressures come from *real tensions* (maintenance, stability, defense, war weariness), not hidden multipliers.

---

## 2) Turn Structure + Pacing

### Turn Phases (Single-Player Baseline)
**Start of Turn (Resolution + Prompts)**
- Upkeep: maintenance, supply, instability/war weariness tick, expirations.
- Refresh: unit movement/actions, city production progress, growth progress.
- Notifications: “needs orders” units, finished builds, completed research, diplomatic messages.

**Player Actions (Unlimited Think Time)**
- Move units, attack, fortify, set multi-turn orders (goto/patrol/automate).
- Manage cities: production queue, citizen assignment, purchases, specialists.
- Choose research and policies; execute diplomacy; initiate trades; declare war/peace.

**End Turn**
- Validate no “hard blockers” (e.g., unit requires mandatory order) unless player overrides.
- Process end-of-turn simulation deterministically; emit events for UI.

### Multiplayer Turn Model (Target)
Simultaneous turns with **server-authoritative deterministic sim**:
- Players issue commands during a turn window.
- Conflicts resolved by stable ordering rules (documented and visible in replays).
- Hot-join/reconnect via snapshots.

### The “Turn 80 Test” (From `DESIGN_LAWS.md`)
By ~turn 80, the player should have:
- 3–4 cities (or a deliberate tall choice),
- fought at least one battle,
- researched ~10 techs with branching choices,
- built (or lost) a wonder race,
- and formed a clear strategic direction.

---

## 3) The World Map (Terrain, Fog, Ownership)

### Hex Map Basics
- **Wrap**: horizontal wrap (recommended), no vertical wrap.
- **Tiles**: terrain + features + improvements + ownership + visibility state.
- **Lenses**: yield, strategic resources, diplomacy/borders, military threat, stability/amenities.

### Visibility / Fog of War
Each tile is in one of:
- **Unexplored**: unknown terrain/resources.
- **Explored**: known terrain, last-seen info only.
- **Visible**: current truth (units/cities/improvements shown).

### Territory and Borders
- Cities project borders that define:
  - which tiles can be worked,
  - where improvements can be built,
  - and where diplomatic violations occur (trespass, pillage, etc.).
- Border expansion is driven by **culture/influence** and/or specific buildings/policies.

### Resources (Design Targets)
Split resources by gameplay role:
- **Luxuries**: drive amenities/stability and diplomacy leverage.
- **Strategic**: unlock/maintain unit lines (iron, oil equivalents; names TBD).
- **Bonus**: modest yield boosts that guide city placement without deciding it alone.

All resource rules must be **UI-visible**: where it is, what it does, why it matters now.

### Exploration Content (Discoveries + Neutral Pressure)
Exploration needs both *rewards* and *pressure* so early turns aren’t empty.

**Discoveries (one-time rewards)**
- “Sites” (ruins/archives/shipwreck equivalents): grant a clear, immediate boon (gold, map reveal, science/culture burst, a unit promotion).
- Natural wonders: unique tiles that create settlement magnets and mid-game border tension.

**Neutral pressure**
- Independent camps/raiders (barbarians equivalent) that:
  - spawn in fog,
  - threaten improvements and trade routes,
  - and create the first “Turn 80” battle reliably.
- Clearing camps is rewarded and produces strategic breathing room.

### Map Generation (Gameplay Requirements)
- Starts must be:
  - **playable** (access to food + production),
  - **distinct** (not identical yield soups),
  - and **strategically biased** (some players have coast, some have chokepoints, etc.).
- Resource placement should create trade incentives (no player should naturally have everything).

---

## 4) Units + Movement (Low Micro, High Clarity)

### Unit Categories
- **Civilian**: settlers, workers/engineers, traders, diplomats (usually stackable).
- **Military**: melee, ranged, cavalry, siege (1UPT).
- **Naval/Air** (later): same clarity rules; minimal special cases.

### Movement and Orders
Units have movement points per turn. Core UX:
- Click-to-move with a **previewed path** and **previewed remaining movement**.
- Multi-turn “goto” orders with:
  - a visible path line,
  - interruption rules (enemy sighting, ZOC, blocked tile),
  - and explicit “order canceled because…” messages.
- Quality-of-life: cycle idle units, map pings, contextual right-click actions.

### Stacking Rules
- **Military**: 1 per tile (hard rule).
- **Civilian**: may share tiles with military; may share with civilian where sensible.
- **Cities**: support garrisons and defensive positioning.

### Supply / Unit Spam Control (Recommended)
To keep 1UPT readable, use a transparent supply system:
- Each empire has a **Supply Cap** (shown in top bar) derived from population + government.
- Units above cap incur explicit penalties (maintenance multiplier and/or stability hit).
- The UI warns before building a unit that will exceed supply.

### Low-Micro Army Handling (Civ 5 “Flow” Without Stacks)
We want the strategic flow of moving armies without the unreadable mess of a unit carpet.

Required UX features:
- **Multi-select and group move** (issue one move order to N units with path previews per unit).
- **Rally points** for cities (new units move to a designated staging tile automatically).
- **Frontline summaries** (optional lens): “units near this border,” “threat level,” “reinforcement ETA.”
- **Automation that doesn’t hide rules**:
  - auto-explore (scouts),
  - auto-garrison (send unit to nearest city needing defense),
  - auto-continue-goto after interruptions (with clear prompts).

---

## 5) Combat (Main-Map Tactics That Explain Themselves)

### Core Combat Principles
- The player should be able to look at the map and answer:
  - “Why can/can’t I attack?”
  - “Why is this outcome likely?”
  - “What can I do to improve it?”

### Engagement Model (High-Level)
- **Melee**: adjacent attacks; may capture/occupy a tile on victory.
- **Ranged**: attacks from distance; line-of-sight rules are explicit and previewed.
- **ZOC**: military units project ZOC; entering ZOC ends movement (unless rules specify otherwise).
- **Fortification**: a stance that trades mobility for defense; visually obvious.

### Modifiers (All Visible, No Hidden Math)
Common modifiers:
- Terrain defense bonus (e.g., hills)
- River crossing penalty
- Flanking bonus per adjacent allied military unit
- Fortification bonus that grows with turns spent fortified
- Unit-vs-unit class bonuses (spears vs cavalry style)

### Combat Preview (Non-Negotiable UX)
Before committing:
```
ATTACK PREVIEW
Your unit:  HP 85  → ~62    Win: 78%
Enemy unit: HP 100 → 0      Lose: 22%

Modifiers
 +20% Flanking (2 adjacent allies)
 -25% River crossing
 +50% vs Ranged
```
Requirements:
- Preview uses the exact same rules as resolution.
- Hovering each modifier explains its source and how to change it.

### City Combat (Design Target)
Cities defend in a way that:
- makes early rushes possible but risky,
- makes walls meaningful,
- and keeps siege readable without turning into opaque attrition.

Minimum expectations:
- City HP/defense value, modified by buildings (walls, garrison).
- City ranged strike (if present) is previewed and explains damage.

### Experience + Promotions (Tactical Personality, Not Hidden Power)
- Combat grants XP; XP grants promotions as explicit, chosen upgrades.
- Promotions must:
  - be understandable at a glance (no “+5% somewhere” without context),
  - be previewed in combat (the preview includes the promotion modifier),
  - and create unit identity (a veteran guard unit plays differently than a fresh one).
- Promotion trees should be shallow, with meaningful branch choices (avoid grindy +1% ladders).

### Retreat, Zone Control, and “Why Did That Happen?”
If the rules allow retreats/withdrawals:
- the UI must show whether withdrawal is possible and the exact probability (or deterministic rule).
- any forced-move or ZOC stop must surface as an explicit event (“Movement stopped: entered enemy ZOC”).

---

## 6) Cities (The Main Strategic Object)

### Founding + Placement
Founding a city is always a meaningful choice because it sets:
- borders and map control,
- long-term economic identity,
- and your administrative burden (see State Capacity below).

City placement UI must show:
- local yields (immediate and with early improvements),
- nearby resources,
- river/coast/fresh-water effects,
- and strategic posture (defensibility, chokepoints).

### City Growth and Working Tiles
- Population determines how many tiles are worked.
- Citizens can be auto-assigned, with manual override.
- The city center always yields a base package; worked tiles add on.

### City Yields (Recommended Set)
Keep the primary yields small and legible:
- **Food**: growth
- **Production**: build speed
- **Gold**: maintenance + purchasing + diplomacy
- **Science**: research progress
- **Culture/Influence**: policies + borders + soft power

Optional secondary meters (only if they create decisions, not chores):
- **Amenities / Stability**: governs expansion and war pressure
- **Faith / Religion** (future)

### Production and Purchasing
- Cities have a build queue (units/buildings/wonders/projects).
- Gold purchasing is allowed, with:
  - clear conversion rates,
  - escalating costs for rush,
  - and warnings when it hurts long-term economy.

### City Screen UX (Minimum Viable “Civ 5 Clarity”)
The city screen should answer three questions instantly:
1. **What am I producing and when will it finish?**
2. **Where are my yields coming from?**
3. **What is the best next improvement here (and why)?**

Required UI elements:
- Worked-tile view with per-tile yields and improvement tiers.
- A yield breakdown panel (hoverable deltas if you change assignments).
- Production queue with overflow visibility and “gold to finish” preview (if allowed).
- Citizen assignment controls with:
  - “auto” mode that is explainable (“optimized for food” / “optimized for production”),
  - and manual lock overrides.

### City Specialization (What “Good Play” Looks Like)
We want players to make cities that feel distinct:
- academic capitals that accelerate science/policies,
- industrial hubs that produce armies and wonders,
- trade ports that fund everything,
- frontier bastions that hold borders.

The UI should explicitly label what a city is “best at” and why.

---

## 7) Expansion Economics via State Capacity (Sulla-Inspired)

### Goal
Expansion should feel **rewarding** and **empire-scale should be normal**, but early sprawl should create real strategic tension without arbitrary “empire size” punishment multipliers.

### The Core Mechanic: City Maintenance With Instability
Every city has a transparent maintenance breakdown:
- **Base**: fixed cost for having a city.
- **Distance**: cost scaling with distance from capital (or nearest administrative center).
- **Instability**: a per-city cost that starts high early and drops as government improves.

Example UI breakdown:
```
CITY MAINTENANCE: 14 gold/turn
├─ Base: 5
├─ Distance to Capital (6 tiles): 6
└─ Instability (current): 3
```

### How Instability Evolves
- Instability starts high in the early game (representing low state capacity).
- Government techs and policies reduce it over time.
- Late-game empires feel like they can administratively support more cities.

### Why This Feels Better Than “City Count Penalties”
Players experience growth as:
- “I built institutions that let me govern more,”
not:
- “the game raised my research costs because I dared to expand.”

### Gold Economy (Clear Sources, Clear Sinks)
Gold should rarely be “just a number”; it should be the pressure valve that enables (or blocks) strategic pivots.

**Common sources**
- City yields (worked tiles + buildings)
- Trade routes (especially external)
- Deals (resource trades, payments)
- Events (clearing camps, quests, discoveries)

**Common sinks**
- City maintenance (base + distance + instability)
- Building maintenance (small but meaningful)
- Unit maintenance and supply-over-cap penalties
- Purchases/rushes (deliberate tradeoff vs infrastructure)

All of the above must appear in a top-level breakdown (no invisible drains).

### Trade Routes (Leverage + Vulnerability)
Trade routes exist to:
- connect your empire (internal growth/production routes),
- and create diplomacy incentives (external gold/science/culture routes).

Design targets:
- Limited trade capacity (routes are a strategic resource).
- Routes are **pillageable**, making border control and escorts meaningful.
- The trade UI shows:
  - best route options with yield breakdowns,
  - route risk (threat level along path),
  - and diplomatic consequences (who benefits, who is offended).

### Stability / Amenities + War Weariness (Pressure That Creates Decisions)
If the game includes a happiness-like system, it must:
- be legible (city-by-city causes and fixes),
- create choices (not just chores),
- and interact with expansion and war.

Recommended interactions:
- Long wars increase war weariness, reducing stability/amenities and pressuring peace.
- Rapid expansion strains stability unless institutions keep up (reinforcing state capacity).
- High stability is a meaningful “green zone” that rewards good planning (small yield bonuses).

---

## 8) Tile Improvements That Mature (The “Defend Your Economy” Loop)

### Design Goal
Improved tiles should feel *worth fighting for*, and the countryside should be an economic battlefield—not just the cities.

### Improvement Tiers
Most improvements have **tiers** that mature when worked over time:
- Tier 1: immediate, modest benefit.
- Tier 2: meaningful mid-term payoff.
- Tier 3: long-term investment that creates real value.

Maturation rules (recommended baseline):
- +1 tier after N “worked turns” by a city (not just existing on the map).
- Pillaging reduces tier (recommended: -1 tier per pillage) and disables yields until repaired.

### Why This Improves Gameplay
- Pillaging creates meaningful raids and counterplay.
- Tall cities with long-developed hinterlands can rival “fresh” wide expansion.
- Border defense becomes economically motivated, not purely military.

### UI Requirements
- Tiles show improvement tier at a glance (badge, pips, or outline).
- Tooltips show:
  - current tier yield,
  - turns worked toward next tier,
  - and what happens if pillaged.

### Worker/Engineer Loop (Minimal Clicks, Maximum Impact)
Workers/engineers exist to create *strategic geography*:
- choosing which tiles to commit long-term investment into,
- shaping roads/logistics,
- and creating targets worth defending.

Design targets:
- Improvements are **few and legible** early, expanding over tech eras.
- Building an improvement should be a meaningful commitment (multi-turn), not spam-clicking.
- The UI should recommend improvements with explicit reasoning (“This city is production-starved; a mine here yields +2 production now and matures to +3.”).

### Roads, Connections, and Logistics
Infrastructure should matter for:
- reinforcement speed,
- trade route efficiency,
- and empire cohesion.

Road rules should be simple and previewable:
- Building a road shows expected movement benefit and maintenance (if any).
- A “connected to capital” indicator is visible for each city, with its effects.

---

## 9) Technology (Anti-Beeline, Story-Driven Progress)

### Goals
- Avoid “rote optimal beelines” that reduce strategic variety.
- Keep the tech UI legible and long-term plannable (no era resets).
- Make diplomacy, conquest, and espionage meaningful sources of knowledge.

### Recommended Default: Semi-Randomized Tech Availability
At game start:
- Each “field” (e.g., Military / Economy / Governance / Culture / Science) has a defined set of techs.
- A small portion (target 20–30%) are marked **Unavailable This Game**.
- Unavailable techs are visible but grayed out with a clear explanation.

Acquiring unavailable techs is possible via:
- **Trade** (knowledge exchange),
- **Espionage** (steal),
- **Conquest** (capture a city with key institutions),
- **Great People** (breakthroughs).

Multiplayer option:
- “All Techs Available” (competitive fairness).

### Research Sources (Simple + Transparent)
Science comes primarily from:
- population scaling (small, steady),
- and buildings/policies (big, directional).

The UI must always show:
```
SCIENCE: 45/turn
├─ Population: 12
├─ Buildings: 18
├─ Policies: 7
└─ Trade/Agreements: 8
```

### Tech Tree UX (Legible, Plan-Able)
The tech tree must support both:
- **local decisions** (“What do I need next?”),
- and **long-term intent** (“What am I building toward 30 turns out?”).

Minimum UX:
- A clear prerequisite graph with “why locked” tooltips.
- Era/field filters (to avoid visual overload).
- Tech previews that list exact unlocks (units/buildings/policies/improvements).
- If a tech is unavailable this game:
  - it remains visible (greyed),
  - lists allowed acquisition methods,
  - and shows which rivals currently possess it.

### Research Progress (No Dead Turns)
- Research overflow carries forward.
- If a player completes research but hasn’t selected the next tech:
  - the game pauses in a “research choice” prompt (no hidden default).

---

## 10) Policies + Government (Commitment With Tenure)

### The Problem We’re Solving
If policies are “pick once and forget,” they aren’t strategy. If swapping is free and constant, commitment is meaningless.

### Structure
- Policies live in mutually exclusive branches (commitment matters).
- Governments provide slots and core bonuses (administration, military, economy).

### Tenure Bonus (Sulla-Inspired)
Policies gain strength the longer they remain active:
- Tenure accumulates in turns and is summarized as “eras retained.”
- Swapping policies resets tenure (or applies a reform cost + partial reset).

This creates the desired tension:
- Adapt to circumstances (war, crisis) **vs**
- Keep a long-term doctrine for compounding power.

### Government as State Capacity
Government progression is the primary way to reduce instability maintenance and “unlock” comfortable wide play.

### Policy UX (Make Commitment Feel Real)
Policies should be:
- chosen with clear intent,
- hard to reverse casually,
- and easy to understand at a glance.

Minimum UX:
- A policy screen that shows:
  - current government,
  - active policies and their tenure,
  - locked-out branches (and why),
  - and the exact effects with breakdowns.
- Tenure is shown as a simple meter per policy (“Retained for 1 era / 2 eras…”).

### Switching Rules (No “Free Shapeshifting”)
To keep tenure meaningful, switching requires at least one:
- a reform cooldown,
- a reform cost (gold/stability),
- or a partial tenure reset (not full wipe for minor adjustments).

---

## 11) Diplomacy (Explain Everything)

### Design Goal
Diplomacy should feel like statecraft, not guesswork.

### Transparency Rules
- Every relationship has a visible numeric breakdown:
  - trade, treaties, border tension, ideology, war history, etc.
- Every action previews consequences:
  - reputation shifts,
  - likely AI response,
  - and who will be angered or pleased.

### Negotiation UX (Concrete, Previewed, Reversible)
Diplomacy should behave like a contract system:
- Deals have explicit terms, durations, and cancellation rules.
- The UI previews:
  - immediate outcome,
  - per-turn effects,
  - and relationship delta.
- Players should be able to “draft” a deal and see acceptance likelihood before committing.

### Reputation (A Long Memory, Not Random Mood Swings)
Actions that matter must leave visible, persistent traces:
- breaking treaties,
- surprise wars,
- razing cities,
- betraying allies.

These create modifiers that decay slowly (or never), visible in the relationship breakdown.

### Diplomatic Actions (Target Set)
- Trade deals (resources, gold, ongoing payments)
- Treaties (peace, mutual defense, transit rights)
- Agreements (knowledge exchange, cultural exchange)
- Threats and demands (with clear consequences)
- War/peace with explicit war goals and war weariness pressure

Optional (later): city-states / minor powers with unique roles.

---

## 12) Wonders + Great People (The Intellectual “Civ-Like” Charge)

### Wonders
Wonders are:
- visible race conditions (you can see who is building what, at least partially),
- strategic commitments (opportunity cost is real),
- and sources of identity (not just +5% bonuses).

### Great People
Great People exist to:
- punctuate the arc of a game with memorable moments,
- offer powerful but specific choices,
- and reinforce the “intellectual” tone (invention, philosophy, art, engineering).

The UI should present Great People as deliberate strategic tools, not RNG surprises.

Design targets:
- Great People are earned via transparent “points” sources (buildings, policies, wonders).
- When a Great Person is available, the UI shows:
  - the next candidates and their point progress,
  - what categories you’re generating,
  - and what actions each Great Person can take (with previews).
- Great Person actions should be “big and directional” (found an institution, trigger a breakthrough, establish a cultural work), not minor yield noise.

---

## 13) Victory Conditions (Commitment Required)

We want 3–4 victory paths that feel distinct and strategic:
- **Domination**: military superiority + logistics; diplomacy suffers.
- **Science**: research engine + protection; early aggression opportunity cost.
- **Culture/Influence**: sustained cultural investment + defense; production tradeoffs.
- **Diplomacy** (optional for v1): alliances, influence networks, global congress mechanics.

Also:
- **Score / Turn Limit** as a backstop.

### Domination (Map Control With Logistics Costs)
Win condition options (pick one early in design):
- Eliminate all rivals, **or**
- Control all “capitals,” **or**
- Control a threshold share of world population/territory.

Domination must emphasize:
- supply and reinforcement planning,
- economically meaningful wars (tile pillage, trade disruption),
- and diplomatic fallout that makes “easy conquest” hard.

### Science (Project Race)
Science victory should not be “research and wait.”
Design target:
- Multi-stage endgame projects that require:
  - specific tech milestones,
  - high production investment,
  - and protection (vulnerability invites counterplay).

### Culture / Influence (Soft Power, Not Passive Waiting)
Culture victory should be an interactive contest:
- influence spreads through routes, borders, wonders, and agreements.
- rivals can counter with:
  - cultural investment,
  - targeted wars/pillage against cultural infrastructure,
  - and diplomatic isolation.

### Diplomacy (Optional Launch Path)
If included:
- a global council/congress with explicit vote math,
- influence as a spendable diplomatic resource,
- and visible thresholds (“X votes needed to win in Y sessions”).

Each victory screen must show:
- the exact win condition,
- current progress,
- and what the player needs next.

---

## 14) AI Expectations (Competent, Legible, Not “Cheaty”)

### Difficulty Philosophy
- Higher difficulty primarily = smarter priorities and better tactical execution.
- If bonuses exist, they are disclosed (“AI has +20% production”).

### Information and Fairness Rules
- The AI should operate under the same core constraints as the player:
  - no invisible “perfect information” through fog of war unless explicitly disclosed,
  - no hidden immunity to stability/maintenance systems,
  - and no magic pathfinding exceptions (if it can’t fit, it can’t fit).
- If the AI does receive advantages (for difficulty), they should be framed as:
  - institutional head starts,
  - starting resources,
  - or disclosed yield bonuses (never “secret rules”).

### Personality Modes (Optional)
Offer AI personality policies:
- **Honorable**: stable treaties, lower betrayal probability.
- **Machiavellian**: opportunistic, will betray to win.
- **Principled/Historical**: personality-driven consistency.

The UI should explain *why* an AI is angry, not just that it is.

---

## 15) Vibe Specification (“Civ 5 Intellectual Classical Modern”)

### Tone: Serious, Curious, Humanist
Writing and presentation should feel like:
- an annotated atlas,
- a museum placard,
- a diplomatic cable,
- and a strategy manual—without becoming sterile.

### Visual Language: Classical Materials + Modern Information Design
- **Classical**: stone, marble, brass, ink, parchment textures (subtle, not noisy).
- **Modern**: clean grids, crisp icons, strong hierarchy, data-visualization clarity.
- **Map**: painterly terrain with restrained saturation; readable unit silhouettes; high contrast for lenses.

### UI Layout (A Strategic Dashboard, Not a Toybox)
The UI should feel like a well-designed instrument panel:
- A stable **top bar** for core yields + global meters (supply, stability, research).
- A **map-first** center view with lenses as the primary way to understand the world.
- Contextual **unit** and **city** panels that explain options (and why they’re disabled).
- Notifications that are actionable (“click to jump”) and don’t spam.

### Diplomacy Presentation (Gravitas + Math)
Diplomacy should have theatrical presence without becoming opaque:
- Distinct leader/representative presentation (portraits/scenes) to sell the fantasy.
- The relationship math is still front-and-center, layered as a readable breakdown.
- Voice/text should feel like diplomatic correspondence: formal, pointed, memorable.

### Typography (Guidelines)
- Headings: a dignified serif or semi-serif (classical weight).
- Numbers/UI labels: a modern sans for clarity.
- Avoid parody “roman” fonts; aim for premium editorial feel.

### UI Sound + Music
- UI sounds: restrained clicks, paper/ink cues, brass/wood accents.
- Music: orchestral + regional motifs, evolving by tech era.
- The game should feel calm during planning, tense during battles.

### Quotes and Civlopedia-Style Knowledge
- Techs, wonders, policies (and sometimes events) should have short quotes that fit the setting’s voice.
- A searchable in-game encyclopedia is part of the vibe:
  - mechanics explanations,
  - lore/history entries,
  - and “see also” links.

### Modern Convenience, Classical Gravitas
- Quick actions, hotkeys, lenses, and previews are modern.
- The language, pacing, and presentation are classical.

---

## 16) Accessibility + Quality-of-Life (Mandatory, Not “Polish”)

- Full key rebinding; common strategy hotkeys supported.
- Colorblind-safe palettes for lenses and player colors.
- “End turn” warnings are actionable (click to jump to problem).
- Automation for low-value actions (auto-explore, goto, auto-improve) without hiding rules.
- Tooltips always show both “what” and “why.”

---

## 17) Open Questions (To Resolve Early)

1. **Tech variety mechanism**: semi-random missing techs vs slider economy vs another anti-beeline system.
2. **City-states / minor powers**: include at launch or defer.
3. **Pillaging severity**: reset-to-tier-0 vs -1 tier per pillage (recommended).
4. **Supply tuning**: how strict is the cap, and what penalty feels best.
5. **Setting specifics**: what is “Backbay Imperium” in-fiction (alt-history, original world, era focus).
