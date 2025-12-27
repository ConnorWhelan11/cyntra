#!/usr/bin/env python3
"""
Firecrawl Scrape Skill

Scrape a single URL and convert to markdown/structured data.
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
    url: str,
    formats: list[str] | None = None,
    actions: list[dict[str, Any]] | None = None,
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """
    Scrape a single URL.

    Args:
        url: The URL to scrape
        formats: Output formats (markdown, html, json, screenshot)
        actions: Browser actions before scraping
        cache_ttl: Cache TTL in seconds (0 to disable)

    Returns:
        {
            "success": bool,
            "content": {...},
            "metadata": {...},
            "cached": bool
        }
    """
    if not FIRECRAWL_API_KEY:
        return {
            "success": False,
            "error": "FIRECRAWL_API_KEY environment variable not set",
        }

    formats = formats or ["markdown"]

    # Build request params
    params = {
        "url": url,
        "formats": formats,
    }
    if actions:
        params["actions"] = actions

    # Check cache
    key = cache_key("scrape", params)
    cached = get_cached(key, cache_ttl)
    if cached:
        return {
            "success": True,
            "content": cached.get("content", {}),
            "metadata": cached.get("metadata", {}),
            "cached": True,
        }

    # Make API request
    try:
        response = requests.post(
            f"{FIRECRAWL_BASE_URL}/scrape",
            headers={
                "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
                "Content-Type": "application/json",
            },
            json=params,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            return {
                "success": False,
                "error": data.get("error", "Unknown error"),
            }

        result_data = data.get("data", {})
        result = {
            "content": {
                "markdown": result_data.get("markdown"),
                "html": result_data.get("html"),
                "rawHtml": result_data.get("rawHtml"),
                "screenshot": result_data.get("screenshot"),
            },
            "metadata": result_data.get("metadata", {}),
        }

        # Cache the result
        set_cached(key, result, cache_ttl)

        return {
            "success": True,
            "content": result["content"],
            "metadata": result["metadata"],
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

    parser = argparse.ArgumentParser(description="Scrape a URL with Firecrawl")
    parser.add_argument("url", help="URL to scrape")
    parser.add_argument(
        "--formats",
        nargs="+",
        default=["markdown"],
        help="Output formats (markdown, html, json, screenshot)",
    )
    parser.add_argument(
        "--cache-ttl",
        type=int,
        default=3600,
        help="Cache TTL in seconds (0 to disable)",
    )

    args = parser.parse_args()

    result = execute(
        url=args.url,
        formats=args.formats,
        cache_ttl=args.cache_ttl,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
