//! Unified player management combining lobby and connection state.
//!
//! Prevents race conditions by managing player lifecycle atomically.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use backbay_protocol::PlayerId;
use rand::Rng;

use crate::protocol::LobbyPlayer;

/// Player lifecycle state
#[derive(Clone, Debug)]
pub enum PlayerState {
    /// In lobby, waiting for game to start
    InLobby { ready: bool },
    /// Connected and playing
    Playing {
        connected_at: Instant,
        last_activity: Instant,
    },
    /// Disconnected during game, in grace period
    Disconnected { disconnected_at: Instant },
    /// AI has taken over after grace period
    AIControlled { takeover_at: Instant },
}

/// Unified player info
#[derive(Clone, Debug)]
pub struct Player {
    pub player_id: PlayerId,
    pub name: String,
    pub client_id: Option<u64>,
    pub reconnect_token: String,
    pub state: PlayerState,
    pub is_observer: bool,
    /// Rate limiting: message count in current window
    pub message_count: u32,
    /// Rate limiting: window start time
    pub rate_window_start: Instant,
}

/// Unified player manager handling lobby, connections, and game state
pub struct PlayerManager {
    /// All players
    players: HashMap<PlayerId, Player>,
    /// Client ID to player mapping
    client_to_player: HashMap<u64, PlayerId>,
    /// Reconnection tokens
    tokens: HashMap<String, PlayerId>,
    /// Host player ID
    host: Option<PlayerId>,
    /// Whether game has started
    game_started: bool,
    /// Configuration
    min_players: u8,
    max_players: u8,
    max_observers: u8,
    disconnect_grace: Duration,
    /// Rate limit config
    rate_limit_messages: u32,
    rate_limit_window: Duration,
}

/// Errors when adding a player
#[derive(Clone, Debug, thiserror::Error)]
pub enum AddPlayerError {
    #[error("Game is full")]
    GameFull,
    #[error("Observers full")]
    ObserversFull,
    #[error("Game already started")]
    GameInProgress,
    #[error("Player already exists")]
    AlreadyExists,
}

/// Errors when reconnecting
#[derive(Clone, Debug, thiserror::Error)]
pub enum ReconnectError {
    #[error("Invalid reconnect token")]
    InvalidToken,
    #[error("Player not found")]
    PlayerNotFound,
    #[error("Player already connected")]
    AlreadyConnected,
    #[error("Cannot reconnect during lobby")]
    NotInGame,
}

/// Errors for lobby operations
#[derive(Clone, Debug, thiserror::Error)]
pub enum LobbyError {
    #[error("Game already started")]
    GameAlreadyStarted,
    #[error("Player not in lobby")]
    PlayerNotFound,
    #[error("Cannot start: not enough players or not all ready")]
    CannotStart,
    #[error("Only host can perform this action")]
    NotHost,
}

impl PlayerManager {
    pub fn new(
        min_players: u8,
        max_players: u8,
        max_observers: u8,
        disconnect_grace: Duration,
    ) -> Self {
        Self {
            players: HashMap::new(),
            client_to_player: HashMap::new(),
            tokens: HashMap::new(),
            host: None,
            game_started: false,
            min_players,
            max_players,
            max_observers,
            disconnect_grace,
            rate_limit_messages: 60, // 60 messages per window
            rate_limit_window: Duration::from_secs(1), // 1 second window
        }
    }

    /// Add a new player (handles both lobby and connection state atomically)
    pub fn add_player(
        &mut self,
        client_id: u64,
        name: String,
        is_observer: bool,
    ) -> Result<(PlayerId, String), AddPlayerError> {
        // Check if game started (non-observers can't join mid-game)
        if self.game_started && !is_observer {
            return Err(AddPlayerError::GameInProgress);
        }

        // Check limits
        if is_observer {
            if self.observer_count() >= self.max_observers as usize {
                return Err(AddPlayerError::ObserversFull);
            }
        } else if self.player_count() >= self.max_players as usize {
            return Err(AddPlayerError::GameFull);
        }

        // Find next available ID
        let player_id = self.next_player_id()?;
        let token = generate_token();
        let now = Instant::now();

        let state = if self.game_started {
            PlayerState::Playing {
                connected_at: now,
                last_activity: now,
            }
        } else {
            PlayerState::InLobby { ready: false }
        };

        let player = Player {
            player_id,
            name,
            client_id: Some(client_id),
            reconnect_token: token.clone(),
            state,
            is_observer,
            message_count: 0,
            rate_window_start: now,
        };

        self.players.insert(player_id, player);
        self.client_to_player.insert(client_id, player_id);
        self.tokens.insert(token.clone(), player_id);

        // First non-observer becomes host
        if self.host.is_none() && !is_observer {
            self.host = Some(player_id);
        }

        Ok((player_id, token))
    }

