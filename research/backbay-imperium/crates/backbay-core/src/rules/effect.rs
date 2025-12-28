//! Comprehensive effect system for Backbay Imperium.
//!
//! Based on Freeciv's effect architecture: effects have requirements that must be met,
//! and an indexed lookup system for fast calculation during gameplay.
//!
//! All values use deterministic integer math:
//! - Milli-units: 1000 = 1.0 (for per-population, per-tile bonuses)
//! - Basis points: 10000 = 100% (for percentage modifiers)

use std::collections::HashMap;

use backbay_protocol::{
    BuildingId, GovernmentId, Hex, PolicyId, TechId, TerrainId, UnitTypeId, YieldType,
};

use crate::{city::City, rules::UnitClass, yields::Yields};

// ============================================================================
// REQUIREMENTS
// ============================================================================

/// Conditions that must be met for an effect to apply.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
pub enum Requirement {
    // Always/Never
    Always,
    Never,

    // Technology requirements
    HasTech { tech: String },
    LacksTech { tech: String },

    // Policy requirements
    HasPolicy { policy: String },
    LacksPolicy { policy: String },

    // Government requirements
    HasGovernment { government: String },

    // City requirements
    CityMinPopulation { value: u8 },
    CityMaxPopulation { value: u8 },
    CityHasBuilding { building: String },
    CityLacksBuilding { building: String },
    IsCapital,
    IsNotCapital,
    IsCoastal,

    // Terrain requirements (for tile/improvement effects)
    OnTerrain { terrain: String },
    NotOnTerrain { terrain: String },
    HasImprovement { improvement: String },

    // Diplomatic requirements
    AtWar,
    AtPeace,
    AtWarWith { player: u8 },

    // Era requirements
    MinEra { era: u8 },
    MaxEra { era: u8 },

    // Unit requirements (for unit-specific effects)
    UnitClass { class: UnitClass },
    UnitType { unit_type: String },

    // Resource requirements
    HasResource { resource: String },
    HasLuxuryResource,
    HasStrategicResource,

    // State requirements
    PositiveGold,
    NegativeGold,
    OverSupplyCap,
    UnderSupplyCap,

    // Compound requirements
    And { requirements: Vec<Requirement> },
    Or { requirements: Vec<Requirement> },
    Not { requirement: Box<Requirement> },
}

impl Requirement {
    /// Check if the requirement is met (legacy API for backward compatibility).
    pub fn is_met(&self, city: &City, _player: &crate::game::Player) -> bool {
        match self {
            Requirement::Always => true,
            Requirement::Never => false,
            Requirement::CityMinPopulation { value } => city.population >= *value,
            Requirement::CityMaxPopulation { value } => city.population <= *value,
            // For other requirements, default to true (conservative)
            // The full EffectContext-based evaluation handles all cases
            _ => true,
        }
    }
}

/// Compiled requirement with resolved IDs for fast runtime evaluation.
#[derive(Debug, Clone)]
pub enum CompiledRequirement {
    Always,
    Never,

    // Technology
    HasTech(TechId),
    LacksTech(TechId),

    // Policy
    HasPolicy(PolicyId),
    LacksPolicy(PolicyId),

    // Government
    HasGovernment(GovernmentId),

    // City
    CityMinPopulation(u8),
    CityMaxPopulation(u8),
    CityHasBuilding(BuildingId),
    CityLacksBuilding(BuildingId),
    IsCapital,
    IsNotCapital,
    IsCoastal,

    // Terrain
    OnTerrain(TerrainId),
    NotOnTerrain(TerrainId),

    // Diplomatic
    AtWar,
    AtPeace,

    // Era
    MinEra(u8),
    MaxEra(u8),

    // Unit
    UnitClassIs(UnitClass),
    UnitTypeIs(UnitTypeId),

    // State
    PositiveGold,
    NegativeGold,
    OverSupplyCap,
    UnderSupplyCap,

    // Compound
    And(Vec<CompiledRequirement>),
    Or(Vec<CompiledRequirement>),
    Not(Box<CompiledRequirement>),
}

// ============================================================================
// EFFECTS
// ============================================================================

/// Effect types that modify game state.
///
/// Uses milli-units (1000 = 1.0) for fractional values and
/// basis points (10000 = 100%) for percentage modifiers.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
pub enum Effect {
    // -------------------------------------------------------------------------
    // Yield Effects (City Production)
    // -------------------------------------------------------------------------
    /// Flat yield bonus (e.g., +2 production)
    YieldBonus {
        yield_type: YieldType,
        value: i32,
    },

    /// Percentage yield modifier in basis points (10000 = +100%)
    YieldPercentBp {
        yield_type: YieldType,
        value_bp: i32,
    },

    /// Yield bonus per population (milli-units: 1000 = +1 per pop)
    YieldPerPopMilli {
        yield_type: YieldType,
        value_milli: i32,
    },

    /// Science per population (legacy alias for YieldPerPopMilli)
    SciencePerPopMilli {
        value_milli: i32,
    },

    /// Yield bonus per worked tile of specific terrain
    YieldPerTerrainMilli {
        yield_type: YieldType,
        terrain: String,
        value_milli: i32,
    },

