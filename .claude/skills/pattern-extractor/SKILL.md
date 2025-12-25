---
name: pattern-extractor
description: |
  Lightweight pattern extraction from observations database.
  Queries pre-indexed observations to find successful tool chains and failure modes.
  
  Use this for quick queries against accumulated observations.
  For richer analysis of raw run summaries, use pattern-distiller instead.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "high"
---

# Pattern Extractor

Lightweight pattern extraction from observations database.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `db_path` | string | Yes | - | Path to observations database |
| `domain` | string | No | all | Domain to analyze (code, fab_asset, fab_world, all) |
| `min_occurrences` | integer | No | 3 | Minimum occurrences to qualify as pattern |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `patterns` | array | Extracted successful patterns |
| `anti_patterns` | array | Extracted failure patterns |
| `confidence_scores` | object | Confidence score per pattern |

## Usage

```bash
python scripts/pattern-extractor.py [arguments]
```

---

*Generated from [`skills/sleeptime/pattern-extractor.yaml`](../../skills/sleeptime/pattern-extractor.yaml)*
