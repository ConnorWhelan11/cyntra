//! Server-authoritative game state.
//!
//! `backbay-server` owns networking/session/turn-timer concerns, but the authoritative simulation
//! lives in `backbay-core::GameEngine`. This module wraps the core engine and exposes:
//! - current `Snapshot` + deterministic checksum
//! - validated/atomic command application
//! - state deltas as core `Event`s (including per-player visibility events)

use std::collections::{HashMap, HashSet};

use backbay_core::GameEngine;
use backbay_protocol::{
    ChronicleEvent, CityId, CityUi, CombatPreview, Command, Event, Hex, PathPreview, PlayerId,
    ReplayFile, RulesCatalog, RulesNames, Snapshot, TerrainId, TurnPromise, UiProductionOption,
    UnitId, WhyPanel,
};

use super::{TurnManager, TurnMode, WarState};
use crate::config::TurnTimerConfig;

/// Result of validating and applying commands.
#[derive(Debug)]
pub enum ApplyResult {
    /// Commands applied successfully.
    Success {
        /// Fog-of-war filtered deltas to send to each player.
        deltas_by_player: HashMap<PlayerId, Vec<Event>>,
        /// Whether this submission ended the player's turn.
        turn_ended: bool,
    },
    /// Player cannot act right now.
    NotYourTurn,
    /// Command validation failed.
    ValidationError { index: usize, reason: String },
    /// Desync detected.
    DesyncDetected { expected: u64, received: u64 },
}

/// Server game state with validation and checksum support.
#[derive(Debug)]
pub struct GameState {
    engine: GameEngine,
    snapshot: Snapshot,
    checksum: u64,
    war_state: WarState,
    turn_manager: TurnManager,
    game_over: bool,
}

impl GameState {
    const UNKNOWN_TERRAIN: TerrainId = TerrainId::new(u16::MAX);

    /// Create a new server game state from a core engine.
    pub fn new(engine: GameEngine, turn_mode: TurnMode, timer_config: TurnTimerConfig) -> Self {
        let snapshot = engine.snapshot();
        let checksum = backbay_protocol::wire::snapshot_hash(&snapshot).expect("snapshot hash");
        let players: Vec<PlayerId> = snapshot.players.iter().map(|p| p.id).collect();

        Self {
            engine,
            snapshot,
            checksum,
            war_state: WarState::new(),
            turn_manager: TurnManager::new(turn_mode, timer_config, players),
            game_over: false,
        }
    }

    /// Get the current snapshot (for sync to clients).
    pub fn snapshot(&self) -> &Snapshot {
        &self.snapshot
    }

