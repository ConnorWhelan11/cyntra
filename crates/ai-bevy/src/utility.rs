//! Utility AI integration for Bevy.
//!
//! This module bridges `ai-utility` with Bevy ECS, providing:
//! - Components for tracking option scores and selection
//! - Events for option selection changes
//! - Debug visualization for utility scores
//!
//! ## Architecture
//!
//! Utility AI in Bevy works through these components:
//! - `UtilityScores`: Current scores for all options
//! - `UtilitySelection`: The currently selected option
//!
//! The actual scoring and selection happens through `ai-utility::UtilityPolicy`
//! which is stored in the agent's `Brain`.

use bevy_ecs::prelude::*;

/// Component tracking utility scores for an agent's options.
#[derive(Component, Debug, Clone, Default)]
pub struct UtilityScores {
    /// Scores for each option, keyed by option name.
    pub scores: Vec<UtilityOptionScore>,
    /// The tick when scores were last updated.
    pub last_update_tick: u64,
}

/// Score information for a single option.
#[derive(Debug, Clone)]
pub struct UtilityOptionScore {
    /// Name/key of the option.
    pub name: &'static str,
    /// Current score (higher is better).
    pub score: f32,
    /// Whether this option is currently selected.
    pub selected: bool,
    /// Whether this option is eligible (above min_score threshold).
    pub eligible: bool,
}

impl UtilityScores {
    /// Update scores for a new tick.
    pub fn update(&mut self, tick: u64, scores: Vec<UtilityOptionScore>) {
        self.scores = scores;
        self.last_update_tick = tick;
    }

    /// Get the currently selected option, if any.
    pub fn selected(&self) -> Option<&UtilityOptionScore> {
        self.scores.iter().find(|s| s.selected)
    }

    /// Get the highest scoring option.
    pub fn best(&self) -> Option<&UtilityOptionScore> {
        self.scores
            .iter()
            .filter(|s| s.eligible)
            .max_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal))
    }

    /// Get scores sorted by value (highest first).
    pub fn sorted(&self) -> Vec<&UtilityOptionScore> {
        let mut sorted: Vec<_> = self.scores.iter().collect();
        sorted.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        sorted
    }
}

/// Component tracking the currently selected utility option.
#[derive(Component, Debug, Clone, Default)]
pub struct UtilitySelection {
    /// Currently selected option name.
    pub current: Option<&'static str>,
    /// Previous selected option name.
    pub previous: Option<&'static str>,
    /// Score of the current selection.
    pub current_score: f32,
    /// How many ticks the current option has been selected.
    pub ticks_selected: u64,
    /// Whether the selection changed this tick.
    pub just_changed: bool,
}

impl UtilitySelection {
    /// Update the selection.
    pub fn select(&mut self, name: &'static str, score: f32) {
        if self.current != Some(name) {
            self.previous = self.current;
            self.current = Some(name);
            self.ticks_selected = 1;
            self.just_changed = true;
        } else {
            self.ticks_selected += 1;
            self.just_changed = false;
        }
        self.current_score = score;
    }

    /// Clear the selection (no option above threshold).
    pub fn clear(&mut self) {
        if self.current.is_some() {
            self.previous = self.current;
            self.current = None;
            self.just_changed = true;
        } else {
            self.just_changed = false;
        }
        self.current_score = f32::NEG_INFINITY;
        self.ticks_selected = 0;
    }
}

