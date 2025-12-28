//! Bevy adapter for the `ai-*` crates.
//!
//! This crate provides a minimal integration layer that:
//! - keeps `ai-core` engine-agnostic,
//! - preserves determinism via stable agent IDs and ordered brain ticking,
//! - and avoids `Send + Sync` requirements by storing brains as a non-send Bevy resource.
//!
//! ## Scheduling
//!
//! Bevy recommends running simulation logic like AI in [`bevy_app::FixedUpdate`]. However, the
//! fixed timestep loop is driven by Bevy's time plugin(s). If you're using a minimal `App` without
//! time, schedule AI in [`bevy_app::Update`] or drive ticks explicitly.
//!
//! ## Features
//!
//! - `time`: if Bevy's `bevy_time::Time` resource is present, `AiTick.dt_seconds` is updated
//!   from `Time::delta_secs()` each tick (keeps the adapter's tick context in sync with Bevy).
//! - `trace`: inserts an `ai-tools` `ai_tools::TraceLog` into each brain blackboard and flushes
//!   its events to Bevy as `AiTraceEvent`s.
//! - `trace-inspector`: collects `AiTraceEvent`s into an in-memory ring buffer (`AiTraceBuffer`).
//! - `trace-egui`: shows `AiTraceBuffer` in an egui window (feature-gated UI tooling).
//! - `transform-sync`: optionally read/write Bevy `Transform` as the position source/sink.

#![cfg_attr(docsrs, feature(doc_cfg))]
#![forbid(unsafe_code)]

use std::collections::BTreeMap;
use std::sync::Arc;

use ai_core::{AgentId, Brain, TickContext, WorldMut, WorldView};
use ai_nav::{NavMesh, NavWorldMut, NavWorldView, Navigator, Vec2};
use bevy_app::{App, FixedUpdate, Plugin, Update};
use bevy_ecs::prelude::{Component, Query, Res, ResMut, Resource, SystemSet};
use bevy_ecs::schedule::IntoScheduleConfigs;
use bevy_ecs::system::NonSendMut;

#[cfg(feature = "time")]
use bevy_time::Time;

#[cfg(feature = "trace-inspector")]
use bevy_app::PostUpdate;

#[cfg(feature = "trace")]
use ai_tools::{TraceEvent, TraceLog, TRACE_LOG};
#[cfg(feature = "trace")]
use bevy_ecs::event::EventWriter;
#[cfg(feature = "trace-inspector")]
use bevy_ecs::event::EventReader;

#[cfg(feature = "transform-sync")]
use std::collections::BTreeSet;
#[cfg(feature = "transform-sync")]
use bevy_transform::components::Transform;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BevyAgentId(pub u64);

impl AgentId for BevyAgentId {
    fn stable_id(self) -> u64 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Component)]
pub struct AiAgent(pub BevyAgentId);

#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Component)]
pub struct AiPosition(pub Vec2);

/// Agent facing direction (unit vector).
///
/// Used by perception for sight cone calculations.
#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Component)]
pub struct AiFacing(pub Vec2);

impl Default for AiFacing {
    fn default() -> Self {
        Self(Vec2::new(1.0, 0.0))
    }
}

/// Agent loudness for hearing detection.
///
/// 0.0 = silent, 1.0 = normal loudness.
#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Component)]
pub struct AiLoudness(pub f32);

impl Default for AiLoudness {
    fn default() -> Self {
        Self(0.0)
    }
}

/// Agent radius for spatial queries and collision.
#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Component)]
pub struct AiRadius(pub f32);

impl Default for AiRadius {
    fn default() -> Self {
        Self(0.5)
    }
}

/// Agent visibility settings for perception.
#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Component)]
pub struct AiVisibility {
    /// Whether the agent is visible at all.
    pub visible: bool,
    /// Visibility modifier (1.0 = normal, 0.5 = half visible, 2.0 = very visible).
    pub modifier: f32,
}

impl Default for AiVisibility {
    fn default() -> Self {
        Self {
            visible: true,
            modifier: 1.0,
        }
    }
}

#[derive(Clone)]
#[derive(Resource)]
pub struct AiNavMesh(pub Arc<NavMesh>);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiBevySchedule {
    Update,
    FixedUpdate,
}

