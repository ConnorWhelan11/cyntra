use backbay_protocol::{
    ChronicleEntry, ChronicleEvent, CityId, CitySnapshot, CityUi, CombatPreview, Command,
    DealItem, DealProposal, Demand, DemandConsequence, DemandId, Event, GovernmentId, Hex,
    MapSnapshot, MovementStopReason, PathPreview, PlayerId, PlayerSnapshot, PolicyId,
    ProductionItem, RelationBreakdown, ReplayCommand, ReplayFile, ReplayPlayer, ResearchStatus,
    RulesCatalog, RulesCatalogBuilding, RulesCatalogImprovement, RulesCatalogImprovementTier,
    RulesCatalogTech, RulesCatalogUnitType, RulesNames, Snapshot, TechId, TileImprovementSnapshot,
    TileSnapshot, TileUi, TradeRouteSnapshot, Treaty, TreatyId, TreatyType, TurnPromise,
    UiProductionOption, UiTechOption, UiYields, UnitId, UnitOrders, UnitSnapshot, WhyLine,
    WhyPanel, WorkerTaskKind,
};
use std::{cmp::Reverse, collections::BinaryHeap};
use thiserror::Error;

use crate::{
    city::City,
    combat::{calculate_combat_preview, resolve_combat, CombatResult},
    entities::EntityStore,
    map::GameMap,
    map::ImprovementOnTile,
    mapgen::{generate_map, MapGenConfig},
    rules::CompiledRules,
    unit::Unit,
    GameRng,
};

const UNIT_VISION_RADIUS: i32 = 2;
const CITY_VISION_RADIUS: i32 = 2;

#[derive(Debug, Error)]
pub enum GameError {
    #[error("unknown unit")]
    UnknownUnit,
    #[error("unknown city")]
    UnknownCity,
    #[error("unit does not belong to current player")]
    NotYourUnit,
    #[error("invalid movement path")]
    InvalidPath,
    #[error("unknown technology")]
    UnknownTechnology,
    #[error("technology prerequisites not met")]
    TechPrerequisitesNotMet,
    #[error("technology already researched")]
    TechAlreadyResearched,
    #[error("no available policy picks")]
    NoAvailablePolicyPicks,
    #[error("unknown policy")]
    UnknownPolicy,
    #[error("policy already adopted")]
    PolicyAlreadyAdopted,
    #[error("unknown government")]
    UnknownGovernment,
    #[error("not enough gold")]
    NotEnoughGold,
    #[error("unknown improvement")]
    UnknownImprovement,
    #[error("cannot build improvement here")]
    CannotBuildImprovementHere,
    #[error("unit is not a worker")]
    NotAWorker,
    #[error("no improvement to repair")]
    NoImprovementToRepair,
    #[error("no improvement to pillage")]
    NoImprovementToPillage,
    #[error("cannot pillage friendly improvement")]
    CannotPillageFriendlyImprovement,
    #[error("trade route capacity exceeded")]
    TradeRouteCapacityExceeded,
    #[error("unknown trade route")]
    UnknownTradeRoute,
    #[error("cannot trade with self")]
    CannotTradeWithSelf,
    #[error("unit cannot found a city")]
    CannotFoundCity,
    #[error("unit cannot fortify")]
    CannotFortify,
}

#[derive(Debug, Error)]
pub enum ReplayImportError {
    #[error("engine not initialized")]
    EngineNotInitialized,
    #[error("unsupported replay version: {0}")]
    UnsupportedVersion(u32),
    #[error("rules hash mismatch (expected {expected}, got {got})")]
    RulesHashMismatch { expected: u64, got: u64 },
    #[error(
        "replay out of sync at command {index} (expected T{expected_turn} P{expected_player:?}, got T{got_turn} P{got_player:?})"
    )]
    CommandOutOfSync {
        index: usize,
        expected_turn: u32,
        expected_player: PlayerId,
        got_turn: u32,
        got_player: PlayerId,
    },
    #[error("replay command failed at index {index}")]
    CommandFailed { index: usize },
}

#[derive(Clone, Debug)]
pub struct Player {
    pub id: PlayerId,
    pub name: String,
    pub is_ai: bool,
    pub gold: i32,
    pub supply_used: i32,
    pub supply_cap: i32,
    pub war_weariness: i32,
    pub culture: i32,
    pub culture_milestones_reached: u32,
    pub available_policy_picks: u8,
    pub policies: Vec<PolicyId>,
    pub policy_adopted_era: Vec<Option<u8>>,
    pub government: Option<GovernmentId>,
    pub researching: Option<TechId>,
    pub research_progress: i32,
    pub research_overflow: i32,
    pub known_techs: Vec<bool>,
}

impl Player {
    pub fn dummy(rules: &CompiledRules) -> Self {
        Self {
            id: PlayerId(0),
            name: "Dummy".to_string(),
            is_ai: false,
            gold: 0,
            supply_used: 0,
            supply_cap: 0,
            war_weariness: 0,
            culture: 0,
            culture_milestones_reached: 0,
            available_policy_picks: 0,
            policies: Vec::new(),
            policy_adopted_era: vec![None; rules.policies.len()],
            government: None,
            researching: None,
            research_progress: 0,
            research_overflow: 0,
            known_techs: vec![false; rules.techs.len()],
        }
    }

    pub fn current_era_index(&self, rules: &CompiledRules) -> u8 {
        let mut max_era = 0u8;
        for (idx, known) in self.known_techs.iter().copied().enumerate() {
            if !known {
                continue;
            }
            let Some(tech) = rules.techs.get(idx) else {
                continue;
            };
            max_era = max_era.max(tech.era.index());
        }
        max_era
    }

    pub fn policy_tenure_bonus_bp(&self, rules: &CompiledRules, policy: PolicyId) -> i32 {
        const TENURE_STEP_BP: i32 = 1000; // +10% per era
        const TENURE_CAP_BP: i32 = 5000; // +50% cap

        let current_era = i32::from(self.current_era_index(rules));
        let adopted_era = self
            .policy_adopted_era
            .get(policy.raw as usize)
            .copied()
            .flatten()
            .map(i32::from)
            .unwrap_or(current_era);

        let tenure_eras = current_era.saturating_sub(adopted_era);
        (tenure_eras.saturating_mul(TENURE_STEP_BP)).min(TENURE_CAP_BP)
    }
}

#[derive(Clone, Debug)]
pub struct PlayerVisibility {
    explored: Vec<bool>,
    visible: Vec<bool>,
}

impl PlayerVisibility {
    pub fn new(map_len: usize) -> Self {
        Self {
            explored: vec![false; map_len],
            visible: vec![false; map_len],
        }
    }

    pub fn explored(&self) -> &[bool] {
        &self.explored
    }

    pub fn visible(&self) -> &[bool] {
        &self.visible
    }
}

#[derive(Clone, Debug)]
pub struct DiplomacyState {
    player_count: usize,
    at_war: Vec<bool>,   // len = n*n
    relations: Vec<i32>, // len = n*n
    /// Relation breakdown per player pair (indexed same as relations).
    relation_breakdown: Vec<RelationBreakdown>,
    /// Active treaties.
    pub treaties: Vec<Treaty>,
    /// Pending deal proposals.
    pub pending_proposals: Vec<DealProposal>,
    /// Pending demands.
    pub pending_demands: Vec<Demand>,
    /// Next treaty ID to assign.
    next_treaty_id: u32,
    /// Next demand ID to assign.
    next_demand_id: u32,
}

impl DiplomacyState {
    pub fn new(player_count: usize) -> Self {
        let n = player_count.max(1);
        Self {
            player_count: n,
            at_war: vec![false; n * n],
            relations: vec![0; n * n],
            relation_breakdown: (0..n * n).map(|_| RelationBreakdown::default()).collect(),
            treaties: Vec::new(),
            pending_proposals: Vec::new(),
            pending_demands: Vec::new(),
            next_treaty_id: 1,
            next_demand_id: 1,
        }
    }

    fn idx(&self, a: PlayerId, b: PlayerId) -> Option<usize> {
        let n = self.player_count;
        let ai = a.0 as usize;
        let bi = b.0 as usize;
        if ai >= n || bi >= n {
            None
        } else {
            Some(ai * n + bi)
        }
    }

    pub fn is_at_war(&self, a: PlayerId, b: PlayerId) -> bool {
        self.idx(a, b)
            .and_then(|i| self.at_war.get(i).copied())
            .unwrap_or(false)
    }

    pub fn set_war(&mut self, a: PlayerId, b: PlayerId, at_war: bool) {
        let Some(i1) = self.idx(a, b) else {
            return;
        };
        let Some(i2) = self.idx(b, a) else {
            return;
        };
        if let Some(slot) = self.at_war.get_mut(i1) {
            *slot = at_war;
        }
        if let Some(slot) = self.at_war.get_mut(i2) {
            *slot = at_war;
        }
    }

    pub fn relation(&self, a: PlayerId, b: PlayerId) -> i32 {
        self.idx(a, b)
            .and_then(|i| self.relations.get(i).copied())
            .unwrap_or(0)
    }

    pub fn adjust_relation(&mut self, a: PlayerId, b: PlayerId, delta: i32) -> i32 {
        let Some(i1) = self.idx(a, b) else {
            return 0;
        };
        let Some(i2) = self.idx(b, a) else {
            return 0;
        };

        let new = self
            .relations
            .get(i1)
            .copied()
            .unwrap_or(0)
            .saturating_add(delta);

        if let Some(slot) = self.relations.get_mut(i1) {
            *slot = new;
        }
        if let Some(slot) = self.relations.get_mut(i2) {
            *slot = new;
        }
        new
    }

    pub fn any_war(&self, a: PlayerId) -> bool {
        let n = self.player_count;
        let ai = a.0 as usize;
        if ai >= n {
            return false;
        }
        let start = ai * n;
        self.at_war
            .get(start..start + n)
            .map(|row| row.iter().copied().any(|w| w))
            .unwrap_or(false)
    }

    // =========================================================================
    // Relation Breakdown
    // =========================================================================

    /// Get the relation breakdown between two players.
    pub fn relation_breakdown(&self, a: PlayerId, b: PlayerId) -> RelationBreakdown {
        self.idx(a, b)
            .and_then(|i| self.relation_breakdown.get(i).cloned())
            .unwrap_or_default()
    }

    /// Adjust a specific component of the relation breakdown.
    pub fn adjust_breakdown_component(
        &mut self,
        a: PlayerId,
        b: PlayerId,
        component: &str,
        delta: i32,
    ) {
        let Some(i1) = self.idx(a, b) else { return };
        let Some(i2) = self.idx(b, a) else { return };

        let apply = |bd: &mut RelationBreakdown| match component {
            "base" => bd.base = bd.base.saturating_add(delta),
            "trade" => bd.trade = bd.trade.saturating_add(delta),
            "borders" => bd.borders = bd.borders.saturating_add(delta),
            "ideology" => bd.ideology = bd.ideology.saturating_add(delta),
            "betrayal" => bd.betrayal = bd.betrayal.saturating_add(delta),
            "military" => bd.military = bd.military.saturating_add(delta),
            "treaties" => bd.treaties = bd.treaties.saturating_add(delta),
            "war_history" => bd.war_history = bd.war_history.saturating_add(delta),
            "shared_enemies" => bd.shared_enemies = bd.shared_enemies.saturating_add(delta),
            "tribute" => bd.tribute = bd.tribute.saturating_add(delta),
            _ => {}
        };

        if let Some(bd) = self.relation_breakdown.get_mut(i1) {
            apply(bd);
        }
        if let Some(bd) = self.relation_breakdown.get_mut(i2) {
            apply(bd);
        }

        // Update the aggregate relations value.
        self.sync_relations_from_breakdown(a, b);
    }

    /// Sync the aggregate relation value from the breakdown total.
    fn sync_relations_from_breakdown(&mut self, a: PlayerId, b: PlayerId) {
        let Some(i1) = self.idx(a, b) else { return };
        let Some(i2) = self.idx(b, a) else { return };

        let total = self.relation_breakdown.get(i1).map(|bd| bd.total()).unwrap_or(0);

        if let Some(slot) = self.relations.get_mut(i1) {
            *slot = total;
        }
        if let Some(slot) = self.relations.get_mut(i2) {
            *slot = total;
        }
    }

    /// Apply decay to all relation breakdowns (called each turn).
    pub fn apply_relation_decay(&mut self) {
        for bd in &mut self.relation_breakdown {
            bd.apply_decay();
        }
        // Sync aggregate relations after decay.
        let n = self.player_count;
        for ai in 0..n {
            for bi in 0..n {
                if ai != bi {
                    let a = PlayerId(ai as u8);
                    let b = PlayerId(bi as u8);
                    self.sync_relations_from_breakdown(a, b);
                }
            }
        }
    }

    // =========================================================================
    // Treaties
    // =========================================================================

    /// Create a new treaty between two players.
    pub fn create_treaty(
        &mut self,
        treaty_type: TreatyType,
        a: PlayerId,
        b: PlayerId,
        current_turn: u32,
        duration: Option<u32>,
    ) -> Treaty {
        let id = TreatyId(self.next_treaty_id);
        self.next_treaty_id += 1;

        let treaty = Treaty {
            id,
            treaty_type,
            parties: (a, b),
            signed_turn: current_turn,
            expires_turn: duration.map(|d| current_turn + d),
            active: true,
        };

        self.treaties.push(treaty.clone());

        // Adjust relation for signing a treaty.
        self.adjust_breakdown_component(a, b, "treaties", 5);

        treaty
    }

    /// Cancel a treaty by ID.
    pub fn cancel_treaty(&mut self, id: TreatyId) -> Option<Treaty> {
        let pos = self.treaties.iter().position(|t| t.id == id && t.active)?;
        let treaty = self.treaties.get_mut(pos)?;
        treaty.active = false;
        let result = treaty.clone();

        // Betrayal penalty for breaking a treaty.
        self.adjust_breakdown_component(result.parties.0, result.parties.1, "betrayal", -15);
        self.adjust_breakdown_component(result.parties.0, result.parties.1, "treaties", -5);

        Some(result)
    }

    /// Expire treaties that have reached their expiration turn.
    pub fn expire_treaties(&mut self, current_turn: u32) -> Vec<Treaty> {
        let mut expired = Vec::new();
        for treaty in &mut self.treaties {
            if treaty.active {
                if let Some(expires) = treaty.expires_turn {
                    if current_turn >= expires {
                        treaty.active = false;
                        expired.push(treaty.clone());
                        // No betrayal for natural expiration, but treaty bonus removed.
                        // Will be handled by recalculating treaty bonus.
                    }
                }
            }
        }
        expired
    }

    /// Check if two players have an active treaty of a specific type.
    pub fn has_treaty(&self, a: PlayerId, b: PlayerId, treaty_type: &TreatyType) -> bool {
        self.treaties.iter().any(|t| {
            t.active
                && t.involves(a)
                && t.involves(b)
                && std::mem::discriminant(&t.treaty_type) == std::mem::discriminant(treaty_type)
        })
    }

    /// Check if two players have open borders.
    pub fn has_open_borders(&self, a: PlayerId, b: PlayerId) -> bool {
        self.has_treaty(a, b, &TreatyType::OpenBorders)
    }

    /// Check if two players have a defensive pact.
    pub fn has_defensive_pact(&self, a: PlayerId, b: PlayerId) -> bool {
        self.has_treaty(a, b, &TreatyType::DefensivePact)
    }

    /// Check if two players are allies.
    pub fn are_allies(&self, a: PlayerId, b: PlayerId) -> bool {
        self.has_treaty(a, b, &TreatyType::Alliance)
    }

    /// Check if two players have a non-aggression pact.
    pub fn has_non_aggression(&self, a: PlayerId, b: PlayerId) -> bool {
        self.has_treaty(a, b, &TreatyType::NonAggression)
    }

    /// Get all active treaties for a player.
    pub fn treaties_for(&self, player: PlayerId) -> Vec<&Treaty> {
        self.treaties.iter().filter(|t| t.active && t.involves(player)).collect()
    }

    /// Get defensive pact allies for a player.
    pub fn defensive_pact_allies(&self, player: PlayerId) -> Vec<PlayerId> {
        self.treaties
            .iter()
            .filter(|t| t.active && matches!(t.treaty_type, TreatyType::DefensivePact))
            .filter_map(|t| t.other_party(player))
            .collect()
    }

    // =========================================================================
    // Deal Proposals
    // =========================================================================

    /// Add a pending deal proposal.
    pub fn add_proposal(&mut self, proposal: DealProposal) {
        // Remove any existing proposal from the same player to the same target.
        self.pending_proposals.retain(|p| !(p.from == proposal.from && p.to == proposal.to));
        self.pending_proposals.push(proposal);
    }

    /// Remove and return a pending proposal.
    pub fn take_proposal(&mut self, from: PlayerId, to: PlayerId) -> Option<DealProposal> {
        let pos = self.pending_proposals.iter().position(|p| p.from == from && p.to == to)?;
        Some(self.pending_proposals.remove(pos))
    }

    /// Expire old proposals.
    pub fn expire_proposals(&mut self, current_turn: u32) {
        self.pending_proposals.retain(|p| p.expires_turn > current_turn);
    }

    // =========================================================================
    // Demands
    // =========================================================================

    /// Issue a new demand.
    pub fn issue_demand(
        &mut self,
        from: PlayerId,
        to: PlayerId,
        items: Vec<DealItem>,
        consequence: DemandConsequence,
        expires_turn: u32,
    ) -> Demand {
        let id = DemandId(self.next_demand_id);
        self.next_demand_id += 1;

        let demand = Demand {
            id,
            from,
            to,
            items,
            expires_turn,
            consequence,
        };

        self.pending_demands.push(demand.clone());
        demand
    }

    /// Remove and return a pending demand by ID.
    pub fn take_demand(&mut self, id: DemandId) -> Option<Demand> {
        let pos = self.pending_demands.iter().position(|d| d.id == id)?;
        Some(self.pending_demands.remove(pos))
    }

    /// Expire old demands and return them for consequence processing.
    pub fn expire_demands(&mut self, current_turn: u32) -> Vec<Demand> {
        let mut expired = Vec::new();
        let mut remaining = Vec::new();
        for demand in self.pending_demands.drain(..) {
            if demand.expires_turn <= current_turn {
                expired.push(demand);
            } else {
                remaining.push(demand);
            }
        }
        self.pending_demands = remaining;
        expired
    }
}

#[derive(Clone, Debug)]
pub struct TradeRoute {
    pub owner: PlayerId,
    pub from: CityId,
    pub to: CityId,
    pub path: Vec<Hex>,
}

/// Record of an original capital for domination victory tracking.
#[derive(Clone, Debug)]
pub struct CapitalRecord {
    /// The player who originally owned this capital.
    pub original_owner: PlayerId,
    /// The expected position of the capital (start position).
    pub position: Hex,
    /// Current city ID if city exists at this location.
    pub city: Option<CityId>,
    /// Current owner of the capital (None if razed/not founded).
    pub current_owner: Option<PlayerId>,
}

/// Victory state tracking for all victory conditions.
#[derive(Clone, Debug)]
pub struct VictoryState {
    /// Original capital positions per player (for domination).
    pub original_capitals: Vec<CapitalRecord>,
    /// Science project stages completed per player.
    /// Each Vec<bool> has one entry per project stage.
    pub science_progress: Vec<Vec<bool>>,
    /// Players that have been eliminated (lost all cities).
    pub eliminated: Vec<PlayerId>,
    /// Turn limit for score victory (0 = no limit).
    pub turn_limit: u32,
    /// Whether game has ended.
    pub game_ended: bool,
    /// Winner if game has ended.
    pub winner: Option<PlayerId>,
    /// Victory reason if game has ended.
    pub victory_reason: Option<backbay_protocol::VictoryReason>,
    /// Lifetime culture generated per player (for culture victory defense).
    pub lifetime_culture: Vec<i32>,
    /// Cumulative tourism per player (for culture victory offense).
    pub tourism: Vec<i32>,
    /// Culture influence threshold percentage for dominance (default 60%).
    pub culture_threshold_pct: u8,
}

impl VictoryState {
    pub fn new(num_players: usize, start_positions: &[Hex], turn_limit: u32) -> Self {
        // Default: 5 science project stages (satellites, moon landing, mars colony, etc.)
        const SCIENCE_STAGES: usize = 5;

        let original_capitals = (0..num_players)
            .map(|i| CapitalRecord {
                original_owner: PlayerId(i as u8),
                position: start_positions.get(i).copied().unwrap_or(Hex { q: 0, r: 0 }),
                city: None,
                current_owner: None,
            })
            .collect();

        let science_progress = (0..num_players)
            .map(|_| vec![false; SCIENCE_STAGES])
            .collect();

        Self {
            original_capitals,
            science_progress,
            eliminated: Vec::new(),
            turn_limit,
            game_ended: false,
            winner: None,
            victory_reason: None,
            lifetime_culture: vec![0; num_players],
            tourism: vec![0; num_players],
            culture_threshold_pct: 60,
        }
    }

    /// Update culture tracking when a player generates culture.
    /// Tourism is generated at ~25% of culture output rate.
    pub fn add_culture(&mut self, player: PlayerId, culture_gained: i32) {
        let idx = player.0 as usize;
        if let Some(slot) = self.lifetime_culture.get_mut(idx) {
            *slot = slot.saturating_add(culture_gained);
        }
        // Tourism accumulates at 25% of culture rate (simplified).
        let tourism_gained = culture_gained / 4;
        if let Some(slot) = self.tourism.get_mut(idx) {
            *slot = slot.saturating_add(tourism_gained);
        }
    }

    /// Calculate cultural influence percentage of player over rival.
    /// Influence = (your tourism / their lifetime culture) * 100, capped at 100%.
    pub fn calculate_influence(&self, player: PlayerId, rival: PlayerId) -> u8 {
        let player_tourism = self
            .tourism
            .get(player.0 as usize)
            .copied()
            .unwrap_or(0);
        let rival_culture = self
            .lifetime_culture
            .get(rival.0 as usize)
            .copied()
            .unwrap_or(0)
            .max(1); // Prevent division by zero.

        let influence = (player_tourism * 100) / rival_culture;
        influence.min(100) as u8
    }

    /// Check if player is culturally dominant over rival (influence >= threshold).
    pub fn is_culturally_dominant(&self, player: PlayerId, rival: PlayerId) -> bool {
        self.calculate_influence(player, rival) >= self.culture_threshold_pct
    }

    /// Check if player has achieved culture victory (dominant over all non-eliminated rivals).
    pub fn has_culture_victory(&self, player: PlayerId, num_players: usize) -> bool {
        if num_players <= 1 {
            return false;
        }

        for i in 0..num_players {
            let rival = PlayerId(i as u8);
            if rival == player {
                continue;
            }
            if self.eliminated.contains(&rival) {
                continue;
            }
            if !self.is_culturally_dominant(player, rival) {
                return false;
            }
        }
        true
    }

    /// Get culture influence over all rivals for a player.
    pub fn get_influence_over_rivals(
        &self,
        player: PlayerId,
        num_players: usize,
    ) -> Vec<backbay_protocol::RivalInfluence> {
        let mut result = Vec::new();
        for i in 0..num_players {
            let rival = PlayerId(i as u8);
            if rival == player {
                continue;
            }
            let influence_pct = self.calculate_influence(player, rival);
            result.push(backbay_protocol::RivalInfluence {
                rival,
                influence_pct,
                dominant: influence_pct >= self.culture_threshold_pct,
            });
        }
        result
    }

    /// Check if a player controls all original capitals.
    pub fn controls_all_capitals(&self, player: PlayerId) -> bool {
        if self.original_capitals.is_empty() {
            return false;
        }
        self.original_capitals
            .iter()
            .all(|cap| cap.current_owner == Some(player))
    }

    /// Check if a player has completed all science stages.
    pub fn completed_science_victory(&self, player: PlayerId) -> bool {
        let idx = player.0 as usize;
        self.science_progress
            .get(idx)
            .map(|stages| stages.iter().all(|&s| s))
            .unwrap_or(false)
    }

    /// Count capitals controlled by each player.
    pub fn capitals_per_player(&self) -> Vec<(PlayerId, u8)> {
        let mut counts: std::collections::HashMap<PlayerId, u8> = std::collections::HashMap::new();
        for cap in &self.original_capitals {
            if let Some(owner) = cap.current_owner {
                *counts.entry(owner).or_insert(0) += 1;
            }
        }
        let mut result: Vec<_> = counts.into_iter().collect();
        result.sort_by_key(|(p, _)| p.0);
        result
    }

    /// Get science progress for a player (stages completed / total).
    pub fn science_stages_completed(&self, player: PlayerId) -> (usize, usize) {
        let idx = player.0 as usize;
        self.science_progress
            .get(idx)
            .map(|stages| {
                let completed = stages.iter().filter(|&&s| s).count();
                (completed, stages.len())
            })
            .unwrap_or((0, 0))
    }
}

#[derive(Clone, Debug)]
pub struct GameState {
    pub turn: u32,
    pub current_player: PlayerId,
    pub map: GameMap,
    pub rules: CompiledRules,
    pub players: Vec<Player>,
    pub visibility: Vec<PlayerVisibility>,
    pub units: EntityStore<Unit>,
    pub cities: EntityStore<City>,
    pub trade_routes: EntityStore<TradeRoute>,
    pub diplomacy: DiplomacyState,
    pub chronicle: Vec<ChronicleEntry>,
    pub chronicle_next_id: u64,
    pub victory: VictoryState,
    pub rng: GameRng,
}

impl GameState {
    pub fn new_game(map_size: u32, num_players: u32, rules: CompiledRules, seed: u64) -> Self {
        let map_size = map_size.max(1);
        let num_players = num_players.max(1);

        let map_config = MapGenConfig {
            width: map_size,
            height: map_size,
            num_players,
            ..Default::default()
        };
        let generated = generate_map(&rules, &map_config, seed);

        Self::new_with_generated_map(
            rules,
            seed,
            generated.tiles,
            generated.width,
            generated.height,
            generated.wrap_horizontal,
            &generated.start_positions,
            num_players,
        )
    }

    /// Create a new game with a generated map and explicit start positions.
    #[allow(clippy::too_many_arguments)]
    pub fn new_with_generated_map(
        rules: CompiledRules,
        seed: u64,
        tiles: Vec<backbay_protocol::TileSnapshot>,
        width: u32,
        height: u32,
        wrap_horizontal: bool,
        start_positions: &[Hex],
        num_players: u32,
    ) -> Self {
        let map = GameMap::from_tile_snapshots(width, height, wrap_horizontal, tiles);
        let tech_count = rules.techs.len();
        let policy_count = rules.policies.len();
        let players = (0..num_players)
            .map(|i| Player {
                id: PlayerId(i as u8),
                name: format!("Player {i}"),
                is_ai: false,
                gold: 0,
                supply_used: 0,
                supply_cap: 0,
                war_weariness: 0,
                culture: 0,
                culture_milestones_reached: 0,
                available_policy_picks: 0,
                policies: Vec::new(),
                policy_adopted_era: vec![None; policy_count],
                government: None,
                researching: None,
                research_progress: 0,
                research_overflow: 0,
                known_techs: vec![false; tech_count],
            })
            .collect::<Vec<_>>();

        let map_len = map.len();
        let victory = VictoryState::new(num_players as usize, start_positions, 500);
        let mut state = Self {
            turn: 1,
            current_player: PlayerId(0),
            map,
            rules,
            players,
            visibility: Vec::new(),
            units: EntityStore::default(),
            cities: EntityStore::default(),
            trade_routes: EntityStore::default(),
            diplomacy: DiplomacyState::new(num_players as usize),
            chronicle: Vec::new(),
            chronicle_next_id: 1,
            victory,
            rng: GameRng::seed_from_u64(seed),
        };

        state.visibility = (0..state.players.len())
            .map(|_| PlayerVisibility::new(map_len))
            .collect();

        state.spawn_starting_units_at_positions(start_positions);
        state
    }

    /// Spawn starting units at specific positions.
    fn spawn_starting_units_at_positions(&mut self, start_positions: &[Hex]) {
        let warrior = self.rules.unit_type_id("warrior");
        let settler = self.rules.unit_type_id("settler");
        let worker = self.rules.unit_type_id("worker");

        for (idx, player) in self.players.iter().enumerate() {
            // Use provided start position or fallback.
            let spawn = start_positions.get(idx).copied().unwrap_or_else(|| Hex {
                q: (player.id.0 as i32 * 3).rem_euclid(self.map.width() as i32),
                r: 0,
            });

            if let Some(unit_type) = warrior {
                let unit = Unit::new_for_tests(unit_type, player.id, spawn, &self.rules);
                let _unit_id = self.units.insert(unit);
                if let Some(tile) = self.map.get_mut(spawn) {
                    tile.owner = Some(player.id);
                }
            }

            // Find adjacent tile for settler.
            let settler_pos = Hex::DIRECTIONS
                .iter()
                .map(|&d| spawn + d)
                .find(|&h| {
                    self.map
                        .get(h)
                        .map(|t| {
                            // Must be passable land.
                            let terrain = self.rules.terrains.get(t.terrain.raw as usize);
                            terrain.map(|tr| !tr.impassable).unwrap_or(false)
                        })
                        .unwrap_or(false)
                })
                .unwrap_or(Hex {
                    q: spawn.q,
                    r: spawn.r + 1,
                });

            if let Some(unit_type) = settler {
                let unit = Unit::new_for_tests(unit_type, player.id, settler_pos, &self.rules);
                let _unit_id = self.units.insert(unit);
            }

            // Find adjacent tile for worker.
            let worker_pos = Hex::DIRECTIONS
                .iter()
                .map(|&d| spawn + d)
                .find(|&h| {
                    h != settler_pos
                        && self
                            .map
                            .get(h)
                            .map(|t| {
                                let terrain = self.rules.terrains.get(t.terrain.raw as usize);
                                terrain.map(|tr| !tr.impassable).unwrap_or(false)
                            })
                            .unwrap_or(false)
                })
                .unwrap_or(Hex {
                    q: spawn.q + 1,
                    r: spawn.r,
                });

            if let Some(unit_type) = worker {
                let unit = Unit::new_for_tests(unit_type, player.id, worker_pos, &self.rules);
                let _unit_id = self.units.insert(unit);
            }
        }
    }

    pub fn new_for_tests(map: GameMap, rules: CompiledRules, current_player: PlayerId) -> Self {
        let tech_count = rules.techs.len();
        let policy_count = rules.policies.len();
        let map_len = map.len();
        Self {
            turn: 1,
            current_player,
            map,
            rules,
            players: vec![
                Player {
                    id: PlayerId(0),
                    name: "P0".to_string(),
                    is_ai: false,
                    gold: 0,
                    supply_used: 0,
                    supply_cap: 0,
                    war_weariness: 0,
                    culture: 0,
                    culture_milestones_reached: 0,
                    available_policy_picks: 0,
                    policies: Vec::new(),
                    policy_adopted_era: vec![None; policy_count],
                    government: None,
                    researching: None,
                    research_progress: 0,
                    research_overflow: 0,
                    known_techs: vec![false; tech_count],
                },
                Player {
                    id: PlayerId(1),
                    name: "P1".to_string(),
                    is_ai: false,
                    gold: 0,
                    supply_used: 0,
                    supply_cap: 0,
                    war_weariness: 0,
                    culture: 0,
                    culture_milestones_reached: 0,
                    available_policy_picks: 0,
                    policies: Vec::new(),
                    policy_adopted_era: vec![None; policy_count],
                    government: None,
                    researching: None,
                    research_progress: 0,
                    research_overflow: 0,
                    known_techs: vec![false; tech_count],
                },
            ],
            visibility: vec![
                PlayerVisibility::new(map_len),
                PlayerVisibility::new(map_len),
            ],
            units: EntityStore::default(),
            cities: EntityStore::default(),
            trade_routes: EntityStore::default(),
            diplomacy: DiplomacyState::new(2),
            chronicle: Vec::new(),
            chronicle_next_id: 1,
            victory: VictoryState::new(2, &[Hex { q: 0, r: 0 }, Hex { q: 3, r: 0 }], 500),
            rng: GameRng::seed_from_u64(0),
        }
    }

    fn spawn_starting_units(&mut self) {
        let warrior = self.rules.unit_type_id("warrior");
        let settler = self.rules.unit_type_id("settler");
        let worker = self.rules.unit_type_id("worker");

        for player in &self.players {
            let spawn = Hex {
                q: (player.id.0 as i32 * 3).rem_euclid(self.map.width() as i32),
                r: 0,
            };

            if let Some(unit_type) = warrior {
                let unit = Unit::new_for_tests(unit_type, player.id, spawn, &self.rules);
                let unit_id = self.units.insert(unit);
                if let Some(tile) = self.map.get_mut(spawn) {
                    tile.owner = Some(player.id);
                }
                let _ = unit_id;
            }

            if let Some(unit_type) = settler {
                let unit = Unit::new_for_tests(
                    unit_type,
                    player.id,
                    Hex { q: spawn.q, r: 1 },
                    &self.rules,
                );
                let _unit_id = self.units.insert(unit);
            }

            if let Some(unit_type) = worker {
                let unit = Unit::new_for_tests(
                    unit_type,
                    player.id,
                    Hex { q: spawn.q, r: 2 },
                    &self.rules,
                );
                let _unit_id = self.units.insert(unit);
            }
        }
    }
}

#[derive(Clone, Debug)]
struct PlayerInit {
    name: String,
    is_ai: bool,
}

#[derive(Clone, Debug)]
struct GameInit {
    map_size: u32,
    num_players: u32,
    seed: u64,
    rules_hash: u64,
    rules: CompiledRules,
    players: Vec<PlayerInit>,
}

#[derive(Clone, Debug)]
struct Fnv1a64 {
    hash: u64,
}

impl Fnv1a64 {
    const OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x100000001b3;

    fn new() -> Self {
        Self {
            hash: Self::OFFSET_BASIS,
        }
    }

    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.hash ^= u64::from(b);
            self.hash = self.hash.wrapping_mul(Self::PRIME);
        }
    }

    fn write_u8(&mut self, v: u8) {
        self.write(&[v]);
    }

    fn write_bool(&mut self, v: bool) {
        self.write_u8(if v { 1 } else { 0 });
    }

    fn write_u16(&mut self, v: u16) {
        self.write(&v.to_le_bytes());
    }

    fn write_u32(&mut self, v: u32) {
        self.write(&v.to_le_bytes());
    }

    #[allow(dead_code)]
    fn write_u64(&mut self, v: u64) {
        self.write(&v.to_le_bytes());
    }

    fn write_i32(&mut self, v: i32) {
        self.write(&v.to_le_bytes());
    }

    fn write_str(&mut self, s: &str) {
        self.write_u32(s.len() as u32);
        self.write(s.as_bytes());
    }
}

