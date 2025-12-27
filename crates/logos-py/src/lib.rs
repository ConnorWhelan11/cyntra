//! Python bindings for the Logos formal reasoning system
//!
//! This module provides PyO3 bindings to expose Logos formulas,
//! proof checking, and verification to Python code.

use logos_ffi::{
    self as logos, AgentId, Counterexample, Formula, IssueState, LogosContext, ProofReceipt,
    ProofResult, RoutingRule, RoutingSpec,
};
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyDict;

/// Python-exposed Formula type
#[pyclass(name = "Formula")]
#[derive(Clone)]
pub struct PyFormula {
    inner: Formula,
}

#[pymethods]
impl PyFormula {
    // === Layer 0: Boolean ===

    /// Create an atomic proposition
    #[staticmethod]
    fn atom(name: &str) -> Self {
        Self {
            inner: Formula::atom(name),
        }
    }

    /// Logical true
    #[staticmethod]
    fn top() -> Self {
        Self {
            inner: Formula::top(),
        }
    }

    /// Logical false
    #[staticmethod]
    fn bottom() -> Self {
        Self {
            inner: Formula::bottom(),
        }
    }

    /// Negation
    #[staticmethod]
    fn not_(f: &PyFormula) -> Self {
        Self {
            inner: Formula::not(f.inner.clone()),
        }
    }

    /// Conjunction
    #[staticmethod]
    fn and_(left: &PyFormula, right: &PyFormula) -> Self {
        Self {
            inner: Formula::and(left.inner.clone(), right.inner.clone()),
        }
    }

    /// Disjunction
    #[staticmethod]
    fn or_(left: &PyFormula, right: &PyFormula) -> Self {
        Self {
            inner: Formula::or(left.inner.clone(), right.inner.clone()),
        }
    }

    /// Material implication
    #[staticmethod]
    fn implies(antecedent: &PyFormula, consequent: &PyFormula) -> Self {
        Self {
            inner: Formula::implies(antecedent.inner.clone(), consequent.inner.clone()),
        }
    }

    /// Biconditional
    #[staticmethod]
    fn iff(left: &PyFormula, right: &PyFormula) -> Self {
        Self {
            inner: Formula::iff(left.inner.clone(), right.inner.clone()),
        }
    }

    // === Layer 0: Modal ===

    /// Necessity (Box)
    #[staticmethod]
    fn necessity(f: &PyFormula) -> Self {
        Self {
            inner: Formula::necessity(f.inner.clone()),
        }
    }

    /// Possibility (Diamond)
    #[staticmethod]
    fn possibility(f: &PyFormula) -> Self {
        Self {
            inner: Formula::possibility(f.inner.clone()),
        }
    }

    // === Layer 0: Temporal ===

    /// Always in the future (G)
    #[staticmethod]
    fn always_future(f: &PyFormula) -> Self {
        Self {
            inner: Formula::always_future(f.inner.clone()),
        }
    }

    /// Eventually (F)
    #[staticmethod]
    fn eventually(f: &PyFormula) -> Self {
        Self {
            inner: Formula::eventually(f.inner.clone()),
        }
    }

    /// Always in the past (H)
    #[staticmethod]
    fn always_past(f: &PyFormula) -> Self {
        Self {
            inner: Formula::always_past(f.inner.clone()),
        }
    }

    /// Sometime past (P)
    #[staticmethod]
    fn sometime_past(f: &PyFormula) -> Self {
        Self {
            inner: Formula::sometime_past(f.inner.clone()),
        }
    }

    // === Layer 1: Explanatory ===

    /// Would counterfactual (Box-arrow)
    #[staticmethod]
    fn would_counterfactual(antecedent: &PyFormula, consequent: &PyFormula) -> Self {
        Self {
            inner: Formula::would_counterfactual(antecedent.inner.clone(), consequent.inner.clone()),
        }
    }

