use std::collections::BTreeMap;

use backbay_protocol::{
    BuildingId, GovernmentId, ImprovementId, PolicyId, TechId, TerrainId, UnitTypeId,
};
use serde::Deserialize;
use thiserror::Error;

use crate::rules::{CompiledRules, EffectIndex};

#[derive(Debug, Error)]
pub enum RulesError {
    #[error("yaml parse error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("missing referenced id: {0}")]
    MissingId(String),
    #[error("utf-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub enum RulesSource<'a> {
    Embedded,
    Path(String),
    Bytes {
        terrain: &'a [u8],
        units: &'a [u8],
        buildings: &'a [u8],
        techs: &'a [u8],
        improvements: Option<&'a [u8]>,
        policies: Option<&'a [u8]>,
        governments: Option<&'a [u8]>,
    },
}

#[derive(Debug, Deserialize)]
struct RawRules {
    terrains: BTreeMap<String, crate::rules::RawTerrainType>,
    units: BTreeMap<String, crate::rules::RawUnitType>,
    buildings: BTreeMap<String, crate::rules::RawBuildingType>,
    techs: BTreeMap<String, crate::rules::RawTechnology>,
    #[allow(dead_code)]
    improvements: Option<BTreeMap<String, crate::rules::RawImprovementType>>,
    policies: Option<BTreeMap<String, crate::rules::RawPolicy>>,
    governments: Option<BTreeMap<String, crate::rules::RawGovernment>>,
}

pub fn load_rules(source: RulesSource<'_>) -> Result<CompiledRules, RulesError> {
    let raw: RawRules = match source {
        RulesSource::Embedded => {
            let terrain_yaml = include_str!("../../data/base/terrain.yaml");
            let units_yaml = include_str!("../../data/base/units.yaml");
            let buildings_yaml = include_str!("../../data/base/buildings.yaml");
            let techs_yaml = include_str!("../../data/base/techs.yaml");
            let improvements_yaml = include_str!("../../data/base/improvements.yaml");
            let policies_yaml = include_str!("../../data/base/policies.yaml");
            let governments_yaml = include_str!("../../data/base/governments.yaml");

            parse_raw_rules(
                terrain_yaml,
                units_yaml,
                buildings_yaml,
                techs_yaml,
                Some(improvements_yaml),
                Some(policies_yaml),
                Some(governments_yaml),
            )?
        }
        RulesSource::Path(path) => {
            let terrain_yaml = std::fs::read_to_string(format!("{path}/terrain.yaml"))?;
            let units_yaml = std::fs::read_to_string(format!("{path}/units.yaml"))?;
            let buildings_yaml = std::fs::read_to_string(format!("{path}/buildings.yaml"))?;
            let techs_yaml = std::fs::read_to_string(format!("{path}/techs.yaml"))?;
            let improvements_yaml =
                std::fs::read_to_string(format!("{path}/improvements.yaml")).ok();
            let policies_yaml = std::fs::read_to_string(format!("{path}/policies.yaml")).ok();
            let governments_yaml = std::fs::read_to_string(format!("{path}/governments.yaml")).ok();
            parse_raw_rules(
                &terrain_yaml,
                &units_yaml,
                &buildings_yaml,
                &techs_yaml,
                improvements_yaml.as_deref(),
                policies_yaml.as_deref(),
                governments_yaml.as_deref(),
            )?
        }
        RulesSource::Bytes {
            terrain,
            units,
            buildings,
            techs,
            improvements,
            policies,
            governments,
        } => parse_raw_rules(
            std::str::from_utf8(terrain)?,
            std::str::from_utf8(units)?,
            std::str::from_utf8(buildings)?,
            std::str::from_utf8(techs)?,
            improvements.map(std::str::from_utf8).transpose()?,
            policies.map(std::str::from_utf8).transpose()?,
            governments.map(std::str::from_utf8).transpose()?,
        )?,
    };

    compile_rules(raw)
}

