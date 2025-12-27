use ai_core::{
    ActionFactory, ActionKey, ActionOutcome, ActionRuntime, Blackboard, PlanExecutorAction, PlanSpec,
    Policy, TickContext, WorldMut,
};
use ai_tools::{emit as trace_emit, TraceEvent};

use crate::{GoapPlanner, GoapState};

/// Cache/invalidation key for GOAP plan generation.
///
/// The GOAP plan cache is keyed by `(start, goal, signature)`.
///
/// - `start`: current fact state (typically a bitset).
/// - `goal`: desired facts (bitset). The goal is considered satisfied when `(start & goal) == goal`.
/// - `signature`: explicit invalidation input for planner-dependent facts that aren't represented
///   in `start`/`goal` (e.g., map version, dynamic obstacle version, permissions).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GoapPlanKey {
    pub start: GoapState,
    pub goal: GoapState,
    pub signature: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GoapPlanPolicyConfig {
    /// Minimum interval (in policy ticks) between cancelling/restarting a running plan due to
    /// invalidation. This avoids thrash when inputs fluctuate.
    pub min_replan_interval_ticks: u32,

    /// Optional budget to prevent infinite restart loops.
    ///
    /// This counts the number of times the policy starts a plan for the same `(start, goal,
    /// signature)` triple. This is primarily intended to guard against "no progress" loops where
    /// the runtime actions report `Success` but the GOAP goal remains unmet (i.e., the modeled
    /// effects did not actually occur).
    pub max_plan_starts_per_key: Option<u32>,
}

