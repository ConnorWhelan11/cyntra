//! Tile information and yield breakdown helpers.
//!
//! This module provides functions to convert internal tile state into UI-friendly
//! representations with detailed yield breakdowns and maturation progress.

use backbay_protocol::{
    Hex, ImprovementUi, MaturationProgress, TileUi, UiYields, YieldBreakdownLine,
};

use crate::map::{GameMap, ImprovementOnTile, Tile};
use crate::rules::CompiledRules;
use crate::yields::Yields;

/// Convert internal Yields to protocol UiYields.
pub fn yields_to_ui(y: &Yields) -> UiYields {
    UiYields {
        food: y.food,
        production: y.production,
        gold: y.gold,
        science: y.science,
        culture: y.culture,
    }
}

/// Build a TileUi from game state.
pub fn build_tile_ui(hex: Hex, map: &GameMap, rules: &CompiledRules) -> Option<TileUi> {
    let tile = map.get(hex)?;

    let terrain = rules.terrain(tile.terrain);
    let base_yields = yields_to_ui(&terrain.yields);

    let improvement_ui = tile
        .improvement
        .as_ref()
        .map(|imp| build_improvement_ui(imp, rules));

    let (total_yields, yield_breakdown) = compute_yield_breakdown(tile, rules);

    Some(TileUi {
        hex,
        terrain_id: tile.terrain,
        terrain_name: terrain.name.clone(),
        owner: tile.owner,
        city: tile.city,
        resource: tile.resource,
        improvement: improvement_ui,
        base_yields,
        total_yields: yields_to_ui(&total_yields),
        yield_breakdown,
    })
}

/// Build ImprovementUi from improvement on tile.
pub fn build_improvement_ui(imp: &ImprovementOnTile, rules: &CompiledRules) -> ImprovementUi {
    let impr_type = rules.improvement(imp.id);
    let current_tier = impr_type.tier(imp.tier);
    let max_tier = impr_type.max_tier();

    // Tier name with descriptive prefix based on tier level
    let tier_name = match imp.tier {
        1 => impr_type.name.clone(),
        2 => format!("Improved {}", impr_type.name),
        3 => format!("Advanced {}", impr_type.name),
        t => format!("Tier {} {}", t, impr_type.name),
    };

    // Calculate maturation progress (only if not at max tier and not pillaged)
    let maturation = if !imp.pillaged && imp.tier < max_tier {
        current_tier.worked_turns_to_next.map(|turns_needed| {
            let worked = imp.worked_turns;
            let progress_pct = if turns_needed > 0 {
                ((worked * 100) / turns_needed).min(100).max(0) as u8
            } else {
                100
            };
            let turns_remaining = (turns_needed - worked).max(0);

            MaturationProgress {
                worked_turns: worked,
                turns_needed,
                progress_pct,
                turns_remaining,
            }
        })
    } else {
        None
    };

    // Current yields (0 if pillaged)
    let yields = if imp.pillaged {
        UiYields::default()
    } else {
        yields_to_ui(&current_tier.yields)
    };

    // Next tier yields preview (if not at max)
    let next_tier_yields = if imp.tier < max_tier {
        let next = impr_type.tier(imp.tier + 1);
        Some(yields_to_ui(&next.yields))
    } else {
        None
    };

    ImprovementUi {
        id: imp.id,
        name: impr_type.name.clone(),
        tier: imp.tier,
        max_tier,
        tier_name,
        pillaged: imp.pillaged,
        maturation,
        yields,
        next_tier_yields,
    }
}

/// Compute total yields and breakdown for a tile.
pub fn compute_yield_breakdown(tile: &Tile, rules: &CompiledRules) -> (Yields, Vec<YieldBreakdownLine>) {
    let mut breakdown = Vec::new();
    let mut total = Yields::default();

    // Terrain base yields
    let terrain = rules.terrain(tile.terrain);
    total = total + terrain.yields.clone();
    breakdown.push(YieldBreakdownLine {
        source: terrain.name.clone(),
        food: terrain.yields.food,
        production: terrain.yields.production,
        gold: terrain.yields.gold,
    });

    // Improvement yields (if not pillaged)
    if let Some(imp) = &tile.improvement {
        let impr_type = rules.improvement(imp.id);
        if !imp.pillaged {
            let tier_yields = &impr_type.tier(imp.tier).yields;
            total = total + tier_yields.clone();

            let tier_desc = if imp.tier == 1 {
                impr_type.name.clone()
            } else {
                format!("{} (Tier {})", impr_type.name, imp.tier)
            };

            breakdown.push(YieldBreakdownLine {
                source: tier_desc,
                food: tier_yields.food,
                production: tier_yields.production,
                gold: tier_yields.gold,
            });
        } else {
            // Show pillaged improvement with zero yields
            breakdown.push(YieldBreakdownLine {
                source: format!("{} (Pillaged)", impr_type.name),
                food: 0,
                production: 0,
                gold: 0,
            });
        }
    }

    // TODO: Add resource bonus yields when resources are implemented
    // TODO: Add building/effect modifiers when applied at tile level

    (total, breakdown)
}