fn parse_raw_rules(
    terrain_yaml: &str,
    units_yaml: &str,
    buildings_yaml: &str,
    techs_yaml: &str,
    improvements_yaml: Option<&str>,
    policies_yaml: Option<&str>,
    governments_yaml: Option<&str>,
) -> Result<RawRules, RulesError> {
    let terrains = serde_yaml::from_str(terrain_yaml)?;
    let units = serde_yaml::from_str(units_yaml)?;
    let buildings = serde_yaml::from_str(buildings_yaml)?;
    let techs = serde_yaml::from_str(techs_yaml)?;
    let improvements = match improvements_yaml {
        Some(s) => Some(serde_yaml::from_str(s)?),
        None => None,
    };
    let policies = match policies_yaml {
        Some(s) => Some(serde_yaml::from_str(s)?),
        None => None,
    };
    let governments = match governments_yaml {
        Some(s) => Some(serde_yaml::from_str(s)?),
        None => None,
    };
    Ok(RawRules {
        terrains,
        units,
        buildings,
        techs,
        improvements,
        policies,
        governments,
    })
}

fn compile_rules(raw: RawRules) -> Result<CompiledRules, RulesError> {
    let terrain_ids = raw
        .terrains
        .keys()
        .enumerate()
        .map(|(i, k)| (k.clone(), TerrainId::new(i as u16)))
        .collect::<std::collections::HashMap<_, _>>();
    let unit_ids = raw
        .units
        .keys()
        .enumerate()
        .map(|(i, k)| (k.clone(), UnitTypeId::new(i as u16)))
        .collect::<std::collections::HashMap<_, _>>();
    let building_ids = raw
        .buildings
        .keys()
        .enumerate()
        .map(|(i, k)| (k.clone(), BuildingId::new(i as u16)))
        .collect::<std::collections::HashMap<_, _>>();
    let tech_ids = raw
        .techs
        .keys()
        .enumerate()
        .map(|(i, k)| (k.clone(), TechId::new(i as u16)))
        .collect::<std::collections::HashMap<_, _>>();
    let policy_ids = raw
        .policies
        .as_ref()
        .map(|p| {
            p.keys()
                .enumerate()
                .map(|(i, k)| (k.clone(), PolicyId::new(i as u16)))
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();
    let government_ids = raw
        .governments
        .as_ref()
        .map(|g| {
            g.keys()
                .enumerate()
                .map(|(i, k)| (k.clone(), GovernmentId::new(i as u16)))
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();
    let improvement_ids = raw
        .improvements
        .as_ref()
        .map(|imps| {
            imps.keys()
                .enumerate()
                .map(|(i, k)| (k.clone(), ImprovementId::new(i as u16)))
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();

    let terrains = raw
        .terrains
        .into_values()
        .map(|t| t.compile())
        .collect::<Vec<_>>();
    let unit_types = raw
        .units
        .into_values()
        .map(|u| u.compile(&tech_ids))
        .collect::<Result<Vec<_>, _>>()?;
    let buildings = raw
        .buildings
        .into_values()
        .map(|b| b.compile(&tech_ids, &unit_ids, &building_ids))
        .collect::<Result<Vec<_>, _>>()?;
    let techs = raw
        .techs
        .into_values()
        .map(|t| t.compile(&tech_ids))
        .collect::<Result<Vec<_>, _>>()?;
    let improvements = raw
        .improvements
        .unwrap_or_default()
        .into_values()
        .map(|i| i.compile(&terrain_ids))
        .collect::<Result<Vec<_>, _>>()?;
    let policies = raw
        .policies
        .unwrap_or_default()
        .into_values()
        .map(|p| p.compile())
        .collect::<Vec<_>>();
    let governments = raw
        .governments
        .unwrap_or_default()
        .into_values()
        .map(|g| g.compile())
        .collect::<Vec<_>>();

    let mut rules = CompiledRules {
        terrains,
        unit_types,
        buildings,
        techs,
        improvements,
        policies,
        governments,
        terrain_ids,
        unit_type_ids: unit_ids,
        building_ids,
        tech_ids,
        improvement_ids,
        policy_ids,
        government_ids,
        effect_index: EffectIndex::default(),
    };

    rules.effect_index = EffectIndex::build(&rules);
    Ok(rules)
}
