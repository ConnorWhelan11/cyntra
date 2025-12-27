#!/usr/bin/env python3
"""
Firecrawl Response Cache

TTL-based caching layer for Firecrawl API responses to reduce API calls and costs.
Cache is stored in .cyntra/cache/firecrawl/ with content-addressed keys.
"""

from __future__ import annotations

import hashlib
import json
import time
from contextlib import suppress
from pathlib import Path
from typing import Any

# Default cache location (relative to project root)
CACHE_DIR = Path(".cyntra/cache/firecrawl")
DEFAULT_TTL = 3600  # 1 hour in seconds


def _get_cache_dir() -> Path:
    """Get the cache directory, creating it if necessary."""
    cache_dir = CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def cache_key(endpoint: str, params: dict[str, Any]) -> str:
    """
    Generate a deterministic cache key from endpoint and parameters.

    Args:
        endpoint: The Firecrawl API endpoint (e.g., "scrape", "crawl")
        params: The request parameters

    Returns:
        A SHA256 hash string suitable for use as a filename
    """
    # Sort params for deterministic hashing
    sorted_params = json.dumps(params, sort_keys=True, separators=(",", ":"))
    key_data = f"{endpoint}:{sorted_params}"
    return hashlib.sha256(key_data.encode()).hexdigest()


def get_cached(key: str, ttl: int = DEFAULT_TTL) -> dict[str, Any] | None:
    """
    Retrieve a cached response if it exists and hasn't expired.

    Args:
        key: The cache key (from cache_key())
        ttl: Time-to-live in seconds. If 0 or negative, cache is disabled.

    Returns:
        The cached data dict, or None if not found/expired
    """
    if ttl <= 0:
        return None

    cache_file = _get_cache_dir() / f"{key}.json"

    if not cache_file.exists():
        return None

    try:
        data = json.loads(cache_file.read_text())
        cached_at = data.get("_cached_at", 0)

        # Check if cache has expired
        if time.time() - cached_at > ttl:
            # Expired, remove the file
            cache_file.unlink(missing_ok=True)
            return None

        # Return the cached response (without metadata)
        return data.get("response")

    except (json.JSONDecodeError, OSError):
        return None


def set_cached(key: str, data: dict[str, Any], ttl: int = DEFAULT_TTL) -> None:
    """
    Store a response in the cache.

    Args:
        key: The cache key (from cache_key())
        data: The response data to cache
        ttl: Time-to-live in seconds. If 0 or negative, caching is skipped.
    """
    if ttl <= 0:
        return

    cache_file = _get_cache_dir() / f"{key}.json"

    cache_data = {
        "_cached_at": time.time(),
        "_ttl": ttl,
        "response": data,
    }

    with suppress(OSError):
        cache_file.write_text(json.dumps(cache_data, indent=2))


def clear_cache() -> int:
    """
    Clear all cached responses.

    Returns:
        Number of cache entries removed
    """
    cache_dir = _get_cache_dir()
    count = 0

    for cache_file in cache_dir.glob("*.json"):
        try:
            cache_file.unlink()
            count += 1
        except OSError:
            pass

    return count


def clear_expired(ttl: int = DEFAULT_TTL) -> int:
    """
    Remove only expired cache entries.

    Args:
        ttl: Time-to-live in seconds to check against

    Returns:
        Number of expired entries removed
    """
    cache_dir = _get_cache_dir()
    count = 0
    current_time = time.time()

    for cache_file in cache_dir.glob("*.json"):
        try:
            data = json.loads(cache_file.read_text())
            cached_at = data.get("_cached_at", 0)
            entry_ttl = data.get("_ttl", ttl)

            if current_time - cached_at > entry_ttl:
                cache_file.unlink()
                count += 1
        except (json.JSONDecodeError, OSError):
            pass

    return count


def cache_stats() -> dict[str, Any]:
    """
    Get cache statistics.

    Returns:
        Dict with count, total_size, oldest, and newest timestamps
    """
    cache_dir = _get_cache_dir()

    count = 0
    total_size = 0
    oldest = float("inf")
    newest = 0

    for cache_file in cache_dir.glob("*.json"):
        try:
            count += 1
            total_size += cache_file.stat().st_size

            data = json.loads(cache_file.read_text())
            cached_at = data.get("_cached_at", 0)
            oldest = min(oldest, cached_at)
            newest = max(newest, cached_at)
        except (json.JSONDecodeError, OSError):
            pass

    return {
        "count": count,
        "total_size_bytes": total_size,
        "oldest_timestamp": oldest if count > 0 else None,
        "newest_timestamp": newest if count > 0 else None,
    }
