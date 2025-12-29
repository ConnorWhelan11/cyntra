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
    /// Modifier from AI preferences (conditional likes/dislikes).
    pub preferences: i32,
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
            + self.preferences
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

// =============================================================================
// AI Memory System
// =============================================================================

/// Unique identifier for a memory.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MemoryId(pub u32);

/// A memorable event that affects AI decision-making.
///
/// Memories persist across turns and influence how AI players evaluate
/// relationships, deals, and war decisions. They decay over time based
/// on the AI's personality (forgiving AIs forget faster).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiMemory {
    pub id: MemoryId,
    /// Turn when this memory was created.
    pub turn: u32,
    /// Type of memorable event.
    pub memory_type: MemoryType,
    /// The player who remembers this.
    pub rememberer: PlayerId,
    /// The player this memory is about.
    pub about: PlayerId,
    /// Impact on decisions (-100 to +100, negative = grudge, positive = gratitude).
    pub severity: i32,
    /// How much severity decays per 10 turns (0 = permanent).
    pub decay_rate: i32,
}

impl AiMemory {
    /// Calculate the current effective severity after decay.
    pub fn effective_severity(&self, current_turn: u32) -> i32 {
        if self.decay_rate == 0 {
            return self.severity;
        }
        let turns_elapsed = current_turn.saturating_sub(self.turn);
        let decay_periods = turns_elapsed / 10;
        let total_decay = self.decay_rate * decay_periods as i32;

        if self.severity > 0 {
            (self.severity - total_decay).max(0)
        } else {
            (self.severity + total_decay).min(0)
        }
    }

    /// Check if this memory has fully decayed.
    pub fn is_expired(&self, current_turn: u32) -> bool {
        self.effective_severity(current_turn) == 0
    }
}

/// Types of memorable events that affect AI behavior.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MemoryType {
    // === Negative memories (grudges) ===
    /// They broke a Non-Aggression Pact with us.
    BrokeNap,
    /// They broke a Defensive Pact when we were attacked.
    BetrayedAlliance,
    /// They declared war without provocation.
    SurpriseWar,
    /// They rejected a fair deal we proposed.
    RejectedFairDeal,
    /// They pillaged our trade route.
    PillagedTradeRoute,
    /// They conquered one of our cities.
    ConqueredCity { city_name: String },
    /// They demanded tribute from us.
    DemandedTribute { amount: i32 },
    /// They refused to help when we were attacked (broken defensive pact).
    RefusedToDefend,
    /// They declared war on our ally.
    AttackedOurAlly { ally: PlayerId },

    // === Positive memories (gratitude) ===
    /// They honored a defensive pact and joined our war.
    HonoredAlliance,
    /// They gave us a gift of gold.
    GiftedGold { amount: i32 },
    /// They joined our war against a common enemy.
    JoinedWarAgainstEnemy { enemy: PlayerId },
    /// They accepted peace when they were winning.
    AcceptedPeaceWhenWinning,
    /// They shared technology with us.
    SharedTechnology { tech_name: String },
    /// They defended us from an aggressor.
    DefendedFromAggressor { aggressor: PlayerId },
    /// They liberated one of our cities.
    LiberatedCity { city_name: String },
    /// They voted for us in a council/diplomatic matter.
    SupportedInCouncil,
}

impl MemoryType {
    /// Get the default severity for this memory type.
    pub fn default_severity(&self) -> i32 {
        match self {
            // Severe betrayals
            MemoryType::BrokeNap => -60,
            MemoryType::BetrayedAlliance => -80,
            MemoryType::SurpriseWar => -50,
            MemoryType::RefusedToDefend => -70,
            MemoryType::AttackedOurAlly { .. } => -40,

            // Moderate grievances
            MemoryType::ConqueredCity { .. } => -50,
            MemoryType::PillagedTradeRoute => -20,
            MemoryType::DemandedTribute { .. } => -25,
            MemoryType::RejectedFairDeal => -10,

            // Strong gratitude
            MemoryType::HonoredAlliance => 50,
            MemoryType::DefendedFromAggressor { .. } => 60,
            MemoryType::LiberatedCity { .. } => 70,
            MemoryType::AcceptedPeaceWhenWinning => 40,

            // Moderate gratitude
            MemoryType::JoinedWarAgainstEnemy { .. } => 30,
            MemoryType::SharedTechnology { .. } => 25,
            MemoryType::GiftedGold { amount } => (*amount / 10).clamp(5, 30),
            MemoryType::SupportedInCouncil => 15,
        }
    }

