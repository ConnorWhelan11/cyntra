# Backbay Imperium — Multiplayer Technical Considerations

> Condensed from `MULTIPLAYER_RESEARCH.md`. Implementation-focused.

---

## 1) Architecture Decisions

### Server Model

```
RECOMMENDED: Dedicated server (not peer-to-peer)

Reasons:
- Enables host migration without game loss
- Authoritative state prevents desync
- Async play requires persistent state storage
- Replay recording centralized
- Anti-cheat enforcement

Alternative (P2P with relay):
- Lower infrastructure cost
- Higher desync risk
- Host migration complex
```

### Authoritative Simulation (Decision)

**Single source of truth**: `backbay-core::GameEngine` is the authoritative simulation for both single-player and multiplayer.

Implications:
- `backbay-server` owns networking/session state (lobby, auth, timers, turn permissions, reconnect), **not** gameplay rules.
- All gameplay logic and validations live in core; the server forwards/records commands and broadcasts snapshots/deltas.
- Avoid “split-brain” logic: do not add new gameplay behavior to the server-only snapshot mutator.

Migration plan (repo state → target state):
1. Generate new-game snapshots from core + embedded rules (done).
2. Replace `backbay_server::game::state` snapshot-mutation with a thin wrapper around `GameEngine` (next).
3. Emit network deltas from core `Event`s + per-player visibility (fog-of-war).
4. When parity is reached, delete the legacy server sim to prevent divergence.

### State Synchronization

```
MODEL: Command-based deterministic simulation

Turn submission:
1. Players submit ordered command lists
2. Server validates commands
3. Server applies commands in deterministic order
4. Server broadcasts resulting state delta
5. Clients verify (detect desync early)

Conflict resolution (same-turn attacks):
- Player order: Alphabetical by player ID (stable, documented)
- Unit order: By unit ID within player
- All resolution rules visible in combat preview
```

### Save Format

```
REQUIREMENTS:
- Full state serialization (not command replay)
- Compression for cloud storage
- Version migration support
- Checksum for integrity
- Partial state for fog-of-war observers

SIZE TARGET: <5MB per save for 8-player late-game
```

---

## 2) Turn System Implementation

### Turn Modes

```rust
enum TurnMode {
    Simultaneous,  // All players act freely
    Dynamic,       // Simultaneous until war, then sequential for belligerents
    Sequential,    // One player at a time, round-robin
    Strict,        // Active player only, others locked
}

// Dynamic mode logic
fn can_act(player: PlayerId, mode: TurnMode, war_state: &WarState) -> bool {
    match mode {
        TurnMode::Dynamic => {
            if war_state.is_at_war(player) {
                war_state.is_active_belligerent(player)
            } else {
                true // Simultaneous for non-belligerents
            }
        }
        // ...
    }
}
```

### Turn Timer

```
ADAPTIVE TIMER:
base_time = 60 seconds
era_multiplier = 1.0 + (current_era * 0.2)  // Late game gets more time
unit_bonus = active_units * 2 seconds       // Cap at 60s bonus
city_bonus = cities * 5 seconds             // Cap at 30s bonus

turn_time = base_time * era_multiplier + unit_bonus + city_bonus
max_turn_time = 300 seconds

TIME BANKING:
bank_max = 180 seconds
bank_gain = max(0, turn_time - time_used) * 0.5
bank_use = unlimited per turn (drains bank first)
```

### End-of-Turn Validation

```
BLOCKERS (prevent end turn):
- Units requiring mandatory orders (settler, newly built)
- Research not selected
- Production not queued (optional setting)

WARNINGS (allow override):
- Units with remaining movement
- Unspent gold above threshold
- Diplomatic messages unread
```

---

## 3) Async System Design

### Cloud Save Flow

```
TURN SUBMISSION:
1. Player completes turn locally
2. Client sends: { commands: [], end_turn: true, checksum: hash }
3. Server validates, applies, stores new state
4. Server notifies next player(s)
5. Next player's client fetches state on demand

NOTIFICATION CHANNELS:
- Push notification (mobile)
- Email (configurable)
- In-client badge
- Webhook (for Discord bots, etc.)
```

### Concurrent Game Support

