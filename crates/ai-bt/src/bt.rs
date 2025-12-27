use ai_core::{ActionRuntime, Blackboard, TickContext, WorldMut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BtStatus {
    Running,
    Success,
    Failure,
}

pub trait BtNode<W>: 'static
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
    ) -> BtStatus;

    fn reset(&mut self);
}
