//! Network protocol messages for multiplayer.
//!
//! Extends backbay-protocol with multiplayer-specific messages.

use serde::{Deserialize, Serialize};

use backbay_protocol::{
    CityId, CityUi, CombatPreview, Command, Event, Hex, PathPreview, PlayerId, ReplayFile,
    RulesCatalog, RulesNames, Snapshot, TurnPromise, UiProductionOption, UnitId, WhyPanel,
};

/// Client-to-server messages
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    /// Request to join the game
    JoinRequest {
        player_name: String,
        /// Optional reconnection token
        reconnect_token: Option<String>,
    },
    /// Authenticate with game code
    Authenticate { game_code: String },
    /// Set ready state in lobby
    SetReady { ready: bool },
    /// Request to start the game (host only)
    StartGame {
        /// Map size for generation
        map_size: u32,
    },
    /// Submit turn commands
    TurnSubmission {
        turn_number: u32,
        commands: Vec<Command>,
        end_turn: bool,
        /// Client's computed state checksum for desync detection
        state_checksum: u64,
    },
    /// Chat message
    Chat { message: String },
    /// Ping for latency measurement
    Ping { timestamp: u64 },
    /// Request current game state (for reconnection)
    RequestState,
    /// Request a shareable replay file (seed + rules hash + command log).
    RequestReplay,
    /// Query the player's current promise strip items.
    QueryPromiseStrip,
    /// Query UI-focused city summary for a given city.
    QueryCityUi { city: CityId },
    /// Query production options for a given city.
    QueryProductionOptions { city: CityId },
    /// Query combat preview between two units.
    QueryCombatPreview { attacker: UnitId, defender: UnitId },
    /// Query the combat "Why?" panel between two units.
    QueryCombatWhy { attacker: UnitId, defender: UnitId },
    /// Query movement/path preview for a unit to a destination hex.
    QueryPathPreview { unit: UnitId, destination: Hex },
    /// Query a maintenance "Why?" panel for the whole empire.
    QueryMaintenanceWhy { player: PlayerId },
    /// Query a maintenance "Why?" panel scoped to a city.
    QueryCityMaintenanceWhy { city: CityId },
    /// Confirm receipt of state update
    StateAck { turn_number: u32, checksum: u64 },
}

/// Server-to-client messages
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    /// Connection accepted
    JoinAccepted {
        player_id: PlayerId,
        reconnect_token: String,
    },
    /// Connection rejected
    JoinRejected { reason: JoinRejectReason },
    /// Current lobby state (sent on join and when lobby changes)
    LobbyState {
        players: Vec<LobbyPlayer>,
        host: PlayerId,
        min_players: u8,
        max_players: u8,
    },
    /// Player ready state changed
    PlayerReady { player_id: PlayerId, ready: bool },
    /// Game is starting
    GameStarting { countdown_ms: u32 },
    /// Full game state (initial sync or reconnection)
    GameState {
        snapshot: Snapshot,
        /// Server's checksum for verification
        checksum: u64,
    },
    /// Shareable replay export (seed + rules hash + command log).
    ReplayFile {
        replay: ReplayFile,
    },
    /// Replay export was denied or failed; includes a human-friendly message.
    ReplayDenied {
        message: String,
    },
    /// Rules names lookup table for UI rendering (techs/units/buildings/etc).
    RulesNames {
        names: RulesNames,
    },
    /// Full rules catalog for UI panels (tech tree, production, improvements).
    RulesCatalog {
        catalog: RulesCatalog,
    },
    /// Promise strip items for the receiving player.
    PromiseStrip {
        promises: Vec<TurnPromise>,
    },
    /// UI-focused city summary response.
    CityUi {
        city: CityUi,
    },
    /// Production options response for a city.
    ProductionOptions {
        city: CityId,
        options: Vec<UiProductionOption>,
    },
    /// Combat preview response between two units.
    CombatPreview {
        attacker: UnitId,
        defender: UnitId,
        preview: Option<CombatPreview>,
    },
    /// Path preview response for a unit/destination pair.
    PathPreview {
        unit: UnitId,
        destination: Hex,
        preview: PathPreview,
    },
    /// Generic "Why?" panel response.
    WhyPanel {
        kind: WhyPanelKind,
        panel: Option<WhyPanel>,
    },
    /// State delta for incremental updates
    StateDelta {
        turn_number: u32,
        deltas: Vec<StateDeltaEntry>,
        checksum: u64,
    },
    /// Turn started for a player
    TurnStarted {
        active_player: PlayerId,
        turn_number: u32,
        time_remaining_ms: u64,
    },
    /// Turn ended
    TurnEnded { player: PlayerId, turn_number: u32 },
    /// Player's turn commands were validated and applied
    TurnAccepted { turn_number: u32 },
    /// Turn commands rejected
    TurnRejected {
        turn_number: u32,
        reason: TurnRejectReason,
    },
    /// Desync detected - client should request full state
    DesyncDetected {
        turn_number: u32,
        expected_checksum: u64,
        received_checksum: u64,
    },
    /// Player connected
    PlayerConnected {
        player_id: PlayerId,
        player_name: String,
    },
    /// Player disconnected
    PlayerDisconnected {
        player_id: PlayerId,
        ai_takeover: bool,
    },
    /// Player reconnected (AI gives back control)
    PlayerReconnected { player_id: PlayerId },
    /// Chat message from another player
    Chat { from: PlayerId, message: String },
    /// Pong response
    Pong {
        client_timestamp: u64,
        server_timestamp: u64,
    },
    /// Server notification
    Notification { notification: ServerNotification },
    /// Game ended
    GameEnded { result: GameResult },
}

