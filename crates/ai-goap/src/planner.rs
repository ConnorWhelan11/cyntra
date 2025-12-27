use core::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap};

use ai_core::PlanSpec;

pub type GoapState = u64;

#[derive(Debug, Clone)]
pub struct GoapAction<S> {
    pub name: &'static str,
    pub cost: u32,
    pub preconditions: GoapState,
    pub add: GoapState,
    pub remove: GoapState,
    pub spec: S,
}

impl<S> GoapAction<S> {
    pub fn is_applicable(&self, state: GoapState) -> bool {
        (state & self.preconditions) == self.preconditions
    }

    pub fn apply(&self, state: GoapState) -> GoapState {
        (state | self.add) & !self.remove
    }
}

#[derive(Debug, Clone, Copy)]
pub struct GoapPlannerConfig {
    pub max_expansions: usize,
}

impl Default for GoapPlannerConfig {
    fn default() -> Self {
        Self { max_expansions: 4096 }
    }
}

#[derive(Debug, Clone)]
pub struct GoapPlanner<S> {
    actions: Vec<GoapAction<S>>,
    config: GoapPlannerConfig,
}

impl<S> GoapPlanner<S>
where
    S: Clone + 'static,
{
    pub fn new(actions: Vec<GoapAction<S>>) -> Self {
        Self {
            actions,
            config: GoapPlannerConfig::default(),
        }
    }

    pub fn with_config(mut self, config: GoapPlannerConfig) -> Self {
        self.config = config;
        self
    }

    pub fn actions(&self) -> &[GoapAction<S>] {
        &self.actions
    }

    pub fn plan(&self, start: GoapState, goal: GoapState) -> Option<PlanSpec<S>> {
        if (start & goal) == goal {
            return Some(PlanSpec::new(vec![]));
        }

        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        struct OpenNode {
            f: u32,
            g: u32,
            state: GoapState,
            tie: u64,
        }

        impl OpenNode {
            fn key(&self) -> (u32, u32, GoapState, u64) {
                (self.f, self.g, self.state, self.tie)
            }
        }

        impl Ord for OpenNode {
            fn cmp(&self, other: &Self) -> Ordering {
                // Reverse ordering to make BinaryHeap behave like a min-heap.
                other.key().cmp(&self.key())
            }
        }

        impl PartialOrd for OpenNode {
            fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
                Some(self.cmp(other))
            }
        }

        // Heuristic: number of missing goal bits.
        let h = |state: GoapState| -> u32 {
            let missing = goal & !state;
            missing.count_ones()
        };

        let mut open = BinaryHeap::<OpenNode>::new();
        let mut tie: u64 = 0;

        let mut g_score: BTreeMap<GoapState, u32> = BTreeMap::new();
        let mut came_from: BTreeMap<GoapState, (GoapState, usize)> = BTreeMap::new();

        g_score.insert(start, 0);
        open.push(OpenNode {
            f: h(start),
            g: 0,
            state: start,
            tie,
        });
        tie += 1;

        let mut expansions: usize = 0;

        while let Some(node) = open.pop() {
            expansions += 1;
            if expansions > self.config.max_expansions {
                return None;
            }

            if (node.state & goal) == goal {
                // Reconstruct specs by walking came_from.
                let mut specs: Vec<S> = Vec::new();
                let mut current = node.state;
                while let Some((prev, action_idx)) = came_from.get(&current).copied() {
                    specs.push(self.actions[action_idx].spec.clone());
                    current = prev;
                }
                specs.reverse();
                return Some(PlanSpec::new(specs));
            }

            let best_g = g_score.get(&node.state).copied().unwrap_or(u32::MAX);
            if node.g != best_g {
                continue; // stale heap entry
            }

            for (action_idx, action) in self.actions.iter().enumerate() {
                if !action.is_applicable(node.state) {
                    continue;
                }
                let next = action.apply(node.state);
                if next == node.state {
                    continue;
                }

                let next_g = node.g.saturating_add(action.cost);
                let prev_best = g_score.get(&next).copied().unwrap_or(u32::MAX);
                if next_g >= prev_best {
                    continue;
                }

                g_score.insert(next, next_g);
                came_from.insert(next, (node.state, action_idx));

                open.push(OpenNode {
                    f: next_g.saturating_add(h(next)),
                    g: next_g,
                    state: next,
                    tie,
                });
                tie += 1;
            }
        }

        None
    }
}

