---
name: rollout-reflector
description: |
  Analyze failed trajectories, propose prompt patches with rationale.
  Reflection-based prompt improvement from failures.
  
  Use when working on evolution tasks.
metadata:
  version: "1.0.0"
  category: "evolution"
  priority: "high"
---

# Rollout Reflector

Analyze failed trajectories, propose prompt patches with rationale.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rollout_paths` | array | Yes | - | Paths to failed rollout.json files |
| `genome_id` | string | Yes | - | Genome that produced these rollouts |
| `reflection_depth` | string | No | medium | Depth of analysis (quick, medium, deep) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `patches` | array | Proposed prompt patches with rationales |
| `failure_patterns` | array | Common failure patterns identified |
| `recommendations` | object | Suggested genome improvements |

## Usage

```bash
python scripts/rollout-reflector.py [arguments]
```

---

*Generated from [`skills/evolution/rollout-reflector.yaml`](../../skills/evolution/rollout-reflector.yaml)*
