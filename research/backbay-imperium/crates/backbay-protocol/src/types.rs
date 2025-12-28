use serde::{Deserialize, Serialize};

use crate::{BuildingId, CityId, Hex, ImprovementId, PlayerId, TechId, UnitId, UnitTypeId};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum YieldType {
    Food,
    Production,
    Gold,
    Science,
    Culture,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum UnitOrders {
    Goto {
        path: Vec<crate::Hex>,
    },
    Patrol {
        waypoints: Vec<crate::Hex>,
        current: usize,
    },
    Fortify,
    Sleep,
    BuildImprovement {
        improvement: ImprovementId,
        /// Target hex; omitted by clients and filled by the sim.
        #[serde(default)]
        at: Option<crate::Hex>,
        /// Turns remaining; omitted by clients and filled by the sim.
        #[serde(default)]
        turns_remaining: Option<u8>,
    },
    RepairImprovement {
        /// Target hex; omitted by clients and filled by the sim.
        #[serde(default)]
        at: Option<crate::Hex>,
        /// Turns remaining; omitted by clients and filled by the sim.
        #[serde(default)]
        turns_remaining: Option<u8>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ProductionItem {
    Unit(UnitTypeId),
    Building(BuildingId),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MovementStopReason {
    EnteredEnemyZoc,
    Blocked { attempted: Hex },
    MovesExhausted,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PathPreview {
    pub full_path: Vec<Hex>,
    pub this_turn_path: Vec<Hex>,
    pub stop_at: Hex,
    #[serde(default)]
    pub stop_reason: Option<MovementStopReason>,
}

/// "Promise strip" items: upcoming completions that drive the "one more turn" loop.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TurnPromise {
    /// Player needs to choose a new technology to research.
    TechPickRequired {
        player: PlayerId,
    },
    /// A city needs production assigned.
    CityProductionPickRequired {
        city: CityId,
    },
    CityGrowth {
        city: CityId,
        turns: i32,
    },
    CityProduction {
        city: CityId,
        item: ProductionItem,
        turns: i32,
    },
    BorderExpansion {
        city: CityId,
        turns: i32,
    },
    ResearchComplete {
        player: PlayerId,
        tech: TechId,
        turns: i32,
    },
    CultureMilestone {
        player: PlayerId,
        turns: i32,
    },
    PolicyPickAvailable {
        player: PlayerId,
        picks: u8,
    },
    WorkerTask {
        unit: UnitId,
        at: Hex,
        kind: WorkerTaskKind,
        turns: u8,
    },
    IdleWorker {
        unit: UnitId,
        at: Hex,
        #[serde(default)]
        recommendation: Option<WorkerTaskKind>,
        #[serde(default)]
        recommendation_turns: Option<u8>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WorkerTaskKind {
    Build { improvement: ImprovementId },
    Repair,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum VictoryReason {
    Conquest,
    Science,
    Culture,
    Time,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DamageSource {
    Combat { attacker: UnitId },
    Unknown,
}

/// Result of a combat calculation - for UI preview.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CombatPreview {
    /// Probability attacker wins (0-100). Display only.
    pub attacker_win_pct: u8,
    pub attacker_hp_expected: i32,
    pub attacker_hp_best: i32,
    pub attacker_hp_worst: i32,
    pub defender_hp_expected: i32,
    pub defender_hp_best: i32,
    pub defender_hp_worst: i32,
    pub attacker_modifiers: Vec<CombatModifier>,
    pub defender_modifiers: Vec<CombatModifier>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CombatModifier {
    pub source: String,
    pub value_pct: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResearchStatus {
    pub tech: TechId,
    pub progress: i32,
    pub required: i32,
}

/// Generic “Why?” panel: inputs → rules → result.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhyPanel {
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub lines: Vec<WhyLine>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhyLine {
    pub label: String,
    pub value: String,
}
