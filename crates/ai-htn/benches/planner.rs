use ai_htn::{CompoundTask, HtnDomain, HtnPlanner, Method, Operator, OperatorId, Task};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

#[derive(Debug, Clone)]
struct Spec;

const ROOT: CompoundTask = CompoundTask("root");
const OP_STEP: OperatorId = OperatorId("step");

fn always(_s: &u64) -> bool {
    true
}

fn apply_noop(_s: &mut u64) {}

fn build_planner(steps: usize) -> (HtnPlanner<Spec, u64>, u64, Vec<Task>) {
    let mut domain = HtnDomain::new();
    domain.add_operator(
        OP_STEP,
        Operator {
            name: "step",
            spec: Spec,
            is_applicable: always,
            apply: apply_noop,
        },
    );
    domain.add_method(
        ROOT,
        Method {
            name: "many_steps",
            precondition: always,
            subtasks: (0..steps).map(|_| Task::Primitive(OP_STEP)).collect(),
        },
    );

    (HtnPlanner::new(domain), 0u64, vec![Task::Compound(ROOT)])
}

fn bench_htn_planner(c: &mut Criterion) {
    let (planner, start, root) = build_planner(256);

    c.bench_function("ai-htn/planner.plan(steps=256)", |b| {
        b.iter(|| {
            let plan = planner.plan(&start, &root).expect("plan");
            black_box(plan.len());
        })
    });
}

criterion_group!(benches, bench_htn_planner);
criterion_main!(benches);

