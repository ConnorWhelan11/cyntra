# Backbay Imperium — Multiplayer Research & Recommendations

> Research conducted 2025-12-27. Complements `GAMEPLAY_SPEC.md` Section 2 (Turn Structure).

---

## Executive Summary

Modern 4X multiplayer has evolved significantly since Civ 5. **Old World** (Mohawk Games) leads the industry with sophisticated turn systems, async play, and competitive features. The Civilization community has created essential balance mods (BBG, NQ) that reveal what base games lack.

**Key insight**: Anti-snowball mechanics must be designed in from day one—they cannot be retrofitted. Backbay Imperium's existing State Capacity system is an excellent foundation.

---

## 1) Turn Model Options

### The Old World Standard: Six Turn Styles

Old World proves that a single turn model doesn't fit all play patterns. Their system offers:

| Mode | Behavior | Best For |
|------|----------|----------|
| **Simultaneous** | All players move all units anytime | Speed, casual |
| **Loose** | No restrictions, staggered start | Friendly games |
| **Tight** | Non-military only during others' turns | Semi-competitive |
| **Dynamic** | Simultaneous in peace, sequential in war | **Competitive default** |
| **Sequential** | Traditional one-at-a-time | Complex late-game |
| **Strict** | Only active player can act | Tournaments |

**Critical innovation**: Turn styles can be changed mid-game. Start fast, shift to sequential for late-game wars.

### Recommendation for Backbay Imperium

```
DEFAULT: Dynamic turns (simultaneous unless at war)
OPTION: Switchable mid-game via host vote
TIMER: Adaptive (scales with era/game complexity)
BANK: Turn time banking for complex decisions (borrow from future turns)
```

The existing spec's "server-authoritative deterministic sim" is correct. Conflict resolution must be documented and visible in replays.

---

## 2) Session Formats

### Async Play is Non-Negotiable

4X games take 4-8 hours. Real-time-only limits the player base dramatically.

**Old World Cloud Play** (gold standard):
- Automated save passing between players
- Push notifications when it's your turn
- No simultaneous online requirement
- Support for multiple concurrent games

**Civilization 6 Play by Cloud** (cautionary tale):
- Unreliable notifications
- Community created workarounds (Play Your Damn Turn)
- Shows demand but poor execution

### Session Format Matrix

| Format | Duration | Players | Use Case |
|--------|----------|---------|----------|
| **Real-time MP** | 4-8 hours | 2-8 | Dedicated sessions |
| **Async Cloud** | Days-weeks | 2-8 | Busy schedules |
| **Local Hotseat** | Hours | 2-4 | Same device |
| **Rapid Format** | 60-90 min | 2-4 | Competitive ladder |

### Rapid Format (Innovation Opportunity)

Largely unexplored in 4X. Options:
1. **Era-limited games**: Ancient → Classical only
2. **Victory Point race**: First to X score
3. **Compressed timeline**: Faster tech/production scaling
4. **Scenario challenges**: Preset balanced situations

---

## 3) Anti-Snowball Mechanics

### The Core Problem

Once a player gains a lead in 4X, positive feedback loops compound the advantage until the game becomes uninteresting. This is the #1 multiplayer pain point.

### Backbay Imperium Already Has Good Foundations

The GAMEPLAY_SPEC's existing systems address snowballing:

| System | Anti-Snowball Effect |
|--------|---------------------|
| **State Capacity / Instability** | Expansion has real costs |
| **Supply Cap** | Can't field infinite armies |
| **Tile Improvement Tiers** | Developed tiles are vulnerable |
| **War Weariness** | Long wars pressure peace |
| **Distance Maintenance** | Sprawl is expensive |

### Additional Mechanisms to Consider

**1. Tech Osmosis / Catch-up Costs**

From Humankind (concept good, implementation buggy):

```
TECH COST MODIFIER:
Base: 100%
Per empire that knows tech: -10%
With trade agreement: additional -5%
Maximum discount: -50%

Result: Leaders in tech 1 era ahead max by late game
```

**2. Orders/Actions Limit** (Old World)

Regardless of empire size, you can only execute N actions per turn. Larger empires must prioritize.