fn rules_hash(rules: &CompiledRules) -> u64 {
    use crate::rules::{Effect, Requirement, UnitClass};

    fn hash_yields(h: &mut Fnv1a64, y: &crate::yields::Yields) {
        h.write_i32(y.food);
        h.write_i32(y.production);
        h.write_i32(y.gold);
        h.write_i32(y.science);
        h.write_i32(y.culture);
    }

    fn hash_yield_type(h: &mut Fnv1a64, t: backbay_protocol::YieldType) {
        let tag = match t {
            backbay_protocol::YieldType::Food => 0u8,
            backbay_protocol::YieldType::Production => 1u8,
            backbay_protocol::YieldType::Gold => 2u8,
            backbay_protocol::YieldType::Science => 3u8,
            backbay_protocol::YieldType::Culture => 4u8,
        };
        h.write_u8(tag);
    }

    fn hash_unit_class(h: &mut Fnv1a64, c: UnitClass) {
        let tag = match c {
            UnitClass::Civilian => 0u8,
            UnitClass::Melee => 1u8,
            UnitClass::Ranged => 2u8,
            UnitClass::Naval => 3u8,
        };
        h.write_u8(tag);
    }

    fn hash_requirement(h: &mut Fnv1a64, r: &Requirement) {
        match r {
            Requirement::Always => h.write_u8(0),
            Requirement::CityMinPopulation { value } => {
                h.write_u8(1);
                h.write_u8(*value);
            }
            // Handle all other requirement types with a format-based hash
            other => {
                h.write_u8(255);
                h.write_str(&format!("{:?}", other));
            }
        }
    }

    fn hash_effect(h: &mut Fnv1a64, e: &Effect) {
        match e {
            Effect::YieldBonus { yield_type, value } => {
                h.write_u8(0);
                hash_yield_type(h, *yield_type);
                h.write_i32(*value);
            }
            Effect::YieldPercentBp {
                yield_type,
                value_bp,
            } => {
                h.write_u8(1);
                hash_yield_type(h, *yield_type);
                h.write_i32(*value_bp);
            }
            Effect::SciencePerPopMilli { value_milli } => {
                h.write_u8(2);
                h.write_i32(*value_milli);
            }
            Effect::CityDefenseBp { value_bp } => {
                h.write_u8(3);
                h.write_i32(*value_bp);
            }
            Effect::VeteranBonus { unit_class, value } => {
                h.write_u8(4);
                match unit_class {
                    None => h.write_u8(255),
                    Some(c) => hash_unit_class(h, *c),
                }
                h.write_i32(*value);
            }
            Effect::Housing { value } => {
                h.write_u8(5);
                h.write_i32(*value);
            }
            Effect::TradeGoldMilli { value_milli } => {
                h.write_u8(6);
                h.write_i32(*value_milli);
            }
            // Handle all other effect types with a format-based hash
            other => {
                h.write_u8(255);
                h.write_str(&format!("{:?}", other));
            }
        }
    }

    let mut h = Fnv1a64::new();
    h.write_str("backbay_rules_v1");

    h.write_u32(rules.terrains.len() as u32);
    for terrain in &rules.terrains {
        h.write_str(&terrain.name);
        h.write_i32(terrain.defense_bonus);
        hash_yields(&mut h, &terrain.yields);
        h.write_i32(terrain.move_cost);
        h.write_bool(terrain.impassable);
    }

    h.write_u32(rules.unit_types.len() as u32);
    for unit in &rules.unit_types {
        h.write_str(&unit.name);
        hash_unit_class(&mut h, unit.class);
        h.write_i32(unit.attack);
        h.write_i32(unit.defense);
        h.write_i32(unit.moves);
        h.write_i32(unit.hp);
        h.write_i32(unit.firepower);
        h.write_i32(unit.cost);
        h.write_i32(unit.supply_cost);
        h.write_u8(unit.tech_required.is_some() as u8);
        if let Some(id) = unit.tech_required {
            h.write_u16(id.raw);
        }
        h.write_u8(unit.obsolete_by.is_some() as u8);
        if let Some(id) = unit.obsolete_by {
            h.write_u16(id.raw);
        }
        h.write_u32(unit.abilities.len() as u32);
    }

    h.write_u32(rules.buildings.len() as u32);
    for building in &rules.buildings {
        h.write_str(&building.name);
        h.write_i32(building.cost);
        h.write_i32(building.maintenance);
        h.write_i32(building.admin);
        h.write_u8(building.tech_required.is_some() as u8);
        if let Some(id) = building.tech_required {
            h.write_u16(id.raw);
        }
        h.write_u32(building.effects.len() as u32);
        for e in &building.effects {
            hash_effect(&mut h, e);
        }
        h.write_u32(building.requirements.len() as u32);
        for r in &building.requirements {
            hash_requirement(&mut h, r);
        }
    }

    h.write_u32(rules.techs.len() as u32);
    for tech in &rules.techs {
        h.write_str(&tech.name);
        h.write_i32(tech.cost);
        h.write_u8(tech.era.index());
        h.write_u32(tech.prerequisites.len() as u32);
        for pr in &tech.prerequisites {
            h.write_u16(pr.raw);
        }
    }

    h.write_u32(rules.improvements.len() as u32);
    for impr in &rules.improvements {
        h.write_str(&impr.name);
        h.write_u8(impr.build_time);
        h.write_u8(impr.repair_time);
        h.write_u32(impr.allowed_terrain.len() as u32);
        for t in &impr.allowed_terrain {
            h.write_u16(t.raw);
        }
        h.write_u32(impr.tiers.len() as u32);
        for tier in &impr.tiers {
            hash_yields(&mut h, &tier.yields);
            h.write_u8(tier.worked_turns_to_next.is_some() as u8);
            if let Some(v) = tier.worked_turns_to_next {
                h.write_i32(v);
            }
        }
    }

    h.write_u32(rules.policies.len() as u32);
    for policy in &rules.policies {
        h.write_str(&policy.name);
        h.write_str(&policy.description);
        h.write_u32(policy.effects.len() as u32);
        for e in &policy.effects {
            hash_effect(&mut h, e);
        }
        h.write_u32(policy.requirements.len() as u32);
        for r in &policy.requirements {
            hash_requirement(&mut h, r);
        }
    }

    h.write_u32(rules.governments.len() as u32);
    for gov in &rules.governments {
        h.write_str(&gov.name);
        h.write_i32(gov.admin);
    }

    h.hash
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
struct RecordedCommand {
    turn: u32,
    player: PlayerId,
    command: Command,
}

#[derive(Clone, Debug)]
pub struct GameEngine {
    init: Option<GameInit>,
    command_log: Vec<RecordedCommand>,
    state: GameState,
}

impl GameEngine {
    pub fn new_game(map_size: u32, num_players: u32, rules: CompiledRules) -> Self {
        Self::new_game_with_seed(map_size, num_players, rules, 0)
    }

    pub fn new_game_with_seed(
        map_size: u32,
        num_players: u32,
        rules: CompiledRules,
        seed: u64,
    ) -> Self {
        let map_size = map_size.max(1);
        let num_players = num_players.max(1);

        let map_config = MapGenConfig {
            width: map_size,
            height: map_size,
            num_players,
            ..Default::default()
        };
        let generated = generate_map(&rules, &map_config, seed);

        Self::new_game_with_generated_map(
            rules,
            seed,
            generated.tiles,
            generated.width,
            generated.height,
            generated.wrap_horizontal,
            &generated.start_positions,
            num_players,
        )
    }

    /// Create a new game with a generated map and start positions.
    #[allow(clippy::too_many_arguments)]
    pub fn new_game_with_generated_map(
        rules: CompiledRules,
        seed: u64,
        tiles: Vec<backbay_protocol::TileSnapshot>,
        width: u32,
        height: u32,
        wrap_horizontal: bool,
        start_positions: &[Hex],
        num_players: u32,
    ) -> Self {
        let init_rules = rules.clone();
        let rules_hash = rules_hash(&init_rules);
        let state = GameState::new_with_generated_map(
            rules,
            seed,
            tiles,
            width,
            height,
            wrap_horizontal,
            start_positions,
            num_players,
        );
        let players = state
            .players
            .iter()
            .map(|p| PlayerInit {
                name: p.name.clone(),
                is_ai: p.is_ai,
            })
            .collect();

        let mut engine = Self {
            init: Some(GameInit {
                map_size: width.max(height),
                num_players,
                seed,
                rules_hash,
                rules: init_rules,
                players,
            }),
            command_log: Vec::new(),
            state,
        };

        // Initialize fog-of-war state for all players (so each player starts with visibility).
        let player_ids: Vec<PlayerId> = engine.state.players.iter().map(|p| p.id).collect();
        for player in player_ids {
            let _ = engine.update_visibility_for_player(player);
        }

        engine
    }

    pub fn export_replay(&self) -> Option<ReplayFile> {
        let init = self.init.as_ref()?;
        Some(ReplayFile {
            version: 1,
            map_size: init.map_size,
            num_players: init.num_players,
            seed: init.seed,
            rules_hash: init.rules_hash,
            players: self
                .state
                .players
                .iter()
                .map(|p| ReplayPlayer {
                    id: p.id,
                    name: p.name.clone(),
                    is_ai: p.is_ai,
                })
                .collect(),
            commands: self
                .command_log
                .iter()
                .map(|c| ReplayCommand {
                    turn: c.turn,
                    player: c.player,
                    command: c.command.clone(),
                })
                .collect(),
        })
    }

    pub fn rules_names(&self) -> RulesNames {
        let (rules_hash, rules) = match self.init.as_ref() {
            Some(init) => (init.rules_hash, &init.rules),
            None => (rules_hash(&self.state.rules), &self.state.rules),
        };

        RulesNames {
            rules_hash,
            terrains: rules.terrains.iter().map(|t| t.name.clone()).collect(),
            unit_types: rules.unit_types.iter().map(|u| u.name.clone()).collect(),
            buildings: rules.buildings.iter().map(|b| b.name.clone()).collect(),
            techs: rules.techs.iter().map(|t| t.name.clone()).collect(),
            improvements: rules.improvements.iter().map(|i| i.name.clone()).collect(),
            policies: rules.policies.iter().map(|p| p.name.clone()).collect(),
            governments: rules.governments.iter().map(|g| g.name.clone()).collect(),
        }
    }

    pub fn rules_catalog(&self) -> RulesCatalog {
        let (rules_hash, rules) = match self.init.as_ref() {
            Some(init) => (init.rules_hash, &init.rules),
            None => (rules_hash(&self.state.rules), &self.state.rules),
        };

        let mut unlock_units: Vec<Vec<backbay_protocol::UnitTypeId>> =
            vec![Vec::new(); rules.techs.len()];
        for (raw, unit) in rules.unit_types.iter().enumerate() {
            let id = backbay_protocol::UnitTypeId::new(raw as u16);
            if let Some(tech) = unit.tech_required {
                if let Some(list) = unlock_units.get_mut(tech.raw as usize) {
                    list.push(id);
                }
            }
        }

        let mut unlock_buildings: Vec<Vec<backbay_protocol::BuildingId>> =
            vec![Vec::new(); rules.techs.len()];
        for (raw, building) in rules.buildings.iter().enumerate() {
            let id = backbay_protocol::BuildingId::new(raw as u16);
            if let Some(tech) = building.tech_required {
                if let Some(list) = unlock_buildings.get_mut(tech.raw as usize) {
                    list.push(id);
                }
            }
        }

        RulesCatalog {
            rules_hash,
            techs: rules
                .techs
                .iter()
                .enumerate()
                .map(|(raw, tech)| {
                    let id = TechId::new(raw as u16);
                    RulesCatalogTech {
                        id,
                        name: tech.name.clone(),
                        cost: tech.cost,
                        era: tech.era.index(),
                        prerequisites: tech.prerequisites.clone(),
                        unlock_units: unlock_units.get(raw).cloned().unwrap_or_default(),
                        unlock_buildings: unlock_buildings.get(raw).cloned().unwrap_or_default(),
                    }
                })
                .collect(),
            unit_types: rules
                .unit_types
                .iter()
                .enumerate()
                .map(|(raw, unit)| {
                    let id = backbay_protocol::UnitTypeId::new(raw as u16);
                    RulesCatalogUnitType {
                        id,
                        name: unit.name.clone(),
                        cost: unit.cost,
                        attack: unit.attack,
                        defense: unit.defense,
                        moves: unit.moves,
                        hp: unit.hp,
                        firepower: unit.firepower,
                        supply_cost: unit.supply_cost,
                        can_found_city: unit.can_found_city,
                        is_worker: unit.is_worker,
                        can_fortify: unit.can_fortify,
                        tech_required: unit.tech_required,
                    }
                })
                .collect(),
            buildings: rules
                .buildings
                .iter()
                .enumerate()
                .map(|(raw, building)| {
                    let id = backbay_protocol::BuildingId::new(raw as u16);
                    RulesCatalogBuilding {
                        id,
                        name: building.name.clone(),
                        cost: building.cost,
                        maintenance: building.maintenance,
                        admin: building.admin,
                        tech_required: building.tech_required,
                    }
                })
                .collect(),
            improvements: rules
                .improvements
                .iter()
                .enumerate()
                .map(|(raw, improvement)| {
                    let id = backbay_protocol::ImprovementId::new(raw as u16);
                    RulesCatalogImprovement {
                        id,
                        name: improvement.name.clone(),
                        build_time: improvement.build_time,
                        repair_time: improvement.repair_time,
                        allowed_terrain: improvement.allowed_terrain.clone(),
                        tiers: improvement
                            .tiers
                            .iter()
                            .map(|tier| RulesCatalogImprovementTier {
                                yields: UiYields {
                                    food: tier.yields.food,
                                    production: tier.yields.production,
                                    gold: tier.yields.gold,
                                    science: tier.yields.science,
                                    culture: tier.yields.culture,
                                },
                                worked_turns_to_next: tier.worked_turns_to_next,
                            })
                            .collect(),
                    }
                })
                .collect(),
        }
    }

    pub fn import_replay(&mut self, replay: ReplayFile) -> Result<(), ReplayImportError> {
        let Some(init) = self.init.clone() else {
            return Err(ReplayImportError::EngineNotInitialized);
        };
        if replay.version != 1 {
            return Err(ReplayImportError::UnsupportedVersion(replay.version));
        }
        if replay.rules_hash != init.rules_hash {
            return Err(ReplayImportError::RulesHashMismatch {
                expected: init.rules_hash,
                got: replay.rules_hash,
            });
        }

        let mut state = GameState::new_game(
            replay.map_size,
            replay.num_players.max(1),
            init.rules.clone(),
            replay.seed,
        );
        for (player, from) in state.players.iter_mut().zip(replay.players.iter()) {
            player.name = from.name.clone();
            player.is_ai = from.is_ai;
        }

        self.init = Some(GameInit {
            map_size: replay.map_size,
            num_players: replay.num_players.max(1),
            seed: replay.seed,
            rules_hash: init.rules_hash,
            rules: init.rules,
            players: replay
                .players
                .iter()
                .map(|p| PlayerInit {
                    name: p.name.clone(),
                    is_ai: p.is_ai,
                })
                .collect(),
        });
        self.state = state;
        self.command_log = replay
            .commands
            .iter()
            .map(|c| RecordedCommand {
                turn: c.turn,
                player: c.player,
                command: c.command.clone(),
            })
            .collect();

        let _ = self.update_visibility_for_player(self.state.current_player);

        for (idx, c) in replay.commands.iter().enumerate() {
            let expected_turn = self.state.turn;
            let expected_player = self.state.current_player;
            if c.turn != expected_turn || c.player != expected_player {
                return Err(ReplayImportError::CommandOutOfSync {
                    index: idx,
                    expected_turn,
                    expected_player,
                    got_turn: c.turn,
                    got_player: c.player,
                });
            }
            self.try_apply_command(c.command.clone())
                .map_err(|_| ReplayImportError::CommandFailed { index: idx })?;
        }

        Ok(())
    }

    pub fn state(&self) -> &GameState {
        &self.state
    }

    pub fn state_mut(&mut self) -> &mut GameState {
        &mut self.state
    }

    pub fn apply_command_checked(&mut self, command: Command) -> Result<Vec<Event>, GameError> {
        let turn = self.state.turn;
        let player = self.state.current_player;

        let events = self.try_apply_command(command.clone())?;
        self.command_log.push(RecordedCommand {
            turn,
            player,
            command,
        });
        Ok(events)
    }

    pub fn apply_command(&mut self, command: Command) -> Vec<Event> {
        self.apply_command_checked(command).unwrap_or_default()
    }

    pub fn replay_to_turn_start(&mut self, target_turn: u32) -> bool {
        let Some(init) = self.init.clone() else {
            return false;
        };

        let target_turn = target_turn.max(1);

        let mut state = GameState::new_game(
            init.map_size,
            init.num_players,
            init.rules.clone(),
            init.seed,
        );
        for (p, init_p) in state.players.iter_mut().zip(init.players.iter()) {
            p.name = init_p.name.clone();
            p.is_ai = init_p.is_ai;
        }

        let mut scratch = GameEngine {
            init: Some(init),
            command_log: Vec::new(),
            state,
        };

        let _ = scratch.update_visibility_for_player(scratch.state.current_player);

        if scratch.state.turn == target_turn && scratch.state.current_player == PlayerId(0) {
            self.state = scratch.state;
            return true;
        }

        for cmd in &self.command_log {
            let _ = scratch.try_apply_command(cmd.command.clone());
            if scratch.state.turn == target_turn && scratch.state.current_player == PlayerId(0) {
                break;
            }
        }

        self.state = scratch.state;
        true
    }

    pub fn try_apply_command(&mut self, command: Command) -> Result<Vec<Event>, GameError> {
        let mut events = match command {
            Command::MoveUnit { unit, path } => self.move_unit(unit, path)?,
            Command::AttackUnit { attacker, target } => self.attack_unit(attacker, target)?,
            Command::FoundCity { settler, name } => self.found_city(settler, name)?,
            Command::SetProduction { city, item } => self.set_production(city, item)?,
            Command::SetResearch { tech } => self.set_research(tech)?,
            Command::AdoptPolicy { policy } => self.adopt_policy(policy)?,
            Command::ReformGovernment { government } => self.reform_government(government)?,
            Command::SetOrders { unit, orders } => self.set_orders(unit, orders)?,
            Command::CancelOrders { unit } => self.cancel_orders(unit)?,
            Command::SetWorkerAutomation { unit, enabled } => {
                self.set_worker_automation(unit, enabled)?
            }
            Command::Fortify { unit } => self.fortify(unit)?,
            Command::PillageImprovement { unit } => self.pillage_improvement(unit)?,
            Command::EstablishTradeRoute { from, to } => self.establish_trade_route(from, to)?,
            Command::CancelTradeRoute { route } => self.cancel_trade_route(route)?,
            Command::DeclareWar { target } => self.declare_war(target)?,
            Command::DeclarePeace { target } => self.declare_peace(target)?,
            Command::ProposeDeal { to, offer, demand } => self.propose_deal(to, offer, demand)?,
            Command::RespondToProposal { from, accept } => {
                self.respond_to_proposal(from, accept)?
            }
            Command::CancelTreaty { treaty } => self.cancel_treaty_cmd(treaty)?,
            Command::IssueDemand {
                to,
                items,
                consequence,
            } => self.issue_demand_cmd(to, items, consequence)?,
            Command::RespondToDemand { demand, accept } => {
                self.respond_to_demand_cmd(demand, accept)?
            }
            Command::EndTurn => self.end_turn(),
            Command::BuyProduction { .. }
            | Command::AssignCitizen { .. }
            | Command::UnassignCitizen { .. } => Vec::new(),
        };

        self.capture_chronicle_from_events(&mut events);
        self.update_victory_capitals(&events);
        Ok(events)
    }

    fn emit_chronicle_entry(&mut self, events: &mut Vec<Event>, chronicle_event: ChronicleEvent) {
        let entry = ChronicleEntry {
            id: self.state.chronicle_next_id,
            turn: self.state.turn,
            event: chronicle_event,
        };
        self.state.chronicle_next_id = self.state.chronicle_next_id.saturating_add(1);
        self.state.chronicle.push(entry.clone());
        events.push(Event::ChronicleEntryAdded { entry });
    }

    fn unit_owner_at(&self, hex: Hex) -> Option<PlayerId> {
        self.state
            .units
            .iter_ordered()
            .find_map(|(_id, u)| (u.position == hex).then_some(u.owner))
    }

    fn capture_chronicle_from_events(&mut self, events: &mut Vec<Event>) {
        let mut to_add = Vec::new();

        for e in events.iter() {
            match e {
                Event::CityFounded {
                    city,
                    name,
                    pos,
                    owner,
                } => to_add.push(ChronicleEvent::CityFounded {
                    owner: *owner,
                    city: *city,
                    name: name.clone(),
                    pos: *pos,
                }),
                Event::CityConquered {
                    city,
                    new_owner,
                    old_owner,
                } => {
                    let Some(c) = self.state.cities.get(*city) else {
                        continue;
                    };
                    to_add.push(ChronicleEvent::CityConquered {
                        city: *city,
                        name: c.name.clone(),
                        pos: c.position,
                        old_owner: *old_owner,
                        new_owner: *new_owner,
                    });
                }
                Event::TechResearched { player, tech } => {
                    to_add.push(ChronicleEvent::TechResearched {
                        player: *player,
                        tech: *tech,
                    });
                }
                Event::PolicyAdopted { player, policy } => {
                    to_add.push(ChronicleEvent::PolicyAdopted {
                        player: *player,
                        policy: *policy,
                    });
                }
                Event::GovernmentReformed { player, new, .. } => {
                    to_add.push(ChronicleEvent::GovernmentReformed {
                        player: *player,
                        new: *new,
                    });
                }
                Event::ImprovementBuilt {
                    hex,
                    improvement,
                    tier,
                } => {
                    let player = self
                        .state
                        .map
                        .get(*hex)
                        .and_then(|t| t.owner)
                        .unwrap_or(PlayerId(0));
                    to_add.push(ChronicleEvent::ImprovementBuilt {
                        player,
                        improvement: *improvement,
                        at: *hex,
                        tier: *tier,
                    });
                }
                Event::ImprovementMatured {
                    hex,
                    improvement,
                    new_tier,
                } => {
                    let player = self
                        .state
                        .map
                        .get(*hex)
                        .and_then(|t| t.owner)
                        .unwrap_or(PlayerId(0));
                    to_add.push(ChronicleEvent::ImprovementMatured {
                        player,
                        improvement: *improvement,
                        at: *hex,
                        new_tier: *new_tier,
                    });
                }
                Event::ImprovementPillaged {
                    hex,
                    improvement,
                    new_tier,
                } => {
                    let by = self.unit_owner_at(*hex).unwrap_or(PlayerId(0));
                    to_add.push(ChronicleEvent::ImprovementPillaged {
                        by,
                        improvement: *improvement,
                        at: *hex,
                        new_tier: *new_tier,
                    });
                }
                Event::ImprovementRepaired {
                    hex,
                    improvement,
                    tier,
                } => {
                    let player = self
                        .state
                        .map
                        .get(*hex)
                        .and_then(|t| t.owner)
                        .unwrap_or(PlayerId(0));
                    to_add.push(ChronicleEvent::ImprovementRepaired {
                        player,
                        improvement: *improvement,
                        at: *hex,
                        tier: *tier,
                    });
                }
                Event::TradeRouteEstablished {
                    owner,
                    from,
                    to,
                    is_external,
                    ..
                } => {
                    to_add.push(ChronicleEvent::TradeRouteEstablished {
                        owner: *owner,
                        from: *from,
                        to: *to,
                        is_external: *is_external,
                    });
                }
                Event::TradeRoutePillaged { by, at, .. } => {
                    to_add.push(ChronicleEvent::TradeRoutePillaged { by: *by, at: *at });
                }
                Event::WarDeclared { aggressor, target } => {
                    to_add.push(ChronicleEvent::WarDeclared {
                        aggressor: *aggressor,
                        target: *target,
                    });
                }
                Event::PeaceDeclared { a, b } => {
                    to_add.push(ChronicleEvent::PeaceDeclared { a: *a, b: *b });
                }
                Event::CombatEnded {
                    winner,
                    at,
                    attacker_owner,
                    defender_owner,
                    ..
                } => {
                    let winner_owner = self
                        .state
                        .units
                        .get(*winner)
                        .map(|u| u.owner)
                        .unwrap_or(*attacker_owner);
                    to_add.push(ChronicleEvent::BattleEnded {
                        attacker: *attacker_owner,
                        defender: *defender_owner,
                        winner: winner_owner,
                        at: *at,
                    });
                }
                Event::CityGrew { city, new_pop } => {
                    if let Some(c) = self.state.cities.get(*city) {
                        to_add.push(ChronicleEvent::CityGrew {
                            owner: c.owner,
                            city: *city,
                            name: c.name.clone(),
                            new_pop: *new_pop,
                        });
                    }
                }
                Event::BordersExpanded { city, new_tiles } => {
                    if let Some(c) = self.state.cities.get(*city) {
                        to_add.push(ChronicleEvent::BorderExpanded {
                            owner: c.owner,
                            city: *city,
                            new_tiles: new_tiles.clone(),
                        });
                    }
                }
                Event::CityProduced { city, item } => {
                    if let Some(c) = self.state.cities.get(*city) {
                        match item {
                            ProductionItem::Unit(unit_type) => {
                                to_add.push(ChronicleEvent::UnitTrained {
                                    owner: c.owner,
                                    city: *city,
                                    unit_type: *unit_type,
                                });
                            }
                            ProductionItem::Building(building_id) => {
                                // TODO: Check is_wonder flag when wonders are implemented
                                to_add.push(ChronicleEvent::BuildingConstructed {
                                    owner: c.owner,
                                    city: *city,
                                    building: *building_id,
                                });
                            }
                        }
                    }
                }
                Event::UnitPromoted { unit, new_level } => {
                    if let Some(u) = self.state.units.get(*unit) {
                        to_add.push(ChronicleEvent::UnitPromoted {
                            owner: u.owner,
                            unit: *unit,
                            unit_type: u.type_id,
                            new_level: *new_level,
                        });
                    }
                }
                _ => {}
            }
        }

        for e in to_add {
            self.emit_chronicle_entry(events, e);
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        let map = MapSnapshot {
            width: self.state.map.width(),
            height: self.state.map.height(),
            wrap_horizontal: self.state.map.wrap_horizontal(),
            tiles: self
                .state
                .map
                .tiles()
                .iter()
                .map(|t| TileSnapshot {
                    terrain: t.terrain,
                    owner: t.owner,
                    city: t.city,
                    improvement: t.improvement.as_ref().map(|i| TileImprovementSnapshot {
                        id: i.id,
                        tier: i.tier,
                        worked_turns: i.worked_turns,
                        pillaged: i.pillaged,
                    }),
                    resource: t.resource,
                })
                .collect(),
        };

        let players = self
            .state
            .players
            .iter()
            .map(|p| PlayerSnapshot {
                id: p.id,
                name: p.name.clone(),
                is_ai: p.is_ai,
                researching: p.researching,
                research: p.researching.map(|tech| ResearchStatus {
                    tech,
                    progress: p.research_progress,
                    required: self.state.rules.techs[tech.raw as usize].cost,
                }),
                research_overflow: p.research_overflow,
                known_techs: p
                    .known_techs
                    .iter()
                    .enumerate()
                    .filter_map(|(i, known)| known.then_some(TechId::new(i as u16)))
                    .collect(),
                gold: p.gold,
                culture: p.culture,
                culture_milestones_reached: p.culture_milestones_reached,
                available_policy_picks: p.available_policy_picks,
                policies: p.policies.clone(),
                policy_adopted_era: p
                    .policies
                    .iter()
                    .map(|policy| {
                        p.policy_adopted_era
                            .get(policy.raw as usize)
                            .copied()
                            .flatten()
                            .unwrap_or(0)
                    })
                    .collect(),
                government: p.government,
                supply_used: p.supply_used,
                supply_cap: p.supply_cap,
                war_weariness: p.war_weariness,
            })
            .collect();

        let units = self
            .state
            .units
            .iter_ordered()
            .map(|(id, u)| UnitSnapshot {
                id,
                type_id: u.type_id,
                owner: u.owner,
                pos: u.position,
                hp: u.hp,
                moves_left: u.moves_left,
                veteran_level: u.veteran_level(),
                orders: u.orders.clone(),
                automated: u.automated,
            })
            .collect();

        let cities = self
            .state
            .cities
            .iter_ordered()
            .map(|(id, c)| CitySnapshot {
                id,
                name: c.name.clone(),
                owner: c.owner,
                pos: c.position,
                population: c.population,
                food_stockpile: c.food_stockpile,
                production_stockpile: c.production_stockpile,
                buildings: c.buildings.clone(),
                producing: c.producing.clone(),
                claimed_tiles: c.claimed_tiles.clone(),
                border_progress: c.border_progress,
            })
            .collect();

        let trade_routes = self
            .state
            .trade_routes
            .iter_ordered()
            .map(|(id, r)| {
                let is_external = self
                    .state
                    .cities
                    .get(r.to)
                    .map(|c| c.owner != r.owner)
                    .unwrap_or(false);
                TradeRouteSnapshot {
                    id,
                    owner: r.owner,
                    from: r.from,
                    to: r.to,
                    path: r.path.clone(),
                    is_external,
                }
            })
            .collect();

        Snapshot {
            turn: self.state.turn,
            current_player: self.state.current_player,
            map,
            players,
            units,
            cities,
            trade_routes,
            chronicle: self.state.chronicle.clone(),
            rng_state: self.state.rng.state_bytes(),
        }
    }

    pub fn query_combat_preview(
        &self,
        attacker_id: UnitId,
        defender_id: UnitId,
    ) -> Option<CombatPreview> {
        let attacker = self.state.units.get(attacker_id)?;
        let defender = self.state.units.get(defender_id)?;
        Some(calculate_combat_preview(
            attacker,
            defender,
            &self.state.map,
            &self.state.rules,
        ))
    }

    pub fn query_combat_why(&self, attacker_id: UnitId, defender_id: UnitId) -> Option<WhyPanel> {
        let attacker = self.state.units.get(attacker_id)?;
        let defender = self.state.units.get(defender_id)?;
        let rules = &self.state.rules;
        let defender_tile = self.state.map.get(defender.position)?;

        let attacker_type = rules.unit_type(attacker.type_id);
        let defender_type = rules.unit_type(defender.type_id);

        let attacker_vet = attacker.veteran_level();
        let attacker_vet_mult = [100, 150, 175, 200][attacker_vet as usize];
        let attacker_str = attacker.attack_strength(rules);

        let defender_vet = defender.veteran_level();
        let defender_vet_mult = [100, 150, 175, 200][defender_vet as usize];

        let terrain = rules.terrain(defender_tile.terrain);
        let terrain_bonus = terrain.defense_bonus;
        let fort_mult = match defender.fortified_turns {
            0 => 100,
            1 => 125,
            _ => 150,
        };
        let defender_str = defender.defense_strength(rules, defender_tile);

        let preview = calculate_combat_preview(attacker, defender, &self.state.map, rules);

        let lines = vec![
            WhyLine {
                label: "Attacker".to_string(),
                value: format!(
                    "P{} unit {} type {} (HP {}/{})",
                    attacker.owner.0,
                    attacker_id.to_raw(),
                    attacker.type_id.raw,
                    attacker.hp,
                    attacker.max_hp
                ),
            },
            WhyLine {
                label: "Attacker base attack".to_string(),
                value: attacker_type.attack.to_string(),
            },
            WhyLine {
                label: "Attacker veteran".to_string(),
                value: format!("L{} ({}%)", attacker_vet, attacker_vet_mult),
            },
            WhyLine {
                label: "Attacker strength".to_string(),
                value: attacker_str.to_string(),
            },
            WhyLine {
                label: "Attacker firepower".to_string(),
                value: attacker_type.firepower.to_string(),
            },
            WhyLine {
                label: "Defender".to_string(),
                value: format!(
                    "P{} unit {} type {} (HP {}/{})",
                    defender.owner.0,
                    defender_id.to_raw(),
                    defender.type_id.raw,
                    defender.hp,
                    defender.max_hp
                ),
            },
            WhyLine {
                label: "Defender base defense".to_string(),
                value: defender_type.defense.to_string(),
            },
            WhyLine {
                label: "Defender terrain".to_string(),
                value: format!("{} (+{}%)", terrain.name, terrain_bonus),
            },
            WhyLine {
                label: "Defender fortify".to_string(),
                value: format!("{} turns ({}%)", defender.fortified_turns, fort_mult),
            },
            WhyLine {
                label: "Defender veteran".to_string(),
                value: format!("L{} ({}%)", defender_vet, defender_vet_mult),
            },
            WhyLine {
                label: "Defender strength".to_string(),
                value: defender_str.to_string(),
            },
            WhyLine {
                label: "Defender firepower".to_string(),
                value: defender_type.firepower.to_string(),
            },
            WhyLine {
                label: "Win chance".to_string(),
                value: format!(
                    "{}% (expected HP A{} / D{})",
                    preview.attacker_win_pct,
                    preview.attacker_hp_expected,
                    preview.defender_hp_expected
                ),
            },
        ];

        Some(WhyPanel {
            title: "Combat".to_string(),
            summary: "Strength + firepower drive odds; defense stacks terrain/fortify/veteran."
                .to_string(),
            lines,
        })
    }

    pub fn query_maintenance_why(&self, player: PlayerId) -> WhyPanel {
        let Some(p) = self.state.players.get(player.0 as usize) else {
            return WhyPanel {
                title: "Maintenance".to_string(),
                summary: "Unknown player".to_string(),
                lines: Vec::new(),
            };
        };

        let rules = &self.state.rules;

        // Capital is the first-founded city (stable entity ID order) for the player.
        let mut capital = None;
        for (_city_id, city) in self.state.cities.iter_ordered() {
            if city.owner == player {
                capital = Some(city.position);
                break;
            }
        }
        let capital = capital.unwrap_or(Hex { q: 0, r: 0 });

        let gov_admin = p
            .government
            .and_then(|gov| rules.governments.get(gov.raw as usize))
            .map(|g| g.admin)
            .unwrap_or(0);

        let war_penalty = p.war_weariness / 5;

        let mut city_count = 0i32;
        let mut local_admin_total = 0i32;
        let mut gold_from_tiles = 0i32;
        let mut gold_from_trade = 0i32;
        let mut building_maintenance = 0i32;
        let mut city_maintenance = 0i32;

        let mut city_upkeep_lines: Vec<(i32, WhyLine)> = Vec::new();

        for (city_id, city) in self.state.cities.iter_ordered() {
            if city.owner != player {
                continue;
            }
            city_count += 1;

            let yields = city.yields(&self.state.map, rules, p);
            gold_from_tiles = gold_from_tiles.saturating_add(yields.gold);

            let distance = city.position.distance(capital);
            let local_admin = city
                .buildings
                .iter()
                .map(|&b| rules.building(b).admin)
                .sum::<i32>();
            local_admin_total = local_admin_total.saturating_add(local_admin);

            let instability = (3 - gov_admin - local_admin).max(0);
            let upkeep = 5 + distance + instability + war_penalty;
            city_maintenance = city_maintenance.saturating_add(upkeep);

            let b_maint = city
                .buildings
                .iter()
                .map(|&b| rules.building(b).maintenance)
                .sum::<i32>();
            building_maintenance = building_maintenance.saturating_add(b_maint);

            city_upkeep_lines.push((
                upkeep,
                WhyLine {
                    label: format!("City upkeep: {}", city.name),
                    value: format!(
                        "{} (base 5 + dist {} + instab {} + war {})",
                        upkeep, distance, instability, war_penalty
                    ),
                },
            ));

            if b_maint != 0 {
                city_upkeep_lines.push((
                    b_maint,
                    WhyLine {
                        label: format!("Building upkeep: {}", city.name),
                        value: b_maint.to_string(),
                    },
                ));
            }

            let _ = city_id;
        }

        for (_route_id, route) in self.state.trade_routes.iter_ordered() {
            if route.owner != player {
                continue;
            }
            let to_owner = self
                .state
                .cities
                .get(route.to)
                .map(|c| c.owner)
                .unwrap_or(route.owner);
            if to_owner == player {
                gold_from_trade = gold_from_trade.saturating_add(2);
            } else {
                gold_from_trade = gold_from_trade.saturating_add(3);
            }
        }

        // Supply + over-cap penalty.
        let mut supply_used = 0i32;
        for (_unit_id, unit) in self.state.units.iter_ordered() {
            if unit.owner != player {
                continue;
            }
            let utype = rules.unit_type(unit.type_id);
            supply_used = supply_used.saturating_add(utype.supply_cost.max(0));
        }
        let supply_cap = (4 + city_count * 2 + gov_admin * 2 + local_admin_total).max(0);
        let supply_over = (supply_used - supply_cap).max(0);
        let supply_penalty = supply_over.saturating_mul(2);

        let total_income = gold_from_tiles.saturating_add(gold_from_trade);
        let total_cost = building_maintenance
            .saturating_add(city_maintenance)
            .saturating_add(supply_penalty);
        let net = total_income.saturating_sub(total_cost);

        city_upkeep_lines.sort_by_key(|(v, _)| std::cmp::Reverse(*v));
        let mut lines = Vec::new();
        lines.push(WhyLine {
            label: "Income (tiles)".to_string(),
            value: gold_from_tiles.to_string(),
        });
        lines.push(WhyLine {
            label: "Income (trade)".to_string(),
            value: gold_from_trade.to_string(),
        });
        lines.push(WhyLine {
            label: "City maintenance".to_string(),
            value: city_maintenance.to_string(),
        });
        lines.push(WhyLine {
            label: "Building maintenance".to_string(),
            value: building_maintenance.to_string(),
        });
        lines.push(WhyLine {
            label: "Supply".to_string(),
            value: format!(
                "{} / {} (over {} → -{} gold)",
                supply_used, supply_cap, supply_over, supply_penalty
            ),
        });
        lines.push(WhyLine {
            label: "Net (per world turn)".to_string(),
            value: format!("{net:+}"),
        });

        for (_value, line) in city_upkeep_lines.into_iter().take(8) {
            lines.push(line);
        }

        WhyPanel {
            title: "Maintenance".to_string(),
            summary: format!(
                "Per world turn: +{} income ({} tiles + {} trade) -{} costs ({} city + {} buildings + {} supply) → {net:+}.",
                total_income,
                gold_from_tiles,
                gold_from_trade,
                total_cost,
                city_maintenance,
                building_maintenance,
                supply_penalty,
            ),
            lines,
        }
    }

    pub fn query_city_maintenance_why(&self, city_id: CityId) -> WhyPanel {
        let Some(city) = self.state.cities.get(city_id) else {
            return WhyPanel {
                title: "City upkeep".to_string(),
                summary: "Unknown city".to_string(),
                lines: Vec::new(),
            };
        };
        let Some(player) = self.state.players.get(city.owner.0 as usize) else {
            return WhyPanel {
                title: "City upkeep".to_string(),
                summary: "Unknown owner".to_string(),
                lines: Vec::new(),
            };
        };

        let rules = &self.state.rules;

        // Capital is the first-founded city (stable entity ID order) for the player.
        let mut capital = None;
        for (_cid, c) in self.state.cities.iter_ordered() {
            if c.owner == city.owner {
                capital = Some(c.position);
                break;
            }
        }
        let capital = capital.unwrap_or(Hex { q: 0, r: 0 });

        let gov_admin = player
            .government
            .and_then(|gov| rules.governments.get(gov.raw as usize))
            .map(|g| g.admin)
            .unwrap_or(0);
        let war_penalty = player.war_weariness / 5;

        let distance = city.position.distance(capital);
        let local_admin = city
            .buildings
            .iter()
            .map(|&b| rules.building(b).admin)
            .sum::<i32>();
        let instability = (3 - gov_admin - local_admin).max(0);

        let city_upkeep = 5 + distance + instability + war_penalty;
        let building_upkeep = city
            .buildings
            .iter()
            .map(|&b| rules.building(b).maintenance)
            .sum::<i32>();
        let total = city_upkeep.saturating_add(building_upkeep);

        let mut lines = Vec::new();
        lines.push(WhyLine {
            label: "City".to_string(),
            value: format!("{} (id {})", city.name, city_id.to_raw()),
        });
        lines.push(WhyLine {
            label: "Capital distance".to_string(),
            value: distance.to_string(),
        });
        lines.push(WhyLine {
            label: "Government admin".to_string(),
            value: gov_admin.to_string(),
        });
        lines.push(WhyLine {
            label: "Local admin".to_string(),
            value: local_admin.to_string(),
        });
        lines.push(WhyLine {
            label: "Instability".to_string(),
            value: format!(
                "{} (max(0, 3 - gov {} - local {}))",
                instability, gov_admin, local_admin
            ),
        });
        lines.push(WhyLine {
            label: "War weariness".to_string(),
            value: format!("{} (→ upkeep +{})", player.war_weariness, war_penalty),
        });
        lines.push(WhyLine {
            label: "City upkeep".to_string(),
            value: format!(
                "{} (base 5 + dist {} + instab {} + war {})",
                city_upkeep, distance, instability, war_penalty
            ),
        });
        lines.push(WhyLine {
            label: "Building upkeep".to_string(),
            value: building_upkeep.to_string(),
        });
        for &b in &city.buildings {
            let btype = rules.building(b);
            if btype.maintenance == 0 && btype.admin == 0 {
                continue;
            }
            lines.push(WhyLine {
                label: format!("Building: {}", btype.name),
                value: format!(
                    "maint {} / admin {}",
                    btype.maintenance.max(0),
                    btype.admin.max(0)
                ),
            });
        }

        WhyPanel {
            title: format!("Upkeep: {}", city.name),
            summary: format!(
                "{} upkeep: {} city + {} buildings = {} total per world turn.",
                city.name, city_upkeep, building_upkeep, total
            ),
            lines,
        }
    }

    pub fn query_unrest_why(&self, city: CityId) -> WhyPanel {
        let Some(city) = self.state.cities.get(city) else {
            return WhyPanel {
                title: "Unrest".to_string(),
                summary: "Unknown city".to_string(),
                lines: Vec::new(),
            };
        };
        let Some(player) = self.state.players.get(city.owner.0 as usize) else {
            return WhyPanel {
                title: "Unrest".to_string(),
                summary: "Unknown owner".to_string(),
                lines: Vec::new(),
            };
        };
        let rules = &self.state.rules;

        let gov_admin = player
            .government
            .and_then(|gov| rules.governments.get(gov.raw as usize))
            .map(|g| g.admin)
            .unwrap_or(0);
        let local_admin = city
            .buildings
            .iter()
            .map(|&b| rules.building(b).admin)
            .sum::<i32>();
        let instability = (3 - gov_admin - local_admin).max(0);
        let war_penalty = player.war_weariness / 5;

        WhyPanel {
            title: "Unrest".to_string(),
            summary: "Full stability/amenities system not implemented; this reports current stand-ins that drive upkeep.".to_string(),
            lines: vec![
                WhyLine {
                    label: "City".to_string(),
                    value: format!("{} (P{})", city.name, city.owner.0),
                },
                WhyLine {
                    label: "Government admin".to_string(),
                    value: gov_admin.to_string(),
                },
                WhyLine {
                    label: "Local admin (buildings)".to_string(),
                    value: local_admin.to_string(),
                },
                WhyLine {
                    label: "Instability".to_string(),
                    value: instability.to_string(),
                },
                WhyLine {
                    label: "War weariness".to_string(),
                    value: format!("{} (→ upkeep +{})", player.war_weariness, war_penalty),
                },
            ],
        }
    }

    pub fn query_conversion_why(&self, _city: CityId) -> WhyPanel {
        WhyPanel {
            title: "Conversion".to_string(),
            summary: "Religion/conversion is not implemented yet.".to_string(),
            lines: vec![WhyLine {
                label: "Status".to_string(),
                value: "No conversion mechanics active.".to_string(),
            }],
        }
    }

    pub fn query_treaty_why(&self, a: PlayerId, b: PlayerId) -> WhyPanel {
        let at_war = self.state.diplomacy.is_at_war(a, b);
        let relation = self.state.diplomacy.relation(a, b);

        let mut external_trade_routes = 0i32;
        for (_id, route) in self.state.trade_routes.iter_ordered() {
            let from_owner = self
                .state
                .cities
                .get(route.from)
                .map(|c| c.owner)
                .unwrap_or(route.owner);
            let to_owner = self
                .state
                .cities
                .get(route.to)
                .map(|c| c.owner)
                .unwrap_or(route.owner);

            let is_pair = (from_owner == a && to_owner == b) || (from_owner == b && to_owner == a);
            if !is_pair {
                continue;
            }
            if from_owner != to_owner {
                external_trade_routes += 1;
            }
        }

        let per_turn_relation = external_trade_routes.max(0);

        let mut last_change = None;
        for entry in self.state.chronicle.iter().rev() {
            match &entry.event {
                ChronicleEvent::WarDeclared { aggressor, target }
                    if (*aggressor == a && *target == b) || (*aggressor == b && *target == a) =>
                {
                    last_change = Some(format!("War declared on T{}", entry.turn));
                    break;
                }
                ChronicleEvent::PeaceDeclared { a: pa, b: pb }
                    if (*pa == a && *pb == b) || (*pa == b && *pb == a) =>
                {
                    last_change = Some(format!("Peace declared on T{}", entry.turn));
                    break;
                }
                _ => {}
            }
        }

        let mut lines = vec![
            WhyLine {
                label: "Players".to_string(),
                value: format!("P{} ↔ P{}", a.0, b.0),
            },
            WhyLine {
                label: "At war".to_string(),
                value: at_war.to_string(),
            },
            WhyLine {
                label: "Relation score".to_string(),
                value: relation.to_string(),
            },
            WhyLine {
                label: "External trade routes".to_string(),
                value: external_trade_routes.to_string(),
            },
            WhyLine {
                label: "Relation drift (per world turn)".to_string(),
                value: format!("+{}", per_turn_relation),
            },
        ];

        if let Some(last) = last_change {
            lines.push(WhyLine {
                label: "Last major change".to_string(),
                value: last,
            });
        }

        WhyPanel {
            title: "Treaties".to_string(),
            summary: "Treaty mechanics are minimal; this explains current war/peace state, relation score, and trade-driven relation drift.".to_string(),
            lines,
        }
    }

    // =========================================================================
    // Chronicle Query Methods (Timeline UI)
    // =========================================================================

    /// Get all chronicle entries.
    pub fn query_chronicle(&self) -> &[ChronicleEntry] {
        &self.state.chronicle
    }

    /// Get chronicle entries for a specific turn range.
    pub fn query_chronicle_range(&self, from_turn: u32, to_turn: u32) -> Vec<&ChronicleEntry> {
        self.state
            .chronicle
            .iter()
            .filter(|e| e.turn >= from_turn && e.turn <= to_turn)
            .collect()
    }

    /// Get chronicle entries involving a specific player.
    pub fn query_chronicle_for_player(&self, player: PlayerId) -> Vec<&ChronicleEntry> {
        self.state
            .chronicle
            .iter()
            .filter(|e| chronicle_involves_player(&e.event, player))
            .collect()
    }

    /// Get chronicle entries by category.
    pub fn query_chronicle_by_category(&self, category: ChronicleCategory) -> Vec<&ChronicleEntry> {
        self.state
            .chronicle
            .iter()
            .filter(|e| chronicle_category(&e.event) == category)
            .collect()
    }

    /// Get the most recent N chronicle entries.
    pub fn query_chronicle_recent(&self, count: usize) -> Vec<&ChronicleEntry> {
        self.state
            .chronicle
            .iter()
            .rev()
            .take(count)
            .collect()
    }

    /// Jump to the turn when a chronicle entry occurred (for replay scrubbing).
    pub fn chronicle_entry_turn(&self, entry_id: u64) -> Option<u32> {
        self.state
            .chronicle
            .iter()
            .find(|e| e.id == entry_id)
            .map(|e| e.turn)
    }

    pub fn query_movement_range(&self, unit_id: UnitId) -> Vec<Hex> {
        let Some(unit) = self.state.units.get(unit_id) else {
            return Vec::new();
        };
        let Some(start) = self.state.map.index_of(unit.position) else {
            return Vec::new();
        };
        let occupancy = unit_occupancy(&self.state.map, &self.state.units);
        let zoc = enemy_zoc(
            &self.state.map,
            &self.state.rules,
            &self.state.units,
            unit.owner,
        );

        movement_range(
            &self.state.map,
            &self.state.rules,
            start,
            unit.moves_left.max(0),
            &occupancy,
            &zoc,
        )
    }

    pub fn query_path(&self, unit_id: UnitId, destination: Hex) -> Vec<Hex> {
        let Some(unit) = self.state.units.get(unit_id) else {
            return Vec::new();
        };
        let Some(start) = self.state.map.index_of(unit.position) else {
            return Vec::new();
        };

        let Some(destination) = self.state.map.normalize_hex(destination) else {
            return Vec::new();
        };
        let Some(goal) = self.state.map.index_of(destination) else {
            return Vec::new();
        };
        if start == goal {
            return Vec::new();
        }

        let occupancy = unit_occupancy(&self.state.map, &self.state.units);
        if occupancy.get(goal).copied().flatten().is_some() {
            return Vec::new();
        }

        shortest_path(&self.state.map, &self.state.rules, start, goal, &occupancy)
            .into_iter()
            .filter_map(|idx| self.state.map.hex_at_index(idx))
            .collect()
    }

    pub fn query_path_preview(&self, unit_id: UnitId, destination: Hex) -> PathPreview {
        let Some(unit) = self.state.units.get(unit_id) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: Hex { q: 0, r: 0 },
                stop_reason: None,
            };
        };
        let Some(start_index) = self.state.map.index_of(unit.position) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };

        let Some(destination) = self.state.map.normalize_hex(destination) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };
        let Some(goal_index) = self.state.map.index_of(destination) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };
        if start_index == goal_index {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let occupancy = unit_occupancy(&self.state.map, &self.state.units);
        if occupancy.get(goal_index).copied().flatten().is_some() {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let zoc = enemy_zoc(
            &self.state.map,
            &self.state.rules,
            &self.state.units,
            unit.owner,
        );

        let full_path = best_path_to_destination(
            &self.state.map,
            &self.state.rules,
            start_index,
            goal_index,
            unit.moves_left.max(0),
            &occupancy,
            &zoc,
        )
        .into_iter()
        .filter_map(|idx| self.state.map.hex_at_index(idx))
        .collect::<Vec<_>>();

        if full_path.is_empty() {
            return PathPreview {
                full_path,
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let mut occupancy = occupancy;
        let mut cursor = unit.position;
        let mut cursor_index = start_index;
        let mut moves_left = unit.moves_left;
        let mut this_turn_path = Vec::new();
        let mut stop_reason = None;

        for &raw_step in &full_path {
            let Some(step) = self.state.map.normalize_hex(raw_step) else {
                break;
            };
            if step == cursor {
                continue;
            }
            if !self.state.map.is_neighbor(cursor, step) {
                break;
            }
            let Some(step_index) = self.state.map.index_of(step) else {
                break;
            };
            let Some(cost) = movement_cost_to_enter(&self.state.map, &self.state.rules, step_index)
            else {
                break;
            };
            if moves_left < cost {
                stop_reason = Some(MovementStopReason::MovesExhausted);
                break;
            }
            if occupancy.get(step_index).copied().flatten().is_some() {
                stop_reason = Some(MovementStopReason::Blocked { attempted: step });
                break;
            }

            moves_left -= cost;
            cursor = step;
            occupancy[cursor_index] = None;
            occupancy[step_index] = Some(unit_id);
            cursor_index = step_index;
            this_turn_path.push(step);

            if zoc.get(step_index).copied().unwrap_or(false) {
                stop_reason = Some(MovementStopReason::EnteredEnemyZoc);
                break;
            }
        }

        PathPreview {
            full_path,
            this_turn_path,
            stop_at: cursor,
            stop_reason,
        }
    }

    /// Path preview constrained to a player's fog-of-war knowledge.
    ///
    /// - Only traverses explored tiles.
    /// - Ignores non-visible enemy units for occupancy and ZOC (prevents information leaks).
    pub fn query_path_preview_for_player(
        &self,
        player: PlayerId,
        unit_id: UnitId,
        destination: Hex,
    ) -> PathPreview {
        let Some(unit) = self.state.units.get(unit_id) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: Hex { q: 0, r: 0 },
                stop_reason: None,
            };
        };
        if unit.owner != player {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }
        let Some(start_index) = self.state.map.index_of(unit.position) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };

        let Some(destination) = self.state.map.normalize_hex(destination) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };
        let Some(goal_index) = self.state.map.index_of(destination) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };
        if start_index == goal_index {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let player_index = player.0 as usize;
        let Some(vis) = self.state.visibility.get(player_index) else {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        };
        let explored = vis.explored();
        let visible = vis.visible();

        if !explored.get(goal_index).copied().unwrap_or(false) {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let occupancy = unit_occupancy_visible_to_player(&self.state.map, &self.state.units, player, visible);
        if occupancy.get(goal_index).copied().flatten().is_some() {
            return PathPreview {
                full_path: Vec::new(),
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let zoc = enemy_zoc_visible_to_player(
            &self.state.map,
            &self.state.rules,
            &self.state.units,
            player,
            visible,
        );

        let full_path = best_path_to_destination_restricted(
            &self.state.map,
            &self.state.rules,
            start_index,
            goal_index,
            unit.moves_left.max(0),
            &occupancy,
            &zoc,
            explored,
        )
        .into_iter()
        .filter_map(|idx| self.state.map.hex_at_index(idx))
        .collect::<Vec<_>>();

        if full_path.is_empty() {
            return PathPreview {
                full_path,
                this_turn_path: Vec::new(),
                stop_at: unit.position,
                stop_reason: None,
            };
        }

        let mut occupancy = occupancy;
        let mut cursor = unit.position;
        let mut cursor_index = start_index;
        let mut moves_left = unit.moves_left;
        let mut this_turn_path = Vec::new();
        let mut stop_reason = None;

        for &raw_step in &full_path {
            let Some(step) = self.state.map.normalize_hex(raw_step) else {
                break;
            };
            if step == cursor {
                continue;
            }
            if !self.state.map.is_neighbor(cursor, step) {
                break;
            }
            let Some(step_index) = self.state.map.index_of(step) else {
                break;
            };
            let Some(cost) = movement_cost_to_enter(&self.state.map, &self.state.rules, step_index)
            else {
                break;
            };
            if moves_left < cost {
                stop_reason = Some(MovementStopReason::MovesExhausted);
                break;
            }
            if occupancy.get(step_index).copied().flatten().is_some() {
                stop_reason = Some(MovementStopReason::Blocked { attempted: step });
                break;
            }

            moves_left -= cost;
            cursor = step;
            occupancy[cursor_index] = None;
            occupancy[step_index] = Some(unit_id);
            cursor_index = step_index;
            this_turn_path.push(step);

            if zoc.get(step_index).copied().unwrap_or(false) {
                stop_reason = Some(MovementStopReason::EnteredEnemyZoc);
                break;
            }
        }

        PathPreview {
            full_path,
            this_turn_path,
            stop_at: cursor,
            stop_reason,
        }
    }

    pub fn query_enemy_zoc(&self, player: PlayerId) -> Vec<Hex> {
        let zoc = enemy_zoc(
            &self.state.map,
            &self.state.rules,
            &self.state.units,
            player,
        );
        zoc.into_iter()
            .enumerate()
            .filter_map(|(index, in_zoc)| in_zoc.then_some(index))
            .filter_map(|index| self.state.map.hex_at_index(index))
            .collect()
    }

    pub fn query_visible_tiles(&self, player: PlayerId) -> Vec<Hex> {
        let player_index = player.0 as usize;
        let Some(vis) = self.state.visibility.get(player_index) else {
            return Vec::new();
        };
        vis.visible
            .iter()
            .enumerate()
            .filter_map(|(index, &is_visible)| is_visible.then_some(index))
            .filter_map(|index| self.state.map.hex_at_index(index))
            .collect()
    }

    /// Compute "promise strip" items for a player: imminent completions and rewards.
    pub fn query_promise_strip(&self, player: PlayerId) -> Vec<TurnPromise> {
        let rules = &self.state.rules;
        let Some(p) = self.state.players.get(player.0 as usize) else {
            return Vec::new();
        };

        let mut promises = Vec::new();

        if p.available_policy_picks > 0 {
            promises.push(TurnPromise::PolicyPickAvailable {
                player,
                picks: p.available_policy_picks,
            });
        }

        if p.researching.is_none() && p.known_techs.iter().any(|&k| !k) {
            promises.push(TurnPromise::TechPickRequired { player });
        }

        let mut science_income = 0i32;
        let mut culture_income = 0i32;

        for (city_id, city) in self.state.cities.iter_ordered() {
            if city.owner != player {
                continue;
            }

            let yields = city.yields(&self.state.map, rules, p);
            science_income = science_income.saturating_add(yields.science);
            culture_income = culture_income.saturating_add(yields.culture);

            if city.producing.is_none() {
                promises.push(TurnPromise::CityProductionPickRequired { city: city_id });
            }

            // Growth.
            let food_consumption = city.population as i32 * 2;
            let food_surplus = yields.food - food_consumption;
            if let Some(turns) = city.turns_to_growth(food_surplus) {
                promises.push(TurnPromise::CityGrowth {
                    city: city_id,
                    turns,
                });
            }

            // Production.
            if let Some(item) = city.producing.clone() {
                let (cost, per_turn) = match item {
                    ProductionItem::Unit(unit_type) => {
                        (rules.unit_type(unit_type).cost, yields.production)
                    }
                    ProductionItem::Building(building_id) => {
                        (rules.building(building_id).cost, yields.production)
                    }
                };

                if per_turn > 0 {
                    let needed = (cost - city.production_stockpile).max(0);
                    let turns = ceil_div_i32(needed, per_turn);
                    promises.push(TurnPromise::CityProduction {
                        city: city_id,
                        item,
                        turns,
                    });
                }
            }

            // Border expansion.
            if yields.culture > 0 {
                let cost = 20 + (city.claimed_tiles.len() as i32).saturating_mul(5);
                let needed = (cost - city.border_progress).max(0);
                let turns = ceil_div_i32(needed, yields.culture);
                promises.push(TurnPromise::BorderExpansion {
                    city: city_id,
                    turns,
                });
            }
        }

        // Trade bonus culture (external routes owned by player).
        for (_route_id, route) in self.state.trade_routes.iter_ordered() {
            if route.owner != player {
                continue;
            }
            let Some(to_city) = self.state.cities.get(route.to) else {
                continue;
            };
            if to_city.owner != player && !self.state.diplomacy.is_at_war(player, to_city.owner) {
                culture_income = culture_income.saturating_add(1);
            }
        }

        // Research completion.
        if let Some(tech) = p.researching {
            let required = rules
                .techs
                .get(tech.raw as usize)
                .map(|t| t.cost)
                .unwrap_or(0);
            let remaining = (required - p.research_progress).max(0);
            if science_income > 0 {
                let turns = ceil_div_i32(remaining, science_income);
                promises.push(TurnPromise::ResearchComplete {
                    player,
                    tech,
                    turns,
                });
            }
        }

        // Culture milestone.
        let next_cost = 30 + (p.culture_milestones_reached as i32).saturating_mul(15);
        let remaining = (next_cost - p.culture).max(0);
        if culture_income > 0 {
            let turns = ceil_div_i32(remaining, culture_income);
            promises.push(TurnPromise::CultureMilestone { player, turns });
        }

        // Worker tasks + idle worker warnings.
        for (unit_id, unit) in self.state.units.iter_ordered() {
            if unit.owner != player {
                continue;
            }
            if !rules.unit_type(unit.type_id).is_worker {
                continue;
            }

            let Some(orders) = unit.orders.as_ref() else {
                if unit.moves_left > 0 && !unit.automated {
                    let (recommendation, recommendation_turns) = self
                        .recommend_worker_task_at(player, unit.position)
                        .map(|(kind, turns)| (Some(kind), Some(turns)))
                        .unwrap_or((None, None));

                    promises.push(TurnPromise::IdleWorker {
                        unit: unit_id,
                        at: unit.position,
                        recommendation,
                        recommendation_turns,
                    });
                }
                continue;
            };

            match orders {
                UnitOrders::BuildImprovement {
                    improvement,
                    at,
                    turns_remaining,
                } => {
                    let impr = rules.improvements.get(improvement.raw as usize);
                    let default_turns = impr.map(|i| i.build_time).unwrap_or(1);
                    promises.push(TurnPromise::WorkerTask {
                        unit: unit_id,
                        at: at.unwrap_or(unit.position),
                        kind: WorkerTaskKind::Build {
                            improvement: *improvement,
                        },
                        turns: turns_remaining.unwrap_or(default_turns),
                    });
                }
                UnitOrders::RepairImprovement {
                    at,
                    turns_remaining,
                } => {
                    promises.push(TurnPromise::WorkerTask {
                        unit: unit_id,
                        at: at.unwrap_or(unit.position),
                        kind: WorkerTaskKind::Repair,
                        turns: turns_remaining.unwrap_or(1),
                    });
                }
                _ => {}
            }
        }

        promises.sort_by_key(promise_sort_key);
        promises
    }

    pub fn query_city_ui(&self, city_id: CityId) -> Option<CityUi> {
        let city = self.state.cities.get(city_id)?;
        let owner = city.owner;
        let player_index = owner.0 as usize;
        let player = self
            .state
            .players
            .get(player_index)
            .unwrap_or(&self.state.players[0]);

        let yields = city.yields(&self.state.map, &self.state.rules, player);
        let worked_tiles = city.compute_worked_tiles(&self.state.map, &self.state.rules);

        let food_consumption = city.population as i32 * 2;
        let food_surplus = yields.food.saturating_sub(food_consumption);
        let food_needed = city.food_for_growth();
        let turns_to_growth = city.turns_to_growth(food_surplus);

        let production_per_turn = yields.production;
        let producing_cost = match city.producing {
            None => None,
            Some(ProductionItem::Unit(id)) => Some(self.state.rules.unit_type(id).cost),
            Some(ProductionItem::Building(id)) => Some(self.state.rules.building(id).cost),
        };

        let turns_to_complete = match (producing_cost, production_per_turn) {
            (Some(cost), per_turn) if per_turn > 0 => {
                let remaining = cost.saturating_sub(city.production_stockpile);
                if remaining <= 0 {
                    Some(0)
                } else {
                    Some((remaining + per_turn - 1) / per_turn)
                }
            }
            _ => None,
        };

        Some(CityUi {
            id: city_id,
            name: city.name.clone(),
            owner,
            pos: city.position,
            population: city.population,
            yields: UiYields {
                food: yields.food,
                production: yields.production,
                gold: yields.gold,
                science: yields.science,
                culture: yields.culture,
            },
            worked_tiles,
            food_stockpile: city.food_stockpile,
            food_needed,
            food_consumption,
            food_surplus,
            turns_to_growth,
            production_stockpile: city.production_stockpile,
            production_per_turn,
            producing: city.producing.clone(),
            turns_to_complete,
        })
    }

    /// Query detailed tile information for UI display.
    ///
    /// Returns tile details including terrain, improvement, yields, and maturation progress.
    pub fn query_tile_ui(&self, hex: Hex) -> Option<TileUi> {
        crate::tile_info::build_tile_ui(hex, &self.state.map, &self.state.rules)
    }

    pub fn query_production_options(&self, city_id: CityId) -> Vec<UiProductionOption> {
        let Some(city) = self.state.cities.get(city_id) else {
            return Vec::new();
        };
        if city.owner != self.state.current_player {
            return Vec::new();
        }

        let player_index = self.state.current_player.0 as usize;
        let player = self
            .state
            .players
            .get(player_index)
            .unwrap_or(&self.state.players[0]);

        let mut out = Vec::new();

        for (raw, u) in self.state.rules.unit_types.iter().enumerate() {
            let id = backbay_protocol::UnitTypeId::new(raw as u16);
            let ok = match u.tech_required {
                None => true,
                Some(req) => player
                    .known_techs
                    .get(req.raw as usize)
                    .copied()
                    .unwrap_or(false),
            };
            if !ok {
                continue;
            }
            out.push(UiProductionOption {
                item: ProductionItem::Unit(id),
            });
        }

        for (raw, b) in self.state.rules.buildings.iter().enumerate() {
            let id = backbay_protocol::BuildingId::new(raw as u16);
            if city.buildings.contains(&id) {
                continue;
            }
            let ok = match b.tech_required {
                None => true,
                Some(req) => player
                    .known_techs
                    .get(req.raw as usize)
                    .copied()
                    .unwrap_or(false),
            };
            if !ok {
                continue;
            }
            out.push(UiProductionOption {
                item: ProductionItem::Building(id),
            });
        }

        out
    }

    pub fn query_tech_options(&self, player_id: PlayerId) -> Vec<UiTechOption> {
        let player_index = player_id.0 as usize;
        let player = match self.state.players.get(player_index) {
            Some(p) => p,
            None => return Vec::new(),
        };

        let mut out = Vec::new();

        for (raw, tech) in self.state.rules.techs.iter().enumerate() {
            let id = backbay_protocol::TechId::new(raw as u16);
            if player.known_techs.get(raw).copied().unwrap_or(false) {
                continue;
            }
            let prereqs_met = tech.prerequisites.iter().all(|prereq| {
                player
                    .known_techs
                    .get(prereq.raw as usize)
                    .copied()
                    .unwrap_or(false)
            });
            if !prereqs_met {
                continue;
            }
            out.push(UiTechOption {
                id,
                name: tech.name.clone(),
                cost: tech.cost,
                era: tech.era.index(),
                prerequisites: tech.prerequisites.clone(),
            });
        }

        out
    }

    fn recommend_worker_task_at(&self, owner: PlayerId, pos: Hex) -> Option<(WorkerTaskKind, u8)> {
        let rules = &self.state.rules;
        let tile = self.state.map.get(pos)?;
        if tile.city.is_some() {
            return None;
        }
        if tile.owner != Some(owner) {
            return None;
        }

        if let Some(improvement) = tile.improvement.as_ref() {
            if improvement.pillaged {
                let repair_time = rules.improvement(improvement.id).repair_time;
                return Some((WorkerTaskKind::Repair, repair_time.max(1)));
            }
            return None;
        }

        // No improvement present: pick the best-yielding one at tier 1.
        const FOOD_W: i32 = 3;
        const PROD_W: i32 = 2;
        const GOLD_W: i32 = 1;
        const SCI_W: i32 = 2;
        const CULT_W: i32 = 2;

        let mut best: Option<(i32, backbay_protocol::ImprovementId, u8)> = None;
        for (idx, impr) in rules.improvements.iter().enumerate() {
            if !impr.allowed_terrain.is_empty() && !impr.allowed_terrain.contains(&tile.terrain) {
                continue;
            }
            let yields = &impr.tier(1).yields;
            let score = yields.food * FOOD_W
                + yields.production * PROD_W
                + yields.gold * GOLD_W
                + yields.science * SCI_W
                + yields.culture * CULT_W;
            let improvement_id = backbay_protocol::ImprovementId::new(idx as u16);
            let build_time = impr.build_time.max(1);

            match best {
                None => best = Some((score, improvement_id, build_time)),
                Some((best_score, best_id, _best_time)) => {
                    let better = score > best_score
                        || (score == best_score && improvement_id.raw < best_id.raw);
                    if better {
                        best = Some((score, improvement_id, build_time));
                    }
                }
            }
        }

        let (_score, improvement_id, turns) = best?;
        Some((
            WorkerTaskKind::Build {
                improvement: improvement_id,
            },
            turns,
        ))
    }

    /// Find the best worker target within a given search radius.
    /// Returns (target_hex, task_kind, build_turns) if work is found.
    fn find_best_worker_target(
        &self,
        owner: PlayerId,
        start: Hex,
        search_radius: i32,
    ) -> Option<(Hex, WorkerTaskKind, u8)> {
        let rules = &self.state.rules;

        // Score weights for prioritizing improvements
        const FOOD_W: i32 = 3;
        const PROD_W: i32 = 2;
        const GOLD_W: i32 = 1;
        const SCI_W: i32 = 2;
        const CULT_W: i32 = 2;

        // Use BFS to find all tiles within radius, tracking distance
        let Some(start_index) = self.state.map.index_of(start) else {
            return None;
        };

        let mut dist = vec![i32::MAX; self.state.map.len()];
        dist[start_index] = 0;

        let mut queue = std::collections::VecDeque::new();
        queue.push_back(start_index);

        while let Some(index) = queue.pop_front() {
            let d = dist[index];
            if d >= search_radius {
                continue;
            }
            for neighbor in self.state.map.neighbors_indices(index).into_iter().flatten() {
                if dist[neighbor] <= d + 1 {
                    continue;
                }
                // Check if passable for workers (land units can't cross ocean/mountains)
                if let Some(tile) = self.state.map.tiles().get(neighbor) {
                    let terrain = rules.terrain(tile.terrain);
                    if terrain.impassable {
                        continue;
                    }
                }
                dist[neighbor] = d + 1;
                queue.push_back(neighbor);
            }
        }

        // Find best target among reachable tiles
        let mut best: Option<(i32, i32, Hex, WorkerTaskKind, u8)> = None; // (score, -distance, hex, task, turns)

        for (index, &d) in dist.iter().enumerate() {
            if d > search_radius || d == i32::MAX {
                continue;
            }
            let Some(hex) = self.state.map.hex_at_index(index) else {
                continue;
            };
            let Some(tile) = self.state.map.tiles().get(index) else {
                continue;
            };

            // Must be owned by this player
            if tile.owner != Some(owner) {
                continue;
            }
            // Can't build on city tiles
            if tile.city.is_some() {
                continue;
            }

            // Check for repair opportunity (pillaged improvements)
            if let Some(imp) = tile.improvement.as_ref() {
                if imp.pillaged {
                    let repair_time = rules.improvement(imp.id).repair_time;
                    let score = 100; // High priority for repairs
                    let neg_dist = -d;
                    if best.is_none()
                        || (score, neg_dist) > (best.as_ref().unwrap().0, best.as_ref().unwrap().1)
                    {
                        best = Some((
                            score,
                            neg_dist,
                            hex,
                            WorkerTaskKind::Repair,
                            repair_time.max(1),
                        ));
                    }
                }
                continue; // Already has non-pillaged improvement
            }

            // Find best improvement to build here
            for (idx, impr) in rules.improvements.iter().enumerate() {
                if !impr.allowed_terrain.is_empty()
                    && !impr.allowed_terrain.contains(&tile.terrain)
                {
                    continue;
                }
                let yields = &impr.tier(1).yields;
                let score = yields.food * FOOD_W
                    + yields.production * PROD_W
                    + yields.gold * GOLD_W
                    + yields.science * SCI_W
                    + yields.culture * CULT_W;
                let improvement_id = backbay_protocol::ImprovementId::new(idx as u16);
                let build_time = impr.build_time.max(1);
                let neg_dist = -d; // Prefer closer tiles

                let dominated = best.as_ref().is_some_and(|(best_score, best_neg_dist, _, _, _)| {
                    (score, neg_dist) <= (*best_score, *best_neg_dist)
                });

                if !dominated {
                    best = Some((
                        score,
                        neg_dist,
                        hex,
                        WorkerTaskKind::Build {
                            improvement: improvement_id,
                        },
                        build_time,
                    ));
                }
            }
        }

        best.map(|(_, _, hex, task, turns)| (hex, task, turns))
    }

    /// Compute a simple BFS path from start to goal.
    /// Returns None if no path exists or goal is unreachable.
    fn compute_worker_path(&self, start: Hex, goal: Hex) -> Option<Vec<Hex>> {
        let Some(start_index) = self.state.map.index_of(start) else {
            return None;
        };
        let Some(goal_index) = self.state.map.index_of(goal) else {
            return None;
        };
        if start_index == goal_index {
            return Some(Vec::new());
        }

        let rules = &self.state.rules;

        // BFS with parent tracking
        let mut parent: Vec<Option<usize>> = vec![None; self.state.map.len()];
        let mut visited = vec![false; self.state.map.len()];
        visited[start_index] = true;

        let mut queue = std::collections::VecDeque::new();
        queue.push_back(start_index);

        while let Some(current) = queue.pop_front() {
            if current == goal_index {
                break;
            }
            for neighbor in self
                .state
                .map
                .neighbors_indices(current)
                .into_iter()
                .flatten()
            {
                if visited[neighbor] {
                    continue;
                }
                // Check passability
                if let Some(tile) = self.state.map.tiles().get(neighbor) {
                    let terrain = rules.terrain(tile.terrain);
                    if terrain.impassable {
                        continue;
                    }
                }
                visited[neighbor] = true;
                parent[neighbor] = Some(current);
                queue.push_back(neighbor);
            }
        }

        // Reconstruct path
        if !visited[goal_index] {
            return None; // Goal unreachable
        }

        let mut path = Vec::new();
        let mut current = goal_index;
        while current != start_index {
            if let Some(hex) = self.state.map.hex_at_index(current) {
                path.push(hex);
            }
            current = parent[current]?;
        }
        path.reverse();
        Some(path)
    }

    fn compute_visible_tiles(&self, player: PlayerId) -> Vec<bool> {
        let mut visible = vec![false; self.state.map.len()];

        for (_unit_id, unit) in self.state.units.iter_ordered() {
            if unit.owner != player {
                continue;
            }
            for index in self
                .state
                .map
                .indices_in_radius(unit.position, UNIT_VISION_RADIUS)
            {
                if let Some(slot) = visible.get_mut(index) {
                    *slot = true;
                }
            }
        }

        for (_city_id, city) in self.state.cities.iter_ordered() {
            if city.owner != player {
                continue;
            }
            for index in self
                .state
                .map
                .indices_in_radius(city.position, CITY_VISION_RADIUS)
            {
                if let Some(slot) = visible.get_mut(index) {
                    *slot = true;
                }
            }
        }

        visible
    }

    fn update_visibility_for_player(&mut self, player: PlayerId) -> Vec<Event> {
        let map = &self.state.map;
        let tiles = self.state.map.tiles();

        let new_visible = self.compute_visible_tiles(player);

        let player_index = player.0 as usize;
        let Some(vis) = self.state.visibility.get_mut(player_index) else {
            return Vec::new();
        };
        if new_visible.len() != vis.visible.len() {
            return Vec::new();
        }

        let mut events = Vec::new();
        for (index, &now_visible) in new_visible.iter().enumerate() {
            let was_visible = vis.visible[index];

            if now_visible {
                vis.explored[index] = true;
            }

            if now_visible && !was_visible {
                if let Some(hex) = map.hex_at_index(index) {
                    let terrain = tiles[index].terrain;
                    events.push(Event::TileRevealed { hex, terrain });
                }
            } else if !now_visible && was_visible {
                if let Some(hex) = map.hex_at_index(index) {
                    events.push(Event::TileHidden { hex });
                }
            }

            vis.visible[index] = now_visible;
        }

        events
    }

    fn move_unit(&mut self, unit_id: UnitId, path: Vec<Hex>) -> Result<Vec<Event>, GameError> {
        let unit = self
            .state
            .units
            .get(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        if unit.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }

        if path.is_empty() {
            return Ok(Vec::new());
        }

        let mut occupancy = unit_occupancy(&self.state.map, &self.state.units);
        let zoc = enemy_zoc(
            &self.state.map,
            &self.state.rules,
            &self.state.units,
            unit.owner,
        );

        // Validate adjacency + passability deterministically (do not fail on occupancy; it can change).
        let mut cursor = unit.position;
        for &raw_step in &path {
            let step = self
                .state
                .map
                .normalize_hex(raw_step)
                .ok_or(GameError::InvalidPath)?;
            if step == cursor {
                continue;
            }
            if !self.state.map.is_neighbor(cursor, step) {
                return Err(GameError::InvalidPath);
            }
            let step_index = self
                .state
                .map
                .index_of(step)
                .ok_or(GameError::InvalidPath)?;
            if movement_cost_to_enter(&self.state.map, &self.state.rules, step_index).is_none() {
                return Err(GameError::InvalidPath);
            }
            cursor = step;
        }

        let mut moved = Vec::new();
        let mut stop_reason: Option<MovementStopReason> = None;

        let (final_pos, moves_left) = {
            let unit = self
                .state
                .units
                .get_mut(unit_id)
                .ok_or(GameError::UnknownUnit)?;

            let mut cursor = unit.position;
            let Some(mut cursor_index) = self.state.map.index_of(cursor) else {
                return Err(GameError::InvalidPath);
            };
            for raw_step in path {
                let Some(step) = self.state.map.normalize_hex(raw_step) else {
                    break;
                };
                if step == cursor {
                    continue;
                }
                if !self.state.map.is_neighbor(cursor, step) {
                    break;
                }
                let Some(step_index) = self.state.map.index_of(step) else {
                    break;
                };
                let Some(cost) =
                    movement_cost_to_enter(&self.state.map, &self.state.rules, step_index)
                else {
                    break;
                };
                if unit.moves_left < cost {
                    break;
                }
                if occupancy.get(step_index).copied().flatten().is_some() {
                    stop_reason = Some(MovementStopReason::Blocked { attempted: step });
                    break;
                }

                unit.moves_left -= cost;
                unit.position = step;
                cursor = step;
                occupancy[cursor_index] = None;
                occupancy[step_index] = Some(unit_id);
                cursor_index = step_index;
                moved.push(step);

                // Entering enemy ZOC ends movement for this action.
                if zoc.get(step_index).copied().unwrap_or(false) {
                    unit.moves_left = 0;
                    stop_reason = Some(MovementStopReason::EnteredEnemyZoc);
                    break;
                }
            }

            if moved.is_empty() && stop_reason.is_none() {
                return Ok(Vec::new());
            }

            unit.fortified_turns = 0;
            unit.orders = None;
            (unit.position, unit.moves_left)
        };

        let mut events = Vec::new();
        if !moved.is_empty() {
            events.push(Event::UnitMoved {
                unit: unit_id,
                path: moved,
                moves_left,
            });
        }
        if let Some(reason) = stop_reason {
            events.push(Event::MovementStopped {
                unit: unit_id,
                at: final_pos,
                reason,
            });
        }

        if let Some(unit) = self.state.units.get(unit_id) {
            events.push(Event::UnitUpdated {
                unit: UnitSnapshot {
                    id: unit_id,
                    type_id: unit.type_id,
                    owner: unit.owner,
                    pos: unit.position,
                    hp: unit.hp,
                    moves_left: unit.moves_left,
                    veteran_level: unit.veteran_level(),
                    orders: unit.orders.clone(),
                    automated: unit.automated,
                },
            });
        }

        events.extend(self.update_visibility_for_player(self.state.current_player));

        Ok(events)
    }

    fn attack_unit(
        &mut self,
        attacker_id: UnitId,
        target_id: UnitId,
    ) -> Result<Vec<Event>, GameError> {
        let (attacker_owner, attacker_pos) = {
            let attacker = self
                .state
                .units
                .get(attacker_id)
                .ok_or(GameError::UnknownUnit)?;
            (attacker.owner, attacker.position)
        };
        if attacker_owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }
        let (target_owner, target_pos) = {
            let target = self
                .state
                .units
                .get(target_id)
                .ok_or(GameError::UnknownUnit)?;
            (target.owner, target.position)
        };
        if !self.state.map.is_neighbor(attacker_pos, target_pos) {
            return Ok(Vec::new());
        }

        let mut events = Vec::new();

        // Attacking someone implicitly declares war (keeps the main loop playable without a UI).
        if attacker_owner != target_owner
            && !self.state.diplomacy.is_at_war(attacker_owner, target_owner)
        {
            if let Ok(mut war_events) = self.declare_war(target_owner) {
                events.append(&mut war_events);
            }
        }

        events.push(Event::CombatStarted {
            attacker: attacker_id,
            defender: target_id,
        });

        let (attacker_hp, defender_hp, result) = {
            let (attacker, defender) = self
                .state
                .units
                .get2_mut(attacker_id, target_id)
                .ok_or(GameError::UnknownUnit)?;
            let result = resolve_combat(
                attacker,
                defender,
                &self.state.map,
                &self.state.rules,
                &mut self.state.rng,
            );
            (attacker.hp, defender.hp, result)
        };

        events.push(Event::CombatRound {
            attacker_hp,
            defender_hp,
        });

        match result {
            CombatResult::AttackerWins { .. } => {
                events.push(Event::UnitDamaged {
                    unit: attacker_id,
                    new_hp: attacker_hp,
                    source: backbay_protocol::DamageSource::Combat { attacker: target_id },
                });
                let _ = self.state.units.remove(target_id);
                events.push(Event::UnitDied {
                    unit: target_id,
                    killer: Some(attacker_id),
                });
                events.push(Event::CombatEnded {
                    winner: attacker_id,
                    loser: target_id,
                    at: target_pos,
                    attacker_owner,
                    defender_owner: target_owner,
                });
            }
            CombatResult::DefenderWins { .. } => {
                events.push(Event::UnitDamaged {
                    unit: target_id,
                    new_hp: defender_hp,
                    source: backbay_protocol::DamageSource::Combat {
                        attacker: attacker_id,
                    },
                });
                let _ = self.state.units.remove(attacker_id);
                events.push(Event::UnitDied {
                    unit: attacker_id,
                    killer: Some(target_id),
                });
                events.push(Event::CombatEnded {
                    winner: target_id,
                    loser: attacker_id,
                    at: target_pos,
                    attacker_owner,
                    defender_owner: target_owner,
                });
            }
        }

        // War weariness from combat.
        if let Some(p) = self.state.players.get_mut(attacker_owner.0 as usize) {
            p.war_weariness = p.war_weariness.saturating_add(2);
        }
        if let Some(p) = self.state.players.get_mut(target_owner.0 as usize) {
            p.war_weariness = p.war_weariness.saturating_add(2);
        }

        events.extend(self.update_visibility_for_player(self.state.current_player));

        Ok(events)
    }

    fn found_city(&mut self, settler_id: UnitId, name: String) -> Result<Vec<Event>, GameError> {
        let settler = self
            .state
            .units
            .get(settler_id)
            .ok_or(GameError::UnknownUnit)?;
        if settler.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }
        if !self.state.rules.unit_type(settler.type_id).can_found_city {
            return Err(GameError::CannotFoundCity);
        }
        let pos = settler.position;

        if self.state.map.get(pos).and_then(|t| t.city).is_some() {
            return Err(GameError::CannotFoundCity);
        }

        let _ = self
            .state
            .units
            .remove(settler_id)
            .ok_or(GameError::UnknownUnit)?;
        let city = City::new(name.clone(), pos, self.state.current_player);
        let city_id = self.state.cities.insert(city);

        // Initial borders: claim radius 1 (center + 6 neighbors) so the city can work tiles.
        let mut newly_claimed = Vec::new();
        for index in self.state.map.indices_in_radius(pos, 1) {
            let Some(hex) = self.state.map.hex_at_index(index) else {
                continue;
            };

            let was_unowned = {
                let Some(tile) = self.state.map.get_mut(hex) else {
                    continue;
                };
                if tile.owner.is_some() && tile.owner != Some(self.state.current_player) {
                    continue;
                }
                let was_unowned = tile.owner.is_none();
                tile.owner = Some(self.state.current_player);
                if hex == pos {
                    tile.city = Some(city_id);
                }
                was_unowned
            };

            if let Some(city) = self.state.cities.get_mut(city_id) {
                city.claim_tile_index(index);
            }

            if was_unowned && hex != pos {
                newly_claimed.push(hex);
            }
        }

        let mut events = vec![
            Event::UnitDied {
                unit: settler_id,
                killer: None,
            },
            Event::CityFounded {
                city: city_id,
                name,
                pos,
                owner: self.state.current_player,
            },
        ];

        if !newly_claimed.is_empty() {
            events.push(Event::BordersExpanded {
                city: city_id,
                new_tiles: newly_claimed,
            });
        }

        events.extend(self.update_visibility_for_player(self.state.current_player));

        Ok(events)
    }

    fn set_orders(&mut self, unit_id: UnitId, orders: UnitOrders) -> Result<Vec<Event>, GameError> {
        let unit = self
            .state
            .units
            .get(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        if unit.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }

        match orders {
            UnitOrders::Goto { path } => {
                let mut occupancy = unit_occupancy(&self.state.map, &self.state.units);
                let zoc = enemy_zoc(
                    &self.state.map,
                    &self.state.rules,
                    &self.state.units,
                    unit.owner,
                );

                Ok(self.execute_goto_orders(unit_id, path, &mut occupancy, &zoc))
            }
            UnitOrders::BuildImprovement { improvement, .. } => {
                if !self.state.rules.unit_type(unit.type_id).is_worker {
                    return Err(GameError::NotAWorker);
                }

                let Some(impr) = self.state.rules.improvements.get(improvement.raw as usize) else {
                    return Err(GameError::UnknownImprovement);
                };

                let pos = unit.position;
                let Some(tile) = self.state.map.get(pos) else {
                    return Err(GameError::CannotBuildImprovementHere);
                };
                if tile.city.is_some() {
                    return Err(GameError::CannotBuildImprovementHere);
                }
                if tile.owner != Some(unit.owner) {
                    return Err(GameError::CannotBuildImprovementHere);
                }
                if !impr.allowed_terrain.is_empty() && !impr.allowed_terrain.contains(&tile.terrain)
                {
                    return Err(GameError::CannotBuildImprovementHere);
                }

                let unit = self
                    .state
                    .units
                    .get_mut(unit_id)
                    .ok_or(GameError::UnknownUnit)?;
                unit.orders = Some(UnitOrders::BuildImprovement {
                    improvement,
                    at: Some(pos),
                    turns_remaining: Some(impr.build_time),
                });
                unit.moves_left = 0;
                Ok(vec![Event::UnitUpdated {
                    unit: UnitSnapshot {
                        id: unit_id,
                        type_id: unit.type_id,
                        owner: unit.owner,
                        pos: unit.position,
                        hp: unit.hp,
                        moves_left: unit.moves_left,
                        veteran_level: unit.veteran_level(),
                        orders: unit.orders.clone(),
                        automated: unit.automated,
                    },
                }])
            }
            UnitOrders::RepairImprovement { .. } => {
                if !self.state.rules.unit_type(unit.type_id).is_worker {
                    return Err(GameError::NotAWorker);
                }

                let pos = unit.position;
                let Some(tile) = self.state.map.get(pos) else {
                    return Err(GameError::NoImprovementToRepair);
                };
                if tile.owner != Some(unit.owner) || tile.city.is_some() {
                    return Err(GameError::NoImprovementToRepair);
                }
                let Some(improvement) = tile.improvement.as_ref() else {
                    return Err(GameError::NoImprovementToRepair);
                };
                if !improvement.pillaged {
                    return Err(GameError::NoImprovementToRepair);
                }

                let repair_time = self.state.rules.improvement(improvement.id).repair_time;

                let unit = self
                    .state
                    .units
                    .get_mut(unit_id)
                    .ok_or(GameError::UnknownUnit)?;
                unit.orders = Some(UnitOrders::RepairImprovement {
                    at: Some(pos),
                    turns_remaining: Some(repair_time),
                });
                unit.moves_left = 0;
                Ok(vec![Event::UnitUpdated {
                    unit: UnitSnapshot {
                        id: unit_id,
                        type_id: unit.type_id,
                        owner: unit.owner,
                        pos: unit.position,
                        hp: unit.hp,
                        moves_left: unit.moves_left,
                        veteran_level: unit.veteran_level(),
                        orders: unit.orders.clone(),
                        automated: unit.automated,
                    },
                }])
            }
            orders => {
                let unit = self
                    .state
                    .units
                    .get_mut(unit_id)
                    .ok_or(GameError::UnknownUnit)?;
                unit.orders = Some(orders);
                Ok(vec![Event::UnitUpdated {
                    unit: UnitSnapshot {
                        id: unit_id,
                        type_id: unit.type_id,
                        owner: unit.owner,
                        pos: unit.position,
                        hp: unit.hp,
                        moves_left: unit.moves_left,
                        veteran_level: unit.veteran_level(),
                        orders: unit.orders.clone(),
                        automated: unit.automated,
                    },
                }])
            }
        }
    }

    fn cancel_orders(&mut self, unit_id: UnitId) -> Result<Vec<Event>, GameError> {
        let unit = self
            .state
            .units
            .get(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        if unit.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }
        let unit = self
            .state
            .units
            .get_mut(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        unit.orders = None;
        Ok(vec![Event::OrdersCompleted { unit: unit_id }])
    }

    fn set_worker_automation(
        &mut self,
        unit_id: UnitId,
        enabled: bool,
    ) -> Result<Vec<Event>, GameError> {
        let (owner, type_id, pos, has_orders, moves_left) = {
            let unit = self
                .state
                .units
                .get(unit_id)
                .ok_or(GameError::UnknownUnit)?;
            (
                unit.owner,
                unit.type_id,
                unit.position,
                unit.orders.is_some(),
                unit.moves_left,
            )
        };

        if owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }

        if !self.state.rules.unit_type(type_id).is_worker {
            return Err(GameError::NotAWorker);
        }

        if let Some(unit) = self.state.units.get_mut(unit_id) {
            unit.automated = enabled;
        }

        let mut events = Vec::new();
        if enabled && !has_orders && moves_left > 0 {
            if let Some((task, _turns)) = self.recommend_worker_task_at(owner, pos) {
                let orders = match task {
                    WorkerTaskKind::Repair => UnitOrders::RepairImprovement {
                        at: None,
                        turns_remaining: None,
                    },
                    WorkerTaskKind::Build { improvement } => UnitOrders::BuildImprovement {
                        improvement,
                        at: None,
                        turns_remaining: None,
                    },
                };

                if let Ok(mut ev) = self.set_orders(unit_id, orders) {
                    events.append(&mut ev);
                }
            }
        }

        if let Some(unit) = self.state.units.get(unit_id) {
            events.push(Event::UnitUpdated {
                unit: UnitSnapshot {
                    id: unit_id,
                    type_id: unit.type_id,
                    owner: unit.owner,
                    pos: unit.position,
                    hp: unit.hp,
                    moves_left: unit.moves_left,
                    veteran_level: unit.veteran_level(),
                    orders: unit.orders.clone(),
                    automated: unit.automated,
                },
            });
        }

        Ok(events)
    }

    fn set_production(
        &mut self,
        city_id: backbay_protocol::CityId,
        item: ProductionItem,
    ) -> Result<Vec<Event>, GameError> {
        let city = self
            .state
            .cities
            .get(city_id)
            .ok_or(GameError::UnknownCity)?;
        if city.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }

        // Validate tech prerequisites for the item (authoritative simulation).
        let player_idx = self.state.current_player.0 as usize;
        let player = self
            .state
            .players
            .get(player_idx)
            .unwrap_or(&self.state.players[0]);

        match item {
            ProductionItem::Unit(unit_type) => {
                let utype = self.state.rules.unit_type(unit_type);
                if let Some(req) = utype.tech_required {
                    if !player
                        .known_techs
                        .get(req.raw as usize)
                        .copied()
                        .unwrap_or(false)
                    {
                        return Err(GameError::TechPrerequisitesNotMet);
                    }
                }
            }
            ProductionItem::Building(building_id) => {
                let b = self.state.rules.building(building_id);
                if let Some(req) = b.tech_required {
                    if !player
                        .known_techs
                        .get(req.raw as usize)
                        .copied()
                        .unwrap_or(false)
                    {
                        return Err(GameError::TechPrerequisitesNotMet);
                    }
                }
            }
        }

        let city = self
            .state
            .cities
            .get_mut(city_id)
            .ok_or(GameError::UnknownCity)?;
        let event_item = item.clone();
        city.producing = Some(item);
        Ok(vec![Event::CityProductionSet {
            city: city_id,
            item: event_item,
        }])
    }

    fn set_research(&mut self, tech: TechId) -> Result<Vec<Event>, GameError> {
        let tech_index = tech.raw as usize;
        if tech_index >= self.state.rules.techs.len() {
            return Err(GameError::UnknownTechnology);
        }

        let player_index = self.state.current_player.0 as usize;
        let player_index = player_index.min(self.state.players.len().saturating_sub(1));
        let player = &mut self.state.players[player_index];

        if player.known_techs.get(tech_index).copied().unwrap_or(false) {
            return Err(GameError::TechAlreadyResearched);
        }

        let prereqs = &self.state.rules.techs[tech_index].prerequisites;
        let prereqs_met = prereqs.iter().all(|prereq| {
            player
                .known_techs
                .get(prereq.raw as usize)
                .copied()
                .unwrap_or(false)
        });
        if !prereqs_met {
            return Err(GameError::TechPrerequisitesNotMet);
        }

        player.researching = Some(tech);
        player.research_progress = player.research_overflow.max(0);
        player.research_overflow = 0;

        let required = self.state.rules.techs[tech_index].cost.max(1);
        Ok(vec![Event::ResearchProgress {
            player: player.id,
            tech,
            progress: player.research_progress.min(required),
            required,
        }])
    }

    fn adopt_policy(&mut self, policy: PolicyId) -> Result<Vec<Event>, GameError> {
        if policy.raw as usize >= self.state.rules.policies.len() {
            return Err(GameError::UnknownPolicy);
        }

        let player_index = self.state.current_player.0 as usize;
        let player_index = player_index.min(self.state.players.len().saturating_sub(1));
        let player = &mut self.state.players[player_index];

        if player.available_policy_picks == 0 {
            return Err(GameError::NoAvailablePolicyPicks);
        }
        if player.policies.contains(&policy) {
            return Err(GameError::PolicyAlreadyAdopted);
        }

        player.available_policy_picks = player.available_policy_picks.saturating_sub(1);
        player.policies.push(policy);
        player.policies.sort();

        let era_index = player.current_era_index(&self.state.rules);
        if let Some(slot) = player.policy_adopted_era.get_mut(policy.raw as usize) {
            *slot = Some(era_index);
        }

        Ok(vec![Event::PolicyAdopted {
            player: self.state.current_player,
            policy,
        }])
    }

    fn reform_government(&mut self, government: GovernmentId) -> Result<Vec<Event>, GameError> {
        if government.raw as usize >= self.state.rules.governments.len() {
            return Err(GameError::UnknownGovernment);
        }

        let player_index = self.state.current_player.0 as usize;
        let player_index = player_index.min(self.state.players.len().saturating_sub(1));
        let player = &mut self.state.players[player_index];

        if player.government == Some(government) {
            return Ok(Vec::new());
        }

        if player.available_policy_picks == 0 {
            return Err(GameError::NoAvailablePolicyPicks);
        }

        let reform_cost_gold = if player.government.is_some() { 25 } else { 0 };
        if player.gold < reform_cost_gold {
            return Err(GameError::NotEnoughGold);
        }

        let old = player.government;
        player.gold -= reform_cost_gold;
        player.available_policy_picks = player.available_policy_picks.saturating_sub(1);
        player.government = Some(government);

        Ok(vec![Event::GovernmentReformed {
            player: self.state.current_player,
            old,
            new: government,
        }])
    }

    fn fortify(&mut self, unit_id: UnitId) -> Result<Vec<Event>, GameError> {
        let unit = self
            .state
            .units
            .get(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        if unit.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }
        if !self.state.rules.unit_type(unit.type_id).can_fortify {
            return Err(GameError::CannotFortify);
        }
        let unit = self
            .state
            .units
            .get_mut(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        unit.fortified_turns = unit.fortified_turns.max(1);
        unit.orders = Some(UnitOrders::Fortify);
        Ok(vec![Event::UnitUpdated {
            unit: UnitSnapshot {
                id: unit_id,
                type_id: unit.type_id,
                owner: unit.owner,
                pos: unit.position,
                hp: unit.hp,
                moves_left: unit.moves_left,
                veteran_level: unit.veteran_level(),
                orders: unit.orders.clone(),
                automated: unit.automated,
            },
        }])
    }

    fn pillage_improvement(&mut self, unit_id: UnitId) -> Result<Vec<Event>, GameError> {
        let unit = self
            .state
            .units
            .get(unit_id)
            .ok_or(GameError::UnknownUnit)?;
        if unit.owner != self.state.current_player {
            return Err(GameError::NotYourUnit);
        }
        if !unit_exerts_zoc(&self.state.rules, unit) {
            return Err(GameError::NoImprovementToPillage);
        }

        let pos = unit.position;
        let Some(tile) = self.state.map.get_mut(pos) else {
            return Err(GameError::NoImprovementToPillage);
        };
        if tile.owner == Some(unit.owner) {
            return Err(GameError::CannotPillageFriendlyImprovement);
        }

        let Some(improvement) = tile.improvement.as_mut() else {
            return Err(GameError::NoImprovementToPillage);
        };
        if improvement.pillaged {
            return Err(GameError::NoImprovementToPillage);
        }

        improvement.pillaged = true;
        improvement.worked_turns = 0;
        improvement.tier = improvement.tier.saturating_sub(1).max(1);

        let improvement_id = improvement.id;
        let new_tier = improvement.tier;

        if let Some(player) = self.state.players.get_mut(unit.owner.0 as usize) {
            player.gold = player.gold.saturating_add(10);
        }

        Ok(vec![Event::ImprovementPillaged {
            hex: pos,
            improvement: improvement_id,
            new_tier,
        }])
    }

    fn establish_trade_route(&mut self, from: CityId, to: CityId) -> Result<Vec<Event>, GameError> {
        let owner = self.state.current_player;

        let from_city = self.state.cities.get(from).ok_or(GameError::UnknownCity)?;
        if from_city.owner != owner {
            return Err(GameError::NotYourUnit);
        }

        let to_city = self.state.cities.get(to).ok_or(GameError::UnknownCity)?;
        if from == to {
            return Err(GameError::CannotTradeWithSelf);
        }

        let is_external = to_city.owner != owner;
        if is_external && self.state.diplomacy.is_at_war(owner, to_city.owner) {
            return Err(GameError::CannotTradeWithSelf);
        }

        let capacity = self.trade_route_capacity(owner);
        let used = self.trade_routes_used(owner);
        if used >= capacity {
            return Err(GameError::TradeRouteCapacityExceeded);
        }

        let Some(start) = self.state.map.index_of(from_city.position) else {
            return Err(GameError::InvalidPath);
        };
        let Some(goal) = self.state.map.index_of(to_city.position) else {
            return Err(GameError::InvalidPath);
        };
        if start == goal {
            return Err(GameError::CannotTradeWithSelf);
        }

        let empty_occupancy = vec![None; self.state.map.len()];
        let indices = shortest_path(
            &self.state.map,
            &self.state.rules,
            start,
            goal,
            &empty_occupancy,
        );
        if indices.is_empty() {
            return Err(GameError::InvalidPath);
        }
        let path = indices
            .into_iter()
            .filter_map(|idx| self.state.map.hex_at_index(idx))
            .collect::<Vec<_>>();

        let route_id = self.state.trade_routes.insert(TradeRoute {
            owner,
            from,
            to,
            path: path.clone(),
        });

        Ok(vec![Event::TradeRouteEstablished {
            route: route_id,
            owner,
            from,
            to,
            path,
            is_external,
        }])
    }

    fn cancel_trade_route(
        &mut self,
        route: backbay_protocol::TradeRouteId,
    ) -> Result<Vec<Event>, GameError> {
        let owner = self.state.current_player;
        let Some(existing) = self.state.trade_routes.get(route) else {
            return Err(GameError::UnknownTradeRoute);
        };
        if existing.owner != owner {
            return Err(GameError::UnknownTradeRoute);
        }
        let _ = self.state.trade_routes.remove(route);
        Ok(Vec::new())
    }

    fn declare_war(&mut self, target: PlayerId) -> Result<Vec<Event>, GameError> {
        let aggressor = self.state.current_player;
        if target == aggressor {
            return Ok(Vec::new());
        }
        if target.0 as usize >= self.state.players.len() {
            return Ok(Vec::new());
        }

        if self.state.diplomacy.is_at_war(aggressor, target) {
            return Ok(Vec::new());
        }

        let mut events = Vec::new();

        // Check for non-aggression pact violation (severe betrayal).
        let has_nap = self.state.diplomacy.has_non_aggression(aggressor, target);
        if has_nap {
            // Cancel the NAP and apply severe betrayal penalty.
            self.state
                .diplomacy
                .adjust_breakdown_component(aggressor, target, "betrayal", -30);
        }

        // Cancel all treaties with the target (and apply betrayal for each).
        let treaties_to_cancel: Vec<TreatyId> = self
            .state
            .diplomacy
            .treaties
            .iter()
            .filter(|t| t.active && t.involves(aggressor) && t.involves(target))
            .map(|t| t.id)
            .collect();
        for tid in treaties_to_cancel {
            if let Some(cancelled) = self.state.diplomacy.cancel_treaty(tid) {
                events.push(Event::TreatyCancelled {
                    treaty: tid,
                    cancelled_by: aggressor,
                    treaty_type: cancelled.treaty_type,
                    other_party: target,
                });
            }
        }

        self.state.diplomacy.set_war(aggressor, target, true);
        self.state
            .diplomacy
            .adjust_breakdown_component(aggressor, target, "war_history", -10);

        // Cancel trade routes between the belligerents.
        let route_ids = self
            .state
            .trade_routes
            .iter_ordered()
            .filter_map(|(id, route)| {
                if route.owner != aggressor && route.owner != target {
                    return None;
                }
                let to_owner = self.state.cities.get(route.to).map(|c| c.owner)?;
                if (route.owner == aggressor && to_owner == target)
                    || (route.owner == target && to_owner == aggressor)
                {
                    Some(id)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        for id in route_ids {
            let _ = self.state.trade_routes.remove(id);
        }

        if let Some(p) = self.state.players.get_mut(aggressor.0 as usize) {
            p.war_weariness = p.war_weariness.saturating_add(2);
        }
        if let Some(p) = self.state.players.get_mut(target.0 as usize) {
            p.war_weariness = p.war_weariness.saturating_add(1);
        }

        let new_rel = self.state.diplomacy.relation(aggressor, target);
        events.push(Event::WarDeclared { aggressor, target });
        events.push(Event::RelationChanged {
            a: aggressor,
            b: target,
            delta: -10,
            new: new_rel,
        });

        // Trigger defensive pacts - allies of target join the war against aggressor.
        let allies = self.state.diplomacy.defensive_pact_allies(target);
        for ally in allies {
            if ally == aggressor {
                continue;
            }
            if self.state.diplomacy.is_at_war(ally, aggressor) {
                continue;
            }

            // Ally joins the war on target's side.
            self.state.diplomacy.set_war(ally, aggressor, true);
            self.state
                .diplomacy
                .adjust_breakdown_component(ally, aggressor, "war_history", -5);

            events.push(Event::DefensivePactTriggered {
                defender: target,
                ally,
                aggressor,
            });
            events.push(Event::WarDeclared {
                aggressor: ally,
                target: aggressor,
            });
        }

        Ok(events)
    }

    fn declare_peace(&mut self, target: PlayerId) -> Result<Vec<Event>, GameError> {
        let a = self.state.current_player;
        let b = target;
        if a == b {
            return Ok(Vec::new());
        }
        if b.0 as usize >= self.state.players.len() {
            return Ok(Vec::new());
        }

        if !self.state.diplomacy.is_at_war(a, b) {
            return Ok(Vec::new());
        }

        self.state.diplomacy.set_war(a, b, false);
        let new_rel = self.state.diplomacy.adjust_relation(a, b, 5);

        Ok(vec![
            Event::PeaceDeclared { a, b },
            Event::RelationChanged {
                a,
                b,
                delta: 5,
                new: new_rel,
            },
        ])
    }

    // =========================================================================
    // Deal Proposals and Treaties
    // =========================================================================

    fn propose_deal(
        &mut self,
        to: PlayerId,
        offer: Vec<DealItem>,
        demand: Vec<DealItem>,
    ) -> Result<Vec<Event>, GameError> {
        let from = self.state.current_player;
        if to == from {
            return Ok(Vec::new());
        }
        if to.0 as usize >= self.state.players.len() {
            return Ok(Vec::new());
        }

        // Cannot propose deals to enemies.
        if self.state.diplomacy.is_at_war(from, to) {
            return Ok(Vec::new());
        }

        let expires_turn = self.state.turn + 5; // Proposals expire after 5 turns.

        let proposal = DealProposal {
            from,
            to,
            offer: offer.clone(),
            demand: demand.clone(),
            expires_turn,
        };

        self.state.diplomacy.add_proposal(proposal);

        Ok(vec![Event::DealProposed {
            from,
            to,
            offer,
            demand,
            expires_turn,
        }])
    }

    fn respond_to_proposal(
        &mut self,
        from: PlayerId,
        accept: bool,
    ) -> Result<Vec<Event>, GameError> {
        let to = self.state.current_player;

        let Some(proposal) = self.state.diplomacy.take_proposal(from, to) else {
            return Ok(Vec::new());
        };

        if !accept {
            return Ok(vec![Event::DealRejected { from, to }]);
        }

        // Process the deal - create treaties and transfer items.
        let mut events = Vec::new();
        let mut treaties_created = Vec::new();

        for item in proposal.offer.iter().chain(proposal.demand.iter()) {
            match item {
                DealItem::OpenBorders { turns } => {
                    let treaty = self.state.diplomacy.create_treaty(
                        TreatyType::OpenBorders,
                        from,
                        to,
                        self.state.turn,
                        Some(*turns),
                    );
                    events.push(Event::TreatySigned {
                        treaty: treaty.clone(),
                    });
                    treaties_created.push(treaty);
                }
                DealItem::DefensivePact { turns } => {
                    let treaty = self.state.diplomacy.create_treaty(
                        TreatyType::DefensivePact,
                        from,
                        to,
                        self.state.turn,
                        Some(*turns),
                    );
                    events.push(Event::TreatySigned {
                        treaty: treaty.clone(),
                    });
                    treaties_created.push(treaty);
                }
                DealItem::ResearchAgreement { turns } => {
                    let treaty = self.state.diplomacy.create_treaty(
                        TreatyType::ResearchAgreement { bonus_science: 5 },
                        from,
                        to,
                        self.state.turn,
                        Some(*turns),
                    );
                    events.push(Event::TreatySigned {
                        treaty: treaty.clone(),
                    });
                    treaties_created.push(treaty);
                }
                DealItem::TradeAgreement { turns } => {
                    let treaty = self.state.diplomacy.create_treaty(
                        TreatyType::TradeAgreement { bonus_gold: 3 },
                        from,
                        to,
                        self.state.turn,
                        Some(*turns),
                    );
                    events.push(Event::TreatySigned {
                        treaty: treaty.clone(),
                    });
                    treaties_created.push(treaty);
                }
                DealItem::Alliance => {
                    let treaty = self.state.diplomacy.create_treaty(
                        TreatyType::Alliance,
                        from,
                        to,
                        self.state.turn,
                        None, // Alliances are permanent until cancelled.
                    );
                    events.push(Event::TreatySigned {
                        treaty: treaty.clone(),
                    });
                    treaties_created.push(treaty);
                }
                DealItem::NonAggression { turns } => {
                    let treaty = self.state.diplomacy.create_treaty(
                        TreatyType::NonAggression,
                        from,
                        to,
                        self.state.turn,
                        Some(*turns),
                    );
                    events.push(Event::TreatySigned {
                        treaty: treaty.clone(),
                    });
                    treaties_created.push(treaty);
                }
                DealItem::Gold { amount } => {
                    // Determine who pays - items in offer are from proposer, in demand from acceptor.
                    let (payer, receiver) = if proposal.offer.contains(item) {
                        (from, to)
                    } else {
                        (to, from)
                    };
                    if let Some(p) = self.state.players.get_mut(payer.0 as usize) {
                        p.gold = p.gold.saturating_sub(*amount);
                    }
                    if let Some(p) = self.state.players.get_mut(receiver.0 as usize) {
                        p.gold = p.gold.saturating_add(*amount);
                    }
                }
                DealItem::Peace => {
                    // End war between the parties.
                    self.state.diplomacy.set_war(from, to, false);
                    events.push(Event::PeaceDeclared { a: from, b: to });
                }
                _ => {
                    // GoldPerTurn, Technology, City, Resource, DeclareWarOn handled elsewhere or ignored.
                }
            }
        }

        events.insert(
            0,
            Event::DealAccepted {
                from,
                to,
                treaties_created,
            },
        );

        Ok(events)
    }

    fn cancel_treaty_cmd(&mut self, treaty_id: TreatyId) -> Result<Vec<Event>, GameError> {
        let current = self.state.current_player;

        // Find the treaty and verify the current player is a party.
        let treaty_opt = self
            .state
            .diplomacy
            .treaties
            .iter()
            .find(|t| t.id == treaty_id && t.active && t.involves(current));

        let Some(treaty) = treaty_opt.cloned() else {
            return Ok(Vec::new());
        };

        let other_party = treaty.other_party(current).unwrap_or(current);

        // Cancel the treaty (this applies betrayal penalty).
        self.state.diplomacy.cancel_treaty(treaty_id);

        Ok(vec![Event::TreatyCancelled {
            treaty: treaty_id,
            cancelled_by: current,
            treaty_type: treaty.treaty_type,
            other_party,
        }])
    }

    fn issue_demand_cmd(
        &mut self,
        to: PlayerId,
        items: Vec<DealItem>,
        consequence: DemandConsequence,
    ) -> Result<Vec<Event>, GameError> {
        let from = self.state.current_player;
        if to == from {
            return Ok(Vec::new());
        }
        if to.0 as usize >= self.state.players.len() {
            return Ok(Vec::new());
        }

        let expires_turn = self.state.turn + 3; // Demands expire after 3 turns.

        let demand = self.state.diplomacy.issue_demand(
            from,
            to,
            items.clone(),
            consequence.clone(),
            expires_turn,
        );

        Ok(vec![Event::DemandIssued {
            demand: demand.id,
            from,
            to,
            items,
            consequence,
            expires_turn,
        }])
    }

    fn respond_to_demand_cmd(
        &mut self,
        demand_id: DemandId,
        accept: bool,
    ) -> Result<Vec<Event>, GameError> {
        let current = self.state.current_player;

        let Some(demand) = self.state.diplomacy.take_demand(demand_id) else {
            return Ok(Vec::new());
        };

        // Verify this demand is directed at the current player.
        if demand.to != current {
            return Ok(Vec::new());
        }

        let from = demand.from;
        let to = demand.to;

        if accept {
            // Process the demand items (give what was demanded).
            for item in &demand.items {
                match item {
                    DealItem::Gold { amount } => {
                        if let Some(p) = self.state.players.get_mut(to.0 as usize) {
                            p.gold = p.gold.saturating_sub(*amount);
                        }
                        if let Some(p) = self.state.players.get_mut(from.0 as usize) {
                            p.gold = p.gold.saturating_add(*amount);
                        }
                    }
                    _ => {
                        // Other items not yet implemented for demands.
                    }
                }
            }
            return Ok(vec![Event::DemandAccepted {
                demand: demand_id,
                from,
                to,
            }]);
        }

        // Rejected - apply consequence.
        let mut events = vec![Event::DemandRejected {
            demand: demand_id,
            from,
            to,
            consequence: demand.consequence.clone(),
        }];

        match &demand.consequence {
            DemandConsequence::War => {
                // The demander declares war.
                self.state.diplomacy.set_war(from, to, true);
                self.state.diplomacy.adjust_breakdown_component(from, to, "war_history", -10);
                if let Some(p) = self.state.players.get_mut(from.0 as usize) {
                    p.war_weariness = p.war_weariness.saturating_add(2);
                }
                if let Some(p) = self.state.players.get_mut(to.0 as usize) {
                    p.war_weariness = p.war_weariness.saturating_add(1);
                }
                events.push(Event::WarDeclared {
                    aggressor: from,
                    target: to,
                });
            }
            DemandConsequence::RelationPenalty { amount } => {
                self.state.diplomacy.adjust_breakdown_component(from, to, "base", -*amount);
            }
            DemandConsequence::None => {}
        }

        Ok(events)
    }

    fn trade_route_capacity(&self, player: PlayerId) -> i32 {
        let rules = &self.state.rules;
        let Some(p) = self.state.players.get(player.0 as usize) else {
            return 0;
        };
        let gov_admin = p
            .government
            .and_then(|gov| rules.governments.get(gov.raw as usize))
            .map(|g| g.admin)
            .unwrap_or(0);
        (1 + gov_admin).max(0)
    }

    fn trade_routes_used(&self, player: PlayerId) -> i32 {
        self.state
            .trade_routes
            .iter_ordered()
            .filter(|(_, r)| r.owner == player)
            .count() as i32
    }

    // =========================================================================
    // Victory Tracking
    // =========================================================================

    /// Update victory capital tracking from events.
    fn update_victory_capitals(&mut self, events: &[Event]) {
        for event in events {
            match event {
                Event::CityFounded { city, pos, owner, .. } => {
                    // Check if this is a capital (first city at start position).
                    for cap in &mut self.state.victory.original_capitals {
                        if cap.original_owner == *owner && cap.city.is_none() {
                            // First city for this player - it's their capital.
                            cap.city = Some(*city);
                            cap.current_owner = Some(*owner);
                            cap.position = *pos;
                            break;
                        }
                    }
                }
                Event::CityConquered {
                    city,
                    new_owner,
                    old_owner,
                } => {
                    // Update capital ownership if this was a capital.
                    for cap in &mut self.state.victory.original_capitals {
                        if cap.city == Some(*city) {
                            cap.current_owner = Some(*new_owner);
                        }
                    }
                    // Check if old owner is eliminated (lost all cities).
                    let old_owner_cities = self
                        .state
                        .cities
                        .iter_ordered()
                        .any(|(_, c)| c.owner == *old_owner);
                    if !old_owner_cities
                        && !self.state.victory.eliminated.contains(old_owner)
                    {
                        self.state.victory.eliminated.push(*old_owner);
                    }
                }
                _ => {}
            }
        }
    }

    /// Check all victory conditions and return GameEnded event if one is achieved.
    fn check_victory_conditions(&mut self) -> Option<Event> {
        if self.state.victory.game_ended {
            return None;
        }

        let num_players = self.state.players.len();
        let eliminated_count = self.state.victory.eliminated.len();

        // Elimination victory: only one player left.
        if num_players > 1 && eliminated_count == num_players - 1 {
            let winner = self
                .state
                .players
                .iter()
                .find(|p| !self.state.victory.eliminated.contains(&p.id))
                .map(|p| p.id);
            if let Some(w) = winner {
                self.state.victory.game_ended = true;
                self.state.victory.winner = Some(w);
                self.state.victory.victory_reason =
                    Some(backbay_protocol::VictoryReason::Conquest);
                return Some(Event::GameEnded {
                    winner: Some(w),
                    reason: backbay_protocol::VictoryReason::Conquest,
                });
            }
        }

        // Domination victory: one player controls all capitals.
        for player in &self.state.players {
            if self.state.victory.controls_all_capitals(player.id) {
                self.state.victory.game_ended = true;
                self.state.victory.winner = Some(player.id);
                self.state.victory.victory_reason =
                    Some(backbay_protocol::VictoryReason::Conquest);
                return Some(Event::GameEnded {
                    winner: Some(player.id),
                    reason: backbay_protocol::VictoryReason::Conquest,
                });
            }
        }

        // Science victory: complete all space project stages.
        for player in &self.state.players {
            if self.state.victory.completed_science_victory(player.id) {
                self.state.victory.game_ended = true;
                self.state.victory.winner = Some(player.id);
                self.state.victory.victory_reason =
                    Some(backbay_protocol::VictoryReason::Science);
                return Some(Event::GameEnded {
                    winner: Some(player.id),
                    reason: backbay_protocol::VictoryReason::Science,
                });
            }
        }

        // Culture victory: dominant influence over all rivals.
        for player in &self.state.players {
            if self.state.victory.eliminated.contains(&player.id) {
                continue;
            }
            if self.state.victory.has_culture_victory(player.id, num_players) {
                self.state.victory.game_ended = true;
                self.state.victory.winner = Some(player.id);
                self.state.victory.victory_reason =
                    Some(backbay_protocol::VictoryReason::Culture);
                return Some(Event::GameEnded {
                    winner: Some(player.id),
                    reason: backbay_protocol::VictoryReason::Culture,
                });
            }
        }

        // Time/Score victory: turn limit reached.
        let turn_limit = self.state.victory.turn_limit;
        if turn_limit > 0 && self.state.turn >= turn_limit {
            // Find player with highest score.
            let winner = self.calculate_score_leader();
            self.state.victory.game_ended = true;
            self.state.victory.winner = winner;
            self.state.victory.victory_reason = Some(backbay_protocol::VictoryReason::Time);
            return Some(Event::GameEnded {
                winner,
                reason: backbay_protocol::VictoryReason::Time,
            });
        }

        None
    }

    /// Calculate the player with the highest score.
    fn calculate_score_leader(&self) -> Option<PlayerId> {
        let mut best: Option<(i32, PlayerId)> = None;

        for player in &self.state.players {
            if self.state.victory.eliminated.contains(&player.id) {
                continue;
            }
            let score = self.calculate_player_score(player.id);
            if best.map(|(b, _)| score > b).unwrap_or(true) {
                best = Some((score, player.id));
            }
        }

        best.map(|(_, id)| id)
    }

    /// Calculate a player's current score.
    fn calculate_player_score(&self, player: PlayerId) -> i32 {
        let mut score = 0i32;

        // Population: 2 points per pop.
        let pop: i32 = self
            .state
            .cities
            .iter_ordered()
            .filter(|(_, c)| c.owner == player)
            .map(|(_, c)| i32::from(c.population))
            .sum();
        score += pop * 2;

        // Cities: 10 points per city.
        let city_count = self
            .state
            .cities
            .iter_ordered()
            .filter(|(_, c)| c.owner == player)
            .count() as i32;
        score += city_count * 10;

        // Techs: 4 points per tech.
        let tech_count = self
            .state
            .players
            .get(player.0 as usize)
            .map(|p| p.known_techs.iter().filter(|&&k| k).count())
            .unwrap_or(0) as i32;
        score += tech_count * 4;

        // Territory: 1 point per 3 owned tiles.
        let owned_tiles = self
            .state
            .map
            .tiles()
            .iter()
            .filter(|t| t.owner == Some(player))
            .count() as i32;
        score += owned_tiles / 3;

        // Gold: 1 point per 50 gold.
        let gold = self
            .state
            .players
            .get(player.0 as usize)
            .map(|p| p.gold)
            .unwrap_or(0);
        score += gold / 50;

        // Units (military strength): 1 point per unit.
        let units = self
            .state
            .units
            .iter_ordered()
            .filter(|(_, u)| u.owner == player)
            .count() as i32;
        score += units;

        score
    }

    /// Get victory progress for UI display.
    pub fn query_victory_progress(&self) -> backbay_protocol::VictoryProgress {
        let domination = backbay_protocol::DominationProgress {
            total_capitals: self.state.victory.original_capitals.len() as u8,
            capitals_held: self.state.victory.capitals_per_player(),
            capital_locations: self
                .state
                .victory
                .original_capitals
                .iter()
                .map(|cap| backbay_protocol::CapitalInfo {
                    original_owner: cap.original_owner,
                    city: cap.city,
                    position: cap.position,
                    current_owner: cap.current_owner,
                    razed: cap.city.is_some() && cap.current_owner.is_none(),
                })
                .collect(),
            achievable: true,
        };

        let science = backbay_protocol::ScienceProgress {
            stages: vec![
                backbay_protocol::SpaceProjectStage {
                    name: "Satellite".into(),
                    required_tech: None,
                    production_cost: 200,
                    vulnerability_hex: None,
                },
                backbay_protocol::SpaceProjectStage {
                    name: "Moon Landing".into(),
                    required_tech: None,
                    production_cost: 400,
                    vulnerability_hex: None,
                },
                backbay_protocol::SpaceProjectStage {
                    name: "Space Station".into(),
                    required_tech: None,
                    production_cost: 600,
                    vulnerability_hex: None,
                },
                backbay_protocol::SpaceProjectStage {
                    name: "Mars Colony".into(),
                    required_tech: None,
                    production_cost: 800,
                    vulnerability_hex: None,
                },
                backbay_protocol::SpaceProjectStage {
                    name: "Interstellar".into(),
                    required_tech: None,
                    production_cost: 1000,
                    vulnerability_hex: None,
                },
            ],
            player_progress: self
                .state
                .players
                .iter()
                .map(|p| (p.id, self.state.victory.science_progress.get(p.id.0 as usize).cloned().unwrap_or_default()))
                .collect(),
            completed_by: self
                .state
                .players
                .iter()
                .find(|p| self.state.victory.completed_science_victory(p.id))
                .map(|p| p.id),
        };

        let num_players = self.state.players.len();
        let culture = backbay_protocol::CultureProgress {
            influence_over_rivals: self
                .state
                .players
                .iter()
                .map(|p| {
                    (
                        p.id,
                        self.state
                            .victory
                            .get_influence_over_rivals(p.id, num_players),
                    )
                })
                .collect(),
            threshold_pct: self.state.victory.culture_threshold_pct,
            threshold_met_by: self
                .state
                .players
                .iter()
                .filter(|p| {
                    !self.state.victory.eliminated.contains(&p.id)
                        && self.state.victory.has_culture_victory(p.id, num_players)
                })
                .map(|p| p.id)
                .collect(),
        };

        let scores: Vec<backbay_protocol::PlayerScore> = self
            .state
            .players
            .iter()
            .map(|p| {
                let total = self.calculate_player_score(p.id);
                backbay_protocol::PlayerScore {
                    player: p.id,
                    total,
                    breakdown: backbay_protocol::ScoreBreakdown::default(),
                }
            })
            .collect();

        let leader = self.calculate_score_leader();

        let score_progress = backbay_protocol::ScoreProgress {
            current_turn: self.state.turn,
            turn_limit: self.state.victory.turn_limit,
            scores,
            leader,
        };

        backbay_protocol::VictoryProgress {
            domination,
            science,
            culture,
            score: score_progress,
        }
    }

    fn end_turn(&mut self) -> Vec<Event> {
        let mut events = Vec::new();

        // Advance one turn step (current player ends).
        let mut chunk = self.end_turn_once();
        if self.is_current_player_ai() {
            Self::strip_visibility_events(&mut chunk);
        }
        events.append(&mut chunk);

        // Auto-run consecutive AI players until we reach a human player again.
        let mut guard = 0usize;
        let max_ai_turns = self.state.players.len().saturating_mul(4).max(1);
        while self.is_current_player_ai() && guard < max_ai_turns {
            let mut ai_events = self.run_ai_for_current_player();
            Self::strip_visibility_events(&mut ai_events);
            events.append(&mut ai_events);

            let mut chunk = self.end_turn_once();
            if self.is_current_player_ai() {
                Self::strip_visibility_events(&mut chunk);
            }
            events.append(&mut chunk);

            guard += 1;
        }

        events
    }

    fn end_turn_once(&mut self) -> Vec<Event> {
        let mut events = vec![Event::TurnEnded {
            turn: self.state.turn,
        }];

        let num_players = self.state.players.len().max(1) as u8;
        let next = (self.state.current_player.0 + 1) % num_players;
        self.state.current_player = PlayerId(next);

        if next == 0 {
            self.state.turn += 1;
            events.extend(self.process_world_turn());
        }

        // Reset moves for units owned by the new player.
        for (id, unit) in self.state.units.iter_ordered_mut() {
            if unit.owner == self.state.current_player {
                let max_moves = self.state.rules.unit_type(unit.type_id).moves;
                unit.moves_left = max_moves;
                events.push(Event::UnitUpdated {
                    unit: UnitSnapshot {
                        id,
                        type_id: unit.type_id,
                        owner: unit.owner,
                        pos: unit.position,
                        hp: unit.hp,
                        moves_left: unit.moves_left,
                        veteran_level: unit.veteran_level(),
                        orders: unit.orders.clone(),
                        automated: unit.automated,
                    },
                });
            }
        }

        events.push(Event::TurnStarted {
            turn: self.state.turn,
            player: self.state.current_player,
        });

        events.extend(self.process_current_player_orders());
        events.extend(self.process_current_player_worker_automation());
        events.extend(self.update_visibility_for_player(self.state.current_player));

        events
    }

    fn is_current_player_ai(&self) -> bool {
        self.state
            .players
            .get(self.state.current_player.0 as usize)
            .map(|p| p.is_ai)
            .unwrap_or(false)
    }

    fn strip_visibility_events(events: &mut Vec<Event>) {
        events.retain(|e| !matches!(e, Event::TileRevealed { .. } | Event::TileHidden { .. }));
    }

    fn ai_choose_research(&self, player_index: usize) -> Option<TechId> {
        let player = self.state.players.get(player_index)?;
        for (idx, tech) in self.state.rules.techs.iter().enumerate() {
            if player.known_techs.get(idx).copied().unwrap_or(false) {
                continue;
            }
            let prereqs_met = tech.prerequisites.iter().all(|prereq| {
                player
                    .known_techs
                    .get(prereq.raw as usize)
                    .copied()
                    .unwrap_or(false)
            });
            if prereqs_met {
                return Some(TechId::new(idx as u16));
            }
        }
        None
    }

    fn ai_choose_production(&self, city_id: CityId) -> Option<ProductionItem> {
        let city = self.state.cities.get(city_id)?;

        if let Some(monument_id) = self.state.rules.building_ids.get("monument").copied() {
            if !city.buildings.contains(&monument_id) {
                return Some(ProductionItem::Building(monument_id));
            }
        }

        self.state
            .rules
            .unit_type_id("warrior")
            .map(ProductionItem::Unit)
    }

    fn ai_find_adjacent_enemy(&self, attacker_id: UnitId) -> Option<UnitId> {
        let attacker = self.state.units.get(attacker_id)?;
        let player = attacker.owner;
        let attacker_index = self.state.map.index_of(attacker.position)?;
        let occupancy = unit_occupancy(&self.state.map, &self.state.units);

        for neighbor in self
            .state
            .map
            .neighbors_indices(attacker_index)
            .into_iter()
            .flatten()
        {
            let Some(target_id) = occupancy.get(neighbor).copied().flatten() else {
                continue;
            };
            let target = self.state.units.get(target_id)?;
            if target.owner != player {
                return Some(target_id);
            }
        }
        None
    }

    fn ai_nearest_enemy_hex(&self, from: Hex, player: PlayerId) -> Option<Hex> {
        let mut best: Option<((i32, u8, u64), Hex)> = None;

        for (city_id, city) in self.state.cities.iter_ordered() {
            if city.owner == player {
                continue;
            }
            let dist = from.distance(city.position);
            let key = (dist, 0u8, city_id.to_raw());
            if best
                .as_ref()
                .map(|(best_key, _)| key < *best_key)
                .unwrap_or(true)
            {
                best = Some((key, city.position));
            }
        }

        for (unit_id, unit) in self.state.units.iter_ordered() {
            if unit.owner == player {
                continue;
            }
            let dist = from.distance(unit.position);
            let key = (dist, 1u8, unit_id.to_raw());
            if best
                .as_ref()
                .map(|(best_key, _)| key < *best_key)
                .unwrap_or(true)
            {
                best = Some((key, unit.position));
            }
        }

        best.map(|(_, hex)| hex)
    }

    fn ai_step_toward(&self, unit_id: UnitId, target: Hex) -> Option<Hex> {
        let unit = self.state.units.get(unit_id)?;
        let start_index = self.state.map.index_of(unit.position)?;

        let occupancy = unit_occupancy(&self.state.map, &self.state.units);

        let mut best: Option<(i32, usize)> = None;
        for neighbor in self
            .state
            .map
            .neighbors_indices(start_index)
            .into_iter()
            .flatten()
        {
            if occupancy.get(neighbor).copied().flatten().is_some() {
                continue;
            }
            let Some(cost) = movement_cost_to_enter(&self.state.map, &self.state.rules, neighbor)
            else {
                continue;
            };
            if unit.moves_left < cost {
                continue;
            }

            let Some(hex) = self.state.map.hex_at_index(neighbor) else {
                continue;
            };
            let dist = hex.distance(target);
            match best {
                None => best = Some((dist, neighbor)),
                Some((best_dist, best_index)) => {
                    if dist < best_dist || (dist == best_dist && neighbor < best_index) {
                        best = Some((dist, neighbor));
                    }
                }
            }
        }

        best.and_then(|(_, index)| self.state.map.hex_at_index(index))
    }

    // =========================================================================
    // AI Diplomacy
    // =========================================================================

    /// Main entry point for AI diplomacy decisions.
    fn ai_handle_diplomacy(&mut self) -> Vec<Event> {
        let player = self.state.current_player;
        let mut events = Vec::new();

        // 1. Respond to pending proposals directed at us.
        events.extend(self.ai_respond_to_proposals(player));

        // 2. Respond to pending demands directed at us.
        events.extend(self.ai_respond_to_demands(player));

        // 3. Consider seeking peace if we're losing wars.
        events.extend(self.ai_consider_peace(player));

        // 4. Consider declaring war on weak/hostile neighbors.
        events.extend(self.ai_consider_war(player));

        // 5. Consider proposing beneficial treaties.
        events.extend(self.ai_propose_deals(player));

        events
    }

    /// Calculate relative military strength (unit count * average power).
    fn ai_military_strength(&self, player: PlayerId) -> i32 {
        let mut total = 0;
        for (_, unit) in self.state.units.iter_ordered() {
            if unit.owner == player {
                let utype = self.state.rules.unit_type(unit.type_id);
                let power = utype.attack.max(utype.defense);
                total += power.max(1);
            }
        }
        // Add city count as defensive strength.
        let cities = self
            .state
            .cities
            .iter_ordered()
            .filter(|(_, c)| c.owner == player)
            .count() as i32;
        total + cities * 5
    }

    /// Calculate military advantage ratio against another player.
    /// Returns value > 1.0 if we're stronger, < 1.0 if weaker.
    fn ai_military_advantage(&self, us: PlayerId, them: PlayerId) -> f32 {
        let our_strength = self.ai_military_strength(us).max(1) as f32;
        let their_strength = self.ai_military_strength(them).max(1) as f32;
        our_strength / their_strength
    }

    /// Respond to pending deal proposals.
    fn ai_respond_to_proposals(&mut self, player: PlayerId) -> Vec<Event> {
        let mut events = Vec::new();

        // Get pending proposals for this player.
        let proposals: Vec<_> = self
            .state
            .diplomacy
            .pending_proposals
            .iter()
            .filter(|p| p.to == player)
            .cloned()
            .collect();

        for proposal in proposals {
            let from = proposal.from;
            let accept = self.ai_evaluate_proposal(player, &proposal);

            if let Ok(mut ev) =
                self.try_apply_command(Command::RespondToProposal { from, accept })
            {
                events.append(&mut ev);
            }
        }

        events
    }

    /// Evaluate whether to accept a deal proposal.
    fn ai_evaluate_proposal(&self, player: PlayerId, proposal: &DealProposal) -> bool {
        let relation = self.state.diplomacy.relation(player, proposal.from);

        // Calculate deal value (positive = good for us).
        let mut deal_value = 0i32;

        // Items they offer us.
        for item in &proposal.offer {
            deal_value += self.ai_deal_item_value(player, item, true);
        }

        // Items they demand from us.
        for item in &proposal.demand {
            deal_value -= self.ai_deal_item_value(player, item, false);
        }

        // Relation modifier: friendly = more likely to accept.
        let relation_bonus = relation / 10;
        deal_value += relation_bonus;

        // Accept if deal value is positive or neutral with good relations.
        deal_value >= 0 || (deal_value >= -10 && relation >= 20)
    }

    /// Estimate the value of a deal item to us.
    fn ai_deal_item_value(&self, _player: PlayerId, item: &DealItem, is_offer: bool) -> i32 {
        match item {
            DealItem::Gold { amount } => *amount / 10,
            DealItem::GoldPerTurn { amount, turns } => (*amount * (*turns as i32)) / 15,
            DealItem::OpenBorders { turns: _ } => {
                if is_offer {
                    5 // We get access to their territory.
                } else {
                    -3 // They get access to ours.
                }
            }
            DealItem::DefensivePact { turns: _ } => 15, // Alliances are valuable.
            DealItem::ResearchAgreement { turns: _ } => 10,
            DealItem::TradeAgreement { turns: _ } => 8,
            DealItem::Alliance => 25,
            DealItem::NonAggression { turns: _ } => 10,
            DealItem::Peace => 20, // Peace is valuable when at war.
            DealItem::Technology { .. } => 15,
            DealItem::City { .. } => 50, // Cities are very valuable.
            DealItem::Resource { .. } => 5,
            DealItem::DeclareWarOn { .. } => -30, // Dragging us into war is bad.
        }
    }

    /// Respond to pending demands.
    fn ai_respond_to_demands(&mut self, player: PlayerId) -> Vec<Event> {
        let mut events = Vec::new();

        // Get pending demands for this player.
        let demands: Vec<_> = self
            .state
            .diplomacy
            .pending_demands
            .iter()
            .filter(|d| d.to == player)
            .cloned()
            .collect();

        for demand in demands {
            let accept = self.ai_evaluate_demand(player, &demand);

            if let Ok(mut ev) = self.try_apply_command(Command::RespondToDemand {
                demand: demand.id,
                accept,
            }) {
                events.append(&mut ev);
            }
        }

        events
    }

    /// Evaluate whether to accept a demand.
    fn ai_evaluate_demand(&self, player: PlayerId, demand: &Demand) -> bool {
        let from = demand.from;

        // Calculate demand cost.
        let mut cost = 0i32;
        for item in &demand.items {
            cost += self.ai_deal_item_value(player, item, false);
        }

        // Compare military strength.
        let advantage = self.ai_military_advantage(player, from);

        // If they're much stronger, capitulate.
        if advantage < 0.5 {
            return true;
        }

        // If we're stronger, reject unless demand is trivial.
        if advantage > 1.5 {
            return cost <= 5;
        }

        // Consider the consequence.
        match &demand.consequence {
            DemandConsequence::War => {
                // Only accept if we can't win a war.
                advantage < 0.8 || cost <= 10
            }
            DemandConsequence::RelationPenalty { amount } => {
                // Accept if cost is less than relation penalty impact.
                cost <= *amount / 2
            }
            DemandConsequence::None => {
                // Reject unless trivial.
                cost <= 5
            }
        }
    }

    /// Consider proposing peace when losing a war.
    fn ai_consider_peace(&mut self, player: PlayerId) -> Vec<Event> {
        let mut events = Vec::new();
        let num_players = self.state.players.len();

        // Find wars we're losing.
        for i in 0..num_players {
            let enemy = PlayerId(i as u8);
            if enemy == player {
                continue;
            }

            if !self.state.diplomacy.is_at_war(player, enemy) {
                continue;
            }

            let advantage = self.ai_military_advantage(player, enemy);
            let war_weariness = self
                .state
                .players
                .get(player.0 as usize)
                .map(|p| p.war_weariness)
                .unwrap_or(0);

            // Propose peace if we're losing or war-weary.
            let should_seek_peace = advantage < 0.6 || (advantage < 0.9 && war_weariness > 10);

            if should_seek_peace {
                // Declare peace unilaterally.
                if let Ok(mut ev) = self.try_apply_command(Command::DeclarePeace { target: enemy }) {
                    events.append(&mut ev);
                }
            }
        }

        events
    }

    /// Consider declaring war on weak/hostile neighbors.
    fn ai_consider_war(&mut self, player: PlayerId) -> Vec<Event> {
        let mut events = Vec::new();
        let num_players = self.state.players.len();

        // Don't start new wars if already in one.
        if self.state.diplomacy.any_war(player) {
            return events;
        }

        // Don't start wars too early.
        if self.state.turn < 20 {
            return events;
        }

        for i in 0..num_players {
            let target = PlayerId(i as u8);
            if target == player {
                continue;
            }

            if self.state.diplomacy.is_at_war(player, target) {
                continue;
            }

            // Check for non-aggression pact.
            if self.state.diplomacy.has_non_aggression(player, target) {
                continue;
            }

            // Check alliance status.
            if self.state.diplomacy.are_allies(player, target) {
                continue;
            }

            let relation = self.state.diplomacy.relation(player, target);
            let advantage = self.ai_military_advantage(player, target);

            // Declare war if:
            // 1. We have significant military advantage (>2x) and relations are neutral/bad
            // 2. Or relations are very hostile (<-50) and we're not at disadvantage
            let should_declare_war = (advantage > 2.0 && relation < 10)
                || (relation < -50 && advantage > 0.8);

            if should_declare_war {
                if let Ok(mut ev) = self.try_apply_command(Command::DeclareWar { target }) {
                    events.append(&mut ev);
                    break; // Only declare one war at a time.
                }
            }
        }

        events
    }

    /// Consider proposing beneficial treaties.
    fn ai_propose_deals(&mut self, player: PlayerId) -> Vec<Event> {
        let mut events = Vec::new();
        let num_players = self.state.players.len();

        // Don't propose too many deals.
        let pending_count = self
            .state
            .diplomacy
            .pending_proposals
            .iter()
            .filter(|p| p.from == player)
            .count();
        if pending_count >= 2 {
            return events;
        }

        for i in 0..num_players {
            let target = PlayerId(i as u8);
            if target == player {
                continue;
            }

            // Don't propose to enemies.
            if self.state.diplomacy.is_at_war(player, target) {
                continue;
            }

            let relation = self.state.diplomacy.relation(player, target);

            // Only propose to players with neutral or positive relations.
            if relation < -20 {
                continue;
            }

            // Check if we already have common treaties.
            let has_open_borders = self.state.diplomacy.has_open_borders(player, target);
            let has_defensive_pact = self.state.diplomacy.has_defensive_pact(player, target);

            // Consider proposing open borders if relations are decent.
            if !has_open_borders && relation >= 0 {
                if let Ok(mut ev) = self.try_apply_command(Command::ProposeDeal {
                    to: target,
                    offer: vec![DealItem::OpenBorders { turns: 30 }],
                    demand: vec![DealItem::OpenBorders { turns: 30 }],
                }) {
                    events.append(&mut ev);
                    continue;
                }
            }

            // Consider defensive pact if relations are good.
            if !has_defensive_pact && relation >= 30 {
                if let Ok(mut ev) = self.try_apply_command(Command::ProposeDeal {
                    to: target,
                    offer: vec![DealItem::DefensivePact { turns: 50 }],
                    demand: vec![DealItem::DefensivePact { turns: 50 }],
                }) {
                    events.append(&mut ev);
                    continue;
                }
            }
        }

        events
    }

    fn run_ai_for_current_player(&mut self) -> Vec<Event> {
        if !self.is_current_player_ai() {
            return Vec::new();
        }

        let player = self.state.current_player;
        let player_index = player.0 as usize;
        let mut events = Vec::new();

        // Research: pick the first available tech.
        if self
            .state
            .players
            .get(player_index)
            .map(|p| p.researching.is_none())
            .unwrap_or(false)
        {
            if let Some(tech) = self.ai_choose_research(player_index) {
                if let Ok(mut ev) = self.try_apply_command(Command::SetResearch { tech }) {
                    events.append(&mut ev);
                }
            }
        }

        // City production: ensure every city is building something.
        let city_ids = self
            .state
            .cities
            .iter_ordered()
            .filter_map(|(id, c)| (c.owner == player && c.producing.is_none()).then_some(id))
            .collect::<Vec<_>>();
        for city_id in city_ids {
            if let Some(item) = self.ai_choose_production(city_id) {
                if let Ok(mut ev) = self.try_apply_command(Command::SetProduction {
                    city: city_id,
                    item,
                }) {
                    events.append(&mut ev);
                }
            }
        }

        // Diplomacy: handle pending proposals, demands, and consider peace/war.
        events.extend(self.ai_handle_diplomacy());

        // Found cities with any unit that can found a city.
        let rules = &self.state.rules;
        let settler_ids = self
            .state
            .units
            .iter_ordered()
            .filter_map(|(id, u)| (u.owner == player && rules.unit_type(u.type_id).can_found_city).then_some(id))
            .collect::<Vec<_>>();

        for settler_id in settler_ids {
            let Some(unit) = self.state.units.get(settler_id) else {
                continue;
            };
            if self
                .state
                .map
                .get(unit.position)
                .and_then(|t| t.city)
                .is_some()
            {
                continue;
            }

            let num_cities = self
                .state
                .cities
                .iter_ordered()
                .filter(|(_, c)| c.owner == player)
                .count();
            let name = format!("AI City {}", num_cities + 1);

            if let Ok(mut ev) = self.try_apply_command(Command::FoundCity {
                settler: settler_id,
                name,
            }) {
                events.append(&mut ev);
            }
        }

        // Units: attack adjacent enemies; otherwise move toward the closest enemy city/unit.
        let unit_ids = self
            .state
            .units
            .iter_ordered()
            .filter_map(|(id, u)| (u.owner == player && u.moves_left > 0).then_some(id))
            .collect::<Vec<_>>();

        for unit_id in unit_ids {
            let Some(unit) = self.state.units.get(unit_id) else {
                continue;
            };
            let utype = self.state.rules.unit_type(unit.type_id);
            if utype.attack <= 0 && utype.defense <= 0 {
                continue;
            }

            if let Some(target) = self.ai_find_adjacent_enemy(unit_id) {
                if let Ok(mut ev) = self.try_apply_command(Command::AttackUnit {
                    attacker: unit_id,
                    target,
                }) {
                    events.append(&mut ev);
                }
                continue;
            }

            let target_hex = self
                .ai_nearest_enemy_hex(unit.position, player)
                .unwrap_or(Hex {
                    q: unit.position.q + 1,
                    r: unit.position.r,
                });

            if let Some(step) = self.ai_step_toward(unit_id, target_hex) {
                if let Ok(mut ev) = self.try_apply_command(Command::MoveUnit {
                    unit: unit_id,
                    path: vec![step],
                }) {
                    events.append(&mut ev);
                }
            }
        }

        events
    }

    fn process_current_player_orders(&mut self) -> Vec<Event> {
        let player = self.state.current_player;

        let unit_ids = self
            .state
            .units
            .iter_ordered()
            .filter_map(|(id, u)| (u.owner == player && u.orders.is_some()).then_some(id))
            .collect::<Vec<_>>();

        if unit_ids.is_empty() {
            return Vec::new();
        }

        let mut occupancy = unit_occupancy(&self.state.map, &self.state.units);
        let zoc = enemy_zoc(
            &self.state.map,
            &self.state.rules,
            &self.state.units,
            player,
        );

        let mut events = Vec::new();

        for unit_id in unit_ids {
            let Some(orders) = self.state.units.get(unit_id).and_then(|u| u.orders.clone()) else {
                continue;
            };

            match orders {
                UnitOrders::Goto { path } => {
                    events.extend(self.execute_goto_orders(unit_id, path, &mut occupancy, &zoc));
                }
                UnitOrders::BuildImprovement {
                    improvement,
                    at,
                    turns_remaining,
                } => {
                    events.extend(self.tick_build_improvement_orders(
                        unit_id,
                        improvement,
                        at,
                        turns_remaining,
                    ));
                }
                UnitOrders::RepairImprovement {
                    at,
                    turns_remaining,
                } => {
                    events.extend(self.tick_repair_improvement_orders(
                        unit_id,
                        at,
                        turns_remaining,
                    ));
                }
                // Other order types are stubbed for now.
                _ => {}
            }
        }

        events
    }

    fn process_current_player_worker_automation(&mut self) -> Vec<Event> {
        let player = self.state.current_player;
        let rules = &self.state.rules;

        const WORKER_SEARCH_RADIUS: i32 = 12;

        // Collect automated workers needing action
        enum WorkerAction {
            BuildHere(WorkerTaskKind),
            MoveTo(Vec<Hex>),
        }

        let mut todo: Vec<(UnitId, WorkerAction)> = Vec::new();

        for (unit_id, unit) in self.state.units.iter_ordered() {
            if unit.owner != player {
                continue;
            }
            if !rules.unit_type(unit.type_id).is_worker {
                continue;
            }
            if !unit.automated || unit.orders.is_some() || unit.moves_left <= 0 {
                continue;
            }

            // First check if there's work at the current position
            if let Some((task, _turns)) = self.recommend_worker_task_at(player, unit.position) {
                todo.push((unit_id, WorkerAction::BuildHere(task)));
                continue;
            }

            // Search for work in nearby tiles
            if let Some((target_hex, _task, _turns)) =
                self.find_best_worker_target(player, unit.position, WORKER_SEARCH_RADIUS)
            {
                // Compute path to target
                if let Some(path) = self.compute_worker_path(unit.position, target_hex) {
                    if !path.is_empty() {
                        todo.push((unit_id, WorkerAction::MoveTo(path)));
                    }
                }
            }
        }

        let mut events = Vec::new();
        for (unit_id, action) in todo {
            match action {
                WorkerAction::BuildHere(task) => {
                    let orders = match task {
                        WorkerTaskKind::Repair => UnitOrders::RepairImprovement {
                            at: None,
                            turns_remaining: None,
                        },
                        WorkerTaskKind::Build { improvement } => UnitOrders::BuildImprovement {
                            improvement,
                            at: None,
                            turns_remaining: None,
                        },
                    };
                    if let Ok(mut ev) = self.set_orders(unit_id, orders) {
                        events.append(&mut ev);
                    }
                }
                WorkerAction::MoveTo(path) => {
                    // Issue Goto orders to move toward the target
                    let orders = UnitOrders::Goto { path };
                    if let Ok(mut ev) = self.set_orders(unit_id, orders) {
                        events.append(&mut ev);
                    }
                }
            }
        }

        events
    }

    fn tick_build_improvement_orders(
        &mut self,
        unit_id: UnitId,
        improvement_id: backbay_protocol::ImprovementId,
        at: Option<Hex>,
        turns_remaining: Option<u8>,
    ) -> Vec<Event> {
        let Some(unit) = self.state.units.get(unit_id) else {
            return Vec::new();
        };
        if unit.owner != self.state.current_player {
            return Vec::new();
        }

        let pos = unit.position;
        let target = at.unwrap_or(pos);
        if target != pos {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
            }
            return vec![Event::OrdersInterrupted {
                unit: unit_id,
                at: pos,
                reason: MovementStopReason::Blocked { attempted: target },
            }];
        }

        let Some(impr) = self
            .state
            .rules
            .improvements
            .get(improvement_id.raw as usize)
        else {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
            }
            return Vec::new();
        };

        let remaining = turns_remaining.unwrap_or(impr.build_time).max(1);
        let next_remaining = remaining.saturating_sub(1);

        if next_remaining == 0 {
            let built = match self.state.map.get_mut(pos) {
                None => false,
                Some(tile) => {
                    // Can only build if: we own the tile, no city here, and terrain is allowed
                    let terrain_allowed = impr.allowed_terrain.is_empty()
                        || impr.allowed_terrain.contains(&tile.terrain);
                    if tile.owner != Some(unit.owner) || tile.city.is_some() || !terrain_allowed {
                        false
                    } else {
                        tile.improvement = Some(ImprovementOnTile {
                            id: improvement_id,
                            tier: 1,
                            worked_turns: 0,
                            pillaged: false,
                        });
                        true
                    }
                }
            };

            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
                unit.moves_left = 0;
            }

            if built {
                vec![
                    Event::ImprovementBuilt {
                        hex: pos,
                        improvement: improvement_id,
                        tier: 1,
                    },
                    Event::OrdersCompleted { unit: unit_id },
                ]
            } else {
                vec![Event::OrdersInterrupted {
                    unit: unit_id,
                    at: pos,
                    reason: MovementStopReason::Blocked { attempted: pos },
                }]
            }
        } else {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = Some(UnitOrders::BuildImprovement {
                    improvement: improvement_id,
                    at: Some(pos),
                    turns_remaining: Some(next_remaining),
                });
                unit.moves_left = 0;
            }
            Vec::new()
        }
    }

    fn tick_repair_improvement_orders(
        &mut self,
        unit_id: UnitId,
        at: Option<Hex>,
        turns_remaining: Option<u8>,
    ) -> Vec<Event> {
        let Some(unit) = self.state.units.get(unit_id) else {
            return Vec::new();
        };
        if unit.owner != self.state.current_player {
            return Vec::new();
        }

        let pos = unit.position;
        let target = at.unwrap_or(pos);
        if target != pos {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
            }
            return vec![Event::OrdersInterrupted {
                unit: unit_id,
                at: pos,
                reason: MovementStopReason::Blocked { attempted: target },
            }];
        }

        let Some(tile) = self.state.map.get(pos) else {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
            }
            return Vec::new();
        };
        let Some(improvement) = tile.improvement.as_ref() else {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
            }
            return Vec::new();
        };
        if tile.owner != Some(unit.owner) || tile.city.is_some() || !improvement.pillaged {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
            }
            return Vec::new();
        }

        let repair_time = self.state.rules.improvement(improvement.id).repair_time;
        let remaining = turns_remaining.unwrap_or(repair_time).max(1);
        let next_remaining = remaining.saturating_sub(1);

        if next_remaining == 0 {
            let (improvement_id, tier, repaired) = {
                let Some(tile) = self.state.map.get_mut(pos) else {
                    return Vec::new();
                };
                let Some(improvement) = tile.improvement.as_mut() else {
                    return Vec::new();
                };
                if !improvement.pillaged {
                    (improvement.id, improvement.tier, false)
                } else {
                    improvement.pillaged = false;
                    improvement.worked_turns = 0;
                    (improvement.id, improvement.tier, true)
                }
            };

            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = None;
                unit.moves_left = 0;
            }

            if repaired {
                vec![
                    Event::ImprovementRepaired {
                        hex: pos,
                        improvement: improvement_id,
                        tier,
                    },
                    Event::OrdersCompleted { unit: unit_id },
                ]
            } else {
                vec![Event::OrdersInterrupted {
                    unit: unit_id,
                    at: pos,
                    reason: MovementStopReason::Blocked { attempted: pos },
                }]
            }
        } else {
            if let Some(unit) = self.state.units.get_mut(unit_id) {
                unit.orders = Some(UnitOrders::RepairImprovement {
                    at: Some(pos),
                    turns_remaining: Some(next_remaining),
                });
                unit.moves_left = 0;
            }
            Vec::new()
        }
    }

    fn execute_goto_orders(
        &mut self,
        unit_id: UnitId,
        mut path: Vec<Hex>,
        occupancy: &mut [Option<UnitId>],
        zoc: &[bool],
    ) -> Vec<Event> {
        let Some(unit) = self.state.units.get_mut(unit_id) else {
            return Vec::new();
        };
        let player = self.state.current_player;
        if unit.owner != player {
            return Vec::new();
        }

        // Drop any leading "current position" entries to make client-sent paths robust.
        loop {
            let Some(raw_first) = path.first().copied() else {
                break;
            };
            let Some(first) = self.state.map.normalize_hex(raw_first) else {
                break;
            };
            if first != unit.position {
                break;
            }
            path.remove(0);
        }

        let Some(mut cursor_index) = self.state.map.index_of(unit.position) else {
            return Vec::new();
        };

        let mut moved = Vec::new();
        let mut stop_reason: Option<MovementStopReason> = None;

        while unit.moves_left > 0 {
            let Some(raw_step) = path.first().copied() else {
                break;
            };
            let Some(step) = self.state.map.normalize_hex(raw_step) else {
                break;
            };
            if step == unit.position {
                path.remove(0);
                continue;
            }
            if !self.state.map.is_neighbor(unit.position, step) {
                break;
            }

            let Some(step_index) = self.state.map.index_of(step) else {
                break;
            };
            if occupancy.get(step_index).copied().flatten().is_some() {
                stop_reason = Some(MovementStopReason::Blocked { attempted: step });
                break;
            }
            let Some(cost) = movement_cost_to_enter(&self.state.map, &self.state.rules, step_index)
            else {
                break;
            };
            if unit.moves_left < cost {
                break;
            }

            unit.moves_left -= cost;
            unit.position = step;
            unit.fortified_turns = 0;

            occupancy[cursor_index] = None;
            occupancy[step_index] = Some(unit_id);
            cursor_index = step_index;

            moved.push(step);
            path.remove(0);

            if zoc.get(step_index).copied().unwrap_or(false) {
                unit.moves_left = 0;
                stop_reason = Some(MovementStopReason::EnteredEnemyZoc);
                break;
            }
        }

        let mut events = Vec::new();
        if !moved.is_empty() {
            events.push(Event::UnitMoved {
                unit: unit_id,
                path: moved,
                moves_left: unit.moves_left,
            });
        }

        if path.is_empty() {
            unit.orders = None;
            events.push(Event::OrdersCompleted { unit: unit_id });
        } else {
            unit.orders = Some(UnitOrders::Goto { path });
            if let Some(reason) = stop_reason {
                events.push(Event::OrdersInterrupted {
                    unit: unit_id,
                    at: unit.position,
                    reason,
                });
            }
        }

        events.push(Event::UnitUpdated {
            unit: UnitSnapshot {
                id: unit_id,
                type_id: unit.type_id,
                owner: unit.owner,
                pos: unit.position,
                hp: unit.hp,
                moves_left: unit.moves_left,
                veteran_level: unit.veteran_level(),
                orders: unit.orders.clone(),
                automated: unit.automated,
            },
        });

        events
    }

    fn process_world_turn(&mut self) -> Vec<Event> {
        let rules = &self.state.rules;
        let player_count = self.state.players.len();
        let mut science_income = vec![0i32; player_count];
        let mut culture_income = vec![0i32; player_count];
        let mut gold_income = vec![0i32; player_count];
        let mut building_maintenance = vec![0i32; player_count];
        let mut city_maintenance = vec![0i32; player_count];
        let mut city_count = vec![0i32; player_count];
        let mut local_admin_total = vec![0i32; player_count];

        // Capital is the first-founded city (stable entity ID order) per player.
        let mut capitals = vec![None; player_count];
        for (_city_id, city) in self.state.cities.iter_ordered() {
            let idx = city.owner.0 as usize;
            if idx >= capitals.len() {
                continue;
            }
            if capitals[idx].is_none() {
                capitals[idx] = Some(city.position);
            }
        }

        let mut events = Vec::new();

        // War weariness tick (temporary stand-in for full stability/amenities).
        let at_war = self
            .state
            .players
            .iter()
            .map(|p| self.state.diplomacy.any_war(p.id))
            .collect::<Vec<_>>();
        for (player, at_war) in self.state.players.iter_mut().zip(at_war) {
            if at_war {
                player.war_weariness = player.war_weariness.saturating_add(1);
            } else {
                player.war_weariness = player.war_weariness.saturating_sub(1);
            }
        }

        // Cities process in stable entity ID order.
        for (city_id, city) in self.state.cities.iter_ordered_mut() {
            let player = self
                .state
                .players
                .get(city.owner.0 as usize)
                .unwrap_or(&self.state.players[0]);

            let worked_tiles = city.compute_worked_tiles(&self.state.map, rules);
            let yields = city.yields(&self.state.map, rules, player);
            if let Some(total) = science_income.get_mut(city.owner.0 as usize) {
                *total += yields.science;
            }
            if let Some(total) = culture_income.get_mut(city.owner.0 as usize) {
                *total += yields.culture;
            }
            if let Some(total) = gold_income.get_mut(city.owner.0 as usize) {
                *total += yields.gold;
            }

            // Maintenance: base + distance + instability (+ occupation later).
            let owner_idx = city.owner.0 as usize;
            if let Some(slot) = city_count.get_mut(owner_idx) {
                *slot += 1;
            }
            let capital = capitals
                .get(owner_idx)
                .copied()
                .flatten()
                .unwrap_or(city.position);
            let distance = city.position.distance(capital);
            let gov_admin = player
                .government
                .and_then(|gov| rules.governments.get(gov.raw as usize))
                .map(|g| g.admin)
                .unwrap_or(0);
            let local_admin = city
                .buildings
                .iter()
                .map(|&b| rules.building(b).admin)
                .sum::<i32>();
            let instability = (3 - gov_admin - local_admin).max(0);
            let war_penalty = player.war_weariness / 5;
            let upkeep = 5 + distance + instability + war_penalty;

            if let Some(total) = city_maintenance.get_mut(owner_idx) {
                *total += upkeep;
            }
            if let Some(total) = building_maintenance.get_mut(owner_idx) {
                *total += city
                    .buildings
                    .iter()
                    .map(|&b| rules.building(b).maintenance)
                    .sum::<i32>();
            }
            if let Some(total) = local_admin_total.get_mut(owner_idx) {
                *total += local_admin;
            }

            // Growth: each pop consumes 2 food.
            let food_consumption = city.population as i32 * 2;
            let food_surplus = yields.food - food_consumption;
            if food_surplus > 0 {
                city.food_stockpile += food_surplus;
                loop {
                    let needed = city.food_for_growth();
                    if city.food_stockpile < needed {
                        break;
                    }
                    city.food_stockpile -= needed;
                    city.population = city.population.saturating_add(1);
                    events.push(Event::CityGrew {
                        city: city_id,
                        new_pop: city.population,
                    });
                }
            }

            // Production.
            city.production_stockpile += yields.production;
            if let Some(item) = city.producing.clone() {
                match item {
                    ProductionItem::Unit(unit_type) => {
                        let cost = rules.unit_type(unit_type).cost.max(1);
                        if city.production_stockpile >= cost {
                            city.production_stockpile -= cost;
                            city.producing = None;

                            let mut unit =
                                Unit::new_for_tests(unit_type, city.owner, city.position, rules);
                            unit.moves_left = 0;
                            let unit_id = self.state.units.insert(unit);

                            events.push(Event::UnitCreated {
                                unit: unit_id,
                                type_id: unit_type,
                                pos: city.position,
                                owner: city.owner,
                            });
                            events.push(Event::CityProduced {
                                city: city_id,
                                item: ProductionItem::Unit(unit_type),
                            });
                        }
                    }
                    ProductionItem::Building(building_id) => {
                        let cost = rules.building(building_id).cost.max(1);
                        if city.production_stockpile >= cost {
                            city.production_stockpile -= cost;
                            city.producing = None;

                            if !city.buildings.contains(&building_id) {
                                city.buildings.push(building_id);
                                city.buildings.sort();
                            }

                            events.push(Event::CityProduced {
                                city: city_id,
                                item: ProductionItem::Building(building_id),
                            });
                        }
                    }
                }
            }

            // Border growth: add city culture and claim one tile per threshold.
            city.border_progress = city.border_progress.saturating_add(yields.culture);
            let mut newly_claimed = Vec::new();
            loop {
                let cost = 20 + (city.claimed_tiles.len() as i32).saturating_mul(5);
                if city.border_progress < cost {
                    break;
                }
                let Some(next_index) = best_border_claim(&self.state.map, rules, city) else {
                    break;
                };
                let Some(hex) = self.state.map.hex_at_index(next_index) else {
                    break;
                };
                if let Some(tile) = self.state.map.get_mut(hex) {
                    if tile.owner.is_some() {
                        break;
                    }
                    tile.owner = Some(city.owner);
                }
                city.claim_tile_index(next_index);
                city.border_progress -= cost;
                newly_claimed.push(hex);
            }

            if !newly_claimed.is_empty() {
                events.push(Event::BordersExpanded {
                    city: city_id,
                    new_tiles: newly_claimed,
                });
            }

            // Improvement maturation: tiles improve only when worked.
            for hex in worked_tiles {
                let Some(tile) = self.state.map.get_mut(hex) else {
                    continue;
                };
                let Some(improvement) = tile.improvement.as_mut() else {
                    continue;
                };
                if improvement.pillaged {
                    continue;
                }

                let impr = rules.improvement(improvement.id);
                if improvement.tier >= impr.max_tier() {
                    continue;
                }

                let tier = impr.tier(improvement.tier);
                let Some(work_turns) = tier.worked_turns_to_next else {
                    continue;
                };

                improvement.worked_turns = improvement.worked_turns.saturating_add(1);
                if improvement.worked_turns < work_turns {
                    continue;
                }

                improvement.worked_turns = 0;
                improvement.tier = improvement
                    .tier
                    .saturating_add(1)
                    .min(impr.max_tier().max(1));

                events.push(Event::ImprovementMatured {
                    hex,
                    improvement: improvement.id,
                    new_tier: improvement.tier,
                });
            }
        }

        // Trade routes (per-world-turn yields and pillage checks).
        let occupancy = unit_occupancy(&self.state.map, &self.state.units);
        let trade_route_ids = self
            .state
            .trade_routes
            .iter_ordered()
            .map(|(id, _)| id)
            .collect::<Vec<_>>();

        for route_id in trade_route_ids {
            let Some(route) = self.state.trade_routes.get(route_id).cloned() else {
                continue;
            };

            let Some(to_city) = self.state.cities.get(route.to) else {
                let _ = self.state.trade_routes.remove(route_id);
                continue;
            };
            let to_owner = to_city.owner;

            // Auto-cancel illegal external routes.
            if to_owner != route.owner && self.state.diplomacy.is_at_war(route.owner, to_owner) {
                let _ = self.state.trade_routes.remove(route_id);
                continue;
            }

            // Pillage/disrupt if a hostile unit occupies any tile on the route.
            let mut pillaged: Option<(Hex, PlayerId)> = None;
            for &hex in &route.path {
                let Some(index) = self.state.map.index_of(hex) else {
                    continue;
                };
                let Some(unit_id) = occupancy.get(index).copied().flatten() else {
                    continue;
                };
                let Some(unit) = self.state.units.get(unit_id) else {
                    continue;
                };
                if unit.owner == route.owner {
                    continue;
                }
                if self.state.diplomacy.is_at_war(route.owner, unit.owner) {
                    pillaged = Some((hex, unit.owner));
                    break;
                }
            }

            if let Some((hex, by)) = pillaged {
                let _ = self.state.trade_routes.remove(route_id);
                if let Some(p) = self.state.players.get_mut(by.0 as usize) {
                    p.gold = p.gold.saturating_add(15);
                }
                events.push(Event::TradeRoutePillaged {
                    route: route_id,
                    at: hex,
                    by,
                });
                continue;
            }

            // Yields.
            let owner_idx = route.owner.0 as usize;
            if owner_idx >= player_count {
                continue;
            }
            if to_owner == route.owner {
                // Internal trade: steady gold to support infrastructure.
                gold_income[owner_idx] = gold_income[owner_idx].saturating_add(2);
            } else {
                // External trade: more gold + a touch of culture + improved relations.
                gold_income[owner_idx] = gold_income[owner_idx].saturating_add(3);
                culture_income[owner_idx] = culture_income[owner_idx].saturating_add(1);

                let partner_idx = to_owner.0 as usize;
                if partner_idx < player_count {
                    gold_income[partner_idx] = gold_income[partner_idx].saturating_add(1);
                }

                let new_rel = self
                    .state
                    .diplomacy
                    .adjust_relation(route.owner, to_owner, 1);
                events.push(Event::RelationChanged {
                    a: route.owner,
                    b: to_owner,
                    delta: 1,
                    new: new_rel,
                });
            }
        }

        // Supply (per-player) + over-cap penalty.
        let mut supply_used = vec![0i32; player_count];
        for (_unit_id, unit) in self.state.units.iter_ordered() {
            let idx = unit.owner.0 as usize;
            if idx >= player_count {
                continue;
            }
            let utype = rules.unit_type(unit.type_id);
            supply_used[idx] = supply_used[idx].saturating_add(utype.supply_cost.max(0));
        }

        let mut supply_penalty = vec![0i32; player_count];
        for (idx, player) in self.state.players.iter_mut().enumerate() {
            let cities = city_count.get(idx).copied().unwrap_or(0);
            let gov_admin = player
                .government
                .and_then(|gov| rules.governments.get(gov.raw as usize))
                .map(|g| g.admin)
                .unwrap_or(0);
            let local_admin = local_admin_total.get(idx).copied().unwrap_or(0);

            let cap = (4 + cities * 2 + gov_admin * 2 + local_admin).max(0);
            let used = supply_used.get(idx).copied().unwrap_or(0);
            let overage = (used - cap).max(0);
            let penalty = overage.saturating_mul(2);

            player.supply_used = used;
            player.supply_cap = cap;

            if let Some(slot) = supply_penalty.get_mut(idx) {
                *slot = penalty;
            }

            events.push(Event::SupplyUpdated {
                player: player.id,
                used,
                cap,
                overage,
                penalty_gold: penalty,
            });
        }

        // Gold economy (per-player).
        for (idx, player) in self.state.players.iter_mut().enumerate() {
            let income = gold_income.get(idx).copied().unwrap_or(0);
            let b_maint = building_maintenance.get(idx).copied().unwrap_or(0);
            let c_maint = city_maintenance.get(idx).copied().unwrap_or(0);
            let supply = supply_penalty.get(idx).copied().unwrap_or(0);
            player.gold = player
                .gold
                .saturating_add(income - b_maint - c_maint - supply);
        }

        // Research processing (per-player).
        for (player_index, player) in self.state.players.iter_mut().enumerate() {
            let science = science_income.get(player_index).copied().unwrap_or(0);
            if science <= 0 {
                continue;
            }

            let Some(tech) = player.researching else {
                continue;
            };

            let tech_index = tech.raw as usize;
            let Some(tech_def) = rules.techs.get(tech_index) else {
                continue;
            };
            let required = tech_def.cost.max(1);

            player.research_progress = player.research_progress.saturating_add(science);

            if player.research_progress >= required {
                let overflow = player.research_progress - required;
                player.research_progress = required;

                events.push(Event::ResearchProgress {
                    player: player.id,
                    tech,
                    progress: required,
                    required,
                });
                events.push(Event::TechResearched {
                    player: player.id,
                    tech,
                });

                if let Some(slot) = player.known_techs.get_mut(tech_index) {
                    *slot = true;
                }
                player.researching = None;
                player.research_progress = 0;
                player.research_overflow = player.research_overflow.saturating_add(overflow);
            } else {
                events.push(Event::ResearchProgress {
                    player: player.id,
                    tech,
                    progress: player.research_progress,
                    required,
                });
            }
        }

        // Culture milestones → policy pick(s).
        for (player_index, player) in self.state.players.iter_mut().enumerate() {
            let culture = culture_income.get(player_index).copied().unwrap_or(0);
            if culture <= 0 {
                continue;
            }

            player.culture = player.culture.saturating_add(culture);

            loop {
                let cost = 30 + (player.culture_milestones_reached as i32).saturating_mul(15);
                if player.culture < cost {
                    break;
                }

                player.culture -= cost;
                player.culture_milestones_reached =
                    player.culture_milestones_reached.saturating_add(1);
                player.available_policy_picks = player.available_policy_picks.saturating_add(1);
            }
        }

        // Update culture tracking for victory conditions.
        for (player_index, &culture) in culture_income.iter().enumerate() {
            if culture > 0 {
                self.state
                    .victory
                    .add_culture(PlayerId(player_index as u8), culture);
            }
        }

        // Check victory conditions at end of world turn.
        if let Some(victory_event) = self.check_victory_conditions() {
            events.push(victory_event);
        }

        events
    }
}

