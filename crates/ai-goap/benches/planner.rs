use ai_goap::{GoapAction, GoapPlanner, GoapState};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

#[derive(Debug, Clone)]
struct Spec;

fn toy_planner(bits: u32) -> (GoapPlanner<Spec>, GoapState, GoapState) {
    let mut actions = Vec::with_capacity(bits as usize);
    for i in 0..bits {
        let bit = 1u64 << i;
        actions.push(GoapAction {
            name: "set_bit",
            cost: 1,
            preconditions: 0,
            add: bit,
            remove: 0,
            spec: Spec,
        });
    }

    let planner = GoapPlanner::new(actions);
    let start = 0;
    let goal = if bits >= 64 { GoapState::MAX } else { (1u64 << bits) - 1 };
    (planner, start, goal)
}

fn bench_goap_planner(c: &mut Criterion) {
    let (planner, start, goal) = toy_planner(12);

    c.bench_function("ai-goap/planner.plan(bits=12)", |b| {
        b.iter(|| {
            let plan = planner.plan(start, goal).expect("plan");
            black_box(plan.steps.len());
        })
    });
}

criterion_group!(benches, bench_goap_planner);
criterion_main!(benches);
