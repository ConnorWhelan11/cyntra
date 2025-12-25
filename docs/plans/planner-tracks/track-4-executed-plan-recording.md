# Track 4: executed_plan Recording Specification

**Status:** Implementation Ready
**Priority:** P0-CRITICAL
**Owner:** kernel-agent
**Depends On:** None (independent track)
**Blocks:** Track 3 (Best-of-K Bench), Track 5 (Kernel Integration)
**Spec Reference:** `docs/models/swarm_planner_training_spec.md` §3.3, §10.2
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

The planner training pipeline requires knowing **what the kernel actually executed** for each run, not just what was planned. The `executed_plan.v1` schema exists (`schemas/cyntra/executed_plan.schema.json`) but is **not yet populated** during runs. This track implements the recording of executed plan details into manifests and rollouts.

### 1.2 Goals

1. Record `executed_plan.v1` in every manifest under `manifest["planner"]["executed_plan"]`
2. Propagate executed_plan to rollout.json for archive extraction
3. Enable data extraction pipeline to read accurate action labels
4. Support fallback tracking when planner decisions are overridden

### 1.3 Non-Goals (v1)

- Planner inference integration (that's Track 5)
- Best-of-K bench execution (that's Track 3)
- Changing the execution logic itself

### 1.4 Critical Path Impact

**This track is on the critical path.** Without proper executed_plan recording:
- Dataset builder extracts inaccurate labels from heuristics in `run_summaries.py`
- Training data quality is compromised
- Best-of-K bench cannot attribute outcomes to actions correctly

---

## 2. Current State Analysis

### 2.1 What Exists

**Schema (COMPLETE):**
```json
// cyntra-kernel/schemas/cyntra/executed_plan.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Executed Plan",
  "description": "What the kernel actually executed",
  "type": "object",
  "required": ["swarm_id_executed"],
  "properties": {
    "swarm_id_executed": { "type": "string" },
    "max_candidates_executed": { "type": ["integer", "null"] },
    "timeout_seconds_executed": { "type": ["integer", "null"] },
    "max_iterations_executed": { "type": ["integer", "null"] },
    "fallback_applied": { "type": "boolean" },
    "fallback_reason": { "type": ["string", "null"] }
  }
}
```

**Extraction Logic (PARTIAL):**
```python
# cyntra-kernel/src/cyntra/planner/run_summaries.py:223-256
def _action_executed_from_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    # Prefer explicit executed plan when available.
    planner = manifest.get("planner") if isinstance(manifest.get("planner"), dict) else {}
    executed = planner.get("executed_plan") if isinstance(planner.get("executed_plan"), dict) else None
    if executed:
        # USE RECORDED VALUES
        swarm = executed.get("swarm_id_executed")
        max_candidates = executed.get("max_candidates_executed")
        timeout_seconds = executed.get("timeout_seconds_executed")
        max_iterations = executed.get("max_iterations_executed")
        return {...}

    # FALLBACK: Infer from legacy fields (UNRELIABLE)
    swarm_id = "speculate_vote" if bool(manifest.get("speculate_mode")) else "serial_handoff"
    # ...
```

### 2.2 What's Missing

**Recording at execution time:**
- `dispatcher.py` does not populate `manifest["planner"]["executed_plan"]`
- `runner.py` does not record the actual swarm/parallelism used
- No tracking of when fallbacks are applied

**Propagation:**
- `rollout.json` doesn't include executed_plan
- Archive extraction relies on inference from legacy fields

---

## 3. Architecture

### 3.1 Recording Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Kernel Execution Flow                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  scheduler.py                                                       │
│       │                                                             │
│       │ select_next_issue()                                         │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Planner Decision Point (Track 5 adds inference here)        │   │
│  │                                                              │   │
│  │  Currently: heuristic in should_speculate() + controller     │   │
│  │  Future: PlannerInference.predict() → planner_action.v1      │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             │ decision = {swarm_id, budgets}        │
│                             ▼                                       │
│  dispatcher.py                                                      │
│       │                                                             │
│       │ build_manifest(issue, decision)                             │
│       │                                                             │
│       │ ┌─────────────────────────────────────────────────────┐    │
│       │ │  NEW: Populate manifest["planner"]["executed_plan"]  │    │
│       │ │                                                      │    │
│       │ │  {                                                   │    │
│       │ │    "swarm_id_executed": "speculate_vote",            │    │
│       │ │    "max_candidates_executed": 2,                     │    │
│       │ │    "timeout_seconds_executed": 1800,                 │    │
│       │ │    "max_iterations_executed": null,                  │    │
│       │ │    "fallback_applied": false,                        │    │
│       │ │    "fallback_reason": null                           │    │
│       │ │  }                                                   │    │
│       │ └─────────────────────────────────────────────────────┘    │
│       ▼                                                             │
│  runner.py                                                          │
│       │                                                             │
│       │ dispatch_serial() OR dispatch_speculate()                   │
│       │                                                             │
│       │ ┌─────────────────────────────────────────────────────┐    │
│       │ │  Record actual values used (may differ from plan)    │    │
│       │ │  - Actual parallelism (after resource constraints)   │    │
│       │ │  - Actual timeout (after config overrides)           │    │
│       │ └─────────────────────────────────────────────────────┘    │
│       ▼                                                             │
│  verifier.py → proof.json                                           │
│       │                                                             │
│       │ rollout_builder.py                                          │
│       │                                                             │
│       │ ┌─────────────────────────────────────────────────────┐    │
│       │ │  NEW: Copy executed_plan to rollout.json             │    │
│       │ └─────────────────────────────────────────────────────┘    │
│       ▼                                                             │
│  Archive: manifest.json + proof.json + rollout.json                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Model

```python
@dataclass
class ExecutedPlan:
    """What the kernel actually executed."""
    swarm_id_executed: str
    max_candidates_executed: int | None = None
    timeout_seconds_executed: int | None = None
    max_iterations_executed: int | None = None
    fallback_applied: bool = False
    fallback_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "swarm_id_executed": self.swarm_id_executed,
            "max_candidates_executed": self.max_candidates_executed,
            "timeout_seconds_executed": self.timeout_seconds_executed,
            "max_iterations_executed": self.max_iterations_executed,
            "fallback_applied": self.fallback_applied,
            "fallback_reason": self.fallback_reason,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExecutedPlan":
        return cls(
            swarm_id_executed=str(data.get("swarm_id_executed", "serial_handoff")),
            max_candidates_executed=data.get("max_candidates_executed"),
            timeout_seconds_executed=data.get("timeout_seconds_executed"),
            max_iterations_executed=data.get("max_iterations_executed"),
            fallback_applied=bool(data.get("fallback_applied", False)),
            fallback_reason=data.get("fallback_reason"),
        )
```

---

## 4. Implementation Details

### 4.1 Dispatcher Changes

```python
# cyntra-kernel/src/cyntra/kernel/dispatcher.py

from cyntra.planner.executed_plan import ExecutedPlan

async def dispatch_async(
    issue: Issue,
    *,
    config: KernelConfig,
    state: StateManager,
    planner_action: dict[str, Any] | None = None,  # NEW: from Track 5
) -> tuple[Workcell, Manifest]:
    """
    Dispatch issue to workcell with executed_plan recording.
    """
    # Determine execution parameters
    should_spec = should_speculate(issue, config)
    parallelism = determine_parallelism(issue, config, should_spec)
    timeout = determine_timeout(issue, config)

    # Build executed_plan
    executed_plan = ExecutedPlan(
        swarm_id_executed="speculate_vote" if should_spec else "serial_handoff",
        max_candidates_executed=parallelism if should_spec else 1,
        timeout_seconds_executed=timeout,
        max_iterations_executed=None,  # Code jobs don't have iterations
        fallback_applied=False,
        fallback_reason=None,
    )

    # Check if we're falling back from planner decision
    if planner_action is not None:
        planned_swarm = planner_action.get("swarm_id")
        if planned_swarm and planned_swarm != executed_plan.swarm_id_executed:
            executed_plan.fallback_applied = True
            executed_plan.fallback_reason = "planner_decision_overridden"

    # Build manifest with executed_plan
    manifest = build_manifest(
        issue,
        config,
        executed_plan=executed_plan,
        planner_action=planner_action,
    )

    # Create workcell and dispatch
    workcell = await create_workcell(issue, config)
    return workcell, manifest


def build_manifest(
    issue: Issue,
    config: KernelConfig,
    *,
    executed_plan: ExecutedPlan,
    planner_action: dict[str, Any] | None = None,
) -> Manifest:
    """Build manifest with planner section."""
    manifest = Manifest(
        workcell_id=generate_workcell_id(),
        issue=issue.to_dict(),
        job_type="code",
        created_at=now_rfc3339(),
        # ... other fields
    )

    # NEW: Add planner section
    manifest.planner = {
        "executed_plan": executed_plan.to_dict(),
    }

    if planner_action is not None:
        manifest.planner["planned_action"] = planner_action

    return manifest
```

### 4.2 Runner Changes

```python
# cyntra-kernel/src/cyntra/kernel/runner.py

async def _dispatch_speculate_async(
    issue: Issue,
    manifest: Manifest,
    *,
    parallelism: int,
    config: KernelConfig,
) -> list[Proof]:
    """
    Run speculate+vote with recorded parallelism.
    """
    # Actual parallelism may be constrained by resources
    actual_parallelism = min(parallelism, get_available_slots(config))

    # Update executed_plan if actual differs from planned
    if actual_parallelism != parallelism:
        manifest.planner["executed_plan"]["max_candidates_executed"] = actual_parallelism
        manifest.planner["executed_plan"]["fallback_applied"] = True
        manifest.planner["executed_plan"]["fallback_reason"] = \
            f"parallelism_reduced_from_{parallelism}_to_{actual_parallelism}"

    # Execute candidates
    tasks = []
    for i in range(actual_parallelism):
        task = dispatch_candidate(issue, manifest, candidate_idx=i, config=config)
        tasks.append(task)

    proofs = await asyncio.gather(*tasks, return_exceptions=True)
    # ... vote and select winner
```

### 4.3 Rollout Builder Changes

```python
# cyntra-kernel/src/cyntra/rollouts/builder.py

def build_rollout(
    manifest: Manifest,
    proof: Proof,
    *,
    include_traces: bool = False,
) -> dict[str, Any]:
    """Build rollout.json with executed_plan propagation."""
    rollout = {
        "schema_version": "cyntra.rollout.v1",
        "workcell_id": manifest.workcell_id,
        "job_type": manifest.job_type,
        "metadata": {
            "started_at": manifest.created_at,
            "completed_at": proof.completed_at,
        },
        # ... other fields
    }

    # NEW: Propagate planner section
    if hasattr(manifest, "planner") and manifest.planner:
        rollout["planner"] = manifest.planner

    return rollout
```

### 4.4 World Run Recording

```python
# cyntra-kernel/src/cyntra/universe/evolve_world.py

def build_world_manifest(
    world_id: str,
    objective_id: str,
    swarm_id: str,
    population_size: int,
    max_iterations: int,
) -> dict[str, Any]:
    """Build manifest for world evolution run."""
    manifest = {
        "schema_version": "cyntra.world_manifest.v1",
        "run_id": generate_run_id(),
        "world_id": world_id,
        "objective_id": objective_id,
        "created_at": now_rfc3339(),
        # ... other fields

        # NEW: Add planner section for world runs
        "planner": {
            "executed_plan": {
                "swarm_id_executed": swarm_id,
                "max_candidates_executed": population_size,
                "timeout_seconds_executed": None,  # World runs use iterations
                "max_iterations_executed": max_iterations,
                "fallback_applied": False,
                "fallback_reason": None,
            }
        }
    }
    return manifest
```

---

## 5. Extraction Updates

### 5.1 run_summaries.py Updates

The existing extraction logic already handles executed_plan when present. Verify it works:

```python
# cyntra-kernel/src/cyntra/planner/run_summaries.py

def _action_executed_from_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    """
    Extract action_executed from manifest.

    Priority:
    1. manifest["planner"]["executed_plan"] (new, authoritative)
    2. Legacy heuristic inference (fallback for old archives)
    """
    planner = manifest.get("planner") if isinstance(manifest.get("planner"), dict) else {}
    executed = planner.get("executed_plan") if isinstance(planner.get("executed_plan"), dict) else None

    if executed:
        # Use recorded values (NEW PATH)
        swarm = executed.get("swarm_id_executed")
        max_candidates = executed.get("max_candidates_executed")
        timeout_seconds = executed.get("timeout_seconds_executed")
        max_iterations = executed.get("max_iterations_executed")
        return {
            "swarm_id": str(swarm) if swarm is not None else None,
            "max_candidates": int(max_candidates) if isinstance(max_candidates, int) else None,
            "max_minutes": int(int(timeout_seconds) / 60) if isinstance(timeout_seconds, int) else None,
            "max_iterations": int(max_iterations) if isinstance(max_iterations, int) else None,
        }

    # LEGACY FALLBACK (for archives before this change)
    swarm_id = "speculate_vote" if bool(manifest.get("speculate_mode")) else "serial_handoff"
    max_candidates = 1 if swarm_id == "serial_handoff" else None
    # ... rest of legacy inference
```

---

## 6. Schema Validation

### 6.1 Manifest Schema Update

```json
// cyntra-kernel/schemas/cyntra/manifest.schema.json (additions)
{
  "properties": {
    "planner": {
      "type": "object",
      "properties": {
        "executed_plan": {
          "$ref": "executed_plan.schema.json"
        },
        "planned_action": {
          "$ref": "planner_action.schema.json"
        }
      },
      "required": ["executed_plan"]
    }
  }
}
```

### 6.2 Rollout Schema Update

```json
// cyntra-kernel/schemas/cyntra/rollout.schema.json (additions)
{
  "properties": {
    "planner": {
      "type": "object",
      "properties": {
        "executed_plan": {
          "$ref": "executed_plan.schema.json"
        }
      }
    }
  }
}
```

---

## 7. Implementation Tasks

### 7.1 Task Breakdown

| Task ID | Description | Est. Hours | Dependencies |
|---------|-------------|------------|--------------|
| T4.1 | Create `ExecutedPlan` dataclass | 1 | None |
| T4.2 | Update `build_manifest()` in dispatcher.py | 3 | T4.1 |
| T4.3 | Update `_dispatch_speculate_async()` in runner.py | 2 | T4.2 |
| T4.4 | Update `_dispatch_serial()` in runner.py | 1 | T4.2 |
| T4.5 | Update `build_rollout()` in rollouts/builder.py | 2 | T4.2 |
| T4.6 | Update world manifest building | 2 | T4.1 |
| T4.7 | Update manifest.schema.json | 1 | T4.2 |
| T4.8 | Update rollout.schema.json | 1 | T4.5 |
| T4.9 | Verify run_summaries.py extraction | 1 | T4.2-T4.5 |
| T4.10 | Unit tests for ExecutedPlan | 2 | T4.1 |
| T4.11 | Integration test: dispatch with recording | 3 | T4.2-T4.5 |
| T4.12 | Integration test: extraction roundtrip | 2 | T4.9 |
| T4.13 | Migration: backfill existing archives (optional) | 4 | T4.9 |

**Total estimated hours:** 25

### 7.2 File Deliverables

| File | Description | Status |
|------|-------------|--------|
| `cyntra-kernel/src/cyntra/planner/executed_plan.py` | ExecutedPlan dataclass | NEW |
| `cyntra-kernel/src/cyntra/kernel/dispatcher.py` | Add executed_plan recording | MODIFY |
| `cyntra-kernel/src/cyntra/kernel/runner.py` | Record actual values used | MODIFY |
| `cyntra-kernel/src/cyntra/rollouts/builder.py` | Propagate planner section | MODIFY |
| `cyntra-kernel/src/cyntra/universe/evolve_world.py` | Add planner to world manifests | MODIFY |
| `cyntra-kernel/schemas/cyntra/manifest.schema.json` | Add planner property | MODIFY |
| `cyntra-kernel/schemas/cyntra/rollout.schema.json` | Add planner property | MODIFY |
| `cyntra-kernel/tests/kernel/test_executed_plan.py` | Unit tests | NEW |
| `cyntra-kernel/tests/kernel/test_dispatch_recording.py` | Integration tests | NEW |

---

## 8. Testing Requirements

### 8.1 Unit Tests

```python
# tests/kernel/test_executed_plan.py

def test_executed_plan_to_dict():
    """Verify ExecutedPlan serialization."""
    plan = ExecutedPlan(
        swarm_id_executed="speculate_vote",
        max_candidates_executed=2,
        timeout_seconds_executed=1800,
    )
    d = plan.to_dict()
    assert d["swarm_id_executed"] == "speculate_vote"
    assert d["max_candidates_executed"] == 2
    assert d["timeout_seconds_executed"] == 1800
    assert d["fallback_applied"] == False

def test_executed_plan_from_dict():
    """Verify ExecutedPlan deserialization."""
    d = {
        "swarm_id_executed": "serial_handoff",
        "max_candidates_executed": 1,
        "fallback_applied": True,
        "fallback_reason": "low_confidence",
    }
    plan = ExecutedPlan.from_dict(d)
    assert plan.swarm_id_executed == "serial_handoff"
    assert plan.max_candidates_executed == 1
    assert plan.fallback_applied == True
    assert plan.fallback_reason == "low_confidence"

def test_executed_plan_defaults():
    """Verify ExecutedPlan default values."""
    plan = ExecutedPlan(swarm_id_executed="serial_handoff")
    assert plan.max_candidates_executed is None
    assert plan.timeout_seconds_executed is None
    assert plan.fallback_applied == False
```

### 8.2 Integration Tests

```python
# tests/kernel/test_dispatch_recording.py

@pytest.mark.asyncio
async def test_dispatch_records_executed_plan():
    """Verify dispatch creates manifest with executed_plan."""
    issue = create_test_issue()
    config = create_test_config()
    state = create_test_state()

    workcell, manifest = await dispatch_async(issue, config=config, state=state)

    # Verify executed_plan is present
    assert "planner" in manifest.__dict__ or hasattr(manifest, "planner")
    planner = manifest.planner
    assert "executed_plan" in planner
    executed = planner["executed_plan"]
    assert "swarm_id_executed" in executed
    assert executed["swarm_id_executed"] in ["serial_handoff", "speculate_vote"]

@pytest.mark.asyncio
async def test_speculate_records_actual_parallelism():
    """Verify speculate mode records actual parallelism used."""
    issue = create_test_issue(dk_risk="high")  # Triggers speculation
    config = create_test_config(max_parallel_workcells=2)  # Limit parallelism
    state = create_test_state()

    workcell, manifest = await dispatch_async(issue, config=config, state=state)

    executed = manifest.planner["executed_plan"]
    # Should record constrained parallelism
    assert executed["max_candidates_executed"] <= 2

@pytest.mark.asyncio
async def test_rollout_includes_executed_plan():
    """Verify rollout.json includes executed_plan from manifest."""
    manifest = create_test_manifest_with_planner()
    proof = create_test_proof()

    rollout = build_rollout(manifest, proof)

    assert "planner" in rollout
    assert "executed_plan" in rollout["planner"]
    assert rollout["planner"]["executed_plan"]["swarm_id_executed"] == \
           manifest.planner["executed_plan"]["swarm_id_executed"]
```

### 8.3 Extraction Roundtrip Test

```python
# tests/planner/test_extraction_roundtrip.py

def test_extraction_uses_recorded_executed_plan():
    """Verify run_summaries extracts recorded executed_plan correctly."""
    # Create archive with new-style manifest
    archive_dir = create_test_archive(
        manifest={
            "planner": {
                "executed_plan": {
                    "swarm_id_executed": "speculate_vote",
                    "max_candidates_executed": 3,
                    "timeout_seconds_executed": 2700,  # 45 minutes
                }
            }
        }
    )

    summary = build_archive_run_summary(archive_dir)
    action = summary["action_executed"]

    assert action["swarm_id"] == "speculate_vote"
    assert action["max_candidates"] == 3
    assert action["max_minutes"] == 45  # 2700 / 60

def test_extraction_falls_back_for_legacy_archives():
    """Verify extraction still works for archives without executed_plan."""
    # Create legacy archive without planner section
    archive_dir = create_test_archive(
        manifest={
            "speculate_mode": True,
            "control": {"speculate_parallelism": 2},
        }
    )

    summary = build_archive_run_summary(archive_dir)
    action = summary["action_executed"]

    # Should infer from legacy fields
    assert action["swarm_id"] == "speculate_vote"
    assert action["max_candidates"] == 2
```

---

## 9. Acceptance Criteria

### 9.1 Functional Requirements

- [ ] Every dispatched issue creates manifest with `planner.executed_plan`
- [ ] `executed_plan.swarm_id_executed` is always populated
- [ ] `max_candidates_executed` reflects actual parallelism used
- [ ] `timeout_seconds_executed` reflects actual timeout applied
- [ ] Fallback tracking records when decisions are overridden
- [ ] Rollout.json includes complete planner section
- [ ] World runs include planner section in manifests

### 9.2 Backward Compatibility

- [ ] Legacy archives (without planner section) still extract correctly
- [ ] run_summaries.py falls back to heuristic inference for old archives
- [ ] No breaking changes to existing archive structure

### 9.3 Data Quality

- [ ] New runs produce accurate labels in dataset extraction
- [ ] Labels match actual execution (verified in tests)
- [ ] No NaN or missing values in extracted action_executed

---

## 10. Migration Strategy

### 10.1 Phased Rollout

**Phase 1: Recording Only**
- Deploy executed_plan recording to dispatcher/runner
- New runs get accurate labels
- Old archives continue to work with fallback extraction

**Phase 2: Verification**
- Run dataset extraction on new archives
- Verify labels match expected values
- Compare new vs legacy extraction for same issues

**Phase 3: Optional Backfill**
- For critical archives, manually add executed_plan based on logs
- Not required for training (time-based splits will exclude old data)

### 10.2 Backfill Script (Optional)

```python
# scripts/backfill_executed_plan.py

def backfill_archive(archive_dir: Path) -> bool:
    """
    Backfill executed_plan into legacy archive manifest.

    Returns True if backfill was performed, False if already present.
    """
    manifest_path = archive_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())

    if "planner" in manifest and "executed_plan" in manifest.get("planner", {}):
        return False  # Already has executed_plan

    # Infer from legacy fields
    swarm_id = "speculate_vote" if manifest.get("speculate_mode") else "serial_handoff"
    control = manifest.get("control", {})
    parallelism = control.get("speculate_parallelism", 1) if swarm_id == "speculate_vote" else 1

    manifest["planner"] = {
        "executed_plan": {
            "swarm_id_executed": swarm_id,
            "max_candidates_executed": parallelism,
            "timeout_seconds_executed": None,  # Unknown for legacy
            "max_iterations_executed": None,
            "fallback_applied": False,
            "fallback_reason": None,
        },
        "_backfilled": True,
        "_backfill_timestamp": now_rfc3339(),
    }

    manifest_path.write_text(json.dumps(manifest, indent=2))
    return True
```

---

## 11. Dependencies

### 11.1 Upstream Dependencies

| Dependency | Location | Status |
|------------|----------|--------|
| `executed_plan.schema.json` | `schemas/cyntra/` | COMPLETE |
| `run_summaries.py` | `cyntra/planner/` | COMPLETE (handles extraction) |

### 11.2 Downstream Dependents

| Dependent | Description |
|-----------|-------------|
| Track 3 (Best-of-K) | Needs accurate action labels |
| Track 5 (Integration) | Needs recording infrastructure |
| Dataset builder | Uses extracted labels for training |

---

## 12. Open Questions

1. **Backfill scope:** Should we backfill all historical archives or only recent ones?
   - Recommendation: Skip backfill, time-based splits will naturally exclude old data

2. **Timeout precision:** Should we record timeout in seconds or minutes?
   - Recommendation: Seconds (more precise), convert to minutes in extraction

3. **Partial execution:** How to record when speculation is interrupted?
   - Recommendation: Record planned parallelism with fallback_reason explaining actual

---

## 13. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12 | Planner Agent | Initial specification |