fn best_border_claim(map: &GameMap, rules: &CompiledRules, city: &City) -> Option<usize> {
    if city.claimed_tiles.is_empty() {
        return None;
    }

    let mut seen = vec![false; map.len()];
    let mut best: Option<(i32, usize)> = None;

    for &owned in &city.claimed_tiles {
        let owned = owned as usize;
        if owned >= map.len() {
            continue;
        }

        for neighbor in map.neighbors_indices(owned).into_iter().flatten() {
            if neighbor >= map.len() || seen[neighbor] {
                continue;
            }
            seen[neighbor] = true;

            let tile = &map.tiles()[neighbor];
            if tile.owner.is_some() {
                continue;
            }

            let score = border_tile_score(rules, tile);
            match best {
                None => best = Some((score, neighbor)),
                Some((best_score, best_index)) => {
                    if score > best_score || (score == best_score && neighbor < best_index) {
                        best = Some((score, neighbor));
                    }
                }
            }
        }
    }

    best.map(|(_, index)| index)
}

fn border_tile_score(rules: &CompiledRules, tile: &crate::map::Tile) -> i32 {
    let terrain = rules.terrain(tile.terrain);
    let mut score = terrain.yields.food * 3 + terrain.yields.production * 2 + terrain.yields.gold;
    if tile.resource.is_some() {
        score += 4;
    }
    score
}