    /// Reconnect a player using their token
    pub fn reconnect(&mut self, client_id: u64, token: &str) -> Result<PlayerId, ReconnectError> {
        let player_id = self
            .tokens
            .get(token)
            .copied()
            .ok_or(ReconnectError::InvalidToken)?;

        let player = self
            .players
            .get_mut(&player_id)
            .ok_or(ReconnectError::PlayerNotFound)?;

        match &player.state {
            PlayerState::InLobby { .. } => Err(ReconnectError::NotInGame),
            PlayerState::Playing { .. } => Err(ReconnectError::AlreadyConnected),
            PlayerState::Disconnected { .. } | PlayerState::AIControlled { .. } => {
                let now = Instant::now();
                player.state = PlayerState::Playing {
                    connected_at: now,
                    last_activity: now,
                };
                player.client_id = Some(client_id);
                self.client_to_player.insert(client_id, player_id);
                Ok(player_id)
            }
        }
    }

    /// Handle client disconnect
    pub fn disconnect(&mut self, client_id: u64) -> Option<PlayerId> {
        let player_id = self.client_to_player.remove(&client_id)?;
        let player = self.players.get_mut(&player_id)?;

        match &player.state {
            PlayerState::InLobby { .. } => {
                // Remove from lobby entirely
                self.players.remove(&player_id);
                self.tokens.retain(|_, id| *id != player_id);

                // Reassign host if needed
                if self.host == Some(player_id) {
                    self.host = self
                        .players
                        .keys()
                        .find(|id| !self.players.get(id).is_none_or(|p| p.is_observer))
                        .copied();
                }
            }
            PlayerState::Playing { .. } => {
                // Transition to disconnected (grace period)
                player.state = PlayerState::Disconnected {
                    disconnected_at: Instant::now(),
                };
                player.client_id = None;
            }
            _ => {}
        }

        Some(player_id)
    }

    /// Set ready state for a player in lobby
    pub fn set_ready(&mut self, player_id: PlayerId, ready: bool) -> Result<(), LobbyError> {
        if self.game_started {
            return Err(LobbyError::GameAlreadyStarted);
        }

        let player = self
            .players
            .get_mut(&player_id)
            .ok_or(LobbyError::PlayerNotFound)?;

        if let PlayerState::InLobby { ready: r } = &mut player.state {
            *r = ready;
            Ok(())
        } else {
            Err(LobbyError::PlayerNotFound)
        }
    }

    /// Check if game can start (enough ready players)
    pub fn can_start(&self) -> bool {
        if self.game_started {
            return false;
        }

        let ready_count = self
            .players
            .values()
            .filter(|p| !p.is_observer)
            .filter(|p| matches!(p.state, PlayerState::InLobby { ready: true }))
            .count();

        let player_count = self.player_count();

        player_count >= self.min_players as usize && ready_count == player_count
    }

    /// Start the game - transitions all lobby players to playing state
    pub fn start_game(&mut self) -> Result<Vec<PlayerId>, LobbyError> {
        if self.game_started {
            return Err(LobbyError::GameAlreadyStarted);
        }

        if !self.can_start() {
            return Err(LobbyError::CannotStart);
        }

        self.game_started = true;
        let now = Instant::now();

        // Transition all lobby players to playing
        let mut player_ids = Vec::new();
        for player in self.players.values_mut() {
            if !player.is_observer {
                if let PlayerState::InLobby { .. } = player.state {
                    player.state = PlayerState::Playing {
                        connected_at: now,
                        last_activity: now,
                    };
                    player_ids.push(player.player_id);
                }
            }
        }

        player_ids.sort_by_key(|p| p.0);
        Ok(player_ids)
    }