/// Estimate turns to next improvement tier.
pub fn turns_to_next_tier(imp: &ImprovementOnTile, rules: &CompiledRules) -> Option<i32> {
    if imp.pillaged {
        return None;
    }

    let impr_type = rules.improvement(imp.id);
    if imp.tier >= impr_type.max_tier() {
        return None;
    }

    let current_tier = impr_type.tier(imp.tier);
    current_tier
        .worked_turns_to_next
        .map(|needed| (needed - imp.worked_turns).max(0))
}

/// Check if an improvement can advance to next tier.
pub fn can_advance_tier(imp: &ImprovementOnTile, rules: &CompiledRules) -> bool {
    if imp.pillaged {
        return false;
    }

    let impr_type = rules.improvement(imp.id);
    if imp.tier >= impr_type.max_tier() {
        return false;
    }

    let current_tier = impr_type.tier(imp.tier);
    match current_tier.worked_turns_to_next {
        Some(needed) => imp.worked_turns >= needed,
        None => false, // No maturation defined
    }
}

/// Advance improvement tier if ready, returning true if advanced.
pub fn try_advance_tier(imp: &mut ImprovementOnTile, rules: &CompiledRules) -> bool {
    if !can_advance_tier(imp, rules) {
        return false;
    }

    let impr_type = rules.improvement(imp.id);
    let current_tier = impr_type.tier(imp.tier);

    // Subtract the turns needed and advance tier
    if let Some(needed) = current_tier.worked_turns_to_next {
        imp.worked_turns -= needed;
        imp.worked_turns = imp.worked_turns.max(0);
    }
    imp.tier += 1;

    true
}