```
PLAYER DASHBOARD:
- List of active games with status
- "Your turn" indicator with time remaining
- Quick-join to any game
- Turn history per game

LIMITS:
- Max concurrent games: 20 (configurable)
- Max active turns awaiting: 10 (prevents over-commitment)
```

### Disconnect Handling

```
GRACE PERIOD: 60 seconds (real-time modes)
AI TAKEOVER: After grace period expires
RECONNECT: Player resumes control immediately
NOTIFICATION: "Player X disconnected, AI controlling"

ASYNC TIMEOUT:
- Default: 24 hours per turn
- Configurable: 6h, 12h, 24h, 48h, 72h
- Vacation mode: Pause personal timer (once per game)
```

---

## 4) Anti-Snowball Integration

### Existing Systems (from GAMEPLAY_SPEC)

These already provide anti-snowball pressure:

| System | Implementation Note |
|--------|---------------------|
| State Capacity / Instability | Ensure UI shows "you expanded faster than your institutions" |
| Supply Cap | Hard cap with visible penalty curve |
| Distance Maintenance | Linear or sqrt scaling, not exponential |
| War Weariness | Accumulates per turn at war, decays slowly in peace |
| Tile Tier Loss on Pillage | -1 tier per pillage (not reset to 0) |

### Additional Mechanisms

**Tech Osmosis** (optional, toggle in game setup):
```
tech_cost_modifier(tech, player) -> f32 {
    let known_by = count_players_with_tech(tech);
    let total_players = player_count();
    let base_discount = (known_by as f32 / total_players as f32) * 0.3;
    let trade_bonus = if has_trade_with_tech_holder(player, tech) { 0.1 } else { 0.0 };
    1.0 - base_discount - trade_bonus  // Min 0.6 (40% max discount)
}
```

**Orders Limit** (optional, competitive mode):
```
orders_per_turn(player) -> u32 {
    let base = 10;
    let gov_bonus = government_tier(player) * 3;
    let building_bonus = count_admin_buildings(player);
    min(base + gov_bonus + building_bonus, 30)
}
```

---

## 5) Draft/Ban System

### Pre-Game Lobby Flow

```
SETUP PHASES:
1. Host configures: map, settings, victory conditions
2. Players join lobby
3. Map generated (or mirror map selected)
4. [Optional] Spawn positions revealed
5. Ban phase: Each player bans 1-2 civs (simultaneous, hidden)
6. Bans revealed
7. Pick phase: Snake draft order for civ selection
8. Game starts

SNAKE DRAFT (6 players):
Round 1: 1, 2, 3, 4, 5, 6
Round 2: 6, 5, 4, 3, 2, 1  // If picking multiple things
```

### Civ Balance Metadata

```yaml
# balance.yaml - ships with game, moddable
civilizations:
  - id: civ_maritime
    name: "Maritime Republic"
    tier: A  # S, A, B, C, D for draft guidance
    tags: [naval, trade, coastal]
    ban_rate: 0.23  # Updated from telemetry
    win_rate: 0.54

maps:
  - id: continents
    civ_advantages: [civ_maritime, civ_seafarers]
    civ_disadvantages: [civ_landlocked]
```

---

## 6) Spectator & Replay

### Observer Mode

```
OBSERVER PERMISSIONS:
- Full map vision (no fog)
- All player resources visible
- Free camera
- Cannot interact with game state
- Optional: 5-turn delay for live broadcasts

OBSERVER SLOTS:
- Separate from player slots
- Max 4 observers per game (bandwidth)
- Join/leave without affecting game
```

### Replay System

```
RECORDING:
- Store initial state + all commands (small file size)
- Deterministic replay from commands
- Metadata: players, civs, map seed, duration, winner

PLAYBACK:
- Variable speed (0.5x, 1x, 2x, 4x, 8x)
- Timeline scrubbing
- Per-player POV or omniscient view
- "Resume from here" (fork into new game)

FILE FORMAT:
{
  "version": "1.0",
  "map_seed": 12345,
  "players": [...],
  "initial_state_hash": "abc123",
  "turns": [
    { "turn": 1, "commands": [...], "state_hash": "def456" },
    ...
  ]
}
```

---

## 7) Team Play

### Alliance Configuration