    /// Get the default decay rate for this memory type (per 10 turns).
    pub fn default_decay_rate(&self) -> i32 {
        match self {
            // Betrayals decay very slowly
            MemoryType::BrokeNap => 5,
            MemoryType::BetrayedAlliance => 3,
            MemoryType::SurpriseWar => 5,
            MemoryType::RefusedToDefend => 4,

            // Territory losses are remembered long
            MemoryType::ConqueredCity { .. } => 2,
            MemoryType::LiberatedCity { .. } => 3,

            // Economic memories decay faster
            MemoryType::PillagedTradeRoute => 8,
            MemoryType::DemandedTribute { .. } => 6,
            MemoryType::GiftedGold { .. } => 10,
            MemoryType::RejectedFairDeal => 10,

            // Alliance-related memories decay moderately
            MemoryType::HonoredAlliance => 5,
            MemoryType::DefendedFromAggressor { .. } => 4,
            MemoryType::JoinedWarAgainstEnemy { .. } => 6,
            MemoryType::AttackedOurAlly { .. } => 5,

            // Other memories
            MemoryType::AcceptedPeaceWhenWinning => 7,
            MemoryType::SharedTechnology { .. } => 8,
            MemoryType::SupportedInCouncil => 10,
        }
    }

    /// Get a human-readable description of this memory.
    pub fn description(&self) -> String {
        match self {
            MemoryType::BrokeNap => "broke our Non-Aggression Pact".to_string(),
            MemoryType::BetrayedAlliance => "betrayed our alliance".to_string(),
            MemoryType::SurpriseWar => "declared a surprise war on us".to_string(),
            MemoryType::RefusedToDefend => "refused to honor their defensive pact".to_string(),
            MemoryType::AttackedOurAlly { ally } => {
                format!("attacked our ally (Player {})", ally.0)
            }
            MemoryType::ConqueredCity { city_name } => {
                format!("conquered our city of {}", city_name)
            }
            MemoryType::PillagedTradeRoute => "pillaged our trade route".to_string(),
            MemoryType::DemandedTribute { amount } => {
                format!("demanded {} gold in tribute", amount)
            }
            MemoryType::RejectedFairDeal => "rejected our fair deal".to_string(),
            MemoryType::HonoredAlliance => "honored their alliance with us".to_string(),
            MemoryType::GiftedGold { amount } => format!("gifted us {} gold", amount),
            MemoryType::JoinedWarAgainstEnemy { enemy } => {
                format!("joined our war against Player {}", enemy.0)
            }
            MemoryType::AcceptedPeaceWhenWinning => "accepted peace when they were winning".to_string(),
            MemoryType::SharedTechnology { tech_name } => {
                format!("shared {} technology with us", tech_name)
            }
            MemoryType::DefendedFromAggressor { aggressor } => {
                format!("defended us from Player {}", aggressor.0)
            }
            MemoryType::LiberatedCity { city_name } => {
                format!("liberated our city of {}", city_name)
            }
            MemoryType::SupportedInCouncil => "supported us in council".to_string(),
        }
    }
}

/// Query result for AI memories about a specific player.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryQuery {
    pub memories: Vec<AiMemory>,
    /// Sum of all effective severities (positive = friendly, negative = hostile).
    pub total_sentiment: i32,
    /// Most impactful memory (by absolute severity).
    pub primary_memory: Option<AiMemory>,
}

// =============================================================================
// AI Decision Explanation System (Phase 4)
// =============================================================================

/// Types of AI decisions that can be explained.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AiDecision {
    /// AI decided to declare war on a target.
    DeclareWar { target: PlayerId },
    /// AI decided not to declare war on a target.
    RefuseWar { target: PlayerId },
    /// AI decided to accept a deal proposal.
    AcceptDeal { from: PlayerId },
    /// AI decided to reject a deal proposal.
    RejectDeal { from: PlayerId },
    /// AI decided to seek peace with an enemy.
    SeekPeace { with: PlayerId },
    /// AI decided to continue war with an enemy.
    ContinueWar { with: PlayerId },
    /// AI decided to accept a demand.
    AcceptDemand { from: PlayerId },
    /// AI decided to reject a demand.
    RejectDemand { from: PlayerId },
    /// AI decided to propose a treaty.
    ProposeTreaty { to: PlayerId, treaty_type: String },
}

