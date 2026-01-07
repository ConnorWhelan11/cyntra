# Track 3: Best-of-K Labeling Bench Specification

**Status:** Implementation Ready
**Priority:** P1-HIGH
**Owner:** training-agent
**Depends On:** Track 1 (Tokenization), Track 4 (executed_plan Recording)
**Blocks:** None (improves training quality but not on critical path)
**Spec Reference:** `docs/models/swarm_planner_training_spec.md` §9
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

The Best-of-K bench generates **counterfactual labels** by running multiple action configurations on the same issue and selecting the best-performing one. This produces higher-quality training labels than behavioral cloning alone, where we only observe what was actually executed (which may not have been optimal).

### 1.2 Goals

1. Generate counterfactual labels: "which action configuration would have been best for this context?"
2. Provide offline evaluation metrics and regret calculations
3. Enable outcome-based training (Stage B in spec §7.4)
4. Maintain determinism and reproducibility
5. Enforce cost caps to prevent runaway experiments

### 1.3 Non-Goals (v1)

- Online A/B testing (this is offline bench only)
- Full reinforcement learning (only supervised learning from best-of-K labels)
- Adaptive K selection (K is fixed per bench run)
- Multi-objective Pareto frontier (single objective winner selection)

---

## 2. Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Best-of-K Bench System                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌───────────────┐    ┌───────────────────┐   │
│  │  Issue Pool  │───▶│ Action Sampler │───▶│  Parallel Runner  │   │
│  │  (N issues)  │    │  (K actions)   │    │  (K executions)   │   │
│  └──────────────┘    └───────────────┘    └────────┬──────────┘   │
│                                                     │              │
│                                                     ▼              │
│                      ┌───────────────────────────────────────────┐ │
│                      │           Outcome Collector                │ │
│                      │  - status (success/failed/timeout)         │ │
│                      │  - duration_ms                             │ │
│                      │  - cost_usd                                │ │
│                      │  - gate results                            │ │
│                      └───────────────────┬───────────────────────┘ │
│                                          │                         │
│                                          ▼                         │
│                      ┌───────────────────────────────────────────┐ │
│                      │           Winner Selector                  │ │
│                      │  - filter: all_gates_passed               │ │
│                      │  - rank: minimize(duration) or cost        │ │
│                      │  - tie-break: deterministic                │ │
│                      └───────────────────┬───────────────────────┘ │
│                                          │                         │
│                                          ▼                         │
│                      ┌───────────────────────────────────────────┐ │
│                      │           Label Merger                     │ │
│                      │  - merge best_of_k label into dataset      │ │
│                      │  - store all candidate outcomes            │ │
│                      └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
Issue from .beads/issues.jsonl
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  For each issue in bench_issues:                                │
│                                                                 │
│    1. Build planner_input.v1 from current state                 │
│    2. Sample K actions from VALID_ACTIONS                       │
│    3. For each action k in K:                                   │
│       a. Execute issue with forced action configuration         │
│       b. Collect outcome (proof.json or rollout.json)           │
│    4. Select winner using objective function                    │
│    5. Store:                                                    │
│       - planner_input                                           │
│       - label_action (winner)                                   │
│       - all_candidates (for analysis)                           │
│       - bench_metadata                                          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
best_of_k_dataset.jsonl
```

---

## 3. Configuration

### 3.1 Bench Configuration Schema

```yaml
# benches/planner_bench/bench_config.yaml

schema_version: "cyntra.planner_bench.v1"

# Issue selection
issue_selection:
  source: ".beads/issues.jsonl"
  filters:
    - field: "status"
      value: "closed" # Only completed issues
    - field: "dk_size"
      in: ["S", "M", "L"] # Exclude trivial (XS) and huge (XL)
  sample_size: 100 # Max issues to include
  seed: 42 # For reproducible sampling

# Action sampling
action_sampling:
  K: 4 # Number of action variants per issue
  strategy: "coverage" # coverage | random | deterministic
  include_baseline: true # Always include heuristic baseline action
  include_executed: true # Always include originally executed action

