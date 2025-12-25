---
name: deterministic-test-suite
description: |
  Run tests with fixed seeds, verify replay stability, detect non-determinism.
  Ensures reproducibility across test runs.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Deterministic Test Suite

Run tests with fixed seeds, verify replay stability, detect non-determinism.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `test_path` | string | Yes | - | Path to test directory or specific test file |
| `seed` | integer | No | 42 | Fixed seed for deterministic execution |
| `runs` | integer | No | 3 | Number of runs to verify stability |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `all_passed` | boolean | True if all runs passed and results match |
| `deterministic` | boolean | True if all runs produced identical results |
| `divergences` | array | List of non-deterministic behaviors detected |

## Usage

```bash
python scripts/deterministic-test-suite.py [arguments]
```

---

*Generated from [`skills/development/deterministic-test-suite.yaml`](../../skills/development/deterministic-test-suite.yaml)*
