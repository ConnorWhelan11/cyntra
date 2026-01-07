//! Collision event bridge for AI systems.
//!
//! This module bridges Rapier's low-level collision events to high-level
//! AI-friendly events that can be consumed by behavior trees, utility AI, etc.

use bevy_ecs::prelude::*;
use bevy_rapier3d::prelude::*;

use super::layers;

/// High-level AI collision event.
///
/// These events are generated from Rapier's collision events and provide
/// more semantic information useful for AI decision-making.
#[derive(Event, Debug, Clone)]
pub enum AiCollisionEvent {
    /// An AI agent touched another agent.
    AgentContact {
        /// The AI agent that initiated or detected the contact.
        agent: Entity,
        /// The other agent involved.
        other_agent: Entity,
    },

    /// An AI agent entered a trigger zone.
    TriggerEnter {
        /// The AI agent that entered.
        agent: Entity,
        /// The trigger zone entity.
        trigger: Entity,
    },

    /// An AI agent exited a trigger zone.
    TriggerExit {
        /// The AI agent that exited.
        agent: Entity,
        /// The trigger zone entity.
        trigger: Entity,
    },

    /// An AI agent touched an obstacle.
    ObstacleContact {
        /// The AI agent that hit the obstacle.
        agent: Entity,
        /// The obstacle entity.
        obstacle: Entity,
    },

    /// An AI agent touched an interactive object.
    InteractiveContact {
        /// The AI agent near the interactive.
        agent: Entity,
        /// The interactive object.
        interactive: Entity,
    },

    /// An AI agent touched the ground.
    GroundContact {
        /// The AI agent that touched ground.
        agent: Entity,
        /// The ground entity.
        ground: Entity,
    },

    /// A projectile hit something.
    ProjectileHit {
        /// The projectile entity.
        projectile: Entity,
        /// What the projectile hit.
        target: Entity,
    },
}

/// Component to mark an entity's collision layer for event classification.
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiCollisionLayer {
    Agent,
    Obstacle,
    Trigger,
    Projectile,
    Ground,
    Interactive,
}

impl AiCollisionLayer {
    /// Get the collision layer from collision groups.
    pub fn from_groups(groups: &CollisionGroups) -> Option<Self> {
        let bits = groups.memberships.bits();
        if bits & layers::AGENT != 0 {
            Some(Self::Agent)
        } else if bits & layers::TRIGGER != 0 {
            Some(Self::Trigger)
        } else if bits & layers::PROJECTILE != 0 {
            Some(Self::Projectile)
        } else if bits & layers::GROUND != 0 {
            Some(Self::Ground)
        } else if bits & layers::INTERACTIVE != 0 {
            Some(Self::Interactive)
        } else if bits & layers::OBSTACLE != 0 {
            Some(Self::Obstacle)
        } else {
            None
        }
    }
}

/// Resource to configure the collision event bridge.
#[derive(Resource, Debug, Clone)]
pub struct AiCollisionBridgeConfig {
    /// Whether to generate AgentContact events.
    pub agent_contacts: bool,
    /// Whether to generate TriggerEnter/Exit events.
    pub trigger_events: bool,
    /// Whether to generate ObstacleContact events.
    pub obstacle_contacts: bool,
    /// Whether to generate InteractiveContact events.
    pub interactive_contacts: bool,
    /// Whether to generate GroundContact events.
    pub ground_contacts: bool,
    /// Whether to generate ProjectileHit events.
    pub projectile_hits: bool,
}

impl Default for AiCollisionBridgeConfig {
    fn default() -> Self {
        Self {
            agent_contacts: true,
            trigger_events: true,
            obstacle_contacts: false, // Often too noisy
            interactive_contacts: true,
            ground_contacts: false, // Often too noisy
            projectile_hits: true,
        }
    }
}

