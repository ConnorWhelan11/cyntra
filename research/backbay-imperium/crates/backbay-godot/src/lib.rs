#[cfg(feature = "network")]
mod network;

use backbay_core::{load_rules, GameEngine, RulesSource};
use backbay_protocol::{wire, Command};
use godot::prelude::*;

#[cfg(feature = "network")]
pub use network::NetworkBridge;

struct BackbayImperiumExtension;

#[gdextension]
unsafe impl ExtensionLibrary for BackbayImperiumExtension {}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct GameBridge {
    base: Base<Node>,
    engine: Option<GameEngine>,
}

#[godot_api]
impl INode for GameBridge {
    fn init(base: Base<Node>) -> Self {
        Self { base, engine: None }
    }
}

#[godot_api]
impl GameBridge {
    /// Start a new game. Returns initial snapshot as MessagePack bytes.
    #[func]
    #[allow(clippy::too_many_arguments)]
    fn new_game(
        &mut self,
        map_size: i32,
        num_players: i32,
        terrain: PackedByteArray,
        units: PackedByteArray,
        buildings: PackedByteArray,
        techs: PackedByteArray,
        improvements: PackedByteArray,
        policies: PackedByteArray,
        governments: PackedByteArray,
    ) -> PackedByteArray {
        let terrain = terrain.to_vec();
        let units = units.to_vec();
        let buildings = buildings.to_vec();
        let techs = techs.to_vec();
        let improvements = improvements.to_vec();
        let policies = policies.to_vec();
        let governments = governments.to_vec();

        let rules = match load_rules(RulesSource::Bytes {
            terrain: &terrain,
            units: &units,
            buildings: &buildings,
            techs: &techs,
            improvements: (!improvements.is_empty()).then_some(improvements.as_slice()),
            policies: (!policies.is_empty()).then_some(policies.as_slice()),
            governments: (!governments.is_empty()).then_some(governments.as_slice()),
        }) {
            Ok(rules) => rules,
            Err(err) => {
                godot_error!("Failed to load rules: {err}");
                return PackedByteArray::new();
            }
        };

        let engine = GameEngine::new_game(map_size.max(1) as u32, num_players.max(1) as u32, rules);
        let snapshot = engine.snapshot();
        self.engine = Some(engine);

        match wire::serialize_snapshot(&snapshot) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize snapshot: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Apply a command and return resulting events as MessagePack bytes.
    /// This is the MAIN API - Godot calls this for all game actions.
    #[func]
    fn apply_command(&mut self, command_bytes: PackedByteArray) -> PackedByteArray {
        let Some(engine) = self.engine.as_mut() else {
            return empty_events();
        };

        let command_bytes = command_bytes.to_vec();
        let command: Command = match wire::deserialize_command(&command_bytes) {
            Ok(cmd) => cmd,
            Err(err) => {
                godot_error!("Invalid command bytes: {err}");
                return empty_events();
            }
        };

        let events = engine.apply_command(command);
        match wire::serialize_events(&events) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize events: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Encode a JSON command (see `backbay-protocol::Command`) into MessagePack bytes.
    ///
    /// This exists to make early iteration from GDScript easy (Godot has JSON built-in).
    #[func]
    fn encode_command_json(&self, command_json: GString) -> PackedByteArray {
        let command = match wire::deserialize_command_json(&command_json.to_string()) {
            Ok(cmd) => cmd,
            Err(err) => {
                godot_error!("Invalid command JSON: {err}");
                return PackedByteArray::new();
            }
        };

        match wire::serialize_command(&command) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize command: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Encode a JSON replay (see `backbay-protocol::ReplayFile`) into MessagePack bytes.
    #[func]
    fn encode_replay_json(&self, replay_json: GString) -> PackedByteArray {
        let replay = match wire::deserialize_replay_json(&replay_json.to_string()) {
            Ok(replay) => replay,
            Err(err) => {
                godot_error!("Invalid replay JSON: {err}");
                return PackedByteArray::new();
            }
        };

        match wire::serialize_replay(&replay) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize replay: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Decode MessagePack-encoded events into a JSON string.
    #[func]
    fn decode_events_json(&self, events_bytes: PackedByteArray) -> GString {
        let events_bytes = events_bytes.to_vec();
        let events = match wire::deserialize_events(&events_bytes) {
            Ok(events) => events,
            Err(err) => {
                godot_error!("Invalid events bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_events_json(&events) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize events JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded snapshot into a JSON string.
    #[func]
    fn decode_snapshot_json(&self, snapshot_bytes: PackedByteArray) -> GString {
        let snapshot_bytes = snapshot_bytes.to_vec();
        let snapshot = match wire::deserialize_snapshot(&snapshot_bytes) {
            Ok(snapshot) => snapshot,
            Err(err) => {
                godot_error!("Invalid snapshot bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_snapshot_json(&snapshot) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize snapshot JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded ReplayFile into a JSON string.
    #[func]
    fn decode_replay_json(&self, replay_bytes: PackedByteArray) -> GString {
        let replay_bytes = replay_bytes.to_vec();
        let replay = match wire::deserialize_replay(&replay_bytes) {
            Ok(replay) => replay,
            Err(err) => {
                godot_error!("Invalid replay bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_replay_json(&replay) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize replay JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded RulesNames into a JSON string.
    #[func]
    fn decode_rules_names_json(&self, names_bytes: PackedByteArray) -> GString {
        let names_bytes = names_bytes.to_vec();
        let names = match wire::deserialize_rules_names(&names_bytes) {
            Ok(names) => names,
            Err(err) => {
                godot_error!("Invalid rules names bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_rules_names_json(&names) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize rules names JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded RulesCatalog into a JSON string.
    #[func]
    fn decode_rules_catalog_json(&self, catalog_bytes: PackedByteArray) -> GString {
        let catalog_bytes = catalog_bytes.to_vec();
        let catalog = match wire::deserialize_rules_catalog(&catalog_bytes) {
            Ok(catalog) => catalog,
            Err(err) => {
                godot_error!("Invalid rules catalog bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_rules_catalog_json(&catalog) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize rules catalog JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded Vec<Hex> into a JSON string.
    #[func]
    fn decode_hexes_json(&self, hexes_bytes: PackedByteArray) -> GString {
        let hexes_bytes = hexes_bytes.to_vec();
        let hexes = match wire::deserialize_hexes(&hexes_bytes) {
            Ok(hexes) => hexes,
            Err(err) => {
                godot_error!("Invalid hexes bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_hexes_json(&hexes) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize hexes JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded CityUi into a JSON string.
    #[func]
    fn decode_city_ui_json(&self, ui_bytes: PackedByteArray) -> GString {
        let ui_bytes = ui_bytes.to_vec();
        let ui = match wire::deserialize_city_ui(&ui_bytes) {
            Ok(ui) => ui,
            Err(err) => {
                godot_error!("Invalid city ui bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_city_ui_json(&ui) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize city ui JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded Vec<UiProductionOption> into a JSON string.
    #[func]
    fn decode_production_options_json(&self, options_bytes: PackedByteArray) -> GString {
        let options_bytes = options_bytes.to_vec();
        let options = match wire::deserialize_production_options(&options_bytes) {
            Ok(options) => options,
            Err(err) => {
                godot_error!("Invalid production options bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_production_options_json(&options) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize production options JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded Vec<UiTechOption> into a JSON string.
    #[func]
    fn decode_tech_options_json(&self, options_bytes: PackedByteArray) -> GString {
        let options_bytes = options_bytes.to_vec();
        let options = match wire::deserialize_tech_options(&options_bytes) {
            Ok(options) => options,
            Err(err) => {
                godot_error!("Invalid tech options bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_tech_options_json(&options) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize tech options JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded PathPreview into a JSON string.
    #[func]
    fn decode_path_preview_json(&self, preview_bytes: PackedByteArray) -> GString {
        let preview_bytes = preview_bytes.to_vec();
        let preview = match wire::deserialize_path_preview(&preview_bytes) {
            Ok(preview) => preview,
            Err(err) => {
                godot_error!("Invalid path preview bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_path_preview_json(&preview) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize path preview JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded promise strip (Vec<TurnPromise>) into a JSON string.
    #[func]
    fn decode_promises_json(&self, promises_bytes: PackedByteArray) -> GString {
        let promises_bytes = promises_bytes.to_vec();
        let promises = match wire::deserialize_promises(&promises_bytes) {
            Ok(p) => p,
            Err(err) => {
                godot_error!("Invalid promises bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_promises_json(&promises) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize promises JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded CombatPreview into a JSON string.
    #[func]
    fn decode_combat_preview_json(&self, preview_bytes: PackedByteArray) -> GString {
        let preview_bytes = preview_bytes.to_vec();
        let preview = match wire::deserialize_combat_preview(&preview_bytes) {
            Ok(preview) => preview,
            Err(err) => {
                godot_error!("Invalid combat preview bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_combat_preview_json(&preview) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize combat preview JSON: {err}");
                GString::new()
            }
        }
    }

    /// Decode MessagePack-encoded WhyPanel into a JSON string.
    #[func]
    fn decode_why_panel_json(&self, panel_bytes: PackedByteArray) -> GString {
        let panel_bytes = panel_bytes.to_vec();
        let panel = match wire::deserialize_why_panel(&panel_bytes) {
            Ok(panel) => panel,
            Err(err) => {
                godot_error!("Invalid why panel bytes: {err}");
                return GString::new();
            }
        };

        match wire::serialize_why_panel_json(&panel) {
            Ok(json) => GString::from(json.as_str()),
            Err(err) => {
                godot_error!("Failed to serialize why panel JSON: {err}");
                GString::new()
            }
        }
    }

    /// Export current game replay (seed + rules hash + command log).
    #[func]
    fn export_replay(&self) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };
        let Some(replay) = engine.export_replay() else {
            return PackedByteArray::new();
        };

        match wire::serialize_replay(&replay) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize replay: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Import a replay and return a fresh snapshot.
    #[func]
    fn import_replay(&mut self, replay_bytes: PackedByteArray) -> PackedByteArray {
        let Some(engine) = self.engine.as_mut() else {
            return PackedByteArray::new();
        };

        let replay_bytes = replay_bytes.to_vec();
        let replay = match wire::deserialize_replay(&replay_bytes) {
            Ok(replay) => replay,
            Err(err) => {
                godot_error!("Invalid replay bytes: {err}");
                return PackedByteArray::new();
            }
        };

        if let Err(err) = engine.import_replay(replay) {
            godot_error!("Failed to import replay: {err}");
            return PackedByteArray::new();
        }

        let snapshot = engine.snapshot();
        match wire::serialize_snapshot(&snapshot) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize snapshot after replay import: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Get current game snapshot (for reconnect/sync).
    #[func]
    fn get_snapshot(&self) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };
        let snapshot = engine.snapshot();
        match wire::serialize_snapshot(&snapshot) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize snapshot: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Get human-readable rules names (tech/policy/improvement/etc) for UI rendering.
    /// Returns RulesNames as MessagePack bytes.
    #[func]
    fn query_rules_names(&self) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let names = engine.rules_names();
        match wire::serialize_rules_names(&names) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize rules names: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Get full RulesCatalog (tech/unit/building/improvement details) for UI panels.
    /// Returns RulesCatalog as MessagePack bytes.
    #[func]
    fn query_rules_catalog(&self) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let catalog = engine.rules_catalog();
        match wire::serialize_rules_catalog(&catalog) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize rules catalog: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Replay scrub: jump to the start of a world turn (P0's turn) and return a fresh snapshot.
    #[func]
    fn replay_to_turn(&mut self, turn: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_mut() else {
            return PackedByteArray::new();
        };

        let turn = turn.max(1) as u32;
        if !engine.replay_to_turn_start(turn) {
            return PackedByteArray::new();
        }

        let snapshot = engine.snapshot();
        match wire::serialize_snapshot(&snapshot) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize replay snapshot: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute combat preview (doesn't modify state).
    /// Returns CombatPreview as MessagePack bytes.
    #[func]
    fn query_combat_preview(&self, attacker_id: i64, defender_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let attacker_id = backbay_protocol::UnitId::from_raw(attacker_id as u64);
        let defender_id = backbay_protocol::UnitId::from_raw(defender_id as u64);
        let Some(preview) = engine.query_combat_preview(attacker_id, defender_id) else {
            return PackedByteArray::new();
        };

        match wire::serialize_combat_preview(&preview) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize combat preview: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: “Why?” breakdown for a combat preview.
    /// Returns WhyPanel as MessagePack bytes.
    #[func]
    fn query_combat_why(&self, attacker_id: i64, defender_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let attacker_id = backbay_protocol::UnitId::from_raw(attacker_id as u64);
        let defender_id = backbay_protocol::UnitId::from_raw(defender_id as u64);
        let Some(panel) = engine.query_combat_why(attacker_id, defender_id) else {
            return PackedByteArray::new();
        };

        match wire::serialize_why_panel(&panel) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize combat why panel: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: “Why?” breakdown for gold maintenance / upkeep for a player.
    /// Returns WhyPanel as MessagePack bytes.
    #[func]
    fn query_maintenance_why(&self, player: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let player = backbay_protocol::PlayerId(player.clamp(0, 255) as u8);
        let panel = engine.query_maintenance_why(player);

        match wire::serialize_why_panel(&panel) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize maintenance why panel: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: “Why?” breakdown for upkeep focused on a single city.
    /// Returns WhyPanel as MessagePack bytes.
    #[func]
    fn query_city_maintenance_why(&self, city_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let city_id = backbay_protocol::CityId::from_raw(city_id as u64);
        let panel = engine.query_city_maintenance_why(city_id);

        match wire::serialize_why_panel(&panel) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize city maintenance why panel: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: “Why?” breakdown for city unrest/stability stand-ins.
    /// Returns WhyPanel as MessagePack bytes.
    #[func]
    fn query_unrest_why(&self, city_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let city_id = backbay_protocol::CityId::from_raw(city_id as u64);
        let panel = engine.query_unrest_why(city_id);

        match wire::serialize_why_panel(&panel) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize unrest why panel: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: “Why?” breakdown for conversion (religion) mechanics.
    /// Returns WhyPanel as MessagePack bytes.
    #[func]
    fn query_conversion_why(&self, city_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let city_id = backbay_protocol::CityId::from_raw(city_id as u64);
        let panel = engine.query_conversion_why(city_id);

        match wire::serialize_why_panel(&panel) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize conversion why panel: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: “Why?” breakdown for treaties / diplomacy state.
    /// Returns WhyPanel as MessagePack bytes.
    #[func]
    fn query_treaty_why(&self, a: i32, b: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let a = backbay_protocol::PlayerId(a.clamp(0, 255) as u8);
        let b = backbay_protocol::PlayerId(b.clamp(0, 255) as u8);
        let panel = engine.query_treaty_why(a, b);

        match wire::serialize_why_panel(&panel) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize treaty why panel: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute movement range for a unit.
    /// Returns Vec<Hex> as MessagePack bytes.
    #[func]
    fn query_movement_range(&self, unit_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let unit_id = backbay_protocol::UnitId::from_raw(unit_id as u64);
        let range = engine.query_movement_range(unit_id);

        match wire::serialize_hexes(&range) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize movement range: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute a shortest path for a unit to a destination hex.
    /// Returns Vec<Hex> as MessagePack bytes.
    #[func]
    fn query_path(&self, unit_id: i64, dest_q: i32, dest_r: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let unit_id = backbay_protocol::UnitId::from_raw(unit_id as u64);
        let destination = backbay_protocol::Hex {
            q: dest_q,
            r: dest_r,
        };
        let path = engine.query_path(unit_id, destination);

        match wire::serialize_hexes(&path) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize path hexes: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute a path and preview how far it can execute this turn.
    /// Returns PathPreview as MessagePack bytes.
    #[func]
    fn query_path_preview(&self, unit_id: i64, dest_q: i32, dest_r: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let unit_id = backbay_protocol::UnitId::from_raw(unit_id as u64);
        let destination = backbay_protocol::Hex {
            q: dest_q,
            r: dest_r,
        };
        let preview = engine.query_path_preview(unit_id, destination);

        match wire::serialize_path_preview(&preview) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize path preview: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute tiles in enemy zone-of-control (ZOC) for a given player.
    /// Returns Vec<Hex> as MessagePack bytes.
    #[func]
    fn query_enemy_zoc(&self, player: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let player = backbay_protocol::PlayerId(player.clamp(0, 255) as u8);
        let hexes = engine.query_enemy_zoc(player);

        match wire::serialize_hexes(&hexes) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize enemy ZOC hexes: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: current fog-of-war visible tiles for a player.
    /// Returns Vec<Hex> as MessagePack bytes.
    #[func]
    fn query_visible_tiles(&self, player: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let player = backbay_protocol::PlayerId(player.clamp(0, 255) as u8);
        let hexes = engine.query_visible_tiles(player);

        match wire::serialize_hexes(&hexes) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize visible tiles: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute the promise strip for a player (upcoming completions).
    /// Returns Vec<TurnPromise> as MessagePack bytes.
    #[func]
    fn query_promise_strip(&self, player: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let player = backbay_protocol::PlayerId(player.clamp(0, 255) as u8);
        let promises = engine.query_promise_strip(player);

        match wire::serialize_promises(&promises) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize promises: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: compute a UI-focused city summary.
    /// Returns CityUi as MessagePack bytes.
    #[func]
    fn query_city_ui(&self, city_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let city_id = backbay_protocol::CityId::from_raw(city_id as u64);
        let Some(ui) = engine.query_city_ui(city_id) else {
            return PackedByteArray::new();
        };

        match wire::serialize_city_ui(&ui) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize city ui: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: list production options for a city (filtered by prereqs and existing buildings).
    /// Returns Vec<UiProductionOption> as MessagePack bytes.
    #[func]
    fn query_production_options(&self, city_id: i64) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let city_id = backbay_protocol::CityId::from_raw(city_id as u64);
        let options = engine.query_production_options(city_id);

        match wire::serialize_production_options(&options) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize production options: {err}");
                PackedByteArray::new()
            }
        }
    }

    /// Query: list researchable techs for a player (filtered by prereqs).
    /// Returns Vec<UiTechOption> as MessagePack bytes.
    #[func]
    fn query_tech_options(&self, player: i32) -> PackedByteArray {
        let Some(engine) = self.engine.as_ref() else {
            return PackedByteArray::new();
        };

        let player = backbay_protocol::PlayerId(player.clamp(0, 255) as u8);
        let options = engine.query_tech_options(player);

        match wire::serialize_tech_options(&options) {
            Ok(bytes) => PackedByteArray::from(bytes),
            Err(err) => {
                godot_error!("Failed to serialize tech options: {err}");
                PackedByteArray::new()
            }
        }
    }
}

fn empty_events() -> PackedByteArray {
    match wire::serialize_events(&[]) {
        Ok(bytes) => PackedByteArray::from(bytes),
        Err(_) => PackedByteArray::new(),
    }
}
