use std::ops::Add;

use backbay_protocol::YieldType;

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Yields {
    pub food: i32,
    pub production: i32,
    pub gold: i32,
    pub science: i32,
    pub culture: i32,
}

impl Add for Yields {
    type Output = Yields;

    fn add(self, other: Yields) -> Yields {
        Yields {
            food: self.food + other.food,
            production: self.production + other.production,
            gold: self.gold + other.gold,
            science: self.science + other.science,
            culture: self.culture + other.culture,
        }
    }
}

impl Yields {
    pub fn get(&self, yield_type: YieldType) -> &i32 {
        match yield_type {
            YieldType::Food => &self.food,
            YieldType::Production => &self.production,
            YieldType::Gold => &self.gold,
            YieldType::Science => &self.science,
            YieldType::Culture => &self.culture,
        }
    }

    pub fn get_mut(&mut self, yield_type: YieldType) -> &mut i32 {
        match yield_type {
            YieldType::Food => &mut self.food,
            YieldType::Production => &mut self.production,
            YieldType::Gold => &mut self.gold,
            YieldType::Science => &mut self.science,
            YieldType::Culture => &mut self.culture,
        }
    }
}