# Execution limits
execution_limits:
  max_minutes_per_candidate: 30
  max_total_minutes_per_issue: 120 # K * max_minutes_per_candidate
  max_retries: 1
  timeout_behavior: "mark_timeout" # mark_timeout | skip

# Winner selection
winner_selection:
  primary_objective: "minimize_duration" # minimize_duration | minimize_cost | maximize_quality
  constraints:
    - all_required_gates_passed: true
  tie_break:
    - "lower_max_candidates" # Prefer simpler configuration
    - "lower_max_minutes"
    - "action_tuple_lexicographic"

# Output
output:
  directory: ".cyntra/bench/planner_bench"
  include_all_outcomes: true
  include_traces: false # Full execution traces (expensive)
```

### 3.2 Action Sampling Strategies

**Coverage Strategy:**

```python
def sample_coverage(valid_actions: list[ActionTuple], k: int, seed: int) -> list[ActionTuple]:
    """
    Sample K actions ensuring coverage of action space dimensions.

    Strategy:
    1. Include baseline action (serial_handoff, 1, 30, NA for code)
    2. Include one speculate_vote variant
    3. Fill remaining slots with diverse budget combinations
    """
    rng = random.Random(seed)

    selected = []

    # Always include baseline
    baseline = ("serial_handoff", 1, 30, "NA")
    if baseline in valid_actions:
        selected.append(baseline)

    # Include speculate_vote variant
    speculate_actions = [a for a in valid_actions if a[0] == "speculate_vote"]
    if speculate_actions and len(selected) < k:
        selected.append(rng.choice(speculate_actions))

    # Fill with diverse candidates
    remaining = [a for a in valid_actions if a not in selected]
    rng.shuffle(remaining)

    while len(selected) < k and remaining:
        selected.append(remaining.pop())

    return selected
```

**Random Strategy:**

```python
def sample_random(valid_actions: list[ActionTuple], k: int, seed: int) -> list[ActionTuple]:
    """Sample K random actions from valid set."""
    rng = random.Random(seed)
    return rng.sample(valid_actions, min(k, len(valid_actions)))
```

**Deterministic Strategy:**

```python
def sample_deterministic(valid_actions: list[ActionTuple], k: int) -> list[ActionTuple]:
    """Select first K actions in lexicographic order."""
    sorted_actions = sorted(valid_actions, key=lambda a: (a[0], str(a[1]), str(a[2]), str(a[3])))
    return sorted_actions[:k]
```

---

## 4. Execution Engine

### 4.1 Forced Action Execution

The kernel must support executing issues with forced action configurations. This requires extending the runner with override capabilities.

```python
# kernel/src/cyntra/kernel/runner.py (modifications)

@dataclass
class ActionOverride:
    """Override planner decision for bench execution."""
    swarm_id: str
    max_candidates: int | None = None
    timeout_seconds: int | None = None
    max_iterations: int | None = None

async def dispatch_issue_with_override(
    issue: Issue,
    override: ActionOverride,
    *,
    config: KernelConfig,
    state: StateManager,
) -> Proof:
    """
    Execute issue with forced action configuration.

    Used by best-of-K bench to evaluate different action choices.
    """
    # Build manifest with override
    manifest = build_manifest(issue, config)
    manifest["planner"] = {
        "override_applied": True,
        "executed_plan": {
            "swarm_id_executed": override.swarm_id,
            "max_candidates_executed": override.max_candidates,
            "timeout_seconds_executed": override.timeout_seconds,
            "max_iterations_executed": override.max_iterations,
        },
    }

    # Dispatch based on swarm type
    if override.swarm_id == "serial_handoff":
        return await dispatch_serial(issue, manifest, config=config, state=state)
    elif override.swarm_id == "speculate_vote":
        return await dispatch_speculate(
            issue,
            manifest,
            parallelism=override.max_candidates or 2,
            timeout_seconds=override.timeout_seconds,
            config=config,
            state=state,
        )
    else:
        raise ValueError(f"Unknown swarm_id: {override.swarm_id}")
