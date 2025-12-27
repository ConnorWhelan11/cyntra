//! Asset Registry System
//!
//! Handles asset registration, attestation updates, and ownership management.
//! Assets are registered with IPFS CIDs and optionally linked to Membrane attestations.

use starknet::ContractAddress;
use starknet::get_caller_address;
use starknet::get_block_timestamp;

use dojo::world::IWorldDispatcher;
use dojo::world::IWorldDispatcherTrait;

use super::super::models::asset::{Asset, AssetCategory, QualityTier, AssetOwnership};

/// Asset Registry interface
#[starknet::interface]
pub trait IAssetRegistry<TContractState> {
    /// Register a new asset
    fn register_asset(
        ref self: TContractState,
        asset_id: felt252,
        ipfs_cid: ByteArray,
        category: AssetCategory,
        name: ByteArray,
        description: ByteArray,
        version: ByteArray,
    );

    /// Update asset with Membrane attestation
    fn set_attestation(
        ref self: TContractState,
        asset_id: felt252,
        attestation_uid: felt252,
        quality: QualityTier,
    );

    /// Transfer asset ownership
    fn transfer_ownership(
        ref self: TContractState,
        asset_id: felt252,
        to: ContractAddress,
        count: u32,
    );

    /// Grant spawn permission
    fn grant_spawn_permission(
        ref self: TContractState,
        asset_id: felt252,
        to: ContractAddress,
    );

    /// Revoke spawn permission
    fn revoke_spawn_permission(
        ref self: TContractState,
        asset_id: felt252,
        from: ContractAddress,
    );
}

/// Asset Registry System Contract
#[dojo::contract]
pub mod asset_registry {
    use super::{IAssetRegistry, Asset, AssetCategory, QualityTier, AssetOwnership};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};

    #[abi(embed_v0)]
    impl AssetRegistryImpl of IAssetRegistry<ContractState> {
        /// Register a new asset in the world
        ///
        /// # Arguments
        /// * `asset_id` - Unique identifier (typically keccak256 of IPFS CID)
        /// * `ipfs_cid` - IPFS content identifier for the asset file
        /// * `category` - Asset category (Character, Environment, Prop, etc.)
        /// * `name` - Human-readable name
        /// * `description` - Asset description
        /// * `version` - Semantic version string
        fn register_asset(
            ref self: ContractState,
            asset_id: felt252,
            ipfs_cid: ByteArray,
            category: AssetCategory,
            name: ByteArray,
            description: ByteArray,
            version: ByteArray,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Create the asset record
            let asset = Asset {
                asset_id,
                ipfs_cid,
                attestation_uid: 0, // No attestation initially
                category,
                quality: QualityTier::Unverified,
                creator: caller,
                created_at: timestamp,
                name,
                description,
                version,
            };

            // Create ownership record for creator
            let ownership = AssetOwnership {
                owner: caller,
                asset_id,
                count: 1,
                can_spawn: true,
            };

            // Write to world state
            world.write_model(@asset);
            world.write_model(@ownership);
        }

        /// Update asset with Membrane attestation UID and quality tier
        ///
        /// Only the asset creator can set attestations.
        ///
        /// # Arguments
        /// * `asset_id` - Asset to update
        /// * `attestation_uid` - EAS attestation UID from Membrane
        /// * `quality` - Quality tier from gate verdicts
        fn set_attestation(
            ref self: ContractState,
            asset_id: felt252,
            attestation_uid: felt252,
            quality: QualityTier,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Read existing asset
            let mut asset: Asset = world.read_model(asset_id);

            // Verify caller is the creator
            assert(asset.creator == caller, 'Only creator can set attestation');

            // Update attestation fields
            asset.attestation_uid = attestation_uid;
            asset.quality = quality;

            world.write_model(@asset);
        }

        /// Transfer asset ownership to another address
        ///
        /// # Arguments
        /// * `asset_id` - Asset to transfer
        /// * `to` - Recipient address
        /// * `count` - Number of units to transfer
        fn transfer_ownership(
            ref self: ContractState,
            asset_id: felt252,
            to: ContractAddress,
            count: u32,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Read sender's ownership
            let mut from_ownership: AssetOwnership = world.read_model((caller, asset_id));

            // Verify sender has enough
            assert(from_ownership.count >= count, 'Insufficient balance');

            // Update sender's count
            from_ownership.count -= count;
            world.write_model(@from_ownership);

            // Read or create recipient's ownership
            let mut to_ownership: AssetOwnership = world.read_model((to, asset_id));
            to_ownership.owner = to;
            to_ownership.asset_id = asset_id;
            to_ownership.count += count;
            // New owners don't get spawn permission by default
            if to_ownership.count == count {
                to_ownership.can_spawn = false;
            }
            world.write_model(@to_ownership);
        }

        /// Grant spawn permission to an address
        ///
        /// Only asset creator or owners with spawn permission can grant.
        fn grant_spawn_permission(
            ref self: ContractState,
            asset_id: felt252,
            to: ContractAddress,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Verify caller has permission to grant
            let caller_ownership: AssetOwnership = world.read_model((caller, asset_id));
            assert(caller_ownership.can_spawn, 'No permission to grant spawn');

            // Update recipient's permission
            let mut to_ownership: AssetOwnership = world.read_model((to, asset_id));
            to_ownership.owner = to;
            to_ownership.asset_id = asset_id;
            to_ownership.can_spawn = true;
            world.write_model(@to_ownership);
        }

        /// Revoke spawn permission from an address
        ///
        /// Only asset creator can revoke permissions.
        fn revoke_spawn_permission(
            ref self: ContractState,
            asset_id: felt252,
            from: ContractAddress,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Verify caller is the asset creator
            let asset: Asset = world.read_model(asset_id);
            assert(asset.creator == caller, 'Only creator can revoke');

            // Update target's permission
            let mut ownership: AssetOwnership = world.read_model((from, asset_id));
            ownership.can_spawn = false;
            world.write_model(@ownership);
        }
    }
}