fn movement_cost_to_enter(map: &GameMap, rules: &CompiledRules, tile_index: usize) -> Option<i32> {
    let tile = map.tiles().get(tile_index)?;
    let terrain = rules.terrain(tile.terrain);
    if terrain.impassable {
        None
    } else {
        Some(terrain.move_cost.max(1))
    }
}

fn unit_occupancy(map: &GameMap, units: &EntityStore<Unit>) -> Vec<Option<UnitId>> {
    let mut occupancy = vec![None; map.len()];
    for (unit_id, unit) in units.iter_ordered() {
        let Some(index) = map.index_of(unit.position) else {
            continue;
        };
        occupancy[index] = Some(unit_id);
    }
    occupancy
}

fn unit_occupancy_visible_to_player(
    map: &GameMap,
    units: &EntityStore<Unit>,
    player: PlayerId,
    visible: &[bool],
) -> Vec<Option<UnitId>> {
    let mut occupancy = vec![None; map.len()];
    for (unit_id, unit) in units.iter_ordered() {
        let Some(index) = map.index_of(unit.position) else {
            continue;
        };
        if unit.owner != player && !visible.get(index).copied().unwrap_or(false) {
            continue;
        }
        occupancy[index] = Some(unit_id);
    }
    occupancy
}

fn unit_exerts_zoc(rules: &CompiledRules, unit: &Unit) -> bool {
    let utype = rules.unit_type(unit.type_id);
    utype.attack > 0 || utype.defense > 0
}

