//! Diplomacy protocol types for treaties, deals, and relations.
//!
//! This module defines the structures for diplomatic agreements,
//! negotiation proposals, and relationship tracking.

use serde::{Deserialize, Serialize};

use crate::{CityId, PlayerId, TechId};

// =============================================================================
// Treaty Types
// =============================================================================

/// Unique identifier for a treaty/agreement.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TreatyId(pub u32);

/// Types of diplomatic agreements.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TreatyType {
    /// Units can move through each other's territory.
    OpenBorders,
    /// Join war if either party is attacked.
    DefensivePact,
    /// Share research progress for a duration.
    ResearchAgreement {
        /// Bonus science per turn for each party.
        bonus_science: i32,
    },
    /// Enhanced trade yields between cities.
    TradeAgreement {
        /// Bonus gold per turn for each party.
        bonus_gold: i32,
    },
    /// Full military alliance with shared visibility.
    Alliance,
    /// Non-aggression pact (cannot declare war for duration).
    NonAggression,
    /// One party pays tribute to another.
    Tribute {
        /// Gold per turn from payer to receiver.
        gold_per_turn: i32,
        /// Who pays the tribute.
        payer: PlayerId,
    },
}

/// An active treaty between two players.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Treaty {
    pub id: TreatyId,
    pub treaty_type: TreatyType,
    pub parties: (PlayerId, PlayerId),
    /// Turn when the treaty was signed.
    pub signed_turn: u32,
    /// Turn when the treaty expires (None = permanent until cancelled).
    pub expires_turn: Option<u32>,
    /// Whether the treaty is still active.
    pub active: bool,
}

impl Treaty {
    pub fn involves(&self, player: PlayerId) -> bool {
        self.parties.0 == player || self.parties.1 == player
    }

    pub fn other_party(&self, player: PlayerId) -> Option<PlayerId> {
        if self.parties.0 == player {
            Some(self.parties.1)
        } else if self.parties.1 == player {
            Some(self.parties.0)
        } else {
            None
        }
    }
}

// =============================================================================
// Deal Proposals
// =============================================================================

/// A deal proposal from one player to another.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DealProposal {
    pub from: PlayerId,
    pub to: PlayerId,
    /// What the proposer offers.
    pub offer: Vec<DealItem>,
    /// What the proposer wants in return.
    pub demand: Vec<DealItem>,
    /// Turn when proposal expires if not responded to.
    pub expires_turn: u32,
}

/// Items that can be traded or exchanged in a deal.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DealItem {
    /// One-time gold payment.
    Gold { amount: i32 },
    /// Gold per turn for a duration.
    GoldPerTurn { amount: i32, turns: u32 },
    /// A specific technology.
    Technology { tech: TechId },
    /// A city (for peace treaties or trades).
    City { city: CityId },
    /// Strategic resource access.
    Resource { resource: String, amount: u8 },
    /// Open borders treaty.
    OpenBorders { turns: u32 },
    /// Defensive pact treaty.
    DefensivePact { turns: u32 },
    /// Research agreement.
    ResearchAgreement { turns: u32 },
    /// Trade agreement.
    TradeAgreement { turns: u32 },
    /// Alliance.
    Alliance,
    /// Declaration of war on a third party.
    DeclareWarOn { target: PlayerId },
    /// Peace with proposer.
    Peace,
    /// Non-aggression pact.
    NonAggression { turns: u32 },
}

// =============================================================================
// Demands and Ultimatums
// =============================================================================

/// Unique identifier for a demand.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DemandId(pub u32);

/// A demand or ultimatum from one player to another.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Demand {
    pub id: DemandId,
    pub from: PlayerId,
    pub to: PlayerId,
    /// What is being demanded.
    pub items: Vec<DealItem>,
    /// Turn when the demand expires.
    pub expires_turn: u32,
    /// Consequence if rejected (usually war).
    pub consequence: DemandConsequence,
}

/// What happens if a demand is rejected.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DemandConsequence {
    /// Declare war if rejected.
    War,
    /// Relation penalty if rejected.
    RelationPenalty { amount: i32 },
    /// No specific consequence (just a request).
    None,
}

// =============================================================================
// Relation Breakdown
// =============================================================================

/// Detailed breakdown of relationship factors between two players.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RelationBreakdown {
    /// Base relation (starts at 0, neutral).
    pub base: i32,
    /// Modifier from active trade routes.
    pub trade: i32,
    /// Modifier from border proximity (negative if contested).
    pub borders: i32,
    /// Modifier from ideology/government alignment.
    pub ideology: i32,
    /// Modifier from past betrayals (broken treaties, surprise wars).
    pub betrayal: i32,
    /// Modifier from military power balance (fear/respect).
    pub military: i32,
    /// Modifier from active treaties.
    pub treaties: i32,
    /// Modifier from war history.
    pub war_history: i32,
    /// Modifier from shared enemies.
    pub shared_enemies: i32,
    /// Modifier from tribute payments.
    pub tribute: i32,
}

impl RelationBreakdown {
    pub fn total(&self) -> i32 {
        self.base
            + self.trade
            + self.borders
            + self.ideology
            + self.betrayal
            + self.military
            + self.treaties
            + self.war_history
            + self.shared_enemies
            + self.tribute
    }

    /// Apply decay to temporary modifiers (called each turn).
    pub fn apply_decay(&mut self) {
        // Betrayal decays slowly (10% per turn, minimum -1).
        if self.betrayal < 0 {
            let decay = (self.betrayal.abs() / 10).max(1);
            self.betrayal = (self.betrayal + decay).min(0);
        }
        // War history decays slowly.
        if self.war_history < 0 {
            let decay = (self.war_history.abs() / 20).max(1);
            self.war_history = (self.war_history + decay).min(0);
        }
    }
}

/// A modifier with source description for UI display.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RelationModifier {
    pub source: String,
    pub value: i32,
    /// Turns until this modifier expires (None = permanent).
    pub expires_in: Option<u32>,
}

// =============================================================================
// Diplomacy State for Snapshots
// =============================================================================

/// Full diplomacy state for a player (for snapshots/UI).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiplomacySnapshot {
    /// Active treaties this player is part of.
    pub treaties: Vec<Treaty>,
    /// Pending deal proposals sent to this player.
    pub pending_proposals: Vec<DealProposal>,
    /// Pending demands on this player.
    pub pending_demands: Vec<Demand>,
    /// Relation breakdown with each other player.
    pub relations: Vec<(PlayerId, RelationBreakdown)>,
    /// Players currently at war with.
    pub at_war_with: Vec<PlayerId>,
}

// =============================================================================
// Diplomacy UI Query Results
// =============================================================================

/// Summary of diplomatic status with another player.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiplomaticStatus {
    pub player: PlayerId,
    pub relation_total: i32,
    pub relation_breakdown: RelationBreakdown,
    pub at_war: bool,
    pub active_treaties: Vec<TreatyType>,
    /// Whether we have open borders with them.
    pub has_open_borders: bool,
    /// Whether we have a defensive pact.
    pub has_defensive_pact: bool,
    /// Whether they are an ally.
    pub is_ally: bool,
}

/// Likelihood of a deal being accepted.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DealEvaluation {
    /// -100 to +100 where positive means they favor the deal.
    pub favorability: i32,
    /// Descriptive likelihood.
    pub likelihood: DealLikelihood,
    /// Factors affecting the evaluation.
    pub factors: Vec<RelationModifier>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DealLikelihood {
    Certain,
    VeryLikely,
    Likely,
    Possible,
    Unlikely,
    VeryUnlikely,
    Impossible,
}
