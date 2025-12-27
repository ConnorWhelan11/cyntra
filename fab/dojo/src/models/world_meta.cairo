//! World metadata models

use starknet::ContractAddress;

/// World state enumeration
#[derive(Drop, Serde, Copy, PartialEq, Introspect)]
pub enum WorldState {
    /// World is being created
    Creating,
    /// World is active and playable
    Active,
    /// World is paused (no state changes)
    Paused,
    /// World is archived (read-only)
    Archived,
}

/// Game world metadata
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct WorldMeta {
    /// Unique world identifier
    #[key]
    pub world_id: felt252,

    /// Human-readable name
    pub name: ByteArray,

    /// Description
    pub description: ByteArray,

    /// Creator address
    pub creator: ContractAddress,

    /// Creation timestamp
    pub created_at: u64,

    /// Last update timestamp
    pub updated_at: u64,

    /// World state
    pub state: WorldState,

    /// Version string
    pub version: ByteArray,

    /// Maximum concurrent players (0 = unlimited)
    pub max_players: u32,

    /// Current player count
    pub current_players: u32,

    /// IPFS CID of world thumbnail
    pub thumbnail_cid: ByteArray,

    /// IPFS CID of world manifest
    pub manifest_cid: ByteArray,
}

/// World configuration
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct WorldConfig {
    /// World ID
    #[key]
    pub world_id: felt252,

    /// Allow public joining
    pub public: bool,

    /// Require Membrane attestation for assets
    pub require_attestation: bool,

    /// Minimum quality tier for assets
    pub min_quality_tier: u8,

    /// Allow player-to-player trading
    pub trading_enabled: bool,

    /// Respawn time in seconds
    pub respawn_time: u32,

    /// World bounds (min/max XYZ in fixed-point)
    pub bounds_min_x: i128,
    pub bounds_min_y: i128,
    pub bounds_min_z: i128,
    pub bounds_max_x: i128,
    pub bounds_max_y: i128,
    pub bounds_max_z: i128,
}

/// World access control
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct WorldAccess {
    /// World ID
    #[key]
    pub world_id: felt252,

    /// User address
    #[key]
    pub user: ContractAddress,

    /// Access level (0=none, 1=view, 2=play, 3=build, 4=admin)
    pub level: u8,

    /// When access was granted
    pub granted_at: u64,

    /// Who granted access
    pub granted_by: ContractAddress,
}