fn enemy_zoc(
    map: &GameMap,
    rules: &CompiledRules,
    units: &EntityStore<Unit>,
    player: PlayerId,
) -> Vec<bool> {
    let mut zoc = vec![false; map.len()];
    for (_unit_id, unit) in units.iter_ordered() {
        if unit.owner == player {
            continue;
        }
        if !unit_exerts_zoc(rules, unit) {
            continue;
        }
        let Some(index) = map.index_of(unit.position) else {
            continue;
        };
        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            zoc[neighbor] = true;
        }
    }
    zoc
}

fn enemy_zoc_visible_to_player(
    map: &GameMap,
    rules: &CompiledRules,
    units: &EntityStore<Unit>,
    player: PlayerId,
    visible: &[bool],
) -> Vec<bool> {
    let mut zoc = vec![false; map.len()];
    for (_unit_id, unit) in units.iter_ordered() {
        if unit.owner == player {
            continue;
        }
        if !unit_exerts_zoc(rules, unit) {
            continue;
        }
        let Some(index) = map.index_of(unit.position) else {
            continue;
        };
        if !visible.get(index).copied().unwrap_or(false) {
            continue;
        }
        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            zoc[neighbor] = true;
        }
    }
    zoc
}

fn best_path_to_destination(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    goal: usize,
    max_moves: i32,
    occupancy: &[Option<UnitId>],
    zoc: &[bool],
) -> Vec<usize> {
    let max_moves = max_moves.max(0);

    let (move_costs, move_prev) =
        movement_range_with_prev(map, rules, start, max_moves, occupancy, zoc);
    let remaining_costs = remaining_costs_to_goal(map, rules, goal, occupancy);

    let zoc_penalty: i32 = 1000;

    let mut best_index: Option<usize> = None;
    let mut best_key: Option<(i32, i32, usize)> = None;

    for index in 0..map.len() {
        let cost = move_costs.get(index).copied().unwrap_or(i32::MAX);
        if cost == i32::MAX || cost > max_moves {
            continue;
        }

        let in_zoc = index != start && zoc.get(index).copied().unwrap_or(false);
        let can_stop_here = index == goal
            || in_zoc
            || cost == max_moves
            || {
                // If we can't spend all moves (because the cheapest adjacent step is too expensive),
                // this is still a valid end-of-turn stop.
                let mut can_continue = false;
                for neighbor in map.neighbors_indices(index).into_iter().flatten() {
                    if occupancy.get(neighbor).copied().flatten().is_some() {
                        continue;
                    }
                    let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                        continue;
                    };
                    let new_cost = cost.saturating_add(step_cost);
                    if new_cost <= max_moves {
                        can_continue = true;
                        break;
                    }
                }
                !can_continue
            };
        if !can_stop_here {
            continue;
        }

        let remaining = remaining_costs.get(index).copied().unwrap_or(i32::MAX);
        if remaining == i32::MAX {
            continue;
        }

        let penalty = if in_zoc && index != goal {
            zoc_penalty
        } else {
            0
        };

        let score = remaining.saturating_add(penalty);
        let unused_moves = max_moves.saturating_sub(cost).max(0);
        let key = (score, unused_moves, index);

        if best_key.is_none_or(|k| key < k) {
            best_key = Some(key);
            best_index = Some(index);
        }
    }

    let Some(best_index) = best_index else {
        return Vec::new();
    };

    let mut prefix = reconstruct_prev_path(&move_prev, start, best_index);
    if prefix.is_empty() && best_index != start {
        return Vec::new();
    }

    if best_index == goal {
        return prefix;
    }

    let mut occupancy_for_suffix = occupancy.to_vec();
    if let Some(slot) = occupancy_for_suffix.get_mut(start) {
        *slot = None;
    }
    let suffix = shortest_path(map, rules, best_index, goal, &occupancy_for_suffix);
    if suffix.is_empty() {
        return Vec::new();
    }

    prefix.extend(suffix);
    prefix
}

