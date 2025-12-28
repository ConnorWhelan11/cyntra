use serde::{Deserialize, Serialize};

use crate::{Command, PlayerId};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReplayFile {
    /// Replay file schema version.
    pub version: u32,
    pub map_size: u32,
    pub num_players: u32,
    pub seed: u64,
    /// Deterministic hash of rules content (used to reject mismatched replays).
    pub rules_hash: u64,
    #[serde(default)]
    pub players: Vec<ReplayPlayer>,
    #[serde(default)]
    pub commands: Vec<ReplayCommand>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReplayPlayer {
    pub id: PlayerId,
    pub name: String,
    pub is_ai: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReplayCommand {
    pub turn: u32,
    pub player: PlayerId,
    pub command: Command,
}
