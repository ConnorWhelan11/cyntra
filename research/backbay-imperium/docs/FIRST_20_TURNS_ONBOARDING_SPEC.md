# First 20 Turns Onboarding Spec

## Goals
- Make the first 20 turns feel guided and intentional without breaking player agency.
- Deliver Civ-like early-game dopamine: first city, first tech, first improvement, first combat.
- Keep onboarding UI lightweight and skippable.

## UX Principles
- One active beat at a time (avoid noisy checklists).
- Prompts must be actionable: every prompt maps to a click or selection.
- Show the why: tech reveals, yield lens, and combat preview are surfaced at the right moment.
- Allow snooze/disable at any time.

## Core Beats (Turn 1-20)
1. Found Your Capital
   - Trigger: player has a settler and 0 cities.
   - Prompt action: select settler -> Found City.

2. Choose Your First Technology
   - Trigger: player has a city and no research selected.
   - Prompt action: open Research panel.
   - UI detail: show tech reveal list in details.

3. Start Production
   - Trigger: player has a city with no production.
   - Prompt action: open city production picker.

4. Explore the World
   - Trigger: player has a movable unit and explored tiles < +6.
   - Prompt action: ping a nearby unexplored tile.

5. Build Your First Improvement
   - Trigger: player has a worker and no owned improvement.
   - Prompt action: highlight yields with lens.

6. First Tech Reveal
   - Trigger: player completes a tech with resource reveals.
   - Prompt action: ping revealed resources.

7. First Combat
   - Trigger: player has adjacent enemy unit and no combat seen.
   - Prompt action: select unit and show combat preview affordance.

8. Found Your Second City
   - Trigger: player has 1 city and a settler with moves.
   - Prompt action: select settler -> Found City.

9. Meet a Rival
   - Trigger: enemy unit is visible.
   - Prompt action: open Diplomacy panel.

## Prompt Surface
- Promise strip item type: "Onboarding" with text + action.
- Onboarding panel:
  - Title + step list for the active beat.
  - Snooze (10 turns) and Hide buttons.

## Map Affordances
- Ping overlay: ring highlight at a target hex or revealed resource tiles.
- Yield lens toggle:
  - Enabled for first improvement beat.
  - Disabled automatically after completion or snooze.

## Data Source
- `research/backbay-imperium/client/data/onboarding.json` controls beat order, windows, prompts.

## Implementation Summary
- `OnboardingManager.gd` handles beat state, prompts, and event ingestion.
- `GameHUD.gd` renders the Onboarding panel and forwards snooze/hide actions.
- `MapViewMultiplayer.gd` draws pings and yields, and filters resources by tech reveal.
- `ResearchPanel.gd` renders tech reveal lists in details/tooltips.

## Extensibility
- Add new beats by extending `onboarding.json`.
- Add new prompt actions in `OnboardingManager._handle_onboarding_action`.
- If future quest system exists, re-map onboarding beats into quests.
