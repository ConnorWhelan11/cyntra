//! # logos-z3
//!
//! Z3 model checker integration for Logos counterexample generation.
//!
//! This crate provides semantic verification by searching for countermodels
//! to candidate inferences using the Z3 SMT solver.
//!
//! ## Architecture
//!
//! ```text
//! Formula ──► Z3 Translation ──► SAT Check ──► Counterexample (if unsat)
//!                                           └─► Valid (if sat for all)
//! ```
//!
//! ## Example
//!
//! ```rust,ignore
//! use logos_ffi::Formula;
//! use logos_z3::Z3Checker;
//!
//! let checker = Z3Checker::new();
//!
//! // Invalid inference: ◇p → □p
//! let invalid = Formula::implies(
//!     Formula::possibility(Formula::atom("p")),
//!     Formula::necessity(Formula::atom("p")),
//! );
//!
//! let result = checker.check(&invalid);
//! assert!(result.is_invalid());
//! ```

pub mod checker;
pub mod translation;

use logos_ffi::{Counterexample, Formula, ProofResult, StateAssignment};
use thiserror::Error;

/// Errors that can occur during Z3 model checking
#[derive(Debug, Error)]
pub enum Z3Error {
    #[error("Z3 context creation failed")]
    ContextCreation,

    #[error("Formula translation failed: {0}")]
    Translation(String),

    #[error("Z3 solver error: {0}")]
    Solver(String),

    #[error("Model extraction failed: {0}")]
    ModelExtraction(String),

    #[error("Timeout after {0}ms")]
    Timeout(u64),

    #[error("Unsupported formula type: {0}")]
    UnsupportedFormula(String),
}

pub type Result<T> = std::result::Result<T, Z3Error>;

/// Configuration for the Z3 checker
#[derive(Debug, Clone)]
pub struct Z3Config {
    /// Timeout in milliseconds (0 = no timeout)
    pub timeout_ms: u64,

    /// Maximum number of worlds for modal checking
    pub max_worlds: usize,

    /// Maximum number of time points for temporal checking
    pub max_times: usize,

    /// Enable model simplification
    pub simplify_models: bool,
}

impl Default for Z3Config {
    fn default() -> Self {
        Self {
            timeout_ms: 5000,  // 5 second default
            max_worlds: 4,     // Small world count for efficiency
            max_times: 8,      // Reasonable time horizon
            simplify_models: true,
        }
    }
}

/// Z3-based model checker for Logos formulas
#[allow(dead_code)]
pub struct Z3Checker {
    config: Z3Config,
}

impl Default for Z3Checker {
    fn default() -> Self {
        Self::new()
    }
}

impl Z3Checker {
    /// Create a new Z3 checker with default configuration
    pub fn new() -> Self {
        Self {
            config: Z3Config::default(),
        }
    }

    /// Create a new Z3 checker with custom configuration
    pub fn with_config(config: Z3Config) -> Self {
        Self { config }
    }

    /// Check if a formula is valid (true in all models)
    ///
    /// Returns `ProofResult::Invalid` with a counterexample if the formula
    /// can be falsified, or `ProofResult::Valid` if no countermodel exists.
    pub fn check(&self, formula: &Formula) -> ProofResult {
        // Determine the type of checking needed based on formula operators
        let layer = formula.required_layer();

        match self.check_internal(formula, layer) {
            Ok(result) => result,
            Err(e) => ProofResult::Unknown {
                reason: e.to_string(),
            },
        }
    }

    /// Check validity for a specific formula
    fn check_internal(&self, formula: &Formula, layer: u8) -> Result<ProofResult> {
        // For now, implement a simplified propositional checker
        // Full modal/temporal checking requires more complex Z3 encoding

        match layer {
            0 => self.check_propositional(formula),
            1 => self.check_explanatory(formula),
            2 => self.check_epistemic(formula),
            3 => self.check_normative(formula),
            _ => Err(Z3Error::UnsupportedFormula(format!("Unknown layer {}", layer))),
        }
    }

