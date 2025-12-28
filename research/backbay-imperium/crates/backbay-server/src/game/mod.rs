//! Game state and simulation management.

pub mod state;
mod turn;
mod war;

pub use state::{ApplyResult, GameState};
pub use turn::{TurnManager, TurnMode, TurnStatus};
pub use war::WarState;