fn best_path_to_destination_restricted(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    goal: usize,
    max_moves: i32,
    occupancy: &[Option<UnitId>],
    zoc: &[bool],
    explored: &[bool],
) -> Vec<usize> {
    if !explored.get(goal).copied().unwrap_or(false) {
        return Vec::new();
    }

    let max_moves = max_moves.max(0);

    let (move_costs, move_prev) =
        movement_range_with_prev_restricted(map, rules, start, max_moves, occupancy, zoc, explored);
    let remaining_costs = remaining_costs_to_goal_restricted(map, rules, goal, occupancy, explored);

    let zoc_penalty: i32 = 1000;

    let mut best_index: Option<usize> = None;
    let mut best_key: Option<(i32, i32, usize)> = None;

    for index in 0..map.len() {
        if !explored.get(index).copied().unwrap_or(false) {
            continue;
        }
        let cost = move_costs.get(index).copied().unwrap_or(i32::MAX);
        if cost == i32::MAX || cost > max_moves {
            continue;
        }

        let in_zoc = index != start && zoc.get(index).copied().unwrap_or(false);
        let can_stop_here = index == goal
            || in_zoc
            || cost == max_moves
            || {
                let mut can_continue = false;
                for neighbor in map.neighbors_indices(index).into_iter().flatten() {
                    if !explored.get(neighbor).copied().unwrap_or(false) {
                        continue;
                    }
                    if occupancy.get(neighbor).copied().flatten().is_some() {
                        continue;
                    }
                    let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                        continue;
                    };
                    let new_cost = cost.saturating_add(step_cost);
                    if new_cost <= max_moves {
                        can_continue = true;
                        break;
                    }
                }
                !can_continue
            };
        if !can_stop_here {
            continue;
        }

        let remaining = remaining_costs.get(index).copied().unwrap_or(i32::MAX);
        if remaining == i32::MAX {
            continue;
        }

        let penalty = if in_zoc && index != goal {
            zoc_penalty
        } else {
            0
        };

        let score = remaining.saturating_add(penalty);
        let unused_moves = max_moves.saturating_sub(cost).max(0);
        let key = (score, unused_moves, index);

        if best_key.is_none_or(|k| key < k) {
            best_key = Some(key);
            best_index = Some(index);
        }
    }

    let Some(best_index) = best_index else {
        return Vec::new();
    };

    let mut prefix = reconstruct_prev_path(&move_prev, start, best_index);
    if prefix.is_empty() && best_index != start {
        return Vec::new();
    }

    if best_index == goal {
        return prefix;
    }

    let mut occupancy_for_suffix = occupancy.to_vec();
    if let Some(slot) = occupancy_for_suffix.get_mut(start) {
        *slot = None;
    }
    let suffix = shortest_path_restricted(map, rules, best_index, goal, &occupancy_for_suffix, explored);
    if suffix.is_empty() {
        return Vec::new();
    }

    prefix.extend(suffix);
    prefix
}

fn movement_range_with_prev(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    max_moves: i32,
    occupancy: &[Option<UnitId>],
    zoc: &[bool],
) -> (Vec<i32>, Vec<Option<usize>>) {
    let mut dist = vec![i32::MAX; map.len()];
    let mut prev = vec![None; map.len()];
    dist[start] = 0;

    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, start)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }

        if index != start && zoc.get(index).copied().unwrap_or(false) {
            continue;
        }

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            if occupancy.get(neighbor).copied().flatten().is_some() {
                continue;
            }
            let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                continue;
            };
            let new_cost = cost.saturating_add(step_cost);
            if new_cost > max_moves {
                continue;
            }
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                prev[neighbor] = Some(index);
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    (dist, prev)
}

fn movement_range_with_prev_restricted(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    max_moves: i32,
    occupancy: &[Option<UnitId>],
    zoc: &[bool],
    explored: &[bool],
) -> (Vec<i32>, Vec<Option<usize>>) {
    let mut dist = vec![i32::MAX; map.len()];
    let mut prev = vec![None; map.len()];
    dist[start] = 0;

    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, start)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }

        if index != start && zoc.get(index).copied().unwrap_or(false) {
            continue;
        }

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            if !explored.get(neighbor).copied().unwrap_or(false) {
                continue;
            }
            if occupancy.get(neighbor).copied().flatten().is_some() {
                continue;
            }
            let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                continue;
            };
            let new_cost = cost.saturating_add(step_cost);
            if new_cost > max_moves {
                continue;
            }
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                prev[neighbor] = Some(index);
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    (dist, prev)
}

fn reconstruct_prev_path(prev: &[Option<usize>], start: usize, goal: usize) -> Vec<usize> {
    if start == goal {
        return Vec::new();
    }

    let mut indices = Vec::new();
    let mut cur = goal;
    while cur != start {
        indices.push(cur);
        let Some(p) = prev.get(cur).copied().flatten() else {
            return Vec::new();
        };
        cur = p;
    }
    indices.reverse();
    indices
}

fn remaining_costs_to_goal(
    map: &GameMap,
    rules: &CompiledRules,
    goal: usize,
    occupancy: &[Option<UnitId>],
) -> Vec<i32> {
    let mut dist = vec![i32::MAX; map.len()];
    dist[goal] = 0;

    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, goal)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }

        // Can't enter occupied tiles (goal was validated separately).
        if index != goal && occupancy.get(index).copied().flatten().is_some() {
            continue;
        }

        let Some(step_cost) = movement_cost_to_enter(map, rules, index) else {
            continue;
        };

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            let new_cost = cost.saturating_add(step_cost);
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    dist
}

fn remaining_costs_to_goal_restricted(
    map: &GameMap,
    rules: &CompiledRules,
    goal: usize,
    occupancy: &[Option<UnitId>],
    explored: &[bool],
) -> Vec<i32> {
    let mut dist = vec![i32::MAX; map.len()];
    dist[goal] = 0;

    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, goal)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }

        if !explored.get(index).copied().unwrap_or(false) {
            continue;
        }

        // Can't enter occupied tiles (goal was validated separately).
        if index != goal && occupancy.get(index).copied().flatten().is_some() {
            continue;
        }

        let Some(step_cost) = movement_cost_to_enter(map, rules, index) else {
            continue;
        };

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            if !explored.get(neighbor).copied().unwrap_or(false) {
                continue;
            }
            let new_cost = cost.saturating_add(step_cost);
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    dist
}

fn movement_range(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    max_moves: i32,
    occupancy: &[Option<UnitId>],
    zoc: &[bool],
) -> Vec<Hex> {
    if max_moves <= 0 {
        return map.hex_at_index(start).into_iter().collect::<Vec<_>>();
    }

    let mut dist = vec![i32::MAX; map.len()];
    dist[start] = 0;

    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, start)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }

        if index != start && zoc.get(index).copied().unwrap_or(false) {
            continue;
        }

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            if occupancy.get(neighbor).copied().flatten().is_some() {
                continue;
            }
            let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                continue;
            };
            let new_cost = cost.saturating_add(step_cost);
            if new_cost > max_moves {
                continue;
            }
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    let mut out = Vec::new();
    for (index, &cost) in dist.iter().enumerate() {
        if cost == i32::MAX || cost > max_moves {
            continue;
        }
        if let Some(hex) = map.hex_at_index(index) {
            out.push(hex);
        }
    }
    out
}

fn shortest_path(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    goal: usize,
    occupancy: &[Option<UnitId>],
) -> Vec<usize> {
    let mut dist = vec![i32::MAX; map.len()];
    let mut prev = vec![None; map.len()];

    dist[start] = 0;
    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, start)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }
        if index == goal {
            break;
        }

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            if occupancy.get(neighbor).copied().flatten().is_some() {
                continue;
            }
            let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                continue;
            };
            let new_cost = cost.saturating_add(step_cost);
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                prev[neighbor] = Some(index);
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    if start == goal || prev[goal].is_none() {
        return Vec::new();
    }

    let mut indices = Vec::new();
    let mut cur = goal;
    while cur != start {
        indices.push(cur);
        let Some(p) = prev[cur] else {
            return Vec::new();
        };
        cur = p;
    }

    indices.reverse();
    indices
}

fn shortest_path_restricted(
    map: &GameMap,
    rules: &CompiledRules,
    start: usize,
    goal: usize,
    occupancy: &[Option<UnitId>],
    explored: &[bool],
) -> Vec<usize> {
    if !explored.get(goal).copied().unwrap_or(false) {
        return Vec::new();
    }

    let mut dist = vec![i32::MAX; map.len()];
    let mut prev = vec![None; map.len()];

    dist[start] = 0;
    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    heap.push(Reverse((0, start)));

    while let Some(Reverse((cost, index))) = heap.pop() {
        if cost != dist[index] {
            continue;
        }
        if index == goal {
            break;
        }

        for neighbor in map.neighbors_indices(index).into_iter().flatten() {
            if !explored.get(neighbor).copied().unwrap_or(false) {
                continue;
            }
            if occupancy.get(neighbor).copied().flatten().is_some() {
                continue;
            }
            let Some(step_cost) = movement_cost_to_enter(map, rules, neighbor) else {
                continue;
            };
            let new_cost = cost.saturating_add(step_cost);
            if new_cost < dist[neighbor] {
                dist[neighbor] = new_cost;
                prev[neighbor] = Some(index);
                heap.push(Reverse((new_cost, neighbor)));
            }
        }
    }

    if start == goal || prev[goal].is_none() {
        return Vec::new();
    }

    let mut indices = Vec::new();
    let mut cur = goal;
    while cur != start {
        indices.push(cur);
        let Some(p) = prev[cur] else {
            return Vec::new();
        };
        cur = p;
    }

    indices.reverse();
    indices
}

fn ceil_div_i32(numer: i32, denom: i32) -> i32 {
    if denom <= 0 {
        return 0;
    }
    if numer <= 0 {
        return 0;
    }
    (numer + denom - 1) / denom
}

fn promise_sort_key(p: &TurnPromise) -> (i32, u8, u64) {
    match p {
        TurnPromise::TechPickRequired { player } => (0, 0, 0x1000_0000_0000_0000 | u64::from(player.0)),
        TurnPromise::CityProductionPickRequired { city } => (0, 0, 0x2000_0000_0000_0000 | city.to_raw()),
        TurnPromise::PolicyPickAvailable { player, .. } => (0, 0, u64::from(player.0)),
        TurnPromise::IdleWorker { unit, .. } => (0, 1, unit.to_raw()),
        TurnPromise::WorkerTask { unit, turns, .. } => (i32::from(*turns), 1, unit.to_raw()),
        TurnPromise::CityProduction { city, turns, .. } => (*turns, 2, city.to_raw()),
        TurnPromise::CityGrowth { city, turns } => (*turns, 3, city.to_raw()),
        TurnPromise::BorderExpansion { city, turns } => (*turns, 4, city.to_raw()),
        TurnPromise::ResearchComplete {
            player,
            tech,
            turns,
        } => (*turns, 5, (u64::from(player.0) << 32) | (tech.raw as u64)),
        TurnPromise::CultureMilestone { player, turns } => (*turns, 6, u64::from(player.0)),
    }
}

// =============================================================================
// Chronicle Helper Functions
// =============================================================================

/// Categories for filtering chronicle events in the timeline UI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChronicleCategory {
    City,
    Production,
    Research,
    Diplomacy,
    Military,
    Economy,
}

/// Determine the category of a chronicle event.
fn chronicle_category(event: &ChronicleEvent) -> ChronicleCategory {
    match event {
        ChronicleEvent::CityFounded { .. }
        | ChronicleEvent::CityConquered { .. }
        | ChronicleEvent::CityGrew { .. }
        | ChronicleEvent::BorderExpanded { .. } => ChronicleCategory::City,

        ChronicleEvent::WonderCompleted { .. }
        | ChronicleEvent::UnitTrained { .. }
        | ChronicleEvent::BuildingConstructed { .. } => ChronicleCategory::Production,

        ChronicleEvent::TechResearched { .. }
        | ChronicleEvent::PolicyAdopted { .. }
        | ChronicleEvent::GovernmentReformed { .. } => ChronicleCategory::Research,

        ChronicleEvent::WarDeclared { .. } | ChronicleEvent::PeaceDeclared { .. } => {
            ChronicleCategory::Diplomacy
        }

        ChronicleEvent::BattleEnded { .. } | ChronicleEvent::UnitPromoted { .. } => {
            ChronicleCategory::Military
        }

        ChronicleEvent::ImprovementBuilt { .. }
        | ChronicleEvent::ImprovementMatured { .. }
        | ChronicleEvent::ImprovementPillaged { .. }
        | ChronicleEvent::ImprovementRepaired { .. }
        | ChronicleEvent::TradeRouteEstablished { .. }
        | ChronicleEvent::TradeRoutePillaged { .. } => ChronicleCategory::Economy,
    }
}

