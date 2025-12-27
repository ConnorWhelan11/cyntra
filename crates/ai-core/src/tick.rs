use crate::{rng, AgentId, SplitMix64};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TickContext {
    pub tick: u64,
    pub dt_seconds: f32,
    pub seed: u64,
}

impl TickContext {
    pub fn rng_for_agent<A: AgentId>(&self, agent: A, stream: u64) -> SplitMix64 {
        let seed = rng::derive_seed(self.seed, agent.stable_id(), stream);
        SplitMix64::new(seed)
    }
}

