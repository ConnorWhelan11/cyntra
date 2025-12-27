#!/usr/bin/env python3
"""
Web Research Meta-Skill

Orchestrates search → scrape → extract pipeline for comprehensive research.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Import sibling skills
import importlib.util

_SKILL_MODULE_CACHE: dict[str, Any] = {}


def _import_skill(name: str):
    """Import a sibling skill module from a local file."""
    module_name = name.replace("-", "_").replace(".py", "")
    cached = _SKILL_MODULE_CACHE.get(module_name)
    if cached is not None:
        return cached

    base_dir = Path(__file__).resolve().parent
    candidate = base_dir / f"{name}.py"
    if not candidate.exists():
        candidate = base_dir / f"{module_name}.py"
    if not candidate.exists():
        raise ImportError(f"Skill module not found for {name!r}")

    spec = importlib.util.spec_from_file_location(module_name, candidate)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to load spec for {candidate}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _SKILL_MODULE_CACHE[module_name] = module
    return module


DEPTH_CONFIG = {
    "shallow": {"search_limit": 5, "crawl_pages": 0},
    "medium": {"search_limit": 10, "crawl_pages": 3},
    "deep": {"search_limit": 20, "crawl_pages": 10},
}


def execute(
    topic: str,
    depth: str = "medium",
    output_format: str = "summary",
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """
    Perform comprehensive web research on a topic.

    Args:
        topic: Research topic or question
        depth: Research depth (shallow, medium, deep)
        output_format: Output format (summary, detailed, raw)
        cache_ttl: Cache TTL in seconds (0 to disable)

    Returns:
        {
            "success": bool,
            "findings": str,
            "sources": [...],
            "raw_data": {...} (if output_format == "raw")
        }
    """
    config = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["medium"])

    # Import skills dynamically to avoid import issues
    try:
        search_skill = _import_skill("firecrawl-search")
        crawl_skill = _import_skill("firecrawl-crawl")
    except ImportError as e:
        return {
            "success": False,
            "error": f"Failed to import skills: {e}",
        }

    sources: list[str] = []
    all_content: list[dict[str, Any]] = []

    # Step 1: Search for relevant content
    search_result = search_skill.execute(
        query=topic,
        limit=config["search_limit"],
        scrape_results=True,
        cache_ttl=cache_ttl,
    )

    if not search_result.get("success"):
        return {
            "success": False,
            "error": f"Search failed: {search_result.get('error')}",
        }

    for result in search_result.get("results", []):
        url = result.get("url")
        if url:
            sources.append(url)
            all_content.append(
                {
                    "url": url,
                    "title": result.get("title", ""),
                    "content": result.get("markdown", ""),
                }
            )

    # Step 2: Crawl top results for more depth (if configured)
    if config["crawl_pages"] > 0 and sources:
        # Crawl the first result's domain for more context
        first_url = sources[0]
        crawl_result = crawl_skill.execute(
            url=first_url,
            limit=config["crawl_pages"],
            cache_ttl=cache_ttl,
        )

        if crawl_result.get("success"):
            for page in crawl_result.get("pages", []):
                page_url = page.get("url")
                if page_url and page_url not in sources:
                    sources.append(page_url)
                    all_content.append(
                        {
                            "url": page_url,
                            "title": page.get("title", ""),
                            "content": page.get("markdown", ""),
                        }
                    )

    # Step 3: Format output
    if output_format == "raw":
        return {
            "success": True,
            "findings": "",
            "sources": sources,
            "raw_data": all_content,
        }

    # Build findings summary
    findings_parts = []
    findings_parts.append(f"# Research: {topic}\n")
    findings_parts.append(f"Found {len(sources)} relevant sources.\n")

    if output_format == "detailed":
        for item in all_content:
            findings_parts.append(f"\n## {item.get('title', 'Untitled')}")
            findings_parts.append(f"Source: {item.get('url', 'Unknown')}\n")
            content = item.get("content", "")
            # Truncate very long content
            if len(content) > 2000:
                content = content[:2000] + "..."
            findings_parts.append(content)
    else:  # summary
        findings_parts.append("\n## Key Sources\n")
        for item in all_content[:5]:  # Top 5 for summary
            findings_parts.append(f"- **{item.get('title', 'Untitled')}**")
            findings_parts.append(f"  {item.get('url', '')}")
            content = item.get("content", "")
            if content:
                # First 200 chars as preview
                preview = content[:200].replace("\n", " ")
                if len(content) > 200:
                    preview += "..."
                findings_parts.append(f"  > {preview}\n")

    return {
        "success": True,
        "findings": "\n".join(findings_parts),
        "sources": sources,
    }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Research a topic")
    parser.add_argument("topic", help="Research topic or question")
    parser.add_argument(
        "--depth",
        choices=["shallow", "medium", "deep"],
        default="medium",
        help="Research depth",
    )
    parser.add_argument(
        "--format",
        choices=["summary", "detailed", "raw"],
        default="summary",
        dest="output_format",
        help="Output format",
    )
    parser.add_argument(
        "--cache-ttl",
        type=int,
        default=3600,
        help="Cache TTL in seconds (0 to disable)",
    )

    args = parser.parse_args()

    result = execute(
        topic=args.topic,
        depth=args.depth,
        output_format=args.output_format,
        cache_ttl=args.cache_ttl,
    )

    if args.output_format == "raw":
        print(json.dumps(result, indent=2))
    else:
        if result.get("success"):
            print(result.get("findings", ""))
            print("\n---")
            print(f"Sources ({len(result.get('sources', []))}):")
            for src in result.get("sources", []):
                print(f"  - {src}")
        else:
            print(f"Error: {result.get('error')}", file=sys.stderr)

    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
