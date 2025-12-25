# Search Skills

Firecrawl-powered web search and scraping skills for the dev-kernel.

## Prerequisites

Set the Firecrawl API key as an environment variable:

```bash
export FIRECRAWL_API_KEY="your-api-key"
```

## Skills

### firecrawl-scrape
Scrape a single URL and convert to markdown/structured data.

```bash
python firecrawl-scrape.py https://docs.example.com/api --formats markdown html
```

### firecrawl-crawl
Recursively crawl a website to extract multiple pages.

```bash
python firecrawl-crawl.py https://docs.example.com --limit 50 --include "*/api/*"
```

### firecrawl-search
Web search with optional content scraping.

```bash
python firecrawl-search.py "python async best practices" --limit 10 --scrape
```

### firecrawl-extract
Extract structured data from URLs using AI.

```bash
python firecrawl-extract.py https://example.com/products --schema schema.json
```

### web-research
Meta-skill that orchestrates search → scrape → extract pipeline.

```bash
python web-research.py "How to implement WebSockets in Rust" --depth medium
```

## Caching

All skills support TTL-based caching to reduce API calls:

- Default TTL: 1 hour (3600 seconds)
- Cache location: `.cyntra/cache/firecrawl/`
- Disable with `--cache-ttl 0`

## Output

All skills output JSON to stdout with a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "cached": false
}
```

On error:

```json
{
  "success": false,
  "error": "Error message"
}
```
