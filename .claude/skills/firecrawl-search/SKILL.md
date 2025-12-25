---
name: firecrawl-search
description: |
  Web search with optional content scraping.
  Returns search results with full page content if requested.
  
  Use when working on search tasks.
metadata:
  version: "1.0.0"
  category: "search"
  priority: "high"
---

# Firecrawl Search

Web search with optional content scraping.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query |
| `limit` | integer | No | 10 | Maximum number of results |
| `scrape_results` | boolean | No | true | Whether to scrape content from results |
| `cache_ttl` | integer | No | 3600 | Cache TTL in seconds (0 to disable) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `results` | array | Search results with optional content |

## Usage

```bash
python scripts/firecrawl-search.py [arguments]
```

---

*Generated from [`skills/search/firecrawl-search.yaml`](../../skills/search/firecrawl-search.yaml)*
