use ai_core::{
    ActionFactory, ActionKey, ActionOutcome, ActionRuntime, Blackboard, PlanExecutorAction,
    PlanSpec, TickContext, WorldMut,
};
use ai_tools::{emit as trace_emit, TraceEvent};

use crate::bt::{BtNode, BtStatus};

pub struct ReactiveSelector<W>
where
    W: WorldMut + 'static,
{
    children: Vec<Box<dyn BtNode<W>>>,
    running: Option<usize>,
}

impl<W> ReactiveSelector<W>
where
    W: WorldMut + 'static,
{
    pub fn new(children: Vec<Box<dyn BtNode<W>>>) -> Self {
        Self {
            children,
            running: None,
        }
    }
}

impl<W> BtNode<W> for ReactiveSelector<W>
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
    ) -> BtStatus {
        for (i, child) in self.children.iter_mut().enumerate() {
            let status = child.tick(ctx, agent, world, blackboard, actions);
            match status {
                BtStatus::Failure => continue,
                BtStatus::Success => {
                    self.reset();
                    return BtStatus::Success;
                }
                BtStatus::Running => {
                    if self.running != Some(i) {
                        if let Some(prev) = self.running {
                            self.children[prev].reset();
                        }
                        self.running = Some(i);
                    }
                    return BtStatus::Running;
                }
            }
        }

        self.reset();
        BtStatus::Failure
    }

    fn reset(&mut self) {
        self.running = None;
        for c in self.children.iter_mut() {
            c.reset();
        }
    }
}

pub struct ReactiveSequence<W>
where
    W: WorldMut + 'static,
{
    children: Vec<Box<dyn BtNode<W>>>,
    running: Option<usize>,
}

impl<W> ReactiveSequence<W>
where
    W: WorldMut + 'static,
{
    pub fn new(children: Vec<Box<dyn BtNode<W>>>) -> Self {
        Self {
            children,
            running: None,
        }
    }
}

impl<W> BtNode<W> for ReactiveSequence<W>
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
    ) -> BtStatus {
        for (i, child) in self.children.iter_mut().enumerate() {
            let status = child.tick(ctx, agent, world, blackboard, actions);
            match status {
                BtStatus::Failure => {
                    self.reset();
                    return BtStatus::Failure;
                }
                BtStatus::Running => {
                    if self.running != Some(i) {
                        if let Some(prev) = self.running {
                            self.children[prev].reset();
                        }
                        self.running = Some(i);
                    }
                    return BtStatus::Running;
                }
                BtStatus::Success => continue,
            }
        }

        self.reset();
        BtStatus::Success
    }

    fn reset(&mut self) {
        self.running = None;
        for c in self.children.iter_mut() {
            c.reset();
        }
    }
}

pub struct Sequence<W>
where
    W: WorldMut + 'static,
{
    children: Vec<Box<dyn BtNode<W>>>,
    index: usize,
}

impl<W> Sequence<W>
where
    W: WorldMut + 'static,
{
    pub fn new(children: Vec<Box<dyn BtNode<W>>>) -> Self {
        Self { children, index: 0 }
    }
}

impl<W> BtNode<W> for Sequence<W>
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
    ) -> BtStatus {
        while self.index < self.children.len() {
            let status =
                self.children[self.index].tick(ctx, agent, world, blackboard, actions);
            match status {
                BtStatus::Running => return BtStatus::Running,
                BtStatus::Failure => {
                    self.reset();
                    return BtStatus::Failure;
                }
                BtStatus::Success => self.index += 1,
            }
        }

        self.reset();
        BtStatus::Success
    }

    fn reset(&mut self) {
        self.index = 0;
        for c in self.children.iter_mut() {
            c.reset();
        }
    }
}

pub struct Selector<W>
where
    W: WorldMut + 'static,
{
    children: Vec<Box<dyn BtNode<W>>>,
    index: usize,
}

impl<W> Selector<W>
where
    W: WorldMut + 'static,
{
    pub fn new(children: Vec<Box<dyn BtNode<W>>>) -> Self {
        Self { children, index: 0 }
    }
}

