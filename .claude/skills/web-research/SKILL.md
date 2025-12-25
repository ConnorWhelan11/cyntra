---
name: web-research
description: |
  Meta-skill that orchestrates search → scrape → extract pipeline.
  Performs comprehensive web research on a topic.
  
  Use when working on search tasks.
metadata:
  version: "1.0.0"
  category: "search"
  priority: "high"
---

# Web Research

Meta-skill that orchestrates search → scrape → extract pipeline.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `topic` | string | Yes | - | Research topic or question |
| `depth` | string | No | medium | Research depth (shallow, medium, deep) |
| `output_format` | string | No | summary | Output format (summary, detailed, raw) |
| `cache_ttl` | integer | No | 3600 | Cache TTL in seconds (0 to disable) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `findings` | string | Consolidated research findings |
| `sources` | array | List of source URLs used |

## Usage

```bash
python scripts/web-research.py [arguments]
```

---

*Generated from [`skills/search/web-research.yaml`](../../skills/search/web-research.yaml)*
