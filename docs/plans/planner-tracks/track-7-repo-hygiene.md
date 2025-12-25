# Track 7: Repository Hygiene & Technical Debt Specification

**Status:** Implementation Ready
**Priority:** P3-LOW
**Owner:** Any
**Depends On:** None (independent track)
**Blocks:** None
**Last Updated:** 2025-12

---

## 1. Overview

### 1.1 Purpose

This track addresses repository-level technical debt and hygiene issues that affect the planner system's maintainability, CI integration, and documentation quality.

### 1.2 Goals

1. Clean up deleted files showing in git status
2. Add planner module to CI pipeline
3. Create schema validation tests
4. Document planner architecture
5. Establish testing conventions for planner code

### 1.3 Scope

This track is lower priority and can be worked on opportunistically. Items can be parallelized across team members.

---

## 2. Current State Analysis

### 2.1 Git Status Issues

The repository has many files marked as deleted (`D`) in git status:

```
 D dev-kernel/.gitignore
 D dev-kernel/README.md
 D dev-kernel/docs/architecture/*.md (many files)
 D dev-kernel/examples/*.yaml
 D dev-kernel/pyproject.toml
 D dev-kernel/schemas/*.json (many files)
 D dev-kernel/src/dev_kernel/**/*.py (many files)
 D dev-kernel/tests/**/*.py (many files)
```

These appear to be files that were moved to `cyntra-kernel/` but the deletions weren't committed.

### 2.2 Missing CI Integration

The planner module (`cyntra-kernel/src/cyntra/planner/`) is not explicitly included in CI workflows for:
- Type checking (mypy)
- Linting (ruff)
- Unit tests (pytest)

### 2.3 Missing Documentation

- No architecture documentation for planner subsystem
- Schema files lack usage examples
- Training workflow not documented

---

## 3. Task Specifications

### 3.1 Task: Clean Up Deleted Files

**Description:** Commit the deletion of old `dev-kernel/` files or restore them if needed.

**Steps:**
1. Review the deleted files to confirm they're migrated to `cyntra-kernel/`
2. If migrated: `git add dev-kernel/ && git commit -m "Remove old dev-kernel/ (migrated to cyntra-kernel/)"`
3. If not migrated: restore needed files

**Verification:**
```bash
git status
# Should show clean working tree (no D files)
```

**Estimated time:** 1 hour

---

### 3.2 Task: Add Planner to CI Pipeline

**Description:** Ensure planner code is covered by CI checks.

**Files to modify:**
- `.github/workflows/ci.yml` or equivalent

**Changes:**

```yaml
# .github/workflows/ci.yml

jobs:
  lint:
    steps:
      - name: Ruff check
        run: |
          cd cyntra-kernel
          ruff check src/cyntra/planner/

  typecheck:
    steps:
      - name: Mypy check
        run: |
          cd cyntra-kernel
          mypy src/cyntra/planner/ --strict

  test:
    steps:
      - name: Pytest planner
        run: |
          cd cyntra-kernel
          pytest tests/planner/ -v
```

**Verification:**
```bash
# Local verification before PR
cd cyntra-kernel
ruff check src/cyntra/planner/
mypy src/cyntra/planner/ --strict
pytest tests/planner/ -v
```

**Estimated time:** 2 hours

---

### 3.3 Task: Schema Validation Tests

**Description:** Create tests that validate example payloads against JSON schemas.

**Files to create:**
- `cyntra-kernel/tests/planner/test_schemas.py`

**Implementation:**