    // -------------------------------------------------------------------------
    // City Effects
    // -------------------------------------------------------------------------
    /// City defense bonus in basis points
    CityDefenseBp {
        value_bp: i32,
    },

    /// Housing capacity bonus
    Housing {
        value: i32,
    },

    /// City growth rate modifier (basis points)
    GrowthRateBp {
        value_bp: i32,
    },

    /// City border expansion rate modifier (basis points)
    BorderExpansionBp {
        value_bp: i32,
    },

    /// Great Person points generation (milli-units per turn)
    GreatPersonPointsMilli {
        category: GreatPersonCategory,
        value_milli: i32,
    },

    // -------------------------------------------------------------------------
    // Combat Effects
    // -------------------------------------------------------------------------
    /// Attack strength bonus (flat)
    AttackBonus {
        value: i32,
    },

    /// Attack strength modifier (basis points)
    AttackPercentBp {
        value_bp: i32,
    },

    /// Defense strength bonus (flat)
    DefenseBonus {
        value: i32,
    },

    /// Defense strength modifier (basis points)
    DefensePercentBp {
        value_bp: i32,
    },

    /// Combat strength vs specific unit class
    CombatVsClassBp {
        target_class: UnitClass,
        value_bp: i32,
    },

    /// Ranged attack bonus
    RangedAttackBp {
        value_bp: i32,
    },

    /// Firepower bonus
    FirepowerBonus {
        value: i32,
    },

    /// Veteran bonus for newly produced units
    VeteranBonus {
        unit_class: Option<UnitClass>,
        value: i32,
    },

    /// Healing rate bonus (HP per turn)
    HealingBonus {
        value: i32,
    },

    // -------------------------------------------------------------------------
    // Movement Effects
    // -------------------------------------------------------------------------
    /// Movement point bonus
    MovementBonus {
        value: i32,
    },

    /// Movement cost reduction (basis points)
    MovementCostReductionBp {
        value_bp: i32,
    },

    /// Ignore terrain movement cost
    IgnoreTerrainCost,

    /// Ignore Zone of Control
    IgnoreZoneOfControl,

    /// Can cross water without embarking
    CanCrossWater,

    /// Vision range bonus
    VisionBonus {
        value: i32,
    },

    // -------------------------------------------------------------------------
    // State Capacity Effects
    // -------------------------------------------------------------------------
    /// Base maintenance reduction per city (milli-units)
    MaintenanceReductionMilli {
        value_milli: i32,
    },

    /// Distance penalty reduction (basis points)
    DistancePenaltyReductionBp {
        value_bp: i32,
    },

    /// Instability reduction (flat)
    InstabilityReduction {
        value: i32,
    },

    /// Instability reduction (basis points)
    InstabilityReductionBp {
        value_bp: i32,
    },

    /// Admin capacity bonus (allows more cities without penalty)
    AdminCapacityBonus {
        value: i32,
    },

    /// Supply cap bonus
    SupplyCapBonus {
        value: i32,
    },

    /// Over-supply penalty reduction (basis points)
    OverSupplyPenaltyReductionBp {
        value_bp: i32,
    },

    // -------------------------------------------------------------------------
    // Trade Effects
    // -------------------------------------------------------------------------
    /// Gold from trade routes (milli-units)
    TradeGoldMilli {
        value_milli: i32,
    },

    /// Trade route capacity bonus
    TradeRouteCapacityBonus {
        value: i32,
    },

    /// Trade route range bonus (tiles)
    TradeRouteRangeBonus {
        value: i32,
    },

    // -------------------------------------------------------------------------
    // Research Effects
    // -------------------------------------------------------------------------
    /// Research speed modifier (basis points)
    ResearchSpeedBp {
        value_bp: i32,
    },

    /// Tech cost reduction for specific era (basis points)
    TechCostReductionBp {
        era: u8,
        value_bp: i32,
    },

    // -------------------------------------------------------------------------
    // Culture Effects
    // -------------------------------------------------------------------------
    /// Culture generation bonus
    CultureBonus {
        value: i32,
    },

    /// Culture generation modifier (basis points)
    CulturePercentBp {
        value_bp: i32,
    },

    /// Policy tenure bonus multiplier (basis points)
    PolicyTenureBp {
        value_bp: i32,
    },

    // -------------------------------------------------------------------------
    // Diplomacy Effects
    // -------------------------------------------------------------------------
    /// Relationship modifier with all players
    DiplomacyBonus {
        value: i32,
    },

    /// War weariness reduction (basis points)
    WarWearinessReductionBp {
        value_bp: i32,
    },

    // -------------------------------------------------------------------------
    // Special Abilities
    // -------------------------------------------------------------------------
    /// Unit can capture cities
    CanCaptureCities,

    /// Unit can build improvements
    CanBuildImprovements,

    /// Unit can found cities
    CanFoundCities,

    /// Unit can repair improvements
    CanRepairImprovements,

    /// Unit is invisible
    Invisible,

    /// Unit can detect invisible units
    DetectsInvisible,

    /// City is immune to cultural conversion
    CultureImmunity,

    /// Prevents enemy espionage
    CounterEspionage,
}

