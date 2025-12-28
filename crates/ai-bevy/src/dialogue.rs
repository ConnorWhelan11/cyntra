//! Bevy integration for ai-dialogue.
//!
//! This module provides components, resources, and events for integrating
//! the ai-dialogue system with Bevy.
//!
//! # Usage
//!
//! 1. Add `AiDialoguePlugin` to your app
//! 2. Register dialogue trees in `AiDialogueTrees`
//! 3. Start dialogue by sending `StartDialogue` events
//! 4. Handle dialogue UI by querying `AiDialogueState` components

use std::collections::BTreeMap;

use bevy_app::{App, Plugin, Update};
use bevy_ecs::prelude::{Component, Entity, Event, EventReader, EventWriter, Query, Res, Resource};
use bevy_ecs::schedule::IntoScheduleConfigs;

use crate::{AiBevySchedule, AiBevySet, BevyAgentId};

// Re-export useful types from ai-dialogue.
// We re-export all major types so users don't need to depend on ai-dialogue directly.
pub use ai_dialogue::{
    DialogueContext, DialogueError, DialogueLine, DialogueResponse, DialogueSession,
    DialogueTree, DialogueTreeBuilder, NodeId, SpeakerId,
};

/// Resource holding all registered dialogue trees.
#[derive(Resource, Default)]
pub struct AiDialogueTrees {
    trees: BTreeMap<String, DialogueTree>,
}

impl AiDialogueTrees {
    /// Create a new empty tree registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a dialogue tree.
    pub fn insert(&mut self, tree: DialogueTree) {
        self.trees.insert(tree.id.clone(), tree);
    }

    /// Get a tree by ID.
    pub fn get(&self, id: &str) -> Option<&DialogueTree> {
        self.trees.get(id)
    }

    /// Remove a tree by ID.
    pub fn remove(&mut self, id: &str) -> Option<DialogueTree> {
        self.trees.remove(id)
    }

    /// Check if a tree exists.
    pub fn contains(&self, id: &str) -> bool {
        self.trees.contains_key(id)
    }

    /// Get all tree IDs.
    pub fn tree_ids(&self) -> impl Iterator<Item = &str> {
        self.trees.keys().map(|s| s.as_str())
    }
}

/// Component marking an entity as participating in dialogue.
///
/// Contains the active dialogue session if one is in progress.
#[derive(Debug, Clone, Component)]
pub struct AiDialogueState {
    /// The active dialogue session, if any.
    pub session: Option<DialogueSession>,
    /// The other participant in the dialogue (typically the player or NPC).
    pub partner: Option<BevyAgentId>,
}

impl Default for AiDialogueState {
    fn default() -> Self {
        Self {
            session: None,
            partner: None,
        }
    }
}

impl AiDialogueState {
    /// Create a new dialogue state.
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if dialogue is currently active.
    pub fn is_active(&self) -> bool {
        self.session
            .as_ref()
            .map(|s| !s.is_complete)
            .unwrap_or(false)
    }

    /// Check if the dialogue is complete.
    pub fn is_complete(&self) -> bool {
        self.session
            .as_ref()
            .map(|s| s.is_complete)
            .unwrap_or(false)
    }

    /// Get the current tree ID (if session active).
    pub fn tree_id(&self) -> Option<&str> {
        self.session.as_ref().map(|s| s.tree_id.as_str())
    }

    /// Get the current node ID.
    pub fn current_node(&self) -> Option<NodeId> {
        self.session.as_ref().and_then(|s| s.current_node)
    }

    /// Get current dialogue lines.
    pub fn current_lines<'a>(&self, trees: &'a AiDialogueTrees) -> Option<&'a [DialogueLine]> {
        let session = self.session.as_ref()?;
        let tree = trees.get(&session.tree_id)?;
        session.current_lines(tree)
    }

    /// Get the current line (for multi-line nodes).
    pub fn current_line<'a>(&self, trees: &'a AiDialogueTrees) -> Option<&'a DialogueLine> {
        let session = self.session.as_ref()?;
        let tree = trees.get(&session.tree_id)?;
        session.current_line(tree)
    }

    /// Get available responses.
    pub fn available_responses<'a>(
        &self,
        trees: &'a AiDialogueTrees,
    ) -> Vec<&'a DialogueResponse> {
        let Some(session) = &self.session else {
            return Vec::new();
        };
        let Some(tree) = trees.get(&session.tree_id) else {
            return Vec::new();
        };
        session.available_responses(tree)
    }

    /// Check if on last line of current node.
    pub fn is_last_line(&self, trees: &AiDialogueTrees) -> bool {
        let Some(session) = &self.session else {
            return true;
        };
        let Some(tree) = trees.get(&session.tree_id) else {
            return true;
        };
        session.is_last_line(tree)
    }

    /// Access dialogue context (flags, variables, etc.).
    pub fn context(&self) -> Option<&DialogueContext> {
        self.session.as_ref().map(|s| &s.context)
    }

    /// Mutably access dialogue context.
    pub fn context_mut(&mut self) -> Option<&mut DialogueContext> {
        self.session.as_mut().map(|s| &mut s.context)
    }
}

