use crate::{Action, ActionStatus, Blackboard, TickContext, WorldMut};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Execute a fixed sequence of actions as a single composite action.
///
/// This is a minimal "plan runner" primitive intended for GOAP/HTN outputs:
/// the planner can construct a list of actions, then hand them to `PlanAction`
/// for deterministic execution at the action tick rate (independent of policy tick rate).
pub struct PlanAction<W>
where
    W: WorldMut + 'static,
{
    steps: Vec<Box<dyn Action<W>>>,
    index: usize,
}

impl<W> PlanAction<W>
where
    W: WorldMut + 'static,
{
    pub fn new(steps: Vec<Box<dyn Action<W>>>) -> Self {
        Self { steps, index: 0 }
    }

    pub fn len(&self) -> usize {
        self.steps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    pub fn current_index(&self) -> usize {
        self.index
    }
}

impl<W> Action<W> for PlanAction<W>
where
    W: WorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) -> ActionStatus {
        while self.index < self.steps.len() {
            let status = self.steps[self.index].tick(ctx, agent, world, blackboard);
            match status {
                ActionStatus::Running => return ActionStatus::Running,
                ActionStatus::Failure => return ActionStatus::Failure,
                ActionStatus::Success => self.index += 1,
            }
        }
        ActionStatus::Success
    }

    fn cancel(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) {
        if self.index < self.steps.len() {
            self.steps[self.index].cancel(ctx, agent, world, blackboard);
        }
    }
}

/// Serializable plan data: a sequence of action specs.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct PlanSpec<S> {
    pub steps: Vec<S>,
}

impl<S> PlanSpec<S> {
    pub fn new(steps: Vec<S>) -> Self {
        Self { steps }
    }

    pub fn len(&self) -> usize {
        self.steps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }
}

/// Build runtime `Action`s from immutable, serializable specs.
///
/// Planners (GOAP/HTN) should output `PlanSpec<Spec>`. The executor turns each
/// `Spec` into a runtime `Action` lazily, one step at a time.
pub trait ActionFactory<W>: 'static
where
    W: WorldMut + 'static,
{
    type Spec: Clone + 'static;

    fn build(
        &self,
        spec: &Self::Spec,
        ctx: &TickContext,
        agent: W::Agent,
        world: &W,
        blackboard: &Blackboard,
    ) -> Box<dyn Action<W>>;
}

/// Execute a `PlanSpec` by instantiating each step via an `ActionFactory`.
pub struct PlanExecutorAction<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W>,
{
    plan: PlanSpec<F::Spec>,
    factory: F,
    index: usize,
    current: Option<Box<dyn Action<W>>>,
}

impl<W, F> PlanExecutorAction<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W>,
{
    pub fn new(plan: PlanSpec<F::Spec>, factory: F) -> Self {
        Self {
            plan,
            factory,
            index: 0,
            current: None,
        }
    }

    pub fn plan(&self) -> &PlanSpec<F::Spec> {
        &self.plan
    }

    pub fn len(&self) -> usize {
        self.plan.len()
    }

    pub fn is_empty(&self) -> bool {
        self.plan.is_empty()
    }

    pub fn current_index(&self) -> usize {
        self.index
    }
}

impl<W, F> Action<W> for PlanExecutorAction<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W>,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) -> ActionStatus {
        while self.index < self.plan.steps.len() {
            if self.current.is_none() {
                let spec = &self.plan.steps[self.index];
                let world_view: &W = &*world;
                let bb_view: &Blackboard = &*blackboard;
                self.current = Some(self.factory.build(spec, ctx, agent, world_view, bb_view));
            }

            let Some(action) = self.current.as_mut() else {
                return ActionStatus::Failure;
            };

            let status = action.tick(ctx, agent, world, blackboard);
            match status {
                ActionStatus::Running => return ActionStatus::Running,
                ActionStatus::Failure => return ActionStatus::Failure,
                ActionStatus::Success => {
                    self.current = None;
                    self.index += 1;
                }
            }
        }

        ActionStatus::Success
    }

    fn cancel(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) {
        if let Some(current) = self.current.as_mut() {
            current.cancel(ctx, agent, world, blackboard);
        }
    }
}
