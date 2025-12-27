use ai_core::{ActionRuntime, Blackboard, Policy, TickContext, WorldMut};

use crate::bt::{BtNode, BtStatus};

pub struct BtPolicy<W>
where
    W: WorldMut + 'static,
{
    root: Box<dyn BtNode<W>>,
    last: BtStatus,
}

impl<W> BtPolicy<W>
where
    W: WorldMut + 'static,
{
    pub fn new(root: Box<dyn BtNode<W>>) -> Self {
        Self {
            root,
            last: BtStatus::Running,
        }
    }

    pub fn last_status(&self) -> BtStatus {
        self.last
    }
}

impl<W> Policy<W> for BtPolicy<W>
where
    W: WorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<W>,
    ) {
        self.last = self.root.tick(ctx, agent, world, blackboard, actions);
        if self.last != BtStatus::Running {
            self.root.reset();
        }
    }
}
