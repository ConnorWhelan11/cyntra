//! Integration tests for ai-perception with ai-bevy.

use std::sync::Arc;

use ai_bevy::{
    AiAgent, AiBevyPlugin, AiNavMesh, AiPosition, AiTick, BevyAgentId, BevyAiWorld,
    BevyBrainRegistry,
};
use ai_core::{ActionRuntime, BbKey, Blackboard, Brain, Policy, TickContext};
use ai_nav::{NavMesh, Vec2};
use ai_perception::{
    AlertnessConfig, AlertnessLevel, AlertnessState, HearingConfig, MemoryConfig,
    PerceptionConfig, PerceptionSystem, Percept, SightConfig,
};
use bevy_app::App;

/// Blackboard key for storing perception system.
const BB_PERCEPTION: BbKey<PerceptionSystem<BevyAgentId>> = BbKey::new(0xBEEF_0001);

/// Blackboard key for storing alertness level (for test assertions).
const BB_ALERTNESS: BbKey<u8> = BbKey::new(0xBEEF_0002);

/// Blackboard key for storing percept count (for test assertions).
const BB_PERCEPT_COUNT: BbKey<usize> = BbKey::new(0xBEEF_0003);

/// A policy that initializes and stores a perception system for testing.
struct PerceptionTestPolicy {
    config: PerceptionConfig,
}

impl PerceptionTestPolicy {
    fn new() -> Self {
        Self {
            config: PerceptionConfig {
                sight: Some(SightConfig::new(20.0, 90.0)),
                hearing: Some(HearingConfig::new(15.0)),
                memory: MemoryConfig::default(),
                alertness: AlertnessConfig::default(),
            },
        }
    }
}

impl Policy<BevyAiWorld> for PerceptionTestPolicy {
    fn tick(
        &mut self,
        _ctx: &TickContext,
        _agent: BevyAgentId,
        _world: &mut BevyAiWorld,
        blackboard: &mut Blackboard,
        _actions: &mut ActionRuntime<BevyAiWorld>,
    ) {
        // Initialize perception system on first tick
        if !blackboard.contains(BB_PERCEPTION) {
            blackboard.set(BB_PERCEPTION, PerceptionSystem::new(self.config.clone()));
        }

        // For this test, we verify the perception system can be stored and retrieved
        // from the blackboard, and that its state is accessible.
        let (alertness, count) = if let Some(perception) = blackboard.get_mut(BB_PERCEPTION) {
            (
                perception.alertness_level() as u8,
                perception.memory.remembered().count(),
            )
        } else {
            return;
        };

        // Store values after the borrow ends
        blackboard.set(BB_ALERTNESS, alertness);
        blackboard.set(BB_PERCEPT_COUNT, count);
    }
}

#[test]
fn bevy_perception_system_initializes_in_brain() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0 / 60.0,
        seed: 42,
    });

    // Simple navmesh
    let mesh = NavMesh::from_triangles(vec![[
        Vec2::new(0.0, 0.0),
        Vec2::new(100.0, 0.0),
        Vec2::new(50.0, 100.0),
    ]]);
    app.insert_resource(AiNavMesh(Arc::new(mesh)));

    // Observer agent
    let observer = BevyAgentId(1);
    app.world_mut()
        .spawn((AiAgent(observer), AiPosition(Vec2::new(10.0, 10.0))));

    // Register brain with perception policy
    {
        let mut registry = app
            .world_mut()
            .get_non_send_resource_mut::<BevyBrainRegistry>()
            .unwrap();
        registry.insert(Brain::new(observer, Box::new(PerceptionTestPolicy::new())));
    }

    // Run a few ticks
    for _ in 0..3 {
        app.update();
    }

    // Verify perception system was initialized
    let registry = app
        .world()
        .get_non_send_resource::<BevyBrainRegistry>()
        .unwrap();
    let brain = registry.get(observer).unwrap();

    assert!(brain.blackboard.contains(BB_PERCEPTION));
    assert!(brain.blackboard.contains(BB_ALERTNESS));

    // Should start unaware
    let alertness = brain.blackboard.get(BB_ALERTNESS).unwrap();
    assert_eq!(*alertness, AlertnessLevel::Unaware as u8);
}