```
TEAM SETTINGS (set at game start or via diplomacy):
- Shared vision: bool
- Shared map: bool
- Resource sharing: None | Luxuries | Strategic | All
- Tech sharing: None | Discount | Full
- Team victory: bool

TEAM VICTORY CONDITIONS:
- Domination: Team controls all enemy capitals
- Science: Any team member completes project
- Culture: Combined team influence threshold
- Score: Combined team score
```

### Comp Stomp Mode

```
ASYMMETRIC SETUP:
- Team A: Human players (any count)
- Team B: AI players (configurable count and difficulty)
- AI difficulty per-player (King, Emperor, Deity)
- Shared victory for human team
```

---

## 8) Ranked System (Future)

### Async Ladder

```
MATCH PARAMETERS:
- Format: 1v1, 2v2, or 3-player FFA
- Turn timer: 24 hours
- Match duration: ~1-2 weeks
- Settings: Standardized (no custom rules)
- Maps: Curated balanced pool

RATING:
- ELO-based (starting 1200)
- K-factor: 32 (new players), 16 (established)
- Team rating: Average of team members
- Seasonal resets: Soft reset (compress toward mean)
```

### Rapid Format

```
COMPRESSED GAME:
- Duration target: 60-90 minutes
- Tech cost: 50% of standard
- Production: 150% of standard
- Map size: Small (4-player max)
- Victory: First to 100 VP or domination

MATCHMAKING:
- Queue with estimated wait time
- Skill-based matching
- Ready check before start
- Abandon penalty: -50 rating, 30-min queue ban
```

---

## 9) Implementation Phases

### Phase 1: Core Multiplayer (MVP)

```
SCOPE:
- Real-time multiplayer (2-8 players)
- Dynamic turn mode only
- Host-based saves (no cloud)
- Basic lobby system
- AI takeover on disconnect

TECH:
- WebSocket connection layer
- Deterministic simulation validation
- Basic matchmaking (friend codes)

TIMELINE: Foundation, ship with initial release
```

### Phase 2: Async & Polish

```
SCOPE:
- Cloud save system
- Push notifications
- All turn modes
- Spectator mode (no replay yet)
- Draft/ban UI
- Reputation tracking

TECH:
- Cloud storage integration
- Notification service
- Extended lobby flow

TIMELINE: 3-6 months post-launch
```

### Phase 3: Competitive

```
SCOPE:
- Replay system
- Ranked ladder (async)
- Rapid format mode
- Tournament tools
- Statistics dashboard
- Mobile companion (turn notifications + viewing)

TECH:
- Replay storage and streaming
- Matchmaking service
- Analytics pipeline

TIMELINE: 6-12 months post-launch
```

---

## 10) Open Technical Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Server hosting | Self-hosted vs cloud service | Cloud (lower ops burden) |
| Protocol | WebSocket vs WebRTC | WebSocket (simpler, sufficient) |
| State sync | Full state vs delta | Delta with periodic full sync |
| Mod sync | Checksum validation vs full transfer | Checksum + mod repository |
| Cross-platform | Shared servers vs platform-specific | Shared (larger player pool) |
| Anti-cheat | Client trust vs server authority | Server authority (4X pace allows it) |

---

## Appendix: Data Structures

### Lobby State

```typescript
interface Lobby {
  id: string;
  host: PlayerId;
  settings: GameSettings;
  players: LobbyPlayer[];
  observers: ObserverId[];
  phase: 'waiting' | 'banning' | 'picking' | 'starting';
  bans: Map<PlayerId, CivId[]>;
  picks: Map<PlayerId, CivId>;
}
```

### Turn Submission

```typescript
interface TurnSubmission {
  gameId: string;
  playerId: PlayerId;
  turnNumber: number;
  commands: Command[];
  endTurn: boolean;
  stateChecksum: string;  // Client's computed hash for desync detection
  timestamp: number;
}
```

### Notification Event

```typescript
interface TurnNotification {
  type: 'your_turn' | 'game_update' | 'player_joined' | 'game_ended';
  gameId: string;
  gameName: string;
  turnNumber: number;
  timeRemaining?: number;  // Seconds until timeout
  summary?: string;        // "Turn 47: Rome declared war on Greece"
}
```
