# Backbay Imperium — Open Source Resources

> Projects, libraries, and code to reference or integrate for multiplayer and game systems.

---

## 1) Networking Libraries (Rust)

### GGRS — Rollback Networking
**https://github.com/gschup/ggrs** | 625 stars | MIT/Apache-2.0

Reimagination of GGPO for Rust. P2P rollback networking.

**Relevance**: While rollback is typically for fighting games, the deterministic simulation patterns are directly applicable to turn-based strategy.

**Key Features**:
- Deterministic simulation framework
- State save/load callbacks
- Spectator support
- Input delay handling

**Copy-worthy**:
```rust
// GGRS callback pattern - clean separation of concerns
fn ggrs_advance_frame(inputs: Vec<Input>) { ... }
fn ggrs_save_game_state() -> Vec<u8> { ... }
fn ggrs_load_game_state(buffer: Vec<u8>) { ... }
```

**Godot Integration**: https://github.com/marcello505/godot-ggrs-wrapper (Godot 3.x only, but patterns transferable)

---

### Renet — Server/Client Networking
**https://github.com/lucaspoffo/renet** | 859 stars | MIT/Apache-2.0

Server/client network library for multiplayer games. More traditional architecture than GGRS.

**Relevance**: Better fit for turn-based games with authoritative server model.

**Key Features**:
- Multiple channel types:
  - `ReliableOrdered` — guaranteed delivery and order (perfect for turn commands)
  - `ReliableUnordered` — guaranteed delivery, no order
  - `Unreliable` — UDP-style fire-and-forget
- Authentication via `renet_netcode`
- Steam transport via `renet_steam`
- Built-in visualizer for debugging

**Copy-worthy**:
```rust
// Channel configuration - exactly what turn-based needs
let channel = ChannelConfig {
    channel_id: 0,
    max_memory_usage_bytes: 5 * 1024 * 1024,
    send_type: SendType::ReliableOrdered {
        resend_time: Duration::from_millis(300)
    },
};
```

**Bevy Plugin**: `bevy_renet` — production-ready integration

---

### Matchbox — WebRTC P2P
**https://github.com/johanhelsing/matchbox** | 1.1k stars | MIT/Apache-2.0

Painless peer-to-peer WebRTC networking for Rust (WASM and native).

**Relevance**: Enables browser-based multiplayer and WASM deployment.

**Key Features**:
- Works in browsers via WebRTC
- Includes signaling server (`matchbox_server`)
- GGRS-compatible socket
- Bevy integration (`bevy_matchbox`)

**Copy-worthy**: Full signaling server implementation for WebRTC peer discovery.

**Live Demo**: https://helsing.studio/box_game/ (4-player browser game)

---

## 2) Open Source 4X/Civ Games

### Unciv — Civ V Clone
**https://github.com/yairm210/Unciv** | 9.9k stars | MPL-2.0

Most popular open-source Civ clone. Kotlin/LibGDX. Android/Desktop.

**Relevance**: Closest to Backbay Imperium's target. Has multiplayer.

**Multiplayer Architecture** (from `/server/` directory):
- Simple turn-based multiplayer server
- Game state stored as JSON files
- Polling-based turn detection
- Self-hostable Docker container

**Copy-worthy**:
- Complete 4X game systems (combat, diplomacy, research, cities)
- Moddability architecture
- Turn validation logic
- Save/load serialization patterns

**Limitations**: Multiplayer is basic (polling, not real-time notifications)

---

### Freeciv21 — Freeciv Fork
**https://github.com/longturn/freeciv21** | 253 stars | GPL-3.0

Modern fork of Freeciv focused on competitive multiplayer. C++/Qt6.

**Relevance**: Mature multiplayer 4X with active competitive community (Longturn).

**Multiplayer Architecture**:
- Dedicated server model (`freeciv21-server`)
- Client-server protocol
- Hot-join support
- Async/"Play by Email" style via Longturn website

**Copy-worthy**:
- 30+ years of battle-tested multiplayer code
- Server architecture patterns
- Competitive balance considerations
- AI opponent systems

**Community**: Active multiplayer community at longturn.net — study their game formats

---

### OpenCiv3 (C7-Game)
**https://github.com/C7-Game/Prototype** | Godot/C#

Open-source Civ III remake using Godot Engine.

**Relevance**: Same engine as Backbay Imperium (Godot).

**Copy-worthy**:
- Godot-native 4X architecture
- Hex grid implementation in Godot
- Turn management in GDScript/C#

---

## 3) Strategy Game Examples (Rust/Bevy)

### Digital Extinction — RTS in Bevy
**https://github.com/DigitalExtinction/Game** | 362 stars | AGPL-3.0

3D RTS game built entirely in Rust with Bevy.

**Relevance**: Real-time strategy, but shows Bevy patterns for complex games.

**Copy-worthy**:
- Bevy ECS architecture for strategy games
- Multiplayer networking integration
- Unit selection and control systems
- Pathfinding implementation

---

## 4) Deterministic Simulation Resources

