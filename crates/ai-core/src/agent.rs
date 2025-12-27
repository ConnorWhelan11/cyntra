use core::fmt::Debug;

/// Stable identifier for an agent.
///
/// Deterministic simulation requires:
/// - stable ordering (`Ord`)
/// - a stable numeric ID (`stable_id`) for seeding and logs
pub trait AgentId: Copy + Ord + Eq + Debug {
    fn stable_id(self) -> u64;
}

impl AgentId for u64 {
    fn stable_id(self) -> u64 {
        self
    }
}

impl AgentId for u32 {
    fn stable_id(self) -> u64 {
        self as u64
    }
}

impl AgentId for usize {
    fn stable_id(self) -> u64 {
        self as u64
    }
}

