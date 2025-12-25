#!/usr/bin/env python3
"""
Memory Search Skill

Semantic and full-text search over memory store.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


def _search_fts(db_path: Path, query: str, limit: int) -> list[tuple[str, float]]:
    """Full-text search over observations."""
    if not db_path.exists():
        return []
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.execute("""
            SELECT o.id, o.content, bm25(observations_fts) as score
            FROM observations_fts
            JOIN observations o ON observations_fts.rowid = o.rowid
            WHERE observations_fts MATCH ?
            ORDER BY score
            LIMIT ?
        """, (query, limit))
        
        results = [(row[0], row[1], -row[2]) for row in cursor.fetchall()]
        conn.close()
        return results
    except Exception:
        return []


def _search_blocks(memory_path: Path, query: str, filters: dict[str, Any] | None, limit: int) -> list[dict[str, Any]]:
    """Search memory blocks by keyword matching."""
    blocks_dir = memory_path / "blocks"
    if not blocks_dir.exists():
        return []
    
    query_terms = query.lower().split()
    results = []
    
    for block_type_dir in blocks_dir.iterdir():
        if not block_type_dir.is_dir():
            continue
        
        # Filter by block type if specified
        if filters and "block_type" in filters:
            if block_type_dir.name != filters["block_type"]:
                continue
        
        for block_file in block_type_dir.glob("*.json"):
            try:
                block = json.loads(block_file.read_text())
                
                # Apply filters
                if filters:
                    if "domain" in filters and block.get("domain") not in (filters["domain"], "all"):
                        continue
                    if "tags" in filters:
                        block_tags = set(block.get("tags", []))
                        filter_tags = set(filters["tags"])
                        if not filter_tags.intersection(block_tags):
                            continue
                
                # Score by keyword match
                content_str = json.dumps(block.get("content", {})).lower()
                title = block.get("content", {}).get("title", "").lower()
                
                score = 0.0
                for term in query_terms:
                    if term in title:
                        score += 2.0
                    if term in content_str:
                        score += 1.0
                
                if score > 0:
                    results.append((block, score))
                    
            except (json.JSONDecodeError, OSError):
                continue
    
    # Sort by score and limit
    results.sort(key=lambda x: x[1], reverse=True)
    return [r[0] for r in results[:limit]]


def execute(
    query: str,
    memory_path: str | Path,
    search_type: str = "hybrid",
    filters: dict[str, Any] | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """
    Search memory store.

    Args:
        query: Search query (natural language)
        memory_path: Path to memory store directory
        search_type: semantic, fts, or hybrid
        filters: Filters (domain, block_type, tags)
        limit: Maximum results

    Returns:
        {
            "results": [...],
            "scores": [...]
        }
    """
    memory_path = Path(memory_path)
    
    if not memory_path.exists():
        return {
            "success": True,
            "results": [],
            "scores": [],
        }
    
    try:
        results = []
        scores = []
        
        # Search blocks
        block_results = _search_blocks(memory_path, query, filters, limit)
        for block in block_results:
            results.append({
                "type": "block",
                "block_id": block.get("block_id"),
                "block_type": block.get("block_type"),
                "content": block.get("content"),
                "domain": block.get("domain"),
            })
            scores.append(1.0)  # Placeholder score
        
        # FTS search on observations if hybrid or fts
        if search_type in ("fts", "hybrid"):
            db_path = memory_path / "observations.db"
            fts_results = _search_fts(db_path, query, limit)
            
            for obs_id, content, score in fts_results:
                try:
                    content_parsed = json.loads(content)
                except json.JSONDecodeError:
                    content_parsed = {"raw": content}
                
                results.append({
                    "type": "observation",
                    "observation_id": obs_id,
                    "content": content_parsed,
                })
                scores.append(score)
        
        return {
            "success": True,
            "results": results[:limit],
            "scores": scores[:limit],
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Search failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Search memory store")
    parser.add_argument("query", help="Search query")
    parser.add_argument("memory_path", help="Path to memory store")
    parser.add_argument("--type", default="hybrid", choices=["semantic", "fts", "hybrid"])
    parser.add_argument("--domain", help="Domain filter")
    parser.add_argument("--limit", type=int, default=10, help="Max results")
    
    args = parser.parse_args()
    
    filters = {}
    if args.domain:
        filters["domain"] = args.domain
    
    result = execute(
        query=args.query,
        memory_path=args.memory_path,
        search_type=args.type,
        filters=filters if filters else None,
        limit=args.limit,
    )
    
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