```python
# tests/planner/test_schemas.py

import json
from pathlib import Path

import jsonschema
import pytest


SCHEMAS_DIR = Path(__file__).parents[3] / "schemas" / "cyntra"


def load_schema(name: str) -> dict:
    """Load schema by name."""
    schema_path = SCHEMAS_DIR / f"{name}.schema.json"
    return json.loads(schema_path.read_text())


class TestPlannerInputSchema:
    @pytest.fixture
    def schema(self):
        return load_schema("planner_input")

    def test_valid_minimal_input(self, schema):
        """Minimal valid planner_input.v1."""
        instance = {
            "schema_version": "cyntra.planner_input.v1",
            "created_at": "2025-12-20T10:00:00Z",
            "universe_id": "test-universe",
            "job_type": "code",
            "universe_defaults": {"swarm_id": None, "objective_id": None},
            "issue": {
                "issue_id": "issue-123",
                "dk_priority": "P2",
                "dk_risk": "medium",
                "dk_size": "M",
                "dk_tool_hint": None,
                "dk_attempts": 0,
                "tags": [],
            },
            "history": {"last_n_similar_runs": []},
            "action_space": {
                "swarm_ids": ["serial_handoff"],
                "max_minutes_bins": [30],
                "max_candidates_bins": [1],
                "max_iterations_bins": ["NA"],
                "validity_rules": [],
            },
        }
        jsonschema.validate(instance, schema)

    def test_invalid_missing_required(self, schema):
        """Missing required fields should fail."""
        instance = {"schema_version": "cyntra.planner_input.v1"}
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance, schema)

    def test_invalid_priority_enum(self, schema):
        """Invalid priority enum should fail."""
        instance = create_valid_planner_input()
        instance["issue"]["dk_priority"] = "P5"  # Invalid
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(instance, schema)


class TestPlannerActionSchema:
    @pytest.fixture
    def schema(self):
        return load_schema("planner_action")

    def test_valid_action(self, schema):
        instance = {
            "schema_version": "cyntra.planner_action.v1",
            "created_at": "2025-12-20T10:00:00Z",
            "swarm_id": "speculate_vote",
            "budgets": {
                "max_candidates_bin": 2,
                "max_minutes_bin": 30,
                "max_iterations_bin": "NA",
            },
        }
        jsonschema.validate(instance, schema)


class TestExecutedPlanSchema:
    @pytest.fixture
    def schema(self):
        return load_schema("executed_plan")

    def test_valid_executed_plan(self, schema):
        instance = {
            "swarm_id_executed": "serial_handoff",
            "max_candidates_executed": 1,
            "timeout_seconds_executed": 1800,
            "max_iterations_executed": None,
            "fallback_applied": False,
            "fallback_reason": None,
        }
        jsonschema.validate(instance, schema)


def create_valid_planner_input() -> dict:
    """Factory for valid planner_input.v1."""
    return {
        "schema_version": "cyntra.planner_input.v1",
        "created_at": "2025-12-20T10:00:00Z",
        "universe_id": "test-universe",
        "job_type": "code",
        "universe_defaults": {"swarm_id": None, "objective_id": None},
        "issue": {
            "issue_id": "issue-123",
            "dk_priority": "P2",
            "dk_risk": "medium",
            "dk_size": "M",
            "dk_tool_hint": None,
            "dk_attempts": 0,
            "tags": [],
        },
        "history": {"last_n_similar_runs": []},
        "action_space": {
            "swarm_ids": ["serial_handoff"],
            "max_minutes_bins": [30],
            "max_candidates_bins": [1],
            "max_iterations_bins": ["NA"],
            "validity_rules": [],
        },
    }
```

**Verification:**
```bash
pytest tests/planner/test_schemas.py -v
```

**Estimated time:** 3 hours

---

### 3.4 Task: Document Planner Architecture

**Description:** Create architecture documentation summarizing the planner system.

**File to create:**
- `docs/architecture/planner.md`

**Content outline:**

```markdown
# Planner Architecture

## Overview

The Cyntra Planner is a machine learning system that predicts optimal swarm topology and budget configurations for issue resolution.

## Components

### 1. Data Pipeline

- **Dataset Builder** (`cyntra/planner/dataset.py`): Extracts training examples from archived runs
- **Run Summaries** (`cyntra/planner/run_summaries.py`): Builds compact run representations
- **Similar Runs** (`cyntra/planner/similar_runs.py`): Retrieves relevant history for context

### 2. Tokenization

- **Encoder** (`cyntra/planner/tokenizer.py`): Converts JSON to fixed-dim tensors
- **Action Decoder**: Maps model outputs to valid actions

### 3. Models

- **HeuristicBaseline**: Rule-based fallback reproducing current behavior
- **MLPPolicy**: Trainable multi-head classifier

### 4. Inference

- **PlannerInference** (`cyntra/planner/inference.py`): Kernel integration module
- **ONNXPlannerModel** (`cyntra/planner/onnx_model.py`): Lightweight ONNX loader

## Data Flow

[Diagram showing: Issues → Dataset → Training → Model → Inference → Dispatch]

## Schemas

- `planner_input.v1`: Model input specification
- `planner_action.v1`: Model output specification
- `executed_plan.v1`: What actually ran

## Configuration

Planner is configured via `.cyntra/config.yaml`:

```yaml
planner:
  enabled: true
  model:
    path: ".cyntra/models/planner/v1"
    type: "onnx"
  inference:
    confidence_threshold: 0.6