```

### 4.2 Outcome Collection

```python
@dataclass
class CandidateOutcome:
    """Outcome of a single action candidate execution."""
    action: ActionTuple
    status: Literal["success", "failed", "timeout"]
    duration_ms: int
    cost_usd: float | None
    all_gates_passed: bool
    gate_results: list[dict[str, Any]]
    fail_codes: list[str]
    workcell_id: str
    proof_path: Path | None

def collect_outcome(proof: Proof, action: ActionTuple) -> CandidateOutcome:
    """Extract outcome metrics from proof artifact."""
    verification = proof.verification or {}
    all_passed = bool(verification.get("all_passed", False))

    gate_results = []
    gates = verification.get("gates", {})
    for name, result in gates.items():
        gate_results.append({
            "name": name,
            "passed": bool(result.get("passed", False)),
            "score": result.get("score"),
        })

    return CandidateOutcome(
        action=action,
        status=proof.status,
        duration_ms=proof.metadata.get("duration_ms", 0),
        cost_usd=proof.metadata.get("cost_usd"),
        all_gates_passed=all_passed,
        gate_results=gate_results,
        fail_codes=list(verification.get("blocking_failures", [])),
        workcell_id=proof.workcell_id,
        proof_path=proof.path,
    )
```

### 4.3 Winner Selection

```python
@dataclass
class WinnerSelectionConfig:
    primary_objective: Literal["minimize_duration", "minimize_cost", "maximize_quality"]
    constraints: dict[str, Any]
    tie_break: list[str]

def select_winner(
    outcomes: list[CandidateOutcome],
    config: WinnerSelectionConfig,
) -> CandidateOutcome | None:
    """
    Select best candidate from outcomes.

    Returns None if no candidate satisfies all constraints.
    """
    # Apply constraints
    filtered = outcomes
    if config.constraints.get("all_required_gates_passed"):
        filtered = [o for o in filtered if o.all_gates_passed]

    if not filtered:
        return None

    # Sort by primary objective
    if config.primary_objective == "minimize_duration":
        filtered.sort(key=lambda o: o.duration_ms)
    elif config.primary_objective == "minimize_cost":
        filtered.sort(key=lambda o: o.cost_usd or float("inf"))
    elif config.primary_objective == "maximize_quality":
        # Quality = 1 / (1 + num_fail_codes)
        filtered.sort(key=lambda o: len(o.fail_codes))

    # Apply tie-breaks
    if len(filtered) > 1:
        best_value = _get_objective_value(filtered[0], config.primary_objective)
        tied = [o for o in filtered if _get_objective_value(o, config.primary_objective) == best_value]

        if len(tied) > 1:
            for tie_rule in config.tie_break:
                tied = _apply_tie_break(tied, tie_rule)
                if len(tied) == 1:
                    break

        return tied[0]

    return filtered[0]

def _get_objective_value(outcome: CandidateOutcome, objective: str) -> float:
    if objective == "minimize_duration":
        return outcome.duration_ms
    elif objective == "minimize_cost":
        return outcome.cost_usd or float("inf")
    elif objective == "maximize_quality":
        return len(outcome.fail_codes)
    return 0.0

def _apply_tie_break(outcomes: list[CandidateOutcome], rule: str) -> list[CandidateOutcome]:
    if rule == "lower_max_candidates":
        min_cand = min(o.action[1] if o.action[1] != "NA" else 999 for o in outcomes)
        return [o for o in outcomes if (o.action[1] if o.action[1] != "NA" else 999) == min_cand]
    elif rule == "lower_max_minutes":
        min_min = min(o.action[2] if o.action[2] != "NA" else 999 for o in outcomes)
        return [o for o in outcomes if (o.action[2] if o.action[2] != "NA" else 999) == min_min]
    elif rule == "action_tuple_lexicographic":
        sorted_outcomes = sorted(outcomes, key=lambda o: (o.action[0], str(o.action[1]), str(o.action[2]), str(o.action[3])))
        return [sorted_outcomes[0]]
    return outcomes