    /// Process disconnected players for AI takeover
    pub fn process_disconnections(&mut self) -> Vec<PlayerId> {
        let now = Instant::now();
        let grace = self.disconnect_grace;
        let mut ai_takeovers = Vec::new();

        for player in self.players.values_mut() {
            if let PlayerState::Disconnected { disconnected_at } = player.state {
                if now.duration_since(disconnected_at) >= grace {
                    player.state = PlayerState::AIControlled { takeover_at: now };
                    ai_takeovers.push(player.player_id);
                }
            }
        }

        ai_takeovers
    }

    /// Update activity timestamp for rate limiting
    pub fn update_activity(&mut self, client_id: u64) {
        if let Some(player_id) = self.client_to_player.get(&client_id) {
            if let Some(player) = self.players.get_mut(player_id) {
                if let PlayerState::Playing { last_activity, .. } = &mut player.state {
                    *last_activity = Instant::now();
                }
            }
        }
    }

    /// Check and update rate limit for a client
    /// Returns true if message is allowed, false if rate limited
    pub fn check_rate_limit(&mut self, client_id: u64) -> bool {
        let Some(player_id) = self.client_to_player.get(&client_id).copied() else {
            return true; // Unknown client - let message through for error handling
        };

        let Some(player) = self.players.get_mut(&player_id) else {
            return true;
        };

        let now = Instant::now();

        // Reset window if expired
        if now.duration_since(player.rate_window_start) >= self.rate_limit_window {
            player.rate_window_start = now;
            player.message_count = 0;
        }

        player.message_count += 1;

        player.message_count <= self.rate_limit_messages
    }

    /// Get rate limit info for a player (for diagnostics)
    pub fn get_rate_limit_info(&self, player_id: PlayerId) -> Option<(u32, Duration)> {
        self.players.get(&player_id).map(|p| {
            let elapsed = p.rate_window_start.elapsed();
            let remaining = self.rate_limit_window.saturating_sub(elapsed);
            (p.message_count, remaining)
        })
    }

    // --- Query methods ---

    pub fn get_player(&self, player_id: PlayerId) -> Option<&Player> {
        self.players.get(&player_id)
    }

    pub fn get_player_name(&self, player_id: PlayerId) -> Option<String> {
        self.players.get(&player_id).map(|p| p.name.clone())
    }

    pub fn get_player_by_client(&self, client_id: u64) -> Option<PlayerId> {
        self.client_to_player.get(&client_id).copied()
    }

    pub fn is_host(&self, player_id: PlayerId) -> bool {
        self.host == Some(player_id)
    }

    pub fn host(&self) -> Option<PlayerId> {
        self.host
    }

    pub fn has_started(&self) -> bool {
        self.game_started
    }

    pub fn player_count(&self) -> usize {
        self.players.values().filter(|p| !p.is_observer).count()
    }

    pub fn observer_count(&self) -> usize {
        self.players.values().filter(|p| p.is_observer).count()
    }

    pub fn is_connected(&self, player_id: PlayerId) -> bool {
        self.players
            .get(&player_id)
            .map(|p| matches!(p.state, PlayerState::Playing { .. }))
            .unwrap_or(false)
    }

    pub fn is_ai_controlled(&self, player_id: PlayerId) -> bool {
        self.players
            .get(&player_id)
            .map(|p| matches!(p.state, PlayerState::AIControlled { .. }))
            .unwrap_or(false)
    }

    pub fn connected_clients(&self) -> Vec<u64> {
        self.players.values().filter_map(|p| p.client_id).collect()
    }

    pub fn active_players(&self) -> Vec<PlayerId> {
        self.players
            .values()
            .filter(|p| !p.is_observer)
            .filter(|p| !matches!(p.state, PlayerState::InLobby { .. }))
            .map(|p| p.player_id)
            .collect()
    }

    pub fn get_lobby_state(&self) -> Vec<LobbyPlayer> {
        self.players
            .values()
            .filter(|p| !p.is_observer)
            .filter(|p| matches!(p.state, PlayerState::InLobby { .. }))
            .map(|p| {
                let ready = matches!(p.state, PlayerState::InLobby { ready: true });
                LobbyPlayer {
                    player_id: p.player_id,
                    name: p.name.clone(),
                    ready,
                    is_host: self.host == Some(p.player_id),
                }
            })
            .collect()
    }

