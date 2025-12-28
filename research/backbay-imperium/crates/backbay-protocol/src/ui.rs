use serde::{Deserialize, Serialize};

use crate::{CityId, Hex, ImprovementId, PlayerId, ProductionItem, ResourceId, TechId, TerrainId};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct UiYields {
    pub food: i32,
    pub production: i32,
    pub gold: i32,
    pub science: i32,
    pub culture: i32,
}

// ============================================================================
// TILE UI TYPES
// ============================================================================

/// Detailed tile information for UI display.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileUi {
    pub hex: Hex,
    pub terrain_id: TerrainId,
    pub terrain_name: String,
    pub owner: Option<PlayerId>,
    pub city: Option<CityId>,
    pub resource: Option<ResourceId>,
    pub improvement: Option<ImprovementUi>,

    /// Base yields from terrain (before improvement).
    pub base_yields: UiYields,
    /// Total yields (terrain + improvement at current tier).
    pub total_yields: UiYields,
    /// Yield breakdown for "Why?" panel.
    pub yield_breakdown: Vec<YieldBreakdownLine>,
}

/// Detailed improvement information including maturation progress.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImprovementUi {
    pub id: ImprovementId,
    pub name: String,

    /// Current tier (1-based).
    pub tier: u8,
    /// Maximum possible tier for this improvement.
    pub max_tier: u8,
    /// Display name for current tier (e.g., "Irrigated Farm", "Industrial Mine").
    pub tier_name: String,

    /// Whether the improvement is currently pillaged.
    pub pillaged: bool,

    /// Maturation progress (only if not at max tier and not pillaged).
    pub maturation: Option<MaturationProgress>,

    /// Yields at current tier (0 if pillaged).
    pub yields: UiYields,
    /// Yields at next tier (for preview).
    pub next_tier_yields: Option<UiYields>,
}

/// Progress toward the next improvement tier.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MaturationProgress {
    /// Turns this tile has been worked at current tier.
    pub worked_turns: i32,
    /// Turns needed to advance to next tier.
    pub turns_needed: i32,
    /// Progress percentage (0-100).
    pub progress_pct: u8,
    /// Estimated turns remaining (if tile continues to be worked).
    pub turns_remaining: i32,
}

/// A single line in a yield breakdown showing the source.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct YieldBreakdownLine {
    pub source: String,
    pub food: i32,
    pub production: i32,
    pub gold: i32,
}

/// UI-focused city summary. Derived from authoritative state; safe for clients.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CityUi {
    pub id: CityId,
    pub name: String,
    pub owner: PlayerId,
    pub pos: Hex,
    pub population: u8,
    pub yields: UiYields,
    pub worked_tiles: Vec<Hex>,

    pub food_stockpile: i32,
    pub food_needed: i32,
    pub food_consumption: i32,
    pub food_surplus: i32,
    pub turns_to_growth: Option<i32>,

    pub production_stockpile: i32,
    pub production_per_turn: i32,
    pub producing: Option<ProductionItem>,
    pub turns_to_complete: Option<i32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UiProductionOption {
    pub item: ProductionItem,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UiTechOption {
    pub id: TechId,
    pub name: String,
    pub cost: i32,
    pub era: u8,
    pub prerequisites: Vec<TechId>,
}
