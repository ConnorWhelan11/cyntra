use ai_core::{
    ActionFactory, ActionKey, ActionOutcome, ActionRuntime, Blackboard, PlanExecutorAction,
    PlanSpec, Policy, TickContext, WorldMut,
};
use ai_tools::{emit as trace_emit, TraceEvent};

use crate::{HtnPlanner, Task};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HtnPlanPolicyConfig {
    /// Minimum interval (in policy ticks) between cancelling/restarting a running plan due to
    /// invalidation. This avoids thrash when inputs fluctuate.
    pub min_replan_interval_ticks: u32,

    /// Optional budget to prevent infinite restart loops.
    ///
    /// This counts the number of times the policy starts a plan for the same
    /// `(invalidation_key, cache_key)` pair (when caching is enabled), or for the same
    /// `invalidation_key` (when caching is disabled).
    ///
    /// When the budget is exceeded, the policy stops requesting its plan action until keys change
    /// (preemption will cancel any running plan).
    pub max_plan_starts_per_key: Option<u32>,
}

impl Default for HtnPlanPolicyConfig {
    fn default() -> Self {
        Self {
            min_replan_interval_ticks: 0,
            max_plan_starts_per_key: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PlanKey {
    invalidation_key: u64,
    cache_key: Option<u64>,
}

#[derive(Debug, Clone)]
struct PlanCacheEntry<S> {
    key: PlanKey,
    plan: Option<PlanSpec<S>>,
}

enum PlanCacheMode<W>
where
    W: WorldMut + 'static,
{
    Disabled,
    InvalidationKey,
    Custom(Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64>),
}

pub struct HtnPlanDriver<W, F, P>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
    P: Clone + 'static,
{
    key: ActionKey,
    planner: HtnPlanner<F::Spec, P>,
    root: Vec<Task>,
    factory: F,
    config: HtnPlanPolicyConfig,

    state_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> P>,
    invalidation_key_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64>,
    cache_mode: PlanCacheMode<W>,
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
    last_started_key: Option<PlanKey>,

    #[allow(dead_code)]
    _phantom: std::marker::PhantomData<P>,
}

impl<W, F, P> HtnPlanDriver<W, F, P>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
    P: Clone + 'static,
{
    pub fn new(
        planner: HtnPlanner<F::Spec, P>,
        root: Vec<Task>,
        factory: F,
        state_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> P + 'static,
    ) -> Self {
        Self {
            key: ActionKey("htn_plan"),
            planner,
            root,
            factory,
            config: HtnPlanPolicyConfig::default(),
            state_fn: Box::new(state_fn),
            invalidation_key_fn: Box::new(|_, _, _, _| 0),
            cache_mode: PlanCacheMode::Disabled,
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
            _phantom: std::marker::PhantomData,
        }
    }

    pub fn with_key(mut self, key: ActionKey) -> Self {
        self.key = key;
        self
    }

    pub fn with_config(mut self, config: HtnPlanPolicyConfig) -> Self {
        self.config = config;
        self
    }

    /// Provide an explicit invalidation key. When this value changes, the policy marks the
    /// current plan as invalid and will replan (subject to throttling).
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
    /// The cache key must change whenever the planned result would change.
    pub fn with_cache_key(
        mut self,
        cache_key_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.cache_mode = PlanCacheMode::Custom(Box::new(cache_key_fn));
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
        self.cache_mode = PlanCacheMode::InvalidationKey;
        self
    }

    /// Provide a goal/done predicate. When `done_fn` returns `true`, the policy stops requesting
    /// its plan action (preempting any running plan).
    ///
    /// If a plan finishes with `Success` but `done_fn` is still `false`, the policy treats it as
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

    /// Number of times the underlying planner was invoked (cache misses).
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
        key: PlanKey,
        start: &P,
        ctx: &TickContext,
        blackboard: &mut Blackboard,
    ) -> Option<PlanSpec<F::Spec>> {
        if matches!(
            &self.cache_mode,
            PlanCacheMode::InvalidationKey | PlanCacheMode::Custom(_)
        ) {
            if let Some(entry) = self.cache.as_ref() {
                if entry.key == key {
                    return entry.plan.clone();
                }
            }
        }

        self.plan_calls = self.plan_calls.saturating_add(1);
        trace_emit(
            blackboard,
            TraceEvent::new(ctx.tick, "htn.plan.call")
                .with_a(key.invalidation_key)
                .with_b(key.cache_key.unwrap_or(0)),
        );
        let plan = self.planner.plan(start, &self.root);
        trace_emit(
            blackboard,
            TraceEvent::new(ctx.tick, "htn.plan.result")
                .with_a(plan.as_ref().map(|p| p.len()).unwrap_or(0) as u64)
                .with_b(key.cache_key.unwrap_or(0)),
        );
        if matches!(
            &self.cache_mode,
            PlanCacheMode::InvalidationKey | PlanCacheMode::Custom(_)
        ) {
            self.cache = Some(PlanCacheEntry {
                key,
                plan: plan.clone(),
            });
        }
        self.last_plan_len = plan.as_ref().map(|p| p.len());
        plan
    }

    fn would_exceed_budget(&self, key: PlanKey) -> bool {
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

    fn note_plan_start(&mut self, key: PlanKey, tick: u64, plan_len: usize) -> bool {
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

    pub fn drive(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<W>,
    ) {
        let world_view: &W = &*world;

        let finished = actions.take_just_finished(self.key);
        if let Some(outcome) = finished {
            self.last_outcome = Some(outcome);
            match outcome {
                ActionOutcome::Success => {}
                ActionOutcome::Failure => {
                    self.cache = None;
                    self.pending_replan = true;
                }
            }
        }

        let (invalidation_key, cache_key) = {
            let bb_view: &Blackboard = &*blackboard;
            let invalidation_key = (self.invalidation_key_fn)(ctx, agent, world_view, bb_view);
            let cache_key = match &mut self.cache_mode {
                PlanCacheMode::Disabled => None,
                PlanCacheMode::InvalidationKey => Some(invalidation_key),
                PlanCacheMode::Custom(f) => Some(f(ctx, agent, world_view, bb_view)),
            };
            (invalidation_key, cache_key)
        };
        let key = PlanKey {
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
                TraceEvent::new(ctx.tick, "htn.plan.invalidated")
                    .with_a(invalidation_key)
                    .with_b(cache_key.unwrap_or(0)),
            );
        }
        self.last_invalidation_key = Some(invalidation_key);
        self.last_cache_key = cache_key;

        if let Some(outcome) = finished {
            trace_emit(
                blackboard,
                TraceEvent::new(
                    ctx.tick,
                    match outcome {
                        ActionOutcome::Success => "htn.plan.outcome.success",
                        ActionOutcome::Failure => "htn.plan.outcome.failure",
                    },
                )
                .with_a(invalidation_key)
                .with_b(cache_key.unwrap_or(0)),
            );
        }

        if let Some(done_fn) = self.done_fn.as_mut() {
            let done = {
                let bb_view: &Blackboard = &*blackboard;
                done_fn(ctx, agent, world_view, bb_view)
            };
            if done {
                self.cache = None;
                self.pending_replan = true;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "htn.plan.done")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
                return;
            }

            if matches!(finished, Some(ActionOutcome::Success)) {
                // Plan reported success but goal isn't satisfied: force replan (no-progress guard).
                self.cache = None;
                self.pending_replan = true;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "htn.plan.no_progress")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
            }
        } else if matches!(finished, Some(ActionOutcome::Success)) {
            return;
        }

        let running = actions.is_running(self.key);

        if running && self.pending_replan && self.can_replan_now(ctx.tick) {
            if self.would_exceed_budget(key) {
                self.pending_replan = false;
                self.cache = None;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "htn.plan.budget_exhausted")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
                return;
            }

            let start = {
                let bb_view: &Blackboard = &*blackboard;
                (self.state_fn)(ctx, agent, world_view, bb_view)
            };
            if let Some(plan) = self.get_or_plan(key, &start, ctx, blackboard) {
                let plan_len = plan.len();
                if !self.note_plan_start(key, ctx.tick, plan_len) {
                    self.cache = None;
                    trace_emit(
                        blackboard,
                        TraceEvent::new(ctx.tick, "htn.plan.budget_exhausted")
                            .with_a(invalidation_key)
                            .with_b(cache_key.unwrap_or(0)),
                    );
                    return;
                }
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "htn.plan.restart")
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
                return;
            }

            // No plan available: stop requesting (preemption cancels) and wait for key changes.
            self.pending_replan = false;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "htn.plan.none")
                    .with_a(invalidation_key)
                    .with_b(cache_key.unwrap_or(0)),
            );
            return;
        }

        if !running {
            if self.done_fn.is_none()
                && self.last_outcome == Some(ActionOutcome::Success)
                && !self.pending_replan
            {
                return;
            }

            if self.pending_replan && !self.can_replan_now(ctx.tick) {
                return;
            }

            if self.would_exceed_budget(key) {
                self.pending_replan = false;
                self.cache = None;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "htn.plan.budget_exhausted")
                        .with_a(invalidation_key)
                        .with_b(cache_key.unwrap_or(0)),
                );
                return;
            }

            let start = {
                let bb_view: &Blackboard = &*blackboard;
                (self.state_fn)(ctx, agent, world_view, bb_view)
            };
            if let Some(plan) = self.get_or_plan(key, &start, ctx, blackboard) {
                let plan_len = plan.len();
                if !self.note_plan_start(key, ctx.tick, plan_len) {
                    self.cache = None;
                    trace_emit(
                        blackboard,
                        TraceEvent::new(ctx.tick, "htn.plan.budget_exhausted")
                            .with_a(invalidation_key)
                            .with_b(cache_key.unwrap_or(0)),
                    );
                    return;
                }
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "htn.plan.start")
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
                return;
            }

            // No plan available; rely on key changes to trigger another attempt.
            self.pending_replan = false;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "htn.plan.none")
                    .with_a(invalidation_key)
                    .with_b(cache_key.unwrap_or(0)),
            );
            return;
        }

        // Keep the current plan requested to avoid preemption.
        actions.ensure_current(
            self.key,
            |_ctx, _agent, _world, _bb| unreachable!("unexpected plan restart"),
            ctx,
            agent,
            world,
            blackboard,
        );
    }
}

