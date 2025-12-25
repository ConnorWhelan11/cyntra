---
name: state-hasher-t1
description: |
  Extract coarse-grained features, compute deterministic state_id.
  Tier-1 state representation for Markov analysis.
  
  Use when working on dynamics tasks.
metadata:
  version: "1.0.0"
  category: "dynamics"
  priority: "critical"
---

# State Hasher T1

Extract coarse-grained features, compute deterministic state_id.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `snapshot` | object | Yes | - | State snapshot (phase, gates, artifacts, policy) |
| `domain` | string | Yes | - | Domain (code, fab_asset, fab_world) |
| `job_type` | string | Yes | - | Job type (code.patch, fab.gate, fab.world.build) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `state_id` | string | Deterministic state ID (st1_<hash>) |
| `features` | object | Extracted T1 features |
| `policy_key` | object | Policy parameters for this state |

## Usage

```bash
python scripts/state-hasher-t1.py [arguments]
```

---

*Generated from [`skills/dynamics/state-hasher-t1.yaml`](../../skills/dynamics/state-hasher-t1.yaml)*
