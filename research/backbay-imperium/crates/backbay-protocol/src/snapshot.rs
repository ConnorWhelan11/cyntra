use serde::{Deserialize, Serialize};

use crate::{
    BuildingId, ChronicleEntry, CityId, GovernmentId, Hex, ImprovementId, PlayerId, PolicyId,
    ProductionItem, ResearchStatus, ResourceId, TechId, TerrainId, TradeRouteId, UnitId,
    UnitOrders, UnitTypeId,
};

/// Full game state for initial sync or rejoin
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub turn: u32,
    pub current_player: PlayerId,
    pub map: MapSnapshot,
    pub players: Vec<PlayerSnapshot>,
    pub units: Vec<UnitSnapshot>,
    pub cities: Vec<CitySnapshot>,
    #[serde(default)]
    pub trade_routes: Vec<TradeRouteSnapshot>,
    #[serde(default)]
    pub chronicle: Vec<ChronicleEntry>,
    pub rng_state: [u8; 32], // for determinism verification
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapSnapshot {
    pub width: u32,
    pub height: u32,
    pub wrap_horizontal: bool,
    pub tiles: Vec<TileSnapshot>, // row-major
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileSnapshot {
    pub terrain: TerrainId,
    pub owner: Option<PlayerId>,
    pub city: Option<CityId>,
    #[serde(default)]
    pub improvement: Option<TileImprovementSnapshot>,
    #[serde(default)]
    pub resource: Option<ResourceId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileImprovementSnapshot {
    pub id: ImprovementId,
    pub tier: u8,
    pub worked_turns: i32,
    pub pillaged: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerSnapshot {
    pub id: PlayerId,
    pub name: String,
    pub is_ai: bool,
    #[serde(default)]
    pub researching: Option<TechId>,
    #[serde(default)]
    pub research: Option<ResearchStatus>,
    #[serde(default)]
    pub research_overflow: i32,
    #[serde(default)]
    pub known_techs: Vec<TechId>,
    #[serde(default)]
    pub gold: i32,
    #[serde(default)]
    pub culture: i32,
    #[serde(default)]
    pub culture_milestones_reached: u32,
    #[serde(default)]
    pub available_policy_picks: u8,
    #[serde(default)]
    pub policies: Vec<PolicyId>,
    /// Policy adoption eras aligned with `policies` (same order).
    #[serde(default)]
    pub policy_adopted_era: Vec<u8>,
    #[serde(default)]
    pub government: Option<GovernmentId>,
    #[serde(default)]
    pub supply_used: i32,
    #[serde(default)]
    pub supply_cap: i32,
    #[serde(default)]
    pub war_weariness: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TradeRouteSnapshot {
    pub id: TradeRouteId,
    pub owner: PlayerId,
    pub from: CityId,
    pub to: CityId,
    pub path: Vec<Hex>,
    #[serde(default)]
    pub is_external: bool,
}

/// Compact unit state for network
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnitSnapshot {
    pub id: UnitId,
    pub type_id: UnitTypeId,
    pub owner: PlayerId,
    pub pos: Hex,
    pub hp: i32,
    pub moves_left: i32,
    pub veteran_level: u8,
    pub orders: Option<UnitOrders>,
    #[serde(default)]
    pub automated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CitySnapshot {
    pub id: CityId,
    pub name: String,
    pub owner: PlayerId,
    pub pos: Hex,
    pub population: u8,
    pub food_stockpile: i32,
    pub production_stockpile: i32,
    pub buildings: Vec<BuildingId>,
    pub producing: Option<ProductionItem>,
    #[serde(default)]
    pub claimed_tiles: Vec<u32>,
    #[serde(default)]
    pub border_progress: i32,
}