/// Mapping between `ai-nav` 2D coordinates (`Vec2`) and Bevy's 3D `Transform.translation`.
#[cfg(feature = "transform-sync")]
#[cfg_attr(docsrs, doc(cfg(feature = "transform-sync")))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiTransformPlane {
    /// Interpret 2D coords as XZ (top-down 3D). `height` maps to Y.
    Xz,
    /// Interpret 2D coords as XY (2D games). `height` maps to Z.
    Xy,
}

/// Configuration for syncing AI positions with Bevy `Transform`.
#[cfg(feature = "transform-sync")]
#[cfg_attr(docsrs, doc(cfg(feature = "transform-sync")))]
#[derive(Debug, Clone, Copy)]
#[derive(Resource)]
pub struct AiTransformSyncConfig {
    pub plane: AiTransformPlane,
    /// Coordinate for the axis not covered by `plane`.
    ///
    /// - XZ: sets `Transform.translation.y`
    /// - XY: sets `Transform.translation.z`
    pub height: f32,
    /// When true, read positions from `Transform` (when present) during sync-in.
    pub read_from_transform: bool,
    /// When true, write positions to `Transform` (when present) during sync-out.
    pub write_to_transform: bool,
}

#[cfg(feature = "transform-sync")]
impl Default for AiTransformSyncConfig {
    fn default() -> Self {
        Self {
            plane: AiTransformPlane::Xz,
            height: 0.0,
            read_from_transform: true,
            write_to_transform: true,
        }
    }
}

#[cfg(feature = "transform-sync")]
fn vec2_from_transform(t: &Transform, plane: AiTransformPlane) -> Vec2 {
    match plane {
        AiTransformPlane::Xz => Vec2::new(t.translation.x, t.translation.z),
        AiTransformPlane::Xy => Vec2::new(t.translation.x, t.translation.y),
    }
}

#[cfg(feature = "transform-sync")]
fn write_transform_translation(t: &mut Transform, plane: AiTransformPlane, height: f32, p: Vec2) {
    match plane {
        AiTransformPlane::Xz => {
            t.translation.x = p.x;
            t.translation.y = height;
            t.translation.z = p.y;
        }
        AiTransformPlane::Xy => {
            t.translation.x = p.x;
            t.translation.y = p.y;
            t.translation.z = height;
        }
    }
}

/// Bevy event emitted when `ai-tools` tracing is enabled.
#[cfg(feature = "trace")]
#[cfg_attr(docsrs, doc(cfg(feature = "trace")))]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AiTraceEvent {
    pub agent: BevyAgentId,
    pub event: TraceEvent,
}

#[cfg(feature = "trace")]
impl bevy_ecs::event::Event for AiTraceEvent {
    type Traversal = ();
}

/// A small in-memory ring buffer of recent `AiTraceEvent`s.
///
/// This is intended to back Bevy-side “inspector UI” and debugging tools without requiring
/// `ai-core` blackboard access.
#[cfg(feature = "trace-inspector")]
#[cfg_attr(docsrs, doc(cfg(feature = "trace-inspector")))]
#[derive(Debug)]
#[derive(Resource)]
pub struct AiTraceBuffer {
    pub capacity: usize,
    pub events: std::collections::VecDeque<AiTraceEvent>,
}

#[cfg(feature = "trace-inspector")]
impl Default for AiTraceBuffer {
    fn default() -> Self {
        Self {
            capacity: 1024,
            events: std::collections::VecDeque::new(),
        }
    }
}

#[cfg(feature = "trace-inspector")]
pub fn collect_ai_trace_events(
    mut buffer: ResMut<AiTraceBuffer>,
    mut reader: EventReader<AiTraceEvent>,
) {
    for event in reader.read() {
        if buffer.events.len() == buffer.capacity {
            buffer.events.pop_front();
        }
        buffer.events.push_back(event.clone());
    }
}

/// Bevy plugin that accumulates `AiTraceEvent`s into an in-memory ring buffer (`AiTraceBuffer`).
#[cfg(feature = "trace-inspector")]
#[cfg_attr(docsrs, doc(cfg(feature = "trace-inspector")))]
pub struct AiTraceInspectorPlugin;

#[cfg(feature = "trace-inspector")]
impl Default for AiTraceInspectorPlugin {
    fn default() -> Self {
        Self
    }
}

#[cfg(feature = "trace-inspector")]
impl Plugin for AiTraceInspectorPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AiTraceBuffer>();
        app.add_systems(PostUpdate, collect_ai_trace_events);
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[derive(Resource)]
pub struct AiTick {
    pub tick: u64,
    pub dt_seconds: f32,
    pub seed: u64,
}

