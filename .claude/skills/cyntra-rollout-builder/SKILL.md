---
name: cyntra-rollout-builder
description: |
  Build canonical rollout.json from telemetry + proof + fab manifests.
  Creates normalized trajectory summary used by GEPA + dynamics layers.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "critical"
---

# Cyntra Rollout Builder

Build canonical rollout.json from telemetry + proof + fab manifests.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workcell_path` | string | Yes | - | Path to workcell directory containing manifest/proof/telemetry |
| `include_trajectory_details` | boolean | No | false | Include full tool call details in trajectory |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `rollout_path` | string | Path to generated rollout.json |
| `rollout_id` | string | Generated rollout ID |
| `summary` | object | Quick summary (tool counts, duration, outcome) |

## Usage

```bash
python scripts/cyntra-rollout-builder.py [arguments]
```

---

*Generated from [`skills/development/cyntra-rollout-builder.yaml`](../../skills/development/cyntra-rollout-builder.yaml)*
