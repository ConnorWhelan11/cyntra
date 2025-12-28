# Backbay Imperium — Multiplayer Implementation Plan

> Synthesized from MULTIPLAYER_RESEARCH.md, MULTIPLAYER_TECHNICAL.md, and OPENSOURCE_RESOURCES.md

---

## Overview

Three-phase approach: MVP multiplayer at launch, async/polish post-launch, competitive features 6-12 months out.

**Target Architecture**: Rust authoritative server + Godot 4 client, using Renet for networking.

---

## Phase 1: MVP Multiplayer (Launch)

### Goals
- 2-8 player real-time games
- Dynamic turn mode (simultaneous peace, sequential war)
- Host-based saves with AI takeover on disconnect
- Friend codes / direct IP connection

### Tasks

#### 1.1 Server Foundation
```
□ Set up Rust server crate with Renet
□ Define channel architecture:
  - Channel 0: ReliableOrdered (turn commands)
  - Channel 1: ReliableUnordered (chat, notifications)
  - Channel 2: Unreliable (ping/heartbeat)
□ Implement connection management (join/leave/timeout)
□ Add basic authentication (player ID + game code)
```

#### 1.2 Game State Synchronization
```
□ Use `backbay-core::GameEngine` as the authoritative sim (no duplicate server gameplay rules)
□ Wrap core engine in a serializable server game container (seed + rules hash + command log)
□ Implement deterministic simulation tick (apply validated commands → events → deltas)
□ Add state checksum for desync detection
□ Create save/load for full game state (bincode or MessagePack)
□ Build turn submission validation
```

#### 1.3 Turn System
```
□ Implement dynamic turn mode:
  - Track war state between players
  - Simultaneous movement for non-belligerents
  - Sequential turns for players at war
□ Add turn timer with adaptive scaling:
  - Base: 60 seconds
  - Era multiplier: +20% per era
  - Unit/city bonuses (capped)
□ Build end-turn validation (blockers vs warnings)
```

#### 1.4 Godot Client Integration
```
□ Create GDExtension or WebSocket client for Renet
□ Implement command serialization (Godot → Rust)
□ Build state deserialization (Rust → Godot)
□ Add lobby UI (create/join game, player list)
□ Display turn status and timer
```

#### 1.5 Disconnect Handling
```
□ Implement 60-second grace period for reconnection
□ Add AI takeover after grace period expires
□ Allow reconnection and player resume
□ Notify other players of disconnect/reconnect
```

#### 1.6 Testing
```
□ Local multiplayer testing (multiple clients, one server)
□ Simulated latency testing (tc netem or similar)
□ Desync detection and logging
□ Load testing (8 players, late-game state size)
```

### Deliverables
- Rust server binary (`backbay-server`)
- Godot multiplayer client module
- Basic lobby system
- Dynamic turn mode working
- AI takeover on disconnect

---

## Phase 2: Async & Polish (3-6 months post-launch)

### Goals
- Cloud save with push notifications
- All turn modes (Simultaneous, Dynamic, Sequential, Strict)
- Spectator mode
- Draft/ban UI
- Reputation tracking

### Tasks

#### 2.1 Cloud Infrastructure
```
□ Set up cloud storage (S3-compatible or managed DB)
□ Implement game state persistence
□ Add turn notification service (push + email)
□ Build concurrent game management (20 games per player)
□ Create mobile notification integration
```

#### 2.2 Turn Mode Expansion
```
□ Implement all four turn modes:
  - Simultaneous: All players act freely
  - Dynamic: Simultaneous until war (default)
  - Sequential: Round-robin, one at a time
  - Strict: Only active player can act
□ Add mid-game turn mode switching (host vote)
□ Implement turn time banking (borrow from future turns)
```

#### 2.3 Spectator Mode
```
□ Add observer connection type (no game actions)
□ Implement full map vision for observers
□ Build free camera controls
□ Add optional 5-turn delay for live broadcasts
□ Limit observer slots (4 max for bandwidth)
```

