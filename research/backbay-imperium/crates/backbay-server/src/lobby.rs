//! Lobby management for pre-game player coordination.
//!
//! Handles player ready states and game start conditions.

use std::collections::HashMap;

use backbay_protocol::PlayerId;

use crate::protocol::LobbyPlayer;

/// Lobby state before game starts
#[derive(Debug, Clone)]
pub struct Lobby {
    /// Player info by player ID
    players: HashMap<PlayerId, PlayerInfo>,
    /// Host player (first to join, or reassigned if host leaves)
    host: Option<PlayerId>,
    /// Minimum players required to start
    min_players: u8,
    /// Maximum players allowed
    max_players: u8,
    /// Whether the game has started
    started: bool,
}

/// Per-player lobby info
#[derive(Debug, Clone)]
struct PlayerInfo {
    name: String,
    ready: bool,
}

impl Lobby {
    /// Create a new lobby with player limits
    pub fn new(min_players: u8, max_players: u8) -> Self {
        Self {
            players: HashMap::new(),
            host: None,
            min_players,
            max_players,
            started: false,
        }
    }

    /// Add a player to the lobby
    pub fn add_player(&mut self, player_id: PlayerId, name: String) -> Result<(), LobbyError> {
        if self.started {
            return Err(LobbyError::GameAlreadyStarted);
        }

        if self.players.len() >= self.max_players as usize {
            return Err(LobbyError::LobbyFull);
        }

        if self.players.contains_key(&player_id) {
            return Err(LobbyError::AlreadyInLobby);
        }

        self.players
            .insert(player_id, PlayerInfo { name, ready: false });

        // First player becomes host
        if self.host.is_none() {
            self.host = Some(player_id);
        }

        Ok(())
    }

    /// Remove a player from the lobby
    pub fn remove_player(&mut self, player_id: PlayerId) -> bool {
        if self.players.remove(&player_id).is_some() {
            // Reassign host if needed
            if self.host == Some(player_id) {
                self.host = self.players.keys().next().copied();
            }
            true
        } else {
            false
        }
    }

    /// Set a player's ready state
    pub fn set_ready(&mut self, player_id: PlayerId, ready: bool) -> Result<(), LobbyError> {
        if self.started {
            return Err(LobbyError::GameAlreadyStarted);
        }

        let info = self
            .players
            .get_mut(&player_id)
            .ok_or(LobbyError::NotInLobby)?;
        info.ready = ready;
        Ok(())
    }

    /// Check if a player is ready
    pub fn is_ready(&self, player_id: PlayerId) -> bool {
        self.players.get(&player_id).is_some_and(|p| p.ready)
    }

    /// Check if the game can start (enough players and all ready)
    pub fn can_start(&self) -> bool {
        if self.started {
            return false;
        }

        let player_count = self.players.len();
        if player_count < self.min_players as usize {
            return false;
        }

        self.players.values().all(|p| p.ready)
    }

    /// Start the game (returns player order)
    pub fn start(&mut self) -> Result<Vec<PlayerId>, LobbyError> {
        if self.started {
            return Err(LobbyError::GameAlreadyStarted);
        }

        if !self.can_start() {
            return Err(LobbyError::CannotStart);
        }

        self.started = true;

        // Return players in consistent order (by PlayerId)
        let mut players: Vec<PlayerId> = self.players.keys().copied().collect();
        players.sort_by_key(|p| p.0);
        Ok(players)
    }

    /// Check if game has started
    pub fn has_started(&self) -> bool {
        self.started
    }

    /// Get the host player
    pub fn host(&self) -> Option<PlayerId> {
        self.host
    }

    /// Check if a player is the host
    pub fn is_host(&self, player_id: PlayerId) -> bool {
        self.host == Some(player_id)
    }

    /// Get current player count
    pub fn player_count(&self) -> usize {
        self.players.len()
    }

    /// Get lobby state for sending to clients
    pub fn get_lobby_state(&self) -> Vec<LobbyPlayer> {
        let host_id = self.host;
        self.players
            .iter()
            .map(|(&player_id, info)| LobbyPlayer {
                player_id,
                name: info.name.clone(),
                ready: info.ready,
                is_host: Some(player_id) == host_id,
            })
            .collect()
    }

    /// Get min players
    pub fn min_players(&self) -> u8 {
        self.min_players
    }

    /// Get max players
    pub fn max_players(&self) -> u8 {
        self.max_players
    }
}

/// Lobby errors
#[derive(Debug, Clone, thiserror::Error)]
pub enum LobbyError {
    #[error("Lobby is full")]
    LobbyFull,
    #[error("Game has already started")]
    GameAlreadyStarted,
    #[error("Player already in lobby")]
    AlreadyInLobby,
    #[error("Player not in lobby")]
    NotInLobby,
    #[error("Cannot start: not enough players or not all ready")]
    CannotStart,
    #[error("Only host can start the game")]
    NotHost,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_and_remove_players() {
        let mut lobby = Lobby::new(2, 4);

        // Add players
        assert!(lobby.add_player(PlayerId(0), "Alice".into()).is_ok());
        assert!(lobby.add_player(PlayerId(1), "Bob".into()).is_ok());
        assert_eq!(lobby.player_count(), 2);

        // First player is host
        assert_eq!(lobby.host(), Some(PlayerId(0)));

        // Remove host - next player becomes host
        assert!(lobby.remove_player(PlayerId(0)));
        assert_eq!(lobby.host(), Some(PlayerId(1)));
    }

    #[test]
    fn ready_state() {
        let mut lobby = Lobby::new(2, 4);
        lobby.add_player(PlayerId(0), "Alice".into()).unwrap();
        lobby.add_player(PlayerId(1), "Bob".into()).unwrap();

        // Not ready by default
        assert!(!lobby.is_ready(PlayerId(0)));
        assert!(!lobby.can_start());

        // Set ready
        lobby.set_ready(PlayerId(0), true).unwrap();
        lobby.set_ready(PlayerId(1), true).unwrap();
        assert!(lobby.can_start());
    }

    #[test]
    fn start_game() {
        let mut lobby = Lobby::new(2, 4);
        lobby.add_player(PlayerId(0), "Alice".into()).unwrap();
        lobby.add_player(PlayerId(1), "Bob".into()).unwrap();
        lobby.set_ready(PlayerId(0), true).unwrap();
        lobby.set_ready(PlayerId(1), true).unwrap();

        let players = lobby.start().unwrap();
        assert_eq!(players, vec![PlayerId(0), PlayerId(1)]);
        assert!(lobby.has_started());

        // Can't add players after start
        assert!(matches!(
            lobby.add_player(PlayerId(2), "Charlie".into()),
            Err(LobbyError::GameAlreadyStarted)
        ));
    }

    #[test]
    fn lobby_full() {
        let mut lobby = Lobby::new(2, 2);
        lobby.add_player(PlayerId(0), "Alice".into()).unwrap();
        lobby.add_player(PlayerId(1), "Bob".into()).unwrap();

        assert!(matches!(
            lobby.add_player(PlayerId(2), "Charlie".into()),
            Err(LobbyError::LobbyFull)
        ));
    }
}
