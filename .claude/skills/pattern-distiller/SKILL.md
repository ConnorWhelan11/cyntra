---
name: pattern-distiller
description: |
  Full-featured pattern analysis from raw run summaries (output of history-ingester).
  Extracts recurring patterns: successful tool chains, failure modes, repair strategies.
  Uses embedding similarity and frequency analysis to cluster related patterns.
  
  This is the primary pattern extraction skill for the sleeptime pipeline.
  For quick DB queries on pre-indexed patterns, use pattern-extractor instead.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "high"
---

# Pattern Distiller

Full-featured pattern analysis from raw run summaries (output of history-ingester).

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `run_summaries` | array | Yes | - | Output from history-ingester |
| `pattern_types` | array | No | `['tool_chains', 'error_signatures', 'repair_paths', 'gate_failures']` | Types of patterns to extract |
| `min_frequency` | integer | No | 2 | Minimum occurrences to consider a pattern |
| `similarity_threshold` | number | No | 0.85 | Embedding similarity threshold for clustering (0-1) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `patterns` | array | Extracted patterns with metadata: - pattern_id, pattern_type - signature (canonical representation) - frequency, confidence - example_run_ids - outcome_distribution (success/failure ratio) |
| `anti_patterns` | array | Patterns strongly correlated with failure: - signature, failure_rate - suggested_avoidance |
| `novel_sequences` | array | Tool sequences not seen before (exploration signal) |

## Usage

```bash
python scripts/pattern-distiller.py [arguments]
```

## Examples

### Extract patterns from 20 run summaries

**Inputs:**
```yaml
pattern_types:
- tool_chains
- error_signatures
run_summaries:
- '...'
```

**Outputs:**
```yaml
patterns:
- confidence: 0.92
  frequency: 8
  outcome_distribution:
    failure: 1
    success: 7
  pattern_id: tc_001
  pattern_type: tool_chains
  signature: Read -> Grep -> Edit -> Bash(pytest)
```

---

*Generated from [`skills/sleeptime/pattern-distiller.yaml`](../../skills/sleeptime/pattern-distiller.yaml)*