impl Default for GoapPlanPolicyConfig {
    fn default() -> Self {
        Self {
            min_replan_interval_ticks: 0,
            max_plan_starts_per_key: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GoapPlanDriveStatus {
    Success,
    Running,
    Failure,
}

#[derive(Debug, Clone)]
struct PlanCacheEntry<S> {
    start: GoapState,
    goal: GoapState,
    signature: u64,
    plan: Option<PlanSpec<S>>,
}

pub(crate) struct GoapPlanDriver<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    key: ActionKey,
    planner: GoapPlanner<F::Spec>,
    factory: F,
    config: GoapPlanPolicyConfig,

    state_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> GoapState>,
    goal_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> GoapState>,
    signature_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64>,

    last_start: Option<GoapState>,
    last_signature: Option<u64>,
    last_goal: Option<GoapState>,
    last_planned_tick: Option<u64>,
    pending_replan: bool,
    cache: Option<PlanCacheEntry<F::Spec>>,
    plan_calls: u64,
    plan_starts: u64,
    starts_for_key: u32,
    last_started_key: Option<GoapPlanKey>,
    last_outcome: Option<ActionOutcome>,
}

impl<W, F> GoapPlanDriver<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    pub fn new(
        planner: GoapPlanner<F::Spec>,
        factory: F,
        state_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> GoapState + 'static,
        goal_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> GoapState + 'static,
    ) -> Self {
        Self {
            key: ActionKey("goap_plan"),
            planner,
            factory,
            config: GoapPlanPolicyConfig::default(),
            state_fn: Box::new(state_fn),
            goal_fn: Box::new(goal_fn),
            signature_fn: Box::new(|_, _, _, _| 0),
            last_start: None,
            last_signature: None,
            last_goal: None,
            last_planned_tick: None,
            pending_replan: true, // plan immediately on first tick
            cache: None,
            plan_calls: 0,
            plan_starts: 0,
            starts_for_key: 0,
            last_started_key: None,
            last_outcome: None,
        }
    }

    pub fn with_key(mut self, key: ActionKey) -> Self {
        self.key = key;
        self
    }

    pub fn with_config(mut self, config: GoapPlanPolicyConfig) -> Self {
        self.config = config;
        self
    }

    /// Provide an explicit invalidation signature. When this value changes, the policy marks the
    /// current plan as invalid and will replan (subject to throttling).
    pub fn with_signature(
        mut self,
        signature_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.signature_fn = Box::new(signature_fn);
        self
    }

    pub fn cached_plan(&self) -> Option<&PlanSpec<F::Spec>> {
        self.cache.as_ref()?.plan.as_ref()
    }

    pub fn cached_plan_len(&self) -> Option<usize> {
        self.cached_plan().map(|p| p.len())
    }

    /// Number of times the underlying `GoapPlanner` was invoked (cache misses).
    pub fn plan_calls(&self) -> u64 {
        self.plan_calls
    }

    /// Number of times a plan was started (including starts using a cached plan).
    pub fn plan_starts(&self) -> u64 {
        self.plan_starts
    }

    pub fn last_outcome(&self) -> Option<ActionOutcome> {
        self.last_outcome
    }

    pub fn last_start(&self) -> Option<GoapState> {
        self.last_start
    }

    pub fn last_goal(&self) -> Option<GoapState> {
        self.last_goal
    }

    pub fn last_signature(&self) -> Option<u64> {
        self.last_signature
    }

    pub fn last_plan_key(&self) -> Option<GoapPlanKey> {
        Some(GoapPlanKey {
            start: self.last_start?,
            goal: self.last_goal?,
            signature: self.last_signature?,
        })
    }

    fn can_replan_now(&self, tick: u64) -> bool {
        let min = self.config.min_replan_interval_ticks as u64;
        match self.last_planned_tick {
            None => true,
            Some(last) => tick.saturating_sub(last) >= min,
        }
    }

    fn would_exceed_budget(&self, key: GoapPlanKey) -> bool {
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

    fn note_plan_start(&mut self, key: GoapPlanKey, tick: u64) -> bool {
        let Some(max) = self.config.max_plan_starts_per_key else {
            self.plan_starts = self.plan_starts.saturating_add(1);
            self.last_planned_tick = Some(tick);
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
        self.pending_replan = false;
        true
    }

    fn get_or_plan(
        &mut self,
        start: GoapState,
        goal: GoapState,
        signature: u64,
        ctx: &TickContext,
        blackboard: &mut Blackboard,
    ) -> Option<PlanSpec<F::Spec>> {
        if let Some(entry) = self.cache.as_ref() {
            if entry.start == start && entry.goal == goal && entry.signature == signature {
                return entry.plan.clone();
            }
        }

        self.plan_calls = self.plan_calls.saturating_add(1);
        trace_emit(
            blackboard,
            TraceEvent::new(ctx.tick, "goap.plan.call")
                .with_a(start)
                .with_b(goal),
        );
        let plan = self.planner.plan(start, goal);
        trace_emit(
            blackboard,
            TraceEvent::new(ctx.tick, "goap.plan.result")
                .with_a(plan.as_ref().map(|p| p.len()).unwrap_or(0) as u64)
                .with_b(signature),
        );
        self.cache = Some(PlanCacheEntry {
            start,
            goal,
            signature,
            plan: plan.clone(),
        });
        plan
    }

    #[cfg(feature = "bt")]
    pub fn reset(&mut self) {
        self.last_start = None;
        self.last_signature = None;
        self.last_goal = None;
        self.last_planned_tick = None;
        self.pending_replan = true;
        self.cache = None;
        self.starts_for_key = 0;
        self.last_started_key = None;
        self.last_outcome = None;
    }

    pub fn drive(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        blackboard: &mut Blackboard,
        actions: &mut ActionRuntime<W>,
    ) -> GoapPlanDriveStatus {
        let finished = actions.take_just_finished(self.key);
        if let Some(outcome) = finished {
            self.last_outcome = Some(outcome);
            trace_emit(
                blackboard,
                TraceEvent::new(
                    ctx.tick,
                    match outcome {
                        ActionOutcome::Success => "goap.plan.outcome.success",
                        ActionOutcome::Failure => "goap.plan.outcome.failure",
                    },
                )
                .with_a(self.last_start.unwrap_or(0))
                .with_b(self.last_goal.unwrap_or(0)),
            );
            if matches!(outcome, ActionOutcome::Failure) {
                self.cache = None;
                self.pending_replan = true;
            }
        }

        let world_view: &W = &*world;

        let start = (self.state_fn)(ctx, agent, world_view, &*blackboard);
        let goal = (self.goal_fn)(ctx, agent, world_view, &*blackboard);
        let signature = (self.signature_fn)(ctx, agent, world_view, &*blackboard);
        self.last_start = Some(start);

        // Goal already satisfied -> don't request a plan (preemption cancels any running plan).
        if (start & goal) == goal {
            self.pending_replan = false;
            self.cache = None;
            self.last_signature = Some(signature);
            self.last_goal = Some(goal);
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "goap.done")
                    .with_a(start)
                    .with_b(goal),
            );
            return GoapPlanDriveStatus::Success;
        }

        if matches!(finished, Some(ActionOutcome::Success)) {
            // Runtime plan reported success, but the GOAP goal is still unmet -> treat as "no
            // progress" and force a replan. This clears the plan cache to avoid repeating the same
            // stale plan indefinitely.
            self.cache = None;
            self.pending_replan = true;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "goap.no_progress")
                    .with_a(start)
                    .with_b(goal),
            );
        }