    /// Get a fog-of-war filtered snapshot for a given player.
    ///
    /// The authoritative server state still contains the full world; this view redacts:
    /// - map terrain for unexplored tiles
    /// - non-visible tile details (owner/city/improvement/resource)
    /// - non-visible enemy units/cities
    /// - private economy/research fields for other players
    pub fn snapshot_for_player(&self, player: PlayerId) -> Snapshot {
        let player_index = player.0 as usize;
        let Some(vis) = self.engine.state().visibility.get(player_index) else {
            return self.snapshot.clone();
        };
        let explored = vis.explored();
        let visible = vis.visible();

        let mut snap = self.snapshot.clone();

        // Redact player-private info.
        for p in snap.players.iter_mut() {
            if p.id == player {
                continue;
            }
            p.researching = None;
            p.research = None;
            p.research_overflow = 0;
            p.known_techs.clear();
            p.gold = 0;
            p.culture = 0;
            p.culture_milestones_reached = 0;
            p.available_policy_picks = 0;
            p.policies.clear();
            p.policy_adopted_era.clear();
            p.government = None;
            p.supply_used = 0;
            p.supply_cap = 0;
            p.war_weariness = 0;
        }

        // Redact chronicle entries that would leak hidden information.
        snap.chronicle.retain(|entry| match &entry.event {
            ChronicleEvent::CityFounded { owner, .. } => *owner == player,
            ChronicleEvent::CityConquered {
                old_owner,
                new_owner,
                ..
            } => *old_owner == player || *new_owner == player,
            ChronicleEvent::CityGrew { owner, .. } => *owner == player,
            ChronicleEvent::BorderExpanded { owner, .. } => *owner == player,
            ChronicleEvent::WonderCompleted { owner, .. } => *owner == player,
            ChronicleEvent::UnitTrained { owner, .. } => *owner == player,
            ChronicleEvent::BuildingConstructed { owner, .. } => *owner == player,
            ChronicleEvent::TechResearched { player: p, .. } => *p == player,
            ChronicleEvent::PolicyAdopted { player: p, .. } => *p == player,
            ChronicleEvent::GovernmentReformed { player: p, .. } => *p == player,
            ChronicleEvent::ImprovementBuilt { player: p, .. } => *p == player,
            ChronicleEvent::ImprovementMatured { player: p, .. } => *p == player,
            ChronicleEvent::ImprovementPillaged { by, .. } => *by == player,
            ChronicleEvent::ImprovementRepaired { player: p, .. } => *p == player,
            ChronicleEvent::TradeRouteEstablished { owner, .. } => *owner == player,
            ChronicleEvent::TradeRoutePillaged { by, .. } => *by == player,
            ChronicleEvent::WarDeclared { aggressor, target } => {
                *aggressor == player || *target == player
            }
            ChronicleEvent::PeaceDeclared { a, b } => *a == player || *b == player,
            ChronicleEvent::BattleEnded {
                attacker,
                defender,
                winner,
                ..
            } => *attacker == player || *defender == player || *winner == player,
            ChronicleEvent::UnitPromoted { owner, .. } => *owner == player,
        });

        // Never expose RNG state to clients (prevents prediction).
        snap.rng_state = [0; 32];

        // Redact map tiles.
        for (idx, tile) in snap.map.tiles.iter_mut().enumerate() {
            let is_explored = explored.get(idx).copied().unwrap_or(false);
            let is_visible = visible.get(idx).copied().unwrap_or(false);

            if !is_explored {
                tile.terrain = Self::UNKNOWN_TERRAIN;
            }

            if !is_visible {
                tile.owner = None;
                tile.city = None;
                tile.improvement = None;
                tile.resource = None;
            }
        }

        // Redact non-visible enemy units/cities.
        snap.units.retain(|u| {
            if u.owner == player {
                return true;
            }
            self.engine
                .state()
                .map
                .index_of(u.pos)
                .and_then(|idx| visible.get(idx).copied())
                .unwrap_or(false)
        });

        // Never leak intent/automation state for visible enemy units.
        //
        // Policy:
        // - Do not reveal orders/automation (intent).
        // - Do not reveal remaining moves this turn; expose only the unit's base movement stat.
        for u in snap.units.iter_mut() {
            if u.owner != player {
                u.orders = None;
                u.automated = false;
                u.moves_left = self.engine.state().rules.unit_type(u.type_id).moves;
            }
        }

        snap.cities.retain(|c| {
            if c.owner == player {
                return true;
            }
            self.engine
                .state()
                .map
                .index_of(c.pos)
                .and_then(|idx| visible.get(idx).copied())
                .unwrap_or(false)
        });

        // Trade routes are private to the owner for now.
        snap.trade_routes.retain(|r| r.owner == player);

        snap
    }

    /// Get the current checksum (for desync detection).
    pub fn checksum(&self) -> u64 {
        self.checksum
    }

    /// Get reference to war state.
    pub fn war_state(&self) -> &WarState {
        &self.war_state
    }

    /// Get reference to turn manager.
    pub fn turn_manager(&self) -> &TurnManager {
        &self.turn_manager
    }

    /// Get mutable reference to turn manager.
    pub fn turn_manager_mut(&mut self) -> &mut TurnManager {
        &mut self.turn_manager
    }

    /// Get current world turn number (from the authoritative core snapshot).
    pub fn turn_number(&self) -> u32 {
        self.snapshot.turn
    }

    pub fn is_game_over(&self) -> bool {
        self.game_over
    }

    pub fn rules_names(&self) -> RulesNames {
        self.engine.rules_names()
    }

