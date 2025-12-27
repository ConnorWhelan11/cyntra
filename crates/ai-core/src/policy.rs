use crate::{ActionRuntime, Blackboard, TickContext, WorldMut};

pub trait Policy<W>: 'static
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
    );
}
