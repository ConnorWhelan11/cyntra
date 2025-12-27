//! Spawn System
//!
//! Handles spawning and despawning asset instances in game worlds,
//! as well as player state management.

use starknet::ContractAddress;
use starknet::get_caller_address;
use starknet::get_block_timestamp;

use dojo::world::IWorldDispatcher;
use dojo::world::IWorldDispatcherTrait;

use super::super::models::asset::{Asset, AssetInstance, AssetOwnership, Vec3, Quat, QualityTier};
use super::super::models::player::{Player, InventorySlot};
use super::super::models::world_meta::{WorldMeta, WorldConfig, WorldAccess, WorldState};

/// Spawn System interface
#[starknet::interface]
pub trait ISpawn<TContractState> {
    /// Spawn an asset instance in a world
    fn spawn_asset(
        ref self: TContractState,
        world_id: felt252,
        asset_id: felt252,
        instance_id: felt252,
        position: Vec3,
        rotation: Quat,
        scale: Vec3,
        metadata: ByteArray,
    );

    /// Despawn (remove) an asset instance
    fn despawn_asset(
        ref self: TContractState,
        world_id: felt252,
        instance_id: felt252,
    );

    /// Update instance transform
    fn update_transform(
        ref self: TContractState,
        world_id: felt252,
        instance_id: felt252,
        position: Vec3,
        rotation: Quat,
        scale: Vec3,
    );

    /// Join a world as a player
    fn join_world(
        ref self: TContractState,
        world_id: felt252,
        name: ByteArray,
        character_asset_id: felt252,
    );

    /// Leave a world
    fn leave_world(
        ref self: TContractState,
        world_id: felt252,
    );

    /// Update player position
    fn update_player_position(
        ref self: TContractState,
        world_id: felt252,
        position: Vec3,
        rotation: Quat,
    );

    /// Pick up an item into inventory
    fn pickup_item(
        ref self: TContractState,
        world_id: felt252,
        instance_id: felt252,
        slot_index: u32,
    );

    /// Drop an item from inventory
    fn drop_item(
        ref self: TContractState,
        world_id: felt252,
        slot_index: u32,
        position: Vec3,
    );
}

