//! Server configuration

use std::net::SocketAddr;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Server configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Address to bind the server
    pub bind_address: SocketAddr,
    /// Minimum players to start (2-8)
    pub min_players: Option<u8>,
    /// Maximum players allowed (2-8)
    pub max_players: u8,
    /// Maximum observers allowed
    pub max_observers: u8,
    /// Grace period before AI takeover on disconnect
    pub disconnect_grace: Duration,
    /// Turn timer settings
    pub turn_timer: TurnTimerConfig,
    /// Game code for joining (6 alphanumeric)
    pub game_code: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0:7777".parse().unwrap(),
            min_players: Some(2),
            max_players: 8,
            max_observers: 4,
            disconnect_grace: Duration::from_secs(60),
            turn_timer: TurnTimerConfig::default(),
            game_code: None,
        }
    }
}

/// Turn timer configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TurnTimerConfig {
    /// Base time per turn in seconds
    pub base_time_secs: u32,
    /// Era multiplier (time *= 1.0 + era * multiplier)
    pub era_multiplier: f32,
    /// Bonus seconds per active unit (capped)
    pub unit_bonus_secs: u32,
    /// Maximum unit bonus
    pub unit_bonus_cap_secs: u32,
    /// Bonus seconds per city (capped)
    pub city_bonus_secs: u32,
    /// Maximum city bonus
    pub city_bonus_cap_secs: u32,
    /// Maximum total turn time
    pub max_time_secs: u32,
    /// Enable time banking
    pub banking_enabled: bool,
    /// Maximum banked time
    pub bank_max_secs: u32,
}

impl Default for TurnTimerConfig {
    fn default() -> Self {
        Self {
            base_time_secs: 60,
            era_multiplier: 0.2,
            unit_bonus_secs: 2,
            unit_bonus_cap_secs: 60,
            city_bonus_secs: 5,
            city_bonus_cap_secs: 30,
            max_time_secs: 300,
            banking_enabled: true,
            bank_max_secs: 180,
        }
    }
}

impl TurnTimerConfig {
    /// Calculate turn time for a player given their game state
    pub fn calculate_turn_time(&self, era: u8, unit_count: u32, city_count: u32) -> Duration {
        let era_mult = 1.0 + (era as f32) * self.era_multiplier;
        let base = (self.base_time_secs as f32 * era_mult) as u32;

        let unit_bonus = (unit_count * self.unit_bonus_secs).min(self.unit_bonus_cap_secs);
        let city_bonus = (city_count * self.city_bonus_secs).min(self.city_bonus_cap_secs);

        let total = (base + unit_bonus + city_bonus).min(self.max_time_secs);
        Duration::from_secs(total as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn turn_timer_calculation() {
        let config = TurnTimerConfig::default();

        // Early game: era 0, 2 units, 1 city
        let time = config.calculate_turn_time(0, 2, 1);
        assert_eq!(time.as_secs(), 60 + 4 + 5); // 69 seconds

        // Late game: era 4, 30 units, 10 cities
        let time = config.calculate_turn_time(4, 30, 10);
        // base = 60 * 1.8 = 108
        // unit bonus = min(60, 60) = 60
        // city bonus = min(50, 30) = 30
        // total = min(198, 300) = 198
        assert_eq!(time.as_secs(), 198);
    }
}