    /// Might counterfactual (Diamond-arrow)
    #[staticmethod]
    fn might_counterfactual(antecedent: &PyFormula, consequent: &PyFormula) -> Self {
        Self {
            inner: Formula::might_counterfactual(antecedent.inner.clone(), consequent.inner.clone()),
        }
    }

    /// Grounding relation
    #[staticmethod]
    fn grounding(ground: &PyFormula, grounded: &PyFormula) -> Self {
        Self {
            inner: Formula::grounding(ground.inner.clone(), grounded.inner.clone()),
        }
    }

    /// Causation
    #[staticmethod]
    fn causes(cause: &PyFormula, effect: &PyFormula) -> Self {
        Self {
            inner: Formula::causes(cause.inner.clone(), effect.inner.clone()),
        }
    }

    // === Layer 2: Epistemic ===

    /// Belief
    #[staticmethod]
    fn belief(agent: &str, f: &PyFormula) -> Self {
        Self {
            inner: Formula::belief(agent, f.inner.clone()),
        }
    }

    /// Knowledge
    #[staticmethod]
    fn knowledge(agent: &str, f: &PyFormula) -> Self {
        Self {
            inner: Formula::knowledge(agent, f.inner.clone()),
        }
    }

    /// Probability at least threshold
    #[staticmethod]
    fn probability_at_least(f: &PyFormula, threshold: f64) -> Self {
        Self {
            inner: Formula::probability_at_least(f.inner.clone(), threshold),
        }
    }

    // === Layer 3: Normative ===

    /// Obligation
    #[staticmethod]
    fn obligation(agent: &str, f: &PyFormula) -> Self {
        Self {
            inner: Formula::obligation(agent, f.inner.clone()),
        }
    }

    /// Permission
    #[staticmethod]
    fn permission(agent: &str, f: &PyFormula) -> Self {
        Self {
            inner: Formula::permission(agent, f.inner.clone()),
        }
    }

    /// Prohibition
    #[staticmethod]
    fn prohibition(agent: &str, f: &PyFormula) -> Self {
        Self {
            inner: Formula::prohibition(agent, f.inner.clone()),
        }
    }

    /// Preference (less preferred < more preferred)
    #[staticmethod]
    fn preference(less: &PyFormula, more: &PyFormula) -> Self {
        Self {
            inner: Formula::preference(less.inner.clone(), more.inner.clone()),
        }
    }

    // === Properties ===

    /// Get the required layer (0-3)
    fn required_layer(&self) -> u8 {
        self.inner.required_layer()
    }

    /// Check if formula contains epistemic operators
    fn is_epistemic(&self) -> bool {
        self.inner.is_epistemic()
    }

    /// Check if formula contains normative operators
    fn is_normative(&self) -> bool {
        self.inner.is_normative()
    }

    /// Get formula hash (deterministic)
    fn hash(&self) -> String {
        logos::formula_hash(&self.inner)
    }

    /// Convert to JSON string
    fn to_json(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner)
            .map_err(|e| PyValueError::new_err(format!("JSON error: {}", e)))
    }

    /// Parse from JSON string
    #[staticmethod]
    fn from_json(json: &str) -> PyResult<Self> {
        let inner: Formula = serde_json::from_str(json)
            .map_err(|e| PyValueError::new_err(format!("JSON parse error: {}", e)))?;
        Ok(Self { inner })
    }

    fn __str__(&self) -> String {
        format!("{}", self.inner)
    }

    fn __repr__(&self) -> String {
        format!("Formula({})", self.inner)
    }
}

/// Python-exposed proof context
#[pyclass(name = "LogosContext")]
pub struct PyLogosContext {
    inner: LogosContext,
}

#[pymethods]
impl PyLogosContext {
    #[new]
    fn new() -> Self {
        Self {
            inner: LogosContext::new(),
        }
    }

    /// Check if LEAN runtime is available
    fn lean_available(&self) -> bool {
        self.inner.lean_available()
    }

