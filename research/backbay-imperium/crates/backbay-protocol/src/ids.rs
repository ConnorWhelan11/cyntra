use std::marker::PhantomData;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Data IDs are strings used in YAML files (human-readable, stable across versions)
pub type DataId = String;

/// Runtime IDs are integers compiled at rules-load (fast, deterministic)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RuntimeId<T> {
    pub raw: u16,
    #[serde(skip)]
    _marker: PhantomData<T>,
}

impl<T> RuntimeId<T> {
    #[inline]
    pub const fn new(raw: u16) -> Self {
        Self {
            raw,
            _marker: PhantomData,
        }
    }
}

// Type-safe runtime IDs
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct UnitTypeTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TerrainTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct BuildingTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TechTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ImprovementTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ResourceTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PolicyTag;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct GovernmentTag;

pub type UnitTypeId = RuntimeId<UnitTypeTag>;
pub type TerrainId = RuntimeId<TerrainTag>;
pub type BuildingId = RuntimeId<BuildingTag>;
pub type TechId = RuntimeId<TechTag>;
pub type ImprovementId = RuntimeId<ImprovementTag>;
pub type ResourceId = RuntimeId<ResourceTag>;
pub type PolicyId = RuntimeId<PolicyTag>;
pub type GovernmentId = RuntimeId<GovernmentTag>;

/// Entity IDs are generational (safe handles to mutable storage)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EntityId {
    pub index: u32,
    pub generation: u32,
}

impl EntityId {
    #[inline]
    pub const fn new(index: u32, generation: u32) -> Self {
        Self { index, generation }
    }

    #[inline]
    pub const fn from_raw(raw: u64) -> Self {
        Self {
            index: (raw >> 32) as u32,
            generation: raw as u32,
        }
    }

    #[inline]
    pub const fn to_raw(self) -> u64 {
        ((self.index as u64) << 32) | (self.generation as u64)
    }
}

impl Serialize for EntityId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u64(self.to_raw())
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = u64::deserialize(deserializer)?;
        Ok(Self::from_raw(raw))
    }
}

pub type UnitId = EntityId;
pub type CityId = EntityId;
pub type TradeRouteId = EntityId;

/// Player ID is a simple index (max 16 players)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PlayerId(pub u8);
