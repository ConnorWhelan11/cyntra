---
name: find-tests
description: |
  Find existing tests related to source files.
  Maps source files to their test counterparts.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Find Tests

Find existing tests related to source files.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `source_files` | array | Yes | - | List of source file paths |
| `repo_path` | string | Yes | - | Repository root path |
| `test_patterns` | array | No | `['tests/test_*.py', 'tests/**/test_*.py', '*_test.py']` | Custom test file patterns |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `test_mapping` | object | Map of source file to test files |
| `untested_files` | array | Source files without tests |
| `test_frameworks` | array | Detected test frameworks (pytest, jest, etc.) |

## Usage

```bash
python scripts/find-tests.py [arguments]
```

## Examples

### Find tests for a Python module

**Inputs:**
```yaml
repo_path: /path/to/repo
source_files:
- src/auth/login.py
```

**Outputs:**
```yaml
test_frameworks:
- pytest
test_mapping:
  src/auth/login.py:
  - tests/auth/test_login.py
untested_files: []
```

---

*Generated from [`skills/development/find-tests.yaml`](../../skills/development/find-tests.yaml)*
