#![allow(clippy::needless_range_loop)]

use backbay_protocol::{CombatModifier, CombatPreview};

use crate::{map::GameMap, rules::CompiledRules, unit::Unit, GameRng};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CombatResult {
    AttackerWins { attacker_hp: i32 },
    DefenderWins { defender_hp: i32 },
}

/// Compute combat preview using DP over HP states.
pub fn calculate_combat_preview(
    attacker: &Unit,
    defender: &Unit,
    map: &GameMap,
    rules: &CompiledRules,
) -> CombatPreview {
    let (att_str, att_mods) = compute_attack_strength(attacker, defender, map, rules);
    let (def_str, def_mods) = compute_defense_strength(defender, attacker, map, rules);

    let att_fp = rules.unit_type(attacker.type_id).firepower;
    let def_fp = rules.unit_type(defender.type_id).firepower;

    let result = combat_dp(att_str, attacker.hp, att_fp, def_str, defender.hp, def_fp);

    CombatPreview {
        attacker_win_pct: (result.attacker_win_prob * 100.0).round() as u8,
        attacker_hp_expected: result.att_hp_expected,
        attacker_hp_best: attacker.hp,
        attacker_hp_worst: if result.attacker_win_prob > 0.0 { 1 } else { 0 },
        defender_hp_expected: result.def_hp_expected,
        defender_hp_best: defender.hp,
        defender_hp_worst: 0,
        attacker_modifiers: att_mods,
        defender_modifiers: def_mods,
    }
}

struct DpResult {
    attacker_win_prob: f64, // display only
    att_hp_expected: i32,
    def_hp_expected: i32,
}

fn combat_dp(
    att_str: i32,
    att_hp: i32,
    att_fp: i32,
    def_str: i32,
    def_hp: i32,
    def_fp: i32,
) -> DpResult {
    if att_hp <= 0 || def_hp <= 0 {
        return DpResult {
            attacker_win_prob: if att_hp > 0 { 1.0 } else { 0.0 },
            att_hp_expected: att_hp.max(0),
            def_hp_expected: def_hp.max(0),
        };
    }

    let total_str = (att_str + def_str).max(1);
    let p_att_hit_milli = (att_str.max(0) * 1000) / total_str;
    let p_att = (p_att_hit_milli as f64) / 1000.0;
    let p_def = 1.0 - p_att;

    let att_hp = att_hp as usize;
    let def_hp = def_hp as usize;
    let att_fp = att_fp.max(1) as usize;
    let def_fp = def_fp.max(1) as usize;

    let mut prob = vec![vec![0.0_f64; def_hp + 1]; att_hp + 1];
    prob[att_hp][def_hp] = 1.0;

    for total in (1..=(att_hp + def_hp)).rev() {
        for a in 1..=att_hp.min(total) {
            let d = total - a;
            if d > def_hp || d == 0 {
                continue;
            }

            let p = prob[a][d];
            if p == 0.0 {
                continue;
            }

            let new_d = d.saturating_sub(att_fp);
            prob[a][new_d] += p * p_att;

            let new_a = a.saturating_sub(def_fp);
            prob[new_a][d] += p * p_def;
        }
    }

    let mut att_wins = 0.0;
    let mut att_hp_sum = 0.0;
    for a in 1..=att_hp {
        att_wins += prob[a][0];
        att_hp_sum += prob[a][0] * (a as f64);
    }

    let mut def_hp_sum = 0.0;
    for d in 1..=def_hp {
        def_hp_sum += prob[0][d] * (d as f64);
    }

    let att_hp_expected = if att_wins <= 0.0 {
        0
    } else {
        (att_hp_sum / att_wins.max(0.001)).round() as i32
    };
    let def_hp_expected = if att_wins >= 1.0 {
        0
    } else {
        (def_hp_sum / (1.0 - att_wins).max(0.001)).round() as i32
    };

    DpResult {
        attacker_win_prob: att_wins.clamp(0.0, 1.0),
        att_hp_expected,
        def_hp_expected,
    }
}

/// Resolve actual combat (uses seeded RNG, deterministic).
pub fn resolve_combat(
    attacker: &mut Unit,
    defender: &mut Unit,
    map: &GameMap,
    rules: &CompiledRules,
    rng: &mut GameRng,
) -> CombatResult {
    let (att_str, _) = compute_attack_strength(attacker, defender, map, rules);
    let (def_str, _) = compute_defense_strength(defender, attacker, map, rules);

    let att_fp = rules.unit_type(attacker.type_id).firepower.max(1);
    let def_fp = rules.unit_type(defender.type_id).firepower.max(1);

    let total_str = (att_str + def_str).max(1);
    while attacker.hp > 0 && defender.hp > 0 {
        let roll = rng.gen_range_i32(0..total_str);
        if roll < att_str {
            defender.hp = (defender.hp - att_fp).max(0);
        } else {
            attacker.hp = (attacker.hp - def_fp).max(0);
        }
    }

    if attacker.hp > 0 {
        CombatResult::AttackerWins {
            attacker_hp: attacker.hp,
        }
    } else {
        CombatResult::DefenderWins {
            defender_hp: defender.hp,
        }
    }
}

fn compute_attack_strength(
    attacker: &Unit,
    _defender: &Unit,
    _map: &GameMap,
    rules: &CompiledRules,
) -> (i32, Vec<CombatModifier>) {
    let base = attacker.attack_strength(rules);
    (base, Vec::new())
}

fn compute_defense_strength(
    defender: &Unit,
    _attacker: &Unit,
    map: &GameMap,
    rules: &CompiledRules,
) -> (i32, Vec<CombatModifier>) {
    let tile = map.get(defender.position).expect("defender in-bounds");
    let base = defender.defense_strength(rules, tile);
    (base, Vec::new())
}

#[cfg(test)]
mod tests {
    use backbay_protocol::{Hex, PlayerId};

    use super::*;
    use crate::rules::{load_rules, RulesSource};

    #[test]
    fn combat_resolution_is_deterministic_given_seed() {
        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let map = GameMap::new(10, 10, true, rules.terrain_id("plains").unwrap());

        let unit_type = rules.unit_type_id("warrior").unwrap();
        let attacker = Unit::new_for_tests(unit_type, PlayerId(0), Hex { q: 0, r: 0 }, &rules);
        let defender = Unit::new_for_tests(unit_type, PlayerId(1), Hex { q: 1, r: 0 }, &rules);

        let mut rng1 = GameRng::seed_from_u64(12345);
        let mut rng2 = GameRng::seed_from_u64(12345);

        let mut attacker1 = attacker.clone();
        let mut defender1 = defender.clone();
        let result1 = resolve_combat(&mut attacker1, &mut defender1, &map, &rules, &mut rng1);

        let mut attacker2 = attacker;
        let mut defender2 = defender;
        let result2 = resolve_combat(&mut attacker2, &mut defender2, &map, &rules, &mut rng2);

        assert_eq!(result1, result2);
    }
}
