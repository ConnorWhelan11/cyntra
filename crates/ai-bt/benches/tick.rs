use ai_bt::{BtPolicy, Condition, ReactiveSequence};
use ai_core::{Blackboard, Brain, TickContext, WorldMut, WorldView};
use criterion::{black_box, criterion_group, criterion_main, Criterion};

#[derive(Default)]
struct World;

impl WorldView for World {
    type Agent = u64;
}

impl WorldMut for World {}

fn always_true(_ctx: &TickContext, _agent: u64, _world: &World, _bb: &Blackboard) -> bool {
    true
}

fn bench_bt_tick(c: &mut Criterion) {
    let agent = 1u64;

    let conditions = (0..32)
        .map(|_| Box::new(Condition::new(always_true)) as Box<dyn ai_bt::BtNode<World>>)
        .collect::<Vec<_>>();

    let root = ReactiveSequence::new(conditions);
    let policy = Box::new(BtPolicy::new(Box::new(root)));
    let mut brain = Brain::new(agent, policy);
    let mut world = World::default();

    let mut tick: u64 = 0;
    c.bench_function("ai-bt/tick(conditions=32)", |b| {
        b.iter(|| {
            let ctx = TickContext {
                tick,
                dt_seconds: 0.1,
                seed: 0,
            };
            brain.tick(&ctx, &mut world);
            black_box(brain.actions.current_key());
            tick = tick.wrapping_add(1);
        })
    });
}

criterion_group!(benches, bench_bt_tick);
criterion_main!(benches);

