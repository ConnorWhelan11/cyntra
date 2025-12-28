# Backbay Imperium — Technical Specification + Implementation Plan

> This document synthesizes the project’s design pillars, gameplay/vibe targets, and
> storytelling principles into an implementable technical spec and phased plan.
>
> Source-of-truth design docs:
> - `DESIGN_LAWS.md` (non-negotiable pillars)
> - `GAMEPLAY_SPEC.md` (gameplay + vibe)
> - `STORYTELLING_DESIGN.md` (emergent narrative + retellability)
>
> Companion design/production doc:
> - `CORE_FEATURES_AND_PROGRESSION.md` (resolved mechanics + tunables)
>
> Existing architecture/engine doc:
> - `IMPLEMENTATION_SPEC.md` (Rust/Godot architecture, determinism rules, protocol scaffolding)

---

## 0) Executive Summary

Backbay Imperium is a Civ-like 4X built around:
- **One map, one arc** from early to late game (no era resets, no battle sub-maps).
- **Readable tactical combat** (1UPT, visible ZOC, “preview that’s never wrong”).
- **Meaningful macro choices** (expansion, policy doctrine, diplomacy, victory commitment).
- **UI that explains everything** (breakdowns, lenses, action previews).
- **Systemic storytelling**: player-authored history, made retellable via a chronicle/timeline and deterministic replays.

Key differentiators (vs baseline Civ 5 loop) for “just one more turn”:
- Multiple interlocking progress ladders (tech + civics + maturing infrastructure + diplomacy timers).
- Map-visible stakes (maturing improvements + trade vulnerability) and a deliberate “promise strip” showing imminent completions.
- State-capacity expansion (maintenance breakdown) instead of arbitrary empire-size penalties.

---

## 1) Non-Negotiable Requirements (Acceptance Criteria)

These come from `DESIGN_LAWS.md` and are hard constraints on implementation.

### 1.1 One Map, One Ruleset, One Mental Model
- Same map from turn 1 to victory.
- No “tactical battle screen” mode switches.
- No era mini-games; tech is continuous with obsolescence, not resets.

### 1.2 Tactical Combat That’s Readable
- 1UPT for military units.
- Visible ZOC visualization and deterministic movement interruption rules.
- Combat preview uses the same rules as resolution; every modifier is visible and explainable.

### 1.3 Meaningful Macro Decisions
- Expansion is rewarding but constrained by real tradeoffs (state capacity, defense stretch, stability pressure).
- Policy/government choices create doctrine identity with commitment costs (tenure/reform).
- Victory paths require commitment and create counterplay (not passive waiting).

### 1.4 UI Explains Everything
- Every number has a breakdown.
- Every action previews consequences (combat, diplomacy, reforms, purchases).
- Lenses are first-class (yields, borders, resources, threats, religion, etc.).

### 1.5 “Turn 80 Test” (Pacing Gate)
By ~turn 80, a player should have:
- 3–4 cities (or a deliberate tall choice),
- fought at least one battle,
- researched ~10 techs with branching choices,
- built (or lost) a wonder race,
- and formed a clear strategic direction.

---

## 2) Architecture Overview (How the Game Is Built)

See `IMPLEMENTATION_SPEC.md` for the canonical crate layout and determinism rules.

### 2.1 Core Components
- **Simulation Core (Rust)**: deterministic game state + rules application.
- **Protocol (Rust)**: command/event/snapshot types + MessagePack serialization.
- **Client (Godot 4)**: rendering, UI, input; no game logic beyond display calculations.
- **Server (Rust)**: authoritative multiplayer host; replays via command log + deterministic sim.

### 2.2 Determinism Invariants (Hard Rules)
- No float math in game state or rules; use ints/basis points/milli-units.
- All RNG via explicit seeded RNG, recorded for replay.
- Stable iteration and resolution ordering (sorted IDs / indexed vectors).
- Protocol commands/events are fully serializable; game replay = seed + rules hash + command log.

---

## 3) Data Model (Entities, IDs, and State)

### 3.1 IDs
Per protocol design:
- Data IDs (strings) for YAML content.
- Runtime IDs (u16 newtypes) for compiled rules.
- Generational entity IDs for units/cities.