/// Categories of Great People for point generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GreatPersonCategory {
    Scientist,
    Engineer,
    Merchant,
    Artist,
    General,
    Prophet,
}

// ============================================================================
// EFFECT CONTEXT
// ============================================================================

/// Context for evaluating effect requirements.
///
/// This provides all the information needed to check if requirements are met
/// without needing to pass around the entire game state.
#[derive(Debug, Clone)]
pub struct EffectContext<'a> {
    // Player state
    pub known_techs: &'a [bool],
    pub policies: &'a [PolicyId],
    pub government: Option<GovernmentId>,
    pub gold: i32,
    pub supply_used: i32,
    pub supply_cap: i32,
    pub current_era: u8,
    pub at_war: bool,

    // City state (if applicable)
    pub city: Option<&'a CityContext>,

    // Unit state (if applicable)
    pub unit: Option<&'a UnitContext>,

    // Tile state (if applicable)
    pub tile: Option<&'a TileContext>,
}

#[derive(Debug, Clone)]
pub struct CityContext {
    pub population: u8,
    pub buildings: Vec<BuildingId>,
    pub is_capital: bool,
    pub is_coastal: bool,
    pub hex: Hex,
}

#[derive(Debug, Clone)]
pub struct UnitContext {
    pub unit_type: UnitTypeId,
    pub unit_class: UnitClass,
    pub hex: Hex,
}

#[derive(Debug, Clone)]
pub struct TileContext {
    pub terrain: TerrainId,
    pub hex: Hex,
}

impl<'a> EffectContext<'a> {
    /// Check if a compiled requirement is met.
    pub fn satisfies(&self, req: &CompiledRequirement) -> bool {
        match req {
            CompiledRequirement::Always => true,
            CompiledRequirement::Never => false,

            // Technology
            CompiledRequirement::HasTech(tech_id) => {
                self.known_techs.get(tech_id.raw as usize).copied().unwrap_or(false)
            }
            CompiledRequirement::LacksTech(tech_id) => {
                !self.known_techs.get(tech_id.raw as usize).copied().unwrap_or(false)
            }

            // Policy
            CompiledRequirement::HasPolicy(policy_id) => self.policies.contains(policy_id),
            CompiledRequirement::LacksPolicy(policy_id) => !self.policies.contains(policy_id),

            // Government
            CompiledRequirement::HasGovernment(gov_id) => self.government == Some(*gov_id),

            // City requirements
            CompiledRequirement::CityMinPopulation(min) => {
                self.city.map_or(false, |c| c.population >= *min)
            }
            CompiledRequirement::CityMaxPopulation(max) => {
                self.city.map_or(false, |c| c.population <= *max)
            }
            CompiledRequirement::CityHasBuilding(building_id) => {
                self.city.map_or(false, |c| c.buildings.contains(building_id))
            }
            CompiledRequirement::CityLacksBuilding(building_id) => {
                self.city.map_or(true, |c| !c.buildings.contains(building_id))
            }
            CompiledRequirement::IsCapital => self.city.map_or(false, |c| c.is_capital),
            CompiledRequirement::IsNotCapital => self.city.map_or(true, |c| !c.is_capital),
            CompiledRequirement::IsCoastal => self.city.map_or(false, |c| c.is_coastal),

            // Terrain
            CompiledRequirement::OnTerrain(terrain_id) => {
                self.tile.map_or(false, |t| t.terrain == *terrain_id)
            }
            CompiledRequirement::NotOnTerrain(terrain_id) => {
                self.tile.map_or(true, |t| t.terrain != *terrain_id)
            }

            // Diplomatic
            CompiledRequirement::AtWar => self.at_war,
            CompiledRequirement::AtPeace => !self.at_war,

            // Era
            CompiledRequirement::MinEra(min) => self.current_era >= *min,
            CompiledRequirement::MaxEra(max) => self.current_era <= *max,

            // Unit
            CompiledRequirement::UnitClassIs(class) => {
                self.unit.map_or(false, |u| u.unit_class == *class)
            }
            CompiledRequirement::UnitTypeIs(unit_type_id) => {
                self.unit.map_or(false, |u| u.unit_type == *unit_type_id)
            }

            // State
            CompiledRequirement::PositiveGold => self.gold >= 0,
            CompiledRequirement::NegativeGold => self.gold < 0,
            CompiledRequirement::OverSupplyCap => self.supply_used > self.supply_cap,
            CompiledRequirement::UnderSupplyCap => self.supply_used <= self.supply_cap,

            // Compound
            CompiledRequirement::And(reqs) => reqs.iter().all(|r| self.satisfies(r)),
            CompiledRequirement::Or(reqs) => reqs.iter().any(|r| self.satisfies(r)),
            CompiledRequirement::Not(req) => !self.satisfies(req),
        }
    }
}

// ============================================================================
// EFFECT INDEX
// ============================================================================

/// Source of an effect (for UI breakdown display).
#[derive(Debug, Clone)]
pub enum EffectSource {
    Building(BuildingId),
    Technology(TechId),
    Policy(PolicyId),
    Government(GovernmentId),
    Wonder(BuildingId),
    Terrain(TerrainId),
    Era(u8),
    Base, // Innate effect
}