/// Event emitted when utility selection changes.
#[derive(Event, Debug, Clone)]
pub struct UtilitySelectionChanged {
    /// The entity whose selection changed.
    pub entity: Entity,
    /// Previous selection.
    pub previous: Option<&'static str>,
    /// New selection.
    pub current: Option<&'static str>,
    /// Score of the new selection.
    pub score: f32,
    /// All option scores at the time of selection.
    pub all_scores: Vec<(&'static str, f32)>,
}

/// Event emitted each tick with all utility scores (for debugging).
#[derive(Event, Debug, Clone)]
pub struct UtilityScoresUpdated {
    /// The entity whose scores were updated.
    pub entity: Entity,
    /// The current tick.
    pub tick: u64,
    /// All scores.
    pub scores: Vec<(&'static str, f32, bool)>, // (name, score, eligible)
}

/// Configuration for utility AI debugging.
#[derive(Resource, Debug, Clone)]
pub struct UtilityDebugConfig {
    /// Show score bars.
    pub show_score_bars: bool,
    /// Show numeric scores.
    pub show_numeric_scores: bool,
    /// Show selection history.
    pub show_history: bool,
    /// Minimum score to display (filter low scores).
    pub display_min_score: f32,
    /// Number of options to show in UI.
    pub max_options_displayed: usize,
    /// Color for selected option.
    pub selected_color: [f32; 4],
    /// Color for eligible options.
    pub eligible_color: [f32; 4],
    /// Color for ineligible options.
    pub ineligible_color: [f32; 4],
}

impl Default for UtilityDebugConfig {
    fn default() -> Self {
        Self {
            show_score_bars: true,
            show_numeric_scores: true,
            show_history: false,
            display_min_score: f32::NEG_INFINITY,
            max_options_displayed: 10,
            selected_color: [0.2, 0.8, 0.2, 1.0],   // Green
            eligible_color: [0.8, 0.8, 0.2, 1.0],   // Yellow
            ineligible_color: [0.5, 0.5, 0.5, 0.5], // Gray
        }
    }
}

/// System that detects changes in UtilitySelection and emits events.
pub fn emit_utility_selection_events(
    mut events: EventWriter<UtilitySelectionChanged>,
    query: Query<(Entity, &UtilitySelection, &UtilityScores), Changed<UtilitySelection>>,
) {
    for (entity, selection, scores) in query.iter() {
        if selection.just_changed {
            events.write(UtilitySelectionChanged {
                entity,
                previous: selection.previous,
                current: selection.current,
                score: selection.current_score,
                all_scores: scores
                    .scores
                    .iter()
                    .map(|s| (s.name, s.score))
                    .collect(),
            });
        }
    }
}

/// Bundle for a Utility AI-enabled agent.
#[derive(Bundle, Default)]
pub struct UtilityAgentBundle {
    /// Score tracking.
    pub scores: UtilityScores,
    /// Selection tracking.
    pub selection: UtilitySelection,
}

/// History entry for utility selection.
#[derive(Debug, Clone)]
pub struct UtilityHistoryEntry {
    /// Tick when selection occurred.
    pub tick: u64,
    /// Selected option.
    pub option: &'static str,
    /// Score at selection time.
    pub score: f32,
}

/// Component for tracking selection history (optional).
#[derive(Component, Debug, Clone, Default)]
pub struct UtilityHistory {
    /// Recent selection history.
    pub entries: Vec<UtilityHistoryEntry>,
    /// Maximum entries to keep.
    pub max_entries: usize,
}

impl UtilityHistory {
    /// Create a new history tracker.
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: Vec::new(),
            max_entries,
        }
    }

    /// Record a selection.
    pub fn record(&mut self, tick: u64, option: &'static str, score: f32) {
        if self.entries.len() >= self.max_entries {
            self.entries.remove(0);
        }
        self.entries.push(UtilityHistoryEntry { tick, option, score });
    }

    /// Get the most recent entry.
    pub fn last(&self) -> Option<&UtilityHistoryEntry> {
        self.entries.last()
    }

    /// Clear history.
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_utility_scores() {
        let mut scores = UtilityScores::default();
        scores.update(
            1,
            vec![
                UtilityOptionScore {
                    name: "Attack",
                    score: 0.8,
                    selected: true,
                    eligible: true,
                },
                UtilityOptionScore {
                    name: "Flee",
                    score: 0.3,
                    selected: false,
                    eligible: true,
                },
                UtilityOptionScore {
                    name: "Idle",
                    score: -0.5,
                    selected: false,
                    eligible: false,
                },
            ],
        );

        assert_eq!(scores.selected().map(|s| s.name), Some("Attack"));
        assert_eq!(scores.best().map(|s| s.name), Some("Attack"));

        let sorted = scores.sorted();
        assert_eq!(sorted[0].name, "Attack");
        assert_eq!(sorted[1].name, "Flee");
    }

    #[test]
    fn test_utility_selection() {
        let mut selection = UtilitySelection::default();
        assert!(selection.current.is_none());

        selection.select("Attack", 0.8);
        assert_eq!(selection.current, Some("Attack"));
        assert!(selection.just_changed);
        assert_eq!(selection.ticks_selected, 1);

        selection.select("Attack", 0.75);
        assert!(!selection.just_changed);
        assert_eq!(selection.ticks_selected, 2);

        selection.select("Flee", 0.9);
        assert!(selection.just_changed);
        assert_eq!(selection.previous, Some("Attack"));
        assert_eq!(selection.current, Some("Flee"));
        assert_eq!(selection.ticks_selected, 1);
    }

    #[test]
    fn test_utility_history() {
        let mut history = UtilityHistory::new(3);

        history.record(1, "Attack", 0.8);
        history.record(2, "Flee", 0.9);
        history.record(3, "Attack", 0.7);

        assert_eq!(history.entries.len(), 3);
        assert_eq!(history.last().map(|e| e.option), Some("Attack"));

        history.record(4, "Idle", 0.5);
        assert_eq!(history.entries.len(), 3); // Capped at max
        assert_eq!(history.entries[0].option, "Flee"); // First entry removed
    }

    #[test]
    fn test_utility_agent_bundle() {
        let bundle = UtilityAgentBundle::default();
        assert!(bundle.scores.scores.is_empty());
        assert!(bundle.selection.current.is_none());
    }
}
