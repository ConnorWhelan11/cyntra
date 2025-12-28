//! Turn system implementation with dynamic mode.
//!
//! Supports four turn modes:
//! - Simultaneous: All players act freely
//! - Dynamic: Simultaneous until war, then sequential for belligerents
//! - Sequential: One player at a time, round-robin
//! - Strict: Only active player can act, others locked

use std::collections::HashSet;
use std::time::{Duration, Instant};

use backbay_protocol::PlayerId;
use serde::{Deserialize, Serialize};

use super::WarState;
use crate::config::TurnTimerConfig;

/// Turn mode determines how players take turns
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TurnMode {
    /// All players act freely at any time
    Simultaneous,
    /// Simultaneous in peace, sequential for belligerents (default)
    #[default]
    Dynamic,
    /// One player at a time, round-robin order
    Sequential,
    /// Only active player can act, others completely locked
    Strict,
}

/// Current turn status
#[derive(Clone, Debug)]
pub struct TurnStatus {
    /// Current turn number
    pub turn_number: u32,
    /// Current game era (0 = Ancient, 4 = Future)
    pub era: u8,
    /// Players who have ended their turn this round
    pub ended_turn: HashSet<PlayerId>,
    /// Active player(s) who can currently act
    pub active_players: HashSet<PlayerId>,
    /// Turn started timestamp
    pub turn_started: Instant,
    /// Time remaining for current active player (if sequential)
    pub time_remaining: Option<Duration>,
    /// Banked time per player
    pub time_banks: Vec<Duration>,
}

/// Turn manager handles turn flow and validation
#[derive(Debug)]
pub struct TurnManager {
    /// Current turn mode
    mode: TurnMode,
    /// Turn timer configuration
    timer_config: TurnTimerConfig,
    /// Current turn status
    status: TurnStatus,
    /// All players in the game
    all_players: Vec<PlayerId>,
    /// Current sequential turn index (for Sequential/Strict modes)
    sequential_index: usize,
}

impl TurnManager {
    pub fn new(mode: TurnMode, timer_config: TurnTimerConfig, players: Vec<PlayerId>) -> Self {
        let player_count = players.len();
        let mut active = HashSet::new();

        // In simultaneous modes, all players start active
        if mode == TurnMode::Simultaneous {
            active.extend(players.iter().copied());
        } else if !players.is_empty() {
            // Sequential modes start with first player
            active.insert(players[0]);
        }

        Self {
            mode,
            timer_config,
            status: TurnStatus {
                turn_number: 1,
                era: 0,
                ended_turn: HashSet::new(),
                active_players: active,
                turn_started: Instant::now(),
                time_remaining: None,
                time_banks: vec![Duration::ZERO; player_count],
            },
            all_players: players,
            sequential_index: 0,
        }
    }

    /// Get current turn mode
    pub fn mode(&self) -> TurnMode {
        self.mode
    }

    /// Get current turn status
    pub fn status(&self) -> &TurnStatus {
        &self.status
    }

    /// Check if a player can currently act
    pub fn can_act(&self, player: PlayerId, war_state: &WarState) -> bool {
        match self.mode {
            TurnMode::Simultaneous => true,
            TurnMode::Dynamic => {
                if war_state.is_at_war(player) {
                    // Belligerents must wait for their turn
                    self.status.active_players.contains(&player)
                } else {
                    // Non-belligerents can act freely
                    true
                }
            }
            TurnMode::Sequential | TurnMode::Strict => self.status.active_players.contains(&player),
        }
    }

    /// Player ends their turn
    /// Returns true if round should advance (all players done)
    pub fn end_turn(&mut self, player: PlayerId, war_state: &WarState) -> bool {
        self.status.ended_turn.insert(player);

        match self.mode {
            TurnMode::Simultaneous => {
                // Round advances when all players end turn
                self.check_round_complete()
            }
            TurnMode::Dynamic => self.advance_dynamic(player, war_state),
            TurnMode::Sequential | TurnMode::Strict => self.advance_sequential(),
        }
    }