        let signature_changed = self
            .last_signature
            .map(|prev| prev != signature)
            .unwrap_or(false);
        let goal_changed = self.last_goal.map(|prev| prev != goal).unwrap_or(false);

        if signature_changed || goal_changed {
            self.pending_replan = true;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "goap.invalidated")
                    .with_a(signature)
                    .with_b(goal),
            );
        }

        self.last_signature = Some(signature);
        self.last_goal = Some(goal);

        let key = self.key;
        let running = actions.is_running(key);

        if running && self.pending_replan && self.can_replan_now(ctx.tick) {
            let start_key = GoapPlanKey {
                start,
                goal,
                signature,
            };

            if self.would_exceed_budget(start_key) {
                self.pending_replan = false;
                self.cache = None;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "goap.budget_exhausted")
                        .with_a(signature)
                        .with_b(goal),
                );
                return GoapPlanDriveStatus::Failure;
            }

            if let Some(plan) = self.get_or_plan(start, goal, signature, ctx, blackboard) {
                let plan_len = plan.len();
                if !self.note_plan_start(start_key, ctx.tick) {
                    self.cache = None;
                    trace_emit(
                        blackboard,
                        TraceEvent::new(ctx.tick, "goap.budget_exhausted")
                            .with_a(signature)
                            .with_b(goal),
                    );
                    return GoapPlanDriveStatus::Failure;
                }
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "goap.plan.restart")
                        .with_a(plan_len as u64)
                        .with_b(signature),
                );
                let factory = self.factory.clone();
                actions.replace_current_with(
                    key,
                    move |_ctx, _agent, _world, _bb| {
                        Box::new(PlanExecutorAction::new(plan, factory))
                    },
                    ctx,
                    agent,
                    world,
                    blackboard,
                );
                return GoapPlanDriveStatus::Running;
            }
        }

        if !running {
            if self.pending_replan && !self.can_replan_now(ctx.tick) {
                return GoapPlanDriveStatus::Running;
            }

            let start_key = GoapPlanKey {
                start,
                goal,
                signature,
            };

            if self.would_exceed_budget(start_key) {
                self.pending_replan = false;
                self.cache = None;
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "goap.budget_exhausted")
                        .with_a(signature)
                        .with_b(goal),
                );
                return GoapPlanDriveStatus::Failure;
            }

            if let Some(plan) = self.get_or_plan(start, goal, signature, ctx, blackboard) {
                let plan_len = plan.len();
                if !self.note_plan_start(start_key, ctx.tick) {
                    self.cache = None;
                    trace_emit(
                        blackboard,
                        TraceEvent::new(ctx.tick, "goap.budget_exhausted")
                            .with_a(signature)
                            .with_b(goal),
                    );
                    return GoapPlanDriveStatus::Failure;
                }
                trace_emit(
                    blackboard,
                    TraceEvent::new(ctx.tick, "goap.plan.start")
                        .with_a(plan_len as u64)
                        .with_b(signature),
                );
                let factory = self.factory.clone();
                actions.ensure_current(
                    key,
                    move |_ctx, _agent, _world, _bb| {
                        Box::new(PlanExecutorAction::new(plan, factory))
                    },
                    ctx,
                    agent,
                    world,
                    blackboard,
                );
                return GoapPlanDriveStatus::Running;
            }

            // No plan available; rely on signature/goal changes to trigger another attempt.
            self.pending_replan = false;
            trace_emit(
                blackboard,
                TraceEvent::new(ctx.tick, "goap.plan.none")
                    .with_a(signature)
                    .with_b(goal),
            );
            return GoapPlanDriveStatus::Failure;
        }

        // Keep the current plan requested to avoid preemption.
        actions.ensure_current(
            key,
            |_ctx, _agent, _world, _bb| unreachable!("unexpected plan restart"),
            ctx,
            agent,
            world,
            blackboard,
        );

        GoapPlanDriveStatus::Running
    }
}