```

---

## 5. Output Schema

### 5.1 Best-of-K Example Schema

```json
{
  "schema_version": "cyntra.best_of_k_example.v1",
  "issue_id": "issue-123",
  "run_id": "bench-run-456",
  "created_at": "2025-12-20T10:30:00Z",

  "planner_input": {
    "schema_version": "cyntra.planner_input.v1",
    "...": "..."
  },

  "label_action": {
    "schema_version": "cyntra.planner_action.v1",
    "swarm_id": "speculate_vote",
    "budgets": {
      "max_candidates_bin": 2,
      "max_minutes_bin": 30,
      "max_iterations_bin": "NA"
    },
    "label_source": "best_of_k",
    "confidence": 1.0
  },

  "candidates": [
    {
      "action": ["serial_handoff", 1, 30, "NA"],
      "outcome": {
        "status": "failed",
        "duration_ms": 45000,
        "all_gates_passed": false,
        "fail_codes": ["pytest_failed"]
      },
      "is_winner": false
    },
    {
      "action": ["speculate_vote", 2, 30, "NA"],
      "outcome": {
        "status": "success",
        "duration_ms": 62000,
        "all_gates_passed": true,
        "fail_codes": []
      },
      "is_winner": true
    },
    {
      "action": ["speculate_vote", 3, 45, "NA"],
      "outcome": {
        "status": "success",
        "duration_ms": 78000,
        "all_gates_passed": true,
        "fail_codes": []
      },
      "is_winner": false
    }
  ],

  "bench_metadata": {
    "bench_config_hash": "abc123...",
    "K": 4,
    "strategy": "coverage",
    "winner_selection": {
      "primary_objective": "minimize_duration",
      "candidates_evaluated": 3,
      "candidates_passed_constraints": 2
    }
  }
}
```

### 5.2 Bench Summary Schema

```json
{
  "schema_version": "cyntra.planner_bench_summary.v1",
  "bench_id": "bench-2025-12-20-001",
  "created_at": "2025-12-20T12:00:00Z",

  "config": {
    "K": 4,
    "strategy": "coverage",
    "issue_count": 100,
    "...": "..."
  },

  "statistics": {
    "total_issues": 100,
    "issues_with_winner": 85,
    "issues_no_passing_candidate": 15,
    "total_candidates_executed": 400,
    "total_execution_time_minutes": 1200,
    "total_cost_usd": 45.5
  },

  "winner_distribution": {
    "by_swarm": {
      "serial_handoff": 30,
      "speculate_vote": 55
    },
    "by_max_candidates": {
      "1": 30,
      "2": 35,
      "3": 20
    }
  },

  "regret_analysis": {
    "mean_regret_vs_oracle": 0.15,
    "median_regret_vs_oracle": 0.08,
    "max_regret_vs_oracle": 0.45
  },

  "output_paths": {
    "examples": ".cyntra/bench/planner_bench/best_of_k_dataset.jsonl",
    "summary": ".cyntra/bench/planner_bench/summary.json"
  }
}
```

---

## 6. CLI Interface

### 6.1 Bench Commands

```bash
# Run best-of-K bench with default config
cyntra planner bench run

# Run with custom config
cyntra planner bench run --config benches/planner_bench/custom_config.yaml

# Run on specific issues
cyntra planner bench run --issues issue-1,issue-2,issue-3

# Dry run (show what would be executed)
cyntra planner bench run --dry-run

# Resume interrupted bench
cyntra planner bench resume --bench-id bench-2025-12-20-001

# Show bench status
cyntra planner bench status --bench-id bench-2025-12-20-001

# Analyze bench results
cyntra planner bench analyze --bench-id bench-2025-12-20-001

# Merge best-of-K labels into training dataset
cyntra planner dataset merge-best-of-k \
  --dataset-dir .cyntra/planner/dataset \
  --bench-dir .cyntra/bench/planner_bench
```

### 6.2 CLI Implementation

```python
# kernel/src/cyntra/planner/bench_cli.py

import click
from pathlib import Path

from cyntra.planner.bench import BenchRunner, BenchConfig, BenchAnalyzer

@click.group()
def bench():
    """Best-of-K planner bench commands."""
    pass

