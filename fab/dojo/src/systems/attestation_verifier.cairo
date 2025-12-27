//! Attestation Verifier System
//!
//! Verifies Membrane attestations from Base L2 on Starknet using Herodotus storage proofs.
//! This enables trustless cross-chain verification of asset quality attestations.
//!
//! Flow:
//! 1. Asset attested on Base L2 via EAS (Ethereum Attestation Service)
//! 2. Herodotus indexes Base L2 state and provides storage proofs
//! 3. This contract verifies the proof and confirms attestation exists
//! 4. Asset Registry can then register verified assets

use starknet::ContractAddress;
use starknet::get_caller_address;
use starknet::get_block_timestamp;

use dojo::world::IWorldDispatcher;
use dojo::world::IWorldDispatcherTrait;

/// Verified attestation record stored onchain
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct VerifiedAttestation {
    /// EAS attestation UID from Base L2
    #[key]
    pub attestation_uid: felt252,

    /// IPFS CID of the attested artifacts
    pub artifacts_cid: ByteArray,

    /// Hash of the run manifest
    pub manifest_hash: felt252,

    /// Whether the run passed quality gates
    pub passed: bool,

    /// Base L2 block number where attestation was verified
    pub source_block: u64,

    /// Starknet block when verification occurred
    pub verified_at: u64,

    /// Address that submitted the verification
    pub verifier: ContractAddress,
}

/// Pending attestation awaiting challenge period (for optimistic mode)
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct PendingAttestation {
    #[key]
    pub attestation_uid: felt252,

    pub artifacts_cid: ByteArray,
    pub manifest_hash: felt252,
    pub passed: bool,

    /// When the attestation was submitted
    pub submitted_at: u64,

    /// Challenge period end timestamp
    pub challenge_deadline: u64,

    /// Submitter who staked bond
    pub submitter: ContractAddress,

    /// Bond amount staked
    pub bond_amount: u256,

    /// Whether it's been challenged
    pub challenged: bool,
}

/// Verifier configuration
#[derive(Model, Drop, Serde)]
#[dojo::model]
pub struct VerifierConfig {
    #[key]
    pub config_id: felt252,  // Always 'main'

    /// Herodotus Facts Registry contract address
    pub facts_registry: ContractAddress,

    /// EAS contract address on Base L2 (as felt252)
    pub eas_contract: felt252,

    /// EAS RunReceipt schema UID
    pub schema_uid: felt252,

    /// Admin who can update config
    pub admin: ContractAddress,

    /// Challenge period duration (seconds) for optimistic mode
    pub challenge_period: u64,

    /// Required bond amount for optimistic submissions
    pub bond_amount: u256,

    /// Verification mode: 0 = Herodotus only, 1 = Optimistic fallback
    pub mode: u8,
}

/// Herodotus Facts Registry interface
#[starknet::interface]
pub trait IFactsRegistry<TContractState> {
    /// Get proven storage value from EVM chain
    fn get_storage_uint(
        self: @TContractState,
        chain_id: u256,
        block_number: u64,
        account: felt252,
        slot: u256,
    ) -> u256;

    /// Check if a storage proof has been verified
    fn is_storage_proven(
        self: @TContractState,
        chain_id: u256,
        block_number: u64,
        account: felt252,
        slot: u256,
    ) -> bool;
}

/// Attestation Verifier interface
#[starknet::interface]
pub trait IAttestationVerifier<TContractState> {
    /// Verify an attestation using Herodotus storage proof
    fn verify_with_proof(
        ref self: TContractState,
        attestation_uid: felt252,
        artifacts_cid: ByteArray,
        manifest_hash: felt252,
        passed: bool,
        source_block: u64,
    ) -> bool;

    /// Submit attestation optimistically (requires bond)
    fn submit_optimistic(
        ref self: TContractState,
        attestation_uid: felt252,
        artifacts_cid: ByteArray,
        manifest_hash: felt252,
        passed: bool,
    );

    /// Challenge an optimistic submission with fraud proof
    fn challenge_attestation(
        ref self: TContractState,
        attestation_uid: felt252,
        source_block: u64,
    );

    /// Finalize an unchallenged optimistic attestation
    fn finalize_optimistic(
        ref self: TContractState,
        attestation_uid: felt252,
    );

