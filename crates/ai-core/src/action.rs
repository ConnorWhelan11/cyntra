use crate::{Blackboard, TickContext, WorldMut};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionStatus {
    Running,
    Success,
    Failure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionOutcome {
    Success,
    Failure,
}

impl From<ActionOutcome> for ActionStatus {
    fn from(value: ActionOutcome) -> Self {
        match value {
            ActionOutcome::Success => ActionStatus::Success,
            ActionOutcome::Failure => ActionStatus::Failure,
        }
    }
}

impl ActionStatus {
    pub fn outcome(self) -> Option<ActionOutcome> {
        match self {
            ActionStatus::Running => None,
            ActionStatus::Success => Some(ActionOutcome::Success),
            ActionStatus::Failure => Some(ActionOutcome::Failure),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ActionKey(pub &'static str);

pub trait Action<W>: 'static
where
    W: WorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) -> ActionStatus;

    fn cancel(
        &mut self,
        _ctx: &TickContext,
        _agent: W::Agent,
        _world: &mut W,
        _blackboard: &mut Blackboard,
    ) {
    }
}

struct RunningAction<W>
where
    W: WorldMut + 'static,
{
    key: ActionKey,
    action: Box<dyn Action<W>>,
}

pub struct ActionRuntime<W>
where
    W: WorldMut + 'static,
{
    current: Option<RunningAction<W>>,
    just_finished: Option<(ActionKey, ActionOutcome)>,
    requested: Option<ActionKey>,
}

impl<W> ActionRuntime<W>
where
    W: WorldMut + 'static,
{
    pub fn begin_policy_tick(&mut self) {
        self.requested = None;
    }

    pub fn preempt_unrequested(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) {
        let requested = self.requested;
        self.requested = None;

        let Some(current) = self.current.as_ref() else {
            return;
        };

        if Some(current.key) != requested {
            self.cancel_current(ctx, agent, world, blackboard);
        }
    }

    pub fn current_key(&self) -> Option<ActionKey> {
        self.current.as_ref().map(|a| a.key)
    }

    pub fn is_running(&self, key: ActionKey) -> bool {
        self.current_key() == Some(key)
    }

    pub fn cancel_current(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) {
        if let Some(current) = self.current.as_mut() {
            current.action.cancel(ctx, agent, world, blackboard);
        }
        self.current = None;
        self.just_finished = None;
        self.requested = None;
    }

    pub fn set_current(
        &mut self,
        key: ActionKey,
        action: Box<dyn Action<W>>,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) {
        self.requested = Some(key);
        if let Some(current) = self.current.as_mut() {
            if current.key != key {
                current.action.cancel(ctx, agent, world, blackboard);
                self.current = None;
            }
        }

        self.just_finished = None;
        if self.current.is_none() {
            self.current = Some(RunningAction { key, action });
        }
    }

    pub fn ensure_current<F>(
        &mut self,
        key: ActionKey,
        make: F,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) where
        F: FnOnce(&TickContext, W::Agent, &mut W, &mut Blackboard) -> Box<dyn Action<W>>,
    {
        self.requested = Some(key);
        if self.is_running(key) {
            return;
        }

        let action = make(ctx, agent, world, blackboard);
        self.set_current(key, action, ctx, agent, world, blackboard);
    }

    /// Replace the current action instance, even if `key` matches the currently-running action.
    ///
    /// This is intended for replanning: you may want to restart the "same" logical action (same key)
    /// with different parameters/spec.
    pub fn replace_current(
        &mut self,
        key: ActionKey,
        action: Box<dyn Action<W>>,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) {
        self.requested = Some(key);
        if let Some(current) = self.current.as_mut() {
            current.action.cancel(ctx, agent, world, blackboard);
        }
        self.current = Some(RunningAction { key, action });
        self.just_finished = None;
    }

    pub fn replace_current_with<F>(
        &mut self,
        key: ActionKey,
        make: F,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) where
        F: FnOnce(&TickContext, W::Agent, &mut W, &mut Blackboard) -> Box<dyn Action<W>>,
    {
        let action = make(ctx, agent, world, blackboard);
        self.replace_current(key, action, ctx, agent, world, blackboard);
    }

    pub fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
    ) -> Option<ActionOutcome> {
        let Some(current) = self.current.as_mut() else {
            return None;
        };

        let status = current.action.tick(ctx, agent, world, blackboard);
        let outcome = status.outcome()?;
        let key = current.key;

        self.current = None;
        self.just_finished = Some((key, outcome));
        Some(outcome)
    }

    pub fn take_just_finished(&mut self, key: ActionKey) -> Option<ActionOutcome> {
        match self.just_finished {
            Some((finished_key, outcome)) if finished_key == key => {
                self.just_finished = None;
                Some(outcome)
            }
            _ => None,
        }
    }
}

impl<W> Default for ActionRuntime<W>
where
    W: WorldMut + 'static,
{
    fn default() -> Self {
        Self {
            current: None,
            just_finished: None,
            requested: None,
        }
    }
}