#### 2.4 Draft/Ban System
```
□ Design pre-game lobby flow:
  1. Host configures settings
  2. Players join
  3. Map generated / spawns revealed
  4. Ban phase (simultaneous, hidden)
  5. Pick phase (snake draft)
  6. Game starts
□ Build ban submission and reveal UI
□ Implement snake draft ordering
□ Add civ balance metadata (tier ratings, win rates)
```

#### 2.5 Reputation System
```
□ Track per-player statistics:
  - Games started / completed
  - Completion rate
  - Average position
  - Abandons (with turn count)
□ Store in persistent player profile
□ Display in lobby and matchmaking
□ Prefer high-completion players in matchmaking
```

#### 2.6 Host Migration
```
□ Implement game state broadcast to all clients
□ Add host selection algorithm (highest completion rate)
□ Build seamless host transfer flow
□ Allow original host to rejoin as player
```

### Deliverables
- Cloud save service
- Push notification system
- All turn modes
- Spectator mode (no replay yet)
- Draft/ban UI
- Player reputation profiles

---

## Phase 3: Competitive (6-12 months post-launch)

### Goals
- Replay system
- Ranked ladder (async format)
- Rapid 60-minute mode
- Tournament tools
- Statistics dashboard

### Tasks

#### 3.1 Replay System
```
□ Design replay format:
  - Initial state + all commands (deterministic replay)
  - Metadata: players, civs, map seed, duration, winner
  - State hashes per turn (for verification)
□ Implement replay recording during game
□ Build playback with variable speed (0.5x - 8x)
□ Add timeline scrubbing
□ Support per-player POV and omniscient view
□ Implement "resume from here" (fork to new game)
□ Add replay sharing via ID
```

#### 3.2 Ranked Ladder
```
□ Design async ladder format:
  - 1v1, 2v2, 3-player FFA
  - 24-hour turn timer
  - 1-2 week match duration
  - Standardized settings
□ Implement ELO rating system:
  - Starting rating: 1200
  - K-factor: 32 (new), 16 (established)
  - Team rating: Average of members
□ Add seasonal resets (soft compression toward mean)
□ Build matchmaking queue
□ Create ranked game validation (no custom settings)
```

#### 3.3 Rapid Format
```
□ Design compressed game mode:
  - Duration target: 60-90 minutes
  - Tech cost: 50% of standard
  - Production: 150% of standard
  - Map size: Small (4-player max)
  - Victory: First to 100 VP or domination
□ Implement rapid matchmaking with estimated wait
□ Add ready check before start
□ Create abandon penalty (-50 rating, 30-min queue ban)
```

#### 3.4 Tournament Tools
```
□ Build tournament bracket management
□ Add match scheduling
□ Implement result reporting
□ Create live observer slots with casting delay
□ Add statistics export (CSV, JSON)
```

#### 3.5 Statistics Dashboard
```
□ Track detailed game statistics:
  - Per-civ win rates
  - Map type performance
  - Opening strategies
  - Turn time usage
□ Build player profile page
□ Create leaderboards (rating, games played, win rate)
□ Add historical ranking graphs
```

#### 3.6 Mobile Companion (Optional)
```
□ Design mobile app for async notifications
□ Implement turn viewing (read-only game state)
□ Add chat and notifications
□ Support push notification management
```

### Deliverables
- Full replay system
- Ranked async ladder
- Rapid competitive mode
- Tournament management
- Statistics and leaderboards

---

## Technical Decisions

### Resolved

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Server language | Rust | Performance, safety, existing crates |
| Networking library | Renet | Reliable channels, auth, Bevy ecosystem |
| Serialization | bincode | Fast, deterministic, compact |
| Protocol | WebSocket + UDP | WS for lobby/chat, UDP for game state |
| Database | SQLite (saves) + Redis (sessions) | Simple, proven |
| Async runtime | tokio | Standard for Rust servers |

### Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Client-server protocol format | JSON / MessagePack / bincode | bincode (fastest, smallest) |
| Turn timer enforcement | Server-authoritative / Client-suggested | Server-authoritative |
| Replay storage | Local / Cloud / Both | Cloud with local cache |
| Browser support | Native only / WASM+WebRTC | Defer to post-launch |