/// A small `ai-core::Policy` wrapper that:
/// - Plans with `HtnPlanner` only when needed (optional cache).
/// - Runs the resulting `PlanSpec` via `PlanExecutorAction`.
/// - Replans on explicit invalidation key changes using `replace_current_with`.
/// - Optionally throttles replanning to avoid cancel/restart thrash.
/// - Treats `ActionOutcome::Success` with an unmet goal (via `done_fn`) as "no progress": clears
///   the plan cache and forces a replan to avoid success loops.
pub struct HtnPlanPolicy<W, F, P>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
    P: Clone + 'static,
{
    driver: HtnPlanDriver<W, F, P>,
}

impl<W, F, P> HtnPlanPolicy<W, F, P>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
    P: Clone + 'static,
{
    pub fn new(
        planner: HtnPlanner<F::Spec, P>,
        root: Vec<Task>,
        factory: F,
        state_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> P + 'static,
    ) -> Self {
        Self {
            driver: HtnPlanDriver::new(planner, root, factory, state_fn),
        }
    }

    pub fn with_key(mut self, key: ActionKey) -> Self {
        self.driver = self.driver.with_key(key);
        self
    }

    pub fn with_config(mut self, config: HtnPlanPolicyConfig) -> Self {
        self.driver = self.driver.with_config(config);
        self
    }

    pub fn with_invalidation_key(
        mut self,
        invalidation_key_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.driver = self.driver.with_invalidation_key(invalidation_key_fn);
        self
    }

    pub fn with_cache_key(
        mut self,
        cache_key_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.driver = self.driver.with_cache_key(cache_key_fn);
        self
    }

    pub fn with_signature(
        mut self,
        signature_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.driver = self.driver.with_signature(signature_fn);
        self
    }

    pub fn with_done(
        mut self,
        done_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> bool + 'static,
    ) -> Self {
        self.driver = self.driver.with_done(done_fn);
        self
    }

    pub fn cached_plan(&self) -> Option<&PlanSpec<F::Spec>> {
        self.driver.cached_plan()
    }

    pub fn cached_plan_len(&self) -> Option<usize> {
        self.driver.cached_plan_len()
    }

    pub fn last_invalidation_key(&self) -> Option<u64> {
        self.driver.last_invalidation_key()
    }

    pub fn last_cache_key(&self) -> Option<u64> {
        self.driver.last_cache_key()
    }

    pub fn last_outcome(&self) -> Option<ActionOutcome> {
        self.driver.last_outcome()
    }

    pub fn plan_calls(&self) -> u64 {
        self.driver.plan_calls()
    }

    pub fn plan_starts(&self) -> u64 {
        self.driver.plan_starts()
    }

    pub fn last_plan_len(&self) -> Option<usize> {
        self.driver.last_plan_len()
    }
}

impl<W, F, P> Policy<W> for HtnPlanPolicy<W, F, P>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
    P: Clone + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<W>,
    ) {
        self.driver.drive(ctx, agent, world, blackboard, actions);
    }
}
