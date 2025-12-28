//! Backbay Imperium Multiplayer Server
//!
//! Authoritative server using Renet for networking.
//! Supports 2-8 players with dynamic turn mode.

pub mod channels;
pub mod config;
pub mod connection;
pub mod game;
pub mod lobby;
pub mod player_manager;
pub mod protocol;
pub mod transport;

pub use channels::*;
pub use config::ServerConfig;
pub use connection::ConnectionManager;
pub use lobby::{Lobby, LobbyError};
pub use player_manager::{AddPlayerError, Player, PlayerManager, PlayerState, ReconnectError};
pub use protocol::*;
pub use transport::{ServerRunner, TransportConfig, PROTOCOL_ID};
