//! Renet channel configuration for multiplayer.
//!
//! Channel 0: ReliableOrdered - Turn commands, state sync
//! Channel 1: ReliableUnordered - Chat, notifications
//! Channel 2: Unreliable - Ping/heartbeat

use std::time::Duration;

use renet::ChannelConfig;

/// Channel IDs for different message types
pub mod channel_id {
    /// Turn commands and game state - must arrive in order
    pub const COMMANDS: u8 = 0;
    /// Chat and notifications - reliable but order less critical
    pub const CHAT: u8 = 1;
    /// Ping/keepalive - can be lost
    pub const HEARTBEAT: u8 = 2;
}

/// Maximum bytes per channel
const MAX_CHANNEL_MEMORY: usize = 5 * 1024 * 1024; // 5 MB

/// Create channel configurations for game server
pub fn create_channel_configs() -> Vec<ChannelConfig> {
    vec![
        // Channel 0: Commands (ReliableOrdered)
        // Turn submissions, state deltas, important game events
        ChannelConfig {
            channel_id: channel_id::COMMANDS,
            max_memory_usage_bytes: MAX_CHANNEL_MEMORY,
            send_type: renet::SendType::ReliableOrdered {
                resend_time: Duration::from_millis(300),
            },
        },
        // Channel 1: Chat (ReliableUnordered)
        // Chat messages, player notifications, non-critical updates
        ChannelConfig {
            channel_id: channel_id::CHAT,
            max_memory_usage_bytes: MAX_CHANNEL_MEMORY / 2,
            send_type: renet::SendType::ReliableUnordered {
                resend_time: Duration::from_millis(300),
            },
        },
        // Channel 2: Heartbeat (Unreliable)
        // Ping, keepalive, non-critical telemetry
        ChannelConfig {
            channel_id: channel_id::HEARTBEAT,
            max_memory_usage_bytes: 64 * 1024, // 64 KB
            send_type: renet::SendType::Unreliable,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_configs_are_valid() {
        let configs = create_channel_configs();
        assert_eq!(configs.len(), 3);
        assert_eq!(configs[0].channel_id, channel_id::COMMANDS);
        assert_eq!(configs[1].channel_id, channel_id::CHAT);
        assert_eq!(configs[2].channel_id, channel_id::HEARTBEAT);
    }
}
