//! Verified Asset Registry System
//!
//! Extends the asset registry to require verified attestations from Membrane.
//! Assets can only be registered if their attestation has been verified via
//! Herodotus storage proofs or the optimistic verification path.

use starknet::ContractAddress;
use starknet::get_caller_address;
use starknet::get_block_timestamp;

use dojo::world::IWorldDispatcher;
use dojo::world::IWorldDispatcherTrait;

use super::super::models::asset::{Asset, AssetCategory, QualityTier, AssetOwnership};
use super::attestation_verifier::{
    IAttestationVerifierDispatcher, IAttestationVerifierDispatcherTrait,
    VerifiedAttestation
};

/// Verified Asset Registry interface
#[starknet::interface]
pub trait IVerifiedRegistry<TContractState> {
    /// Register an asset with verified attestation
    fn register_verified(
        ref self: TContractState,
        asset_id: felt252,
        ipfs_cid: ByteArray,
        attestation_uid: felt252,
        category: AssetCategory,
        name: ByteArray,
        description: ByteArray,
        version: ByteArray,
    );

    /// Register asset with Herodotus proof in single transaction
    fn register_with_proof(
        ref self: TContractState,
        asset_id: felt252,
        ipfs_cid: ByteArray,
        attestation_uid: felt252,
        manifest_hash: felt252,
        passed: bool,
        source_block: u64,
        category: AssetCategory,
        name: ByteArray,
        description: ByteArray,
        version: ByteArray,
    );

    /// Check if an asset has verified attestation
    fn is_asset_verified(self: @TContractState, asset_id: felt252) -> bool;

    /// Get the quality tier based on attestation status
    fn get_quality_tier(self: @TContractState, attestation_uid: felt252) -> QualityTier;
}

/// Registry configuration
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct RegistryConfig {
    #[key]
    pub config_id: felt252,

    /// Attestation verifier contract address
    pub verifier: ContractAddress,

    /// Whether to require verified attestations
    pub require_verification: bool,

    /// Admin address
    pub admin: ContractAddress,
}

/// Verified Asset Registry Contract
#[dojo::contract]
pub mod verified_registry {
    use super::{
        IVerifiedRegistry, RegistryConfig,
        Asset, AssetCategory, QualityTier, AssetOwnership,
        IAttestationVerifierDispatcher, IAttestationVerifierDispatcherTrait,
        VerifiedAttestation
    };
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};

    const CONFIG_ID: felt252 = 'registry';

    #[abi(embed_v0)]
    impl VerifiedRegistryImpl of IVerifiedRegistry<ContractState> {
        /// Register an asset that has already been verified
        ///
        /// The attestation must be verified via `attestation_verifier` first.
        fn register_verified(
            ref self: ContractState,
            asset_id: felt252,
            ipfs_cid: ByteArray,
            attestation_uid: felt252,
            category: AssetCategory,
            name: ByteArray,
            description: ByteArray,
            version: ByteArray,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Get registry config
            let config: RegistryConfig = world.read_model(CONFIG_ID);

            // Verify the attestation if required
            if config.require_verification {
                let verifier = IAttestationVerifierDispatcher {
                    contract_address: config.verifier
                };

                assert(verifier.is_verified(attestation_uid), 'Attestation not verified');

                // Get attestation details to confirm it passed
                let attestation = verifier.get_attestation(attestation_uid);
                assert(attestation.passed, 'Attestation did not pass');
            }

            // Determine quality tier based on verification status
            let quality = if config.require_verification {
                QualityTier::Verified
            } else {
                QualityTier::Standard
            };

            // Create asset
            let asset = Asset {
                asset_id,
                ipfs_cid,
                attestation_uid,
                category,
                quality,
                creator: caller,
                created_at: timestamp,
                name,
                description,
                version,
            };

            // Create ownership record
            let ownership = AssetOwnership {
                owner: caller,
                asset_id,
                count: 1,
                can_spawn: true,
            };

            world.write_model(@asset);
            world.write_model(@ownership);
        }

        /// Register asset with inline Herodotus proof verification
        ///
        /// Combines attestation verification and asset registration in one tx.
        fn register_with_proof(
            ref self: ContractState,
            asset_id: felt252,
            ipfs_cid: ByteArray,
            attestation_uid: felt252,
            manifest_hash: felt252,
            passed: bool,
            source_block: u64,
            category: AssetCategory,
            name: ByteArray,
            description: ByteArray,
            version: ByteArray,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Get config
            let config: RegistryConfig = world.read_model(CONFIG_ID);

            // Verify attestation via Herodotus
            let verifier = IAttestationVerifierDispatcher {
                contract_address: config.verifier
            };

            let verified = verifier.verify_with_proof(
                attestation_uid,
                ipfs_cid.clone(),
                manifest_hash,
                passed,
                source_block,
            );

            assert(verified, 'Proof verification failed');
            assert(passed, 'Attestation did not pass');

            // Create verified asset
            let asset = Asset {
                asset_id,
                ipfs_cid,
                attestation_uid,
                category,
                quality: QualityTier::Verified,
                creator: caller,
                created_at: timestamp,
                name,
                description,
                version,
            };

            let ownership = AssetOwnership {
                owner: caller,
                asset_id,
                count: 1,
                can_spawn: true,
            };

            world.write_model(@asset);
            world.write_model(@ownership);
        }

        /// Check if an asset's attestation is verified
        fn is_asset_verified(self: @ContractState, asset_id: felt252) -> bool {
            let world = self.world(@"glia_fab");

            let asset: Asset = world.read_model(asset_id);
            if asset.attestation_uid == 0 {
                return false;
            }

            let config: RegistryConfig = world.read_model(CONFIG_ID);
            let verifier = IAttestationVerifierDispatcher {
                contract_address: config.verifier
            };

            verifier.is_verified(asset.attestation_uid)
        }

        /// Get quality tier for an attestation
        fn get_quality_tier(self: @ContractState, attestation_uid: felt252) -> QualityTier {
            let world = self.world(@"glia_fab");
            let config: RegistryConfig = world.read_model(CONFIG_ID);

            if attestation_uid == 0 {
                return QualityTier::Unverified;
            }

            let verifier = IAttestationVerifierDispatcher {
                contract_address: config.verifier
            };

            if verifier.is_verified(attestation_uid) {
                QualityTier::Verified
            } else {
                QualityTier::Standard
            }
        }
    }
}
