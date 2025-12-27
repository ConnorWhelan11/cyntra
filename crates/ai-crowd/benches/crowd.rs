use ai_crowd::{Crowd, CrowdAgent, CrowdConfig};
use ai_nav::Vec2;
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn make_agents(count: usize, spacing: f32) -> Vec<CrowdAgent> {
    let side = (count as f32).sqrt().ceil() as usize;
    let mut agents = Vec::with_capacity(count);
    for i in 0..count {
        let x = (i % side) as f32 * spacing;
        let y = (i / side) as f32 * spacing;
        let mut agent = CrowdAgent::new(i as u64, Vec2::new(x, y));
        agent.preferred_velocity = Vec2::new(1.0, 0.0);
        agent.max_speed = 4.0;
        agent.radius = 0.5;
        agents.push(agent);
    }
    agents
}

fn bench_crowd(c: &mut Criterion) {
    let config = CrowdConfig {
        neighbor_radius: 2.0,
        separation_weight: 1.0,
        max_accel: 10.0,
    };
    let dt = 0.1;

    let mut group = c.benchmark_group("ai-crowd/step_velocities");

    for &n in &[1_000usize, 10_000usize] {
        let mut crowd = Crowd::new(config);
        let mut agents = make_agents(n, 1.0);
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &_n| {
            b.iter(|| {
                crowd.step_velocities(dt, &mut agents);
                black_box(agents[0].velocity);
            })
        });
    }

    group.finish();
}

criterion_group!(benches, bench_crowd);
criterion_main!(benches);

