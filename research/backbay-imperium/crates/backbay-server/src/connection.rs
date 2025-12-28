//! Connection management for multiplayer sessions.
//!
//! Handles player join/leave, reconnection, and AI takeover.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use backbay_protocol::PlayerId;
use rand::Rng;

/// Connection state for a player slot
#[derive(Clone, Debug)]
pub enum ConnectionState {
    /// Slot is empty, waiting for player
    Empty,
    /// Player connected and active
    Connected {
        client_id: u64,
        connected_at: Instant,
        last_activity: Instant,
    },
    /// Player disconnected, in grace period
    Disconnected {
        client_id: u64,
        disconnected_at: Instant,
        reconnect_token: String,
    },
    /// AI has taken over after grace period
    AIControlled {
        original_client_id: u64,
        reconnect_token: String,
        takeover_at: Instant,
    },
}

/// Player connection info
#[derive(Clone, Debug)]
pub struct PlayerConnection {
    pub player_id: PlayerId,
    pub player_name: String,
    pub state: ConnectionState,
    pub is_observer: bool,
}

/// Manages all player connections
pub struct ConnectionManager {
    /// Player slots (indexed by PlayerId)
    players: HashMap<PlayerId, PlayerConnection>,
    /// Client ID to PlayerId mapping
    client_to_player: HashMap<u64, PlayerId>,
    /// Reconnection tokens
    reconnect_tokens: HashMap<String, PlayerId>,
    /// Configuration
    max_players: u8,
    max_observers: u8,
    disconnect_grace: Duration,
}

impl ConnectionManager {
    pub fn new(max_players: u8, max_observers: u8, disconnect_grace: Duration) -> Self {
        Self {
            players: HashMap::new(),
            client_to_player: HashMap::new(),
            reconnect_tokens: HashMap::new(),
            max_players,
            max_observers,
            disconnect_grace,
        }
    }

    /// Get player count (excluding observers)
    pub fn player_count(&self) -> usize {
        self.players.values().filter(|p| !p.is_observer).count()
    }

    /// Get observer count
    pub fn observer_count(&self) -> usize {
        self.players.values().filter(|p| p.is_observer).count()
    }

    /// Check if a player slot is connected
    pub fn is_connected(&self, player_id: PlayerId) -> bool {
        self.players
            .get(&player_id)
            .map(|p| matches!(p.state, ConnectionState::Connected { .. }))
            .unwrap_or(false)
    }

    /// Get player by client ID
    pub fn get_player_by_client(&self, client_id: u64) -> Option<PlayerId> {
        self.client_to_player.get(&client_id).copied()
    }

    /// Get player connection info
    pub fn get_player(&self, player_id: PlayerId) -> Option<&PlayerConnection> {
        self.players.get(&player_id)
    }

    /// Attempt to add a new player
    pub fn add_player(
        &mut self,
        client_id: u64,
        player_name: String,
        is_observer: bool,
    ) -> Result<(PlayerId, String), AddPlayerError> {
        // Check limits
        if is_observer {
            if self.observer_count() >= self.max_observers as usize {
                return Err(AddPlayerError::ObserversFull);
            }
        } else if self.player_count() >= self.max_players as usize {
            return Err(AddPlayerError::GameFull);
        }

        // Find next available player ID
        let player_id = self.next_available_player_id()?;

        // Generate reconnection token
        let reconnect_token = generate_reconnect_token();

        let now = Instant::now();
        let connection = PlayerConnection {
            player_id,
            player_name,
            state: ConnectionState::Connected {
                client_id,
                connected_at: now,
                last_activity: now,
            },
            is_observer,
        };

        self.players.insert(player_id, connection);
        self.client_to_player.insert(client_id, player_id);
        self.reconnect_tokens
            .insert(reconnect_token.clone(), player_id);

        Ok((player_id, reconnect_token))
    }

    /// Attempt to reconnect a player
    pub fn reconnect(
        &mut self,
        client_id: u64,
        reconnect_token: &str,
    ) -> Result<PlayerId, ReconnectError> {
        let player_id = self
            .reconnect_tokens
            .get(reconnect_token)
            .copied()
            .ok_or(ReconnectError::InvalidToken)?;

        let player = self
            .players
            .get_mut(&player_id)
            .ok_or(ReconnectError::PlayerNotFound)?;

        match &player.state {
            ConnectionState::Disconnected { .. } | ConnectionState::AIControlled { .. } => {
                // Reconnection allowed
                let now = Instant::now();
                player.state = ConnectionState::Connected {
                    client_id,
                    connected_at: now,
                    last_activity: now,
                };
                self.client_to_player.insert(client_id, player_id);
                Ok(player_id)
            }
            ConnectionState::Connected { .. } => Err(ReconnectError::AlreadyConnected),
            ConnectionState::Empty => Err(ReconnectError::PlayerNotFound),
        }
    }