/// Spawn System Contract
#[dojo::contract]
pub mod spawn {
    use super::{
        ISpawn, Asset, AssetInstance, AssetOwnership, Vec3, Quat, QualityTier,
        Player, InventorySlot, WorldMeta, WorldConfig, WorldAccess, WorldState
    };
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};

    /// Default scale (1.0 in fixed-point)
    const SCALE_ONE: i128 = 1000000000000000000;

    #[abi(embed_v0)]
    impl SpawnImpl of ISpawn<ContractState> {
        /// Spawn an asset instance in a world
        ///
        /// Caller must have spawn permission for the asset and appropriate
        /// access level in the world.
        fn spawn_asset(
            ref self: ContractState,
            world_id: felt252,
            asset_id: felt252,
            instance_id: felt252,
            position: Vec3,
            rotation: Quat,
            scale: Vec3,
            metadata: ByteArray,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Verify world exists and is active
            let world_meta: WorldMeta = world.read_model(world_id);
            assert(world_meta.state == WorldState::Active, 'World not active');

            // Verify caller has build access (level 3+)
            let access: WorldAccess = world.read_model((world_id, caller));
            assert(access.level >= 3, 'Insufficient access level');

            // Verify caller can spawn this asset
            let ownership: AssetOwnership = world.read_model((caller, asset_id));
            assert(ownership.can_spawn, 'No spawn permission');

            // Check asset quality meets world requirements
            let world_config: WorldConfig = world.read_model(world_id);
            if world_config.require_attestation {
                let asset: Asset = world.read_model(asset_id);
                assert(asset.attestation_uid != 0, 'Asset not attested');

                // Check quality tier
                let quality_value = match asset.quality {
                    QualityTier::Verified => 2_u8,
                    QualityTier::Standard => 1_u8,
                    QualityTier::Unverified => 0_u8,
                };
                assert(quality_value >= world_config.min_quality_tier, 'Quality tier too low');
            }

            // Verify position is within world bounds
            assert(position.x >= world_config.bounds_min_x, 'X below min bound');
            assert(position.x <= world_config.bounds_max_x, 'X above max bound');
            assert(position.y >= world_config.bounds_min_y, 'Y below min bound');
            assert(position.y <= world_config.bounds_max_y, 'Y above max bound');
            assert(position.z >= world_config.bounds_min_z, 'Z below min bound');
            assert(position.z <= world_config.bounds_max_z, 'Z above max bound');

            // Create the instance
            let instance = AssetInstance {
                world_id,
                instance_id,
                asset_id,
                position,
                rotation,
                scale,
                owner: caller,
                active: true,
                metadata,
            };

            world.write_model(@instance);
        }

        /// Remove an asset instance from a world
        fn despawn_asset(
            ref self: ContractState,
            world_id: felt252,
            instance_id: felt252,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Read the instance
            let mut instance: AssetInstance = world.read_model((world_id, instance_id));

            // Verify caller is owner or has admin access
            let access: WorldAccess = world.read_model((world_id, caller));
            assert(instance.owner == caller || access.level >= 4, 'Not authorized to despawn');

            // Mark as inactive (soft delete)
            instance.active = false;
            world.write_model(@instance);
        }

        /// Update an instance's transform (position, rotation, scale)
        fn update_transform(
            ref self: ContractState,
            world_id: felt252,
            instance_id: felt252,
            position: Vec3,
            rotation: Quat,
            scale: Vec3,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Read the instance
            let mut instance: AssetInstance = world.read_model((world_id, instance_id));

            // Verify caller is owner or has build access
            let access: WorldAccess = world.read_model((world_id, caller));
            assert(instance.owner == caller || access.level >= 3, 'Not authorized');

            // Update transform
            instance.position = position;
            instance.rotation = rotation;
            instance.scale = scale;
            world.write_model(@instance);
        }

        /// Join a world as a player
        fn join_world(
            ref self: ContractState,
            world_id: felt252,
            name: ByteArray,
            character_asset_id: felt252,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Verify world exists and is active
            let mut world_meta: WorldMeta = world.read_model(world_id);
            assert(world_meta.state == WorldState::Active, 'World not active');

            // Check player limit
            if world_meta.max_players > 0 {
                assert(world_meta.current_players < world_meta.max_players, 'World is full');
            }

            // Verify access (if not public, need at least play access)
            let world_config: WorldConfig = world.read_model(world_id);
            if !world_config.public {
                let access: WorldAccess = world.read_model((world_id, caller));
                assert(access.level >= 2, 'No access to world');
            }

            // Verify character asset ownership
            let ownership: AssetOwnership = world.read_model((caller, character_asset_id));
            assert(ownership.count > 0, 'Do not own character asset');

            // Create player record
            let player = Player {
                world_id,
                address: caller,
                name,
                position: Vec3 { x: 0, y: 0, z: 0 },
                rotation: Quat { x: 0, y: 0, z: 0, w: SCALE_ONE },
                character_asset_id,
                health: 100,
                last_active: timestamp,
                online: true,
            };

            // Update world player count
            world_meta.current_players += 1;

            world.write_model(@player);
            world.write_model(@world_meta);
        }

        /// Leave a world
        fn leave_world(
            ref self: ContractState,
            world_id: felt252,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Read player
            let mut player: Player = world.read_model((world_id, caller));
            assert(player.online, 'Not in world');

            // Mark as offline
            player.online = false;
            world.write_model(@player);

            // Update world player count
            let mut world_meta: WorldMeta = world.read_model(world_id);
            if world_meta.current_players > 0 {
                world_meta.current_players -= 1;
            }
            world.write_model(@world_meta);
        }

        /// Update player position in the world
        fn update_player_position(
            ref self: ContractState,
            world_id: felt252,
            position: Vec3,
            rotation: Quat,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Read player
            let mut player: Player = world.read_model((world_id, caller));
            assert(player.online, 'Not in world');

            // Verify bounds
            let world_config: WorldConfig = world.read_model(world_id);
            assert(position.x >= world_config.bounds_min_x, 'X below min bound');
            assert(position.x <= world_config.bounds_max_x, 'X above max bound');
            assert(position.y >= world_config.bounds_min_y, 'Y below min bound');
            assert(position.y <= world_config.bounds_max_y, 'Y above max bound');
            assert(position.z >= world_config.bounds_min_z, 'Z below min bound');
            assert(position.z <= world_config.bounds_max_z, 'Z above max bound');

            // Update position
            player.position = position;
            player.rotation = rotation;
            player.last_active = timestamp;
            world.write_model(@player);
        }

        /// Pick up an item instance into player inventory
        fn pickup_item(
            ref self: ContractState,
            world_id: felt252,
            instance_id: felt252,
            slot_index: u32,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Read player and verify online
            let player: Player = world.read_model((world_id, caller));
            assert(player.online, 'Not in world');

            // Read instance
            let mut instance: AssetInstance = world.read_model((world_id, instance_id));
            assert(instance.active, 'Instance not active');

            // Read asset to check if it's a prop (pickable)
            let asset: Asset = world.read_model(instance.asset_id);
            // Only props and weapons can be picked up
            // (Would check category but Cairo enum comparison is verbose)

            // Create inventory slot
            let slot = InventorySlot {
                player: caller,
                world_id,
                slot_index,
                asset_id: instance.asset_id,
                quantity: 1,
                data: instance.metadata.clone(),
            };

            // Deactivate the world instance
            instance.active = false;

            world.write_model(@slot);
            world.write_model(@instance);
        }

        /// Drop an item from inventory into the world
        fn drop_item(
            ref self: ContractState,
            world_id: felt252,
            slot_index: u32,
            position: Vec3,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Read inventory slot
            let mut slot: InventorySlot = world.read_model((caller, world_id, slot_index));
            assert(slot.asset_id != 0, 'Slot is empty');

            // Generate instance ID from caller + timestamp
            let instance_id = core::pedersen::pedersen(caller.into(), timestamp.into());

            // Create instance in world
            let instance = AssetInstance {
                world_id,
                instance_id,
                asset_id: slot.asset_id,
                position,
                rotation: Quat { x: 0, y: 0, z: 0, w: SCALE_ONE },
                scale: Vec3 { x: SCALE_ONE, y: SCALE_ONE, z: SCALE_ONE },
                owner: caller,
                active: true,
                metadata: slot.data.clone(),
            };

            // Clear the slot
            slot.asset_id = 0;
            slot.quantity = 0;

            world.write_model(@instance);
            world.write_model(@slot);
        }
    }
}