### Deterministic Lockstep Demo
**https://github.com/pietrobassi/deterministic-lockstep-demo** | TypeScript

Educational implementation of deterministic lockstep networking.

**Key Concepts Explained**:
1. **Determinism**: Game logic must behave identically on all machines
2. **Fixed-point math**: Uses `decimal.js` for consistent floating-point
3. **Input delay buffering**: Compensates for network latency
4. **UDP redundancy**: Re-sends unacknowledged commands

**Copy-worthy**: Clean explanation of lockstep fundamentals

**Live Demo**: https://lockstep.pietrobassi.com/

---

## 5) Recommended Integration Path

### For Godot + Rust Backend (Your Stack)

```
┌─────────────────────────────────────────────────────────┐
│  Godot 4 Client (GDScript/C#)                          │
│  - UI, rendering, input                                 │
│  - Local game state mirror                              │
└─────────────────────┬───────────────────────────────────┘
                      │ Commands (WebSocket/UDP)
┌─────────────────────▼───────────────────────────────────┐
│  Rust Server (Renet or custom)                          │
│  - Authoritative game state                             │
│  - Turn validation                                      │
│  - Deterministic simulation                             │
│  - Save/load (async cloud storage)                      │
└─────────────────────────────────────────────────────────┘
```

**Library Recommendations**:

| Component | Library | Reason |
|-----------|---------|--------|
| Server networking | **Renet** | Mature, reliable channels, auth built-in |
| WebRTC (browser) | **Matchbox** | If browser client needed |
| Serialization | **bincode** or **rmp-serde** | Fast, deterministic |
| Async runtime | **tokio** | Standard for Rust servers |
| Database | **SQLite** (saves) + **Redis** (sessions) | Simple, proven |

---

## 6) Code Patterns to Study

### Turn Submission (from Unciv)
```kotlin
// Unciv's simple but effective pattern
class TurnSubmission {
    val gameId: String
    val playerId: String
    val turnNumber: Int
    val actions: List<GameAction>
    val checksum: String  // For desync detection
}
```

### State Serialization (from GGRS pattern)
```rust
// Deterministic save/load for rollback or replay
trait GameState {
    fn save(&self) -> Vec<u8>;
    fn load(&mut self, data: &[u8]);
    fn checksum(&self) -> u64;  // Fast hash for desync detection
}
```

### Channel Design (from Renet)
```rust
// Separate channels for different data types
enum GameChannel {
    // Turn commands - must arrive in order, must be reliable
    Commands = 0,  // ReliableOrdered

    // Chat messages - reliable but order less critical
    Chat = 1,      // ReliableUnordered

    // Ping/keepalive - can be lost
    Heartbeat = 2, // Unreliable
}
```

### Disconnect Handling (composite pattern)
```rust
enum DisconnectAction {
    // Grace period for reconnection
    HoldForReconnect { timeout: Duration },

    // AI takes over after timeout
    AITakeover { ai_difficulty: AIDifficulty },

    // Pause game and wait for vote
    PauseAndVote,

    // Forfeit (ranked games)
    Forfeit,
}
```

---

## 7) What NOT to Copy

### Avoid These Patterns

| Pattern | Problem | Found In |
|---------|---------|----------|
| Polling for turns | High latency, wasted bandwidth | Unciv |
| JSON over network | Slow, large payloads | Many games |
| Client-authoritative | Cheating vulnerability | - |
| Synchronous file I/O | Server blocking | Freeciv |
| Global mutable state | Threading nightmares | Legacy code |

---

## 8) Quick Reference: License Compatibility

| Project | License | Can Copy? | Notes |
|---------|---------|-----------|-------|
| GGRS | MIT/Apache-2.0 | ✅ Yes | Permissive |
| Renet | MIT/Apache-2.0 | ✅ Yes | Permissive |
| Matchbox | MIT/Apache-2.0 | ✅ Yes | Permissive |
| Unciv | MPL-2.0 | ⚠️ Careful | File-level copyleft |
| Freeciv21 | GPL-3.0 | ❌ Study only | Strong copyleft |
| Digital Extinction | AGPL-3.0 | ❌ Study only | Network copyleft |

**Recommendation**: Prefer MIT/Apache-2.0 libraries. Study GPL code for patterns but reimplement cleanly.

---

## 9) Next Steps

1. **Prototype with Renet**: Set up basic Rust server with reliable channels
2. **Study Unciv's multiplayer**: Clone repo, trace turn submission flow
3. **Benchmark serialization**: Test bincode vs MessagePack for game state
4. **Design command schema**: Define turn submission format (see MULTIPLAYER_TECHNICAL.md)
5. **Evaluate Matchbox**: If browser play is a goal, prototype WebRTC signaling

---

## Resources

- GGRS Wiki: https://github.com/gschup/ggrs/wiki
- Renet Docs: https://docs.rs/renet
- Matchbox Tutorial: https://johanhelsing.studio/posts/extreme-bevy
- Freeciv21 Docs: https://longturn.readthedocs.io/
- Unciv Docs: https://yairm210.github.io/Unciv/