impl Default for AiTick {
    fn default() -> Self {
        Self {
            tick: 0,
            dt_seconds: 1.0 / 60.0,
            seed: 0,
        }
    }
}

/// Callback for raycast line-of-sight checks.
///
/// Users can set this resource to provide custom raycast logic.
/// By default, raycasts are never blocked.
#[derive(Resource)]
pub struct AiRaycastCallback(pub Arc<dyn Fn(Vec2, Vec2) -> bool + Send + Sync>);

impl Default for AiRaycastCallback {
    fn default() -> Self {
        Self(Arc::new(|_from, _to| false))
    }
}

impl AiRaycastCallback {
    /// Create a new raycast callback from a function.
    pub fn new<F>(f: F) -> Self
    where
        F: Fn(Vec2, Vec2) -> bool + Send + Sync + 'static,
    {
        Self(Arc::new(f))
    }

    /// Check if a raycast from `from` to `to` is blocked.
    pub fn is_blocked(&self, from: Vec2, to: Vec2) -> bool {
        (self.0)(from, to)
    }
}

/// Agent perception data stored in the world snapshot.
#[derive(Debug, Clone, Copy)]
pub struct AgentPerceptionData {
    pub facing: Vec2,
    pub loudness: f32,
    pub visible: bool,
    pub visibility_modifier: f32,
}

impl Default for AgentPerceptionData {
    fn default() -> Self {
        Self {
            facing: Vec2::new(1.0, 0.0),
            loudness: 0.0,
            visible: true,
            visibility_modifier: 1.0,
        }
    }
}

/// A small engine-agnostic world snapshot used to tick `ai-core::Brain`s inside Bevy.
///
/// It is built from Bevy components each tick and written back after the AI step.
#[derive(Resource)]
pub struct BevyAiWorld {
    navigator: Arc<NavMesh>,
    positions: BTreeMap<BevyAgentId, Vec2>,
    /// Perception data for each agent (facing, loudness, visibility).
    perception_data: BTreeMap<BevyAgentId, AgentPerceptionData>,
    /// Spatial hash cell size for entities_in_radius queries.
    spatial_cell_size: f32,
    /// Spatial hash buckets.
    spatial_buckets: BTreeMap<(i32, i32), Vec<BevyAgentId>>,
    /// Raycast callback (stored as Arc for Send+Sync).
    raycast_callback: Arc<dyn Fn(Vec2, Vec2) -> bool + Send + Sync>,
}

impl Default for BevyAiWorld {
    fn default() -> Self {
        Self {
            navigator: Arc::new(NavMesh::from_triangles(Vec::new())),
            positions: BTreeMap::new(),
            perception_data: BTreeMap::new(),
            spatial_cell_size: 5.0,
            spatial_buckets: BTreeMap::new(),
            raycast_callback: Arc::new(|_, _| false),
        }
    }
}

impl BevyAiWorld {
    /// Set the raycast callback for line-of-sight checks.
    pub fn set_raycast_callback<F>(&mut self, f: F)
    where
        F: Fn(Vec2, Vec2) -> bool + Send + Sync + 'static,
    {
        self.raycast_callback = Arc::new(f);
    }

    /// Rebuild the spatial hash from current positions.
    fn rebuild_spatial_hash(&mut self) {
        self.spatial_buckets.clear();
        for (&agent, &pos) in &self.positions {
            let cell = self.pos_to_cell(pos);
            self.spatial_buckets.entry(cell).or_default().push(agent);
        }
        // Sort each bucket for determinism
        for bucket in self.spatial_buckets.values_mut() {
            bucket.sort_by_key(|a| a.0);
        }
    }

    fn pos_to_cell(&self, pos: Vec2) -> (i32, i32) {
        let cs = self.spatial_cell_size.max(1e-6);
        ((pos.x / cs).floor() as i32, (pos.y / cs).floor() as i32)
    }
}

impl WorldView for BevyAiWorld {
    type Agent = BevyAgentId;
}

impl WorldMut for BevyAiWorld {}

impl NavWorldView for BevyAiWorld {
    fn position(&self, agent: Self::Agent) -> Option<Vec2> {
        self.positions.get(&agent).copied()
    }

    fn navigator(&self) -> &dyn Navigator {
        &*self.navigator
    }
}

impl NavWorldMut for BevyAiWorld {
    fn set_position(&mut self, agent: Self::Agent, position: Vec2) {
        self.positions.insert(agent, position);
    }
}