impl AiDecision {
    /// Get a human-readable summary of the decision.
    pub fn summary(&self) -> String {
        match self {
            AiDecision::DeclareWar { target } => {
                format!("declared war on Player {}", target.0)
            }
            AiDecision::RefuseWar { target } => {
                format!("chose not to declare war on Player {}", target.0)
            }
            AiDecision::AcceptDeal { from } => {
                format!("accepted deal from Player {}", from.0)
            }
            AiDecision::RejectDeal { from } => {
                format!("rejected deal from Player {}", from.0)
            }
            AiDecision::SeekPeace { with } => {
                format!("sought peace with Player {}", with.0)
            }
            AiDecision::ContinueWar { with } => {
                format!("chose to continue war with Player {}", with.0)
            }
            AiDecision::AcceptDemand { from } => {
                format!("accepted demand from Player {}", from.0)
            }
            AiDecision::RejectDemand { from } => {
                format!("rejected demand from Player {}", from.0)
            }
            AiDecision::ProposeTreaty { to, treaty_type } => {
                format!("proposed {} to Player {}", treaty_type, to.0)
            }
        }
    }
}

/// The source of a decision factor.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "source_type")]
pub enum FactorSource {
    /// Factor comes from personality trait.
    Personality {
        trait_name: String,
        trait_value: u8,
    },
    /// Factor comes from relationship breakdown.
    Relationship {
        component: String,
        value: i32,
    },
    /// Factor comes from a specific memory/grudge.
    Memory {
        memory_type: String,
        severity: i32,
        turn_created: u32,
    },
    /// Factor comes from game state.
    GameState {
        condition: String,
    },
    /// Factor comes from military analysis.
    Military {
        our_strength: i32,
        their_strength: i32,
        advantage: f32,
    },
    /// Factor comes from treaty obligations.
    Treaty {
        treaty_type: String,
        with_player: PlayerId,
    },
    /// Factor comes from AI preference/agenda.
    Preference {
        preference_name: String,
        modifier: i32,
    },
}

/// A single factor that influenced an AI decision.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DecisionFactor {
    /// Human-readable description of the factor.
    pub description: String,
    /// Weight/score contribution of this factor (positive = toward decision, negative = against).
    pub weight: i32,
    /// Source of this factor.
    pub source: FactorSource,
}

impl DecisionFactor {
    /// Create a new decision factor.
    pub fn new(description: impl Into<String>, weight: i32, source: FactorSource) -> Self {
        Self {
            description: description.into(),
            weight,
            source,
        }
    }

    /// Create a personality-based factor.
    pub fn from_personality(
        description: impl Into<String>,
        weight: i32,
        trait_name: impl Into<String>,
        trait_value: u8,
    ) -> Self {
        Self::new(
            description,
            weight,
            FactorSource::Personality {
                trait_name: trait_name.into(),
                trait_value,
            },
        )
    }

    /// Create a memory-based factor.
    pub fn from_memory(
        description: impl Into<String>,
        weight: i32,
        memory: &AiMemory,
    ) -> Self {
        Self::new(
            description,
            weight,
            FactorSource::Memory {
                memory_type: format!("{:?}", memory.memory_type),
                severity: memory.severity,
                turn_created: memory.turn,
            },
        )
    }

    /// Create a game state factor.
    pub fn from_game_state(description: impl Into<String>, weight: i32, condition: impl Into<String>) -> Self {
        Self::new(
            description,
            weight,
            FactorSource::GameState {
                condition: condition.into(),
            },
        )
    }

    /// Create a military factor.
    pub fn from_military(
        description: impl Into<String>,
        weight: i32,
        our_strength: i32,
        their_strength: i32,
        advantage: f32,
    ) -> Self {
        Self::new(
            description,
            weight,
            FactorSource::Military {
                our_strength,
                their_strength,
                advantage,
            },
        )
    }
}

/// Full explanation of an AI decision.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiDecisionExplanation {
    /// The player who made the decision.
    pub player: PlayerId,
    /// The decision that was made.
    pub decision: AiDecision,
    /// All factors that influenced the decision.
    pub factors: Vec<DecisionFactor>,
    /// Total score (sum of all factor weights).
    pub total_score: i32,
    /// The threshold that needed to be met for this decision.
    pub threshold: i32,
    /// Whether the decision was made (score >= threshold).
    pub decision_made: bool,
    /// A personality-based narrative explanation.
    pub personality_note: String,
    /// Memories that were referenced in the decision.
    pub memories_referenced: Vec<AiMemory>,
}

