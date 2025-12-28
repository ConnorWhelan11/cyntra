//! Headless self-play harness for game balance evolution.
//!
//! Runs AI-vs-AI games and collects metrics for fitness evaluation.

use std::collections::HashMap;

use backbay_protocol::{CityId, Command, Event, PlayerId};
use serde::{Deserialize, Serialize};

use crate::{
    game::GameEngine,
    mapgen::{generate_map, MapGenConfig},
    rules::CompiledRules,
};

/// Configuration for self-play simulation.
#[derive(Clone, Debug)]
pub struct SelfPlayConfig {
    /// Map width in tiles.
    pub map_width: u32,
    /// Map height in tiles.
    pub map_height: u32,
    /// Number of players (all AI).
    pub num_players: u32,
    /// Random seed for determinism.
    pub seed: u64,
    /// Maximum turns before declaring a draw.
    pub max_turns: u32,
    /// Water ratio for map generation.
    pub water_ratio: f32,
    /// Elevation variance for map generation.
    pub elevation_variance: f32,
}

impl Default for SelfPlayConfig {
    fn default() -> Self {
        Self {
            map_width: 30,
            map_height: 20,
            num_players: 2,
            seed: 42,
            max_turns: 150,
            water_ratio: 0.3,
            elevation_variance: 0.4,
        }
    }
}

/// Victory condition outcome.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum VictoryCondition {
    /// A player eliminated all others (captured all capitals).
    Domination { winner: u8 },
    /// Game reached max turns, winner by score.
    ScoreVictory { winner: u8, scores: Vec<i32> },
    /// Game reached max turns with a tie.
    Draw,
    /// All players eliminated (shouldn't happen normally).
    Stalemate,
}

/// Metrics collected during a self-play game.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GameMetrics {
    /// Total turns played.
    pub turns_played: u32,
    /// Per-player statistics.
    pub player_stats: Vec<PlayerStats>,
    /// Total combat events.
    pub total_combats: u32,
    /// Total cities founded.
    pub total_cities_founded: u32,
    /// Total techs researched.
    pub total_techs_researched: u32,
    /// Total units killed.
    pub total_units_killed: u32,
    /// Whether the game ended in domination.
    pub ended_by_domination: bool,
}

/// Per-player statistics.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PlayerStats {
    pub player_id: u8,
    /// Final score (gold + culture + cities*100 + techs*50).
    pub final_score: i32,
    /// Cities founded during the game.
    pub cities_founded: u32,
    /// Cities captured from opponents.
    pub cities_captured: u32,
    /// Cities lost to opponents.
    pub cities_lost: u32,
    /// Units killed.
    pub units_killed: u32,
    /// Units lost.
    pub units_lost: u32,
    /// Technologies researched.
    pub techs_researched: u32,
    /// Policies adopted.
    pub policies_adopted: u32,
    /// Final gold.
    pub final_gold: i32,
    /// Final culture.
    pub final_culture: i32,
    /// Final city count.
    pub final_city_count: u32,
    /// Is this player eliminated?
    pub eliminated: bool,
}

/// Result of a self-play game.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SelfPlayResult {
    /// Seed used for this game.
    pub seed: u64,
    /// Victory condition outcome.
    pub victory: VictoryCondition,
    /// Collected metrics.
    pub metrics: GameMetrics,
    /// Duration in milliseconds (wall clock).
    pub duration_ms: u64,
}

/// Batch self-play results for evolution.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchSelfPlayResult {
    /// Number of games played.
    pub games_played: u32,
    /// Individual game results.
    pub results: Vec<SelfPlayResult>,
    /// Aggregated metrics for evolution fitness.
    pub aggregate: AggregateMetrics,
}

/// Aggregated metrics across multiple games.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AggregateMetrics {
    /// Average game length in turns.
    pub avg_game_length: f64,
    /// Standard deviation of game length.
    pub game_length_std: f64,
    /// Win rate per player (should be ~equal for balanced games).
    pub win_rates: Vec<f64>,
    /// Win rate balance score (1.0 = perfectly balanced, 0.0 = one player always wins).
    pub win_rate_balance: f64,
    /// Fraction of games ending in domination.
    pub domination_rate: f64,
    /// Average total combats per game.
    pub avg_combats: f64,
    /// Average cities founded per game.
    pub avg_cities: f64,
    /// Average techs researched per game.
    pub avg_techs: f64,
}

