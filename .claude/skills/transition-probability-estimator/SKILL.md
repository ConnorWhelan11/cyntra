---
name: transition-probability-estimator
description: |
  Compute P(g|f) from DB counts with Laplace smoothing.
  Estimates transition probabilities for dynamics model.
  
  Use when working on dynamics tasks.
metadata:
  version: "1.0.0"
  category: "dynamics"
  priority: "high"
---

# Transition Probability Estimator

Compute P(g|f) from DB counts with Laplace smoothing.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `db_path` | string | Yes | - | Path to dynamics SQLite database |
| `domain` | string | No | - | Domain to analyze |
| `smoothing_alpha` | number | No | 1.0 | Laplace smoothing parameter |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `transition_matrix` | object | Sparse transition probability matrix |
| `edge_count` | integer | Number of observed transitions |
| `state_count` | integer | Number of unique states |

## Usage

```bash
python scripts/transition-probability-estimator.py [arguments]
```

---

*Generated from [`skills/dynamics/transition-probability-estimator.yaml`](../../skills/dynamics/transition-probability-estimator.yaml)*
