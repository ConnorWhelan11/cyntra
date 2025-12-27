//! Asset models for onchain asset management
//!
//! Assets are 3D models/scenes stored on IPFS with quality attestations from Membrane.

use starknet::ContractAddress;

/// Asset category enumeration
#[derive(Drop, Serde, Copy, PartialEq, Introspect)]
pub enum AssetCategory {
    /// Player character model
    Character,
    /// Environment/level geometry
    Environment,
    /// Interactive prop (pickups, furniture)
    Prop,
    /// Vehicle (car, boat, etc.)
    Vehicle,
    /// NPC character
    NPC,
    /// Weapon or tool
    Weapon,
    /// UI element or icon
    UI,
}

/// Quality tier from Membrane gate verdicts
#[derive(Drop, Serde, Copy, PartialEq, Introspect)]
pub enum QualityTier {
    /// Passed all quality gates
    Verified,
    /// Passed minimum gates
    Standard,
    /// No attestation / failed gates
    Unverified,
}

/// 3D position with fixed-point coordinates
/// Using i128 for ~18 decimal precision
#[derive(Drop, Serde, Copy, Introspect)]
pub struct Vec3 {
    /// X coordinate (fixed-point, scale 1e18)
    pub x: i128,
    /// Y coordinate
    pub y: i128,
    /// Z coordinate
    pub z: i128,
}

/// Quaternion rotation
#[derive(Drop, Serde, Copy, Introspect)]
pub struct Quat {
    pub x: i128,
    pub y: i128,
    pub z: i128,
    pub w: i128,
}

/// Core Asset model - registered assets in the world
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct Asset {
    /// Unique asset identifier (keccak256 of IPFS CID)
    #[key]
    pub asset_id: felt252,

    /// IPFS CID of the asset (GLB/GLTF file)
    /// Stored as bytes for gas efficiency
    pub ipfs_cid: ByteArray,

    /// Membrane attestation UID (EAS on Base L2)
    /// Zero if not attested
    pub attestation_uid: felt252,

    /// Asset category
    pub category: AssetCategory,

    /// Quality tier from Membrane
    pub quality: QualityTier,

    /// Creator's Starknet address
    pub creator: ContractAddress,

    /// Unix timestamp of registration
    pub created_at: u64,

    /// Human-readable name
    pub name: ByteArray,

    /// Optional description
    pub description: ByteArray,

    /// Version string (semver)
    pub version: ByteArray,
}

/// Asset instance in a game world
/// Represents a placed/spawned asset
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct AssetInstance {
    /// World this instance belongs to
    #[key]
    pub world_id: felt252,

    /// Unique instance ID within the world
    #[key]
    pub instance_id: felt252,

    /// Reference to the Asset
    pub asset_id: felt252,

    /// Position in world space
    pub position: Vec3,

    /// Rotation quaternion
    pub rotation: Quat,

    /// Scale factors
    pub scale: Vec3,

    /// Owner (can be player or world)
    pub owner: ContractAddress,

    /// Whether the instance is active/visible
    pub active: bool,

    /// Custom metadata (JSON string)
    pub metadata: ByteArray,
}

/// Asset ownership tracking
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct AssetOwnership {
    /// Owner address
    #[key]
    pub owner: ContractAddress,

    /// Asset ID
    #[key]
    pub asset_id: felt252,

    /// Number of instances owned
    pub count: u32,

    /// Whether owner can spawn new instances
    pub can_spawn: bool,
}

// Helper implementations

impl Vec3Default of Default<Vec3> {
    fn default() -> Vec3 {
        Vec3 { x: 0, y: 0, z: 0 }
    }
}

impl QuatDefault of Default<Quat> {
    fn default() -> Quat {
        // Identity quaternion
        Quat { x: 0, y: 0, z: 0, w: 1000000000000000000 } // w = 1.0 in fixed-point
    }
}

impl Vec3Into of Into<(i128, i128, i128), Vec3> {
    fn into(self: (i128, i128, i128)) -> Vec3 {
        let (x, y, z) = self;
        Vec3 { x, y, z }
    }
}