/// Check if a chronicle event involves a specific player.
fn chronicle_involves_player(event: &ChronicleEvent, player: PlayerId) -> bool {
    match event {
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::{load_rules, RulesSource};

    fn engine_from_state(state: GameState) -> GameEngine {
        GameEngine {
            init: None,
            command_log: Vec::new(),
            state,
        }
    }

    #[test]
    fn end_turn_advances_player_and_turn() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(10, 2, rules);
        assert_eq!(engine.state().turn, 1);
        assert_eq!(engine.state().current_player, PlayerId(0));

        engine.apply_command(Command::EndTurn);
        assert_eq!(engine.state().turn, 1);
        assert_eq!(engine.state().current_player, PlayerId(1));

        engine.apply_command(Command::EndTurn);
        assert_eq!(engine.state().turn, 2);
        assert_eq!(engine.state().current_player, PlayerId(0));
    }

    #[test]
    fn end_turn_auto_runs_ai_players() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(10, 2, rules);
        engine.state_mut().players[1].is_ai = true;

        engine.apply_command(Command::EndTurn);

        assert_eq!(engine.state().turn, 2);
        assert_eq!(engine.state().current_player, PlayerId(0));
        assert!(engine
            .state()
            .cities
            .iter_ordered()
            .any(|(_id, city)| city.owner == PlayerId(1)));
    }

    #[test]
    fn movement_range_respects_costs_and_wrap() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let hills = rules.terrain_id("hills").unwrap();

        let mut map = GameMap::new(5, 1, true, plains);
        map.get_mut(Hex { q: 1, r: 0 }).unwrap().terrain = hills;

        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        let unit_type = state.rules.unit_type_id("scout").unwrap(); // moves=2
        let unit_id = state.units.insert(Unit::new_for_tests(
            unit_type,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &state.rules,
        ));

        let engine = engine_from_state(state);
        let range = engine.query_movement_range(unit_id);

        assert!(!range.contains(&Hex { q: 2, r: 0 }));
        assert!(range.contains(&Hex { q: 4, r: 0 }));
    }

    #[test]
    fn move_unit_allows_wrap_neighbor_and_normalizes_hex() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 1, true, plains);
        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let unit_type = engine.state.rules.unit_type_id("scout").unwrap();
        let unit_id = engine.state.units.insert(Unit::new_for_tests(
            unit_type,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));

        let events = engine
            .try_apply_command(Command::MoveUnit {
                unit: unit_id,
                path: vec![Hex { q: -1, r: 0 }],
            })
            .expect("move ok");

        assert!(events.iter().any(|e| matches!(e, Event::UnitMoved { .. })));
        let unit = engine.state.units.get(unit_id).unwrap();
        assert_eq!(unit.position, Hex { q: 4, r: 0 });
    }

    #[test]
    fn world_turn_processes_city_growth_and_production() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 5, true, plains);
        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        state.spawn_starting_units();
        let mut engine = engine_from_state(state);

        let settler_type = engine.state.rules.unit_type_id("settler").unwrap();
        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| {
                (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id)
            })
            .expect("starting settler");

        let events = engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Testopolis".to_string(),
            })
            .expect("found city ok");

        let city_id = events
            .iter()
            .find_map(|e| match e {
                Event::CityFounded { city, .. } => Some(*city),
                _ => None,
            })
            .expect("CityFounded event");

        let monument_id = *engine
            .state
            .rules
            .building_ids
            .get("monument")
            .expect("monument id");
        engine
            .try_apply_command(Command::SetProduction {
                city: city_id,
                item: ProductionItem::Building(monument_id),
            })
            .expect("set production ok");

        let (food_surplus, production_per_turn, food_for_growth, production_cost) = {
            let city = engine.state.cities.get(city_id).unwrap();
            let player = &engine.state.players[city.owner.0 as usize];
            let yields = city.yields(&engine.state.map, &engine.state.rules, player);
            let food_surplus = yields.food - city.population as i32 * 2;
            assert!(food_surplus > 0, "expected positive food surplus");
            assert!(yields.production > 0, "expected positive production");
            let cost = engine.state.rules.building(monument_id).cost.max(1);
            (food_surplus, yields.production, city.food_for_growth(), cost)
        };

        // Make it complete in one world-turn tick.
        {
            let city = engine.state.cities.get_mut(city_id).unwrap();
            city.food_stockpile = food_for_growth - food_surplus;
            city.production_stockpile = production_cost - production_per_turn;
        }

        engine.apply_command(Command::EndTurn); // -> P1
        let end_events = engine.apply_command(Command::EndTurn); // -> P0 (world tick)
        assert!(end_events
            .iter()
            .any(|e| matches!(e, Event::CityGrew { city, .. } if *city == city_id)));
        assert!(end_events
            .iter()
            .any(|e| matches!(e, Event::CityProduced { city, .. } if *city == city_id)));

        let city = engine.state.cities.get(city_id).unwrap();
        assert_eq!(city.population, 2);
        assert!(city.buildings.contains(&monument_id));
        assert!(city.producing.is_none());
    }

    #[test]
    fn research_advances_and_completes_with_overflow() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);

        let settler_type = engine.state.rules.unit_type_id("settler").unwrap();
        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.type_id == settler_type).then_some(id))
            .expect("starting settler");

        engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Testopolis".to_string(),
            })
            .expect("found city ok");

        let city_id = engine
            .state
            .cities
            .iter_ordered()
            .next()
            .map(|(id, _)| id)
            .expect("city exists");
        engine.state.cities.get_mut(city_id).unwrap().population = 50;

        let pottery = *engine
            .state
            .rules
            .tech_ids
            .get("pottery")
            .expect("pottery id");
        let writing = *engine
            .state
            .rules
            .tech_ids
            .get("writing")
            .expect("writing id");

        engine
            .try_apply_command(Command::SetResearch { tech: pottery })
            .expect("set research ok");

        let events = engine.apply_command(Command::EndTurn);
        assert!(events.iter().any(|e| matches!(
            e,
            Event::TechResearched { player, tech } if *player == PlayerId(0) && *tech == pottery
        )));

        let player = &engine.state.players[0];
        assert!(player.known_techs[pottery.raw as usize]);
        assert_eq!(player.researching, None);
        assert_eq!(player.research_overflow, 25);

        engine
            .try_apply_command(Command::SetResearch { tech: writing })
            .expect("set research writing ok");
        assert_eq!(engine.state.players[0].research_progress, 25);
    }

    #[test]
    fn set_research_rejects_unmet_prerequisites() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);
        let writing = *engine
            .state
            .rules
            .tech_ids
            .get("writing")
            .expect("writing id");

        let err = engine
            .try_apply_command(Command::SetResearch { tech: writing })
            .expect_err("should reject prereqs");
        assert!(matches!(err, GameError::TechPrerequisitesNotMet));
    }

    #[test]
    fn culture_milestones_grant_policy_picks() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);

        let settler_type = engine.state.rules.unit_type_id("settler").unwrap();
        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.type_id == settler_type).then_some(id))
            .expect("starting settler");

        engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Testopolis".to_string(),
            })
            .expect("found city ok");

        engine.state.players[0].culture = 29;
        engine.state.players[0].culture_milestones_reached = 0;

        engine.apply_command(Command::EndTurn);

        let player = &engine.state.players[0];
        assert_eq!(player.culture, 0);
        assert_eq!(player.culture_milestones_reached, 1);
        assert_eq!(player.available_policy_picks, 1);
    }

    #[test]
    fn adopt_policy_consumes_pick_and_affects_city_yields() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);

        let settler_type = engine.state.rules.unit_type_id("settler").unwrap();
        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.type_id == settler_type).then_some(id))
            .expect("starting settler");

        engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Testopolis".to_string(),
            })
            .expect("found city ok");

        let scholarship = *engine
            .state
            .rules
            .policy_ids
            .get("scholarship")
            .expect("policy id");

        engine.state.players[0].available_policy_picks = 1;
        let events = engine
            .try_apply_command(Command::AdoptPolicy {
                policy: scholarship,
            })
            .expect("adopt ok");
        assert!(events
            .iter()
            .any(|e| matches!(e, Event::PolicyAdopted { policy, .. } if *policy == scholarship)));

        let city_id = engine
            .state
            .cities
            .iter_ordered()
            .next()
            .map(|(id, _)| id)
            .expect("city exists");
        let city = engine.state.cities.get(city_id).unwrap();
        let yields = city.yields(
            &engine.state.map,
            &engine.state.rules,
            &engine.state.players[0],
        );
        assert_eq!(yields.science, city.population as i32 + 1);
    }

    #[test]
    fn policy_tenure_scales_with_era_progress() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);

        let settler_type = engine.state.rules.unit_type_id("settler").unwrap();
        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.type_id == settler_type).then_some(id))
            .expect("starting settler");

        engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Testopolis".to_string(),
            })
            .expect("found city ok");

        let academy = *engine
            .state
            .rules
            .policy_ids
            .get("academy")
            .expect("policy id");
        let pottery = *engine
            .state
            .rules
            .tech_ids
            .get("pottery")
            .expect("pottery id");
        let writing = *engine
            .state
            .rules
            .tech_ids
            .get("writing")
            .expect("writing id");

        let city_id = engine
            .state
            .cities
            .iter_ordered()
            .next()
            .map(|(id, _)| id)
            .expect("city exists");
        engine.state.cities.get_mut(city_id).unwrap().population = 50;

        engine.state.players[0].available_policy_picks = 1;
        engine
            .try_apply_command(Command::AdoptPolicy { policy: academy })
            .expect("adopt ok");

        let city = engine.state.cities.get(city_id).unwrap();
        let before = city.yields(
            &engine.state.map,
            &engine.state.rules,
            &engine.state.players[0],
        );

        engine.state.players[0].known_techs[pottery.raw as usize] = true;
        engine.state.players[0].known_techs[writing.raw as usize] = true;

        let after = city.yields(
            &engine.state.map,
            &engine.state.rules,
            &engine.state.players[0],
        );

        // Academy gives +1 science per pop; tenure adds +10% at Classical (50 → 55).
        assert_eq!(after.science, before.science + 5);
    }

    #[test]
    fn reform_government_consumes_pick_and_charges_gold_on_switch() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);

        let council = *engine
            .state
            .rules
            .government_ids
            .get("council")
            .expect("council id");
        let bureaucracy = *engine
            .state
            .rules
            .government_ids
            .get("bureaucracy")
            .expect("bureaucracy id");

        engine.state.players[0].available_policy_picks = 1;
        let events = engine
            .try_apply_command(Command::ReformGovernment {
                government: bureaucracy,
            })
            .expect("reform ok");
        assert!(events.iter().any(|e| matches!(
            e,
            Event::GovernmentReformed { old, new, .. } if old.is_none() && *new == bureaucracy
        )));
        assert_eq!(engine.state.players[0].government, Some(bureaucracy));
        assert_eq!(engine.state.players[0].available_policy_picks, 0);

        engine.state.players[0].available_policy_picks = 1;
        let err = engine
            .try_apply_command(Command::ReformGovernment {
                government: council,
            })
            .expect_err("should require gold");
        assert!(matches!(err, GameError::NotEnoughGold));

        engine.state.players[0].gold = 25;
        let events = engine
            .try_apply_command(Command::ReformGovernment {
                government: council,
            })
            .expect("reform ok");
        assert!(events.iter().any(|e| matches!(
            e,
            Event::GovernmentReformed { old, new, .. } if old == &Some(bureaucracy) && *new == council
        )));
        assert_eq!(engine.state.players[0].gold, 0);
        assert_eq!(engine.state.players[0].government, Some(council));
    }

    #[test]
    fn border_growth_claims_tiles_one_at_a_time() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(5, 1, rules);

        let settler_type = engine.state.rules.unit_type_id("settler").unwrap();
        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.type_id == settler_type).then_some(id))
            .expect("starting settler");

        let events = engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Testopolis".to_string(),
            })
            .expect("found city ok");

        let city_id = events
            .iter()
            .find_map(|e| match e {
                Event::CityFounded { city, .. } => Some(*city),
                _ => None,
            })
            .expect("CityFounded event");

        {
            let city = engine.state.cities.get_mut(city_id).unwrap();
            let cost = 20 + (city.claimed_tiles.len() as i32) * 5;
            city.border_progress = cost - 1;
        }

        let end_events = engine.apply_command(Command::EndTurn);
        assert!(end_events.iter().any(|e| matches!(
            e,
            Event::BordersExpanded { city, new_tiles } if *city == city_id && new_tiles.len() == 1
        )));
    }

    #[test]
    fn move_unit_stops_if_destination_is_occupied() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 1, true, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap();
        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));
        let _blocker = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 1, r: 0 },
            &engine.state.rules,
        ));

        let events = engine
            .try_apply_command(Command::MoveUnit {
                unit: mover,
                path: vec![Hex { q: 1, r: 0 }],
            })
            .expect("move ok");

        assert!(events.iter().any(|e| matches!(
            e,
            Event::MovementStopped { unit, at, reason }
                if *unit == mover
                    && *at == Hex { q: 0, r: 0 }
                    && matches!(reason, MovementStopReason::Blocked { attempted } if *attempted == Hex { q: 1, r: 0 })
        )));
    }

    #[test]
    fn entering_enemy_zoc_ends_movement() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 1, true, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap(); // moves=2
        let warrior = engine.state.rules.unit_type_id("warrior").unwrap(); // exerts ZOC

        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));
        let _enemy = engine.state.units.insert(Unit::new_for_tests(
            warrior,
            PlayerId(1),
            Hex { q: 2, r: 0 },
            &engine.state.rules,
        ));

        let events = engine
            .try_apply_command(Command::MoveUnit {
                unit: mover,
                path: vec![Hex { q: 1, r: 0 }, Hex { q: 0, r: 0 }],
            })
            .expect("move ok");

        assert!(events.iter().any(|e| matches!(
            e,
            Event::UnitMoved { unit, path, moves_left }
                if *unit == mover
                    && path.as_slice() == [Hex { q: 1, r: 0 }]
                    && *moves_left == 0
        )));
        assert!(events.iter().any(|e| matches!(
            e,
            Event::MovementStopped { unit, at, reason }
                if *unit == mover
                    && *at == Hex { q: 1, r: 0 }
                    && matches!(reason, MovementStopReason::EnteredEnemyZoc)
        )));

        let unit = engine.state.units.get(mover).unwrap();
        assert_eq!(unit.position, Hex { q: 1, r: 0 });
        assert_eq!(unit.moves_left, 0);
    }

    #[test]
    fn path_preview_reports_moves_exhausted_stop() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(6, 1, false, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap(); // moves=2
        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));

        let preview = engine.query_path_preview(mover, Hex { q: 4, r: 0 });
        assert_eq!(
            preview.full_path.as_slice(),
            [
                Hex { q: 1, r: 0 },
                Hex { q: 2, r: 0 },
                Hex { q: 3, r: 0 },
                Hex { q: 4, r: 0 }
            ]
        );
        assert_eq!(
            preview.this_turn_path.as_slice(),
            [Hex { q: 1, r: 0 }, Hex { q: 2, r: 0 }]
        );
        assert_eq!(preview.stop_at, Hex { q: 2, r: 0 });
        assert!(matches!(
            preview.stop_reason,
            Some(MovementStopReason::MovesExhausted)
        ));
    }

    #[test]
    fn path_preview_allows_terminal_stop_when_remaining_moves_unspendable() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let hills = rules.terrain_id("hills").unwrap();

        let mut map = GameMap::new(3, 1, false, plains);
        map.get_mut(Hex { q: 2, r: 0 }).unwrap().terrain = hills; // move_cost=2

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap(); // moves=2
        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));

        let preview = engine.query_path_preview(mover, Hex { q: 2, r: 0 });
        assert_eq!(
            preview.full_path.as_slice(),
            [Hex { q: 1, r: 0 }, Hex { q: 2, r: 0 }]
        );
        assert_eq!(preview.this_turn_path.as_slice(), [Hex { q: 1, r: 0 }]);
        assert_eq!(preview.stop_at, Hex { q: 1, r: 0 });
        assert!(matches!(
            preview.stop_reason,
            Some(MovementStopReason::MovesExhausted)
        ));
    }

    #[test]
    fn path_preview_reports_zoc_stop() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 2, false, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap(); // moves=2
        let warrior = engine.state.rules.unit_type_id("warrior").unwrap(); // exerts ZOC

        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));
        let _enemy = engine.state.units.insert(Unit::new_for_tests(
            warrior,
            PlayerId(1),
            Hex { q: 2, r: 1 },
            &engine.state.rules,
        ));

        let preview = engine.query_path_preview(mover, Hex { q: 4, r: 0 });
        assert_eq!(
            preview.this_turn_path.as_slice(),
            [Hex { q: 1, r: 0 }, Hex { q: 2, r: 0 }]
        );
        assert_eq!(preview.stop_at, Hex { q: 2, r: 0 });
        assert!(matches!(
            preview.stop_reason,
            Some(MovementStopReason::EnteredEnemyZoc)
        ));
    }

    #[test]
    fn fogged_path_preview_ignores_hidden_enemy_zoc_and_occupancy() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(6, 1, false, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap(); // moves=2, vision=2
        let warrior = engine.state.rules.unit_type_id("warrior").unwrap(); // exerts ZOC

        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));

        // Explore tiles up to q=2, then move away so q=2 stays explored but not visible.
        let _ = engine.update_visibility_for_player(PlayerId(0));
        engine
            .state
            .units
            .get_mut(mover)
            .expect("mover exists")
            .position = Hex { q: 5, r: 0 };
        let _ = engine.update_visibility_for_player(PlayerId(0));

        // Place an enemy on an explored-but-not-visible tile.
        let _enemy = engine.state.units.insert(Unit::new_for_tests(
            warrior,
            PlayerId(1),
            Hex { q: 2, r: 0 },
            &engine.state.rules,
        ));
        let _ = engine.update_visibility_for_player(PlayerId(0));

        let fogged = engine.query_path_preview_for_player(PlayerId(0), mover, Hex { q: 0, r: 0 });
        assert_eq!(
            fogged.full_path.as_slice(),
            [
                Hex { q: 4, r: 0 },
                Hex { q: 3, r: 0 },
                Hex { q: 2, r: 0 },
                Hex { q: 1, r: 0 },
                Hex { q: 0, r: 0 }
            ]
        );
        assert_eq!(fogged.stop_at, Hex { q: 3, r: 0 });
        assert!(matches!(
            fogged.stop_reason,
            Some(MovementStopReason::MovesExhausted)
        ));

        let omniscient = engine.query_path_preview(mover, Hex { q: 0, r: 0 });
        assert!(omniscient.full_path.is_empty());
        assert_eq!(omniscient.stop_at, Hex { q: 5, r: 0 });
    }

    #[test]
    fn goto_orders_execute_across_turns_and_complete() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 1, true, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let warrior = engine.state.rules.unit_type_id("warrior").unwrap(); // moves=1
        let unit_id = engine.state.units.insert(Unit::new_for_tests(
            warrior,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));

        let set_events = engine
            .try_apply_command(Command::SetOrders {
                unit: unit_id,
                orders: UnitOrders::Goto {
                    path: vec![Hex { q: 1, r: 0 }, Hex { q: 2, r: 0 }],
                },
            })
            .expect("set orders ok");

        let unit = engine.state.units.get(unit_id).unwrap();
        assert_eq!(unit.position, Hex { q: 1, r: 0 });
        assert!(matches!(
            unit.orders.as_ref(),
            Some(UnitOrders::Goto { path }) if path.as_slice() == [Hex { q: 2, r: 0 }]
        ));
        assert!(set_events
            .iter()
            .any(|e| matches!(e, Event::UnitMoved { unit, .. } if *unit == unit_id)));

        // Advance to Player 0's next turn; orders should execute final step and complete.
        engine.apply_command(Command::EndTurn);
        let events = engine.apply_command(Command::EndTurn);

        let unit = engine.state.units.get(unit_id).unwrap();
        assert_eq!(unit.position, Hex { q: 2, r: 0 });
        assert!(unit.orders.is_none());
        assert!(events
            .iter()
            .any(|e| matches!(e, Event::UnitMoved { unit, .. } if *unit == unit_id)));
        assert!(events
            .iter()
            .any(|e| matches!(e, Event::OrdersCompleted { unit, .. } if *unit == unit_id)));
    }

    #[test]
    fn query_path_returns_empty_if_destination_is_occupied() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(5, 1, true, plains);

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap();
        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));
        let _blocker = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 2, r: 0 },
            &engine.state.rules,
        ));

        let path = engine.query_path(mover, Hex { q: 2, r: 0 });
        assert!(path.is_empty());
    }

    #[test]
    fn query_path_routes_around_impassable_tiles() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let mountains = rules.terrain_id("mountains").unwrap();

        let mut map = GameMap::new(5, 1, true, plains);
        map.get_mut(Hex { q: 1, r: 0 }).unwrap().terrain = mountains;

        let mut engine = engine_from_state(GameState::new_for_tests(map, rules, PlayerId(0)));

        let scout = engine.state.rules.unit_type_id("scout").unwrap();
        let mover = engine.state.units.insert(Unit::new_for_tests(
            scout,
            PlayerId(0),
            Hex { q: 0, r: 0 },
            &engine.state.rules,
        ));

        let path = engine.query_path(mover, Hex { q: 2, r: 0 });
        assert_eq!(
            path,
            vec![Hex { q: 4, r: 0 }, Hex { q: 3, r: 0 }, Hex { q: 2, r: 0 }]
        );
    }

    #[test]
    fn replay_same_seed_and_commands_produces_same_snapshot_hash() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");

        let mut a = GameEngine::new_game_with_seed(8, 2, rules.clone(), 123);
        let mut b = GameEngine::new_game_with_seed(8, 2, rules, 123);

        let settler_type = a.state.rules.unit_type_id("settler").expect("settler type");
        let warrior_type = a.state.rules.unit_type_id("warrior").expect("warrior type");

        let p0_settler = a
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id))
            .expect("p0 settler");
        let p0_warrior = a
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == warrior_type).then_some(id))
            .expect("p0 warrior");
        let p1_warrior = a
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(1) && u.type_id == warrior_type).then_some(id))
            .expect("p1 warrior");

        let p0_settler_b = b
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id))
            .expect("p0 settler b");
        assert_eq!(p0_settler, p0_settler_b);

        let commands = vec![
            Command::MoveUnit {
                unit: p0_warrior,
                path: vec![Hex { q: 1, r: 0 }],
            },
            Command::FoundCity {
                settler: p0_settler,
                name: "Capital".to_string(),
            },
            Command::EndTurn,
            Command::MoveUnit {
                unit: p1_warrior,
                path: vec![Hex { q: 4, r: 0 }],
            },
            Command::EndTurn,
        ];

        for cmd in &commands {
            a.apply_command(cmd.clone());
        }
        for cmd in &commands {
            b.apply_command(cmd.clone());
        }

        let hash_a = backbay_protocol::snapshot_hash(&a.snapshot()).expect("snapshot hash");
        let hash_b = backbay_protocol::snapshot_hash(&b.snapshot()).expect("snapshot hash");
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn replay_to_turn_start_rewinds_state_deterministically() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game_with_seed(8, 2, rules, 123);

        // Advance to the start of world turn 2 (P0's turn).
        engine.apply_command(Command::EndTurn); // P0 -> P1 (turn 1)
        engine.apply_command(Command::EndTurn); // P1 -> P0 (turn 2)

        let snapshot_turn2 = engine.snapshot();

        // Play some more commands so we have something to rewind past.
        engine.apply_command(Command::EndTurn); // P0 -> P1 (turn 2)
        engine.apply_command(Command::EndTurn); // P1 -> P0 (turn 3)

        let log_len = engine.command_log.len();
        assert!(engine.replay_to_turn_start(2));
        assert_eq!(engine.command_log.len(), log_len);

        let replay_snapshot = engine.snapshot();
        let hash_a = backbay_protocol::snapshot_hash(&snapshot_turn2).expect("snapshot hash");
        let hash_b = backbay_protocol::snapshot_hash(&replay_snapshot).expect("snapshot hash");
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn export_and_import_replay_roundtrips_to_same_snapshot_hash() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");

        let mut engine = GameEngine::new_game_with_seed(8, 2, rules.clone(), 123);
        engine.apply_command(Command::EndTurn);
        engine.apply_command(Command::EndTurn);
        engine.apply_command(Command::EndTurn);

        let snapshot_before = engine.snapshot();
        let replay = engine.export_replay().expect("replay export");

        let mut imported = GameEngine::new_game_with_seed(8, 2, rules, 0);
        imported.import_replay(replay).expect("replay import");

        let hash_a = backbay_protocol::snapshot_hash(&snapshot_before).expect("snapshot hash");
        let hash_b = backbay_protocol::snapshot_hash(&imported.snapshot()).expect("snapshot hash");
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn worker_builds_improvement_over_multiple_turns() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(8, 8, true, plains);
        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        state.spawn_starting_units();
        let mut engine = engine_from_state(state);

        let settler_type = engine
            .state
            .rules
            .unit_type_id("settler")
            .expect("settler type");
        let worker_type = engine
            .state
            .rules
            .unit_type_id("worker")
            .expect("worker type");
        let farm_id = engine.state.rules.improvement_id("farm").expect("farm id");

        let settler_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id))
            .expect("settler");
        let worker_id = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == worker_type).then_some(id))
            .expect("worker");

        // Found a city so the worker's starting tile is owned.
        engine
            .try_apply_command(Command::FoundCity {
                settler: settler_id,
                name: "Capital".to_string(),
            })
            .expect("found city ok");

        engine
            .try_apply_command(Command::SetOrders {
                unit: worker_id,
                orders: UnitOrders::BuildImprovement {
                    improvement: farm_id,
                    at: None,
                    turns_remaining: None,
                },
            })
            .expect("set build orders ok");

        // Build time is 3 turns; orders tick at the start of P0's turns.
        let mut built = false;
        for _ in 0..3 {
            engine.apply_command(Command::EndTurn); // -> P1
            let events = engine.apply_command(Command::EndTurn); // -> P0 (ticks)
            if events
                .iter()
                .any(|e| matches!(e, Event::ImprovementBuilt { .. }))
            {
                built = true;
            }
        }
        assert!(built, "expected ImprovementBuilt event");

        let worker_pos = engine.state.units.get(worker_id).unwrap().position;
        let tile = engine.state.map.get(worker_pos).unwrap();
        let improvement = tile.improvement.as_ref().expect("improvement exists");
        assert_eq!(improvement.id, farm_id);
        assert_eq!(improvement.tier, 1);
        assert!(!improvement.pillaged);
    }

    #[test]
    fn pillage_disables_improvement_until_repaired() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(8, 8, true, plains);
        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        state.spawn_starting_units();
        let mut engine = engine_from_state(state);

        let settler_type = engine
            .state
            .rules
            .unit_type_id("settler")
            .expect("settler type");
        let worker_type = engine
            .state
            .rules
            .unit_type_id("worker")
            .expect("worker type");
        let warrior_type = engine
            .state
            .rules
            .unit_type_id("warrior")
            .expect("warrior type");
        let farm_id = engine.state.rules.improvement_id("farm").expect("farm id");

        let p0_settler = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id))
            .expect("p0 settler");
        let p0_worker = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == worker_type).then_some(id))
            .expect("p0 worker");
        let p1_warrior = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(1) && u.type_id == warrior_type).then_some(id))
            .expect("p1 warrior");

        engine
            .try_apply_command(Command::FoundCity {
                settler: p0_settler,
                name: "Capital".to_string(),
            })
            .expect("found city ok");

        engine
            .try_apply_command(Command::SetOrders {
                unit: p0_worker,
                orders: UnitOrders::BuildImprovement {
                    improvement: farm_id,
                    at: None,
                    turns_remaining: None,
                },
            })
            .expect("set build ok");

        // Complete the farm.
        for _ in 0..3 {
            engine.apply_command(Command::EndTurn);
            engine.apply_command(Command::EndTurn);
        }

        // After completion, the worker has no moves left this turn; advance to refresh moves.
        engine.apply_command(Command::EndTurn); // -> P1
        engine.apply_command(Command::EndTurn); // -> P0

        let farm_hex = engine.state.units.get(p0_worker).unwrap().position;

        // Move the worker away so P1 can stand on the tile.
        engine
            .try_apply_command(Command::MoveUnit {
                unit: p0_worker,
                path: vec![Hex {
                    q: farm_hex.q,
                    r: farm_hex.r + 1,
                }],
            })
            .expect("move worker ok");

        engine.apply_command(Command::EndTurn); // -> P1

        // Teleport the warrior next to the farm (avoid multi-turn marching in this unit test).
        if let Some(unit) = engine.state.units.get_mut(p1_warrior) {
            unit.position = Hex {
                q: farm_hex.q + 1,
                r: farm_hex.r,
            };
            unit.moves_left = engine.state.rules.unit_type(unit.type_id).moves;
        }

        // Move P1 warrior onto the farm and pillage it.
        engine
            .try_apply_command(Command::MoveUnit {
                unit: p1_warrior,
                path: vec![farm_hex],
            })
            .expect("move warrior ok");

        let events = engine
            .try_apply_command(Command::PillageImprovement { unit: p1_warrior })
            .expect("pillage ok");
        assert!(events
            .iter()
            .any(|e| matches!(e, Event::ImprovementPillaged { hex, .. } if *hex == farm_hex)));

        let tile = engine.state.map.get(farm_hex).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert!(improvement.pillaged);

        // Teleport warrior off the tile (it has no moves left after stepping onto the farm).
        if let Some(unit) = engine.state.units.get_mut(p1_warrior) {
            unit.position = Hex {
                q: farm_hex.q + 1,
                r: farm_hex.r,
            };
            unit.moves_left = 0;
        }

        engine.apply_command(Command::EndTurn); // -> P0 (process world turn)

        // Move worker back and repair.
        engine
            .try_apply_command(Command::MoveUnit {
                unit: p0_worker,
                path: vec![farm_hex],
            })
            .expect("move worker back ok");
        engine
            .try_apply_command(Command::SetOrders {
                unit: p0_worker,
                orders: UnitOrders::RepairImprovement {
                    at: None,
                    turns_remaining: None,
                },
            })
            .expect("set repair orders ok");

        // Repair time is 2 turns; tick at start of P0's turns.
        let mut repaired = false;
        for _ in 0..2 {
            engine.apply_command(Command::EndTurn); // -> P1
            let events = engine.apply_command(Command::EndTurn); // -> P0 (ticks)
            if events
                .iter()
                .any(|e| matches!(e, Event::ImprovementRepaired { hex, .. } if *hex == farm_hex))
            {
                repaired = true;
            }
        }
        assert!(repaired, "expected ImprovementRepaired event");

        let tile = engine.state.map.get(farm_hex).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert!(!improvement.pillaged);
    }

    #[test]
    fn improvements_mature_only_when_worked() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let map = GameMap::new(8, 8, true, plains);
        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        state.spawn_starting_units();
        let mut engine = engine_from_state(state);

        let settler_type = engine
            .state
            .rules
            .unit_type_id("settler")
            .expect("settler type");
        let worker_type = engine
            .state
            .rules
            .unit_type_id("worker")
            .expect("worker type");
        let farm_id = engine.state.rules.improvement_id("farm").expect("farm id");

        let p0_settler = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id))
            .expect("p0 settler");
        let p0_worker = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == worker_type).then_some(id))
            .expect("p0 worker");

        engine
            .try_apply_command(Command::FoundCity {
                settler: p0_settler,
                name: "Capital".to_string(),
            })
            .expect("found city ok");

        engine
            .try_apply_command(Command::SetOrders {
                unit: p0_worker,
                orders: UnitOrders::BuildImprovement {
                    improvement: farm_id,
                    at: None,
                    turns_remaining: None,
                },
            })
            .expect("set build ok");

        // Complete the farm (3 turns).
        for _ in 0..3 {
            engine.apply_command(Command::EndTurn);
            engine.apply_command(Command::EndTurn);
        }

        let farm_hex = engine.state.units.get(p0_worker).unwrap().position;

        // Farm tier 1 matures to tier 2 after 8 worked turns.
        let mut matured = false;
        for _ in 0..8 {
            engine.apply_command(Command::EndTurn); // -> P1
            let events = engine.apply_command(Command::EndTurn); // -> P0, world turn processed
            if events.iter().any(|e| {
                matches!(e, Event::ImprovementMatured { hex, new_tier, .. } if *hex == farm_hex && *new_tier == 2)
            }) {
                matured = true;
                break;
            }
        }
        assert!(matured, "expected ImprovementMatured to tier 2");

        let tile = engine.state.map.get(farm_hex).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert_eq!(improvement.tier, 2);
    }

    #[test]
    fn trade_routes_yield_gold_each_world_turn() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(8, 2, rules);

        let settler_type = engine
            .state
            .rules
            .unit_type_id("settler")
            .expect("settler type");

        let p0_settler = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(0) && u.type_id == settler_type).then_some(id))
            .expect("p0 settler");
        let p1_settler = engine
            .state
            .units
            .iter_ordered()
            .find_map(|(id, u)| (u.owner == PlayerId(1) && u.type_id == settler_type).then_some(id))
            .expect("p1 settler");

        // P0 founds a city, then P1 founds a city before the first world turn.
        let p0_city_id = match engine
            .try_apply_command(Command::FoundCity {
                settler: p0_settler,
                name: "P0 City".to_string(),
            })
            .expect("found p0 city")
            .into_iter()
            .find_map(|e| match e {
                Event::CityFounded { city, .. } => Some(city),
                _ => None,
            }) {
            Some(id) => id,
            None => panic!("missing CityFounded"),
        };

        engine.apply_command(Command::EndTurn); // -> P1

        let p1_city_id = match engine
            .try_apply_command(Command::FoundCity {
                settler: p1_settler,
                name: "P1 City".to_string(),
            })
            .expect("found p1 city")
            .into_iter()
            .find_map(|e| match e {
                Event::CityFounded { city, .. } => Some(city),
                _ => None,
            }) {
            Some(id) => id,
            None => panic!("missing CityFounded (p1)"),
        };

        // End P1's turn, triggering the first world turn (no trade yet).
        engine.apply_command(Command::EndTurn); // -> P0, world turn processed
        assert_eq!(engine.state.players[0].gold, -8);

        // Establish an external trade route and process one more world turn.
        engine
            .try_apply_command(Command::EstablishTradeRoute {
                from: p0_city_id,
                to: p1_city_id,
            })
            .expect("establish trade route ok");

        engine.apply_command(Command::EndTurn); // -> P1
        engine.apply_command(Command::EndTurn); // -> P0, world turn processed with trade

        assert_eq!(engine.state.players[0].gold, -13);
        assert_eq!(engine.state.diplomacy.relation(PlayerId(0), PlayerId(1)), 1);
        assert!(engine
            .state
            .trade_routes
            .iter_ordered()
            .any(|(_id, r)| r.owner == PlayerId(0) && r.from == p0_city_id && r.to == p1_city_id));
    }

    #[test]
    fn supply_overcap_applies_gold_penalty() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(8, 2, rules);

        let warrior_type = engine
            .state
            .rules
            .unit_type_id("warrior")
            .expect("warrior type");
        for i in 0..10 {
            let q = (i % 8) as i32;
            let r = 6 + (i / 8) as i32;
            let pos = Hex { q, r };
            let unit = Unit::new_for_tests(warrior_type, PlayerId(0), pos, &engine.state.rules);
            let _ = engine.state.units.insert(unit);
        }

        engine.apply_command(Command::EndTurn); // -> P1
        let events = engine.apply_command(Command::EndTurn); // -> P0, world turn processed

        let p0 = &engine.state.players[0];
        assert!(p0.supply_used > p0.supply_cap);
        assert!(events.iter().any(|e| {
            matches!(
                e,
                Event::SupplyUpdated {
                    player,
                    used,
                    cap,
                    overage,
                    penalty_gold,
                } if *player == PlayerId(0) && *used == p0.supply_used && *cap == p0.supply_cap && *overage == (p0.supply_used - p0.supply_cap) && *penalty_gold == (p0.supply_used - p0.supply_cap) * 2
            )
        }));
    }

    #[test]
    fn war_weariness_increases_while_at_war() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let mut engine = GameEngine::new_game(8, 2, rules);

        engine
            .try_apply_command(Command::DeclareWar {
                target: PlayerId(1),
            })
            .expect("declare war ok");
        assert_eq!(engine.state.players[0].war_weariness, 2);
        assert_eq!(engine.state.players[1].war_weariness, 1);

        engine.apply_command(Command::EndTurn); // -> P1
        engine.apply_command(Command::EndTurn); // -> P0, world turn processed

        assert_eq!(engine.state.players[0].war_weariness, 3);
        assert_eq!(engine.state.players[1].war_weariness, 2);
    }

    #[test]
    fn improvement_tier_advancement_requires_exact_worked_turns() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        // Build a simple map with a farm already in place
        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 0,
            pillaged: false,
        });
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().owner = Some(PlayerId(0));

        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        let city_id = state.cities.insert(City {
            name: "Test".into(),
            owner: PlayerId(0),
            position: Hex { q: 2, r: 2 },
            population: 2,
            specialists: 0,
            food_stockpile: 0,
            production_stockpile: 0,
            buildings: Vec::new(),
            producing: None,
            claimed_tiles: vec![
                state.map.index_of(Hex { q: 1, r: 1 }).unwrap() as u32,
                state.map.index_of(Hex { q: 2, r: 2 }).unwrap() as u32,
            ],
            border_progress: 0,
            locked_assignments: vec![],
        });
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().city = Some(city_id);
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().owner = Some(PlayerId(0));
        let mut engine = engine_from_state(state);

        // Farm tier 1 needs 8 worked turns to advance to tier 2
        // Work it for 7 turns - should NOT advance
        for _ in 0..7 {
            engine.apply_command(Command::EndTurn);
            engine.apply_command(Command::EndTurn);
        }

        let tile = engine.state.map.get(Hex { q: 1, r: 1 }).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert_eq!(improvement.tier, 1);
        assert_eq!(improvement.worked_turns, 7);

        // Work it for 1 more turn - should advance to tier 2
        engine.apply_command(Command::EndTurn);
        engine.apply_command(Command::EndTurn);

        let tile = engine.state.map.get(Hex { q: 1, r: 1 }).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert_eq!(improvement.tier, 2);
        assert_eq!(improvement.worked_turns, 0); // Reset after tier up
    }

    #[test]
    fn improvement_excess_worked_turns_carry_over() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        // Set up a farm at 7 worked turns - advancing next turn will have 1 excess
        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 7,
            pillaged: false,
        });
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().owner = Some(PlayerId(0));

        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        let city_id = state.cities.insert(City {
            name: "Test".into(),
            owner: PlayerId(0),
            position: Hex { q: 2, r: 2 },
            population: 2,
            ..Default::default()
        });
        state.cities.get_mut(city_id).unwrap().claimed_tiles = vec![
            state.map.index_of(Hex { q: 1, r: 1 }).unwrap() as u32,
            state.map.index_of(Hex { q: 2, r: 2 }).unwrap() as u32,
        ];
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().city = Some(city_id);
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().owner = Some(PlayerId(0));
        let mut engine = engine_from_state(state);

        // Work for 1 turn - should advance and have 0 excess (8-8=0)
        engine.apply_command(Command::EndTurn);
        engine.apply_command(Command::EndTurn);

        let tile = engine.state.map.get(Hex { q: 1, r: 1 }).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert_eq!(improvement.tier, 2);
        assert_eq!(improvement.worked_turns, 0);
    }

    #[test]
    fn max_tier_improvement_stops_advancing() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        // Farm has 3 tiers - set it to max tier
        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 3,
            worked_turns: 0,
            pillaged: false,
        });
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().owner = Some(PlayerId(0));

        let mut state = GameState::new_for_tests(map, rules, PlayerId(0));
        let city_id = state.cities.insert(City {
            name: "Test".into(),
            owner: PlayerId(0),
            position: Hex { q: 2, r: 2 },
            population: 2,
            ..Default::default()
        });
        state.cities.get_mut(city_id).unwrap().claimed_tiles = vec![
            state.map.index_of(Hex { q: 1, r: 1 }).unwrap() as u32,
            state.map.index_of(Hex { q: 2, r: 2 }).unwrap() as u32,
        ];
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().city = Some(city_id);
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().owner = Some(PlayerId(0));
        let mut engine = engine_from_state(state);

        // Work many turns - should not advance beyond max tier
        for _ in 0..20 {
            engine.apply_command(Command::EndTurn);
            engine.apply_command(Command::EndTurn);
        }

        let tile = engine.state.map.get(Hex { q: 1, r: 1 }).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert_eq!(improvement.tier, 3); // Still at max
        assert_eq!(improvement.worked_turns, 0); // Not accumulating
    }

    #[test]
    fn pillage_reduces_improvement_tier() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        // Set up a tier 2 farm
        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 2,
            worked_turns: 5,
            pillaged: false,
        });
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().owner = Some(PlayerId(0));

        let mut state = GameState::new_for_tests(map, rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);
        let mut engine = engine_from_state(state);

        // Add an enemy unit that can pillage
        let warrior_type = engine.state.rules.unit_type_id("warrior").unwrap();
        let enemy = engine.state.units.insert(Unit::new_for_tests(
            warrior_type,
            PlayerId(1),
            Hex { q: 0, r: 1 },
            &engine.state.rules,
        ));

        // Switch to player 1
        engine.apply_command(Command::EndTurn);

        // Move to the tile and pillage
        engine.try_apply_command(Command::MoveUnit {
            unit: enemy,
            path: vec![Hex { q: 1, r: 1 }],
        }).expect("move ok");

        engine.try_apply_command(Command::PillageImprovement { unit: enemy }).expect("pillage ok");

        let tile = engine.state.map.get(Hex { q: 1, r: 1 }).unwrap();
        let improvement = tile.improvement.as_ref().unwrap();
        assert!(improvement.pillaged);
        assert_eq!(improvement.tier, 1); // Reduced from 2 to 1
        assert_eq!(improvement.worked_turns, 0); // Reset
    }

    #[test]
    fn query_tile_ui_returns_correct_maturation_progress() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 4,
            pillaged: false,
        });

        let state = GameState::new_for_tests(map, rules, PlayerId(0));
        let engine = engine_from_state(state);

        let tile_ui = engine.query_tile_ui(Hex { q: 1, r: 1 }).expect("tile exists");

        assert_eq!(tile_ui.terrain_name, "Plains");

        let imp = tile_ui.improvement.expect("has improvement");
        assert_eq!(imp.name, "Farm");
        assert_eq!(imp.tier, 1);
        assert_eq!(imp.max_tier, 3);
        assert!(!imp.pillaged);

        // Check maturation progress
        let mat = imp.maturation.expect("has maturation progress");
        assert_eq!(mat.worked_turns, 4);
        assert_eq!(mat.turns_needed, 8);
        assert_eq!(mat.progress_pct, 50);
        assert_eq!(mat.turns_remaining, 4);

        // Check yields
        assert_eq!(imp.yields.food, 1); // Tier 1 farm
        let next = imp.next_tier_yields.expect("has next tier");
        assert_eq!(next.food, 2); // Tier 2 farm
    }

    #[test]
    fn query_tile_ui_returns_yield_breakdown() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 2,
            worked_turns: 0,
            pillaged: false,
        });

        let state = GameState::new_for_tests(map, rules, PlayerId(0));
        let engine = engine_from_state(state);

        let tile_ui = engine.query_tile_ui(Hex { q: 1, r: 1 }).expect("tile exists");

        // Plains (1/1/0) + Farm Tier 2 (2/0/0) = 3/1/0
        assert_eq!(tile_ui.total_yields.food, 3);
        assert_eq!(tile_ui.total_yields.production, 1);
        assert_eq!(tile_ui.total_yields.gold, 0);

        // Check breakdown
        assert_eq!(tile_ui.yield_breakdown.len(), 2);
        assert_eq!(tile_ui.yield_breakdown[0].source, "Plains");
        assert_eq!(tile_ui.yield_breakdown[1].source, "Farm (Tier 2)");
    }

    #[test]
    fn pillaged_improvement_shows_zero_yields_in_ui() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        let mut map = GameMap::new(4, 4, false, plains);
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 2,
            worked_turns: 0,
            pillaged: true,
        });

        let state = GameState::new_for_tests(map, rules, PlayerId(0));
        let engine = engine_from_state(state);

        let tile_ui = engine.query_tile_ui(Hex { q: 1, r: 1 }).expect("tile exists");

        // Only terrain yields - improvement is pillaged
        assert_eq!(tile_ui.total_yields.food, 1); // Plains only
        assert_eq!(tile_ui.total_yields.production, 1);

        let imp = tile_ui.improvement.expect("has improvement");
        assert!(imp.pillaged);
        assert_eq!(imp.yields.food, 0);
        assert!(imp.maturation.is_none()); // No maturation when pillaged
    }

    #[test]
    fn automated_worker_pathfinds_to_nearby_tile() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let worker_type = rules.unit_type_id("worker").expect("worker type");

        // 5x5 map with owned tiles at (0,2), (1,2), (2,2) - all plains, no improvements
        let mut map = GameMap::new(5, 5, false, plains);

        // Owned tiles are at q=0,1,2 r=2
        for q in 0..3 {
            let hex = Hex { q, r: 2 };
            if let Some(tile) = map.get_mut(hex) {
                tile.owner = Some(PlayerId(0));
            }
        }

        let mut state = GameState::new_for_tests(map, rules.clone(), PlayerId(0));

        // Place a city to establish ownership
        let city_id = state.cities.insert(City {
            name: "Home".into(),
            owner: PlayerId(0),
            position: Hex { q: 2, r: 2 },
            population: 2,
            specialists: 0,
            food_stockpile: 0,
            production_stockpile: 0,
            buildings: Vec::new(),
            producing: None,
            claimed_tiles: vec![
                state.map.index_of(Hex { q: 0, r: 2 }).unwrap() as u32,
                state.map.index_of(Hex { q: 1, r: 2 }).unwrap() as u32,
                state.map.index_of(Hex { q: 2, r: 2 }).unwrap() as u32,
            ],
            border_progress: 0,
            locked_assignments: vec![],
        });
        state.map.get_mut(Hex { q: 2, r: 2 }).unwrap().city = Some(city_id);

        // Place automated worker at (0,2) - no improvement there
        let worker_id = state.units.insert(Unit::new_for_tests(
            worker_type,
            PlayerId(0),
            Hex { q: 0, r: 2 },
            &rules,
        ));
        if let Some(worker) = state.units.get_mut(worker_id) {
            worker.automated = true;
            worker.moves_left = 2;
        }

        let mut engine = engine_from_state(state);

        // find_best_worker_target should find work at (0,2) - the current position
        let target = engine.find_best_worker_target(PlayerId(0), Hex { q: 0, r: 2 }, 12);
        assert!(target.is_some(), "should find a work target");
        let (target_hex, task, _turns) = target.unwrap();

        // Best target should be (0,2) since it's closest and has no improvement
        assert_eq!(target_hex, Hex { q: 0, r: 2 });
        match task {
            WorkerTaskKind::Build { .. } => {} // Expected
            _ => panic!("Expected Build task, got {:?}", task),
        }
    }

    #[test]
    fn worker_pathfinding_to_distant_tile() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        // 6x6 map
        let mut map = GameMap::new(6, 6, false, plains);

        // Owned tiles: (1,1) has farm, (1,2), (1,3), (2,1), (2,2), (2,3) - no improvement
        // Worker starts at (1,1) which already has an improvement
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().owner = Some(PlayerId(0));
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 0,
            pillaged: false,
        });

        // Other owned tiles without improvements
        for &(q, r) in &[(1, 2), (1, 3), (2, 1), (2, 2), (2, 3)] {
            let hex = Hex { q, r };
            if let Some(tile) = map.get_mut(hex) {
                tile.owner = Some(PlayerId(0));
            }
        }

        let state = GameState::new_for_tests(map, rules.clone(), PlayerId(0));
        let engine = engine_from_state(state);

        // Worker at (1,1) which already has improvement - should find work at adjacent tile
        let target = engine.find_best_worker_target(PlayerId(0), Hex { q: 1, r: 1 }, 12);
        assert!(target.is_some(), "should find a work target at nearby tile");
        let (target_hex, task, _turns) = target.unwrap();

        // Should pick an adjacent owned tile without improvement (closest)
        assert_ne!(target_hex, Hex { q: 1, r: 1 }, "should not pick tile with existing improvement");
        match task {
            WorkerTaskKind::Build { .. } => {} // Expected
            _ => panic!("Expected Build task, got {:?}", task),
        }

        // Test compute_worker_path
        let path = engine.compute_worker_path(Hex { q: 1, r: 1 }, target_hex);
        assert!(path.is_some(), "path should exist");
        let path = path.unwrap();
        assert!(!path.is_empty() || target_hex == Hex { q: 1, r: 1 }, "path should have steps for non-local target");
    }

    #[test]
    fn find_best_worker_target_prioritizes_repairs() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        let mut map = GameMap::new(5, 5, false, plains);

        // (1,1) - pillaged farm (needs repair)
        // (1,2) - no improvement (could build)
        // Both owned
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().owner = Some(PlayerId(0));
        map.get_mut(Hex { q: 1, r: 1 }).unwrap().improvement = Some(ImprovementOnTile {
            id: farm_id,
            tier: 2,
            worked_turns: 0,
            pillaged: true,
        });

        map.get_mut(Hex { q: 1, r: 2 }).unwrap().owner = Some(PlayerId(0));

        let state = GameState::new_for_tests(map, rules.clone(), PlayerId(0));
        let engine = engine_from_state(state);

        // Starting from (1,2) - should prioritize repair at (1,1) over building here
        let target = engine.find_best_worker_target(PlayerId(0), Hex { q: 1, r: 2 }, 12);
        assert!(target.is_some());
        let (target_hex, task, _turns) = target.unwrap();

        // Repair has score 100, which is higher than building scores
        assert_eq!(target_hex, Hex { q: 1, r: 1 }, "should target pillaged tile for repair");
        match task {
            WorkerTaskKind::Repair => {} // Expected
            _ => panic!("Expected Repair task, got {:?}", task),
        }
    }

    #[test]
    fn chronicle_captures_city_founded_event() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let settler_type = rules.unit_type_id("settler").expect("settler type");

        let mut map = GameMap::new(6, 6, false, plains);
        // Place a settler
        let mut state = GameState::new_for_tests(map, rules.clone(), PlayerId(0));
        let settler_id = state.units.insert(Unit::new_for_tests(
            settler_type,
            PlayerId(0),
            Hex { q: 2, r: 2 },
            &rules,
        ));

        let mut engine = engine_from_state(state);

        // Found a city
        let result = engine.try_apply_command(Command::FoundCity { settler: settler_id, name: "TestCity".into() });
        assert!(result.is_ok());

        // Check chronicle has the city founded event
        let chronicle = engine.query_chronicle();
        assert!(!chronicle.is_empty(), "chronicle should have entries");

        let has_city_founded = chronicle.iter().any(|e| {
            matches!(
                &e.event,
                ChronicleEvent::CityFounded { owner, .. } if *owner == PlayerId(0)
            )
        });
        assert!(has_city_founded, "chronicle should have CityFounded event");
    }

    #[test]
    fn chronicle_query_by_category_works() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let settler_type = rules.unit_type_id("settler").expect("settler type");

        let mut state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let settler_id = state.units.insert(Unit::new_for_tests(
            settler_type,
            PlayerId(0),
            Hex { q: 2, r: 2 },
            &rules,
        ));

        let mut engine = engine_from_state(state);
        engine.try_apply_command(Command::FoundCity { settler: settler_id, name: "TestCity".into() }).unwrap();

        // Query by category
        let city_events = engine.query_chronicle_by_category(ChronicleCategory::City);
        assert!(!city_events.is_empty(), "should have city category events");

        // All returned events should be city category
        for entry in city_events {
            assert_eq!(
                chronicle_category(&entry.event),
                ChronicleCategory::City,
                "event should be city category"
            );
        }
    }

    #[test]
    fn chronicle_query_for_player_filters_correctly() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let settler_type = rules.unit_type_id("settler").expect("settler type");

        let mut state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let settler_id = state.units.insert(Unit::new_for_tests(
            settler_type,
            PlayerId(0),
            Hex { q: 2, r: 2 },
            &rules,
        ));

        let mut engine = engine_from_state(state);
        engine.try_apply_command(Command::FoundCity { settler: settler_id, name: "TestCity".into() }).unwrap();

        // Query for player 0
        let p0_events = engine.query_chronicle_for_player(PlayerId(0));
        assert!(!p0_events.is_empty(), "player 0 should have events");

        // Query for player 1 (who did nothing)
        let p1_events = engine.query_chronicle_for_player(PlayerId(1));
        assert!(p1_events.is_empty(), "player 1 should have no events");
    }

    // =========================================================================
    // Victory Tests
    // =========================================================================

    #[test]
    fn victory_capital_tracking_on_city_founded() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let settler_type = rules.unit_type_id("settler").expect("settler type");

        let mut state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let settler_id = state.units.insert(Unit::new_for_tests(
            settler_type,
            PlayerId(0),
            Hex { q: 2, r: 2 },
            &rules,
        ));

        let mut engine = engine_from_state(state);

        // Initially no capitals are set.
        assert!(engine.state().victory.original_capitals[0].city.is_none());

        // Found a city.
        engine.try_apply_command(Command::FoundCity {
            settler: settler_id,
            name: "Capital".into(),
        }).expect("found city");

        // Capital should be tracked.
        assert!(engine.state().victory.original_capitals[0].city.is_some());
        assert_eq!(
            engine.state().victory.original_capitals[0].current_owner,
            Some(PlayerId(0))
        );
    }

    #[test]
    fn victory_score_calculation_basic() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let settler_type = rules.unit_type_id("settler").expect("settler type");

        let mut state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let settler_id = state.units.insert(Unit::new_for_tests(
            settler_type,
            PlayerId(0),
            Hex { q: 2, r: 2 },
            &rules,
        ));

        let mut engine = engine_from_state(state);

        // Score before city.
        let score_before = engine.calculate_player_score(PlayerId(0));
        assert!(score_before > 0, "should have some score from settler unit");

        // Found a city.
        engine.try_apply_command(Command::FoundCity {
            settler: settler_id,
            name: "TestCity".into(),
        }).expect("found city");

        // Score after city should include city + population.
        let score_after = engine.calculate_player_score(PlayerId(0));
        assert!(
            score_after > score_before,
            "score should increase after founding city"
        );
    }

    #[test]
    fn victory_progress_query_returns_valid_data() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let engine = engine_from_state(state);

        let progress = engine.query_victory_progress();

        // Check domination progress.
        assert_eq!(progress.domination.total_capitals, 2, "should track 2 capitals for 2 players");
        assert!(progress.domination.achievable);

        // Check science progress.
        assert_eq!(progress.science.stages.len(), 5, "should have 5 space project stages");
        assert!(progress.science.completed_by.is_none(), "no one should have completed science yet");

        // Check score progress.
        assert_eq!(progress.score.current_turn, 1);
        assert!(progress.score.turn_limit > 0);
    }

    #[test]
    fn victory_turn_limit_triggers_game_end() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let settler_type = rules.unit_type_id("settler").expect("settler type");

        let mut state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));

        // Set turn limit to 5 for quick testing.
        state.victory.turn_limit = 5;

        // Give player 0 a settler.
        let settler_id = state.units.insert(Unit::new_for_tests(
            settler_type,
            PlayerId(0),
            Hex { q: 2, r: 2 },
            &rules,
        ));

        let mut engine = engine_from_state(state);

        // Found a city so player 0 has some score.
        engine.try_apply_command(Command::FoundCity {
            settler: settler_id,
            name: "TestCity".into(),
        }).expect("found city");

        // Advance turns until we hit the limit.
        let mut game_ended = false;
        for _ in 0..20 {
            if engine.state().victory.game_ended {
                game_ended = true;
                break;
            }
            let events = engine.apply_command(Command::EndTurn);
            if events.iter().any(|e| matches!(e, Event::GameEnded { .. })) {
                game_ended = true;
                break;
            }
        }

        assert!(game_ended, "game should end when turn limit is reached");
        assert_eq!(
            engine.state().victory.victory_reason,
            Some(backbay_protocol::VictoryReason::Time)
        );
    }

    #[test]
    fn victory_domination_check() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");

        // Test the controls_all_capitals check directly.
        let mut victory = VictoryState::new(2, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }], 500);

        // Initially no one controls all capitals (they're not founded yet).
        assert!(!victory.controls_all_capitals(PlayerId(0)));
        assert!(!victory.controls_all_capitals(PlayerId(1)));

        // Set both capitals as controlled by player 0.
        victory.original_capitals[0].city = Some(CityId::from_raw(1));
        victory.original_capitals[0].current_owner = Some(PlayerId(0));
        victory.original_capitals[1].city = Some(CityId::from_raw(2));
        victory.original_capitals[1].current_owner = Some(PlayerId(0));

        // Now player 0 should control all capitals.
        assert!(victory.controls_all_capitals(PlayerId(0)));
        assert!(!victory.controls_all_capitals(PlayerId(1)));
    }

    #[test]
    fn victory_science_check() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");

        let mut victory = VictoryState::new(2, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }], 500);

        // Initially no one has completed science victory.
        assert!(!victory.completed_science_victory(PlayerId(0)));
        assert!(!victory.completed_science_victory(PlayerId(1)));

        // Complete all stages for player 0.
        for stage in &mut victory.science_progress[0] {
            *stage = true;
        }

        // Now player 0 should have science victory.
        assert!(victory.completed_science_victory(PlayerId(0)));
        assert!(!victory.completed_science_victory(PlayerId(1)));
    }

    // =========================================================================
    // Culture Victory Tests
    // =========================================================================

    #[test]
    fn culture_add_culture_tracks_lifetime_and_tourism() {
        let mut victory = VictoryState::new(2, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }], 500);

        // Initially no culture.
        assert_eq!(victory.lifetime_culture[0], 0);
        assert_eq!(victory.tourism[0], 0);

        // Add culture.
        victory.add_culture(PlayerId(0), 100);

        // Lifetime culture should increase by 100, tourism by 25 (25% rate).
        assert_eq!(victory.lifetime_culture[0], 100);
        assert_eq!(victory.tourism[0], 25);

        // Add more culture.
        victory.add_culture(PlayerId(0), 200);
        assert_eq!(victory.lifetime_culture[0], 300);
        assert_eq!(victory.tourism[0], 75); // 25 + 50
    }

    #[test]
    fn culture_influence_calculation() {
        let mut victory = VictoryState::new(2, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }], 500);

        // Player 0 has 100 tourism, player 1 has 200 lifetime culture.
        victory.tourism[0] = 100;
        victory.lifetime_culture[1] = 200;

        // Influence = (100 / 200) * 100 = 50%.
        assert_eq!(victory.calculate_influence(PlayerId(0), PlayerId(1)), 50);

        // Not dominant at 60% threshold.
        assert!(!victory.is_culturally_dominant(PlayerId(0), PlayerId(1)));

        // Increase tourism to achieve dominance.
        victory.tourism[0] = 150;
        // Influence = (150 / 200) * 100 = 75%.
        assert_eq!(victory.calculate_influence(PlayerId(0), PlayerId(1)), 75);
        assert!(victory.is_culturally_dominant(PlayerId(0), PlayerId(1)));
    }

    #[test]
    fn culture_influence_caps_at_100() {
        let mut victory = VictoryState::new(2, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }], 500);

        // Player 0 has massive tourism, player 1 has little culture.
        victory.tourism[0] = 1000;
        victory.lifetime_culture[1] = 100;

        // Influence should cap at 100%.
        assert_eq!(victory.calculate_influence(PlayerId(0), PlayerId(1)), 100);
    }

    #[test]
    fn culture_victory_requires_dominance_over_all_rivals() {
        let mut victory = VictoryState::new(3, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }, Hex { q: 10, r: 10 }], 500);

        // Player 0 has high tourism.
        victory.tourism[0] = 200;
        // Players 1 and 2 have moderate lifetime culture.
        victory.lifetime_culture[1] = 100;
        victory.lifetime_culture[2] = 100;

        // Player 0 should be dominant over both (200/100 = 200% capped to 100%).
        assert!(victory.is_culturally_dominant(PlayerId(0), PlayerId(1)));
        assert!(victory.is_culturally_dominant(PlayerId(0), PlayerId(2)));

        // Player 0 should have culture victory.
        assert!(victory.has_culture_victory(PlayerId(0), 3));

        // Player 1 should not have culture victory (no tourism).
        assert!(!victory.has_culture_victory(PlayerId(1), 3));
    }

    #[test]
    fn culture_victory_ignores_eliminated_players() {
        let mut victory = VictoryState::new(3, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }, Hex { q: 10, r: 10 }], 500);

        // Player 0 has tourism, but not enough to dominate player 2.
        victory.tourism[0] = 50;
        victory.lifetime_culture[1] = 100;
        victory.lifetime_culture[2] = 1000;

        // Player 0 dominates player 1 (50/100 = 50%), but not player 2 (50/1000 = 5%).
        assert!(!victory.has_culture_victory(PlayerId(0), 3));

        // Eliminate player 2.
        victory.eliminated.push(PlayerId(2));

        // Now player 0 only needs to dominate player 1.
        // But 50% < 60% threshold, still not enough.
        assert!(!victory.has_culture_victory(PlayerId(0), 3));

        // Increase tourism.
        victory.tourism[0] = 70;
        // Now 70/100 = 70% >= 60% threshold.
        assert!(victory.has_culture_victory(PlayerId(0), 3));
    }

    #[test]
    fn culture_get_influence_over_rivals_returns_correct_data() {
        let mut victory = VictoryState::new(3, &[Hex { q: 0, r: 0 }, Hex { q: 5, r: 5 }, Hex { q: 10, r: 10 }], 500);

        victory.tourism[0] = 100;
        victory.lifetime_culture[1] = 200;
        victory.lifetime_culture[2] = 100;

        let influences = victory.get_influence_over_rivals(PlayerId(0), 3);

        assert_eq!(influences.len(), 2);

        // Check player 1: 100/200 = 50%.
        let p1 = influences.iter().find(|r| r.rival == PlayerId(1)).unwrap();
        assert_eq!(p1.influence_pct, 50);
        assert!(!p1.dominant);

        // Check player 2: 100/100 = 100%.
        let p2 = influences.iter().find(|r| r.rival == PlayerId(2)).unwrap();
        assert_eq!(p2.influence_pct, 100);
        assert!(p2.dominant);
    }

    #[test]
    fn culture_progress_query_includes_real_data() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state = GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));

        // Set up some culture state.
        state.victory.tourism[0] = 100;
        state.victory.lifetime_culture[1] = 150;

        let engine = engine_from_state(state);

        let progress = engine.query_victory_progress();

        // Check culture progress has real data.
        assert_eq!(progress.culture.threshold_pct, 60);
        assert!(!progress.culture.influence_over_rivals.is_empty());

        // Find player 0's influence data.
        let p0_influence = progress
            .culture
            .influence_over_rivals
            .iter()
            .find(|(p, _)| *p == PlayerId(0))
            .map(|(_, rivals)| rivals);
        assert!(p0_influence.is_some());

        let rivals = p0_influence.unwrap();
        assert_eq!(rivals.len(), 1); // Only player 1

        // Player 0's influence over player 1: 100/150 = 66%.
        let p1 = rivals.iter().find(|r| r.rival == PlayerId(1)).unwrap();
        assert_eq!(p1.influence_pct, 66);
        assert!(p1.dominant); // 66% >= 60%
    }

    // =========================================================================
    // Diplomacy Tests
    // =========================================================================

    #[test]
    fn diplomacy_treaty_creation_and_cancellation() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let a = PlayerId(0);
        let b = PlayerId(1);

        // Create open borders treaty.
        let treaty = state
            .diplomacy
            .create_treaty(TreatyType::OpenBorders, a, b, 1, Some(10));

        assert!(state.diplomacy.has_open_borders(a, b));
        assert!(treaty.active);
        assert_eq!(treaty.parties, (a, b));
        assert_eq!(treaty.expires_turn, Some(11));

        // Relation should increase from treaty bonus.
        assert!(state.diplomacy.relation(a, b) > 0);

        // Cancel the treaty.
        let cancelled = state.diplomacy.cancel_treaty(treaty.id);
        assert!(cancelled.is_some());
        assert!(!state.diplomacy.has_open_borders(a, b));

        // Betrayal penalty should be applied.
        let breakdown = state.diplomacy.relation_breakdown(a, b);
        assert!(breakdown.betrayal < 0);
    }

    #[test]
    fn diplomacy_defensive_pact_triggers_on_war() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);
        let mut p2 = Player::dummy(&rules);
        p2.id = PlayerId(2);
        state.players.push(p2);

        // Expand diplomacy for 3 players.
        state.diplomacy = DiplomacyState::new(3);

        let aggressor = PlayerId(0);
        let target = PlayerId(1);
        let ally = PlayerId(2);

        // Create defensive pact between target and ally.
        state
            .diplomacy
            .create_treaty(TreatyType::DefensivePact, target, ally, 1, Some(50));

        assert!(state.diplomacy.has_defensive_pact(target, ally));

        // Aggressor declares war on target.
        let mut engine = engine_from_state(state);
        let events = engine
            .try_apply_command(Command::DeclareWar { target })
            .expect("war declaration");

        // Should have WarDeclared for the main war and defensive pact trigger.
        assert!(events.iter().any(|e| matches!(e, Event::WarDeclared { aggressor: a, target: t } if *a == aggressor && *t == target)));
        assert!(events.iter().any(|e| matches!(e, Event::DefensivePactTriggered { defender, ally: al, aggressor: ag } if *defender == target && *al == ally && *ag == aggressor)));
        assert!(events.iter().any(|e| matches!(e, Event::WarDeclared { aggressor: a, target: t } if *a == ally && *t == aggressor)));

        // Ally should now be at war with aggressor.
        assert!(engine.state.diplomacy.is_at_war(ally, aggressor));
    }

    #[test]
    fn diplomacy_deal_proposal_and_acceptance() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let from = PlayerId(0);
        let to = PlayerId(1);

        let mut engine = engine_from_state(state);

        // Player 0 proposes open borders.
        let events = engine
            .try_apply_command(Command::ProposeDeal {
                to,
                offer: vec![DealItem::OpenBorders { turns: 20 }],
                demand: vec![],
            })
            .expect("propose deal");

        assert!(events.iter().any(|e| matches!(e, Event::DealProposed { from: f, to: t, .. } if *f == from && *t == to)));
        assert_eq!(engine.state.diplomacy.pending_proposals.len(), 1);

        // Player 1 accepts.
        engine.state.current_player = to;
        let events = engine
            .try_apply_command(Command::RespondToProposal { from, accept: true })
            .expect("accept deal");

        assert!(events.iter().any(|e| matches!(e, Event::DealAccepted { from: f, to: t, .. } if *f == from && *t == to)));
        assert!(events.iter().any(|e| matches!(e, Event::TreatySigned { .. })));
        assert!(engine.state.diplomacy.has_open_borders(from, to));
        assert_eq!(engine.state.diplomacy.pending_proposals.len(), 0);
    }

    #[test]
    fn diplomacy_deal_rejection() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let from = PlayerId(0);
        let to = PlayerId(1);

        let mut engine = engine_from_state(state);

        // Player 0 proposes gold.
        engine
            .try_apply_command(Command::ProposeDeal {
                to,
                offer: vec![],
                demand: vec![DealItem::Gold { amount: 100 }],
            })
            .expect("propose deal");

        // Player 1 rejects.
        engine.state.current_player = to;
        let events = engine
            .try_apply_command(Command::RespondToProposal {
                from,
                accept: false,
            })
            .expect("reject deal");

        assert!(events.iter().any(|e| matches!(e, Event::DealRejected { from: f, to: t } if *f == from && *t == to)));
        assert!(!engine.state.diplomacy.has_open_borders(from, to));
    }

    #[test]
    fn diplomacy_demand_with_war_consequence() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let from = PlayerId(0);
        let to = PlayerId(1);

        let mut engine = engine_from_state(state);

        // Player 0 issues demand for gold with war consequence.
        let events = engine
            .try_apply_command(Command::IssueDemand {
                to,
                items: vec![DealItem::Gold { amount: 50 }],
                consequence: DemandConsequence::War,
            })
            .expect("issue demand");

        assert!(events.iter().any(|e| matches!(e, Event::DemandIssued { .. })));
        let demand_id = match &events[0] {
            Event::DemandIssued { demand, .. } => *demand,
            _ => panic!("expected DemandIssued"),
        };

        // Player 1 rejects.
        engine.state.current_player = to;
        let events = engine
            .try_apply_command(Command::RespondToDemand {
                demand: demand_id,
                accept: false,
            })
            .expect("reject demand");

        // War should be declared.
        assert!(events.iter().any(|e| matches!(e, Event::DemandRejected { .. })));
        assert!(events.iter().any(|e| matches!(e, Event::WarDeclared { aggressor, target } if *aggressor == from && *target == to)));
        assert!(engine.state.diplomacy.is_at_war(from, to));
    }

    #[test]
    fn diplomacy_relation_breakdown_tracks_components() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let a = PlayerId(0);
        let b = PlayerId(1);

        // Adjust various components.
        state.diplomacy.adjust_breakdown_component(a, b, "trade", 10);
        state.diplomacy.adjust_breakdown_component(a, b, "borders", -5);
        state.diplomacy.adjust_breakdown_component(a, b, "betrayal", -20);

        let breakdown = state.diplomacy.relation_breakdown(a, b);
        assert_eq!(breakdown.trade, 10);
        assert_eq!(breakdown.borders, -5);
        assert_eq!(breakdown.betrayal, -20);
        assert_eq!(breakdown.total(), -15);

        // Total relation should match breakdown.
        assert_eq!(state.diplomacy.relation(a, b), -15);
    }

    #[test]
    fn diplomacy_nap_violation_causes_severe_betrayal() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let aggressor = PlayerId(0);
        let target = PlayerId(1);

        // Create non-aggression pact.
        state
            .diplomacy
            .create_treaty(TreatyType::NonAggression, aggressor, target, 1, Some(50));

        assert!(state.diplomacy.has_non_aggression(aggressor, target));
        let initial_rel = state.diplomacy.relation(aggressor, target);

        // Declare war in violation of NAP.
        let mut engine = engine_from_state(state);
        let _ = engine.try_apply_command(Command::DeclareWar { target }).expect("war");

        // Should have severe betrayal penalty.
        let breakdown = engine.state.diplomacy.relation_breakdown(aggressor, target);
        assert!(breakdown.betrayal <= -30);

        // NAP should be cancelled.
        assert!(!engine.state.diplomacy.has_non_aggression(aggressor, target));
    }

    #[test]
    fn ai_military_strength_counts_units_and_cities() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let warrior_id = rules.unit_type_id("warrior").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(10, 10, false, plains), rules.clone(), PlayerId(0));
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        state.players.push(p1);

        let player = PlayerId(0);

        // Add some units for player 0.
        state.units.insert(Unit::new_for_tests(warrior_id, player, Hex { q: 0, r: 0 }, &state.rules));
        state.units.insert(Unit::new_for_tests(warrior_id, player, Hex { q: 1, r: 0 }, &state.rules));
        state.units.insert(Unit::new_for_tests(warrior_id, player, Hex { q: 2, r: 0 }, &state.rules));

        // Found a city.
        let city_id = state.cities.insert(City {
            name: "TestCity".into(),
            owner: player,
            position: Hex { q: 5, r: 5 },
            population: 1,
            specialists: 0,
            food_stockpile: 0,
            production_stockpile: 0,
            buildings: Vec::new(),
            producing: None,
            claimed_tiles: vec![],
            border_progress: 0,
            locked_assignments: vec![],
        });
        state.map.get_mut(Hex { q: 5, r: 5 }).unwrap().city = Some(city_id);
        state.map.get_mut(Hex { q: 5, r: 5 }).unwrap().owner = Some(player);

        let engine = engine_from_state(state);
        let strength = engine.ai_military_strength(player);

        // 3 warriors (each with ~5 attack) + 1 city * 5 = ~20.
        assert!(strength > 10, "strength should include units and cities");
    }

    #[test]
    fn ai_accepts_favorable_proposals() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        state.players[0].is_ai = true;
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        p1.is_ai = false;
        state.players.push(p1);

        let ai_player = PlayerId(0);
        let human = PlayerId(1);

        // Human offers gold, demands nothing (gift).
        state.diplomacy.add_proposal(DealProposal {
            from: human,
            to: ai_player,
            offer: vec![DealItem::Gold { amount: 100 }],
            demand: vec![],
            expires_turn: 10,
        });

        // Set positive relations to make AI receptive.
        state.diplomacy.adjust_relation(ai_player, human, 20);

        let mut engine = engine_from_state(state);
        let events = engine.ai_respond_to_proposals(ai_player);

        // AI should accept the gift.
        assert!(events.iter().any(|e| matches!(e, Event::DealAccepted { from: f, to: t, .. } if *f == human && *t == ai_player)));
    }

    #[test]
    fn ai_rejects_unfavorable_proposals() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        state.players[0].is_ai = true;
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        p1.is_ai = false;
        state.players.push(p1);

        let ai_player = PlayerId(0);
        let human = PlayerId(1);

        // Human demands gold, offers nothing (extortion).
        state.diplomacy.add_proposal(DealProposal {
            from: human,
            to: ai_player,
            offer: vec![],
            demand: vec![DealItem::Gold { amount: 500 }],
            expires_turn: 10,
        });

        // Set negative relations.
        state.diplomacy.adjust_relation(ai_player, human, -30);

        let mut engine = engine_from_state(state);
        let events = engine.ai_respond_to_proposals(ai_player);

        // AI should reject the extortion.
        assert!(events.iter().any(|e| matches!(e, Event::DealRejected { from: f, to: t } if *f == human && *t == ai_player)));
    }

    #[test]
    fn ai_considers_peace_when_losing() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let warrior_id = rules.unit_type_id("warrior").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(10, 10, false, plains), rules.clone(), PlayerId(0));
        state.players[0].is_ai = true;
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        p1.is_ai = false;
        state.players.push(p1);

        let ai_player = PlayerId(0);
        let human = PlayerId(1);

        // Give human overwhelming military.
        for i in 0..10 {
            state.units.insert(Unit::new_for_tests(warrior_id, human, Hex { q: i, r: 5 }, &state.rules));
        }
        // AI has just one unit.
        state.units.insert(Unit::new_for_tests(warrior_id, ai_player, Hex { q: 0, r: 0 }, &state.rules));

        // Start a war.
        state.diplomacy.set_war(ai_player, human, true);

        let mut engine = engine_from_state(state);
        let events = engine.ai_consider_peace(ai_player);

        // AI should declare peace when vastly outmatched.
        assert!(events.iter().any(|e| matches!(e, Event::PeaceDeclared { .. })));
    }

    #[test]
    fn ai_considers_war_when_dominant() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();
        let warrior_id = rules.unit_type_id("warrior").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(10, 10, false, plains), rules.clone(), PlayerId(0));
        state.players[0].is_ai = true;
        state.turn = 25; // After early game protection.
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        p1.is_ai = false;
        state.players.push(p1);

        let ai_player = PlayerId(0);
        let human = PlayerId(1);

        // Give AI overwhelming military.
        for i in 0..10 {
            state.units.insert(Unit::new_for_tests(warrior_id, ai_player, Hex { q: i, r: 0 }, &state.rules));
        }
        // Human has just one unit.
        state.units.insert(Unit::new_for_tests(warrior_id, human, Hex { q: 5, r: 5 }, &state.rules));

        // Set negative relations.
        state.diplomacy.adjust_relation(ai_player, human, -60);

        let mut engine = engine_from_state(state);
        let events = engine.ai_consider_war(ai_player);

        // AI should declare war when dominant and hostile.
        assert!(events.iter().any(|e| matches!(e, Event::WarDeclared { aggressor, target } if *aggressor == ai_player && *target == human)));
    }

    #[test]
    fn ai_proposes_treaties_with_friends() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let plains = rules.terrain_id("plains").unwrap();

        let mut state =
            GameState::new_for_tests(GameMap::new(6, 6, false, plains), rules.clone(), PlayerId(0));
        state.players[0].is_ai = true;
        let mut p1 = Player::dummy(&rules);
        p1.id = PlayerId(1);
        p1.is_ai = false;
        state.players.push(p1);

        let ai_player = PlayerId(0);
        let human = PlayerId(1);

        // Set very positive relations (enough for defensive pact).
        state.diplomacy.adjust_relation(ai_player, human, 40);

        let mut engine = engine_from_state(state);
        let events = engine.ai_propose_deals(ai_player);

        // AI should propose a deal (open borders or defensive pact).
        assert!(events.iter().any(|e| matches!(e, Event::DealProposed { .. })));
    }
}
