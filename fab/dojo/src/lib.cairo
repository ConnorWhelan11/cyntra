//! Glia Fab World - Onchain game state with asset attestations
//!
//! This Dojo world manages:
//! - Asset references (IPFS CIDs + Membrane attestation UIDs)
//! - Asset instances in game worlds
//! - Player state and inventory
//!
//! Integration with Membrane:
//! - Assets are first attested via Membrane (EAS on Base L2)
//! - Attestation UIDs are stored here for verification
//! - IPFS CIDs reference the actual 3D assets

mod models {
    mod asset;
    mod player;
    mod world_meta;
}

mod systems {
    mod asset_registry;
    mod spawn;
    mod attestation_verifier;
    mod verified_registry;
}

#[cfg(test)]
mod tests {
    mod test_asset;
}
