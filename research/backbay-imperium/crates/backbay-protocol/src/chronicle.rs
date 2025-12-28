use serde::{Deserialize, Serialize};

use crate::{BuildingId, CityId, GovernmentId, Hex, ImprovementId, PlayerId, PolicyId, TechId, UnitId, UnitTypeId};

/// A permanent, replayable history entry for the timeline UI.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChronicleEntry {
    pub id: u64,
    pub turn: u32,
    pub event: ChronicleEvent,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChronicleEvent {
    // City events
    CityFounded {
        owner: PlayerId,
        city: CityId,
        name: String,
        pos: Hex,
    },
    CityConquered {
        city: CityId,
        name: String,
        pos: Hex,
        old_owner: PlayerId,
        new_owner: PlayerId,
    },
    CityGrew {
        owner: PlayerId,
        city: CityId,
        name: String,
        new_pop: u8,
    },
    BorderExpanded {
        owner: PlayerId,
        city: CityId,
        new_tiles: Vec<Hex>,
    },

    // Production events
    WonderCompleted {
        owner: PlayerId,
        city: CityId,
        building: BuildingId,
    },
    UnitTrained {
        owner: PlayerId,
        city: CityId,
        unit_type: UnitTypeId,
    },
    BuildingConstructed {
        owner: PlayerId,
        city: CityId,
        building: BuildingId,
    },

    // Research/Culture events
    TechResearched {
        player: PlayerId,
        tech: TechId,
    },
    PolicyAdopted {
        player: PlayerId,
        policy: PolicyId,
    },
    GovernmentReformed {
        player: PlayerId,
        new: GovernmentId,
    },

    // Improvement events
    ImprovementBuilt {
        player: PlayerId,
        improvement: ImprovementId,
        at: Hex,
        tier: u8,
    },
    ImprovementMatured {
        player: PlayerId,
        improvement: ImprovementId,
        at: Hex,
        new_tier: u8,
    },
    ImprovementPillaged {
        by: PlayerId,
        improvement: ImprovementId,
        at: Hex,
        new_tier: u8,
    },
    ImprovementRepaired {
        player: PlayerId,
        improvement: ImprovementId,
        at: Hex,
        tier: u8,
    },

    // Trade events
    TradeRouteEstablished {
        owner: PlayerId,
        from: CityId,
        to: CityId,
        is_external: bool,
    },
    TradeRoutePillaged {
        by: PlayerId,
        at: Hex,
    },

    // Diplomacy events
    WarDeclared {
        aggressor: PlayerId,
        target: PlayerId,
    },
    PeaceDeclared {
        a: PlayerId,
        b: PlayerId,
    },

    // Military events
    BattleEnded {
        attacker: PlayerId,
        defender: PlayerId,
        winner: PlayerId,
        at: Hex,
    },
    UnitPromoted {
        owner: PlayerId,
        unit: UnitId,
        unit_type: UnitTypeId,
        new_level: u8,
    },
}