/// An effect with its source and requirements.
#[derive(Debug, Clone)]
pub struct IndexedEffect {
    pub source: EffectSource,
    pub effect: Effect,
    pub requirements: Vec<CompiledRequirement>,
}

impl IndexedEffect {
    /// Check if this effect's requirements are met in the given context.
    pub fn is_active(&self, ctx: &EffectContext) -> bool {
        self.requirements.iter().all(|r| ctx.satisfies(r))
    }
}

/// Fast indexed lookup for effects.
///
/// Effects are organized by category for efficient queries:
/// - City yield effects (calculated per-city per-turn)
/// - Combat effects (calculated per-combat)
/// - Movement effects (calculated per-unit-move)
/// - Player-wide effects (calculated per-turn)
#[derive(Debug, Default)]
pub struct EffectIndex {
    // City effects indexed by building
    pub city_yield_by_building: HashMap<BuildingId, Vec<IndexedEffect>>,

    // Unit production effects by building
    pub unit_production_by_building: HashMap<BuildingId, Vec<IndexedEffect>>,

    // Combat effects (attack/defense modifiers)
    pub combat_effects: Vec<IndexedEffect>,

    // Movement effects
    pub movement_effects: Vec<IndexedEffect>,

    // State capacity effects (maintenance, admin, supply)
    pub state_capacity_effects: Vec<IndexedEffect>,

    // Trade effects
    pub trade_effects: Vec<IndexedEffect>,

    // Research effects
    pub research_effects: Vec<IndexedEffect>,

    // Culture effects
    pub culture_effects: Vec<IndexedEffect>,

    // Diplomacy effects
    pub diplomacy_effects: Vec<IndexedEffect>,

    // Global effects (everything else)
    pub global_effects: Vec<IndexedEffect>,
}

impl EffectIndex {
    /// Build the effect index from compiled rules.
    pub fn build(rules: &crate::rules::CompiledRules) -> Self {
        let mut index = EffectIndex::default();

        // Index building effects
        for (idx, building) in rules.buildings.iter().enumerate() {
            let building_id = BuildingId::new(idx as u16);
            for effect in &building.effects {
                let indexed = IndexedEffect {
                    source: EffectSource::Building(building_id),
                    effect: effect.clone(),
                    requirements: compile_requirements(&building.requirements, rules),
                };

                index.categorize_effect(indexed, Some(building_id));
            }
        }

        // Index policy effects
        for (idx, policy) in rules.policies.iter().enumerate() {
            let policy_id = PolicyId::new(idx as u16);
            for effect in &policy.effects {
                let indexed = IndexedEffect {
                    source: EffectSource::Policy(policy_id),
                    effect: effect.clone(),
                    requirements: compile_requirements(&policy.requirements, rules),
                };

                index.categorize_effect(indexed, None);
            }
        }

        // Index government effects (if governments have effects)
        // Currently governments only have admin capacity, but this can be extended

        index
    }

