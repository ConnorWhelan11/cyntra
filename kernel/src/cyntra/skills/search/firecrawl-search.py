#!/usr/bin/env python3
"""
Firecrawl Search Skill

Web search with optional content scraping.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import requests
from _cache import cache_key, get_cached, set_cached

FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY", "")
FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1"


def execute(
    query: str,
    limit: int = 10,
    scrape_results: bool = True,
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """
    Search the web and optionally scrape results.

    Args:
        query: Search query
        limit: Maximum number of results
        scrape_results: Whether to scrape content from results
        cache_ttl: Cache TTL in seconds (0 to disable)

    Returns:
        {
            "success": bool,
            "results": [...],
            "cached": bool
        }
    """
    if not FIRECRAWL_API_KEY:
        return {
            "success": False,
            "error": "FIRECRAWL_API_KEY environment variable not set",
        }

    # Build request params
    params = {
        "query": query,
        "limit": limit,
        "scrapeOptions": {
            "formats": ["markdown"],
        }
        if scrape_results
        else None,
    }

    # Check cache
    key = cache_key("search", params)
    cached = get_cached(key, cache_ttl)
    if cached:
        return {
            "success": True,
            "results": cached.get("results", []),
            "cached": True,
        }

    try:
        response = requests.post(
            f"{FIRECRAWL_BASE_URL}/search",
            headers={
                "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
                "Content-Type": "application/json",
            },
            json={k: v for k, v in params.items() if v is not None},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            return {
                "success": False,
                "error": data.get("error", "Search failed"),
            }

        results = [
            {
                "url": r.get("url"),
                "title": r.get("title"),
                "description": r.get("description"),
                "markdown": r.get("markdown") if scrape_results else None,
            }
            for r in data.get("data", [])
        ]

        result = {"results": results}

        # Cache the result
        set_cached(key, result, cache_ttl)

        return {
            "success": True,
            "results": results,
            "cached": False,
        }

    except requests.RequestException as e:
        return {
            "success": False,
            "error": f"Request failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Search the web with Firecrawl")
    parser.add_argument("query", help="Search query")
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum results",
    )
    parser.add_argument(
        "--scrape",
        action="store_true",
        default=True,
        help="Scrape content from results",
    )
    parser.add_argument(
        "--no-scrape",
        action="store_false",
        dest="scrape",
        help="Don't scrape content",
    )
    parser.add_argument(
        "--cache-ttl",
        type=int,
        default=3600,
        help="Cache TTL in seconds (0 to disable)",
    )

    args = parser.parse_args()

    result = execute(
        query=args.query,
        limit=args.limit,
        scrape_results=args.scrape,
        cache_ttl=args.cache_ttl,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