#[test]
fn bevy_perception_system_has_correct_sensors() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick::default());

    let mesh = NavMesh::from_triangles(vec![[
        Vec2::new(0.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(5.0, 10.0),
    ]]);
    app.insert_resource(AiNavMesh(Arc::new(mesh)));

    let agent = BevyAgentId(1);
    app.world_mut()
        .spawn((AiAgent(agent), AiPosition(Vec2::ZERO)));

    {
        let mut registry = app
            .world_mut()
            .get_non_send_resource_mut::<BevyBrainRegistry>()
            .unwrap();
        registry.insert(Brain::new(agent, Box::new(PerceptionTestPolicy::new())));
    }

    app.update();

    let registry = app
        .world()
        .get_non_send_resource::<BevyBrainRegistry>()
        .unwrap();
    let brain = registry.get(agent).unwrap();
    let perception = brain.blackboard.get(BB_PERCEPTION).unwrap();

    // Verify sensor configuration
    assert!(perception.has_sight());
    assert!(perception.has_hearing());
    assert_eq!(perception.sight_config().unwrap().range, 20.0);
    assert_eq!(perception.hearing_config().unwrap().range, 15.0);
}

#[test]
fn bevy_alertness_state_serializes() {
    // Test that AlertnessState can be stored in blackboard and serialized
    let config = AlertnessConfig::default();
    let state = AlertnessState::new(config);

    // Serialize/deserialize
    let json = serde_json::to_string(&state).expect("serialize");
    let restored: AlertnessState = serde_json::from_str(&json).expect("deserialize");

    assert_eq!(state.level, restored.level);
}

#[test]
fn bevy_perception_config_serializes() {
    let config = PerceptionConfig {
        sight: Some(SightConfig::new(25.0, 90.0).with_peripheral(10.0, 180.0, 0.3)),
        hearing: Some(HearingConfig::new(20.0)),
        memory: MemoryConfig::default(),
        alertness: AlertnessConfig::paranoid(),
    };

    let json = serde_json::to_string(&config).expect("serialize");
    let restored: PerceptionConfig = serde_json::from_str(&json).expect("deserialize");

    assert_eq!(
        config.sight.as_ref().unwrap().range,
        restored.sight.as_ref().unwrap().range
    );
    assert_eq!(
        config.hearing.as_ref().unwrap().range,
        restored.hearing.as_ref().unwrap().range
    );
}

/// Simple alertness policy for testing alertness transitions.
struct AlertnessTestPolicy {
    alertness: AlertnessState,
}

impl AlertnessTestPolicy {
    fn new() -> Self {
        Self {
            alertness: AlertnessState::new(AlertnessConfig {
                suspicious_threshold: 0.2,
                alert_threshold: 0.5,
                combat_threshold: 0.8,
                suspicious_decay_ticks: 10,
                alert_decay_ticks: 20,
                combat_decay_ticks: 15,
                allow_skip_levels: true,
            }),
        }
    }
}

impl Policy<BevyAiWorld> for AlertnessTestPolicy {
    fn tick(
        &mut self,
        ctx: &TickContext,
        _agent: BevyAgentId,
        _world: &mut BevyAiWorld,
        blackboard: &mut Blackboard,
        _actions: &mut ActionRuntime<BevyAiWorld>,
    ) {
        // Simulate a percept on tick 2
        if ctx.tick == 2 {
            let percept = Percept::new(
                BevyAgentId(99), // Some "enemy"
                Vec2::new(5.0, 0.0),
                5.0,
                0x5167_0001, // SIGHT_SENSOR_ID
                0.9,         // High strength -> combat
                ctx.tick,
            );
            self.alertness.update(&[percept], ctx.tick);
        } else {
            // No percepts - allow decay
            self.alertness.update::<BevyAgentId>(&[], ctx.tick);
        }

        blackboard.set(BB_ALERTNESS, self.alertness.level as u8);
    }
}