    /// Attempt to prove a formula
    fn check_proof(&mut self, formula: &PyFormula) -> PyResult<PyProofResult> {
        match self.inner.check_proof(&formula.inner) {
            Ok(result) => Ok(PyProofResult { inner: result }),
            Err(e) => Err(PyRuntimeError::new_err(format!("Proof error: {}", e))),
        }
    }

    /// Clear the proof cache
    fn clear_cache(&mut self) {
        self.inner.clear_cache();
    }
}

/// Python-exposed proof result
#[pyclass(name = "ProofResult")]
pub struct PyProofResult {
    inner: ProofResult,
}

#[pymethods]
impl PyProofResult {
    /// Check if the result indicates validity
    fn is_valid(&self) -> bool {
        self.inner.is_valid()
    }

    /// Check if the result indicates invalidity
    fn is_invalid(&self) -> bool {
        self.inner.is_invalid()
    }

    /// Get reason if unknown
    fn reason(&self) -> Option<String> {
        match &self.inner {
            ProofResult::Unknown { reason } => Some(reason.clone()),
            _ => None,
        }
    }

    /// Get proof receipt if valid
    fn receipt(&self) -> Option<PyProofReceipt> {
        self.inner.receipt().map(|r| PyProofReceipt {
            inner: r.clone(),
        })
    }

    /// Get counterexample if invalid
    fn counterexample(&self) -> Option<PyCounterexample> {
        self.inner.counterexample().map(|c| PyCounterexample {
            inner: c.clone(),
        })
    }

    fn __str__(&self) -> String {
        match &self.inner {
            ProofResult::Valid(_) => "Valid".to_string(),
            ProofResult::Invalid(_) => "Invalid".to_string(),
            ProofResult::Unknown { reason } => format!("Unknown({})", reason),
            ProofResult::Timeout { elapsed_ms } => format!("Timeout({}ms)", elapsed_ms),
        }
    }
}

/// Python-exposed proof receipt
#[pyclass(name = "ProofReceipt")]
#[derive(Clone)]
pub struct PyProofReceipt {
    inner: ProofReceipt,
}

#[pymethods]
impl PyProofReceipt {
    /// Get proof ID
    #[getter]
    fn proof_id(&self) -> String {
        self.inner.proof_id.clone()
    }

    /// Get step count
    #[getter]
    fn step_count(&self) -> usize {
        self.inner.step_count
    }

    /// Check if Z3 validated
    #[getter]
    fn z3_valid(&self) -> bool {
        self.inner.z3_valid
    }

    /// Convert to JSON
    fn to_json(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner)
            .map_err(|e| PyValueError::new_err(format!("JSON error: {}", e)))
    }

    fn __str__(&self) -> String {
        format!("ProofReceipt(id={}, steps={})", self.inner.proof_id, self.inner.step_count)
    }
}

/// Python-exposed counterexample
#[pyclass(name = "Counterexample")]
#[derive(Clone)]
pub struct PyCounterexample {
    inner: Counterexample,
}

#[pymethods]
impl PyCounterexample {
    /// Get model description
    #[getter]
    fn model_description(&self) -> String {
        self.inner.model_description.clone()
    }

    /// Get state assignments as dict
    fn assignments(&self, py: Python<'_>) -> PyResult<Py<PyDict>> {
        let dict = PyDict::new(py);
        for assignment in &self.inner.state_assignments {
            dict.set_item(&assignment.atom, assignment.value)?;
        }
        Ok(dict.into())
    }

    /// Convert to JSON
    fn to_json(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner)
            .map_err(|e| PyValueError::new_err(format!("JSON error: {}", e)))
    }

    fn __str__(&self) -> String {
        format!("Counterexample({})", self.inner.model_description)
    }
}

/// Python-exposed routing rule
#[pyclass(name = "RoutingRule")]
#[derive(Clone)]
pub struct PyRoutingRule {
    inner: RoutingRule,
}

