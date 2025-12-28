use serde::{Deserialize, Serialize};

use backbay_protocol::{Hex, PlayerId, UnitOrders, UnitTypeId};

use crate::{map::Tile, rules::CompiledRules};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Unit {
    pub type_id: UnitTypeId,
    pub owner: PlayerId,
    pub position: Hex,
    pub hp: i32,
    pub max_hp: i32,
    pub moves_left: i32,
    pub experience: i32,
    pub fortified_turns: u8,
    pub orders: Option<UnitOrders>,
    pub automated: bool,
}

impl Unit {
    pub fn new_for_tests(
        type_id: UnitTypeId,
        owner: PlayerId,
        position: Hex,
        rules: &CompiledRules,
    ) -> Self {
        let utype = rules.unit_type(type_id);
        Self {
            type_id,
            owner,
            position,
            hp: utype.hp,
            max_hp: utype.hp,
            moves_left: utype.moves,
            experience: 0,
            fortified_turns: 0,
            orders: None,
            automated: false,
        }
    }

    pub fn veteran_level(&self) -> u8 {
        match self.experience {
            0..=49 => 0,
            50..=99 => 1,
            100..=199 => 2,
            _ => 3,
        }
    }

    pub fn attack_strength(&self, rules: &CompiledRules) -> i32 {
        let base = rules.unit_type(self.type_id).attack;
        let vet_bonus = [100, 150, 175, 200][self.veteran_level() as usize];
        base * vet_bonus / 100
    }

    pub fn defense_strength(&self, rules: &CompiledRules, tile: &Tile) -> i32 {
        let base = rules.unit_type(self.type_id).defense;
        let terrain_bonus = rules.terrain(tile.terrain).defense_bonus;
        let fort_bonus = match self.fortified_turns {
            0 => 100,
            1 => 125,
            _ => 150,
        };
        let vet_bonus = [100, 150, 175, 200][self.veteran_level() as usize];

        base * (100 + terrain_bonus) / 100 * fort_bonus / 100 * vet_bonus / 100
    }
}
