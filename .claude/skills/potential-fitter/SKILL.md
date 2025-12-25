---
name: potential-fitter
description: |
  Solve graph Laplacian for V(state) from reversible edge log-ratios.
  Estimates potential landscape from detailed-balance constraints.
  
  Use when working on dynamics tasks.
metadata:
  version: "1.0.0"
  category: "dynamics"
  priority: "high"
---

# Potential Fitter

Solve graph Laplacian for V(state) from reversible edge log-ratios.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `transition_matrix` | object | Yes | - | Transition probability matrix from estimator |
| `anchor_state` | string | No | - | State to anchor at V=0 (or null for auto-select) |
| `regularization` | number | No | 0.01 | Ridge regularization parameter |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `potential` | array | List of {state_id, V, stderr} entries |
| `fit_quality` | object | RMSE of log-ratio residuals, reversible edge count |
| `non_equilibrium_drives` | array | Edges with large residuals (cycles) |

## Usage

```bash
python scripts/potential-fitter.py [arguments]
```

---

*Generated from [`skills/dynamics/potential-fitter.yaml`](../../skills/dynamics/potential-fitter.yaml)*
