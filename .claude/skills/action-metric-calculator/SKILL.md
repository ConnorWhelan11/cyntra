---
name: action-metric-calculator
description: |
  Compute trajectory action, entropy production, detect trapping.
  Measures irreversibility and exploration quality.
  
  Use when working on dynamics tasks.
metadata:
  version: "1.0.0"
  category: "dynamics"
  priority: "high"
---

# Action Metric Calculator

Compute trajectory action, entropy production, detect trapping.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rollout_path` | string | Yes | - | Path to rollout.json with state trajectory |
| `transition_matrix` | object | Yes | - | Transition probabilities for action calculation |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `trajectory_action` | number | Total action along trajectory |
| `action_rate` | number | Action per transition (entropy production) |
| `trapping_detected` | boolean | True if low action + no ΔV improvement |
| `per_transition_action` | array | Action for each state transition |

## Usage

```bash
python scripts/action-metric-calculator.py [arguments]
```

---

*Generated from [`skills/dynamics/action-metric-calculator.yaml`](../../skills/dynamics/action-metric-calculator.yaml)*
