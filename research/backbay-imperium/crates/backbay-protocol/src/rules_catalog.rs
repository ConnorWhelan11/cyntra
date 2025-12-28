use serde::{Deserialize, Serialize};

use crate::{BuildingId, ImprovementId, TechId, TerrainId, UiYields, UnitTypeId};

/// Full rules view for UI panels (tech/unit/building/improvement details).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesCatalog {
    /// Deterministic hash of the compiled rules content.
    pub rules_hash: u64,
    pub techs: Vec<RulesCatalogTech>,
    pub unit_types: Vec<RulesCatalogUnitType>,
    pub buildings: Vec<RulesCatalogBuilding>,
    pub improvements: Vec<RulesCatalogImprovement>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesCatalogTech {
    pub id: TechId,
    pub name: String,
    pub cost: i32,
    pub era: u8,
    pub prerequisites: Vec<TechId>,
    pub unlock_units: Vec<UnitTypeId>,
    pub unlock_buildings: Vec<BuildingId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesCatalogUnitType {
    pub id: UnitTypeId,
    pub name: String,
    pub cost: i32,
    pub attack: i32,
    pub defense: i32,
    pub moves: i32,
    pub hp: i32,
    pub firepower: i32,
    pub supply_cost: i32,
    /// True for units that can found cities (e.g., settlers).
    pub can_found_city: bool,
    /// True for worker-style units (automation/build improvements).
    pub is_worker: bool,
    /// True if this unit can fortify.
    pub can_fortify: bool,
    pub tech_required: Option<TechId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesCatalogBuilding {
    pub id: BuildingId,
    pub name: String,
    pub cost: i32,
    pub maintenance: i32,
    pub admin: i32,
    pub tech_required: Option<TechId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesCatalogImprovement {
    pub id: ImprovementId,
    pub name: String,
    pub build_time: u8,
    pub repair_time: u8,
    pub allowed_terrain: Vec<TerrainId>,
    pub tiers: Vec<RulesCatalogImprovementTier>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RulesCatalogImprovementTier {
    pub yields: UiYields,
    pub worked_turns_to_next: Option<i32>,
}
