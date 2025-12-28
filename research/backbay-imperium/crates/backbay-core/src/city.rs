use serde::{Deserialize, Serialize};

use backbay_protocol::{BuildingId, Hex, PlayerId, ProductionItem};

use crate::{game::Player, map::GameMap, rules::CompiledRules, yields::Yields};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct City {
    pub name: String,
    pub owner: PlayerId,
    pub position: Hex,
    pub population: u8,
    pub specialists: u8,
    pub food_stockpile: i32,
    pub production_stockpile: i32,
    pub buildings: Vec<BuildingId>,
    pub producing: Option<ProductionItem>,
    /// Map tile indices owned by this city (sorted, stable).
    pub claimed_tiles: Vec<u32>,
    pub border_progress: i32,
    pub locked_assignments: Vec<u8>,
}

impl Default for City {
    fn default() -> Self {
        Self {
            name: String::new(),
            owner: PlayerId(0),
            position: Hex { q: 0, r: 0 },
            population: 1,
            specialists: 0,
            food_stockpile: 0,
            production_stockpile: 0,
            buildings: Vec::new(),
            producing: None,
            claimed_tiles: Vec::new(),
            border_progress: 0,
            locked_assignments: Vec::new(),
        }
    }
}

impl City {
    pub fn new(name: String, position: Hex, owner: PlayerId) -> Self {
        Self {
            name,
            owner,
            position,
            population: 1,
            specialists: 0,
            food_stockpile: 0,
            production_stockpile: 0,
            buildings: Vec::new(),
            producing: None,
            claimed_tiles: Vec::new(),
            border_progress: 0,
            locked_assignments: Vec::new(),
        }
    }

    pub fn claims_tile_index(&self, tile_index: usize) -> bool {
        self.claimed_tiles
            .binary_search(&(tile_index as u32))
            .is_ok()
    }

    pub fn claim_tile_index(&mut self, tile_index: usize) {
        let tile_index = tile_index as u32;
        match self.claimed_tiles.binary_search(&tile_index) {
            Ok(_) => {}
            Err(pos) => self.claimed_tiles.insert(pos, tile_index),
        }
    }

    pub fn compute_worked_tiles(&self, map: &GameMap, rules: &CompiledRules) -> Vec<Hex> {
        let workers = self.population.saturating_sub(self.specialists) as usize;
        if workers == 0 {
            return vec![];
        }

        let Some(center_index) = map.index_of(self.position) else {
            return vec![];
        };

        // Exclude center tile: city center yields are handled separately.
        let workable: Vec<(usize, i32)> = map
            .indices_in_radius(self.position, 2)
            .into_iter()
            .filter(|&index| index != center_index && self.claims_tile_index(index))
            .map(|index| {
                let score = self.tile_priority_score_index(index, map, rules);
                (index, score)
            })
            .collect();

        let mut worked = Vec::with_capacity(workers);
        for &idx in &self.locked_assignments {
            if worked.len() >= workers {
                break;
            }
            if let Some(hex) = self.index_to_hex(idx) {
                if let Some(tile_index) = map.index_of(hex) {
                    if tile_index != center_index
                        && self.claims_tile_index(tile_index)
                        && !worked.contains(&tile_index)
                    {
                        worked.push(tile_index);
                    }
                }
            }
        }

        let mut available: Vec<_> = workable
            .iter()
            .filter(|(index, _)| !worked.contains(index))
            .collect();
        available.sort_by_key(|(index, score)| (std::cmp::Reverse(*score), *index));

        for (index, _) in available {
            if worked.len() >= workers {
                break;
            }
            worked.push(*index);
        }

        worked
            .into_iter()
            .filter_map(|index| map.hex_at_index(index))
            .collect()
    }

    pub fn yields(&self, map: &GameMap, rules: &CompiledRules, player: &Player) -> Yields {
        let mut total = Yields::default();

        total.food += 2;
        total.production += 1;
        total.science += self.population as i32;
        total.culture += 1;

        for hex in self.compute_worked_tiles(map, rules) {
            if let Some(tile) = map.get(hex) {
                let terrain = rules.terrain(tile.terrain);
                total.food += terrain.yields.food;
                total.production += terrain.yields.production;
                total.gold += terrain.yields.gold;

                if let Some(improvement) = tile.improvement.as_ref() {
                    if !improvement.pillaged {
                        let impr = rules.improvement(improvement.id);
                        let yields = &impr.tier(improvement.tier).yields;
                        total.food += yields.food;
                        total.production += yields.production;
                        total.gold += yields.gold;
                    }
                }
            }
        }

        for effect in rules.effect_index.city_yield_effects(self, player) {
            effect.effect.apply(&mut total, self);
        }

        for &policy_id in &player.policies {
            let Some(policy) = rules.policies.get(policy_id.raw as usize) else {
                continue;
            };

            let multiplier_bp = 10_000 + player.policy_tenure_bonus_bp(rules, policy_id);

            for effect in &policy.effects {
                if policy.requirements.iter().all(|r| r.is_met(self, player)) {
                    effect.apply_with_multiplier_bp(&mut total, self, multiplier_bp);
                }
            }
        }

        total
    }

    pub fn food_for_growth(&self) -> i32 {
        15 + (self.population as i32 - 1) * 6
    }

    pub fn turns_to_growth(&self, surplus: i32) -> Option<i32> {
        if surplus <= 0 {
            None
        } else {
            let needed = self.food_for_growth() - self.food_stockpile;
            Some((needed + surplus - 1) / surplus)
        }
    }

    fn tile_priority_score_index(
        &self,
        tile_index: usize,
        map: &GameMap,
        rules: &CompiledRules,
    ) -> i32 {
        let tile = &map.tiles()[tile_index];
        let t = rules.terrain(tile.terrain);
        let mut food = t.yields.food;
        let mut production = t.yields.production;
        let mut gold = t.yields.gold;

        if let Some(improvement) = tile.improvement.as_ref() {
            if !improvement.pillaged {
                let impr = rules.improvement(improvement.id);
                let yields = &impr.tier(improvement.tier).yields;
                food += yields.food;
                production += yields.production;
                gold += yields.gold;
            }
        }

        food * 3 + production * 2 + gold
    }

    fn index_to_hex(&self, idx: u8) -> Option<Hex> {
        match idx {
            0 => Some(self.position),
            1..=6 => Some(self.position.ring(1).nth((idx - 1) as usize)?),
            7..=18 => Some(self.position.ring(2).nth((idx - 7) as usize)?),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use backbay_protocol::PlayerId;

    use super::*;

    #[test]
    fn city_growth_calculations_match_spec_examples() {
        let mut city = City::new("Test".to_string(), Hex { q: 0, r: 0 }, PlayerId(0));
        city.population = 1;

        assert_eq!(city.food_for_growth(), 15);

        city.food_stockpile = 10;
        assert_eq!(city.turns_to_growth(5), Some(1));

        city.population = 5;
        assert_eq!(city.food_for_growth(), 39);
    }
}
