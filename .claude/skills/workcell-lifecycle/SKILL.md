---
name: workcell-lifecycle
description: |
  Create/verify/cleanup git worktree workcells with proper isolation.
  Manages the full lifecycle of workcell directories.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "critical"
---

# Workcell Lifecycle

Create/verify/cleanup git worktree workcells with proper isolation.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | string | Yes | - | Action to perform (create, verify, cleanup, cleanup-all) |
| `issue_id` | string | No | - | Issue ID for workcell (required for create) |
| `workcell_id` | string | No | - | Workcell ID (required for verify/cleanup) |
| `forbidden_paths` | array | No | `['.beads/', '.cyntra/', '.cyntra/secrets/']` | Paths that should not be accessible in workcell |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `workcell_id` | string | Workcell ID |
| `workcell_path` | string | Path to workcell directory |
| `branch_name` | string | Git branch name for workcell |
| `status` | string | Status of operation |

## Usage

```bash
python scripts/workcell-lifecycle.py [arguments]
```

---

*Generated from [`skills/development/workcell-lifecycle.yaml`](../../skills/development/workcell-lifecycle.yaml)*
