use crate::{ActionRuntime, AgentId, Blackboard, Policy, TickContext, WorldMut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BrainConfig {
    pub think_every_ticks: u32,
    pub think_offset_ticks: u32,
}

impl Default for BrainConfig {
    fn default() -> Self {
        Self {
            think_every_ticks: 1,
            think_offset_ticks: 0,
        }
    }
}

impl BrainConfig {
    pub fn deterministic(agent: impl AgentId, think_every_ticks: u32) -> Self {
        let every = think_every_ticks.max(1);
        let offset = (agent.stable_id() % (every as u64)) as u32;
        Self {
            think_every_ticks: every,
            think_offset_ticks: offset,
        }
    }

    pub fn should_think(&self, tick: u64) -> bool {
        let every = self.think_every_ticks.max(1) as u64;
        ((tick + (self.think_offset_ticks as u64)) % every) == 0
    }
}

pub struct Brain<W>
where
    W: WorldMut + 'static,
{
    pub agent: W::Agent,
    pub config: BrainConfig,
    pub blackboard: Blackboard,
    pub actions: ActionRuntime<W>,
    pub policy: Box<dyn Policy<W>>,
}

impl<W> Brain<W>
where
    W: WorldMut + 'static,
{
    pub fn new(agent: W::Agent, policy: Box<dyn Policy<W>>) -> Self {
        Self {
            agent,
            config: BrainConfig::default(),
            blackboard: Blackboard::new(),
            actions: ActionRuntime::default(),
            policy,
        }
    }

    pub fn tick(&mut self, ctx: &TickContext, world: &mut W) {
        if self.config.should_think(ctx.tick) {
            self.actions.begin_policy_tick();
            self.policy.tick(
                ctx,
                self.agent,
                world,
                &mut self.blackboard,
                &mut self.actions,
            );
            self.actions
                .preempt_unrequested(ctx, self.agent, world, &mut self.blackboard);
        }

        let _ = self
            .actions
            .tick(ctx, self.agent, world, &mut self.blackboard);
    }
}

pub fn tick_brains<W>(ctx: &TickContext, world: &mut W, brains: &mut [Brain<W>])
where
    W: WorldMut + 'static,
{
    brains.sort_by_key(|b| b.agent.stable_id());
    for brain in brains.iter_mut() {
        brain.tick(ctx, world);
    }
}