@bench.command()
@click.option("--config", type=Path, default=Path("benches/planner_bench/bench_config.yaml"))
@click.option("--issues", type=str, help="Comma-separated issue IDs")
@click.option("--dry-run", is_flag=True, help="Show what would be executed")
@click.option("--output-dir", type=Path, default=Path(".cyntra/bench/planner_bench"))
def run(config: Path, issues: str | None, dry_run: bool, output_dir: Path):
    """Run best-of-K bench."""
    bench_config = BenchConfig.from_yaml(config)

    if issues:
        bench_config.issue_ids = issues.split(",")

    runner = BenchRunner(bench_config, output_dir=output_dir)

    if dry_run:
        runner.show_plan()
        return

    runner.run()

@bench.command()
@click.option("--bench-id", required=True, help="Bench ID to resume")
def resume(bench_id: str):
    """Resume interrupted bench run."""
    runner = BenchRunner.resume(bench_id)
    runner.run()

@bench.command()
@click.option("--bench-id", required=True, help="Bench ID to analyze")
@click.option("--output", type=Path, help="Output path for analysis report")
def analyze(bench_id: str, output: Path | None):
    """Analyze bench results."""
    analyzer = BenchAnalyzer(bench_id)
    report = analyzer.generate_report()

    if output:
        output.write_text(report.to_json())
    else:
        click.echo(report.to_text())
```

---

## 7. Implementation Tasks

### 7.1 Task Breakdown

| Task ID | Description                            | Est. Hours | Dependencies |
| ------- | -------------------------------------- | ---------- | ------------ |
| T3.1    | Define bench config schema             | 2          | None         |
| T3.2    | Implement action sampling strategies   | 3          | T3.1         |
| T3.3    | Add ActionOverride to runner           | 4          | Track 4      |
| T3.4    | Implement dispatch_issue_with_override | 6          | T3.3         |
| T3.5    | Implement outcome collector            | 3          | T3.4         |
| T3.6    | Implement winner selector              | 3          | T3.5         |
| T3.7    | Implement BenchRunner class            | 6          | T3.2-T3.6    |
| T3.8    | Implement resumption logic             | 3          | T3.7         |
| T3.9    | Implement BenchAnalyzer class          | 4          | T3.7         |
| T3.10   | Implement CLI commands                 | 3          | T3.7-T3.9    |
| T3.11   | Implement dataset merger               | 3          | T3.7         |
| T3.12   | Unit tests for sampling                | 2          | T3.2         |
| T3.13   | Unit tests for winner selection        | 2          | T3.6         |
| T3.14   | Integration test: mini bench           | 4          | T3.7         |

**Total estimated hours:** 48

### 7.2 File Deliverables

| File                                          | Description          | Status |
| --------------------------------------------- | -------------------- | ------ |
| `benches/planner_bench/bench_config.yaml`     | Default bench config | NEW    |
| `kernel/src/cyntra/planner/bench/__init__.py` | Package init         | NEW    |
| `kernel/src/cyntra/planner/bench/config.py`   | BenchConfig class    | NEW    |
| `kernel/src/cyntra/planner/bench/sampler.py`  | Action sampling      | NEW    |
| `kernel/src/cyntra/planner/bench/runner.py`   | BenchRunner          | NEW    |
| `kernel/src/cyntra/planner/bench/outcome.py`  | Outcome collection   | NEW    |
| `kernel/src/cyntra/planner/bench/winner.py`   | Winner selection     | NEW    |
| `kernel/src/cyntra/planner/bench/analyzer.py` | BenchAnalyzer        | NEW    |
| `kernel/src/cyntra/planner/bench_cli.py`      | CLI commands         | NEW    |
| `kernel/tests/planner/bench/test_sampler.py`  | Sampler tests        | NEW    |
| `kernel/tests/planner/bench/test_winner.py`   | Winner tests         | NEW    |
| `kernel/tests/planner/bench/test_runner.py`   | Runner tests         | NEW    |

---

## 8. Testing Requirements

### 8.1 Unit Tests

```python
# tests/planner/bench/test_sampler.py