#[pymethods]
impl PyRoutingRule {
    #[new]
    fn new(name: &str, condition: &PyFormula, toolchain: &str) -> Self {
        Self {
            inner: RoutingRule::new(name, condition.inner.clone(), toolchain),
        }
    }

    /// Set speculation mode
    fn with_speculation(&mut self, speculate: bool, confidence: f64) {
        self.inner.speculate = speculate;
        self.inner.confidence = confidence.clamp(0.0, 1.0);
    }

    /// Set priority
    fn with_priority(&mut self, priority: i32) {
        self.inner.priority = priority;
    }

    #[getter]
    fn name(&self) -> String {
        self.inner.name.clone()
    }

    #[getter]
    fn toolchain(&self) -> String {
        self.inner.toolchain.clone()
    }

    #[getter]
    fn speculate(&self) -> bool {
        self.inner.speculate
    }

    #[getter]
    fn confidence(&self) -> f64 {
        self.inner.confidence
    }

    #[getter]
    fn priority(&self) -> i32 {
        self.inner.priority
    }
}

/// Python-exposed routing specification
#[pyclass(name = "RoutingSpec")]
pub struct PyRoutingSpec {
    inner: RoutingSpec,
}

#[pymethods]
impl PyRoutingSpec {
    #[new]
    fn new(default_toolchain: &str) -> Self {
        Self {
            inner: RoutingSpec::new(default_toolchain),
        }
    }

    /// Add a routing rule
    fn add_rule(&mut self, rule: &PyRoutingRule) {
        self.inner.add_rule(rule.inner.clone());
    }

    /// Set issue atoms
    fn set_atoms(&mut self, atoms: Vec<String>) {
        self.inner.issue_atoms = atoms;
    }

    /// Verify completeness
    fn verify_completeness(&self) -> PyResult<Option<PyProofReceipt>> {
        match self.inner.verify_completeness() {
            Ok(receipt) => Ok(Some(PyProofReceipt { inner: receipt })),
            Err(gaps) => {
                let gap_strs: Vec<String> = gaps.iter().map(|g| g.issue_type.clone()).collect();
                Err(PyValueError::new_err(format!(
                    "Completeness gaps: {:?}",
                    gap_strs
                )))
            }
        }
    }

    /// Verify consistency
    fn verify_consistency(&self) -> PyResult<Option<PyProofReceipt>> {
        match self.inner.verify_consistency() {
            Ok(receipt) => Ok(Some(PyProofReceipt { inner: receipt })),
            Err(conflicts) => {
                let conflict_strs: Vec<String> = conflicts
                    .iter()
                    .map(|c| format!("{} vs {}", c.rule_a, c.rule_b))
                    .collect();
                Err(PyValueError::new_err(format!(
                    "Conflicts: {:?}",
                    conflict_strs
                )))
            }
        }
    }

    /// Match a rule for given atoms
    fn match_rule(&self, atoms: Vec<String>) -> Option<PyRoutingRule> {
        let mut state = IssueState::new();
        for atom in atoms {
            state.set_atom(atom);
        }
        self.inner.match_rule(&state).map(|r| PyRoutingRule {
            inner: r.clone(),
        })
    }
}

/// Compute formula hash
#[pyfunction]
fn formula_hash(formula: &PyFormula) -> String {
    logos::formula_hash(&formula.inner)
}

/// Python module definition
#[pymodule]
fn logos_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyFormula>()?;
    m.add_class::<PyLogosContext>()?;
    m.add_class::<PyProofResult>()?;
    m.add_class::<PyProofReceipt>()?;
    m.add_class::<PyCounterexample>()?;
    m.add_class::<PyRoutingRule>()?;
    m.add_class::<PyRoutingSpec>()?;
    m.add_function(wrap_pyfunction!(formula_hash, m)?)?;
    Ok(())
}
