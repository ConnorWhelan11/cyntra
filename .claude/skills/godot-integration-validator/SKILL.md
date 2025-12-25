---
name: godot-integration-validator
description: |
  Check GLB against CONTRACT.md requirements (spawn points, colliders, budgets).
  Validates Godot 4 integration compliance.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "critical"
---

# Godot Integration Validator

Check GLB against CONTRACT.md requirements (spawn points, colliders, budgets).

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `glb_path` | string | Yes | - | Path to GLB file |
| `contract_path` | string | No | fab/godot/CONTRACT.md | Path to CONTRACT.md |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `passed` | boolean | True if GLB meets all contract requirements |
| `violations` | array | Contract violations found |
| `warnings` | array | Non-blocking warnings |
| `metadata` | object | Extracted metadata (spawn count, colliders, etc.) |

## Usage

```bash
python scripts/godot-integration-validator.py [arguments]
```

---

*Generated from [`skills/fab/godot-integration-validator.yaml`](../../skills/fab/godot-integration-validator.yaml)*
