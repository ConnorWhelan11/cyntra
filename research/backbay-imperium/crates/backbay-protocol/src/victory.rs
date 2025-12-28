//! Victory conditions and progress tracking.
//!
//! This module defines the victory types and UI structures for tracking
//! progress toward each victory condition.

use serde::{Deserialize, Serialize};

use crate::{CityId, Hex, PlayerId, TechId};

/// The type of victory achieved.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum VictoryType {
    /// Control all original capital cities.
    Domination,
    /// Complete the space program project.
    Science,
    /// Achieve cultural dominance over all rivals.
    Culture,
    /// Highest score when time limit is reached.
    Score,
    /// All other players eliminated (variant of domination).
    Elimination,
}

/// Result of a completed game.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameResult {
    pub winner: Option<PlayerId>,
    pub victory_type: VictoryType,
    pub turn: u32,
    pub scores: Vec<PlayerScore>,
}

/// Final score breakdown for a player.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerScore {
    pub player: PlayerId,
    pub total: i32,
    pub breakdown: ScoreBreakdown,
}

/// Components of a player's score.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    /// Points from population (2 per pop).
    pub population: i32,
    /// Points from cities (10 per city).
    pub cities: i32,
    /// Points from techs researched (4 per tech).
    pub techs: i32,
    /// Points from wonders built (20 per wonder).
    pub wonders: i32,
    /// Points from land area controlled (1 per 3 tiles).
    pub territory: i32,
    /// Points from military strength.
    pub military: i32,
    /// Points from gold reserves (1 per 50 gold).
    pub gold: i32,
}

impl ScoreBreakdown {
    pub fn total(&self) -> i32 {
        self.population
            + self.cities
            + self.techs
            + self.wonders
            + self.territory
            + self.military
            + self.gold
    }
}

// =============================================================================
// Victory Progress Tracking
// =============================================================================

/// Overall victory progress for UI display.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VictoryProgress {
    pub domination: DominationProgress,
    pub science: ScienceProgress,
    pub culture: CultureProgress,
    pub score: ScoreProgress,
}

/// Progress toward domination victory.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DominationProgress {
    /// Total number of original capitals.
    pub total_capitals: u8,
    /// Capitals controlled by each player.
    pub capitals_held: Vec<(PlayerId, u8)>,
    /// Original capital locations.
    pub capital_locations: Vec<CapitalInfo>,
    /// Whether this victory is still achievable.
    pub achievable: bool,
}

/// Information about a capital city.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CapitalInfo {
    pub original_owner: PlayerId,
    pub city: Option<CityId>,
    pub position: Hex,
    pub current_owner: Option<PlayerId>,
    pub razed: bool,
}

/// Progress toward science victory.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScienceProgress {
    /// Space project stages and their status.
    pub stages: Vec<SpaceProjectStage>,
    /// Player progress on each stage (player_id -> stage completions).
    pub player_progress: Vec<(PlayerId, Vec<bool>)>,
    /// Whether any player has won via science.
    pub completed_by: Option<PlayerId>,
}

/// A stage of the space program project.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SpaceProjectStage {
    pub name: String,
    pub required_tech: Option<TechId>,
    pub production_cost: i32,
    /// If built, vulnerable to pillaging at this hex.
    pub vulnerability_hex: Option<Hex>,
}

/// Progress toward culture victory.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CultureProgress {
    /// Culture influence over each rival (player -> influence %).
    pub influence_over_rivals: Vec<(PlayerId, Vec<RivalInfluence>)>,
    /// Threshold required for victory (e.g., 60% over all).
    pub threshold_pct: u8,
    /// Players who have achieved cultural victory threshold.
    pub threshold_met_by: Vec<PlayerId>,
}

/// Influence over a specific rival.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RivalInfluence {
    pub rival: PlayerId,
    /// Your culture output vs their lifetime culture (percentage).
    pub influence_pct: u8,
    /// Whether you dominate this rival culturally.
    pub dominant: bool,
}

/// Progress toward score victory.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScoreProgress {
    /// Current turn.
    pub current_turn: u32,
    /// Turn limit for score victory.
    pub turn_limit: u32,
    /// Current scores for all players.
    pub scores: Vec<PlayerScore>,
    /// Leader (highest score).
    pub leader: Option<PlayerId>,
}

// =============================================================================
// Victory Configuration
// =============================================================================

/// Victory condition settings for a game.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VictorySettings {
    /// Enable domination victory.
    pub domination_enabled: bool,
    /// Enable science victory.
    pub science_enabled: bool,
    /// Enable culture victory.
    pub culture_enabled: bool,
    /// Enable score/time victory.
    pub score_enabled: bool,
    /// Turn limit for score victory (0 = no limit).
    pub turn_limit: u32,
    /// Culture influence threshold for victory (percentage).
    pub culture_threshold_pct: u8,
}

impl Default for VictorySettings {
    fn default() -> Self {
        Self {
            domination_enabled: true,
            science_enabled: true,
            culture_enabled: true,
            score_enabled: true,
            turn_limit: 500,
            culture_threshold_pct: 60,
        }
    }
}
