use ai_core::{Action, ActionKey, ActionRuntime, Blackboard, Policy, TickContext, WorldMut};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UtilityPolicyConfig {
    /// Minimum score required to select an option.
    ///
    /// If all options are below this threshold, the policy requests no action (allowing fallbacks
    /// in higher-level control flow).
    pub min_score: f32,
}

impl Default for UtilityPolicyConfig {
    fn default() -> Self {
        Self { min_score: 0.0 }
    }
}

pub struct UtilityOption<W>
where
    W: WorldMut + 'static,
{
    pub key: ActionKey,
    pub(crate) score_fn: Box<dyn FnMut(&TickContext, W::Agent, &W, &Blackboard) -> f32>,
    pub(crate) make_fn:
        Box<dyn FnMut(&TickContext, W::Agent, &mut W, &mut Blackboard) -> Box<dyn Action<W>>>,
}

impl<W> UtilityOption<W>
where
    W: WorldMut + 'static,
{
    pub fn new(
        key: ActionKey,
        score_fn: impl FnMut(&TickContext, W::Agent, &W, &Blackboard) -> f32 + 'static,
        make_fn: impl FnMut(&TickContext, W::Agent, &mut W, &mut Blackboard) -> Box<dyn Action<W>>
            + 'static,
    ) -> Self {
        Self {
            key,
            score_fn: Box::new(score_fn),
            make_fn: Box::new(make_fn),
        }
    }

    pub(crate) fn score(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &W,
        bb: &Blackboard,
    ) -> f32 {
        let s = (self.score_fn)(ctx, agent, world, bb);
        if s.is_nan() { f32::NEG_INFINITY } else { s }
    }
}

pub struct UtilityPolicy<W>
where
    W: WorldMut + 'static,
{
    options: Vec<UtilityOption<W>>,
    config: UtilityPolicyConfig,
    last_choice: Option<ActionKey>,
    last_best_score: f32,
}

impl<W> UtilityPolicy<W>
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

    pub fn last_choice(&self) -> Option<ActionKey> {
        self.last_choice
    }

    pub fn last_best_score(&self) -> f32 {
        self.last_best_score
    }
}

impl<W> Policy<W> for UtilityPolicy<W>
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
            return;
        };

        if best_score < self.config.min_score {
            self.last_choice = None;
            return;
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
    }
}