    pub fn rules_catalog(&self) -> RulesCatalog {
        self.engine.rules_catalog()
    }

    pub fn export_replay(&self) -> Option<ReplayFile> {
        self.engine.export_replay()
    }

    pub fn promise_strip(&self, player: PlayerId) -> Vec<TurnPromise> {
        self.engine.query_promise_strip(player)
    }

    fn city_owner(&self, city_id: CityId) -> Option<PlayerId> {
        self.snapshot
            .cities
            .iter()
            .find(|c| c.id == city_id)
            .map(|c| c.owner)
    }

    fn unit_owner_and_pos(&self, unit_id: UnitId) -> Option<(PlayerId, Hex)> {
        self.snapshot
            .units
            .iter()
            .find(|u| u.id == unit_id)
            .map(|u| (u.owner, u.pos))
    }

    fn is_hex_visible_to_player(&self, player: PlayerId, hex: Hex) -> bool {
        let player_index = player.0 as usize;
        let Some(vis) = self.engine.state().visibility.get(player_index) else {
            return false;
        };
        let Some(idx) = self.engine.state().map.index_of(hex) else {
            return false;
        };
        vis.visible().get(idx).copied().unwrap_or(false)
    }

    fn is_unit_visible_to_player(&self, player: PlayerId, unit_id: UnitId) -> bool {
        let Some((owner, pos)) = self.unit_owner_and_pos(unit_id) else {
            return false;
        };
        if owner == player {
            return true;
        }
        self.is_hex_visible_to_player(player, pos)
    }

    pub fn query_city_ui(&self, player: PlayerId, city_id: CityId) -> Option<CityUi> {
        if self.city_owner(city_id)? != player {
            return None;
        }
        self.engine.query_city_ui(city_id)
    }

    pub fn query_production_options(
        &self,
        player: PlayerId,
        city_id: CityId,
    ) -> Option<Vec<UiProductionOption>> {
        if self.city_owner(city_id)? != player {
            return None;
        }
        Some(self.engine.query_production_options(city_id))
    }

    pub fn query_combat_preview(
        &self,
        player: PlayerId,
        attacker_id: UnitId,
        defender_id: UnitId,
    ) -> Option<CombatPreview> {
        let Some((attacker_owner, _)) = self.unit_owner_and_pos(attacker_id) else {
            return None;
        };
        if attacker_owner != player {
            return None;
        }
        if !self.is_unit_visible_to_player(player, defender_id) {
            return None;
        }
        self.engine.query_combat_preview(attacker_id, defender_id)
    }

