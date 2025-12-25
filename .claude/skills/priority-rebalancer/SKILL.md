---
name: priority-rebalancer
description: |
  Adjust exploration priorities based on accumulated evidence from rollouts.
  Updates genome weights, toolchain routing preferences, and bead priorities
  based on observed success rates and pattern analysis.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "medium"
---

# Priority Rebalancer

Adjust exploration priorities based on accumulated evidence from rollouts.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `patterns` | object | Yes | - | Output from pattern-distiller |
| `current_config` | object | No | - | Current routing/priority config |
| `adjustment_strength` | number | No | 0.3 | How aggressively to adjust (0-1, higher = more change) |
| `min_evidence` | integer | No | 5 | Minimum pattern occurrences before adjusting |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `recommended_adjustments` | array | Suggested config changes: - target (routing/genome/priority) - current_value - recommended_value - evidence (pattern_ids supporting change) - confidence |
| `exploration_suggestions` | array | Areas that need more exploration (low sample count) |
| `exploitation_candidates` | array | High-confidence patterns to exploit more |

## Usage

```bash
python scripts/priority-rebalancer.py [arguments]
```

## Examples

### Rebalance based on pattern analysis

**Inputs:**
```yaml
adjustment_strength: 0.3
patterns:
  anti_patterns:
  - '...'
  patterns:
  - '...'
```

**Outputs:**
```yaml
recommended_adjustments:
- confidence: 0.78
  current_value: codex
  evidence:
  - pattern_tc_003
  - pattern_tc_007
  rationale: Claude shows 85% success on high-risk tasks vs Codex 62%
  recommended_value: claude
  target: routing.risk.high.toolchain
- confidence: 0.65
  current_value: 0.7
  evidence:
  - anti_pattern_001
  rationale: Lower temperature reduces oscillation in repair loops
  recommended_value: 0.5
  target: genome.repair_prompt.temperature
```

---

*Generated from [`skills/sleeptime/priority-rebalancer.yaml`](../../skills/sleeptime/priority-rebalancer.yaml)*
