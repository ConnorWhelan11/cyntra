---
name: analyze-diff
description: |
  Analyze a git diff for code quality issues, potential bugs, and improvements.
  Used by code-reviewer hook to review patches.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Analyze Diff

Analyze a git diff for code quality issues, potential bugs, and improvements.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `diff` | string | Yes | - | Git diff content |
| `context` | object | No | - | Issue context (id, title, acceptance_criteria) |
| `review_depth` | string | No | standard | Depth of review: quick, standard, deep |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | Overall review summary |
| `issues` | array | List of issues found with file, line, severity, message |
| `approval` | string | Recommendation: approve, request_changes, needs_discussion |
| `coverage_gaps` | array | Areas lacking test coverage |

## Usage

```bash
python scripts/analyze-diff.py [arguments]
```

## Examples

### Analyze a simple diff

**Inputs:**
```yaml
diff: 'diff --git a/foo.py b/foo.py

  +++ b/foo.py

  +    print("debug")

  '
review_depth: quick
```

**Outputs:**
```yaml
approval: needs_discussion
issues:
- file: foo.py
  line: 1
  message: Contains debug statement
  severity: warning
summary: 'Found 1 issue: debug statement'
```

---

*Generated from [`skills/development/analyze-diff.yaml`](../../skills/development/analyze-diff.yaml)*