impl AiDecisionExplanation {
    /// Create a new explanation builder.
    pub fn new(player: PlayerId, decision: AiDecision) -> Self {
        Self {
            player,
            decision,
            factors: Vec::new(),
            total_score: 0,
            threshold: 0,
            decision_made: false,
            personality_note: String::new(),
            memories_referenced: Vec::new(),
        }
    }

    /// Add a factor to the explanation.
    pub fn add_factor(&mut self, factor: DecisionFactor) {
        self.total_score += factor.weight;
        self.factors.push(factor);
    }

    /// Set the threshold for the decision.
    pub fn with_threshold(mut self, threshold: i32) -> Self {
        self.threshold = threshold;
        self.decision_made = self.total_score >= threshold;
        self
    }

    /// Set the personality note.
    pub fn with_personality_note(mut self, note: impl Into<String>) -> Self {
        self.personality_note = note.into();
        self
    }

    /// Add a referenced memory.
    pub fn add_memory(&mut self, memory: AiMemory) {
        self.memories_referenced.push(memory);
    }

    /// Format the explanation as a human-readable string.
    pub fn format(&self) -> String {
        let mut output = String::new();

        // Header
        output.push_str(&format!(
            "{}\n\n",
            self.decision.summary().to_uppercase()
        ));

        // Factors
        output.push_str("Factors:\n");
        for factor in &self.factors {
            let sign = if factor.weight >= 0 { "+" } else { "" };
            let source_tag = match &factor.source {
                FactorSource::Personality { trait_name, .. } => {
                    format!("[Personality: {}]", trait_name)
                }
                FactorSource::Relationship { component, .. } => {
                    format!("[Relationship: {}]", component)
                }
                FactorSource::Memory { memory_type, .. } => {
                    format!("[Memory: {}]", memory_type)
                }
                FactorSource::GameState { condition } => {
                    format!("[GameState: {}]", condition)
                }
                FactorSource::Military { advantage, .. } => {
                    format!("[Military: {:.1}x]", advantage)
                }
                FactorSource::Treaty { treaty_type, .. } => {
                    format!("[Treaty: {}]", treaty_type)
                }
                FactorSource::Preference { preference_name, .. } => {
                    format!("[Preference: {}]", preference_name)
                }
            };
            output.push_str(&format!(
                "  {}{:>3}  {:<40} {}\n",
                sign, factor.weight, factor.description, source_tag
            ));
        }

        // Total
        output.push_str(&format!(
            "  ────\n  {:>+4}  {} (threshold: {})\n",
            self.total_score,
            if self.decision_made { "DECISION MADE" } else { "DECISION NOT MADE" },
            self.threshold
        ));

        // Personality note
        if !self.personality_note.is_empty() {
            output.push_str(&format!("\nPersonality Note: \"{}\"\n", self.personality_note));
        }

        output
    }
}

/// Preview of how an AI would react to a player action.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiReactionPreview {
    /// The AI player.
    pub ai_player: PlayerId,
    /// What the AI would likely do in response.
    pub likely_reaction: String,
    /// Probability/likelihood (0-100).
    pub likelihood: u8,
    /// Key factors affecting the reaction.
    pub key_factors: Vec<String>,
    /// Current relation with the actor.
    pub current_relation: i32,
    /// Predicted relation change.
    pub relation_change: i32,
}

// =============================================================================
// AI Preference System (Phase 2: Conditional Preferences)
// =============================================================================

/// A specific behavioral preference that triggers opinion modifiers.
/// Each AI has 1-3 preferences that affect how they evaluate other players.
/// Inspired by Civ6's agenda system.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AiPreference {
    // === Territory preferences ===
    /// Dislikes players who settle cities near our borders.
    DislikesNearbySettlers,
    /// Values players who maintain distance from our territory.
    ValuesBufferZones,

    // === Military preferences ===
    /// Respects players with strong military forces.
    RespectsStrength,
    /// Looks down on militarily weak players.
    DispisesWeakness,
    /// Fears players who are at war with others (sees them as aggressive).
    FearsAggression,

    // === Economic preferences ===
    /// Values players with active trade routes to us.
    ValuesTrade,
    /// Dislikes players who benefit more from trade imbalances.
    DislikesMercantilism,

    // === Diplomatic preferences ===
    /// Values players who honor their treaties.
    ValuesLoyalty,
    /// Dislikes ANY player who has broken treaties (even with others).
    DislikesTreatyBreakers,
    /// Respects players with large alliance networks.
    RespectsAlliances,

    // === Victory-related preferences ===
    /// Fears players who are close to winning.
    FearsRunaways,
    /// Dislikes players who hoard wonders.
    DislikesWonderHoarders,

    // === Behavioral preferences ===
    /// Respects players with similar personalities.
    LikesSimilarPersonality,
    /// Dislikes players with vastly different personalities.
    DislikesOppositePersonality,
}

