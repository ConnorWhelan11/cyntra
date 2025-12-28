use serde::{Deserialize, Serialize};

use crate::{
    ChronicleEntry, CityId, CitySnapshot, DamageSource, DealItem, DemandConsequence, DemandId,
    GovernmentId, Hex, ImprovementId, MovementStopReason, PlayerId, PolicyId, ProductionItem,
    TechId, TerrainId, TileSnapshot, TradeRouteId, Treaty, TreatyId, TreatyType, UnitId,
    UnitSnapshot, UnitTypeId, VictoryReason,
};

/// All possible sim→client events. Fully serializable.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Event {
    // Game flow
    TurnStarted {
        turn: u32,
        player: PlayerId,
    },
    TurnEnded {
        turn: u32,
    },
    GameEnded {
        winner: Option<PlayerId>,
        reason: VictoryReason,
    },

    // Chronicle
    ChronicleEntryAdded {
        entry: ChronicleEntry,
    },

    // Diplomacy
    WarDeclared {
        aggressor: PlayerId,
        target: PlayerId,
    },
    PeaceDeclared {
        a: PlayerId,
        b: PlayerId,
    },
    RelationChanged {
        a: PlayerId,
        b: PlayerId,
        delta: i32,
        new: i32,
    },
    /// A deal was proposed.
    DealProposed {
        from: PlayerId,
        to: PlayerId,
        offer: Vec<DealItem>,
        demand: Vec<DealItem>,
        expires_turn: u32,
    },
    /// A deal was accepted, creating treaties.
    DealAccepted {
        from: PlayerId,
        to: PlayerId,
        treaties_created: Vec<Treaty>,
    },
    /// A deal was rejected.
    DealRejected {
        from: PlayerId,
        to: PlayerId,
    },
    /// A treaty was signed.
    TreatySigned {
        treaty: Treaty,
    },
    /// A treaty was cancelled by a player.
    TreatyCancelled {
        treaty: TreatyId,
        cancelled_by: PlayerId,
        treaty_type: TreatyType,
        other_party: PlayerId,
    },
    /// A treaty expired naturally.
    TreatyExpired {
        treaty: TreatyId,
        treaty_type: TreatyType,
        parties: (PlayerId, PlayerId),
    },
    /// A demand was issued.
    DemandIssued {
        demand: DemandId,
        from: PlayerId,
        to: PlayerId,
        items: Vec<DealItem>,
        consequence: DemandConsequence,
        expires_turn: u32,
    },
    /// A demand was accepted.
    DemandAccepted {
        demand: DemandId,
        from: PlayerId,
        to: PlayerId,
    },
    /// A demand was rejected.
    DemandRejected {
        demand: DemandId,
        from: PlayerId,
        to: PlayerId,
        consequence: DemandConsequence,
    },
    /// Defensive pact triggered - ally joins war.
    DefensivePactTriggered {
        defender: PlayerId,
        ally: PlayerId,
        aggressor: PlayerId,
    },

    // Unit events
    UnitCreated {
        unit: UnitId,
        type_id: UnitTypeId,
        pos: Hex,
        owner: PlayerId,
    },
    UnitMoved {
        unit: UnitId,
        path: Vec<Hex>,
        moves_left: i32,
    },
    UnitUpdated {
        unit: UnitSnapshot,
    },
    MovementStopped {
        unit: UnitId,
        at: Hex,
        reason: MovementStopReason,
    },
    UnitDied {
        unit: UnitId,
        killer: Option<UnitId>,
    },
    UnitDamaged {
        unit: UnitId,
        new_hp: i32,
        source: DamageSource,
    },
    UnitPromoted {
        unit: UnitId,
        new_level: u8,
    },
    OrdersCompleted {
        unit: UnitId,
    },
    OrdersInterrupted {
        unit: UnitId,
        at: Hex,
        reason: MovementStopReason,
    },

    // City events
    CityFounded {
        city: CityId,
        name: String,
        pos: Hex,
        owner: PlayerId,
    },
    CityGrew {
        city: CityId,
        new_pop: u8,
    },
    CityProduced {
        city: CityId,
        item: ProductionItem,
    },
    CityProductionSet {
        city: CityId,
        item: ProductionItem,
    },
    CityConquered {
        city: CityId,
        new_owner: PlayerId,
        old_owner: PlayerId,
    },
    BordersExpanded {
        city: CityId,
        new_tiles: Vec<Hex>,
    },

    // Improvements
    ImprovementBuilt {
        hex: Hex,
        improvement: ImprovementId,
        tier: u8,
    },
    ImprovementMatured {
        hex: Hex,
        improvement: ImprovementId,
        new_tier: u8,
    },
    ImprovementPillaged {
        hex: Hex,
        improvement: ImprovementId,
        new_tier: u8,
    },
    ImprovementRepaired {
        hex: Hex,
        improvement: ImprovementId,
        tier: u8,
    },

    // Trade
    TradeRouteEstablished {
        route: TradeRouteId,
        owner: PlayerId,
        from: CityId,
        to: CityId,
        path: Vec<Hex>,
        is_external: bool,
    },
    TradeRoutePillaged {
        route: TradeRouteId,
        at: Hex,
        by: PlayerId,
    },

    // Economy
    SupplyUpdated {
        player: PlayerId,
        used: i32,
        cap: i32,
        overage: i32,
        penalty_gold: i32,
    },

    // Combat
    CombatStarted {
        attacker: UnitId,
        defender: UnitId,
    },
    CombatRound {
        attacker_hp: i32,
        defender_hp: i32,
    },
    CombatEnded {
        winner: UnitId,
        loser: UnitId,
        at: Hex,
        attacker_owner: PlayerId,
        defender_owner: PlayerId,
    },

    // Research
    TechResearched {
        player: PlayerId,
        tech: TechId,
    },
    ResearchProgress {
        player: PlayerId,
        tech: TechId,
        progress: i32,
        required: i32,
    },

    // Civics
    PolicyAdopted {
        player: PlayerId,
        policy: PolicyId,
    },
    GovernmentReformed {
        player: PlayerId,
        old: Option<GovernmentId>,
        new: GovernmentId,
    },

    // Visibility
    TileRevealed {
        hex: Hex,
        terrain: TerrainId,
    },
    TileHidden {
        hex: Hex,
    },

    // Fog-of-war view sync (server-emitted, not produced by core)
    TileSpotted {
        hex: Hex,
        tile: TileSnapshot,
    },
    UnitSpotted {
        unit: UnitSnapshot,
    },
    UnitHidden {
        unit: UnitId,
    },
    CitySpotted {
        city: CitySnapshot,
    },
    CityHidden {
        city: CityId,
    },
}