#[derive(Default)]
pub struct BevyBrainRegistry {
    brains: BTreeMap<BevyAgentId, Brain<BevyAiWorld>>,
}

impl BevyBrainRegistry {
    pub fn insert(&mut self, brain: Brain<BevyAiWorld>) {
        self.brains.insert(brain.agent, brain);
    }

    pub fn remove(&mut self, agent: BevyAgentId) -> Option<Brain<BevyAiWorld>> {
        self.brains.remove(&agent)
    }

    pub fn get(&self, agent: BevyAgentId) -> Option<&Brain<BevyAiWorld>> {
        self.brains.get(&agent)
    }

    pub fn get_mut(&mut self, agent: BevyAgentId) -> Option<&mut Brain<BevyAiWorld>> {
        self.brains.get_mut(&agent)
    }

    /// Returns an iterator over all agents in the registry.
    pub fn agents(&self) -> impl Iterator<Item = BevyAgentId> + '_ {
        self.brains.keys().copied()
    }

    /// Returns the number of registered brains.
    pub fn len(&self) -> usize {
        self.brains.len()
    }

    /// Returns true if no brains are registered.
    pub fn is_empty(&self) -> bool {
        self.brains.is_empty()
    }
}

#[derive(SystemSet, Debug, Hash, PartialEq, Eq, Clone)]
pub enum AiBevySet {
    SyncIn,
    Think,
    SyncOut,
}

#[cfg(not(feature = "transform-sync"))]
pub fn sync_world_from_bevy(
    navmesh: Option<Res<AiNavMesh>>,
    mut world: ResMut<BevyAiWorld>,
    query: Query<(&AiAgent, &AiPosition)>,
) {
    if let Some(navmesh) = navmesh {
        world.navigator = navmesh.0.clone();
    }

    world.positions.clear();
    for (agent, pos) in query.iter() {
        if world.positions.insert(agent.0, pos.0).is_some() {
            panic!(
                "duplicate AiAgent id {} detected; stable IDs must be unique for deterministic AI",
                agent.0.0
            );
        }
    }
}

#[cfg(feature = "transform-sync")]
pub fn sync_world_from_bevy(
    navmesh: Option<Res<AiNavMesh>>,
    sync: Res<AiTransformSyncConfig>,
    mut world: ResMut<BevyAiWorld>,
    query: Query<(&AiAgent, Option<&AiPosition>, Option<&Transform>)>,
) {
    if let Some(navmesh) = navmesh {
        world.navigator = navmesh.0.clone();
    }

    world.positions.clear();

    let mut seen = BTreeSet::new();
    for (agent, pos, transform) in query.iter() {
        if !seen.insert(agent.0) {
            panic!(
                "duplicate AiAgent id {} detected; stable IDs must be unique for deterministic AI",
                agent.0.0
            );
        }

        let position = if sync.read_from_transform {
            transform.map(|t| vec2_from_transform(t, sync.plane))
        } else {
            None
        }
        .or_else(|| pos.map(|p| p.0));

        if let Some(position) = position {
            world.positions.insert(agent.0, position);
        }
    }
}

#[cfg(feature = "time")]
pub fn sync_tick_dt_from_bevy_time(time: Option<Res<Time>>, mut tick: ResMut<AiTick>) {
    let Some(time) = time else {
        return;
    };

    let dt = time.delta_secs();
    if dt.is_finite() && dt.is_sign_positive() {
        tick.dt_seconds = dt;
    }
}

#[cfg(feature = "trace")]
pub fn ensure_trace_log(mut registry: NonSendMut<BevyBrainRegistry>) {
    for brain in registry.brains.values_mut() {
        if !brain.blackboard.contains(TRACE_LOG) {
            brain.blackboard.set(TRACE_LOG, TraceLog::default());
        }

        if let Some(log) = brain.blackboard.get_mut(TRACE_LOG) {
            log.events.clear();
        }
    }
}

#[cfg(feature = "trace")]
pub fn flush_trace_events(
    mut registry: NonSendMut<BevyBrainRegistry>,
    mut writer: EventWriter<AiTraceEvent>,
) {
    for brain in registry.brains.values_mut() {
        let Some(log) = brain.blackboard.get_mut(TRACE_LOG) else {
            continue;
        };

        for event in log.events.drain(..) {
            writer.write(AiTraceEvent {
                agent: brain.agent,
                event,
            });
        }
    }
}