def test_coverage_sampling_includes_baseline():
    """Verify coverage strategy always includes baseline."""
    valid_actions = valid_actions("code", action_space)
    sampled = sample_coverage(valid_actions, k=4, seed=42)
    baseline = ("serial_handoff", 1, 30, "NA")
    assert baseline in sampled

def test_coverage_sampling_includes_speculate():
    """Verify coverage strategy includes speculate_vote variant."""
    valid_actions = valid_actions("code", action_space)
    sampled = sample_coverage(valid_actions, k=4, seed=42)
    assert any(a[0] == "speculate_vote" for a in sampled)

def test_coverage_sampling_deterministic():
    """Verify coverage sampling is deterministic with seed."""
    valid_actions = valid_actions("code", action_space)
    sample1 = sample_coverage(valid_actions, k=4, seed=42)
    sample2 = sample_coverage(valid_actions, k=4, seed=42)
    assert sample1 == sample2

def test_random_sampling_different_seeds():
    """Verify random sampling produces different results with different seeds."""
    valid_actions = valid_actions("code", action_space)
    sample1 = sample_random(valid_actions, k=4, seed=42)
    sample2 = sample_random(valid_actions, k=4, seed=43)
    assert sample1 != sample2
```

```python
# tests/planner/bench/test_winner.py

def test_winner_selection_all_passed_constraint():
    """Verify winner must pass all gates."""
    outcomes = [
        CandidateOutcome(action=("serial_handoff", 1, 30, "NA"), status="success",
                        duration_ms=10000, all_gates_passed=False, ...),
        CandidateOutcome(action=("speculate_vote", 2, 30, "NA"), status="success",
                        duration_ms=20000, all_gates_passed=True, ...),
    ]
    config = WinnerSelectionConfig(
        primary_objective="minimize_duration",
        constraints={"all_required_gates_passed": True},
        tie_break=[],
    )
    winner = select_winner(outcomes, config)
    assert winner.action == ("speculate_vote", 2, 30, "NA")

def test_winner_selection_no_passing_candidates():
    """Verify None returned when no candidates pass constraints."""
    outcomes = [
        CandidateOutcome(action=("serial_handoff", 1, 30, "NA"), status="failed",
                        duration_ms=10000, all_gates_passed=False, ...),
    ]
    config = WinnerSelectionConfig(
        primary_objective="minimize_duration",
        constraints={"all_required_gates_passed": True},
        tie_break=[],
    )
    winner = select_winner(outcomes, config)
    assert winner is None

def test_winner_selection_tie_break():
    """Verify tie-breaking works correctly."""
    outcomes = [
        CandidateOutcome(action=("speculate_vote", 3, 30, "NA"), status="success",
                        duration_ms=20000, all_gates_passed=True, ...),
        CandidateOutcome(action=("speculate_vote", 2, 30, "NA"), status="success",
                        duration_ms=20000, all_gates_passed=True, ...),
    ]
    config = WinnerSelectionConfig(
        primary_objective="minimize_duration",
        constraints={"all_required_gates_passed": True},
        tie_break=["lower_max_candidates"],
    )
    winner = select_winner(outcomes, config)
    # Should pick lower max_candidates (2 < 3)
    assert winner.action[1] == 2
```

### 8.2 Integration Tests

```python
# tests/planner/bench/test_runner.py

@pytest.mark.integration
def test_mini_bench_run():
    """Run a minimal bench with 2 issues and K=2."""
    config = BenchConfig(
        issue_selection={"sample_size": 2},
        action_sampling={"K": 2, "strategy": "deterministic"},
        execution_limits={"max_minutes_per_candidate": 5},
    )

    with temp_bench_dir() as output_dir:
        runner = BenchRunner(config, output_dir=output_dir)
        runner.run()

        # Verify outputs
        assert (output_dir / "best_of_k_dataset.jsonl").exists()
        assert (output_dir / "summary.json").exists()

        # Verify dataset has expected structure
        examples = load_jsonl(output_dir / "best_of_k_dataset.jsonl")
        assert len(examples) <= 2
        for ex in examples:
            assert "planner_input" in ex
            assert "label_action" in ex
            assert "candidates" in ex