/// System that bridges Rapier collision events to AI collision events.
pub fn bridge_collision_events(
    mut rapier_events: EventReader<CollisionEvent>,
    mut ai_events: EventWriter<AiCollisionEvent>,
    config: Option<Res<AiCollisionBridgeConfig>>,
    collision_groups: Query<&CollisionGroups>,
    ai_layers: Query<&AiCollisionLayer>,
    sensors: Query<&Sensor>,
) {
    let config = config.map(|c| c.clone()).unwrap_or_default();

    for event in rapier_events.read() {
        match event {
            CollisionEvent::Started(e1, e2, _flags) => {
                if let Some(ai_event) =
                    classify_collision(*e1, *e2, true, &config, &collision_groups, &ai_layers, &sensors)
                {
                    ai_events.write(ai_event);
                }
            }
            CollisionEvent::Stopped(e1, e2, _flags) => {
                if let Some(ai_event) =
                    classify_collision(*e1, *e2, false, &config, &collision_groups, &ai_layers, &sensors)
                {
                    ai_events.write(ai_event);
                }
            }
        }
    }
}

/// Classify a collision pair into an AI event.
fn classify_collision(
    e1: Entity,
    e2: Entity,
    started: bool,
    config: &AiCollisionBridgeConfig,
    collision_groups: &Query<&CollisionGroups>,
    ai_layers: &Query<&AiCollisionLayer>,
    sensors: &Query<&Sensor>,
) -> Option<AiCollisionEvent> {
    // Try to get layer from explicit component first, then from collision groups
    let layer1 = ai_layers
        .get(e1)
        .ok()
        .copied()
        .or_else(|| collision_groups.get(e1).ok().and_then(AiCollisionLayer::from_groups));

    let layer2 = ai_layers
        .get(e2)
        .ok()
        .copied()
        .or_else(|| collision_groups.get(e2).ok().and_then(AiCollisionLayer::from_groups));

    let (layer1, layer2) = match (layer1, layer2) {
        (Some(l1), Some(l2)) => (l1, l2),
        _ => return None,
    };

    // Check if either entity is a sensor (trigger)
    // These are available for future use in more sophisticated event classification
    let _is_sensor1 = sensors.get(e1).is_ok();
    let _is_sensor2 = sensors.get(e2).is_ok();

    // Classify based on layer combination
    match (layer1, layer2) {
        // Agent + Agent
        (AiCollisionLayer::Agent, AiCollisionLayer::Agent) if config.agent_contacts && started => {
            Some(AiCollisionEvent::AgentContact {
                agent: e1,
                other_agent: e2,
            })
        }

        // Agent + Trigger
        (AiCollisionLayer::Agent, AiCollisionLayer::Trigger)
        | (AiCollisionLayer::Trigger, AiCollisionLayer::Agent)
            if config.trigger_events =>
        {
            let (agent, trigger) = if layer1 == AiCollisionLayer::Agent {
                (e1, e2)
            } else {
                (e2, e1)
            };

            if started {
                Some(AiCollisionEvent::TriggerEnter { agent, trigger })
            } else {
                Some(AiCollisionEvent::TriggerExit { agent, trigger })
            }
        }

        // Agent + Obstacle
        (AiCollisionLayer::Agent, AiCollisionLayer::Obstacle)
        | (AiCollisionLayer::Obstacle, AiCollisionLayer::Agent)
            if config.obstacle_contacts && started =>
        {
            let (agent, obstacle) = if layer1 == AiCollisionLayer::Agent {
                (e1, e2)
            } else {
                (e2, e1)
            };
            Some(AiCollisionEvent::ObstacleContact { agent, obstacle })
        }

        // Agent + Interactive
        (AiCollisionLayer::Agent, AiCollisionLayer::Interactive)
        | (AiCollisionLayer::Interactive, AiCollisionLayer::Agent)
            if config.interactive_contacts && started =>
        {
            let (agent, interactive) = if layer1 == AiCollisionLayer::Agent {
                (e1, e2)
            } else {
                (e2, e1)
            };
            Some(AiCollisionEvent::InteractiveContact { agent, interactive })
        }

        // Agent + Ground
        (AiCollisionLayer::Agent, AiCollisionLayer::Ground)
        | (AiCollisionLayer::Ground, AiCollisionLayer::Agent)
            if config.ground_contacts && started =>
        {
            let (agent, ground) = if layer1 == AiCollisionLayer::Agent {
                (e1, e2)
            } else {
                (e2, e1)
            };
            Some(AiCollisionEvent::GroundContact { agent, ground })
        }

        // Projectile + anything
        (AiCollisionLayer::Projectile, _) if config.projectile_hits && started => {
            Some(AiCollisionEvent::ProjectileHit {
                projectile: e1,
                target: e2,
            })
        }
        (_, AiCollisionLayer::Projectile) if config.projectile_hits && started => {
            Some(AiCollisionEvent::ProjectileHit {
                projectile: e2,
                target: e1,
            })
        }

        _ => None,
    }
}