/// Event to start a dialogue session.
#[derive(Debug, Clone, Event)]
pub struct StartDialogue {
    /// The entity starting the dialogue.
    pub entity: Entity,
    /// The dialogue tree ID to use.
    pub tree_id: String,
    /// The partner agent (optional).
    pub partner: Option<BevyAgentId>,
    /// Initial context (optional, uses default if None).
    pub context: Option<DialogueContext>,
    /// Start at a specific node (optional, uses entry node if None).
    pub start_node: Option<NodeId>,
}

impl StartDialogue {
    /// Create a new start dialogue event.
    pub fn new(entity: Entity, tree_id: impl Into<String>) -> Self {
        Self {
            entity,
            tree_id: tree_id.into(),
            partner: None,
            context: None,
            start_node: None,
        }
    }

    /// Set the dialogue partner.
    pub fn with_partner(mut self, partner: BevyAgentId) -> Self {
        self.partner = Some(partner);
        self
    }

    /// Set an initial context.
    pub fn with_context(mut self, ctx: DialogueContext) -> Self {
        self.context = Some(ctx);
        self
    }

    /// Start at a specific node.
    pub fn at_node(mut self, node: NodeId) -> Self {
        self.start_node = Some(node);
        self
    }
}

/// Event to select a dialogue response.
#[derive(Debug, Clone, Event)]
pub struct SelectResponse {
    /// The entity whose dialogue to advance.
    pub entity: Entity,
    /// The response ID to select.
    pub response_id: u32,
}

impl SelectResponse {
    /// Create a new select response event.
    pub fn new(entity: Entity, response_id: u32) -> Self {
        Self {
            entity,
            response_id,
        }
    }
}

/// Event to advance to the next line (for multi-line nodes).
#[derive(Debug, Clone, Event)]
pub struct AdvanceLine {
    /// The entity whose dialogue to advance.
    pub entity: Entity,
}

impl AdvanceLine {
    /// Create a new advance line event.
    pub fn new(entity: Entity) -> Self {
        Self { entity }
    }
}

/// Event to end a dialogue early.
#[derive(Debug, Clone, Event)]
pub struct EndDialogue {
    /// The entity whose dialogue to end.
    pub entity: Entity,
}

impl EndDialogue {
    /// Create a new end dialogue event.
    pub fn new(entity: Entity) -> Self {
        Self { entity }
    }
}

/// Event emitted when dialogue state changes.
#[derive(Debug, Clone, Event)]
pub enum DialogueChanged {
    /// Dialogue started.
    Started {
        entity: Entity,
        tree_id: String,
    },
    /// Line advanced within a node.
    LineAdvanced {
        entity: Entity,
        line_index: usize,
    },
    /// Response selected, transitioned to new node.
    ResponseSelected {
        entity: Entity,
        response_id: u32,
        new_node: Option<NodeId>,
    },
    /// Dialogue ended (completed or cancelled).
    Ended {
        entity: Entity,
        completed: bool,
    },
    /// Error occurred.
    Error {
        entity: Entity,
        error: String,
    },
}

/// Event emitted when a dialogue effect triggers an event.
#[derive(Debug, Clone, Event)]
pub struct DialogueEffectEvent {
    /// The entity that triggered the event.
    pub entity: Entity,
    /// The event type.
    pub event_type: String,
    /// The event payload.
    pub payload: String,
}

/// System that handles `StartDialogue` events.
pub fn handle_start_dialogue(
    trees: Res<AiDialogueTrees>,
    mut events: EventReader<StartDialogue>,
    mut changed: EventWriter<DialogueChanged>,
    mut query: Query<&mut AiDialogueState>,
) {
    for event in events.read() {
        let Ok(mut state) = query.get_mut(event.entity) else {
            changed.write(DialogueChanged::Error {
                entity: event.entity,
                error: "Entity has no AiDialogueState component".to_string(),
            });
            continue;
        };

        let Some(tree) = trees.get(&event.tree_id) else {
            changed.write(DialogueChanged::Error {
                entity: event.entity,
                error: format!("Dialogue tree '{}' not found", event.tree_id),
            });
            continue;
        };

        let ctx = event.context.clone().unwrap_or_default();

        let session_result = if let Some(node) = event.start_node {
            DialogueSession::from_node(tree, node, ctx)
        } else {
            DialogueSession::new(tree, ctx)
        };

        match session_result {
            Ok(session) => {
                state.session = Some(session);
                state.partner = event.partner;
                changed.write(DialogueChanged::Started {
                    entity: event.entity,
                    tree_id: event.tree_id.clone(),
                });
            }
            Err(e) => {
                changed.write(DialogueChanged::Error {
                    entity: event.entity,
                    error: format!("Failed to start dialogue: {}", e),
                });
            }
        }
    }
}

