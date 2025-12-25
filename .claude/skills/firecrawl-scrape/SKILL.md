---
name: firecrawl-scrape
description: |
  Scrape a single URL and convert to markdown/structured data.
  Uses Firecrawl API for reliable extraction with JS rendering.
  
  Use when working on search tasks.
metadata:
  version: "1.0.0"
  category: "search"
  priority: "high"
---

# Firecrawl Scrape

Scrape a single URL and convert to markdown/structured data.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | The URL to scrape |
| `formats` | array | No | `['markdown']` | Output formats (markdown, html, json, screenshot) |
| `actions` | array | No | - | Browser actions before scraping (click, scroll, wait) |
| `cache_ttl` | integer | No | 3600 | Cache TTL in seconds (0 to disable) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `content` | object | Scraped content in requested formats |
| `metadata` | object | Page metadata (title, description, links) |

## Usage

```bash
python scripts/firecrawl-scrape.py [arguments]
```

---

*Generated from [`skills/search/firecrawl-scrape.yaml`](../../skills/search/firecrawl-scrape.yaml)*
