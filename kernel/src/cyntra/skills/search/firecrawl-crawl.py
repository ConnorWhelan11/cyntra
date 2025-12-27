#!/usr/bin/env python3
"""
Firecrawl Crawl Skill

Recursively crawl a website to extract multiple pages.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import requests
from _cache import cache_key, get_cached, set_cached

FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY", "")
FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1"


def execute(
    url: str,
    limit: int = 50,
    include_patterns: list[str] | None = None,
    exclude_patterns: list[str] | None = None,
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """
    Crawl a website recursively.

    Args:
        url: The starting URL to crawl
        limit: Maximum pages to crawl
        include_patterns: URL patterns to include
        exclude_patterns: URL patterns to exclude
        cache_ttl: Cache TTL in seconds (0 to disable)

    Returns:
        {
            "success": bool,
            "pages": [...],
            "sitemap": {...},
            "cached": bool
        }
    """
    if not FIRECRAWL_API_KEY:
        return {
            "success": False,
            "error": "FIRECRAWL_API_KEY environment variable not set",
        }

    # Build request params
    params: dict[str, Any] = {
        "url": url,
        "limit": limit,
    }
    if include_patterns:
        params["includePaths"] = include_patterns
    if exclude_patterns:
        params["excludePaths"] = exclude_patterns

    # Check cache
    key = cache_key("crawl", params)
    cached = get_cached(key, cache_ttl)
    if cached:
        return {
            "success": True,
            "pages": cached.get("pages", []),
            "sitemap": cached.get("sitemap", {}),
            "cached": True,
        }

    try:
        # Start crawl job
        response = requests.post(
            f"{FIRECRAWL_BASE_URL}/crawl",
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
                "error": data.get("error", "Failed to start crawl"),
            }

        job_id = data.get("id")
        if not job_id:
            return {
                "success": False,
                "error": "No job ID returned",
            }

        # Poll for completion
        pages = []
        sitemap: dict[str, list[str]] = {}
        max_polls = 120  # 10 minutes max

        for _ in range(max_polls):
            status_response = requests.get(
                f"{FIRECRAWL_BASE_URL}/crawl/{job_id}",
                headers={"Authorization": f"Bearer {FIRECRAWL_API_KEY}"},
                timeout=30,
            )
            status_response.raise_for_status()
            status_data = status_response.json()

            status = status_data.get("status")

            if status == "completed":
                pages = status_data.get("data", [])
                # Build sitemap from crawled URLs
                for page in pages:
                    page_url = page.get("metadata", {}).get("url", "")
                    links = page.get("metadata", {}).get("links", [])
                    if page_url:
                        sitemap[page_url] = links
                break

            if status == "failed":
                return {
                    "success": False,
                    "error": status_data.get("error", "Crawl failed"),
                }

            time.sleep(5)  # Wait 5 seconds between polls

        result = {
            "pages": [
                {
                    "url": p.get("metadata", {}).get("url"),
                    "title": p.get("metadata", {}).get("title"),
                    "markdown": p.get("markdown"),
                }
                for p in pages
            ],
            "sitemap": sitemap,
        }

        # Cache the result
        set_cached(key, result, cache_ttl)

        return {
            "success": True,
            "pages": result["pages"],
            "sitemap": result["sitemap"],
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

    parser = argparse.ArgumentParser(description="Crawl a website with Firecrawl")
    parser.add_argument("url", help="Starting URL to crawl")
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Maximum pages to crawl",
    )
    parser.add_argument(
        "--include",
        nargs="+",
        help="URL patterns to include",
    )
    parser.add_argument(
        "--exclude",
        nargs="+",
        help="URL patterns to exclude",
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
        limit=args.limit,
        include_patterns=args.include,
        exclude_patterns=args.exclude,
        cache_ttl=args.cache_ttl,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
