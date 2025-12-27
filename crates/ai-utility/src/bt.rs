use ai_bt::{BtNode, BtStatus};
use ai_core::{ActionOutcome, ActionRuntime, Blackboard, TickContext, WorldMut};

use crate::{UtilityOption, UtilityPolicyConfig};

/// Utility selector as a BT leaf node.
///
/// Each tick:
/// - Scores all options (stable tie-break by option order).
/// - Requests the highest-scoring option's action via `ActionRuntime`.
/// - Returns `Running` while the chosen action is running.
/// - Returns `Success` / `Failure` when the action finishes.
/// - Returns `Failure` when no option clears `min_score` (allowing BT fallbacks).
pub struct UtilityNode<W>
where
    W: WorldMut + 'static,
{
    options: Vec<UtilityOption<W>>,
    config: UtilityPolicyConfig,
    last_choice: Option<ai_core::ActionKey>,
    last_best_score: f32,
}

impl<W> UtilityNode<W>
where
    W: WorldMut + 'static,
{
    pub fn new(options: Vec<UtilityOption<W>>) -> Self {
        Self {
            options,
            config: UtilityPolicyConfig::default(),
            last_choice: None,
            last_best_score: f32::NEG_INFINITY,
        }
    }

    pub fn with_config(mut self, config: UtilityPolicyConfig) -> Self {
        self.config = config;
        self
    }

    pub fn last_choice(&self) -> Option<ai_core::ActionKey> {
        self.last_choice
    }

    pub fn last_best_score(&self) -> f32 {
        self.last_best_score
    }
}

impl<W> BtNode<W> for UtilityNode<W>
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
        // Check if the currently-running action just finished.
        for opt in self.options.iter_mut() {
            if let Some(outcome) = actions.take_just_finished(opt.key) {
                self.last_choice = None;
                return match outcome {
                    ActionOutcome::Success => BtStatus::Success,
                    ActionOutcome::Failure => BtStatus::Failure,
                };
            }
        }

        let world_view: &W = &*world;
        let bb_view: &Blackboard = &*blackboard;

        let mut best_idx: Option<usize> = None;
        let mut best_score = f32::NEG_INFINITY;

        for (i, opt) in self.options.iter_mut().enumerate() {
            let score = opt.score(ctx, agent, world_view, bb_view);
            if score > best_score {
                best_score = score;
                best_idx = Some(i);
            }
        }

        self.last_best_score = best_score;

        let Some(best_idx) = best_idx else {
            self.last_choice = None;
            return BtStatus::Failure;
        };

        if best_score < self.config.min_score {
            self.last_choice = None;
            return BtStatus::Failure;
        }

        let opt = &mut self.options[best_idx];
        self.last_choice = Some(opt.key);

        let make = &mut opt.make_fn;
        actions.ensure_current(
            opt.key,
            |ctx, agent, world, bb| make(ctx, agent, world, bb),
            ctx,
            agent,
            world,
            blackboard,
        );

        BtStatus::Running
    }

    fn reset(&mut self) {
        self.last_choice = None;
        self.last_best_score = f32::NEG_INFINITY;
    }
}