/// Component to track entities currently in contact with this entity.
#[derive(Component, Default, Debug)]
pub struct ContactTracker {
    /// Entities currently in contact.
    pub contacts: Vec<Entity>,
}

/// System to maintain contact tracking components.
pub fn update_contact_trackers(
    mut events: EventReader<CollisionEvent>,
    mut trackers: Query<&mut ContactTracker>,
) {
    for event in events.read() {
        match event {
            CollisionEvent::Started(e1, e2, _) => {
                if let Ok(mut tracker) = trackers.get_mut(*e1) {
                    if !tracker.contacts.contains(e2) {
                        tracker.contacts.push(*e2);
                    }
                }
                if let Ok(mut tracker) = trackers.get_mut(*e2) {
                    if !tracker.contacts.contains(e1) {
                        tracker.contacts.push(*e1);
                    }
                }
            }
            CollisionEvent::Stopped(e1, e2, _) => {
                if let Ok(mut tracker) = trackers.get_mut(*e1) {
                    tracker.contacts.retain(|&e| e != *e2);
                }
                if let Ok(mut tracker) = trackers.get_mut(*e2) {
                    tracker.contacts.retain(|&e| e != *e1);
                }
            }
        }
    }
}

/// Component to track trigger zones an entity is currently inside.
#[derive(Component, Default, Debug)]
pub struct TriggerTracker {
    /// Trigger zones the entity is currently inside.
    pub inside_triggers: Vec<Entity>,
}

/// System to maintain trigger tracking from AI events.
pub fn update_trigger_trackers(
    mut events: EventReader<AiCollisionEvent>,
    mut trackers: Query<&mut TriggerTracker>,
) {
    for event in events.read() {
        match event {
            AiCollisionEvent::TriggerEnter { agent, trigger } => {
                if let Ok(mut tracker) = trackers.get_mut(*agent) {
                    if !tracker.inside_triggers.contains(trigger) {
                        tracker.inside_triggers.push(*trigger);
                    }
                }
            }
            AiCollisionEvent::TriggerExit { agent, trigger } => {
                if let Ok(mut tracker) = trackers.get_mut(*agent) {
                    tracker.inside_triggers.retain(|&t| t != *trigger);
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collision_layer_from_groups() {
        let agent_groups = CollisionGroups::new(
            Group::from_bits(layers::AGENT).unwrap(),
            Group::ALL,
        );
        assert_eq!(
            AiCollisionLayer::from_groups(&agent_groups),
            Some(AiCollisionLayer::Agent)
        );

        let trigger_groups = CollisionGroups::new(
            Group::from_bits(layers::TRIGGER).unwrap(),
            Group::ALL,
        );
        assert_eq!(
            AiCollisionLayer::from_groups(&trigger_groups),
            Some(AiCollisionLayer::Trigger)
        );
    }

    #[test]
    fn test_default_config() {
        let config = AiCollisionBridgeConfig::default();
        assert!(config.agent_contacts);
        assert!(config.trigger_events);
        assert!(!config.obstacle_contacts); // Should be off by default
    }

    #[test]
    fn test_contact_tracker() {
        let mut tracker = ContactTracker::default();
        assert!(tracker.contacts.is_empty());

        tracker.contacts.push(Entity::from_raw(1));
        assert_eq!(tracker.contacts.len(), 1);
    }

    #[test]
    fn test_trigger_tracker() {
        let mut tracker = TriggerTracker::default();
        assert!(tracker.inside_triggers.is_empty());

        tracker.inside_triggers.push(Entity::from_raw(1));
        assert_eq!(tracker.inside_triggers.len(), 1);
    }
}