### 3.2 Core State Objects (v1 Target)
- **World**:
  - map tiles (terrain, feature, improvement + tier state, resource, ownership, visibility)
  - discovered sites/natural wonders (optional v1)
- **Players**:
  - yields/meters (gold, science progress, culture progress, stability/amenities, supply used/cap, war weariness)
  - techs known + research status
  - policies active + tenure data
  - government type + slots
  - diplomacy state (relations, treaties, reputation modifiers, war state, war goals)
  - religion state (if enabled): founded religion + beliefs + piety pool
- **Cities**:
  - location, owner, population, food storage, production queue + progress
  - worked tiles, borders + border growth progress
  - buildings/wonders and maintenance
  - local amenities/stability breakdown
  - great person point generation (if enabled)
- **Units**:
  - type, owner, position, hp, moves left, orders (goto/patrol/fortify/build/…)
  - promotions/level (with effects surfaced in combat preview)

### 3.3 Chronicle State (Retellability)
Chronicle events are stored as typed entries:
- turn, type, actors, location, summary text, structured details.
Used for:
- timeline UI,
- replay navigation,
- and endgame “history summary.”

---

## 4) Rules + Content System (Data-Driven Gameplay)

### 4.1 YAML → Compiled Rules
Rules and content are authored in YAML and compiled into stable, indexed runtime tables:
- terrain, resources, improvements (including tier schedules)
- units + upgrade chains
- buildings + exclusivity groups + slot tags
- wonders
- techs (field/era/tags, unlock packages)
- policies (trees, effects, requirements, tenure scaling)
- governments (slots, admin/supply/stability effects)
- religion beliefs (if enabled)

### 4.2 Effects and Requirements (Composable)
All gameplay effects should be representable as:
- yield bonuses (flat or bp),
- cap modifiers (supply, amenities),
- maintenance modifiers,
- unlocks and prerequisites,
- and deterministic state transitions.

---

## 5) Core Systems (What Must Be Implemented)

This section maps design requirements to concrete systems.

### 5.1 Turn Loop + Processing Order
Single-player baseline:
1. Upkeep: maintenance, supply over-cap penalties, treaty timers, war weariness tick, occupation tick.
2. City processing: yields, food storage/growth, production progress/completions, border growth.
3. Player processing: research progress/completions, culture milestones/completions, religion pressure tick (if enabled).
4. Unit refresh + orders resolution hooks (movement is player-driven; queued orders may auto-advance).
5. Emit events for UI; append chronicle events for major beats.

Design rule:
- Every phase must be explainable in UI (why a yield changed, why a city grew, why conversion happened).

### 5.2 Map + Fog of War
- Hex grid with wrapping (horizontal).
- Tile state: unexplored/explored/visible.
- Visibility from units/cities; deterministic reveal/hide events.
- Lenses: yields, borders, resources, threats, religion.

### 5.3 Cities (Growth, Production, Specialization)
Minimum viable city model:
- Food consumption per pop + storage + growth cost curve (integer).
- Production queue with overflow rules and optional overflow→gold cap.
- Maintenance model: buildings + city maintenance (base + distance + instability + occupation).
- Specialization constraints:
  - maintenance pressure,
  - institution slots (`1 + pop/4`),
  - exclusivity groups.

### 5.4 Improvements + Maturation (Defend Your Economy)
- Improvements have tiers and advance only when worked.
- Pillage reduces tier by 1 and disables yields until repaired.
- Repair is a worker action with fixed turn cost.
- UI: tier badge + progress to next tier, visible in tooltips and lens.

### 5.5 Trade Routes (Entanglement + Vulnerability)
- Trade capacity from tech/government/buildings.
- Internal vs external routes (different incentives).
- Routes are pillageable; threat level shown along path.
- Trade impacts diplomacy (relationship modifiers) and optionally influence/culture exchange.

### 5.6 Combat (Readable, Main-Map)
- 1UPT with ZOC.
- Combat preview lists:
  - win % and HP expectations,
  - full modifier stack (terrain, flanks, river, fortify, class bonuses, promotions).