    pub fn min_players(&self) -> u8 {
        self.min_players
    }

    pub fn max_players(&self) -> u8 {
        self.max_players
    }

    fn next_player_id(&self) -> Result<PlayerId, AddPlayerError> {
        for i in 0..self.max_players {
            let id = PlayerId(i);
            if !self.players.contains_key(&id) {
                return Ok(id);
            }
        }
        Err(AddPlayerError::GameFull)
    }
}

fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    (0..32)
        .map(|_| {
            let idx = rng.gen_range(0..36);
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_player_becomes_host() {
        let mut mgr = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

        let (p1, _) = mgr.add_player(100, "Alice".into(), false).unwrap();
        assert_eq!(mgr.host(), Some(p1));

        let (p2, _) = mgr.add_player(101, "Bob".into(), false).unwrap();
        assert_eq!(mgr.host(), Some(p1)); // Still Alice

        // Remove host
        mgr.disconnect(100);
        assert_eq!(mgr.host(), Some(p2)); // Bob is now host
    }

    #[test]
    fn lobby_to_game_transition() {
        let mut mgr = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

        let (p1, _) = mgr.add_player(100, "Alice".into(), false).unwrap();
        let (p2, _) = mgr.add_player(101, "Bob".into(), false).unwrap();

        assert!(!mgr.can_start()); // Not ready

        mgr.set_ready(p1, true).unwrap();
        assert!(!mgr.can_start()); // Still not all ready

        mgr.set_ready(p2, true).unwrap();
        assert!(mgr.can_start());

        let players = mgr.start_game().unwrap();
        assert_eq!(players, vec![p1, p2]);
        assert!(mgr.has_started());

        // Players are now in Playing state
        assert!(mgr.is_connected(p1));
        assert!(mgr.is_connected(p2));
    }

    #[test]
    fn reconnection_flow() {
        let mut mgr = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

        let (p1, token1) = mgr.add_player(100, "Alice".into(), false).unwrap();
        mgr.add_player(101, "Bob".into(), false).unwrap();
        mgr.set_ready(p1, true).unwrap();
        mgr.set_ready(PlayerId(1), true).unwrap();
        mgr.start_game().unwrap();

        // Disconnect during game
        mgr.disconnect(100);
        assert!(!mgr.is_connected(p1));

        // Reconnect
        let reconnected = mgr.reconnect(102, &token1).unwrap();
        assert_eq!(reconnected, p1);
        assert!(mgr.is_connected(p1));
    }

    #[test]
    fn rate_limiting() {
        let mut mgr = PlayerManager::new(2, 4, 2, Duration::from_secs(60));
        mgr.rate_limit_messages = 5;
        mgr.rate_limit_window = Duration::from_millis(100);

        mgr.add_player(100, "Alice".into(), false).unwrap();

        // First 5 messages should pass
        for _ in 0..5 {
            assert!(mgr.check_rate_limit(100));
        }

        // 6th should be rate limited
        assert!(!mgr.check_rate_limit(100));

        // Wait for window reset
        std::thread::sleep(Duration::from_millis(110));
        assert!(mgr.check_rate_limit(100));
    }

    #[test]
    fn ai_takeover() {
        let mut mgr = PlayerManager::new(2, 4, 2, Duration::from_millis(10));

        let (p1, _) = mgr.add_player(100, "Alice".into(), false).unwrap();
        mgr.add_player(101, "Bob".into(), false).unwrap();
        mgr.set_ready(p1, true).unwrap();
        mgr.set_ready(PlayerId(1), true).unwrap();
        mgr.start_game().unwrap();

        mgr.disconnect(100);

        // Before grace period
        assert!(mgr.process_disconnections().is_empty());

        std::thread::sleep(Duration::from_millis(15));

        // After grace period
        let takeovers = mgr.process_disconnections();
        assert_eq!(takeovers, vec![p1]);
        assert!(mgr.is_ai_controlled(p1));
    }
}
