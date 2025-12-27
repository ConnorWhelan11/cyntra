//! Player models for onchain player state

use starknet::ContractAddress;
use super::asset::{Vec3, Quat};

/// Player state in a world
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct Player {
    /// World the player is in
    #[key]
    pub world_id: felt252,

    /// Player's address
    #[key]
    pub address: ContractAddress,

    /// Player's display name
    pub name: ByteArray,

    /// Current position
    pub position: Vec3,

    /// Current rotation
    pub rotation: Quat,

    /// Currently equipped character asset
    pub character_asset_id: felt252,

    /// Health (0-100 fixed-point)
    pub health: u32,

    /// Last activity timestamp
    pub last_active: u64,

    /// Whether player is online
    pub online: bool,
}

/// Player inventory slot
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct InventorySlot {
    /// Player address
    #[key]
    pub player: ContractAddress,

    /// World ID
    #[key]
    pub world_id: felt252,

    /// Slot index (0-based)
    #[key]
    pub slot_index: u32,

    /// Asset ID in this slot (0 if empty)
    pub asset_id: felt252,

    /// Quantity (for stackable items)
    pub quantity: u32,

    /// Custom data for this item instance
    pub data: ByteArray,
}

/// Player session - tracks Controller connection
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct PlayerSession {
    /// Player address
    #[key]
    pub player: ContractAddress,

    /// Session ID from Controller
    pub session_id: felt252,

    /// Session creation timestamp
    pub created_at: u64,

    /// Session expiry timestamp
    pub expires_at: u64,

    /// Approved contract policies hash
    pub policies_hash: felt252,
}

/// Player statistics
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct PlayerStats {
    /// Player address
    #[key]
    pub player: ContractAddress,

    /// Total distance traveled
    pub distance_traveled: u128,

    /// Total items collected
    pub items_collected: u64,

    /// Total time played (seconds)
    pub time_played: u64,

    /// Achievements unlocked (bitmask)
    pub achievements: u256,

    /// Experience points
    pub xp: u64,

    /// Current level
    pub level: u32,
}
