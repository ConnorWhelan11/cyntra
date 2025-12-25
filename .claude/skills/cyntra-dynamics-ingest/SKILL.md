---
name: cyntra-dynamics-ingest
description: |
  Extract T1 states from trajectories and log transitions to SQLite DB.
  Core dynamics data collection pipeline.
  
  Use when working on dynamics tasks.
metadata:
  version: "1.0.0"
  category: "dynamics"
  priority: "critical"
---

# Cyntra Dynamics Ingest

Extract T1 states from trajectories and log transitions to SQLite DB.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rollout_path` | string | Yes | - | Path to rollout.json |
| `db_path` | string | Yes | - | Path to dynamics SQLite database |
| `domain` | string | Yes | - | Domain (code, fab_asset, fab_world) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `states_extracted` | integer | Number of T1 states extracted |
| `transitions_logged` | integer | Number of transitions logged |
| `state_ids` | array | List of state IDs created |

## Usage

```bash
python scripts/cyntra-dynamics-ingest.py [arguments]
```

---

*Generated from [`skills/dynamics/cyntra-dynamics-ingest.yaml`](../../skills/dynamics/cyntra-dynamics-ingest.yaml)*
