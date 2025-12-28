use rmp_serde::{decode, encode};
use serde_json;
use thiserror::Error;

use crate::{
    CityUi, CombatPreview, Command, Event, Hex, PathPreview, ReplayFile, RulesCatalog, RulesNames,
    Snapshot, TurnPromise, UiProductionOption, UiTechOption, WhyPanel,
};

#[derive(Debug, Error)]
pub enum WireError {
    #[error("encode error: {0}")]
    Encode(#[from] encode::Error),
    #[error("decode error: {0}")]
    Decode(#[from] decode::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn serialize_command(cmd: &Command) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(cmd)?)
}

pub fn deserialize_command(bytes: &[u8]) -> Result<Command, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_events(events: &[Event]) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(events)?)
}

pub fn deserialize_events(bytes: &[u8]) -> Result<Vec<Event>, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_snapshot(snapshot: &Snapshot) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(snapshot)?)
}

pub fn deserialize_snapshot(bytes: &[u8]) -> Result<Snapshot, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_replay(replay: &ReplayFile) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(replay)?)
}

pub fn deserialize_replay(bytes: &[u8]) -> Result<ReplayFile, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_rules_names(names: &RulesNames) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(names)?)
}

pub fn deserialize_rules_names(bytes: &[u8]) -> Result<RulesNames, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_rules_catalog(catalog: &RulesCatalog) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(catalog)?)
}

pub fn deserialize_rules_catalog(bytes: &[u8]) -> Result<RulesCatalog, WireError> {
    Ok(decode::from_slice(bytes)?)
}

/// Deterministic snapshot hash for desync detection and replay verification.
///
/// Hashes the MessagePack-serialized snapshot using FNV-1a 64-bit.
pub fn snapshot_hash(snapshot: &Snapshot) -> Result<u64, WireError> {
    let bytes = serialize_snapshot(snapshot)?;
    Ok(hash_bytes_fnv1a64(&bytes))
}

/// Deterministic, stable 64-bit hash for raw bytes (FNV-1a).
pub fn hash_bytes_fnv1a64(bytes: &[u8]) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x100000001b3;

    let mut hash = OFFSET_BASIS;
    for &byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

pub fn serialize_combat_preview(preview: &CombatPreview) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(preview)?)
}

pub fn deserialize_combat_preview(bytes: &[u8]) -> Result<CombatPreview, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_why_panel(panel: &WhyPanel) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(panel)?)
}

pub fn deserialize_why_panel(bytes: &[u8]) -> Result<WhyPanel, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_hexes(hexes: &[Hex]) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(hexes)?)
}

pub fn deserialize_hexes(bytes: &[u8]) -> Result<Vec<Hex>, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_promises(promises: &[TurnPromise]) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(promises)?)
}

pub fn deserialize_promises(bytes: &[u8]) -> Result<Vec<TurnPromise>, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_path_preview(preview: &PathPreview) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(preview)?)
}

pub fn deserialize_path_preview(bytes: &[u8]) -> Result<PathPreview, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_city_ui(ui: &CityUi) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(ui)?)
}

pub fn deserialize_city_ui(bytes: &[u8]) -> Result<CityUi, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_production_options(options: &[UiProductionOption]) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(options)?)
}

pub fn deserialize_production_options(bytes: &[u8]) -> Result<Vec<UiProductionOption>, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_tech_options(options: &[UiTechOption]) -> Result<Vec<u8>, WireError> {
    Ok(encode::to_vec(options)?)
}

pub fn deserialize_tech_options(bytes: &[u8]) -> Result<Vec<UiTechOption>, WireError> {
    Ok(decode::from_slice(bytes)?)
}

pub fn serialize_command_json(cmd: &Command) -> Result<String, WireError> {
    Ok(serde_json::to_string(cmd)?)
}

pub fn deserialize_command_json(json: &str) -> Result<Command, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_events_json(events: &[Event]) -> Result<String, WireError> {
    Ok(serde_json::to_string(events)?)
}

pub fn deserialize_events_json(json: &str) -> Result<Vec<Event>, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_snapshot_json(snapshot: &Snapshot) -> Result<String, WireError> {
    Ok(serde_json::to_string(snapshot)?)
}

pub fn deserialize_snapshot_json(json: &str) -> Result<Snapshot, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_replay_json(replay: &ReplayFile) -> Result<String, WireError> {
    Ok(serde_json::to_string(replay)?)
}

pub fn deserialize_replay_json(json: &str) -> Result<ReplayFile, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_rules_names_json(names: &RulesNames) -> Result<String, WireError> {
    Ok(serde_json::to_string(names)?)
}

pub fn deserialize_rules_names_json(json: &str) -> Result<RulesNames, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_rules_catalog_json(catalog: &RulesCatalog) -> Result<String, WireError> {
    Ok(serde_json::to_string(catalog)?)
}

pub fn deserialize_rules_catalog_json(json: &str) -> Result<RulesCatalog, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_combat_preview_json(preview: &CombatPreview) -> Result<String, WireError> {
    Ok(serde_json::to_string(preview)?)
}

pub fn deserialize_combat_preview_json(json: &str) -> Result<CombatPreview, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_why_panel_json(panel: &WhyPanel) -> Result<String, WireError> {
    Ok(serde_json::to_string(panel)?)
}

pub fn deserialize_why_panel_json(json: &str) -> Result<WhyPanel, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_hexes_json(hexes: &[Hex]) -> Result<String, WireError> {
    Ok(serde_json::to_string(hexes)?)
}

pub fn deserialize_hexes_json(json: &str) -> Result<Vec<Hex>, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_promises_json(promises: &[TurnPromise]) -> Result<String, WireError> {
    Ok(serde_json::to_string(promises)?)
}

pub fn deserialize_promises_json(json: &str) -> Result<Vec<TurnPromise>, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_path_preview_json(preview: &PathPreview) -> Result<String, WireError> {
    Ok(serde_json::to_string(preview)?)
}

pub fn deserialize_path_preview_json(json: &str) -> Result<PathPreview, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_city_ui_json(ui: &CityUi) -> Result<String, WireError> {
    Ok(serde_json::to_string(ui)?)
}

pub fn deserialize_city_ui_json(json: &str) -> Result<CityUi, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_production_options_json(
    options: &[UiProductionOption],
) -> Result<String, WireError> {
    Ok(serde_json::to_string(options)?)
}

pub fn deserialize_production_options_json(
    json: &str,
) -> Result<Vec<UiProductionOption>, WireError> {
    Ok(serde_json::from_str(json)?)
}

pub fn serialize_tech_options_json(options: &[UiTechOption]) -> Result<String, WireError> {
    Ok(serde_json::to_string(options)?)
}

pub fn deserialize_tech_options_json(json: &str) -> Result<Vec<UiTechOption>, WireError> {
    Ok(serde_json::from_str(json)?)
}
