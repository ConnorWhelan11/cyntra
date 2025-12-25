---
name: asset-repair-playbook
description: |
  Given gate failures, generate targeted fix instructions (iteration.py pattern).
  Produces actionable repair steps for failed assets.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "high"
---

# Asset Repair Playbook

Given gate failures, generate targeted fix instructions (iteration.py pattern).

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `verdict_path` | string | Yes | - | Path to gate verdict JSON |
| `asset_path` | string | Yes | - | Path to failing asset |
| `max_iterations` | integer | No | 3 | Maximum repair iterations |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `playbook` | array | Ordered list of repair steps |
| `priority_failures` | array | Failures ordered by severity/impact |
| `estimated_iterations` | integer | Estimated iterations needed |

## Usage

```bash
python scripts/asset-repair-playbook.py [arguments]
```

---

*Generated from [`skills/fab/asset-repair-playbook.yaml`](../../skills/fab/asset-repair-playbook.yaml)*