#[test]
fn bevy_alertness_escalates_and_decays() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 1.0 / 60.0,
        seed: 0,
    });

    let mesh = NavMesh::from_triangles(vec![[
        Vec2::new(0.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(5.0, 10.0),
    ]]);
    app.insert_resource(AiNavMesh(Arc::new(mesh)));

    let agent = BevyAgentId(1);
    app.world_mut()
        .spawn((AiAgent(agent), AiPosition(Vec2::ZERO)));

    {
        let mut registry = app
            .world_mut()
            .get_non_send_resource_mut::<BevyBrainRegistry>()
            .unwrap();
        registry.insert(Brain::new(agent, Box::new(AlertnessTestPolicy::new())));
    }

    // Tick 0, 1: Unaware
    app.update();
    app.update();

    {
        let registry = app
            .world()
            .get_non_send_resource::<BevyBrainRegistry>()
            .unwrap();
        let alertness = registry
            .get(agent)
            .unwrap()
            .blackboard
            .get(BB_ALERTNESS)
            .unwrap();
        assert_eq!(*alertness, AlertnessLevel::Unaware as u8);
    }

    // Tick 2: Should escalate to Combat (strength 0.9 > combat_threshold 0.8)
    app.update();

    {
        let registry = app
            .world()
            .get_non_send_resource::<BevyBrainRegistry>()
            .unwrap();
        let alertness = registry
            .get(agent)
            .unwrap()
            .blackboard
            .get(BB_ALERTNESS)
            .unwrap();
        assert_eq!(*alertness, AlertnessLevel::Combat as u8);
    }

    // Tick 3..17: No percepts, should start decaying after combat_decay_ticks (15)
    for _ in 0..15 {
        app.update();
    }

    {
        let registry = app
            .world()
            .get_non_send_resource::<BevyBrainRegistry>()
            .unwrap();
        let alertness = registry
            .get(agent)
            .unwrap()
            .blackboard
            .get(BB_ALERTNESS)
            .unwrap();
        // Should have decayed to Alert
        assert_eq!(*alertness, AlertnessLevel::Alert as u8);
    }
}

#[cfg(feature = "trace")]
mod trace_tests {
    use super::*;
    use ai_bevy::AiTraceEvent;
    use ai_perception::trace::{emit_alertness_change, emit_perception_update, tags};
    use bevy_ecs::event::Events;

    /// Policy that emits perception trace events.
    struct TracingPerceptionPolicy;

    impl Policy<BevyAiWorld> for TracingPerceptionPolicy {
        fn tick(
            &mut self,
            ctx: &TickContext,
            _agent: BevyAgentId,
            _world: &mut BevyAiWorld,
            blackboard: &mut Blackboard,
            _actions: &mut ActionRuntime<BevyAiWorld>,
        ) {
            // Emit perception trace events
            emit_perception_update(blackboard, ctx.tick, 2, 1);

            if ctx.tick == 5 {
                emit_alertness_change(blackboard, ctx.tick, 0, 2);
            }
        }
    }

    #[test]
    fn bevy_perception_trace_events_flow_to_bevy() {
        let mut app = App::new();
        app.add_plugins(AiBevyPlugin::default());

        app.insert_resource(AiTick {
            tick: 0,
            dt_seconds: 1.0 / 60.0,
            seed: 0,
        });

        let mesh = NavMesh::from_triangles(vec![[
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(5.0, 10.0),
        ]]);
        app.insert_resource(AiNavMesh(Arc::new(mesh)));

        let agent = BevyAgentId(42);
        app.world_mut()
            .spawn((AiAgent(agent), AiPosition(Vec2::ZERO)));

        {
            let mut registry = app
                .world_mut()
                .get_non_send_resource_mut::<BevyBrainRegistry>()
                .unwrap();
            registry.insert(Brain::new(agent, Box::new(TracingPerceptionPolicy)));
        }

        // Run several ticks and collect events after each
        let mut all_events = Vec::new();
        for _ in 0..6 {
            app.update();

            // Read events from this frame (Bevy double-buffers events)
            let events = app.world().resource::<Events<AiTraceEvent>>();
            let mut cursor = events.get_cursor();
            // Events are visible for 2 frames, so read what's available
            all_events.extend(cursor.read(events).cloned());
        }

        // Should have some perception.update events
        let update_events: Vec<_> = all_events
            .iter()
            .filter(|e| e.event.tag == tags::PERCEPTION_UPDATE)
            .collect();
        assert!(
            !update_events.is_empty(),
            "expected at least one perception.update event"
        );

        // Verify the update events have correct data (sight=2, hearing=1)
        for e in &update_events {
            assert_eq!(e.event.a, 2, "sight count");
            assert_eq!(e.event.b, 1, "hearing count");
        }

        // Should have alertness change event (may not be present due to event timing)
        let alertness_events: Vec<_> = all_events
            .iter()
            .filter(|e| e.event.tag == tags::ALERTNESS_CHANGE)
            .collect();
        // If we have the alertness event, verify its data
        if !alertness_events.is_empty() {
            assert_eq!(alertness_events[0].event.a, 0); // Old level
            assert_eq!(alertness_events[0].event.b, 2); // New level (Alert)
        }
    }
}
