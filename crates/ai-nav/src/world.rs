use ai_core::{WorldMut, WorldView};

use crate::{Navigator, Vec2};

pub trait NavWorldView: WorldView {
    fn position(&self, agent: Self::Agent) -> Option<Vec2>;
    fn navigator(&self) -> &dyn Navigator;
}

pub trait NavWorldMut: WorldMut + NavWorldView {
    fn set_position(&mut self, agent: Self::Agent, position: Vec2);
}