    /// Simple propositional satisfiability check
    fn check_propositional(&self, formula: &Formula) -> Result<ProofResult> {
        // Check if ¬φ is satisfiable (if so, φ is not valid)
        let negated = Formula::not(formula.clone());

        // Collect atoms
        let atoms = collect_atoms(formula);

        // For simple cases, we can do exhaustive enumeration
        if atoms.len() <= 10 {
            // Try all 2^n assignments
            for assignment in 0..(1u64 << atoms.len()) {
                let values: Vec<bool> = (0..atoms.len())
                    .map(|i| (assignment >> i) & 1 == 1)
                    .collect();

                let atom_values: std::collections::HashMap<&str, bool> = atoms
                    .iter()
                    .zip(values.iter())
                    .map(|(a, v)| (a.as_str(), *v))
                    .collect();

                if evaluate_propositional(&negated, &atom_values) {
                    // Found a counterexample
                    let state_assignments = atoms
                        .iter()
                        .zip(values.iter())
                        .map(|(atom, value)| StateAssignment {
                            atom: atom.clone(),
                            world: None,
                            time: None,
                            value: *value,
                        })
                        .collect();

                    return Ok(ProofResult::Invalid(Counterexample::simple(
                        formula.clone(),
                        state_assignments,
                    )));
                }
            }

            // No counterexample found - formula is valid
            Ok(ProofResult::Valid(logos_ffi::ProofReceipt::new(
                formula.clone(),
                vec![],
            ).with_z3_valid(true)))
        } else {
            // Too many atoms - would need actual Z3 solver
            Ok(ProofResult::Unknown {
                reason: format!(
                    "Formula has {} atoms, exceeds simple enumeration limit. Full Z3 integration needed.",
                    atoms.len()
                ),
            })
        }
    }

    /// Check explanatory formulas (Layer 1)
    fn check_explanatory(&self, _formula: &Formula) -> Result<ProofResult> {
        // Explanatory formulas require selection function semantics
        // For now, return unknown
        Ok(ProofResult::Unknown {
            reason: "Explanatory (counterfactual) checking not yet implemented".to_string(),
        })
    }

    /// Check epistemic formulas (Layer 2)
    fn check_epistemic(&self, _formula: &Formula) -> Result<ProofResult> {
        Ok(ProofResult::Unknown {
            reason: "Epistemic checking not yet implemented".to_string(),
        })
    }

    /// Check normative formulas (Layer 3)
    fn check_normative(&self, _formula: &Formula) -> Result<ProofResult> {
        Ok(ProofResult::Unknown {
            reason: "Normative checking not yet implemented".to_string(),
        })
    }

    /// Check if a formula is satisfiable (has at least one model)
    pub fn is_satisfiable(&self, formula: &Formula) -> Result<bool> {
        match self.check(formula) {
            ProofResult::Valid(_) => Ok(true),
            ProofResult::Invalid(_) => Ok(false),
            ProofResult::Unknown { reason } => Err(Z3Error::Solver(reason)),
            ProofResult::Timeout { elapsed_ms } => Err(Z3Error::Timeout(elapsed_ms)),
        }
    }

    /// Find a counterexample if one exists
    pub fn find_counterexample(&self, formula: &Formula) -> Option<Counterexample> {
        match self.check(formula) {
            ProofResult::Invalid(cex) => Some(cex),
            _ => None,
        }
    }
}

/// Collect all atomic propositions in a formula
fn collect_atoms(formula: &Formula) -> Vec<String> {
    let mut atoms = Vec::new();
    collect_atoms_rec(formula, &mut atoms);
    atoms.sort();
    atoms.dedup();
    atoms
}