```
ORDERS PER TURN:
Base: 10
Per government tier: +3
Per administrative building: +1
Maximum: ~30

Big empire = more choices, same action budget
```

**3. Defender's Advantage Scaling**

```
EARLY GAME: Attacker advantage (+10% combat in foreign territory)
MID GAME: Neutral
LATE GAME: Defender advantage (+15% in home territory)

Reason: Enables early aggression, prevents snowball conquests late
```

**4. Diminishing Returns on Army Size**

```
SUPPLY OVER CAP:
1-10% over: -10% combat strength
11-25% over: -25% combat strength
26%+ over: -50% combat strength + attrition

Prevents "pile on" strategies
```

### What NOT to Do

- **Hidden penalties**: Players feel cheated. All anti-snowball must be transparent.
- **Punishing winners directly**: Frame as "challenge of success" not "penalty for winning."
- **Era star catch-up** (Humankind): Takes too long to matter.

---

## 4) Competitive Balance Features

### Draft/Ban Systems

Borrowed from MOBAs, now expected by competitive players:

```
DRAFT PROCESS:
1. Map revealed (or mirror map selected)
2. Ban phase: Each player bans 1-2 civs
3. Pick phase: Snake draft for civ selection
4. OR: Pick after spawn reveal (Old World innovation)

UI: Built-in drafter, not third-party tool
```

### Mirror Maps

For pure skill testing:
- Identical starting positions
- Symmetric terrain
- Equal resource distribution
- Tournament standard option

### "No RNG" Mode

Old World offers "No Characters" mode that removes random events. Consider:
- No random exploration rewards (fixed)
- No random combat (deterministic with variance shown)
- No random tech availability (standard tree)

---

## 5) Team & Cooperative Play

### Current State: Underdeveloped in Genre

Most 4X games treat multiplayer as FFA. Team features are afterthoughts.

### Team Features to Include

**Shared Vision Toggle**:
```
ALLIANCE SETTINGS:
[ ] Share map vision
[ ] Share unit vision
[ ] Share resource info
[ ] Share research queue visibility
```

**Team Victory Conditions**:
- Team Domination: Control all enemy capitals
- Team Science: Combined project completion
- Team Culture: Combined influence threshold

**Comp Stomp Mode** (Old World innovation):
- Asymmetric teams vs AI
- Adjustable AI difficulty per side
- Great for mixed skill groups (parent + child, veteran + newbie)

### Resource Sharing

```
ALLIANCE TRADE:
Gold: Direct transfer allowed
Strategic resources: Share access within alliance
Luxuries: Share amenity bonus within alliance
Research: Optional tech sharing (slower, shared)
```

---

## 6) Anti-Griefing & Disconnection

### The Griefing Problem

- Players abandon losing games
- Intentional slowplay
- Kingmaking (helping one player beat another)
- AFK during turn timers

### Solutions

**1. AI Takeover**

When player disconnects:
```
DISCONNECT HANDLING:
0-60 seconds: Hold for reconnect
60+ seconds: AI assumes control
Reconnect: Player resumes control
Game end: AI plays to completion or surrender
```

**2. Reputation System**

```
PLAYER PROFILE:
Games started: 47
Games completed: 41
Completion rate: 87%
Average game position: 2.3/6
Abandons: 6 (all before turn 50)

Matchmaking prefers high completion rates
```

**3. Democratic Pause**

```
PAUSE VOTING:
Any player: Request pause
Pause approved: Majority vote
Max pause: 5 minutes per player per game
Emergency pause: Host can force (logged)
```

**4. Host Migration**

```
HOST DISCONNECT:
1. Game state saved to all clients
2. New host selected (highest completion rate)
3. Seamless continuation
4. Original host can rejoin as player
```

---

## 7) Spectator & Replay Systems

### Major Gap in 4X Genre

Competitive scenes can't grow without spectator tools. Civ community creates mods (Better Spectator Mod); Old World has basic observer mode.

### Spectator Features Needed

```
OBSERVER MODE:
- Join as observer (no fog of war)
- Free camera movement
- Player POV switching
- Resource/yield overlay
- Delayed live broadcast (5 turns behind)
```

### Replay System