    pub fn query_path_preview(&self, player: PlayerId, unit_id: UnitId, destination: Hex) -> PathPreview {
        let unit_pos = self
            .snapshot
            .units
            .iter()
            .find(|u| u.id == unit_id)
            .map(|u| (u.owner, u.pos));

        let Some((owner, pos)) = unit_pos else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: destination,
                stop_reason: None,
            };
        };

        if owner != player {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: pos,
                stop_reason: None,
            };
        }

        self.engine
            .query_path_preview_for_player(player, unit_id, destination)
    }

    pub fn query_combat_why(
        &self,
        player: PlayerId,
        attacker_id: UnitId,
        defender_id: UnitId,
    ) -> Option<WhyPanel> {
        let Some((attacker_owner, _)) = self.unit_owner_and_pos(attacker_id) else {
            return None;
        };
        if attacker_owner != player {
            return None;
        }
        if !self.is_unit_visible_to_player(player, defender_id) {
            return None;
        }
        self.engine.query_combat_why(attacker_id, defender_id)
    }

    pub fn query_maintenance_why(&self, player: PlayerId) -> WhyPanel {
        self.engine.query_maintenance_why(player)
    }

    pub fn query_city_maintenance_why(&self, player: PlayerId, city_id: CityId) -> Option<WhyPanel> {
        if self.city_owner(city_id)? != player {
            return None;
        }
        Some(self.engine.query_city_maintenance_why(city_id))
    }

    /// Build a visibility-only delta that (re)reveals the tiles currently visible to `player`.
    ///
    /// This is useful for initial sync and reconnect, since `Snapshot` does not include fog-of-war.
    pub fn visibility_sync_deltas(&self, player: PlayerId) -> Vec<Event> {
        let player_index = player.0 as usize;
        let Some(vis) = self.engine.state().visibility.get(player_index) else {
            return Vec::new();
        };
        let visible = vis.visible();

        let width = self.snapshot.map.width as usize;
        if width == 0 {
            return Vec::new();
        }

        let tiles = &self.snapshot.map.tiles;
        let len = visible.len().min(tiles.len());

        let mut events = Vec::new();
        for idx in 0..len {
            if !visible[idx] {
                continue;
            }
            let q = (idx % width) as i32;
            let r = (idx / width) as i32;
            let terrain = tiles[idx].terrain;
            events.push(Event::TileRevealed {
                hex: Hex { q, r },
                terrain,
            });
        }
        events
    }

    fn visible_enemy_units_by_player(&self) -> HashMap<PlayerId, HashSet<UnitId>> {
        let mut out = HashMap::new();
        let players: Vec<PlayerId> = self.snapshot.players.iter().map(|p| p.id).collect();

        for pid in players {
            let player_index = pid.0 as usize;
            let Some(vis) = self.engine.state().visibility.get(player_index) else {
                continue;
            };
            let visible = vis.visible();

            let mut set = HashSet::new();
            for u in &self.snapshot.units {
                if u.owner == pid {
                    continue;
                }
                let is_visible = self
                    .engine
                    .state()
                    .map
                    .index_of(u.pos)
                    .and_then(|idx| visible.get(idx).copied())
                    .unwrap_or(false);
                if is_visible {
                    set.insert(u.id);
                }
            }

            out.insert(pid, set);
        }

        out
    }

    fn visible_enemy_cities_by_player(&self) -> HashMap<PlayerId, HashSet<CityId>> {
        let mut out = HashMap::new();
        let players: Vec<PlayerId> = self.snapshot.players.iter().map(|p| p.id).collect();

        for pid in players {
            let player_index = pid.0 as usize;
            let Some(vis) = self.engine.state().visibility.get(player_index) else {
                continue;
            };
            let visible = vis.visible();

            let mut set = HashSet::new();
            for c in &self.snapshot.cities {
                if c.owner == pid {
                    continue;
                }
                let is_visible = self
                    .engine
                    .state()
                    .map
                    .index_of(c.pos)
                    .and_then(|idx| visible.get(idx).copied())
                    .unwrap_or(false);
                if is_visible {
                    set.insert(c.id);
                }
            }

            out.insert(pid, set);
        }

        out
    }

    /// Apply a list of commands from a player.
    pub fn apply_commands(
        &mut self,
        player: PlayerId,
        mut commands: Vec<Command>,
        end_turn: bool,
        client_checksum: u64,
    ) -> ApplyResult {
        if client_checksum != 0 && client_checksum != self.checksum {
            return ApplyResult::DesyncDetected {
                expected: self.checksum,
                received: client_checksum,
            };
        }

        if self.snapshot.current_player != player || !self.turn_manager.can_act(player, &self.war_state)
        {
            return ApplyResult::NotYourTurn;
        }

        if end_turn && !matches!(commands.last(), Some(Command::EndTurn)) {
            commands.push(Command::EndTurn);
        }

        // Validate EndTurn placement (at most once, and if present it must be last).
        let mut end_turn_idx: Option<usize> = None;
        for (idx, cmd) in commands.iter().enumerate() {
            if matches!(cmd, Command::EndTurn) {
                if end_turn_idx.is_some() {
                    return ApplyResult::ValidationError {
                        index: idx,
                        reason: "Multiple EndTurn commands".to_string(),
                    };
                }
                end_turn_idx = Some(idx);
            }
        }
        if let Some(idx) = end_turn_idx {
            if idx + 1 != commands.len() {
                return ApplyResult::ValidationError {
                    index: idx,
                    reason: "EndTurn must be the final command in a submission".to_string(),
                };
            }
        }

        let turn_ended = matches!(commands.last(), Some(Command::EndTurn));

        // Capture old visibility-based sets for fog-of-war diffing.
        let old_visible_units = self.visible_enemy_units_by_player();
        let old_visible_cities = self.visible_enemy_cities_by_player();

        // Owner lookup maps for routing events that don't carry a player id.
        let unit_owner_before: HashMap<UnitId, PlayerId> =
            self.snapshot.units.iter().map(|u| (u.id, u.owner)).collect();
        let trade_route_owner_before: HashMap<backbay_protocol::TradeRouteId, PlayerId> = self
            .snapshot
            .trade_routes
            .iter()
            .map(|r| (r.id, r.owner))
            .collect();

        // Apply atomically on a scratch clone.
        let mut scratch = self.engine.clone();
        let mut core_events: Vec<Event> = Vec::new();
        let mut visibility_deltas: HashMap<PlayerId, Vec<Event>> = HashMap::new();

        for (index, command) in commands.into_iter().enumerate() {
            let events = match scratch.apply_command_checked(command) {
                Ok(events) => events,
                Err(err) => {
                    return ApplyResult::ValidationError {
                        index,
                        reason: err.to_string(),
                    };
                }
            };

            let visibility_player = scratch.state().current_player;
            for event in events {
                match event {
                    Event::TileRevealed { .. } | Event::TileHidden { .. } => {
                        visibility_deltas
                            .entry(visibility_player)
                            .or_default()
                            .push(event);
                    }
                    _ => core_events.push(event),
                }
            }
        }

        // Commit.
        self.engine = scratch;
        self.snapshot = self.engine.snapshot();
        self.checksum = backbay_protocol::wire::snapshot_hash(&self.snapshot).expect("snapshot hash");

        // Keep server-side war/turn mode state in sync with core events.
        for event in &core_events {
            match event {
                Event::WarDeclared { aggressor, target } => {
                    self.war_state
                        .declare_war(*aggressor, *target, self.snapshot.turn);
                    self.turn_manager.update_for_war_change(&self.war_state);
                }
                Event::PeaceDeclared { a, b } => {
                    self.war_state.declare_peace(*a, *b);
                    self.turn_manager.update_for_war_change(&self.war_state);
                }
                Event::GameEnded { .. } => {
                    self.game_over = true;
                }
                _ => {}
            }
        }

        if turn_ended {
            let _ = self.turn_manager.end_turn(player, &self.war_state);
        }

        // Build per-player deltas (fog-of-war aware).
        let players: Vec<PlayerId> = self.snapshot.players.iter().map(|p| p.id).collect();
        let mut deltas_by_player: HashMap<PlayerId, Vec<Event>> =
            players.iter().map(|&p| (p, Vec::new())).collect();

        let unit_owner_after: HashMap<UnitId, PlayerId> =
            self.snapshot.units.iter().map(|u| (u.id, u.owner)).collect();
        let city_owner_after: HashMap<CityId, PlayerId> =
            self.snapshot.cities.iter().map(|c| (c.id, c.owner)).collect();

        fn push_for_player(
            deltas_by_player: &mut HashMap<PlayerId, Vec<Event>>,
            pid: PlayerId,
            e: &Event,
        ) {
            if let Some(list) = deltas_by_player.get_mut(&pid) {
                list.push(e.clone());
            }
        }

        fn push_for_all(
            deltas_by_player: &mut HashMap<PlayerId, Vec<Event>>,
            players: &[PlayerId],
            e: &Event,
        ) {
            for pid in players {
                push_for_player(deltas_by_player, *pid, e);
            }
        }

        // Route core events.
        for e in &core_events {
            match e {
                // Game flow is public.
                Event::TurnStarted { .. }
                | Event::TurnEnded { .. }
                | Event::GameEnded { .. }
                | Event::WarDeclared { .. }
                | Event::PeaceDeclared { .. } => push_for_all(&mut deltas_by_player, &players, e),

                // Diplomacy relation changes are private to the parties.
                Event::RelationChanged { a, b, .. } => {
                    push_for_player(&mut deltas_by_player, *a, e);
                    if *b != *a {
                        push_for_player(&mut deltas_by_player, *b, e);
                    }
                }

                // Economy/research/civics are private.
                Event::SupplyUpdated { player, .. }
                | Event::TechResearched { player, .. }
                | Event::ResearchProgress { player, .. }
                | Event::PolicyAdopted { player, .. }
                | Event::GovernmentReformed { player, .. } => {
                    push_for_player(&mut deltas_by_player, *player, e)
                }

                // Chronicle entries are private by default; keep only entries relevant to a player.
                Event::ChronicleEntryAdded { entry } => {
                    for pid in &players {
                        let relevant = match &entry.event {
                            ChronicleEvent::CityFounded { owner, .. } => *owner == *pid,
                            ChronicleEvent::CityConquered {
                                old_owner,
                                new_owner,
                                ..
                            } => *old_owner == *pid || *new_owner == *pid,
                            ChronicleEvent::CityGrew { owner, .. } => *owner == *pid,
                            ChronicleEvent::BorderExpanded { owner, .. } => *owner == *pid,
                            ChronicleEvent::WonderCompleted { owner, .. } => *owner == *pid,
                            ChronicleEvent::UnitTrained { owner, .. } => *owner == *pid,
                            ChronicleEvent::BuildingConstructed { owner, .. } => *owner == *pid,
                            ChronicleEvent::TechResearched { player, .. } => *player == *pid,
                            ChronicleEvent::PolicyAdopted { player, .. } => *player == *pid,
                            ChronicleEvent::GovernmentReformed { player, .. } => *player == *pid,
                            ChronicleEvent::ImprovementBuilt { player, .. } => *player == *pid,
                            ChronicleEvent::ImprovementMatured { player, .. } => *player == *pid,
                            ChronicleEvent::ImprovementPillaged { by, .. } => *by == *pid,
                            ChronicleEvent::ImprovementRepaired { player, .. } => *player == *pid,
                            ChronicleEvent::TradeRouteEstablished { owner, .. } => *owner == *pid,
                            ChronicleEvent::TradeRoutePillaged { by, .. } => *by == *pid,
                            ChronicleEvent::WarDeclared { aggressor, target } => {
                                *aggressor == *pid || *target == *pid
                            }
                            ChronicleEvent::PeaceDeclared { a, b } => *a == *pid || *b == *pid,
                            ChronicleEvent::BattleEnded {
                                attacker,
                                defender,
                                winner,
                                ..
                            } => *attacker == *pid || *defender == *pid || *winner == *pid,
                            ChronicleEvent::UnitPromoted { owner, .. } => *owner == *pid,
                        };
                        if relevant {
                            push_for_player(&mut deltas_by_player, *pid, e);
                        }
                    }
                }

                // Unit events are private to the unit owner.
                Event::UnitCreated { owner, .. } => push_for_player(&mut deltas_by_player, *owner, e),
                Event::UnitUpdated { unit } => push_for_player(&mut deltas_by_player, unit.owner, e),
                Event::UnitMoved { unit, .. }
                | Event::MovementStopped { unit, .. }
                | Event::UnitPromoted { unit, .. }
                | Event::OrdersCompleted { unit }
                | Event::OrdersInterrupted { unit, .. }
                | Event::UnitDamaged { unit, .. } => {
                    if let Some(owner) = unit_owner_after
                        .get(unit)
                        .copied()
                        .or_else(|| unit_owner_before.get(unit).copied())
                    {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                }
                Event::UnitDied { unit, .. } => {
                    if let Some(owner) = unit_owner_before.get(unit).copied() {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                }

                // City events are private to the city owner(s).
                Event::CityFounded { owner, .. } => push_for_player(&mut deltas_by_player, *owner, e),
                Event::CityGrew { city, .. }
                | Event::CityProduced { city, .. }
                | Event::CityProductionSet { city, .. } => {
                    if let Some(owner) = city_owner_after.get(city).copied() {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                }
                Event::BordersExpanded { city, .. } => {
                    if let Some(owner) = city_owner_after.get(city).copied() {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                }
                Event::CityConquered {
                    old_owner,
                    new_owner,
                    ..
                } => {
                    push_for_player(&mut deltas_by_player, *old_owner, e);
                    if *new_owner != *old_owner {
                        push_for_player(&mut deltas_by_player, *new_owner, e);
                    }
                }

                // Improvements are routed to the tile owner, if any.
                Event::ImprovementBuilt { hex, .. }
                | Event::ImprovementMatured { hex, .. }
                | Event::ImprovementPillaged { hex, .. }
                | Event::ImprovementRepaired { hex, .. } => {
                    if let Some(idx) = self.engine.state().map.index_of(*hex) {
                        if let Some(tile) = self.snapshot.map.tiles.get(idx) {
                            if let Some(owner) = tile.owner {
                                push_for_player(&mut deltas_by_player, owner, e);
                            }
                        }
                    }
                }

                // Trade is private to the route owner.
                Event::TradeRouteEstablished { owner, .. } => {
                    push_for_player(&mut deltas_by_player, *owner, e)
                }
                Event::TradeRoutePillaged { route, .. } => {
                    if let Some(owner) = trade_route_owner_before.get(route).copied() {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                }

                // Combat is private to the unit owners.
                Event::CombatStarted { attacker, defender } => {
                    if let Some(owner) = unit_owner_before.get(attacker).copied() {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                    if let Some(owner) = unit_owner_before.get(defender).copied() {
                        push_for_player(&mut deltas_by_player, owner, e);
                    }
                }
                Event::CombatRound { .. } => {
                    // CombatRound doesn't carry unit ids; treat it as public feedback.
                    push_for_all(&mut deltas_by_player, &players, e);
                }
                Event::CombatEnded {
                    attacker_owner,
                    defender_owner,
                    ..
                } => {
                    push_for_player(&mut deltas_by_player, *attacker_owner, e);
                    if *defender_owner != *attacker_owner {
                        push_for_player(&mut deltas_by_player, *defender_owner, e);
                    }
                }

                _ => {}
            }
        }

        // Attach per-player tile visibility deltas.
        for (pid, vis_events) in &visibility_deltas {
            if let Some(list) = deltas_by_player.get_mut(pid) {
                list.extend(vis_events.clone());
            }
        }

        // Fog-of-war view sync: send visible enemy units/cities each tick and hide those no longer visible.
        let new_visible_units = self.visible_enemy_units_by_player();
        let new_visible_cities = self.visible_enemy_cities_by_player();

        let mut changed_hexes: HashSet<Hex> = HashSet::new();
        for e in &core_events {
            match e {
                Event::CityFounded { pos, .. } => {
                    changed_hexes.insert(*pos);
                }
                Event::BordersExpanded { new_tiles, .. } => {
                    changed_hexes.extend(new_tiles.iter().copied());
                }
                Event::CityConquered { city, .. } => {
                    if let Some(c) = self.snapshot.cities.iter().find(|c| c.id == *city) {
                        changed_hexes.insert(c.pos);
                    }
                }
                Event::ImprovementBuilt { hex, .. }
                | Event::ImprovementMatured { hex, .. }
                | Event::ImprovementPillaged { hex, .. }
                | Event::ImprovementRepaired { hex, .. } => {
                    changed_hexes.insert(*hex);
                }
                _ => {}
            }
        }
        for (_pid, vis_events) in &visibility_deltas {
            for ve in vis_events {
                if let Event::TileRevealed { hex, .. } = ve {
                    changed_hexes.insert(*hex);
                }
            }
        }

        for pid in &players {
            let player_index = pid.0 as usize;
            let Some(vis) = self.engine.state().visibility.get(player_index) else {
                continue;
            };
            let visible = vis.visible();

            let Some(list) = deltas_by_player.get_mut(pid) else {
                continue;
            };

            let old_set = old_visible_units.get(pid).cloned().unwrap_or_default();
            let new_set = new_visible_units.get(pid).cloned().unwrap_or_default();

            for unit_id in old_set.difference(&new_set) {
                list.push(Event::UnitHidden { unit: *unit_id });
            }
            for unit_id in &new_set {
                if let Some(unit) = self.snapshot.units.iter().find(|u| u.id == *unit_id) {
                    let mut redacted = unit.clone();
                    redacted.orders = None;
                    redacted.automated = false;
                    redacted.moves_left = self.engine.state().rules.unit_type(redacted.type_id).moves;
                    list.push(Event::UnitSpotted { unit: redacted });
                }
            }

            let old_c_set = old_visible_cities.get(pid).cloned().unwrap_or_default();
            let new_c_set = new_visible_cities.get(pid).cloned().unwrap_or_default();

            for city_id in old_c_set.difference(&new_c_set) {
                list.push(Event::CityHidden { city: *city_id });
            }
            for city_id in &new_c_set {
                if let Some(city) = self.snapshot.cities.iter().find(|c| c.id == *city_id) {
                    list.push(Event::CitySpotted { city: city.clone() });
                }
            }

            // Map tile refresh for any changed tile that is currently visible to this player.
            for hex in &changed_hexes {
                let is_visible = self
                    .engine
                    .state()
                    .map
                    .index_of(*hex)
                    .and_then(|idx| visible.get(idx).copied())
                    .unwrap_or(false);
                if !is_visible {
                    continue;
                }
                if let Some(idx) = self.engine.state().map.index_of(*hex) {
                    if let Some(tile) = self.snapshot.map.tiles.get(idx) {
                        list.push(Event::TileSpotted {
                            hex: *hex,
                            tile: tile.clone(),
                        });
                    }
                }
            }
        }

        ApplyResult::Success {
            deltas_by_player,
            turn_ended,
        }
    }

    /// Get unit count for a player (for timer calculation).
    pub fn unit_count(&self, player: PlayerId) -> u32 {
        self.snapshot
            .units
            .iter()
            .filter(|u| u.owner == player)
            .count() as u32
    }

    /// Get city count for a player (for timer calculation).
    pub fn city_count(&self, player: PlayerId) -> u32 {
        self.snapshot
            .cities
            .iter()
            .filter(|c| c.owner == player)
            .count() as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use backbay_core::{load_rules, RulesSource};

    #[test]
    fn checksum_deterministic() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let engine_a = GameEngine::new_game_with_seed(8, 2, rules.clone(), 123);
        let engine_b = GameEngine::new_game_with_seed(8, 2, rules, 123);

        let config = crate::config::TurnTimerConfig::default();
        let state1 = GameState::new(engine_a, TurnMode::Sequential, config.clone());
        let state2 = GameState::new(engine_b, TurnMode::Sequential, config);

        assert_eq!(state1.checksum(), state2.checksum());
    }

    #[test]
    fn war_declaration_updates_state() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let engine = GameEngine::new_game_with_seed(8, 2, rules, 0);
        let config = crate::config::TurnTimerConfig::default();
        let mut state = GameState::new(engine, TurnMode::Sequential, config);

        let cmd = Command::DeclareWar {
            target: PlayerId(1),
        };

        let result = state.apply_commands(PlayerId(0), vec![cmd], false, state.checksum());
        match result {
            ApplyResult::Success {
                deltas_by_player, ..
            } => {
                let deltas = deltas_by_player.get(&PlayerId(0)).cloned().unwrap_or_default();
                assert!(deltas.iter().any(|e| {
                    matches!(e, Event::WarDeclared { aggressor, target } if *aggressor == PlayerId(0) && *target == PlayerId(1))
                }));
            }
            other => panic!("expected success, got {other:?}"),
        }

        assert!(state.war_state().are_at_war(PlayerId(0), PlayerId(1)));
    }

    #[test]
    fn cannot_act_out_of_turn() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let engine = GameEngine::new_game_with_seed(8, 2, rules, 0);
        let config = crate::config::TurnTimerConfig::default();
        let mut state = GameState::new(engine, TurnMode::Sequential, config);

        let result = state.apply_commands(PlayerId(1), vec![], false, state.checksum());
        assert!(matches!(result, ApplyResult::NotYourTurn));
    }
}