    /// Handle client disconnection
    pub fn disconnect(&mut self, client_id: u64) -> Option<PlayerId> {
        let player_id = self.client_to_player.remove(&client_id)?;
        let player = self.players.get_mut(&player_id)?;

        if let ConnectionState::Connected { .. } = &player.state {
            let reconnect_token = generate_reconnect_token();
            self.reconnect_tokens
                .insert(reconnect_token.clone(), player_id);

            player.state = ConnectionState::Disconnected {
                client_id,
                disconnected_at: Instant::now(),
                reconnect_token,
            };
        }

        Some(player_id)
    }

    /// Update activity timestamp for a client
    pub fn update_activity(&mut self, client_id: u64) {
        if let Some(player_id) = self.client_to_player.get(&client_id) {
            if let Some(player) = self.players.get_mut(player_id) {
                if let ConnectionState::Connected { last_activity, .. } = &mut player.state {
                    *last_activity = Instant::now();
                }
            }
        }
    }

    /// Check for players that need AI takeover
    /// Returns list of player IDs that transitioned to AI control
    pub fn process_disconnections(&mut self) -> Vec<PlayerId> {
        let now = Instant::now();
        let grace = self.disconnect_grace;
        let mut ai_takeovers = Vec::new();

        for (player_id, player) in &mut self.players {
            if let ConnectionState::Disconnected {
                client_id,
                disconnected_at,
                reconnect_token,
            } = &player.state
            {
                if now.duration_since(*disconnected_at) >= grace {
                    player.state = ConnectionState::AIControlled {
                        original_client_id: *client_id,
                        reconnect_token: reconnect_token.clone(),
                        takeover_at: now,
                    };
                    ai_takeovers.push(*player_id);
                }
            }
        }

        ai_takeovers
    }

    /// Get all connected client IDs
    pub fn connected_clients(&self) -> Vec<u64> {
        self.players
            .values()
            .filter_map(|p| {
                if let ConnectionState::Connected { client_id, .. } = p.state {
                    Some(client_id)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Get all active player IDs (connected or AI-controlled)
    pub fn active_players(&self) -> Vec<PlayerId> {
        self.players
            .values()
            .filter(|p| !p.is_observer)
            .filter(|p| !matches!(p.state, ConnectionState::Empty))
            .map(|p| p.player_id)
            .collect()
    }

    /// Check if a player is under AI control
    pub fn is_ai_controlled(&self, player_id: PlayerId) -> bool {
        self.players
            .get(&player_id)
            .map(|p| matches!(p.state, ConnectionState::AIControlled { .. }))
            .unwrap_or(false)
    }

    fn next_available_player_id(&self) -> Result<PlayerId, AddPlayerError> {
        for i in 0..self.max_players {
            let id = PlayerId(i);
            if !self.players.contains_key(&id) {
                return Ok(id);
            }
        }
        Err(AddPlayerError::GameFull)
    }
}

/// Errors when adding a player
#[derive(Clone, Debug)]
pub enum AddPlayerError {
    GameFull,
    ObserversFull,
    GameInProgress,
}

/// Errors when reconnecting
#[derive(Clone, Debug)]
pub enum ReconnectError {
    InvalidToken,
    PlayerNotFound,
    AlreadyConnected,
}

/// Generate a secure reconnection token
fn generate_reconnect_token() -> String {
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
    fn add_and_disconnect_player() {
        let mut manager = ConnectionManager::new(4, 2, Duration::from_secs(60));

        // Add player
        let (player_id, token) = manager.add_player(100, "Alice".into(), false).unwrap();
        assert_eq!(player_id, PlayerId(0));
        assert!(manager.is_connected(player_id));

        // Disconnect
        let disconnected = manager.disconnect(100);
        assert_eq!(disconnected, Some(player_id));
        assert!(!manager.is_connected(player_id));

        // Reconnect
        let reconnected = manager.reconnect(101, &token);
        assert_eq!(reconnected.unwrap(), player_id);
        assert!(manager.is_connected(player_id));
    }

    #[test]
    fn ai_takeover_after_grace_period() {
        let mut manager = ConnectionManager::new(4, 2, Duration::from_millis(10));

        let (player_id, _) = manager.add_player(100, "Bob".into(), false).unwrap();
        manager.disconnect(100);

        // Before grace period
        let takeovers = manager.process_disconnections();
        assert!(takeovers.is_empty());

        // Wait for grace period
        std::thread::sleep(Duration::from_millis(15));

        // After grace period
        let takeovers = manager.process_disconnections();
        assert_eq!(takeovers, vec![player_id]);
        assert!(manager.is_ai_controlled(player_id));
    }
}
