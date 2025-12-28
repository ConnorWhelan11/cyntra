use std::collections::HashMap;

use backbay_protocol::{
    BuildingId, DataId, GovernmentId, ImprovementId, PolicyId, TechId, TerrainId, UnitTypeId,
    YieldType,
};
use serde::Deserialize;

use crate::rules::{Effect, Requirement};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TechEra {
    Ancient,
    Classical,
    Medieval,
    Renaissance,
    Industrial,
    Modern,
    Future,
}

impl TechEra {
    pub fn index(self) -> u8 {
        match self {
            TechEra::Ancient => 0,
            TechEra::Classical => 1,
            TechEra::Medieval => 2,
            TechEra::Renaissance => 3,
            TechEra::Industrial => 4,
            TechEra::Modern => 5,
            TechEra::Future => 6,
        }
    }
}

fn default_tech_era() -> TechEra {
    TechEra::Ancient
}

#[derive(Debug)]
pub struct CompiledRules {
    pub terrains: Vec<TerrainType>,
    pub unit_types: Vec<UnitType>,
    pub buildings: Vec<BuildingType>,
    pub techs: Vec<Technology>,
    pub improvements: Vec<ImprovementType>,
    pub policies: Vec<Policy>,
    pub governments: Vec<Government>,

    pub terrain_ids: HashMap<DataId, TerrainId>,
    pub unit_type_ids: HashMap<DataId, UnitTypeId>,
    pub building_ids: HashMap<DataId, BuildingId>,
    pub tech_ids: HashMap<DataId, TechId>,
    pub improvement_ids: HashMap<DataId, ImprovementId>,
    pub policy_ids: HashMap<DataId, PolicyId>,
    pub government_ids: HashMap<DataId, GovernmentId>,

    pub effect_index: crate::rules::EffectIndex,
}

impl Clone for CompiledRules {
    fn clone(&self) -> Self {
        Self {
            terrains: self.terrains.clone(),
            unit_types: self.unit_types.clone(),
            buildings: self.buildings.clone(),
            techs: self.techs.clone(),
            improvements: self.improvements.clone(),
            policies: self.policies.clone(),
            governments: self.governments.clone(),
            terrain_ids: self.terrain_ids.clone(),
            unit_type_ids: self.unit_type_ids.clone(),
            building_ids: self.building_ids.clone(),
            tech_ids: self.tech_ids.clone(),
            improvement_ids: self.improvement_ids.clone(),
            policy_ids: self.policy_ids.clone(),
            government_ids: self.government_ids.clone(),
            effect_index: crate::rules::EffectIndex::build(self),
        }
    }
}

impl CompiledRules {
    pub fn terrain(&self, id: TerrainId) -> &TerrainType {
        &self.terrains[id.raw as usize]
    }

    pub fn unit_type(&self, id: UnitTypeId) -> &UnitType {
        &self.unit_types[id.raw as usize]
    }

    pub fn building(&self, id: BuildingId) -> &BuildingType {
        &self.buildings[id.raw as usize]
    }

    pub fn improvement(&self, id: ImprovementId) -> &ImprovementType {
        &self.improvements[id.raw as usize]
    }

    pub fn terrain_id(&self, data_id: &str) -> Option<TerrainId> {
        self.terrain_ids.get(data_id).copied()
    }

    pub fn unit_type_id(&self, data_id: &str) -> Option<UnitTypeId> {
        self.unit_type_ids.get(data_id).copied()
    }