/// Get tier name with descriptive prefix.
pub fn tier_display_name(improvement_name: &str, tier: u8) -> String {
    match tier {
        1 => improvement_name.to_string(),
        2 => format!("Improved {}", improvement_name),
        3 => format!("Advanced {}", improvement_name),
        t => format!("Tier {} {}", t, improvement_name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::{RulesError, RulesSource};

    fn load_test_rules() -> Result<CompiledRules, RulesError> {
        crate::rules::load_rules(RulesSource::Embedded)
    }

    #[test]
    fn test_maturation_progress_calculation() {
        let rules = load_test_rules().expect("rules should load");

        // Get farm improvement ID
        let farm_id = rules
            .improvement_id("farm")
            .expect("farm improvement should exist");

        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 4,
            pillaged: false,
        };

        let ui = build_improvement_ui(&imp, &rules);

        assert_eq!(ui.tier, 1);
        assert_eq!(ui.max_tier, 3);
        assert!(!ui.pillaged);

        let mat = ui.maturation.expect("should have maturation progress");
        assert_eq!(mat.worked_turns, 4);
        assert_eq!(mat.turns_needed, 8); // From YAML
        assert_eq!(mat.progress_pct, 50);
        assert_eq!(mat.turns_remaining, 4);

        // Next tier yields should be tier 2
        let next = ui.next_tier_yields.expect("should have next tier yields");
        assert_eq!(next.food, 2);
    }

    #[test]
    fn test_pillaged_improvement_zero_yields() {
        let rules = load_test_rules().expect("rules should load");

        let farm_id = rules
            .improvement_id("farm")
            .expect("farm improvement should exist");

        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 2,
            worked_turns: 0,
            pillaged: true,
        };

        let ui = build_improvement_ui(&imp, &rules);

        assert!(ui.pillaged);
        assert_eq!(ui.yields.food, 0);
        assert_eq!(ui.yields.production, 0);
        assert_eq!(ui.yields.gold, 0);
        assert!(ui.maturation.is_none());
    }

    #[test]
    fn test_max_tier_no_next_yields() {
        let rules = load_test_rules().expect("rules should load");

        let farm_id = rules
            .improvement_id("farm")
            .expect("farm improvement should exist");

        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 3, // Max tier
            worked_turns: 0,
            pillaged: false,
        };

        let ui = build_improvement_ui(&imp, &rules);

        assert_eq!(ui.tier, 3);
        assert_eq!(ui.max_tier, 3);
        assert!(ui.maturation.is_none());
        assert!(ui.next_tier_yields.is_none());
        assert_eq!(ui.yields.food, 3); // Tier 3 farm yields
    }

    #[test]
    fn test_can_advance_tier() {
        let rules = load_test_rules().expect("rules should load");

        let farm_id = rules.improvement_id("farm").unwrap();

        // Not enough worked turns
        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 7,
            pillaged: false,
        };
        assert!(!can_advance_tier(&imp, &rules));

        // Enough worked turns
        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 8,
            pillaged: false,
        };
        assert!(can_advance_tier(&imp, &rules));

        // Pillaged - cannot advance
        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 10,
            pillaged: true,
        };
        assert!(!can_advance_tier(&imp, &rules));

        // At max tier
        let imp = ImprovementOnTile {
            id: farm_id,
            tier: 3,
            worked_turns: 100,
            pillaged: false,
        };
        assert!(!can_advance_tier(&imp, &rules));
    }

    #[test]
    fn test_try_advance_tier() {
        let rules = load_test_rules().expect("rules should load");

        let farm_id = rules.improvement_id("farm").unwrap();

        let mut imp = ImprovementOnTile {
            id: farm_id,
            tier: 1,
            worked_turns: 10, // 2 extra turns
            pillaged: false,
        };

        assert!(try_advance_tier(&mut imp, &rules));
        assert_eq!(imp.tier, 2);
        assert_eq!(imp.worked_turns, 2); // Carries over excess
    }

    #[test]
    fn test_tier_display_names() {
        assert_eq!(tier_display_name("Farm", 1), "Farm");
        assert_eq!(tier_display_name("Farm", 2), "Improved Farm");
        assert_eq!(tier_display_name("Farm", 3), "Advanced Farm");
        assert_eq!(tier_display_name("Farm", 4), "Tier 4 Farm");
    }

    #[test]
    fn test_yield_breakdown_terrain_only() {
        let rules = load_test_rules().expect("rules should load");

        let plains_id = rules.terrain_id("plains").unwrap();

        let tile = Tile {
            terrain: plains_id,
            improvement: None,
            resource: None,
            owner: None,
            city: None,
            river_edges: 0,
        };

        let (total, breakdown) = compute_yield_breakdown(&tile, &rules);

        assert_eq!(total.food, 1);
        assert_eq!(total.production, 1);
        assert_eq!(total.gold, 0);

        assert_eq!(breakdown.len(), 1);
        assert_eq!(breakdown[0].source, "Plains");
        assert_eq!(breakdown[0].food, 1);
        assert_eq!(breakdown[0].production, 1);
    }

    #[test]
    fn test_yield_breakdown_with_improvement() {
        let rules = load_test_rules().expect("rules should load");

        let plains_id = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        let tile = Tile {
            terrain: plains_id,
            improvement: Some(ImprovementOnTile {
                id: farm_id,
                tier: 2,
                worked_turns: 0,
                pillaged: false,
            }),
            resource: None,
            owner: None,
            city: None,
            river_edges: 0,
        };

        let (total, breakdown) = compute_yield_breakdown(&tile, &rules);

        // Plains (1/1/0) + Farm Tier 2 (2/0/0) = 3/1/0
        assert_eq!(total.food, 3);
        assert_eq!(total.production, 1);
        assert_eq!(total.gold, 0);

        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].source, "Plains");
        assert_eq!(breakdown[1].source, "Farm (Tier 2)");
        assert_eq!(breakdown[1].food, 2);
    }

    #[test]
    fn test_yield_breakdown_pillaged() {
        let rules = load_test_rules().expect("rules should load");

        let plains_id = rules.terrain_id("plains").unwrap();
        let farm_id = rules.improvement_id("farm").unwrap();

        let tile = Tile {
            terrain: plains_id,
            improvement: Some(ImprovementOnTile {
                id: farm_id,
                tier: 2,
                worked_turns: 0,
                pillaged: true,
            }),
            resource: None,
            owner: None,
            city: None,
            river_edges: 0,
        };

        let (total, breakdown) = compute_yield_breakdown(&tile, &rules);

        // Only terrain yields - improvement is pillaged
        assert_eq!(total.food, 1);
        assert_eq!(total.production, 1);

        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[1].source, "Farm (Pillaged)");
        assert_eq!(breakdown[1].food, 0);
    }
}
