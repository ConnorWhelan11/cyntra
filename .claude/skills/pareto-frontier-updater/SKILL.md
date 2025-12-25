---
name: pareto-frontier-updater
description: |
  Maintain non-dominated set across quality/cost/determinism objectives.
  Manages Pareto frontier for prompt evolution.
  
  Use when working on evolution tasks.
metadata:
  version: "1.0.0"
  category: "evolution"
  priority: "critical"
---

# Pareto Frontier Updater

Maintain non-dominated set across quality/cost/determinism objectives.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `frontier_path` | string | Yes | - | Path to current frontier.json |
| `new_genomes` | array | Yes | - | New genome evaluation results to consider |
| `objectives` | array | No | `['quality', 'cost', 'determinism']` | Objectives to optimize (quality, cost, determinism, etc.) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `frontier_path` | string | Path to updated frontier.json |
| `added` | array | Genomes added to frontier |
| `removed` | array | Genomes dominated and removed |
| `frontier_size` | integer | Current frontier size |

## Usage

```bash
python scripts/pareto-frontier-updater.py [arguments]
```

---

*Generated from [`skills/evolution/pareto-frontier-updater.yaml`](../../skills/evolution/pareto-frontier-updater.yaml)*