    pub fn improvement_id(&self, data_id: &str) -> Option<ImprovementId> {
        self.improvement_ids.get(data_id).copied()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawTerrainType {
    pub name: String,
    pub defense_bonus: i32,
    pub yields: RawYields,
    #[serde(default = "default_move_cost")]
    pub move_cost: i32,
    #[serde(default)]
    pub impassable: bool,
}

impl RawTerrainType {
    pub fn compile(self) -> TerrainType {
        TerrainType {
            name: self.name,
            defense_bonus: self.defense_bonus,
            yields: self.yields.compile(),
            move_cost: self.move_cost.max(1),
            impassable: self.impassable,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TerrainType {
    pub name: String,
    pub defense_bonus: i32,
    pub yields: crate::yields::Yields,
    pub move_cost: i32,
    pub impassable: bool,
}

fn default_move_cost() -> i32 {
    1
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawYields {
    pub food: i32,
    pub production: i32,
    pub gold: i32,
}

impl RawYields {
    pub fn compile(self) -> crate::yields::Yields {
        crate::yields::Yields {
            food: self.food,
            production: self.production,
            gold: self.gold,
            science: 0,
            culture: 0,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawUnitType {
    pub name: String,
    pub class: UnitClass,
    pub attack: i32,
    pub defense: i32,
    pub moves: i32,
    pub hp: i32,
    pub firepower: i32,
    pub cost: i32,
    #[serde(default)]
    pub supply_cost: Option<i32>,
    #[serde(default)]
    pub can_found_city: bool,
    #[serde(default)]
    pub is_worker: bool,
    #[serde(default)]
    pub can_fortify: Option<bool>,
    pub tech_required: Option<String>,
}

impl RawUnitType {
    pub fn compile(
        self,
        tech_ids: &HashMap<DataId, TechId>,
    ) -> Result<UnitType, crate::rules::RulesError> {
        let can_fortify = self
            .can_fortify
            .unwrap_or(!matches!(self.class, UnitClass::Civilian));
        let tech_required = match self.tech_required {
            Some(id) => Some(
                *tech_ids
                    .get(&id)
                    .ok_or(crate::rules::RulesError::MissingId(id))?,
            ),
            None => None,
        };
        Ok(UnitType {
            name: self.name,
            class: self.class,
            attack: self.attack,
            defense: self.defense,
            moves: self.moves,
            hp: self.hp,
            firepower: self.firepower,
            cost: self.cost,
            supply_cost: self
                .supply_cost
                .unwrap_or({
                    if matches!(self.class, UnitClass::Civilian) {
                        0
                    } else {
                        1
                    }
                })
                .max(0),
            can_found_city: self.can_found_city,
            is_worker: self.is_worker,
            can_fortify,
            tech_required,
            obsolete_by: None,
            abilities: Vec::new(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct UnitType {
    pub name: String,
    pub class: UnitClass,
    pub attack: i32,
    pub defense: i32,
    pub moves: i32,
    pub hp: i32,
    pub firepower: i32,
    pub cost: i32,
    pub supply_cost: i32,
    pub can_found_city: bool,
    pub is_worker: bool,
    pub can_fortify: bool,
    pub tech_required: Option<TechId>,
    pub obsolete_by: Option<UnitTypeId>,
    pub abilities: Vec<UnitAbility>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, serde::Serialize)]
pub enum UnitClass {
    Civilian,
    Melee,
    Ranged,
    Naval,
}

#[derive(Debug, Clone)]
pub enum UnitAbility {}

#[derive(Debug, Clone, Deserialize)]
pub struct RawBuildingType {
    pub name: String,
    pub cost: i32,
    pub maintenance: i32,
    #[serde(default)]
    pub admin: i32,
    pub tech_required: Option<String>,
    #[serde(default)]
    pub effects: Vec<Effect>,
    #[serde(default)]
    pub requirements: Vec<Requirement>,
}

impl RawBuildingType {
    pub fn compile(
        self,
        tech_ids: &HashMap<DataId, TechId>,
        _unit_ids: &HashMap<DataId, UnitTypeId>,
        _building_ids: &HashMap<DataId, BuildingId>,
    ) -> Result<BuildingType, crate::rules::RulesError> {
        let tech_required = match self.tech_required {
            Some(id) => Some(
                *tech_ids
                    .get(&id)
                    .ok_or(crate::rules::RulesError::MissingId(id))?,
            ),
            None => None,
        };
        Ok(BuildingType {
            name: self.name,
            cost: self.cost,
            maintenance: self.maintenance,
            admin: self.admin,
            tech_required,
            effects: self.effects,
            requirements: self.requirements,
        })
    }
}

#[derive(Debug, Clone)]
pub struct BuildingType {
    pub name: String,
    pub cost: i32,
    pub maintenance: i32,
    pub admin: i32,
    pub tech_required: Option<TechId>,
    pub effects: Vec<Effect>,
    pub requirements: Vec<Requirement>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawTechnology {
    pub name: String,
    pub cost: i32,
    #[serde(default = "default_tech_era")]
    pub era: TechEra,
    #[serde(default)]
    pub prerequisites: Vec<String>,
}

impl RawTechnology {
    pub fn compile(
        self,
        tech_ids: &HashMap<DataId, TechId>,
    ) -> Result<Technology, crate::rules::RulesError> {
        let prerequisites = self
            .prerequisites
            .into_iter()
            .map(|id| {
                tech_ids
                    .get(&id)
                    .copied()
                    .ok_or(crate::rules::RulesError::MissingId(id))
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Technology {
            name: self.name,
            cost: self.cost,
            era: self.era,
            prerequisites,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Technology {
    pub name: String,
    pub cost: i32,
    pub era: TechEra,
    pub prerequisites: Vec<TechId>,
}

#[derive(Debug, Clone)]
pub struct ImprovementType {
    pub name: String,
    pub build_time: u8,
    pub repair_time: u8,
    pub allowed_terrain: Vec<TerrainId>,
    pub tiers: Vec<ImprovementTier>,
}

impl ImprovementType {
    pub fn max_tier(&self) -> u8 {
        self.tiers.len().min(u8::MAX as usize) as u8
    }

    pub fn tier(&self, tier: u8) -> &ImprovementTier {
        let idx = (tier.max(1) as usize).saturating_sub(1);
        let idx = idx.min(self.tiers.len().saturating_sub(1));
        &self.tiers[idx]
    }
}

#[derive(Debug, Clone)]
pub struct ImprovementTier {
    pub yields: crate::yields::Yields,
    pub worked_turns_to_next: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct Policy {
    pub name: String,
    pub description: String,
    pub effects: Vec<Effect>,
    pub requirements: Vec<Requirement>,
}

#[derive(Debug, Clone)]
pub struct Government {
    pub name: String,
    pub admin: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawImprovementType {
    pub name: String,
    #[serde(default = "default_improvement_build_time")]
    pub build_time: u8,
    #[serde(default = "default_improvement_repair_time")]
    pub repair_time: u8,
    /// If empty, improvement can be built on any terrain.
    #[serde(default)]
    pub allowed_terrain: Vec<String>,
    pub tiers: Vec<RawImprovementTier>,
}

fn default_improvement_build_time() -> u8 {
    3
}

fn default_improvement_repair_time() -> u8 {
    2
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawImprovementTier {
    pub yields: RawYields,
    #[serde(default)]
    pub worked_turns_to_next: Option<i32>,
}

impl RawImprovementType {
    pub fn compile(
        self,
        terrain_ids: &HashMap<DataId, TerrainId>,
    ) -> Result<ImprovementType, crate::rules::RulesError> {
        if self.tiers.is_empty() {
            return Ok(ImprovementType {
                name: self.name,
                build_time: self.build_time.max(1),
                repair_time: self.repair_time.max(1),
                allowed_terrain: Vec::new(),
                tiers: vec![ImprovementTier {
                    yields: crate::yields::Yields::default(),
                    worked_turns_to_next: None,
                }],
            });
        }

        let allowed_terrain = self
            .allowed_terrain
            .into_iter()
            .map(|id| {
                terrain_ids
                    .get(&id)
                    .copied()
                    .ok_or(crate::rules::RulesError::MissingId(id))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let tiers = self
            .tiers
            .into_iter()
            .map(|t| ImprovementTier {
                yields: t.yields.compile(),
                worked_turns_to_next: t.worked_turns_to_next.and_then(|v| (v > 0).then_some(v)),
            })
            .collect::<Vec<_>>();

        Ok(ImprovementType {
            name: self.name,
            build_time: self.build_time.max(1),
            repair_time: self.repair_time.max(1),
            allowed_terrain,
            tiers,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawPolicy {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub effects: Vec<Effect>,
    #[serde(default)]
    pub requirements: Vec<Requirement>,
}

impl RawPolicy {
    pub fn compile(self) -> Policy {
        Policy {
            name: self.name,
            description: self.description,
            effects: self.effects,
            requirements: self.requirements,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawGovernment {
    pub name: String,
    #[serde(default)]
    pub admin: i32,
}

impl RawGovernment {
    pub fn compile(self) -> Government {
        Government {
            name: self.name,
            admin: self.admin,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct YieldBreakdown {
    pub yield_type: YieldType,
    pub value: i32,
}
