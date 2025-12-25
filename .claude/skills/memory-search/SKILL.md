---
name: memory-search
description: |
  Semantic and full-text search over memory store.
  Supports filtering by domain, block type, and tags.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "high"
---

# Memory Search

Semantic and full-text search over memory store.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query (natural language) |
| `memory_path` | string | Yes | - | Path to memory store directory |
| `search_type` | string | No | hybrid | Search type (semantic, fts, hybrid) |
| `filters` | object | No | - | Filters (domain, block_type, tags) |
| `limit` | integer | No | 10 | Maximum results |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `results` | array | Matching memory blocks |
| `scores` | array | Relevance scores |

## Usage

```bash
python scripts/memory-search.py [arguments]
```

---

*Generated from [`skills/sleeptime/memory-search.yaml`](../../skills/sleeptime/memory-search.yaml)*