---

## Risk Mitigation

### High Risk: Desync

**Problem**: Clients diverge from server state due to floating-point inconsistency or race conditions.

**Mitigations**:
1. Use fixed-point math for game logic
2. Server-authoritative state (clients are views)
3. Checksum validation every turn
4. Detailed desync logging for debugging
5. Automatic resync on checksum mismatch

### Medium Risk: Late-Game Performance

**Problem**: Large game states (many units, cities) cause slow serialization and high bandwidth.

**Mitigations**:
1. Delta compression (send changes, not full state)
2. Spatial partitioning (send only visible regions)
3. Lazy loading for replay
4. Compression (lz4) for network payloads

### Medium Risk: Abandonment / Griefing

**Problem**: Players abandon losing games, ruining experience for others.

**Mitigations**:
1. AI takeover on disconnect
2. Reputation system visible in lobby
3. Ranked penalties for abandonment
4. Democratic pause controls

### Low Risk: Server Scalability

**Problem**: Single server can't handle many concurrent games.

**Mitigations** (defer until needed):
1. Horizontal scaling (game instances on separate processes)
2. Regional servers
3. Dedicated game server hosting (e.g., Hathora, Agones)

---

## Dependencies

### External Services
- Cloud storage (AWS S3 / Cloudflare R2 / self-hosted MinIO)
- Push notification service (Firebase / OneSignal / self-hosted)
- Email service (SendGrid / Postmark / self-hosted)

### Crates
```toml
[dependencies]
renet = "0.0.16"
renet_netcode = "0.0.16"
tokio = { version = "1", features = ["full"] }
bincode = "1.3"
serde = { version = "1", features = ["derive"] }
sqlx = { version = "0.7", features = ["sqlite", "runtime-tokio"] }
redis = "0.24"
```

### Godot Addons
- GDExtension for Renet client (custom or WebSocket fallback)
- UI components for lobby, draft, spectator

---

## Success Metrics

### Phase 1 (MVP)
- [ ] 8-player game completes without desync
- [ ] Turn submission latency < 100ms (local)
- [ ] AI takeover works reliably on disconnect
- [ ] Save/load game state works correctly

### Phase 2 (Async)
- [ ] Async game completes over 1 week
- [ ] Push notifications arrive within 60 seconds
- [ ] Spectator can watch live game
- [ ] Draft/ban flow completes without errors

### Phase 3 (Competitive)
- [ ] Replay plays back identically to live game
- [ ] Ranked match completes with correct ELO update
- [ ] Rapid game finishes in target time (60-90 min)
- [ ] Tournament bracket resolves correctly

---

## Timeline Estimates

| Phase | Duration | Team Size |
|-------|----------|-----------|
| Phase 1: MVP | 2-3 months | 1-2 developers |
| Phase 2: Async | 3-4 months | 1-2 developers |
| Phase 3: Competitive | 4-6 months | 2-3 developers |

**Note**: Estimates assume multiplayer is the primary focus. Parallel work on single-player content can proceed independently.

---

## Appendix: File Structure

```
backbay-server/
├── Cargo.toml
├── src/
│   ├── main.rs              # Server entry point
│   ├── config.rs            # Server configuration
│   ├── network/
│   │   ├── mod.rs
│   │   ├── channels.rs      # Renet channel setup
│   │   ├── connection.rs    # Player connection handling
│   │   └── protocol.rs      # Message types
│   ├── game/
│   │   ├── mod.rs
│   │   ├── state.rs         # GameState struct
│   │   ├── simulation.rs    # Deterministic tick
│   │   ├── turn.rs          # Turn management
│   │   └── validation.rs    # Command validation
│   ├── lobby/
│   │   ├── mod.rs
│   │   ├── matchmaking.rs
│   │   └── draft.rs         # Draft/ban system
│   └── persistence/
│       ├── mod.rs
│       ├── saves.rs         # Game save/load
│       └── profiles.rs      # Player profiles
└── tests/
    ├── integration/
    └── simulation/
```