/// System that handles `SelectResponse` events.
pub fn handle_select_response(
    trees: Res<AiDialogueTrees>,
    mut events: EventReader<SelectResponse>,
    mut changed: EventWriter<DialogueChanged>,
    mut effect_events: EventWriter<DialogueEffectEvent>,
    mut query: Query<&mut AiDialogueState>,
) {
    for event in events.read() {
        let Ok(mut state) = query.get_mut(event.entity) else {
            changed.write(DialogueChanged::Error {
                entity: event.entity,
                error: "Entity has no AiDialogueState component".to_string(),
            });
            continue;
        };

        let Some(session) = &mut state.session else {
            changed.write(DialogueChanged::Error {
                entity: event.entity,
                error: "No active dialogue session".to_string(),
            });
            continue;
        };

        let Some(tree) = trees.get(&session.tree_id) else {
            changed.write(DialogueChanged::Error {
                entity: event.entity,
                error: format!("Dialogue tree '{}' not found", session.tree_id),
            });
            continue;
        };

        match session.select_response(tree, event.response_id) {
            Ok(()) => {
                // Dispatch any pending events from effects
                for dialogue_event in session.context.take_events() {
                    effect_events.write(DialogueEffectEvent {
                        entity: event.entity,
                        event_type: dialogue_event.event_type,
                        payload: dialogue_event.payload,
                    });
                }

                changed.write(DialogueChanged::ResponseSelected {
                    entity: event.entity,
                    response_id: event.response_id,
                    new_node: session.current_node,
                });

                // Check if dialogue is now complete
                if session.is_complete {
                    changed.write(DialogueChanged::Ended {
                        entity: event.entity,
                        completed: true,
                    });
                }
            }
            Err(e) => {
                changed.write(DialogueChanged::Error {
                    entity: event.entity,
                    error: format!("Failed to select response: {}", e),
                });
            }
        }
    }
}

/// System that handles `AdvanceLine` events.
pub fn handle_advance_line(
    trees: Res<AiDialogueTrees>,
    mut events: EventReader<AdvanceLine>,
    mut changed: EventWriter<DialogueChanged>,
    mut query: Query<&mut AiDialogueState>,
) {
    for event in events.read() {
        let Ok(mut state) = query.get_mut(event.entity) else {
            continue;
        };

        let Some(session) = &mut state.session else {
            continue;
        };

        let Some(tree) = trees.get(&session.tree_id) else {
            continue;
        };

        if session.advance_line(tree) {
            changed.write(DialogueChanged::LineAdvanced {
                entity: event.entity,
                line_index: session.current_line_index,
            });
        }
    }
}

/// System that handles `EndDialogue` events.
pub fn handle_end_dialogue(
    mut events: EventReader<EndDialogue>,
    mut changed: EventWriter<DialogueChanged>,
    mut query: Query<&mut AiDialogueState>,
) {
    for event in events.read() {
        let Ok(mut state) = query.get_mut(event.entity) else {
            continue;
        };

        if let Some(session) = &mut state.session {
            let was_complete = session.is_complete;
            session.end();

            changed.write(DialogueChanged::Ended {
                entity: event.entity,
                completed: was_complete,
            });
        }
    }
}

/// Plugin for ai-dialogue integration.
///
/// Adds dialogue systems to Bevy.
pub struct AiDialoguePlugin {
    /// The schedule to run in.
    pub schedule: AiBevySchedule,
}

impl Default for AiDialoguePlugin {
    fn default() -> Self {
        Self {
            schedule: AiBevySchedule::Update,
        }
    }
}

impl AiDialoguePlugin {
    /// Create a new dialogue plugin.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the schedule to run in.
    pub fn in_fixed_update(mut self) -> Self {
        self.schedule = AiBevySchedule::FixedUpdate;
        self
    }
}

impl Plugin for AiDialoguePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AiDialogueTrees>();

        app.add_event::<StartDialogue>();
        app.add_event::<SelectResponse>();
        app.add_event::<AdvanceLine>();
        app.add_event::<EndDialogue>();
        app.add_event::<DialogueChanged>();
        app.add_event::<DialogueEffectEvent>();

        let systems = (
            handle_start_dialogue,
            handle_select_response,
            handle_advance_line,
            handle_end_dialogue,
        );

        match self.schedule {
            AiBevySchedule::Update => {
                app.add_systems(Update, systems.in_set(AiBevySet::Think));
            }
            AiBevySchedule::FixedUpdate => {
                app.add_systems(bevy_app::FixedUpdate, systems.in_set(AiBevySet::Think));
            }
        }
    }
}

