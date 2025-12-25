#!/usr/bin/env python3
"""
Firecrawl Extract Skill

Extract structured data from URLs using AI.
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
    urls: list[str],
    schema: dict[str, Any] | None = None,
    prompt: str | None = None,
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """
    Extract structured data from URLs.

    Args:
        urls: URLs to extract from (can include wildcards like example.com/*)
        schema: JSON schema defining data to extract
        prompt: Natural language extraction instructions
        cache_ttl: Cache TTL in seconds (0 to disable)

    Returns:
        {
            "success": bool,
            "data": {...},
            "cached": bool
        }
    """
    if not FIRECRAWL_API_KEY:
        return {
            "success": False,
            "error": "FIRECRAWL_API_KEY environment variable not set",
        }

    if not schema and not prompt:
        return {
            "success": False,
            "error": "Either schema or prompt must be provided",
        }

    # Build request params
    params: dict[str, Any] = {
        "urls": urls,
    }
    if schema:
        params["schema"] = schema
    if prompt:
        params["prompt"] = prompt

    # Check cache
    key = cache_key("extract", params)
    cached = get_cached(key, cache_ttl)
    if cached:
        return {
            "success": True,
            "data": cached.get("data", {}),
            "cached": True,
        }

    try:
        response = requests.post(
            f"{FIRECRAWL_BASE_URL}/extract",
            headers={
                "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
                "Content-Type": "application/json",
            },
            json=params,
            timeout=120,  # Extraction can take longer
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            return {
                "success": False,
                "error": data.get("error", "Extraction failed"),
            }

        extracted_data = data.get("data", {})
        result = {"data": extracted_data}

        # Cache the result
        set_cached(key, result, cache_ttl)

        return {
            "success": True,
            "data": extracted_data,
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

    parser = argparse.ArgumentParser(description="Extract data with Firecrawl")
    parser.add_argument("urls", nargs="+", help="URLs to extract from")
    parser.add_argument(
        "--schema",
        type=str,
        help="Path to JSON schema file",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        help="Extraction instructions",
    )
    parser.add_argument(
        "--cache-ttl",
        type=int,
        default=3600,
        help="Cache TTL in seconds (0 to disable)",
    )

    args = parser.parse_args()

    schema = None
    if args.schema:
        with open(args.schema) as f:
            schema = json.load(f)

    result = execute(
        urls=args.urls,
        schema=schema,
        prompt=args.prompt,
        cache_ttl=args.cache_ttl,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