- Combat resolution uses deterministic ordering and seeded RNG if probabilistic (RNG stream recorded).

### 5.7 Tech System (Science, Anti-Beeline)
- Tech tree is a prerequisite graph with field/era tags (no resets).
- Semi-random “Unavailable This Game” techs:
  - generated deterministically with constraints (no victory hard-lock).
  - acquisition via trade/conquest/breakthrough (and later espionage).
- Techs unlock packages (units/buildings/improvements/governments/wonders/treaties).

### 5.8 Culture + Government (Policies, Tenure, State Capacity)
- Culture milestones award policy/government choices on a tuned cadence.
- Policy trees with early locks and later limited cross-tree picks.
- Tenure bonus:
  - computed as eras retained, scaling effects by basis points with a cap.
- Governments provide:
  - slot categories,
  - admin/supply/stability effects,
  - and unlock state-capacity tools.
- Borders expand via culture progress with deterministic tile claiming (optional “choose from top 3” to keep agency).

### 5.9 Religion (v1 Light, Passive Spread)
If enabled in v1:
- Passive pressure model (top-K pressures per city) with conversion hysteresis.
- Milestone choices:
  - local belief → found religion → reform/schism.
- No religious unit micro.
- Religion interacts with:
  - amenities/stability,
  - diplomacy alignment,
  - and limited economic hooks.

### 5.10 Great People + Wonders (Chapter Moments)
- Great People points from buildings/projects; thresholds recruit.
- Categories: Scientist/Engineer/Merchant/Artist/Diplomat/(Prophet).
- Great People actions are big and directional (breakthroughs, institutions, council maneuvers).
- Wonders are visible races with large identity effects and hard requirements.

### 5.11 Diplomacy (Explain Everything) + War Goals
- Relationship score from visible modifiers (no hidden values).
- Treaties with durations and break penalties; action previews show consequences.
- War declarations include war goals; peace terms are structured and previewed.
- Optional council/influence system if diplomatic victory exists.

### 5.12 Victory Systems (Concrete Definitions)
Default v1 set:
- **Domination**: hold all capitals.
- **Science**: multi-stage project race with vulnerable launch infrastructure.
- **Culture**: influence-over-rivals threshold model (export vs lifetime culture).
- **Time/Score**: transparent weighted score at a turn limit.

---

## 6) UI/UX Specification (Godot Client Responsibilities)

### 6.1 Global UI Surfaces
- Top bar: yields + key meters (supply, stability, research/culture progress).
- Notifications: actionable, aggregated; “jump to” always.
- End-turn “Promise Strip”: imminent completions across systems.

### 6.2 Core Screens
- Map view + lenses (yield/border/resource/threat/religion).
- City screen: yields breakdown, worked tiles, tier badges, queue, purchase preview, slots/exclusivity.
- Tech tree: prereqs + unlock packages + missing-tech acquisition routes + rival possession visibility.
- Policy/government screen: trees, locks, tenure meters, reform costs and previews.
- Diplomacy: relationship breakdown stack, treaty drafting, war goal declaration, peace terms builder.
- Chronicle: timeline, filters, click-to-jump; replay scrub integration.

### 6.3 “Why?” UX Contract
For any major outcome (combat, conversion, starvation, unrest, treaty refusal):
- UI must provide a “Why?” breakdown: inputs → rules → result.

---

## 7) Storytelling/Retellability Systems (Not Optional)

From `STORYTELLING_DESIGN.md`:
- 4X storytelling is systemic; it must be legible and retrievable.

### 7.1 Chronicle (Timeline)
- Record major events (techs, reforms, wars, wonders, conversions, tier-ups aggregated).
- Present as a navigable timeline UI that links to map and breakdowns.

### 7.2 Deterministic Replays
- Replay = world seed + rules hash + ordered command log.
- Replay viewer supports scrubbing by turn and jumping to chronicle events.

---

## 8) Multiplayer + AI (Phase-Gated)

### 8.1 Multiplayer (Server Authoritative)
- WebSocket server hosts sessions; clients send commands; server runs deterministic sim.
- Snapshot sync for join/reconnect; delta updates as events.
- Stable conflict resolution rules for simultaneous turns.

