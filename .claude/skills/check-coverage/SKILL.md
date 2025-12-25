---
name: check-coverage
description: |
  Analyze test coverage and identify gaps.
  Integrates with pytest-cov, coverage.py.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Check Coverage

Analyze test coverage and identify gaps.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `repo_path` | string | Yes | - | Path to repository |
| `source_paths` | array | No | - | Source paths to check coverage for |
| `min_coverage` | number | No | 80 | Minimum coverage threshold (0-100) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `overall_coverage` | number | Overall coverage percentage |
| `file_coverage` | object | Per-file coverage breakdown |
| `uncovered_lines` | object | Map of file to uncovered line numbers |
| `meets_threshold` | boolean | Whether coverage meets minimum threshold |

## Usage

```bash
python scripts/check-coverage.py [arguments]
```

## Examples

### Check coverage for a Python project

**Inputs:**
```yaml
min_coverage: 80
repo_path: /path/to/repo
```

**Outputs:**
```yaml
file_coverage:
  src/main.py: 92.0
  src/utils.py: 78.0
meets_threshold: true
overall_coverage: 85.5
uncovered_lines:
  src/utils.py:
  - 45
  - 46
  - 78
  - 79
```

---

*Generated from [`skills/development/check-coverage.yaml`](../../skills/development/check-coverage.yaml)*
