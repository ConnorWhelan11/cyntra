---
name: firecrawl-crawl
description: |
  Recursively crawl a website to extract multiple pages.
  Useful for indexing documentation sites.
  
  Use when working on search tasks.
metadata:
  version: "1.0.0"
  category: "search"
  priority: "medium"
---

# Firecrawl Crawl

Recursively crawl a website to extract multiple pages.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | The starting URL to crawl |
| `limit` | integer | No | 50 | Maximum number of pages to crawl |
| `include_patterns` | array | No | - | URL patterns to include (glob syntax) |
| `exclude_patterns` | array | No | - | URL patterns to exclude (glob syntax) |
| `cache_ttl` | integer | No | 3600 | Cache TTL in seconds (0 to disable) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `pages` | array | Array of scraped page content |
| `sitemap` | object | Site structure discovered during crawl |

## Usage

```bash
python scripts/firecrawl-crawl.py [arguments]
```

---

*Generated from [`skills/search/firecrawl-crawl.yaml`](../../skills/search/firecrawl-crawl.yaml)*