/// Reasons for rejecting a join request
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum JoinRejectReason {
    GameFull,
    GameInProgress,
    InvalidGameCode,
    InvalidReconnectToken,
    Banned,
}

/// Player info for lobby state
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LobbyPlayer {
    pub player_id: PlayerId,
    pub name: String,
    pub ready: bool,
    pub is_host: bool,
}

/// Reasons for rejecting a turn submission
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TurnRejectReason {
    NotYourTurn,
    InvalidTurnNumber,
    InvalidCommand { index: usize, reason: String },
    TimerExpired,
    ChecksumMismatch,
}

/// Incremental state changes.
///
/// These are emitted directly from the authoritative core simulation as `backbay_protocol::Event`
/// values (including per-player visibility events like `TileRevealed/TileHidden`).
pub type StateDeltaEntry = Event;

/// Server notifications
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerNotification {
    TurnTimerWarning {
        seconds_remaining: u32,
    },
    AITakeoverWarning {
        player_id: PlayerId,
        seconds_until: u32,
    },
    GamePaused {
        reason: String,
    },
    GameResumed,
}

/// Game result when game ends
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameResult {
    pub winner: Option<PlayerId>,
    pub victory_type: VictoryType,
    pub turns_played: u32,
    pub player_scores: Vec<(PlayerId, u32)>,
}

/// Victory conditions
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum VictoryType {
    Domination,
    Science,
    Culture,
    Score,
    Diplomatic,
    Concession,
}

/// Kinds of "Why?" panels exposed over the network.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum WhyPanelKind {
    Combat,
    Maintenance,
    CityMaintenance,
}

/// Serialize a client message for network transmission
pub fn serialize_client_message(msg: &ClientMessage) -> Result<Vec<u8>, rmp_serde::encode::Error> {
    rmp_serde::encode::to_vec(msg)
}

/// Deserialize a client message from network data
pub fn deserialize_client_message(data: &[u8]) -> Result<ClientMessage, rmp_serde::decode::Error> {
    rmp_serde::decode::from_slice(data)
}

/// Serialize a server message for network transmission
pub fn serialize_server_message(msg: &ServerMessage) -> Result<Vec<u8>, rmp_serde::encode::Error> {
    rmp_serde::encode::to_vec(msg)
}

/// Deserialize a server message from network data
pub fn deserialize_server_message(data: &[u8]) -> Result<ServerMessage, rmp_serde::decode::Error> {
    rmp_serde::decode::from_slice(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_client_message() {
        let msg = ClientMessage::TurnSubmission {
            turn_number: 42,
            commands: vec![],
            end_turn: true,
            state_checksum: 0xDEADBEEF,
        };
        let data = serialize_client_message(&msg).unwrap();
        let decoded: ClientMessage = deserialize_client_message(&data).unwrap();

        match decoded {
            ClientMessage::TurnSubmission {
                turn_number,
                end_turn,
                state_checksum,
                ..
            } => {
                assert_eq!(turn_number, 42);
                assert!(end_turn);
                assert_eq!(state_checksum, 0xDEADBEEF);
            }
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn roundtrip_server_message() {
        let msg = ServerMessage::TurnStarted {
            active_player: PlayerId(1),
            turn_number: 10,
            time_remaining_ms: 60000,
        };
        let data = serialize_server_message(&msg).unwrap();
        let decoded: ServerMessage = deserialize_server_message(&data).unwrap();

        match decoded {
            ServerMessage::TurnStarted {
                active_player,
                turn_number,
                time_remaining_ms,
            } => {
                assert_eq!(active_player, PlayerId(1));
                assert_eq!(turn_number, 10);
                assert_eq!(time_remaining_ms, 60000);
            }
            _ => panic!("Wrong message type"),
        }
    }
}