/// Ticks all registered brains in deterministic ID order.
pub fn tick_ai_brains(
    mut tick: ResMut<AiTick>,
    mut world: ResMut<BevyAiWorld>,
    mut registry: NonSendMut<BevyBrainRegistry>,
) {
    let ctx = TickContext {
        tick: tick.tick,
        dt_seconds: tick.dt_seconds,
        seed: tick.seed,
    };
    tick.tick = tick.tick.wrapping_add(1);

    for brain in registry.brains.values_mut() {
        if world.positions.contains_key(&brain.agent) {
            brain.tick(&ctx, &mut world);
        }
    }
}

#[cfg(not(feature = "transform-sync"))]
pub fn sync_world_to_bevy(
    world: Res<BevyAiWorld>,
    mut query: Query<(&AiAgent, &mut AiPosition)>,
) {
    for (agent, mut pos) in query.iter_mut() {
        if let Some(p) = world.positions.get(&agent.0).copied() {
            pos.0 = p;
        }
    }
}

#[cfg(feature = "transform-sync")]
pub fn sync_world_to_bevy(
    sync: Res<AiTransformSyncConfig>,
    world: Res<BevyAiWorld>,
    mut query: Query<(&AiAgent, Option<&mut AiPosition>, Option<&mut Transform>)>,
) {
    for (agent, pos, transform) in query.iter_mut() {
        let Some(p) = world.positions.get(&agent.0).copied() else {
            continue;
        };

        if let Some(mut pos) = pos {
            pos.0 = p;
        }

        if sync.write_to_transform {
            if let Some(mut transform) = transform {
                write_transform_translation(&mut transform, sync.plane, sync.height, p);
            }
        }
    }
}

/// Sync perception data (facing, loudness, visibility) from Bevy components.
pub fn sync_perception_data(
    raycast: Option<Res<AiRaycastCallback>>,
    mut world: ResMut<BevyAiWorld>,
    query: Query<(
        &AiAgent,
        Option<&AiFacing>,
        Option<&AiLoudness>,
        Option<&AiVisibility>,
    )>,
) {
    // Update raycast callback if resource exists
    if let Some(raycast) = raycast {
        world.raycast_callback = raycast.0.clone();
    }

    world.perception_data.clear();

    for (agent, facing, loudness, visibility) in query.iter() {
        let data = AgentPerceptionData {
            facing: facing.map(|f| f.0).unwrap_or(Vec2::new(1.0, 0.0)),
            loudness: loudness.map(|l| l.0).unwrap_or(0.0),
            visible: visibility.map(|v| v.visible).unwrap_or(true),
            visibility_modifier: visibility.map(|v| v.modifier).unwrap_or(1.0),
        };
        world.perception_data.insert(agent.0, data);
    }

    // Rebuild spatial hash for efficient radius queries
    world.rebuild_spatial_hash();
}

/// PerceptionWorldView implementation for BevyAiWorld.
#[cfg(feature = "perception")]
#[cfg_attr(docsrs, doc(cfg(feature = "perception")))]
impl ai_perception::PerceptionWorldView for BevyAiWorld {
    fn position(&self, agent: Self::Agent) -> Option<Vec2> {
        self.positions.get(&agent).copied()
    }

    fn facing(&self, agent: Self::Agent) -> Option<Vec2> {
        self.perception_data
            .get(&agent)
            .map(|d| d.facing)
            .or(Some(Vec2::new(1.0, 0.0)))
    }

    fn entities_in_radius(&self, center: Vec2, radius: f32) -> Vec<Self::Agent> {
        let radius2 = radius * radius;
        let cells_to_check = (radius / self.spatial_cell_size).ceil() as i32 + 1;
        let center_cell = self.pos_to_cell(center);

        let mut result = Vec::new();

        for dy in -cells_to_check..=cells_to_check {
            for dx in -cells_to_check..=cells_to_check {
                let cell = (center_cell.0 + dx, center_cell.1 + dy);
                if let Some(bucket) = self.spatial_buckets.get(&cell) {
                    for &agent in bucket {
                        if let Some(&pos) = self.positions.get(&agent) {
                            let delta = pos - center;
                            if delta.dot(delta) <= radius2 {
                                result.push(agent);
                            }
                        }
                    }
                }
            }
        }

        // Sort for determinism
        result.sort_by_key(|a| a.0);
        result
    }

    fn raycast_blocked(&self, from: Vec2, to: Vec2) -> bool {
        (self.raycast_callback)(from, to)
    }