/// Run a single self-play game.
pub fn run_selfplay(rules: CompiledRules, config: &SelfPlayConfig) -> SelfPlayResult {
    let start = std::time::Instant::now();

    // Generate map.
    let map_config = MapGenConfig {
        width: config.map_width,
        height: config.map_height,
        num_players: config.num_players,
        wrap_horizontal: true,
        water_ratio: config.water_ratio,
        elevation_variance: config.elevation_variance,
        resource_density: 0.15,
    };
    let generated = generate_map(&rules, &map_config, config.seed);

    // Create game engine with generated map.
    let mut engine = GameEngine::new_game_with_generated_map(
        rules,
        config.seed,
        generated.tiles,
        generated.width,
        generated.height,
        generated.wrap_horizontal,
        &generated.start_positions,
        config.num_players,
    );

    // Set all players to AI.
    for player in engine.state_mut().players.iter_mut() {
        player.is_ai = true;
    }

    // Track metrics.
    let mut metrics = GameMetrics {
        player_stats: (0..config.num_players)
            .map(|i| PlayerStats {
                player_id: i as u8,
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    };

    // Track capital cities for domination victory.
    let mut capitals: HashMap<PlayerId, CityId> = HashMap::new();
    let mut eliminated: Vec<bool> = vec![false; config.num_players as usize];

    // Main game loop.
    loop {
        let turn = engine.state().turn;
        if turn > config.max_turns {
            break;
        }

        // Apply EndTurn command (triggers AI for all players).
        let events = engine.apply_command(Command::EndTurn);

        // Process events for metrics.
        for event in &events {
            process_event_for_metrics(event, &mut metrics, &mut capitals, &mut eliminated);
        }

        // Check victory conditions.
        if let Some(victory) =
            check_victory_conditions(&engine, &capitals, &eliminated, config.num_players)
        {
            metrics.turns_played = engine.state().turn;
            metrics.ended_by_domination = matches!(victory, VictoryCondition::Domination { .. });

            // Collect final player stats.
            finalize_player_stats(&engine, &mut metrics);

            return SelfPlayResult {
                seed: config.seed,
                victory,
                metrics,
                duration_ms: start.elapsed().as_millis() as u64,
            };
        }

        metrics.turns_played = turn;
    }

    // Game ended by turn limit - determine winner by score.
    finalize_player_stats(&engine, &mut metrics);

    let scores: Vec<i32> = metrics.player_stats.iter().map(|p| p.final_score).collect();
    let max_score = scores.iter().copied().max().unwrap_or(0);
    let winners: Vec<usize> = scores
        .iter()
        .enumerate()
        .filter(|(_, &s)| s == max_score)
        .map(|(i, _)| i)
        .collect();

    let victory = if winners.len() == 1 {
        VictoryCondition::ScoreVictory {
            winner: winners[0] as u8,
            scores: scores.clone(),
        }
    } else {
        VictoryCondition::Draw
    };

    SelfPlayResult {
        seed: config.seed,
        victory,
        metrics,
        duration_ms: start.elapsed().as_millis() as u64,
    }
}

/// Run multiple self-play games with different seeds.
pub fn run_batch_selfplay(
    rules: CompiledRules,
    config: &SelfPlayConfig,
    num_games: u32,
) -> BatchSelfPlayResult {
    let mut results = Vec::with_capacity(num_games as usize);

    for i in 0..num_games {
        let mut game_config = config.clone();
        game_config.seed = config.seed.wrapping_add(i as u64);
        let result = run_selfplay(rules.clone(), &game_config);
        results.push(result);
    }

    let aggregate = compute_aggregate_metrics(&results, config.num_players);

    BatchSelfPlayResult {
        games_played: num_games,
        results,
        aggregate,
    }
}

/// Process an event to update metrics.
fn process_event_for_metrics(
    event: &Event,
    metrics: &mut GameMetrics,
    capitals: &mut HashMap<PlayerId, CityId>,
    eliminated: &mut [bool],
) {
    match event {
        Event::CityFounded { city, owner, .. } => {
            metrics.total_cities_founded += 1;
            if let Some(stats) = metrics.player_stats.get_mut(owner.0 as usize) {
                stats.cities_founded += 1;
            }
            // First city is capital.
            capitals.entry(*owner).or_insert(*city);
        }
        Event::CityConquered {
            city,
            new_owner,
            old_owner,
            ..
        } => {
            if let Some(stats) = metrics.player_stats.get_mut(new_owner.0 as usize) {
                stats.cities_captured += 1;
            }
            if let Some(stats) = metrics.player_stats.get_mut(old_owner.0 as usize) {
                stats.cities_lost += 1;
            }
            // Check if capital was captured.
            if capitals.get(old_owner) == Some(city) {
                if let Some(elim) = eliminated.get_mut(old_owner.0 as usize) {
                    *elim = true;
                }
            }
        }
        Event::CombatEnded {
            attacker_owner,
            defender_owner,
            winner,
            loser,
            ..
        } => {
            metrics.total_combats += 1;
            // Determine who won.
            if winner == loser {
                // Tie? Shouldn't happen.
                return;
            }
            // Winner's owner gets the kill, loser's owner gets the death.
            let loser_owner = if *attacker_owner != *defender_owner {
                defender_owner
            } else {
                attacker_owner
            };
            if let Some(stats) = metrics.player_stats.get_mut(attacker_owner.0 as usize) {
                stats.units_killed += 1;
            }
            if let Some(stats) = metrics.player_stats.get_mut(loser_owner.0 as usize) {
                stats.units_lost += 1;
            }
            metrics.total_units_killed += 1;
        }
        Event::UnitDied { .. } => {
            metrics.total_units_killed += 1;
        }
        Event::TechResearched { player, .. } => {
            metrics.total_techs_researched += 1;
            if let Some(stats) = metrics.player_stats.get_mut(player.0 as usize) {
                stats.techs_researched += 1;
            }
        }
        Event::PolicyAdopted { player, .. } => {
            if let Some(stats) = metrics.player_stats.get_mut(player.0 as usize) {
                stats.policies_adopted += 1;
            }
        }
        _ => {}
    }
}

/// Check if any victory condition is met.
fn check_victory_conditions(
    engine: &GameEngine,
    _capitals: &HashMap<PlayerId, CityId>,
    eliminated: &[bool],
    _num_players: u32,
) -> Option<VictoryCondition> {
    // Count non-eliminated players.
    let alive: Vec<u8> = eliminated
        .iter()
        .enumerate()
        .filter(|(_, &e)| !e)
        .map(|(i, _)| i as u8)
        .collect();

    if alive.len() == 1 {
        return Some(VictoryCondition::Domination { winner: alive[0] });
    }

    if alive.is_empty() {
        return Some(VictoryCondition::Stalemate);
    }

    // Alternative: Check if one player controls all cities.
    let state = engine.state();
    let mut city_counts: HashMap<PlayerId, u32> = HashMap::new();
    for (_id, city) in state.cities.iter_ordered() {
        *city_counts.entry(city.owner).or_insert(0) += 1;
    }

    // If only one player has cities and others have none.
    let players_with_cities: Vec<PlayerId> = city_counts
        .iter()
        .filter(|(_, &count)| count > 0)
        .map(|(&pid, _)| pid)
        .collect();

    if players_with_cities.len() == 1 && state.cities.iter_ordered().count() > 0 {
        // Check if other players have units.
        let winner = players_with_cities[0];
        let others_have_units = state.units.iter_ordered().any(|(_, u)| u.owner != winner);
        if !others_have_units {
            return Some(VictoryCondition::Domination { winner: winner.0 });
        }
    }

    None
}

/// Finalize player stats from game state.
fn finalize_player_stats(engine: &GameEngine, metrics: &mut GameMetrics) {
    let state = engine.state();

    for stats in metrics.player_stats.iter_mut() {
        let player_id = PlayerId(stats.player_id);

        // Count cities.
        stats.final_city_count = state
            .cities
            .iter_ordered()
            .filter(|(_, c)| c.owner == player_id)
            .count() as u32;

        // Get player state.
        if let Some(player) = state.players.get(stats.player_id as usize) {
            stats.final_gold = player.gold;
            stats.final_culture = player.culture;

            // Count known techs.
            let known_techs = player.known_techs.iter().filter(|&&k| k).count() as u32;

            // Calculate score.
            stats.final_score = player.gold
                + player.culture
                + (stats.final_city_count as i32 * 100)
                + (known_techs as i32 * 50)
                + (stats.units_killed as i32 * 10);
        }

        stats.eliminated = stats.final_city_count == 0;
    }
}

/// Compute aggregate metrics from batch results.
fn compute_aggregate_metrics(results: &[SelfPlayResult], num_players: u32) -> AggregateMetrics {
    if results.is_empty() {
        return AggregateMetrics::default();
    }

    let n = results.len() as f64;

    // Game length stats.
    let lengths: Vec<f64> = results
        .iter()
        .map(|r| r.metrics.turns_played as f64)
        .collect();
    let avg_length = lengths.iter().sum::<f64>() / n;
    let variance = lengths
        .iter()
        .map(|&l| (l - avg_length).powi(2))
        .sum::<f64>()
        / n;
    let std_length = variance.sqrt();

    // Win rates.
    let mut wins: Vec<u32> = vec![0; num_players as usize];
    let mut domination_count = 0u32;

    for result in results {
        match &result.victory {
            VictoryCondition::Domination { winner } => {
                if let Some(w) = wins.get_mut(*winner as usize) {
                    *w += 1;
                }
                domination_count += 1;
            }
            VictoryCondition::ScoreVictory { winner, .. } => {
                if let Some(w) = wins.get_mut(*winner as usize) {
                    *w += 1;
                }
            }
            VictoryCondition::Draw | VictoryCondition::Stalemate => {}
        }
    }

    let win_rates: Vec<f64> = wins.iter().map(|&w| w as f64 / n).collect();

    // Win rate balance: 1 - max deviation from expected (1/num_players).
    let expected = 1.0 / num_players as f64;
    let max_deviation = win_rates
        .iter()
        .map(|&r| (r - expected).abs())
        .max_by(|a, b| a.partial_cmp(b).unwrap())
        .unwrap_or(0.0);
    let win_rate_balance = 1.0 - (max_deviation / expected).min(1.0);

    // Other averages.
    let avg_combats = results
        .iter()
        .map(|r| r.metrics.total_combats as f64)
        .sum::<f64>()
        / n;
    let avg_cities = results
        .iter()
        .map(|r| r.metrics.total_cities_founded as f64)
        .sum::<f64>()
        / n;
    let avg_techs = results
        .iter()
        .map(|r| r.metrics.total_techs_researched as f64)
        .sum::<f64>()
        / n;

    AggregateMetrics {
        avg_game_length: avg_length,
        game_length_std: std_length,
        win_rates,
        win_rate_balance,
        domination_rate: domination_count as f64 / n,
        avg_combats,
        avg_cities,
        avg_techs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::{load_rules, RulesSource};

    #[test]
    fn test_selfplay_completes() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let config = SelfPlayConfig {
            map_width: 20,
            map_height: 15,
            num_players: 2,
            seed: 12345,
            max_turns: 50,
            ..Default::default()
        };

        let result = run_selfplay(rules, &config);

        assert!(result.metrics.turns_played > 0);
        assert!(result.metrics.turns_played <= 50);
        println!("Game completed in {} turns", result.metrics.turns_played);
        println!("Victory: {:?}", result.victory);
        println!("Duration: {}ms", result.duration_ms);
    }

    #[test]
    fn test_batch_selfplay() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let config = SelfPlayConfig {
            map_width: 15,
            map_height: 10,
            num_players: 2,
            seed: 1000,
            max_turns: 30,
            ..Default::default()
        };

        let batch = run_batch_selfplay(rules, &config, 5);

        assert_eq!(batch.games_played, 5);
        assert_eq!(batch.results.len(), 5);
        println!("Avg game length: {:.1}", batch.aggregate.avg_game_length);
        println!("Win rates: {:?}", batch.aggregate.win_rates);
        println!("Win rate balance: {:.2}", batch.aggregate.win_rate_balance);
    }
}