    /// Advance turn for dynamic mode
    fn advance_dynamic(&mut self, player: PlayerId, war_state: &WarState) -> bool {
        let belligerents = war_state.belligerents();

        if belligerents.is_empty() {
            // No wars - pure simultaneous mode
            return self.check_round_complete();
        }

        // Remove player from active if they're a belligerent
        if belligerents.contains(&player) {
            self.status.active_players.remove(&player);

            // Find next belligerent who hasn't ended turn
            let next = self
                .all_players
                .iter()
                .filter(|p| belligerents.contains(p))
                .find(|p| !self.status.ended_turn.contains(p))
                .copied();

            if let Some(next_player) = next {
                self.status.active_players.insert(next_player);
                self.status.turn_started = Instant::now();
                false
            } else {
                // All belligerents done - check if round complete
                self.check_round_complete()
            }
        } else {
            // Non-belligerent ended turn - check round complete
            self.check_round_complete()
        }
    }

    /// Advance to next player in sequential mode
    fn advance_sequential(&mut self) -> bool {
        self.status.active_players.clear();
        self.sequential_index += 1;

        if self.sequential_index >= self.all_players.len() {
            // Round complete
            self.start_new_round();
            true
        } else {
            // Next player's turn
            let next_player = self.all_players[self.sequential_index];
            self.status.active_players.insert(next_player);
            self.status.turn_started = Instant::now();
            false
        }
    }

    /// Check if all players have ended their turn
    fn check_round_complete(&mut self) -> bool {
        let all_done = self
            .all_players
            .iter()
            .all(|p| self.status.ended_turn.contains(p));

        if all_done {
            self.start_new_round();
            true
        } else {
            false
        }
    }

    /// Start a new round
    fn start_new_round(&mut self) {
        self.status.turn_number += 1;
        self.status.ended_turn.clear();
        self.sequential_index = 0;
        self.status.turn_started = Instant::now();

        // Reset active players based on mode
        self.status.active_players.clear();
        match self.mode {
            TurnMode::Simultaneous | TurnMode::Dynamic => {
                self.status
                    .active_players
                    .extend(self.all_players.iter().copied());
            }
            TurnMode::Sequential | TurnMode::Strict => {
                if !self.all_players.is_empty() {
                    self.status.active_players.insert(self.all_players[0]);
                }
            }
        }
    }

    /// Calculate remaining time for current active player
    pub fn calculate_time_remaining(&self, unit_count: u32, city_count: u32) -> Duration {
        let turn_time =
            self.timer_config
                .calculate_turn_time(self.status.era, unit_count, city_count);
        let elapsed = self.status.turn_started.elapsed();
        turn_time.saturating_sub(elapsed)
    }

    /// Check if timer has expired for the active player
    pub fn timer_expired(&self, unit_count: u32, city_count: u32) -> bool {
        self.calculate_time_remaining(unit_count, city_count) == Duration::ZERO
    }

    /// Update war state and recalculate active players (for Dynamic mode)
    pub fn update_for_war_change(&mut self, war_state: &WarState) {
        if self.mode != TurnMode::Dynamic {
            return;
        }

        let belligerents = war_state.belligerents();

        if belligerents.is_empty() {
            // No wars - all players active
            self.status.active_players.clear();
            for player in &self.all_players {
                if !self.status.ended_turn.contains(player) {
                    self.status.active_players.insert(*player);
                }
            }
        } else {
            // Wars exist - only first non-ended belligerent is active
            // Non-belligerents who haven't ended are also active
            self.status.active_players.clear();

            // Add non-belligerents
            for player in &self.all_players {
                if !belligerents.contains(player) && !self.status.ended_turn.contains(player) {
                    self.status.active_players.insert(*player);
                }
            }

            // Add first non-ended belligerent
            if let Some(player) = self
                .all_players
                .iter()
                .filter(|p| belligerents.contains(p))
                .find(|p| !self.status.ended_turn.contains(p))
            {
                self.status.active_players.insert(*player);
            }
        }
    }

    /// Set the current era (affects turn timer)
    pub fn set_era(&mut self, era: u8) {
        self.status.era = era;
    }

    /// Switch turn mode mid-game
    pub fn set_mode(&mut self, mode: TurnMode, war_state: &WarState) {
        self.mode = mode;
        self.update_for_war_change(war_state);
    }

