use ai_crowd::{Crowd, CrowdAgent, CrowdConfig};
use ai_nav::Vec2;

fn make_agents() -> Vec<CrowdAgent> {
    let mut a = CrowdAgent::new(1, Vec2::new(0.0, 0.0));
    a.preferred_velocity = Vec2::new(1.0, 0.0);
    a.max_speed = 10.0;

    let mut b = CrowdAgent::new(2, Vec2::new(0.25, 0.0));
    b.preferred_velocity = Vec2::new(1.0, 0.0);
    b.max_speed = 10.0;

    vec![a, b]
}

#[test]
fn crowd_is_deterministic_for_same_inputs() {
    let config = CrowdConfig {
        neighbor_radius: 2.0,
        separation_weight: 2.0,
        max_accel: f32::INFINITY,
    };

    let mut crowd_a = Crowd::new(config);
    let mut crowd_b = Crowd::new(config);
    let mut agents_a = make_agents();
    let mut agents_b = make_agents();

    for _ in 0..20 {
        crowd_a.step(0.1, &mut agents_a);
        crowd_b.step(0.1, &mut agents_b);
    }

    assert_eq!(agents_a, agents_b);
}

#[test]
fn crowd_is_order_invariant_to_agent_slice_order() {
    let config = CrowdConfig {
        neighbor_radius: 2.0,
        separation_weight: 2.0,
        max_accel: f32::INFINITY,
    };

    let mut agents_a = vec![
        CrowdAgent {
            id: 1,
            position: Vec2::new(0.0, 0.0),
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::new(1.0, 0.0),
            radius: 0.5,
            max_speed: 10.0,
        },
        CrowdAgent {
            id: 2,
            position: Vec2::new(0.25, 0.0),
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::new(1.0, 0.0),
            radius: 0.5,
            max_speed: 10.0,
        },
        CrowdAgent {
            id: 3,
            position: Vec2::new(0.0, 0.25),
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::new(0.0, 1.0),
            radius: 0.5,
            max_speed: 10.0,
        },
        CrowdAgent {
            id: 4,
            position: Vec2::new(3.0, 3.0),
            velocity: Vec2::ZERO,
            preferred_velocity: Vec2::new(-1.0, 0.0),
            radius: 0.5,
            max_speed: 10.0,
        },
    ];
    let mut agents_b = agents_a.clone();
    agents_b.reverse();

    let mut crowd_a = Crowd::new(config);
    let mut crowd_b = Crowd::new(config);

    for _ in 0..20 {
        crowd_a.step(0.1, &mut agents_a);
        crowd_b.step(0.1, &mut agents_b);
    }

    agents_a.sort_by_key(|a| a.id);
    agents_b.sort_by_key(|a| a.id);

    assert_eq!(agents_a, agents_b);
}

#[test]
fn step_velocities_does_not_move_positions() {
    let config = CrowdConfig {
        neighbor_radius: 2.0,
        separation_weight: 1.0,
        max_accel: f32::INFINITY,
    };

    let mut crowd = Crowd::new(config);
    let mut agents = make_agents();
    let before = agents.iter().map(|a| a.position).collect::<Vec<_>>();

    crowd.step_velocities(0.1, &mut agents);

    let after = agents.iter().map(|a| a.position).collect::<Vec<_>>();
    assert_eq!(before, after);
    assert_ne!(agents[0].velocity, Vec2::ZERO);
}

#[test]
fn accel_limit_clamps_velocity_change() {
    let config = CrowdConfig {
        neighbor_radius: 1.0,
        separation_weight: 0.0,
        max_accel: 1.0,
    };
    let mut crowd = Crowd::new(config);

    let mut agent = CrowdAgent::new(1, Vec2::new(0.0, 0.0));
    agent.velocity = Vec2::ZERO;
    agent.preferred_velocity = Vec2::new(10.0, 0.0);
    agent.max_speed = 100.0;

    let mut agents = vec![agent];
    crowd.step_velocities(0.5, &mut agents);

    assert!((agents[0].velocity.x - 0.5).abs() <= 1e-6);
    assert!((agents[0].velocity.y).abs() <= 1e-6);
}
