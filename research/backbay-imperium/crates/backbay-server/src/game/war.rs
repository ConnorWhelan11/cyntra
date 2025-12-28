//! War state tracking between players.

use std::collections::{HashMap, HashSet};

use backbay_protocol::PlayerId;

/// Tracks war state between all players
#[derive(Clone, Debug, Default)]
pub struct WarState {
    /// Set of (aggressor, defender) pairs - direction matters for diplomacy
    wars: HashSet<(PlayerId, PlayerId)>,
    /// Turn when war was declared (for war weariness calculation)
    war_start_turns: HashMap<(PlayerId, PlayerId), u32>,
}

impl WarState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if two players are at war (either direction)
    pub fn are_at_war(&self, player_a: PlayerId, player_b: PlayerId) -> bool {
        self.wars.contains(&(player_a, player_b)) || self.wars.contains(&(player_b, player_a))
    }

    /// Check if a player is at war with anyone
    pub fn is_at_war(&self, player: PlayerId) -> bool {
        self.wars.iter().any(|(a, b)| *a == player || *b == player)
    }

    /// Get all players at war with the given player
    pub fn enemies_of(&self, player: PlayerId) -> Vec<PlayerId> {
        self.wars
            .iter()
            .filter_map(|(a, b)| {
                if *a == player {
                    Some(*b)
                } else if *b == player {
                    Some(*a)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Declare war (returns true if this is a new war)
    pub fn declare_war(&mut self, aggressor: PlayerId, defender: PlayerId, turn: u32) -> bool {
        if self.are_at_war(aggressor, defender) {
            return false;
        }
        self.wars.insert((aggressor, defender));
        self.war_start_turns.insert((aggressor, defender), turn);
        true
    }

    /// Declare peace (returns true if war existed)
    pub fn declare_peace(&mut self, player_a: PlayerId, player_b: PlayerId) -> bool {
        let removed_ab = self.wars.remove(&(player_a, player_b));
        let removed_ba = self.wars.remove(&(player_b, player_a));
        self.war_start_turns.remove(&(player_a, player_b));
        self.war_start_turns.remove(&(player_b, player_a));
        removed_ab || removed_ba
    }

    /// Get the turn when war was declared (for weariness calculation)
    pub fn war_start_turn(&self, player_a: PlayerId, player_b: PlayerId) -> Option<u32> {
        self.war_start_turns
            .get(&(player_a, player_b))
            .or_else(|| self.war_start_turns.get(&(player_b, player_a)))
            .copied()
    }

    /// Get all active wars
    pub fn all_wars(&self) -> Vec<(PlayerId, PlayerId)> {
        self.wars.iter().copied().collect()
    }

    /// Get players involved in any war (for dynamic turn mode)
    pub fn belligerents(&self) -> HashSet<PlayerId> {
        self.wars.iter().flat_map(|(a, b)| [*a, *b]).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn war_declaration_and_peace() {
        let mut war_state = WarState::new();
        let p1 = PlayerId(0);
        let p2 = PlayerId(1);
        let p3 = PlayerId(2);

        // No wars initially
        assert!(!war_state.is_at_war(p1));
        assert!(!war_state.are_at_war(p1, p2));

        // Declare war
        assert!(war_state.declare_war(p1, p2, 10));
        assert!(war_state.are_at_war(p1, p2));
        assert!(war_state.are_at_war(p2, p1)); // Symmetric
        assert!(war_state.is_at_war(p1));
        assert!(war_state.is_at_war(p2));
        assert!(!war_state.is_at_war(p3));

        // Can't declare war twice
        assert!(!war_state.declare_war(p1, p2, 11));
        assert!(!war_state.declare_war(p2, p1, 11));

        // Enemies
        assert_eq!(war_state.enemies_of(p1), vec![p2]);
        assert_eq!(war_state.enemies_of(p2), vec![p1]);

        // Peace
        assert!(war_state.declare_peace(p1, p2));
        assert!(!war_state.are_at_war(p1, p2));
        assert!(!war_state.is_at_war(p1));
    }

    #[test]
    fn belligerents() {
        let mut war_state = WarState::new();
        let p1 = PlayerId(0);
        let p2 = PlayerId(1);
        let p3 = PlayerId(2);
        let p4 = PlayerId(3);

        war_state.declare_war(p1, p2, 1);
        war_state.declare_war(p3, p4, 1);

        let belligerents = war_state.belligerents();
        assert!(belligerents.contains(&p1));
        assert!(belligerents.contains(&p2));
        assert!(belligerents.contains(&p3));
        assert!(belligerents.contains(&p4));
    }
}
