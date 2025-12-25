---
name: explain-failure
description: |
  Analyze gate failure output and explain root cause.
  Used by debug-specialist hook to diagnose failing gates.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Explain Failure

Analyze gate failure output and explain root cause.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `gate_name` | string | Yes | - | Name of the failing gate (test, lint, typecheck) |
| `error_output` | string | Yes | - | Error/failure output from the gate |
| `files_modified` | array | No | - | Files modified in the patch |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `root_cause` | string | Identified root cause of the failure |
| `suggestions` | array | Fix suggestions ordered by likelihood |
| `related_files` | array | Files related to the failure |
| `severity` | string | Severity: low (easy fix), medium, high (complex) |
| `category` | string | Category: syntax, type, test, lint, import, runtime |

## Usage

```bash
python scripts/explain-failure.py [arguments]
```

## Examples

### Analyze a pytest failure

**Inputs:**
```yaml
error_output: 'FAILED tests/test_foo.py::test_bar - AssertionError

  assert 1 == 2

  '
files_modified:
- src/foo.py
gate_name: test
```

**Outputs:**
```yaml
category: test
related_files:
- tests/test_foo.py
- src/foo.py
root_cause: Assertion failure in test_bar
severity: medium
suggestions:
- Check the expected value in the assertion
- Verify the logic in src/foo.py matches test expectations
```

---

*Generated from [`skills/development/explain-failure.yaml`](../../skills/development/explain-failure.yaml)*