```

## Training

See `docs/models/swarm_planner_training_spec.md` for complete training specification.
```

**Estimated time:** 4 hours

---

### 3.5 Task: Testing Conventions Document

**Description:** Document testing conventions for planner module.

**File to create:**
- `cyntra-kernel/tests/planner/README.md`

**Content:**

```markdown
# Planner Test Suite

## Test Organization

```
tests/planner/
├── __init__.py
├── conftest.py           # Shared fixtures
├── test_action_space.py  # Action space tests
├── test_dataset.py       # Dataset builder tests
├── test_models.py        # Model unit tests
├── test_tokenizer.py     # Tokenizer tests
├── test_inference.py     # Inference tests
├── test_schemas.py       # Schema validation
├── test_onnx_export.py   # ONNX export tests
├── bench/                # Best-of-K bench tests
│   ├── test_sampler.py
│   ├── test_winner.py
│   └── test_runner.py
└── fixtures/             # Test fixtures
    ├── sample_planner_input.json
    ├── sample_dataset.jsonl
    └── sample_model_bundle/
```

## Running Tests

```bash
# All planner tests
pytest tests/planner/ -v

# Specific module
pytest tests/planner/test_tokenizer.py -v

# With coverage
pytest tests/planner/ --cov=cyntra.planner --cov-report=html
```

## Fixtures

Common fixtures are in `conftest.py`:

- `action_space`: Default action space for testing
- `sample_issue`: Sample Issue object
- `sample_planner_input`: Valid planner_input.v1 dict
- `encoder`: PlannerInputEncoder instance
- `temp_model_dir`: Temporary directory with model bundle

## Test Categories

### Unit Tests
Test individual functions in isolation. Mock external dependencies.

### Integration Tests
Test component interactions. Use `@pytest.mark.integration`.

### Schema Tests
Validate JSON payloads against schemas. In `test_schemas.py`.

## Writing New Tests

1. Add test file matching module: `test_<module>.py`
2. Use descriptive test names: `test_<function>_<scenario>`
3. Add docstrings explaining what's tested
4. Use fixtures for common setup
5. Include both positive and negative cases
```

**Estimated time:** 2 hours

---

## 4. Implementation Summary

### 4.1 All Tasks

| Task | Description | Est. Hours | Priority |
|------|-------------|------------|----------|
| T7.1 | Clean up deleted files | 1 | Low |
| T7.2 | Add planner to CI | 2 | Medium |
| T7.3 | Schema validation tests | 3 | Medium |
| T7.4 | Architecture documentation | 4 | Low |
| T7.5 | Testing conventions doc | 2 | Low |

**Total estimated hours:** 12

### 4.2 File Deliverables

| File | Description | Status |
|------|-------------|--------|
| `.github/workflows/ci.yml` | CI integration | MODIFY |
| `cyntra-kernel/tests/planner/test_schemas.py` | Schema tests | NEW |
| `cyntra-kernel/tests/planner/README.md` | Test conventions | NEW |
| `docs/architecture/planner.md` | Architecture docs | NEW |

---

## 5. Acceptance Criteria

### 5.1 Repository Hygiene

- [ ] No unexpected `D` (deleted) files in git status
- [ ] All planner files tracked and committed

### 5.2 CI Integration

- [ ] CI runs mypy on `cyntra/planner/`
- [ ] CI runs ruff on `cyntra/planner/`
- [ ] CI runs pytest on `tests/planner/`
- [ ] CI failures block merge

### 5.3 Documentation

- [ ] Architecture doc covers all major components
- [ ] Test README explains how to run tests
- [ ] Schema examples are validated in tests

---

## 6. Notes

- These tasks are independent and can be parallelized
- Consider doing T7.2 (CI) first to catch issues early
- T7.1 (cleanup) should be done carefully to avoid losing work
- Documentation tasks (T7.4, T7.5) can be done last

---

## 7. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12 | Planner Agent | Initial specification |