    /// Categorize an effect into the appropriate index.
    fn categorize_effect(&mut self, effect: IndexedEffect, building_id: Option<BuildingId>) {
        match &effect.effect {
            // City yield effects
            Effect::YieldBonus { .. }
            | Effect::YieldPercentBp { .. }
            | Effect::YieldPerPopMilli { .. }
            | Effect::SciencePerPopMilli { .. }
            | Effect::YieldPerTerrainMilli { .. } => {
                if let Some(bid) = building_id {
                    self.city_yield_by_building
                        .entry(bid)
                        .or_default()
                        .push(effect);
                } else {
                    self.global_effects.push(effect);
                }
            }

            // City defense & growth
            Effect::CityDefenseBp { .. }
            | Effect::Housing { .. }
            | Effect::GrowthRateBp { .. }
            | Effect::BorderExpansionBp { .. }
            | Effect::GreatPersonPointsMilli { .. } => {
                if let Some(bid) = building_id {
                    self.city_yield_by_building
                        .entry(bid)
                        .or_default()
                        .push(effect);
                } else {
                    self.global_effects.push(effect);
                }
            }

            // Combat effects
            Effect::AttackBonus { .. }
            | Effect::AttackPercentBp { .. }
            | Effect::DefenseBonus { .. }
            | Effect::DefensePercentBp { .. }
            | Effect::CombatVsClassBp { .. }
            | Effect::RangedAttackBp { .. }
            | Effect::FirepowerBonus { .. }
            | Effect::HealingBonus { .. } => {
                self.combat_effects.push(effect);
            }

            // Veteran bonus (unit production)
            Effect::VeteranBonus { .. } => {
                if let Some(bid) = building_id {
                    self.unit_production_by_building
                        .entry(bid)
                        .or_default()
                        .push(effect);
                } else {
                    self.global_effects.push(effect);
                }
            }

            // Movement effects
            Effect::MovementBonus { .. }
            | Effect::MovementCostReductionBp { .. }
            | Effect::IgnoreTerrainCost
            | Effect::IgnoreZoneOfControl
            | Effect::CanCrossWater
            | Effect::VisionBonus { .. } => {
                self.movement_effects.push(effect);
            }

            // State capacity effects
            Effect::MaintenanceReductionMilli { .. }
            | Effect::DistancePenaltyReductionBp { .. }
            | Effect::InstabilityReduction { .. }
            | Effect::InstabilityReductionBp { .. }
            | Effect::AdminCapacityBonus { .. }
            | Effect::SupplyCapBonus { .. }
            | Effect::OverSupplyPenaltyReductionBp { .. } => {
                self.state_capacity_effects.push(effect);
            }

            // Trade effects
            Effect::TradeGoldMilli { .. }
            | Effect::TradeRouteCapacityBonus { .. }
            | Effect::TradeRouteRangeBonus { .. } => {
                self.trade_effects.push(effect);
            }

            // Research effects
            Effect::ResearchSpeedBp { .. } | Effect::TechCostReductionBp { .. } => {
                self.research_effects.push(effect);
            }

            // Culture effects
            Effect::CultureBonus { .. }
            | Effect::CulturePercentBp { .. }
            | Effect::PolicyTenureBp { .. } => {
                self.culture_effects.push(effect);
            }

            // Diplomacy effects
            Effect::DiplomacyBonus { .. } | Effect::WarWearinessReductionBp { .. } => {
                self.diplomacy_effects.push(effect);
            }

            // Special abilities go to global
            Effect::CanCaptureCities
            | Effect::CanBuildImprovements
            | Effect::CanFoundCities
            | Effect::CanRepairImprovements
            | Effect::Invisible
            | Effect::DetectsInvisible
            | Effect::CultureImmunity
            | Effect::CounterEspionage => {
                self.global_effects.push(effect);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Query Methods
    // -------------------------------------------------------------------------

    /// Get all city yield effects from buildings the city has.
    /// (New API with full EffectContext)
    pub fn city_yield_effects_ctx<'a, 'b>(
        &'a self,
        city: &'b City,
        ctx: &'b EffectContext<'b>,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'b
    where
        'a: 'b,
    {
        city.buildings
            .iter()
            .filter_map(|&b| self.city_yield_by_building.get(&b))
            .flat_map(|effects| effects.iter())
            .filter(move |e| e.is_active(ctx))
    }

    /// Get all city yield effects from buildings the city has.
    /// (Legacy API for backward compatibility with existing game code)
    pub fn city_yield_effects<'a, 'b>(
        &'a self,
        city: &'b City,
        player: &'b crate::game::Player,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'b
    where
        'a: 'b,
    {
        city.buildings
            .iter()
            .filter_map(|&b| self.city_yield_by_building.get(&b))
            .flat_map(|effects| effects.iter())
            .filter(move |e| {
                e.requirements.iter().all(|r| match r {
                    CompiledRequirement::Always => true,
                    CompiledRequirement::Never => false,
                    CompiledRequirement::CityMinPopulation(min) => city.population >= *min,
                    CompiledRequirement::CityMaxPopulation(max) => city.population <= *max,
                    CompiledRequirement::CityHasBuilding(bid) => city.buildings.contains(bid),
                    CompiledRequirement::CityLacksBuilding(bid) => !city.buildings.contains(bid),
                    CompiledRequirement::HasTech(tid) => {
                        player.known_techs.get(tid.raw as usize).copied().unwrap_or(false)
                    }
                    CompiledRequirement::LacksTech(tid) => {
                        !player.known_techs.get(tid.raw as usize).copied().unwrap_or(false)
                    }
                    CompiledRequirement::HasPolicy(pid) => player.policies.contains(pid),
                    CompiledRequirement::LacksPolicy(pid) => !player.policies.contains(pid),
                    CompiledRequirement::HasGovernment(gid) => player.government == Some(*gid),
                    _ => true, // Default to true for requirements we can't check with limited context
                })
            })
    }

    /// Get all combat effects that apply to a unit.
    pub fn combat_effects_for<'a>(
        &'a self,
        ctx: &'a EffectContext<'a>,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'a {
        self.combat_effects.iter().filter(move |e| e.is_active(ctx))
    }

    /// Get all movement effects that apply to a unit.
    pub fn movement_effects_for<'a>(
        &'a self,
        ctx: &'a EffectContext<'a>,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'a {
        self.movement_effects
            .iter()
            .filter(move |e| e.is_active(ctx))
    }

    /// Get all state capacity effects.
    pub fn state_capacity_effects_for<'a>(
        &'a self,
        ctx: &'a EffectContext<'a>,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'a {
        self.state_capacity_effects
            .iter()
            .filter(move |e| e.is_active(ctx))
    }

    /// Get all trade effects.
    pub fn trade_effects_for<'a>(
        &'a self,
        ctx: &'a EffectContext<'a>,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'a {
        self.trade_effects.iter().filter(move |e| e.is_active(ctx))
    }

    /// Get all research effects.
    pub fn research_effects_for<'a>(
        &'a self,
        ctx: &'a EffectContext<'a>,
    ) -> impl Iterator<Item = &'a IndexedEffect> + 'a {
        self.research_effects
            .iter()
            .filter(move |e| e.is_active(ctx))
    }

    /// Calculate total research speed modifier (basis points).
    pub fn total_research_speed_bp(&self, ctx: &EffectContext) -> i32 {
        let mut total_bp = 10_000; // Base 100%
        for effect in self.research_effects_for(ctx) {
            if let Effect::ResearchSpeedBp { value_bp } = effect.effect {
                total_bp += value_bp;
            }
        }
        total_bp.max(0)
    }

