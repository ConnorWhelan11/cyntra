use ai_bt::{BtNode, BtStatus};
use ai_core::{ActionFactory, ActionKey, Blackboard, PlanSpec, TickContext, WorldMut};

use crate::policy::{GoapPlanDriveStatus, GoapPlanDriver, GoapPlanPolicyConfig};
use crate::{GoapPlanner, GoapState};

/// A Behavior Tree node that runs a GOAP plan as an `ai-core` action (`PlanExecutorAction`).
///
/// - Plans are cached until invalidated.
/// - Invalidation is driven by an explicit signature function (and goal changes).
/// - Replanning while running uses `ActionRuntime::replace_current_with` to restart the plan under
///   the same `ActionKey`.
/// - A plan action `Success` while the GOAP goal is still unmet is treated as "no progress" and
///   forces a replan (cache is cleared).
pub struct GoapPlanNode<W, F>
where
    W: WorldMut + 'static,
    F: ActionFactory<W> + Clone,
{
    driver: GoapPlanDriver<W, F>,
}

impl<W, F> GoapPlanNode<W, F>
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

    pub fn plan_calls(&self) -> u64 {
        self.driver.plan_calls()
    }

    pub fn plan_starts(&self) -> u64 {
        self.driver.plan_starts()
    }

    pub fn last_outcome(&self) -> Option<ai_core::ActionOutcome> {
        self.driver.last_outcome()
    }

    pub fn last_plan_key(&self) -> Option<crate::GoapPlanKey> {
        self.driver.last_plan_key()
    }
}

impl<W, F> BtNode<W> for GoapPlanNode<W, F>
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
        actions: &mut ai_core::ActionRuntime<W>,
    ) -> BtStatus {
        match self
            .driver
            .drive(ctx, agent, world, blackboard, actions)
        {
            GoapPlanDriveStatus::Success => BtStatus::Success,
            GoapPlanDriveStatus::Running => BtStatus::Running,
            GoapPlanDriveStatus::Failure => BtStatus::Failure,
        }
    }

    fn reset(&mut self) {
        self.driver.reset();
    }
}