### 8.2 AI (Narrative Actor)
- AI uses the same rules as players; any bonuses are disclosed.
- Personality profiles (Honorable/Machiavellian/Principled) bias decisions.
- AI decisions are explainable (diplomacy “why,” war goals, treaty refusal reasons).

---

## 9) Testing + Verification Plan

### 9.1 Determinism Tests (Highest Priority)
- Same seed + same command log → identical final snapshot hash.
- Stable ordering tests (units/cities processing order).
- No float/state drift tests.

### 9.2 System Unit Tests
- Growth/food/storage edge cases (starvation rules).
- Maintenance breakdown correctness (base/distance/instability/occupation).
- Improvement tier advancement and pillage/repair behavior.
- Tenure scaling and reform resets.
- Missing-tech generator constraints.
- Diplomacy modifier sum and decay rules.

### 9.3 Integration Tests
- “Turn 80 Test” scenario smoke test (scripted command log).
- Replay load/scrub invariants.

---

## 10) Implementation Plan (Milestones and Deliverables)

This plan is intended to be executed incrementally; each milestone should produce a playable build.

### Milestone 0 — Deterministic Foundations (Engine + Protocol)
Deliverables:
- Stable map + hex utilities; deterministic turn loop skeleton.
- Command/event/snapshot wire format solidified for replay.
- Snapshot hashing and replay harness (seed + commands).

### Milestone 1 — Vertical Slice Core Loop (“I can play 30 minutes”)
Deliverables:
- Unit move/orders, fog of war, basic combat + preview.
- Found city, basic growth and yields, production queue and completions.
- Minimal AI opponent that can explore/settle/fight.
- UI: selection, tooltips, end-turn warnings.

### Milestone 2 — Tech + Content Unlocks (Early/Mid Progress)
Deliverables:
- Tech tree UI + research progress + unlock packages.
- Add unit/building tiers via YAML content.
- Resource reveal/extraction v1 (strategic gating for at least one unit line).

### Milestone 3 — Culture/Government + State Capacity (Wide Play Feels Good)
Deliverables:
- Culture milestones + policy trees + tenure math + reform costs.
- Government ladder with slot categories and admin/supply effects.
- City maintenance breakdown (base/distance/instability/occupation) + admin buildings.
- Border growth with deterministic claiming and optional top-3 choice UI.

### Milestone 4 — Economy Stakes (Maturing Improvements + Trade + Supply)
Deliverables:
- Improvements with tier maturation (worked-turns), pillage/repair, tier UI.
- Worker UX: recommendations, queue/automation basics.
- Trade routes (internal/external), pillage risk, diplomacy modifiers from trade.
- Supply cap + over-cap penalties; war weariness tied into amenities/stability.
- End-turn “promise strip” implementation.

### Milestone 5 — Chronicle + Retellability (Story Infrastructure)
Deliverables:
- Chronicle event taxonomy + event emission from major systems.
- Timeline UI with click-to-jump; replay scrub integration.
- “Why?” panels for combat, maintenance, conversion, unrest, treaties.

### Milestone 6 — Late Game + Victory (No Waiting Endgames)
Deliverables:
- Science victory multi-stage projects + vulnerability rules + victory UI.
- Culture influence system + victory UI.
- Domination capitals rule + victory UI.
- Score/time limit + transparent breakdown.
- Great People + Wonders (at least one “chapter” moment per 50 turns).
- Religion v1 (optional if schedule permits; otherwise v2).

### Milestone 7 — Multiplayer (Optional After a Fun Single-Player Loop)
Deliverables:
- Server session management, sync, simultaneous turns resolution.
- Reconnect and replay verification across network.

---

## 11) Remaining “Decision Points” (If You Want to Lock Them Explicitly)

These should be locked early because they ripple through systems and UI:
- Enable religion in v1 (light) vs v2.
- Enable diplomacy council/influence in v1 vs v2.
- Espionage scope (v2 recommended).
- Exact map generation goals and constraints (start balance, region bias).