    /// Check if an attestation is verified
    fn is_verified(self: @TContractState, attestation_uid: felt252) -> bool;

    /// Get verified attestation data
    fn get_attestation(self: @TContractState, attestation_uid: felt252) -> VerifiedAttestation;

    /// Update verifier configuration (admin only)
    fn update_config(
        ref self: TContractState,
        facts_registry: ContractAddress,
        eas_contract: felt252,
        schema_uid: felt252,
        challenge_period: u64,
        bond_amount: u256,
        mode: u8,
    );
}

/// Attestation Verifier Contract
#[dojo::contract]
pub mod attestation_verifier {
    use super::{
        IAttestationVerifier, IFactsRegistry, IFactsRegistryDispatcher, IFactsRegistryDispatcherTrait,
        VerifiedAttestation, PendingAttestation, VerifierConfig
    };
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};

    /// Base L2 chain ID (8453 for mainnet, 84532 for sepolia)
    const BASE_CHAIN_ID: u256 = 84532;

    /// EAS attestations mapping slot (storage slot 0 in EAS contract)
    const EAS_ATTESTATIONS_SLOT: u256 = 0;

    /// Config ID constant
    const CONFIG_ID: felt252 = 'main';

    #[abi(embed_v0)]
    impl AttestationVerifierImpl of IAttestationVerifier<ContractState> {
        /// Verify attestation using Herodotus storage proof
        ///
        /// This function:
        /// 1. Queries Herodotus Facts Registry for the attestation storage slot
        /// 2. Verifies the attestation UID exists in EAS contract storage
        /// 3. Records the verified attestation in Dojo state
        fn verify_with_proof(
            ref self: ContractState,
            attestation_uid: felt252,
            artifacts_cid: ByteArray,
            manifest_hash: felt252,
            passed: bool,
            source_block: u64,
        ) -> bool {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Get verifier config
            let config: VerifierConfig = world.read_model(CONFIG_ID);

            // Compute the storage slot for this attestation in EAS
            // EAS stores attestations in mapping: attestations[uid] = Attestation
            let storage_slot = compute_attestation_slot(attestation_uid);

            // Query Herodotus Facts Registry
            let facts = IFactsRegistryDispatcher {
                contract_address: config.facts_registry
            };

            // Check if the storage proof exists
            let is_proven = facts.is_storage_proven(
                BASE_CHAIN_ID,
                source_block,
                config.eas_contract,
                storage_slot,
            );

            if !is_proven {
                return false;
            }

            // Get the storage value (attestation data hash)
            let storage_value = facts.get_storage_uint(
                BASE_CHAIN_ID,
                source_block,
                config.eas_contract,
                storage_slot,
            );

            // Verify the attestation exists (non-zero value)
            if storage_value == 0 {
                return false;
            }

            // Store verified attestation
            let verified = VerifiedAttestation {
                attestation_uid,
                artifacts_cid,
                manifest_hash,
                passed,
                source_block,
                verified_at: timestamp,
                verifier: caller,
            };

            world.write_model(@verified);
            true
        }

        /// Submit attestation optimistically with bond
        ///
        /// The attestation enters a challenge period during which anyone
        /// can submit a fraud proof to invalidate it.
        fn submit_optimistic(
            ref self: ContractState,
            attestation_uid: felt252,
            artifacts_cid: ByteArray,
            manifest_hash: felt252,
            passed: bool,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Get config
            let config: VerifierConfig = world.read_model(CONFIG_ID);
            assert(config.mode == 1, 'Optimistic mode not enabled');

            // Check not already pending or verified
            let existing: PendingAttestation = world.read_model(attestation_uid);
            assert(existing.submitted_at == 0, 'Already pending');

            let verified: VerifiedAttestation = world.read_model(attestation_uid);
            assert(verified.verified_at == 0, 'Already verified');

            // TODO: Transfer bond from caller
            // This would require ERC20 integration

            // Create pending attestation
            let pending = PendingAttestation {
                attestation_uid,
                artifacts_cid,
                manifest_hash,
                passed,
                submitted_at: timestamp,
                challenge_deadline: timestamp + config.challenge_period,
                submitter: caller,
                bond_amount: config.bond_amount,
                challenged: false,
            };

            world.write_model(@pending);
        }

        /// Challenge an optimistic attestation with fraud proof
        fn challenge_attestation(
            ref self: ContractState,
            attestation_uid: felt252,
            source_block: u64,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();

            // Get pending attestation
            let mut pending: PendingAttestation = world.read_model(attestation_uid);
            assert(pending.submitted_at > 0, 'Not pending');
            assert(!pending.challenged, 'Already challenged');
            assert(timestamp < pending.challenge_deadline, 'Challenge period ended');

            // Get config for Herodotus verification
            let config: VerifierConfig = world.read_model(CONFIG_ID);

            // Verify via Herodotus that attestation does NOT exist or differs
            let facts = IFactsRegistryDispatcher {
                contract_address: config.facts_registry
            };

            let storage_slot = compute_attestation_slot(attestation_uid);

            let is_proven = facts.is_storage_proven(
                BASE_CHAIN_ID,
                source_block,
                config.eas_contract,
                storage_slot,
            );

            // If proof shows attestation doesn't exist, challenge succeeds
            if is_proven {
                let storage_value = facts.get_storage_uint(
                    BASE_CHAIN_ID,
                    source_block,
                    config.eas_contract,
                    storage_slot,
                );

                if storage_value != 0 {
                    // Attestation exists, challenge fails
                    // In full implementation, slash challenger's stake
                    return;
                }
            }

            // Challenge succeeds - mark as challenged
            pending.challenged = true;
            world.write_model(@pending);

            // TODO: Slash submitter's bond and reward challenger
        }

        /// Finalize an unchallenged optimistic attestation
        fn finalize_optimistic(
            ref self: ContractState,
            attestation_uid: felt252,
        ) {
            let world = self.world(@"glia_fab");
            let timestamp = get_block_timestamp();

            // Get pending attestation
            let pending: PendingAttestation = world.read_model(attestation_uid);
            assert(pending.submitted_at > 0, 'Not pending');
            assert(!pending.challenged, 'Was challenged');
            assert(timestamp >= pending.challenge_deadline, 'Challenge period active');

            // Promote to verified
            let verified = VerifiedAttestation {
                attestation_uid,
                artifacts_cid: pending.artifacts_cid,
                manifest_hash: pending.manifest_hash,
                passed: pending.passed,
                source_block: 0,  // Unknown for optimistic
                verified_at: timestamp,
                verifier: pending.submitter,
            };

            world.write_model(@verified);

            // TODO: Return bond to submitter
        }

        /// Check if an attestation is verified
        fn is_verified(self: @ContractState, attestation_uid: felt252) -> bool {
            let world = self.world(@"glia_fab");
            let verified: VerifiedAttestation = world.read_model(attestation_uid);
            verified.verified_at > 0 && verified.passed
        }

        /// Get verified attestation data
        fn get_attestation(self: @ContractState, attestation_uid: felt252) -> VerifiedAttestation {
            let world = self.world(@"glia_fab");
            world.read_model(attestation_uid)
        }

        /// Update verifier configuration (admin only)
        fn update_config(
            ref self: ContractState,
            facts_registry: ContractAddress,
            eas_contract: felt252,
            schema_uid: felt252,
            challenge_period: u64,
            bond_amount: u256,
            mode: u8,
        ) {
            let world = self.world(@"glia_fab");
            let caller = get_caller_address();

            // Check admin
            let config: VerifierConfig = world.read_model(CONFIG_ID);
            if config.admin.into() != 0 {
                assert(config.admin == caller, 'Not admin');
            }

            let new_config = VerifierConfig {
                config_id: CONFIG_ID,
                facts_registry,
                eas_contract,
                schema_uid,
                admin: caller,
                challenge_period,
                bond_amount,
                mode,
            };

            world.write_model(@new_config);
        }
    }

    /// Compute the storage slot for an attestation in EAS
    ///
    /// EAS uses mapping: attestations[uid] = Attestation
    /// The slot is: keccak256(uid . slot_of_mapping)
    fn compute_attestation_slot(attestation_uid: felt252) -> u256 {
        // Simplified slot computation
        // In production, use proper keccak256(abi.encode(uid, SLOT))
        let uid_u256: u256 = attestation_uid.into();
        uid_u256 + EAS_ATTESTATIONS_SLOT
    }
}