    /// Calculate total attack bonus for a unit.
    pub fn total_attack_bonus(&self, ctx: &EffectContext) -> (i32, i32) {
        let mut flat = 0;
        let mut bp = 0;
        for effect in self.combat_effects_for(ctx) {
            match &effect.effect {
                Effect::AttackBonus { value } => flat += value,
                Effect::AttackPercentBp { value_bp } => bp += value_bp,
                _ => {}
            }
        }
        (flat, bp)
    }

    /// Calculate total defense bonus for a unit.
    pub fn total_defense_bonus(&self, ctx: &EffectContext) -> (i32, i32) {
        let mut flat = 0;
        let mut bp = 0;
        for effect in self.combat_effects_for(ctx) {
            match &effect.effect {
                Effect::DefenseBonus { value } => flat += value,
                Effect::DefensePercentBp { value_bp } => bp += value_bp,
                _ => {}
            }
        }
        (flat, bp)
    }

    /// Calculate total movement bonus for a unit.
    pub fn total_movement_bonus(&self, ctx: &EffectContext) -> i32 {
        let mut total = 0;
        for effect in self.movement_effects_for(ctx) {
            if let Effect::MovementBonus { value } = effect.effect {
                total += value;
            }
        }
        total
    }

    /// Check if unit has a specific ability.
    pub fn has_ability(&self, ctx: &EffectContext, ability: &Effect) -> bool {
        // Check movement effects for movement abilities
        for effect in self.movement_effects_for(ctx) {
            if std::mem::discriminant(&effect.effect) == std::mem::discriminant(ability) {
                return true;
            }
        }
        // Check global effects for special abilities
        for effect in self.global_effects.iter().filter(|e| e.is_active(ctx)) {
            if std::mem::discriminant(&effect.effect) == std::mem::discriminant(ability) {
                return true;
            }
        }
        false
    }

    /// Calculate total supply cap bonus.
    pub fn total_supply_cap_bonus(&self, ctx: &EffectContext) -> i32 {
        let mut total = 0;
        for effect in self.state_capacity_effects_for(ctx) {
            if let Effect::SupplyCapBonus { value } = effect.effect {
                total += value;
            }
        }
        total
    }

    /// Calculate total admin capacity bonus.
    pub fn total_admin_capacity_bonus(&self, ctx: &EffectContext) -> i32 {
        let mut total = 0;
        for effect in self.state_capacity_effects_for(ctx) {
            if let Effect::AdminCapacityBonus { value } = effect.effect {
                total += value;
            }
        }
        total
    }
}

// ============================================================================
// EFFECT APPLICATION
// ============================================================================

impl Effect {
    /// Apply this effect to yields (for city yield calculation).
    pub fn apply(&self, yields: &mut Yields, city: &City) {
        self.apply_with_multiplier_bp(yields, city, 10_000);
    }

    /// Apply this effect with a multiplier (for tenure bonuses, etc.).
    ///
    /// `multiplier_bp` is in basis points: 10000 = 100%, 15000 = 150%
    pub fn apply_with_multiplier_bp(&self, yields: &mut Yields, city: &City, multiplier_bp: i32) {
        let multiplier_bp = i64::from(multiplier_bp);
        match self {
            Effect::YieldBonus { yield_type, value } => {
                let delta = i64::from(*value).saturating_mul(multiplier_bp) / 10_000;
                *yields.get_mut(*yield_type) += delta as i32;
            }
            Effect::YieldPercentBp {
                yield_type,
                value_bp,
            } => {
                let base = i64::from(*yields.get(*yield_type));
                let effective_bp = i64::from(*value_bp).saturating_mul(multiplier_bp) / 10_000;
                let delta = base.saturating_mul(effective_bp) / 10_000;
                *yields.get_mut(*yield_type) += delta as i32;
            }
            Effect::YieldPerPopMilli {
                yield_type,
                value_milli,
            } => {
                let effective_milli =
                    i64::from(*value_milli).saturating_mul(multiplier_bp) / 10_000;
                let delta = i64::from(city.population).saturating_mul(effective_milli) / 1000;
                *yields.get_mut(*yield_type) += delta as i32;
            }
            Effect::SciencePerPopMilli { value_milli } => {
                let effective_milli =
                    i64::from(*value_milli).saturating_mul(multiplier_bp) / 10_000;
                let delta = i64::from(city.population).saturating_mul(effective_milli) / 1000;
                yields.science += delta as i32;
            }
            _ => {} // Non-yield effects handled elsewhere
        }
    }
}

// ============================================================================
// REQUIREMENT COMPILATION
// ============================================================================

/// Compile raw requirements into compiled form with resolved IDs.
fn compile_requirements(
    requirements: &[Requirement],
    rules: &crate::rules::CompiledRules,
) -> Vec<CompiledRequirement> {
    requirements
        .iter()
        .filter_map(|r| compile_requirement(r, rules))
        .collect()
}