impl<W> BtNode<W> for Selector<W>
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
    ) -> BtStatus {
        while self.index < self.children.len() {
            let status =
                self.children[self.index].tick(ctx, agent, world, blackboard, actions);
            match status {
                BtStatus::Running => return BtStatus::Running,
                BtStatus::Success => {
                    self.reset();
                    return BtStatus::Success;
                }
                BtStatus::Failure => self.index += 1,
            }
        }

        self.reset();
        BtStatus::Failure
    }

    fn reset(&mut self) {
        self.index = 0;
        for c in self.children.iter_mut() {
            c.reset();
        }
    }
}

pub struct Condition<F> {
    cond: F,
}

impl<F> Condition<F> {
    pub fn new(cond: F) -> Self {
        Self { cond }
    }
}

impl<F, W> BtNode<W> for Condition<F>
where
    F: FnMut(&TickContext, W::Agent, &W, &Blackboard) -> bool + 'static,
    W: WorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        _actions: &mut ActionRuntime<W>,
    ) -> BtStatus {
        if (self.cond)(ctx, agent, &*world, &*blackboard) {
            BtStatus::Success
        } else {
            BtStatus::Failure
        }
    }

    fn reset(&mut self) {}
}

pub struct RunAction<F> {
    key: ActionKey,
    make: F,
}

impl<F> RunAction<F> {
    pub fn new(key: ActionKey, make: F) -> Self {
        Self { key, make }
    }
}

impl<F, W> BtNode<W> for RunAction<F>
where
    F: FnMut(&TickContext, W::Agent, &W, &Blackboard) -> Box<dyn ai_core::Action<W>> + 'static,
    W: WorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<W>,
    ) -> BtStatus {
        if let Some(outcome) = actions.take_just_finished(self.key) {
            return match outcome {
                ActionOutcome::Success => BtStatus::Success,
                ActionOutcome::Failure => BtStatus::Failure,
            };
        }

        let make = &mut self.make;
        actions.ensure_current(
            self.key,
            |ctx, agent, world, bb| make(ctx, agent, &*world, &*bb),
            ctx,
            agent,
            world,
            blackboard,
        );

        BtStatus::Running
    }

    fn reset(&mut self) {}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlanNodeConfig {
    /// Minimum interval (in policy ticks) between cancelling/restarting a running plan due to
    /// invalidation. This avoids thrash when inputs fluctuate.
    pub min_replan_interval_ticks: u32,

    /// Optional budget to prevent infinite restart loops.
    ///
    /// This counts the number of times the node starts a plan for the same `(invalidation_key,
    /// cache_key)` pair (when caching is enabled), or for the same `invalidation_key` (when caching
    /// is disabled). When the budget is exceeded, the node stops replanning until keys change and
    /// returns `Failure` to allow BT fallbacks to run.
    pub max_plan_starts_per_key: Option<u32>,
}

