//! Deterministic HTN planning primitives.
//!
//! The planner decomposes a list of tasks into a linear `ai-core::PlanSpec`.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

use std::collections::BTreeMap;

use ai_core::PlanSpec;

pub mod policy;

pub use policy::{HtnPlanPolicy, HtnPlanPolicyConfig};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CompoundTask(pub &'static str);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct OperatorId(pub &'static str);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Task {
    Compound(CompoundTask),
    Primitive(OperatorId),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HtnPlannerConfig {
    /// Max number of task expansions before giving up (loop protection).
    pub max_expansions: usize,
}

impl Default for HtnPlannerConfig {
    fn default() -> Self {
        Self { max_expansions: 1024 }
    }
}

pub struct Operator<S, P> {
    pub name: &'static str,
    pub spec: S,
    pub is_applicable: fn(&P) -> bool,
    pub apply: fn(&mut P),
}

pub struct Method<P> {
    pub name: &'static str,
    pub precondition: fn(&P) -> bool,
    pub subtasks: Vec<Task>,
}

pub struct HtnDomain<S, P> {
    operators: BTreeMap<OperatorId, Operator<S, P>>,
    methods: BTreeMap<CompoundTask, Vec<Method<P>>>,
}

impl<S, P> Default for HtnDomain<S, P> {
    fn default() -> Self {
        Self {
            operators: BTreeMap::new(),
            methods: BTreeMap::new(),
        }
    }
}

impl<S, P> HtnDomain<S, P> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_operator(&mut self, id: OperatorId, operator: Operator<S, P>) {
        self.operators.insert(id, operator);
    }

    pub fn add_method(&mut self, task: CompoundTask, method: Method<P>) {
        self.methods.entry(task).or_default().push(method);
    }
}

pub struct HtnPlanner<S, P> {
    domain: HtnDomain<S, P>,
    config: HtnPlannerConfig,
}

impl<S, P> HtnPlanner<S, P>
where
    S: Clone,
    P: Clone,
{
    pub fn new(domain: HtnDomain<S, P>) -> Self {
        Self {
            domain,
            config: HtnPlannerConfig::default(),
        }
    }

    pub fn with_config(mut self, config: HtnPlannerConfig) -> Self {
        self.config = config;
        self
    }

    pub fn plan(&self, start: &P, root: &[Task]) -> Option<PlanSpec<S>> {
        let mut state = start.clone();

        let mut stack: Vec<Task> = Vec::with_capacity(root.len());
        for t in root.iter().rev().copied() {
            stack.push(t);
        }

        let mut expansions: usize = 0;
        let mut out: Vec<S> = Vec::new();

        while let Some(task) = stack.pop() {
            expansions = expansions.saturating_add(1);
            if expansions > self.config.max_expansions {
                return None;
            }

            match task {
                Task::Primitive(op) => {
                    let operator = self.domain.operators.get(&op)?;
                    if !(operator.is_applicable)(&state) {
                        return None;
                    }
                    (operator.apply)(&mut state);
                    out.push(operator.spec.clone());
                }
                Task::Compound(ct) => {
                    let methods = self.domain.methods.get(&ct)?;
                    let mut chosen: Option<&Method<P>> = None;
                    for m in methods.iter() {
                        if (m.precondition)(&state) {
                            chosen = Some(m);
                            break;
                        }
                    }
                    let method = chosen?;
                    for sub in method.subtasks.iter().rev().copied() {
                        stack.push(sub);
                    }
                }
            }
        }

        Some(PlanSpec::new(out))
    }
}