fn compile_requirement(
    req: &Requirement,
    rules: &crate::rules::CompiledRules,
) -> Option<CompiledRequirement> {
    match req {
        Requirement::Always => Some(CompiledRequirement::Always),
        Requirement::Never => Some(CompiledRequirement::Never),

        Requirement::HasTech { tech } => {
            rules.tech_ids.get(tech).map(|&id| CompiledRequirement::HasTech(id))
        }
        Requirement::LacksTech { tech } => {
            rules.tech_ids.get(tech).map(|&id| CompiledRequirement::LacksTech(id))
        }

        Requirement::HasPolicy { policy } => {
            rules.policy_ids.get(policy).map(|&id| CompiledRequirement::HasPolicy(id))
        }
        Requirement::LacksPolicy { policy } => {
            rules.policy_ids.get(policy).map(|&id| CompiledRequirement::LacksPolicy(id))
        }

        Requirement::HasGovernment { government } => {
            rules.government_ids.get(government).map(|&id| CompiledRequirement::HasGovernment(id))
        }

        Requirement::CityMinPopulation { value } => {
            Some(CompiledRequirement::CityMinPopulation(*value))
        }
        Requirement::CityMaxPopulation { value } => {
            Some(CompiledRequirement::CityMaxPopulation(*value))
        }
        Requirement::CityHasBuilding { building } => {
            rules.building_ids.get(building).map(|&id| CompiledRequirement::CityHasBuilding(id))
        }
        Requirement::CityLacksBuilding { building } => {
            rules.building_ids.get(building).map(|&id| CompiledRequirement::CityLacksBuilding(id))
        }
        Requirement::IsCapital => Some(CompiledRequirement::IsCapital),
        Requirement::IsNotCapital => Some(CompiledRequirement::IsNotCapital),
        Requirement::IsCoastal => Some(CompiledRequirement::IsCoastal),

        Requirement::OnTerrain { terrain } => {
            rules.terrain_ids.get(terrain).map(|&id| CompiledRequirement::OnTerrain(id))
        }
        Requirement::NotOnTerrain { terrain } => {
            rules.terrain_ids.get(terrain).map(|&id| CompiledRequirement::NotOnTerrain(id))
        }
        Requirement::HasImprovement { .. } => {
            // TODO: Add improvement lookup when needed
            Some(CompiledRequirement::Always)
        }

        Requirement::AtWar => Some(CompiledRequirement::AtWar),
        Requirement::AtPeace => Some(CompiledRequirement::AtPeace),
        Requirement::AtWarWith { .. } => {
            // Simplified: just check if at war with anyone
            Some(CompiledRequirement::AtWar)
        }

        Requirement::MinEra { era } => Some(CompiledRequirement::MinEra(*era)),
        Requirement::MaxEra { era } => Some(CompiledRequirement::MaxEra(*era)),

        Requirement::UnitClass { class } => Some(CompiledRequirement::UnitClassIs(*class)),
        Requirement::UnitType { unit_type } => {
            rules.unit_type_ids.get(unit_type).map(|&id| CompiledRequirement::UnitTypeIs(id))
        }

        Requirement::HasResource { .. }
        | Requirement::HasLuxuryResource
        | Requirement::HasStrategicResource => {
            // TODO: Add resource system
            Some(CompiledRequirement::Always)
        }

        Requirement::PositiveGold => Some(CompiledRequirement::PositiveGold),
        Requirement::NegativeGold => Some(CompiledRequirement::NegativeGold),
        Requirement::OverSupplyCap => Some(CompiledRequirement::OverSupplyCap),
        Requirement::UnderSupplyCap => Some(CompiledRequirement::UnderSupplyCap),

        Requirement::And { requirements } => {
            let compiled: Vec<_> = requirements
                .iter()
                .filter_map(|r| compile_requirement(r, rules))
                .collect();
            Some(CompiledRequirement::And(compiled))
        }
        Requirement::Or { requirements } => {
            let compiled: Vec<_> = requirements
                .iter()
                .filter_map(|r| compile_requirement(r, rules))
                .collect();
            Some(CompiledRequirement::Or(compiled))
        }
        Requirement::Not { requirement } => {
            compile_requirement(requirement, rules)
                .map(|r| CompiledRequirement::Not(Box::new(r)))
        }
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_context() -> EffectContext<'static> {
        static EMPTY_TECHS: [bool; 0] = [];
        static EMPTY_POLICIES: [PolicyId; 0] = [];
        EffectContext {
            known_techs: &EMPTY_TECHS,
            policies: &EMPTY_POLICIES,
            government: None,
            gold: 100,
            supply_used: 5,
            supply_cap: 10,
            current_era: 0,
            at_war: false,
            city: None,
            unit: None,
            tile: None,
        }
    }

    #[test]
    fn test_always_never_requirements() {
        let ctx = empty_context();
        assert!(ctx.satisfies(&CompiledRequirement::Always));
        assert!(!ctx.satisfies(&CompiledRequirement::Never));
    }

    #[test]
    fn test_gold_requirements() {
        let mut ctx = empty_context();
        ctx.gold = 100;
        assert!(ctx.satisfies(&CompiledRequirement::PositiveGold));
        assert!(!ctx.satisfies(&CompiledRequirement::NegativeGold));

        ctx.gold = -50;
        assert!(!ctx.satisfies(&CompiledRequirement::PositiveGold));
        assert!(ctx.satisfies(&CompiledRequirement::NegativeGold));
    }

    #[test]
    fn test_supply_requirements() {
        let mut ctx = empty_context();
        ctx.supply_used = 5;
        ctx.supply_cap = 10;
        assert!(ctx.satisfies(&CompiledRequirement::UnderSupplyCap));
        assert!(!ctx.satisfies(&CompiledRequirement::OverSupplyCap));

        ctx.supply_used = 15;
        assert!(!ctx.satisfies(&CompiledRequirement::UnderSupplyCap));
        assert!(ctx.satisfies(&CompiledRequirement::OverSupplyCap));
    }

    #[test]
    fn test_era_requirements() {
        let mut ctx = empty_context();
        ctx.current_era = 2;
        assert!(ctx.satisfies(&CompiledRequirement::MinEra(1)));
        assert!(ctx.satisfies(&CompiledRequirement::MinEra(2)));
        assert!(!ctx.satisfies(&CompiledRequirement::MinEra(3)));
        assert!(ctx.satisfies(&CompiledRequirement::MaxEra(2)));
        assert!(ctx.satisfies(&CompiledRequirement::MaxEra(3)));
        assert!(!ctx.satisfies(&CompiledRequirement::MaxEra(1)));
    }

    #[test]
    fn test_compound_requirements() {
        let ctx = empty_context();

        // AND: both must be true
        let and_req = CompiledRequirement::And(vec![
            CompiledRequirement::Always,
            CompiledRequirement::PositiveGold,
        ]);
        assert!(ctx.satisfies(&and_req));

        let and_req_fail = CompiledRequirement::And(vec![
            CompiledRequirement::Always,
            CompiledRequirement::Never,
        ]);
        assert!(!ctx.satisfies(&and_req_fail));

        // OR: at least one must be true
        let or_req = CompiledRequirement::Or(vec![
            CompiledRequirement::Never,
            CompiledRequirement::Always,
        ]);
        assert!(ctx.satisfies(&or_req));

        let or_req_fail = CompiledRequirement::Or(vec![
            CompiledRequirement::Never,
            CompiledRequirement::Never,
        ]);
        assert!(!ctx.satisfies(&or_req_fail));

        // NOT: invert
        let not_req = CompiledRequirement::Not(Box::new(CompiledRequirement::Never));
        assert!(ctx.satisfies(&not_req));
    }

    #[test]
    fn test_city_requirements() {
        let city_ctx = CityContext {
            population: 5,
            buildings: vec![BuildingId::new(1), BuildingId::new(2)],
            is_capital: true,
            is_coastal: false,
            hex: Hex { q: 0, r: 0 },
        };

        let mut ctx = empty_context();
        ctx.city = Some(&city_ctx);

        assert!(ctx.satisfies(&CompiledRequirement::CityMinPopulation(3)));
        assert!(ctx.satisfies(&CompiledRequirement::CityMinPopulation(5)));
        assert!(!ctx.satisfies(&CompiledRequirement::CityMinPopulation(6)));

        assert!(ctx.satisfies(&CompiledRequirement::CityHasBuilding(BuildingId::new(1))));
        assert!(!ctx.satisfies(&CompiledRequirement::CityHasBuilding(BuildingId::new(99))));

        assert!(ctx.satisfies(&CompiledRequirement::IsCapital));
        assert!(!ctx.satisfies(&CompiledRequirement::IsNotCapital));
        assert!(!ctx.satisfies(&CompiledRequirement::IsCoastal));
    }

    #[test]
    fn test_yield_bonus_application() {
        let mut yields = Yields::default();
        yields.production = 10;

        let city = City {
            population: 5,
            ..Default::default()
        };

        // Flat bonus
        let effect = Effect::YieldBonus {
            yield_type: YieldType::Production,
            value: 3,
        };
        effect.apply(&mut yields, &city);
        assert_eq!(yields.production, 13);

        // Percentage bonus (20% = 2000 bp)
        let effect2 = Effect::YieldPercentBp {
            yield_type: YieldType::Production,
            value_bp: 2000,
        };
        effect2.apply(&mut yields, &city);
        // 13 + (13 * 2000 / 10000) = 13 + 2 = 15 (integer division)
        assert_eq!(yields.production, 15);
    }

    #[test]
    fn test_per_pop_bonus() {
        let mut yields = Yields::default();
        let city = City {
            population: 10,
            ..Default::default()
        };

        // +0.5 science per pop (500 milli)
        let effect = Effect::SciencePerPopMilli { value_milli: 500 };
        effect.apply(&mut yields, &city);
        // 10 * 500 / 1000 = 5
        assert_eq!(yields.science, 5);
    }

    #[test]
    fn test_multiplier_application() {
        let mut yields = Yields::default();
        let city = City {
            population: 4,
            ..Default::default()
        };

        // Base +2 production, with 150% multiplier (tenure bonus)
        let effect = Effect::YieldBonus {
            yield_type: YieldType::Production,
            value: 2,
        };
        effect.apply_with_multiplier_bp(&mut yields, &city, 15_000);
        // 2 * 15000 / 10000 = 3
        assert_eq!(yields.production, 3);
    }
}
