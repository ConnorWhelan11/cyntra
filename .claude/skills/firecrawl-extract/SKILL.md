---
name: firecrawl-extract
description: |
  Extract structured data from URLs using AI.
  Define a schema and let Firecrawl extract matching data.
  
  Use when working on search tasks.
metadata:
  version: "1.0.0"
  category: "search"
  priority: "medium"
---

# Firecrawl Extract

Extract structured data from URLs using AI.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | array | Yes | - | URLs to extract from (can include wildcards) |
| `schema` | object | No | - | JSON schema defining data to extract |
| `prompt` | string | No | - | Natural language extraction instructions |
| `cache_ttl` | integer | No | 3600 | Cache TTL in seconds (0 to disable) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `data` | object | Extracted structured data |

## Usage

```bash
python scripts/firecrawl-extract.py [arguments]
```

---

*Generated from [`skills/search/firecrawl-extract.yaml`](../../skills/search/firecrawl-extract.yaml)*