impl Default for PlanNodeConfig {
    fn default() -> Self {
        Self {
            min_replan_interval_ticks: 0,
            max_plan_starts_per_key: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PlanNodeKey {
    invalidation_key: u64,
    cache_key: Option<u64>,
}

#[derive(Debug, Clone)]
struct PlanCacheEntry<S> {
    key: PlanNodeKey,
    plan: Option<PlanSpec<S>>,
}

enum PlanNodeCacheMode<W>
where
    W: WorldMut + 'static,
{
    Disabled,
    InvalidationKey,
    Custom(Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64>),
}

/// Execute an externally-provided `PlanSpec` as a BT leaf node, with optional invalidation.
///
/// - `plan_fn` provides the current plan (or `None` when no plan is available).
/// - `invalidation_key_fn` returns an explicit invalidation key; when it changes, the node will
///   (throttled) cancel/restart the running plan using `replace_current_with`.
/// - Plan results are cached only when caching is enabled (via `with_cache_key` or
///   `with_signature`), including caching `None`.
/// - If you have a goal predicate, use `with_done`: it gates BT `Success` on goal satisfaction and
///   treats `ActionOutcome::Success` with an unmet goal as "no progress" (clears cache + replans).
///
/// Cache contract:
/// If caching is enabled, the cache key must change whenever `plan_fn` would return a different
/// plan. If `plan_fn` depends on additional facts not captured by the cache key, the node may reuse
/// a stale cached plan.
pub struct PlanNode<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    key: ActionKey,
    factory: F,
    config: PlanNodeConfig,

    plan_fn:
        Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> Option<PlanSpec<F::Spec>>>,
    invalidation_key_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64>,
    cache_mode: PlanNodeCacheMode<W>,
    done_fn: Option<Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> bool>>,

    last_invalidation_key: Option<u64>,
    last_cache_key: Option<u64>,
    last_planned_tick: Option<u64>,
    pending_replan: bool,
    cache: Option<PlanCacheEntry<F::Spec>>,
    plan_calls: u64,
    plan_starts: u64,
    last_outcome: Option<ActionOutcome>,
    last_plan_len: Option<usize>,
    starts_for_key: u32,
    last_started_key: Option<PlanNodeKey>,
}

impl<W, F> PlanNode<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    pub fn new(
        key: ActionKey,
        factory: F,
        plan_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> Option<PlanSpec<F::Spec>>
            + 'static,
    ) -> Self {
        Self {
            key,
            factory,
            config: PlanNodeConfig::default(),
            plan_fn: Box::new(plan_fn),
            invalidation_key_fn: Box::new(|_, _, _, _| 0),
            cache_mode: PlanNodeCacheMode::Disabled,
            done_fn: None,
            last_invalidation_key: None,
            last_cache_key: None,
            last_planned_tick: None,
            pending_replan: true,
            cache: None,
            plan_calls: 0,
            plan_starts: 0,
            last_outcome: None,
            last_plan_len: None,
            starts_for_key: 0,
            last_started_key: None,
        }
    }

    pub fn with_config(mut self, config: PlanNodeConfig) -> Self {
        self.config = config;
        self
    }

    /// Provide an explicit invalidation key. When this value changes, the node marks the current
    /// plan as invalid and will replan (subject to throttling).
    pub fn with_invalidation_key(
        mut self,
        invalidation_key_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.invalidation_key_fn = Box::new(invalidation_key_fn);
        self
    }

    /// Enable plan caching by providing a cache key.
    ///
    /// Cache contract:
    /// The cache key must change whenever `plan_fn` would return a different plan.
    pub fn with_cache_key(
        mut self,
        cache_key_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.cache_mode = PlanNodeCacheMode::Custom(Box::new(cache_key_fn));
        self
    }

    /// Convenience: set the same function for invalidation and caching.
    ///
    /// This matches the common "signature" pattern: changes cancel/restart the running plan, and
    /// also invalidate the cached plan.
    pub fn with_signature(
        mut self,
        signature_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.invalidation_key_fn = Box::new(signature_fn);
        self.cache_mode = PlanNodeCacheMode::InvalidationKey;
        self
    }

    /// Provide a goal/done predicate. When `done_fn` returns `true`, the node returns `Success` and
    /// will not request its plan action (preempting any running plan).
    ///
    /// If a plan finishes with `Success` but `done_fn` is still `false`, the node treats it as
    /// "no progress": it clears the cache and triggers a replan to avoid success loops.
    pub fn with_done(
        mut self,
        done_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> bool + 'static,
    ) -> Self {
        self.done_fn = Some(Box::new(done_fn));
        self
    }

    pub fn cached_plan(&self) -> Option<&PlanSpec<F::Spec>> {
        self.cache.as_ref()?.plan.as_ref()
    }

    pub fn cached_plan_len(&self) -> Option<usize> {
        self.cached_plan().map(|p| p.len())
    }

    pub fn last_invalidation_key(&self) -> Option<u64> {
        self.last_invalidation_key
    }

    pub fn last_cache_key(&self) -> Option<u64> {
        self.last_cache_key
    }

    pub fn last_outcome(&self) -> Option<ActionOutcome> {
        self.last_outcome
    }

    /// Number of times `plan_fn` was invoked due to a cache miss.
    pub fn plan_calls(&self) -> u64 {
        self.plan_calls
    }

    /// Number of times a plan was started (including starts using a cached plan).
    pub fn plan_starts(&self) -> u64 {
        self.plan_starts
    }

    pub fn last_plan_len(&self) -> Option<usize> {
        self.last_plan_len
    }

    fn can_replan_now(&self, tick: u64) -> bool {
        let min = self.config.min_replan_interval_ticks as u64;
        match self.last_planned_tick {
            None => true,
            Some(last) => tick.saturating_sub(last) >= min,
        }
    }

    fn get_or_plan(
        &mut self,
        key: PlanNodeKey,
        ctx: &TickContext,
        agent: W::Agent,
        world: &W,
        blackboard: &mut Blackboard,
    ) -> Option<PlanSpec<F::Spec>> {
        if matches!(
            &self.cache_mode,
            PlanNodeCacheMode::InvalidationKey | PlanNodeCacheMode::Custom(_)
        )
        {
            if let Some(entry) = self.cache.as_ref() {
                if entry.key == key {
                    return entry.plan.clone();
                }
            }
        }

        self.plan_calls = self.plan_calls.saturating_add(1);
        trace_emit(
            blackboard,
            TraceEvent::new(ctx.tick, "bt.plan.call")
                .with_a(key.invalidation_key)
                .with_b(key.cache_key.unwrap_or(0)),
        );
        let plan = {
            let blackboard_view: &Blackboard = &*blackboard;
            (self.plan_fn)(ctx, agent, world, blackboard_view)
        };
        trace_emit(
            blackboard,
            TraceEvent::new(ctx.tick, "bt.plan.result").with_a(plan.as_ref().map(|p| p.len()).unwrap_or(0) as u64),
        );
        if matches!(
            &self.cache_mode,
            PlanNodeCacheMode::InvalidationKey | PlanNodeCacheMode::Custom(_)
        )
        {
            self.cache = Some(PlanCacheEntry {
                key,
                plan: plan.clone(),
            });
        }
        self.last_plan_len = plan.as_ref().map(|p| p.len());
        plan
    }

    fn would_exceed_budget(&self, key: PlanNodeKey) -> bool {
        let Some(max) = self.config.max_plan_starts_per_key else {
            return false;
        };

        let starts = if self.last_started_key == Some(key) {
            self.starts_for_key
        } else {
            0
        };

        starts.saturating_add(1) > max
    }

    fn note_plan_start(&mut self, key: PlanNodeKey, tick: u64, plan_len: usize) -> bool {
        let Some(max) = self.config.max_plan_starts_per_key else {
            self.plan_starts = self.plan_starts.saturating_add(1);
            self.last_planned_tick = Some(tick);
            self.last_plan_len = Some(plan_len);
            self.pending_replan = false;
            return true;
        };

        if self.last_started_key != Some(key) {
            self.starts_for_key = 0;
        }

        if self.starts_for_key.saturating_add(1) > max {
            self.pending_replan = false;
            return false;
        }

        self.starts_for_key = self.starts_for_key.saturating_add(1);
        self.last_started_key = Some(key);
        self.plan_starts = self.plan_starts.saturating_add(1);
        self.last_planned_tick = Some(tick);
        self.last_plan_len = Some(plan_len);
        self.pending_replan = false;
        true
    }
}

impl<W, F> BtNode<W> for PlanNode<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<W>,
    ) -> BtStatus {
        let world_view: &W = &*world;

        let finished = actions.take_just_finished(self.key);
        if let Some(outcome) = finished {
            self.last_outcome = Some(outcome);
            trace_emit(
                blackboard,
                TraceEvent::new(
                    ctx.tick,
                    match outcome {
                        ActionOutcome::Success => "bt.plan.outcome.success",
                        ActionOutcome::Failure => "bt.plan.outcome.failure",
                    },
                )
                .with_a(self.last_invalidation_key.unwrap_or(0))
                .with_b(self.last_cache_key.unwrap_or(0)),
            );
            match outcome {
                ActionOutcome::Success => {}
                ActionOutcome::Failure => {
                    self.cache = None;
                    self.pending_replan = true;
                }
            }
        }

        let invalidation_key = (self.invalidation_key_fn)(ctx, agent, world_view, &*blackboard);
        let cache_key = match &mut self.cache_mode {
            PlanNodeCacheMode::Disabled => None,
            PlanNodeCacheMode::InvalidationKey => Some(invalidation_key),
            PlanNodeCacheMode::Custom(f) => Some(f(ctx, agent, world_view, &*blackboard)),
        };
        let key = PlanNodeKey {
            invalidation_key,
            cache_key,
        };

        let key_changed = self
            .last_invalidation_key
            .map(|prev| prev != invalidation_key)
            .unwrap_or(false)
            || (self.last_cache_key != cache_key);
        if key_changed {
            self.pending_replan = true;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "bt.plan.invalidated")
                    .with_a(invalidation_key)
                    .with_b(cache_key.unwrap_or(0)),
            );
        }
        self.last_invalidation_key = Some(invalidation_key);
        self.last_cache_key = cache_key;

        if let Some(done_fn) = self.done_fn.as_mut() {
            if done_fn(ctx, agent, world_view, &*blackboard) {
                self.cache = None;
                self.pending_replan = true;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "bt.plan.done")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
                return BtStatus::Success;
            }

            if matches!(finished, Some(ActionOutcome::Success)) {
                // Plan reported success but goal isn't satisfied: force replan (no-progress guard).
                self.cache = None;
                self.pending_replan = true;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "bt.plan.no_progress")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
            }
        } else if matches!(finished, Some(ActionOutcome::Success)) {
            return BtStatus::Success;
        }

        let running = actions.is_running(self.key);

        if running && self.pending_replan && self.can_replan_now(ctx.tick) {
            if self.would_exceed_budget(key) {
                self.pending_replan = false;
                self.cache = None;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "bt.plan.budget_exhausted")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
                return BtStatus::Failure;
            }

            if let Some(plan) = self.get_or_plan(key, ctx, agent, world_view, blackboard) {
                let plan_len = plan.len();
                if !self.note_plan_start(key, ctx.tick, plan_len) {
                    self.cache = None;
                    trace_emit(
                        blackboard,
                        TraceEvent::new(ctx.tick, "bt.plan.budget_exhausted")
                            .with_a(invalidation_key)
                            .with_b(cache_key.unwrap_or(0)),
                    );
                    return BtStatus::Failure;
                }
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "bt.plan.restart")
                        .with_a(plan_len as u64)
                        .with_b(cache_key.unwrap_or(0)),
                );
                let factory = self.factory.clone();
                actions.replace_current_with(
                    self.key,
                    move |_ctx, _agent, _world, _bb| {
                        Box::new(PlanExecutorAction::new(plan, factory))
                    },
                    ctx,
                    agent,
                    world,
                    blackboard,
                );
                return BtStatus::Running;
            }

            // No plan available: allow fallbacks to run.
            self.pending_replan = false;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "bt.plan.none")
                    .with_a(invalidation_key)
                    .with_b(cache_key.unwrap_or(0)),
            );
            return BtStatus::Failure;
        }

        if !running {
            if self.done_fn.is_none()
                && self.last_outcome == Some(ActionOutcome::Success)
                && !self.pending_replan
            {
                return BtStatus::Success;
            }

            if self.pending_replan && !self.can_replan_now(ctx.tick) {
                return BtStatus::Running;
            }

            if self.would_exceed_budget(key) {
                self.pending_replan = false;
                self.cache = None;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "bt.plan.budget_exhausted")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
                return BtStatus::Failure;
            }

            if let Some(plan) = self.get_or_plan(key, ctx, agent, world_view, blackboard) {
                let plan_len = plan.len();
                if !self.note_plan_start(key, ctx.tick, plan_len) {
                    self.cache = None;
                    trace_emit(
                        blackboard,
                        TraceEvent::new(ctx.tick, "bt.plan.budget_exhausted")
                            .with_a(invalidation_key)
                            .with_b(cache_key.unwrap_or(0)),
                    );
                    return BtStatus::Failure;
                }
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "bt.plan.start")
                        .with_a(plan_len as u64)
                        .with_b(cache_key.unwrap_or(0)),
                );
                let factory = self.factory.clone();
                actions.ensure_current(
                    self.key,
                    move |_ctx, _agent, _world, _bb| {
                        Box::new(PlanExecutorAction::new(plan, factory))
                    },
                    ctx,
                    agent,
                    world,
                    blackboard,
                );
                return BtStatus::Running;
            }

            // No plan available; rely on key changes to trigger another attempt.
            self.pending_replan = false;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "bt.plan.none")
                    .with_a(invalidation_key)
                    .with_b(cache_key.unwrap_or(0)),
            );
            return BtStatus::Failure;
        }

        actions.ensure_current(
            self.key,
            |_ctx, _agent, _world, _bb| unreachable!("unexpected plan restart"),
            ctx,
            agent,
            world,
            blackboard,
        );
        BtStatus::Running
    }

    fn reset(&mut self) {
        self.last_invalidation_key = None;
        self.last_cache_key = None;
        self.last_planned_tick = None;
        self.pending_replan = true;
        self.cache = None;
        self.last_outcome = None;
        self.last_plan_len = None;
        self.starts_for_key = 0;
        self.last_started_key = None;
    }
}