/// A small `ai-core::Policy` wrapper that:
/// - Plans with `GoapPlanner` only when needed (plan cache).
/// - Runs the resulting `PlanSpec` via `PlanExecutorAction`.
/// - Replans on explicit invalidation (signature changes) using `replace_current_with`.
/// - Optionally throttles replanning to avoid cancel/restart thrash.
/// - Treats `ActionOutcome::Success` with an unmet goal as "no progress": clears the plan cache and
///   forces a replan to avoid repeating a stale plan indefinitely.
pub struct GoapPlanPolicy<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    driver: GoapPlanDriver<W, F>,
}

impl<W, F> GoapPlanPolicy<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    pub fn new(
        planner: GoapPlanner<F::Spec>,
        factory: F,
        state_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> GoapState + 'static,
        goal_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> GoapState + 'static,
    ) -> Self {
        Self {
            driver: GoapPlanDriver::new(planner, factory, state_fn, goal_fn),
        }
    }

    pub fn with_key(mut self, key: ActionKey) -> Self {
        self.driver = self.driver.with_key(key);
        self
    }

    pub fn with_config(mut self, config: GoapPlanPolicyConfig) -> Self {
        self.driver = self.driver.with_config(config);
        self
    }

    pub fn with_signature(
        mut self,
        signature_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> u64 + 'static,
    ) -> Self {
        self.driver = self.driver.with_signature(signature_fn);
        self
    }

    pub fn cached_plan(&self) -> Option<&PlanSpec<F::Spec>> {
        self.driver.cached_plan()
    }

    pub fn cached_plan_len(&self) -> Option<usize> {
        self.driver.cached_plan_len()
    }

    /// Number of times the underlying `GoapPlanner` was invoked (cache misses).
    pub fn plan_calls(&self) -> u64 {
        self.driver.plan_calls()
    }

    pub fn plan_starts(&self) -> u64 {
        self.driver.plan_starts()
    }

    pub fn last_outcome(&self) -> Option<ActionOutcome> {
        self.driver.last_outcome()
    }

    pub fn last_start(&self) -> Option<GoapState> {
        self.driver.last_start()
    }

    pub fn last_goal(&self) -> Option<GoapState> {
        self.driver.last_goal()
    }

    pub fn last_signature(&self) -> Option<u64> {
        self.driver.last_signature()
    }

    pub fn last_plan_key(&self) -> Option<GoapPlanKey> {
        self.driver.last_plan_key()
    }
}

impl<W, F> Policy<W> for GoapPlanPolicy<W, F>
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
    ) {
        let _ = self
            .driver
            .drive(ctx, agent, world, blackboard, actions);
    }
}
