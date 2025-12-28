use serde::{Deserialize, Serialize};

use crate::{
    CityId, DealItem, DemandConsequence, DemandId, GovernmentId, Hex, PlayerId, PolicyId,
    ProductionItem, TechId, TradeRouteId, TreatyId, UnitId, UnitOrders,
};

/// All possible client→sim commands. Fully serializable.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Command {
    // Unit commands
    MoveUnit { unit: UnitId, path: Vec<Hex> },
    AttackUnit { attacker: UnitId, target: UnitId },
    Fortify { unit: UnitId },
    SetOrders { unit: UnitId, orders: UnitOrders },
    CancelOrders { unit: UnitId },
    SetWorkerAutomation { unit: UnitId, enabled: bool },

    // Tile actions
    PillageImprovement { unit: UnitId },

    // Trade
    EstablishTradeRoute { from: CityId, to: CityId },
    CancelTradeRoute { route: TradeRouteId },

    // City commands
    FoundCity { settler: UnitId, name: String },
    SetProduction { city: CityId, item: ProductionItem },
    BuyProduction { city: CityId },
    AssignCitizen { city: CityId, tile_index: u8 },
    UnassignCitizen { city: CityId, tile_index: u8 },

    // Player commands
    SetResearch { tech: TechId },
    AdoptPolicy { policy: PolicyId },
    ReformGovernment { government: GovernmentId },
    EndTurn,

    // Diplomacy
    DeclarePeace { target: PlayerId },
    DeclareWar { target: PlayerId },

    /// Propose a deal to another player.
    ProposeDeal {
        to: PlayerId,
        offer: Vec<DealItem>,
        demand: Vec<DealItem>,
    },
    /// Accept or reject a deal proposal.
    RespondToProposal {
        from: PlayerId,
        accept: bool,
    },
    /// Cancel an active treaty.
    CancelTreaty { treaty: TreatyId },
    /// Issue a demand to another player.
    IssueDemand {
        to: PlayerId,
        items: Vec<DealItem>,
        consequence: DemandConsequence,
    },
    /// Accept or reject a demand.
    RespondToDemand {
        demand: DemandId,
        accept: bool,
    },
}
