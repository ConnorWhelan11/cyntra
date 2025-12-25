---
name: beads-graph-ops
description: |
  Query/update .beads/issues.jsonl with proper status transitions and dependency validation.
  Ensures work graph integrity.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Beads Graph Ops

Query/update .beads/issues.jsonl with proper status transitions and dependency validation.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `operation` | string | Yes | - | Operation (get, update, list, validate-deps) |
| `issue_id` | string | No | - | Issue ID (required for get/update) |
| `updates` | object | No | - | Fields to update (required for update operation) |
| `filters` | object | No | - | Filters for list operation (tags, status, etc.) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `issues` | array | List of issues matching query |
| `validation_errors` | array | Dependency validation errors (if any) |
| `updated` | boolean | True if update succeeded |

## Usage

```bash
python scripts/beads-graph-ops.py [arguments]
```

---

*Generated from [`skills/development/beads-graph-ops.yaml`](../../skills/development/beads-graph-ops.yaml)*