    /// Handle player disconnect - force end their turn if needed
    pub fn handle_disconnect(&mut self, player: PlayerId, war_state: &WarState) {
        if self.status.active_players.contains(&player) {
            // Player was active - force end their turn
            self.end_turn(player, war_state);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_players(count: u8) -> Vec<PlayerId> {
        (0..count).map(PlayerId).collect()
    }

    #[test]
    fn simultaneous_mode() {
        let players = make_players(3);
        let config = TurnTimerConfig::default();
        let mut turn_mgr = TurnManager::new(TurnMode::Simultaneous, config, players.clone());
        let war_state = WarState::new();

        // All players can act
        assert!(turn_mgr.can_act(PlayerId(0), &war_state));
        assert!(turn_mgr.can_act(PlayerId(1), &war_state));
        assert!(turn_mgr.can_act(PlayerId(2), &war_state));

        // End turns one by one
        assert!(!turn_mgr.end_turn(PlayerId(0), &war_state)); // Not complete
        assert!(!turn_mgr.end_turn(PlayerId(1), &war_state)); // Not complete
        assert!(turn_mgr.end_turn(PlayerId(2), &war_state)); // Round complete

        // New round started
        assert_eq!(turn_mgr.status().turn_number, 2);
    }

    #[test]
    fn dynamic_mode_peace() {
        let players = make_players(3);
        let config = TurnTimerConfig::default();
        let turn_mgr = TurnManager::new(TurnMode::Dynamic, config, players);
        let war_state = WarState::new();

        // In peace, behaves like simultaneous
        assert!(turn_mgr.can_act(PlayerId(0), &war_state));
        assert!(turn_mgr.can_act(PlayerId(1), &war_state));
        assert!(turn_mgr.can_act(PlayerId(2), &war_state));
    }

    #[test]
    fn dynamic_mode_war() {
        let players = make_players(4);
        let config = TurnTimerConfig::default();
        let mut turn_mgr = TurnManager::new(TurnMode::Dynamic, config, players);
        let mut war_state = WarState::new();

        // P0 and P1 are at war
        war_state.declare_war(PlayerId(0), PlayerId(1), 1);
        turn_mgr.update_for_war_change(&war_state);

        // Non-belligerents (P2, P3) can act freely
        assert!(turn_mgr.can_act(PlayerId(2), &war_state));
        assert!(turn_mgr.can_act(PlayerId(3), &war_state));

        // Only first belligerent (P0) is active
        assert!(turn_mgr.can_act(PlayerId(0), &war_state));
        assert!(!turn_mgr.can_act(PlayerId(1), &war_state));

        // P0 ends turn, P1 becomes active
        turn_mgr.end_turn(PlayerId(0), &war_state);
        assert!(!turn_mgr.can_act(PlayerId(0), &war_state));
        assert!(turn_mgr.can_act(PlayerId(1), &war_state));
    }

    #[test]
    fn sequential_mode() {
        let players = make_players(3);
        let config = TurnTimerConfig::default();
        let mut turn_mgr = TurnManager::new(TurnMode::Sequential, config, players);
        let war_state = WarState::new();

        // Only first player active
        assert!(turn_mgr.can_act(PlayerId(0), &war_state));
        assert!(!turn_mgr.can_act(PlayerId(1), &war_state));
        assert!(!turn_mgr.can_act(PlayerId(2), &war_state));

        // P0 ends turn
        turn_mgr.end_turn(PlayerId(0), &war_state);
        assert!(!turn_mgr.can_act(PlayerId(0), &war_state));
        assert!(turn_mgr.can_act(PlayerId(1), &war_state));

        // P1 ends turn
        turn_mgr.end_turn(PlayerId(1), &war_state);
        assert!(turn_mgr.can_act(PlayerId(2), &war_state));

        // P2 ends turn - new round
        assert!(turn_mgr.end_turn(PlayerId(2), &war_state));
        assert_eq!(turn_mgr.status().turn_number, 2);
        assert!(turn_mgr.can_act(PlayerId(0), &war_state));
    }
}