impl AiPreference {
    /// Get a human-readable name for this preference.
    pub fn name(&self) -> &'static str {
        match self {
            AiPreference::DislikesNearbySettlers => "Territorial",
            AiPreference::ValuesBufferZones => "Isolationist",
            AiPreference::RespectsStrength => "Might Makes Right",
            AiPreference::DispisesWeakness => "Predatory",
            AiPreference::FearsAggression => "Cautious",
            AiPreference::ValuesTrade => "Mercantile",
            AiPreference::DislikesMercantilism => "Fair Trader",
            AiPreference::ValuesLoyalty => "Honorbound",
            AiPreference::DislikesTreatyBreakers => "Principled",
            AiPreference::RespectsAlliances => "Diplomatic",
            AiPreference::FearsRunaways => "Competitive",
            AiPreference::DislikesWonderHoarders => "Envious",
            AiPreference::LikesSimilarPersonality => "Kindred Spirit",
            AiPreference::DislikesOppositePersonality => "Judgmental",
        }
    }

    /// Get a description of what this preference means.
    pub fn description(&self) -> &'static str {
        match self {
            AiPreference::DislikesNearbySettlers => {
                "Dislikes players who settle cities near their borders"
            }
            AiPreference::ValuesBufferZones => {
                "Appreciates players who maintain distance from their territory"
            }
            AiPreference::RespectsStrength => {
                "Respects players with powerful military forces"
            }
            AiPreference::DispisesWeakness => {
                "Looks down on militarily weak players"
            }
            AiPreference::FearsAggression => {
                "Distrusts players who are frequently at war"
            }
            AiPreference::ValuesTrade => {
                "Values players who maintain trade routes"
            }
            AiPreference::DislikesMercantilism => {
                "Dislikes one-sided trade relationships"
            }
            AiPreference::ValuesLoyalty => {
                "Values players who honor their agreements"
            }
            AiPreference::DislikesTreatyBreakers => {
                "Distrusts anyone who has broken a treaty, even with others"
            }
            AiPreference::RespectsAlliances => {
                "Respects players with many allies"
            }
            AiPreference::FearsRunaways => {
                "Fears players who are close to winning"
            }
            AiPreference::DislikesWonderHoarders => {
                "Envies players with many wonders"
            }
            AiPreference::LikesSimilarPersonality => {
                "Gets along with similar-minded leaders"
            }
            AiPreference::DislikesOppositePersonality => {
                "Clashes with leaders of opposing temperament"
            }
        }
    }

    /// Whether this preference is positive (grants bonuses) or negative (applies penalties).
    pub fn is_positive(&self) -> bool {
        matches!(
            self,
            AiPreference::ValuesBufferZones
                | AiPreference::RespectsStrength
                | AiPreference::ValuesTrade
                | AiPreference::ValuesLoyalty
                | AiPreference::RespectsAlliances
                | AiPreference::LikesSimilarPersonality
        )
    }
}

/// A discovered preference with its current evaluation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreferenceEvaluation {
    /// The preference being evaluated.
    pub preference: AiPreference,
    /// Whether the player has discovered this preference.
    pub discovered: bool,
    /// Current opinion modifier from this preference (-30 to +30).
    pub modifier: i32,
    /// Explanation of why this modifier applies.
    pub reason: String,
}

/// Query result for AI preferences about a specific player.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreferenceQuery {
    /// The AI whose preferences we're querying.
    pub ai_player: PlayerId,
    /// The player being evaluated.
    pub target_player: PlayerId,
    /// All preference evaluations (discovered ones have full info).
    pub evaluations: Vec<PreferenceEvaluation>,
    /// Total modifier from all preferences.
    pub total_modifier: i32,
    /// Number of discovered preferences.
    pub discovered_count: u8,
    /// Total number of preferences this AI has.
    pub total_preferences: u8,
}