```

---

## 9. Acceptance Criteria

### 9.1 Functional Requirements

- [ ] Bench config schema validated on load
- [ ] Action sampling strategies produce expected coverage
- [ ] Issues execute with forced action configurations
- [ ] Outcomes collected correctly from proof artifacts
- [ ] Winner selection respects constraints and tie-breaks
- [ ] Resumption works for interrupted benches
- [ ] CLI commands function correctly

### 9.2 Determinism Requirements

- [ ] Same config + same issues → same winners (with fixed seeds)
- [ ] Sampling with same seed produces identical action sets
- [ ] Winner selection is deterministic given same outcomes

### 9.3 Cost Control Requirements

- [ ] Execution respects max_minutes_per_candidate
- [ ] Total bench cost stays within budget
- [ ] Timeout candidates marked appropriately (not failed)

### 9.4 Quality Requirements

- [ ] Best-of-K labels improve model performance vs executed labels only
- [ ] Regret vs oracle-in-bench is measurable and improving

---

## 10. Regret Analysis

### 10.1 Oracle Definition

The **oracle-in-bench** is the best possible choice given the candidates evaluated:

```python
def oracle_action(outcomes: list[CandidateOutcome]) -> ActionTuple | None:
    """Return the best action among evaluated candidates."""
    passing = [o for o in outcomes if o.all_gates_passed]
    if not passing:
        return None
    # Oracle minimizes duration among passing
    best = min(passing, key=lambda o: o.duration_ms)
    return best.action
```

### 10.2 Regret Calculation

```python
def compute_regret(
    model_action: ActionTuple,
    oracle_action: ActionTuple,
    outcomes: list[CandidateOutcome],
) -> float:
    """
    Compute regret of model's choice vs oracle.

    Regret = (model_duration - oracle_duration) / oracle_duration
    Returns 0 if model chose oracle action.
    Returns inf if model action didn't pass but oracle did.
    """
    model_outcome = next(o for o in outcomes if o.action == model_action)
    oracle_outcome = next(o for o in outcomes if o.action == oracle_action)

    if not model_outcome.all_gates_passed and oracle_outcome.all_gates_passed:
        return float("inf")

    if not model_outcome.all_gates_passed:
        return 0.0  # Both failed, no regret

    regret = (model_outcome.duration_ms - oracle_outcome.duration_ms) / oracle_outcome.duration_ms
    return max(0.0, regret)
```

---

## 11. Dependencies

### 11.1 Upstream Dependencies

| Dependency              | Location                      | Status                         |
| ----------------------- | ----------------------------- | ------------------------------ |
| Track 1 (Tokenization)  | `cyntra/planner/tokenizer.py` | REQUIRED                       |
| Track 4 (executed_plan) | `kernel/dispatcher.py`        | REQUIRED (for proper labeling) |
| `action_space.py`       | `cyntra/planner/`             | COMPLETE                       |
| `dataset.py`            | `cyntra/planner/`             | COMPLETE                       |

### 11.2 Downstream Dependents

| Dependent        | Description                                |
| ---------------- | ------------------------------------------ |
| Track 2 (Models) | Uses best_of_k labels for Stage B training |

---

## 12. Open Questions

1. **Cost allocation:** How should bench execution costs be tracked and attributed?
   - Recommendation: Separate budget line item, not counted against production runs

2. **Issue selection:** Should we prioritize issues where executed action != heuristic baseline?
   - Recommendation: Yes, these are more informative for learning

3. **K selection:** Should K be adaptive based on issue complexity?
   - Recommendation: Start with fixed K=4, consider adaptive in v2

4. **Parallelism:** Should candidates be executed in parallel or sequential?
   - Recommendation: Sequential to avoid resource contention, but parallelizable for code jobs

---

## 13. Revision History

| Version | Date    | Author        | Changes               |
| ------- | ------- | ------------- | --------------------- |
| 1.0     | 2025-12 | Planner Agent | Initial specification |