    fn loudness(&self, agent: Self::Agent) -> f32 {
        self.perception_data
            .get(&agent)
            .map(|d| d.loudness)
            .unwrap_or(0.0)
    }

    fn is_visible(&self, agent: Self::Agent) -> bool {
        self.perception_data
            .get(&agent)
            .map(|d| d.visible)
            .unwrap_or(true)
    }

    fn visibility_modifier(&self, agent: Self::Agent) -> f32 {
        self.perception_data
            .get(&agent)
            .map(|d| d.visibility_modifier)
            .unwrap_or(1.0)
    }
}

pub struct AiBevyPlugin {
    schedule: AiBevySchedule,
}

impl Default for AiBevyPlugin {
    fn default() -> Self {
        Self {
            schedule: AiBevySchedule::Update,
        }
    }
}

impl AiBevyPlugin {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn in_fixed_update(mut self) -> Self {
        self.schedule = AiBevySchedule::FixedUpdate;
        self
    }

    pub fn schedule(&self) -> AiBevySchedule {
        self.schedule
    }
}

impl Plugin for AiBevyPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<AiTick>();
        app.init_resource::<BevyAiWorld>();
        app.init_non_send_resource::<BevyBrainRegistry>();

        #[cfg(feature = "transform-sync")]
        app.init_resource::<AiTransformSyncConfig>();

        #[cfg(feature = "trace")]
        app.add_event::<AiTraceEvent>();

        let systems = (
            #[cfg(feature = "time")]
            sync_tick_dt_from_bevy_time.in_set(AiBevySet::SyncIn),
            sync_world_from_bevy.in_set(AiBevySet::SyncIn),
            sync_perception_data.in_set(AiBevySet::SyncIn),
            #[cfg(feature = "trace")]
            ensure_trace_log.in_set(AiBevySet::SyncIn),
            tick_ai_brains.in_set(AiBevySet::Think),
            #[cfg(feature = "trace")]
            flush_trace_events.in_set(AiBevySet::SyncOut),
            sync_world_to_bevy.in_set(AiBevySet::SyncOut),
        );

        match self.schedule {
            AiBevySchedule::Update => {
                app.configure_sets(
                    Update,
                    (AiBevySet::SyncIn, AiBevySet::Think, AiBevySet::SyncOut).chain(),
                );
                app.add_systems(Update, systems);
            }
            AiBevySchedule::FixedUpdate => {
                app.configure_sets(
                    FixedUpdate,
                    (AiBevySet::SyncIn, AiBevySet::Think, AiBevySet::SyncOut).chain(),
                );
                app.add_systems(FixedUpdate, systems);
            }
        }
    }
}

#[cfg(feature = "trace-egui")]
#[cfg_attr(docsrs, doc(cfg(feature = "trace-egui")))]
pub mod trace_egui;

#[cfg(feature = "trace-egui")]
#[cfg_attr(docsrs, doc(cfg(feature = "trace-egui")))]
pub use trace_egui::{AiTraceEguiPlugin, AiTraceEguiState};

// Re-export ai-perception types when the feature is enabled.
#[cfg(feature = "perception")]
#[cfg_attr(docsrs, doc(cfg(feature = "perception")))]
pub use ai_perception::{
    AlertnessConfig, AlertnessLevel, AlertnessState, HearingConfig, MemoryConfig,
    PerceptionConfig, PerceptionResult, PerceptionSystem, PerceptionWorldView, SightConfig,
};

// Crowd avoidance module.
#[cfg(feature = "crowd")]
#[cfg_attr(docsrs, doc(cfg(feature = "crowd")))]
pub mod crowd;

#[cfg(feature = "crowd")]
#[cfg_attr(docsrs, doc(cfg(feature = "crowd")))]
pub use crowd::{AiCrowdAgent, AiCrowdConfig, AiCrowdPlugin, AiCrowdSolver};

// Dialogue system module.
#[cfg(feature = "dialogue")]
#[cfg_attr(docsrs, doc(cfg(feature = "dialogue")))]
pub mod dialogue;

#[cfg(feature = "dialogue")]
#[cfg_attr(docsrs, doc(cfg(feature = "dialogue")))]
pub use dialogue::{
    AiDialoguePlugin, AiDialogueState, AiDialogueTrees, AdvanceLine, DialogueChanged,
    DialogueEffectEvent, EndDialogue, SelectResponse, StartDialogue,
};