```
REPLAY FEATURES:
- Full game recording (deterministic, so small files)
- Playback at any speed
- Timeline scrubbing
- Player POV selection
- "Resume from here" for analysis
- Share replays via ID
```

### Tournament Support

```
TOURNAMENT TOOLS:
- Bracket management
- Match scheduling
- Result reporting
- Live observer slots
- Casting delay for fairness
- Statistics export
```

---

## 8) Ranked Play Considerations

### Why 4X Lacks Ladders

1. **Game length**: 4-8 hours incompatible with quick matchmaking
2. **Player count**: 4-8 players harder to matchmake than 1v1
3. **Asymmetry**: Different civs/starts create balance issues
4. **Time commitment**: Requires dedicated community

### Viable Ranked Formats

**Async Ladder** (most promising):
```
ASYNC RANKED:
Match duration: 1-2 weeks
Turn timer: 24 hours (flexible)
Rating: ELO-based
Seasons: Monthly
Formats: 1v1, 2v2, 3-player FFA
```

**Rapid Competitive**:
```
RAPID RANKED:
Duration: 60-90 minutes
Compressed timeline
Balanced scenario starts
Real-time matchmaking
Daily tournaments
```

**Team Ladder**:
```
TEAM RANKED:
2v2 or 3v3
Combined team rating
Async or scheduled match times
Season standings
```

---

## 9) Open Design Questions

### For Backbay Imperium to Resolve

1. **Turn timer philosophy**: Fixed vs adaptive vs per-action banking?

2. **Combat resolution in simultaneous**: When two players attack same tile on same turn, who wins? (Must be deterministic and documented)

3. **Async notification scope**: Which events trigger push notifications? (All? Only critical?)

4. **Fog of war in replays**: Full reveal or POV-locked?

5. **Abandon consequences**: Purely social (reputation) or mechanical (ranked penalties)?

6. **Cross-platform**: Mobile companion app for async? Full mobile client?

7. **Mod support in ranked**: Allow balance mods or vanilla only?

8. **AI strength in team games**: How to balance comp stomp difficulty?

---

## 10) Priority Recommendations

### Must Have (MVP Multiplayer)

1. **Dynamic turn mode** (simultaneous peace, sequential war)
2. **Reliable save/resume** with host migration
3. **AI takeover** for disconnects
4. **Built-in draft/ban** system
5. **Anti-snowball transparent** in all systems (already designed)

### Should Have (Competitive-Ready)

1. **Async cloud play** with notifications
2. **Multiple turn modes** switchable mid-game
3. **Mirror map option**
4. **Spectator mode** with fog toggle
5. **Replay recording**
6. **Reputation tracking**

### Nice to Have (Scene Growth)

1. **Ranked ladder** (async format)
2. **Rapid 60-minute mode**
3. **Tournament tools**
4. **Mobile companion app**
5. **Casting/streaming integration**
6. **Detailed statistics dashboard**

---

## Sources

- Old World multiplayer documentation (Mohawk Games)
- Better Balanced Game mod (Civ 6 competitive community)
- Civilization 5 No Quitters mod and community
- Humankind community forums (anti-snowball discussions)
- Millennia multiplayer implementation
- Wayward Strategy anti-snowball design analysis
- Civ Players' League competitive formats

---

## Appendix: Competitive Community Lessons

### What BBG Mod Teaches Us

The Better Balanced Game mod for Civ 6 became essential for competitive play because vanilla Civ 6 wasn't designed for multiplayer balance. The mod:
- Nerfs overpowered civs and strategies
- Buffs underused options to viability
- Makes more of the game "playable" in competitive settings

**Lesson**: Design for competitive balance from day one, or community will do it for you (and fragment the player base).

### What No Quitters Community Teaches Us

Civ 5's No Quitters community solved the abandonment problem through:
- Social contract (commit to finishing)
- Community reputation
- Discord organization

**Lesson**: Without official systems, communities create their own. Better to build it in.

### What Old World Gets Right

Mohawk Games designed multiplayer-first:
- Multiple turn modes for different preferences
- Async from launch, not patched in
- Observer mode for tournaments
- Competitive options (No Characters, mirror maps)

**Lesson**: Multiplayer can't be bolted on. Architecture decisions made early determine what's possible later.