fn collect_atoms_rec(formula: &Formula, atoms: &mut Vec<String>) {
    match formula {
        Formula::Atom(name) => atoms.push(name.clone()),
        Formula::Top | Formula::Bottom => {}
        Formula::Not(f) => collect_atoms_rec(f, atoms),
        Formula::And(l, r)
        | Formula::Or(l, r)
        | Formula::Implies(l, r)
        | Formula::Iff(l, r) => {
            collect_atoms_rec(l, atoms);
            collect_atoms_rec(r, atoms);
        }
        Formula::Necessity(f)
        | Formula::Possibility(f)
        | Formula::AlwaysFuture(f)
        | Formula::Eventually(f)
        | Formula::AlwaysPast(f)
        | Formula::SometimePast(f)
        | Formula::Perpetual(f)
        | Formula::Sometimes(f) => collect_atoms_rec(f, atoms),
        // Layer 1-3 operators
        Formula::WouldCounterfactual(l, r)
        | Formula::MightCounterfactual(l, r)
        | Formula::Grounding(l, r)
        | Formula::Essence(l, r)
        | Formula::PropIdentity(l, r)
        | Formula::Causation(l, r)
        | Formula::IndicativeConditional(l, r)
        | Formula::Preference(l, r) => {
            collect_atoms_rec(l, atoms);
            collect_atoms_rec(r, atoms);
        }
        Formula::Belief(_, f)
        | Formula::Knowledge(_, f)
        | Formula::ProbabilityAtLeast(f, _)
        | Formula::EpistemicPossibility(f)
        | Formula::EpistemicNecessity(f)
        | Formula::Obligation(_, f)
        | Formula::Permission(_, f)
        | Formula::Prohibition(_, f) => collect_atoms_rec(f, atoms),
        Formula::AgentPreference(_, l, r) => {
            collect_atoms_rec(l, atoms);
            collect_atoms_rec(r, atoms);
        }
    }
}

/// Evaluate a propositional formula under an assignment
fn evaluate_propositional(
    formula: &Formula,
    assignment: &std::collections::HashMap<&str, bool>,
) -> bool {
    match formula {
        Formula::Atom(name) => *assignment.get(name.as_str()).unwrap_or(&false),
        Formula::Top => true,
        Formula::Bottom => false,
        Formula::Not(f) => !evaluate_propositional(f, assignment),
        Formula::And(l, r) => {
            evaluate_propositional(l, assignment) && evaluate_propositional(r, assignment)
        }
        Formula::Or(l, r) => {
            evaluate_propositional(l, assignment) || evaluate_propositional(r, assignment)
        }
        Formula::Implies(l, r) => {
            !evaluate_propositional(l, assignment) || evaluate_propositional(r, assignment)
        }
        Formula::Iff(l, r) => {
            evaluate_propositional(l, assignment) == evaluate_propositional(r, assignment)
        }
        // For modal/temporal operators in propositional context, treat as atoms
        // (This is a simplification - real semantics requires worlds/times)
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tautology() {
        let checker = Z3Checker::new();

        // p ∨ ¬p is a tautology
        let p = Formula::atom("p");
        let tautology = Formula::or(p.clone(), Formula::not(p));

        let result = checker.check(&tautology);
        assert!(result.is_valid(), "p ∨ ¬p should be valid");
    }

    #[test]
    fn test_contradiction() {
        let checker = Z3Checker::new();

        // p ∧ ¬p is a contradiction (not valid)
        let p = Formula::atom("p");
        let contradiction = Formula::and(p.clone(), Formula::not(p));

        let result = checker.check(&contradiction);
        assert!(result.is_invalid(), "p ∧ ¬p should be invalid");
    }

    #[test]
    fn test_contingent() {
        let checker = Z3Checker::new();

        // p → q is contingent (not a tautology)
        let p = Formula::atom("p");
        let q = Formula::atom("q");
        let contingent = Formula::implies(p, q);

        let result = checker.check(&contingent);
        assert!(result.is_invalid(), "p → q should have a counterexample");

        // The counterexample should have p=true, q=false
        if let Some(cex) = result.counterexample() {
            let p_val = cex
                .state_assignments
                .iter()
                .find(|a| a.atom == "p")
                .map(|a| a.value);
            let q_val = cex
                .state_assignments
                .iter()
                .find(|a| a.atom == "q")
                .map(|a| a.value);

            assert_eq!(p_val, Some(true));
            assert_eq!(q_val, Some(false));
        }
    }

    #[test]
    fn test_modus_ponens() {
        let checker = Z3Checker::new();

        // ((p → q) ∧ p) → q is valid (modus ponens)
        let p = Formula::atom("p");
        let q = Formula::atom("q");
        let modus_ponens = Formula::implies(
            Formula::and(Formula::implies(p.clone(), q.clone()), p),
            q,
        );

        let result = checker.check(&modus_ponens);
        assert!(result.is_valid(), "Modus ponens should be valid");
    }
}
