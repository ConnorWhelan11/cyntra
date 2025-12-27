#!/usr/bin/env python3
"""
Context Injector Skill

Prepare memory context for injection into new workcell prompts.
Uses progressive disclosure to limit token usage.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def _estimate_tokens(text: str) -> int:
    """Rough token estimation (4 chars per token average)."""
    return len(text) // 4


def _load_memory_blocks(memory_path: Path, domain: str | None = None) -> list[dict[str, Any]]:
    """Load memory blocks from storage."""
    blocks = []
    blocks_dir = memory_path / "blocks"

    if not blocks_dir.exists():
        return blocks

    # Load from all block type directories
    for block_type_dir in blocks_dir.iterdir():
        if not block_type_dir.is_dir():
            continue

        for block_file in block_type_dir.glob("*.json"):
            try:
                block = json.loads(block_file.read_text())

                # Filter by domain if specified
                if domain and block.get("domain") != domain and block.get("domain") != "all":
                    continue

                blocks.append(block)
            except (json.JSONDecodeError, OSError):
                continue

    return blocks


def _score_block_relevance(block: dict[str, Any], issue: dict[str, Any]) -> float:
    """Score block relevance to issue."""
    score = 0.0

    # Base score from confidence
    score += block.get("content", {}).get("success_rate", 0.5) * 0.3

    # Usage score (more used = more valuable)
    usage = block.get("usage", {})
    use_count = usage.get("injection_count", 0)
    effectiveness = usage.get("effectiveness", 0.5)
    score += min(use_count / 10, 1.0) * 0.2
    score += effectiveness * 0.2

    # Tag matching
    issue_tags = set(issue.get("tags", []))
    block_tags = set(block.get("tags", []))
    if issue_tags and block_tags:
        overlap = len(issue_tags & block_tags) / len(issue_tags | block_tags)
        score += overlap * 0.3

    # Block type priority
    block_type = block.get("block_type", "")
    type_weights = {
        "pattern": 1.0,
        "repair": 0.9,
        "trap": 0.85,
        "anti_pattern": 0.8,
        "domain": 0.7,
    }
    score *= type_weights.get(block_type, 0.5)

    return score


def _format_block_for_injection(block: dict[str, Any], layer: int = 1) -> str:
    """Format block for context injection."""
    content = block.get("content", {})
    block_type = block.get("block_type", "unknown")

    if layer == 1:
        # Index layer - just title and type
        title = content.get("title", "Untitled")
        return f"[{block_type.upper()}] {title}"

    elif layer == 2:
        # Summary layer - include content
        title = content.get("title", "Untitled")
        summary = content.get("summary", "")

        lines = [f"### {title}"]
        if summary:
            lines.append(summary)

        if "tool_sequence" in content:
            lines.append(f"Tools: {' → '.join(content['tool_sequence'])}")

        if "success_rate" in content:
            lines.append(f"Success rate: {content['success_rate']:.0%}")

        return "\n".join(lines)

    return json.dumps(content)


def execute(
    issue: dict[str, Any],
    memory_path: str | Path,
    max_tokens: int = 2000,
    domain: str | None = None,
) -> dict[str, Any]:
    """
    Prepare memory context for workcell prompt.

    Args:
        issue: Issue/task being executed
        memory_path: Path to memory store directory
        max_tokens: Maximum tokens for context
        domain: Domain filter

    Returns:
        {
            "context": {...},
            "blocks_used": [...],
            "token_count": int
        }
    """
    memory_path = Path(memory_path)

    if not memory_path.exists():
        return {
            "success": True,
            "context": {"patterns": [], "warnings": [], "tips": []},
            "blocks_used": [],
            "token_count": 0,
        }

    try:
        # Load and score blocks
        blocks = _load_memory_blocks(memory_path, domain)

        scored_blocks = []
        for block in blocks:
            score = _score_block_relevance(block, issue)
            scored_blocks.append((score, block))

        # Sort by relevance
        scored_blocks.sort(key=lambda x: x[0], reverse=True)

        # Build context within token budget
        context = {
            "patterns": [],
            "warnings": [],
            "tips": [],
        }
        blocks_used = []
        total_tokens = 0

        # Reserve tokens for structure
        reserved_tokens = 100
        available_tokens = max_tokens - reserved_tokens

        for score, block in scored_blocks:
            if score < 0.3:  # Relevance threshold
                continue

            # Format block
            formatted = _format_block_for_injection(block, layer=2)
            block_tokens = _estimate_tokens(formatted)

            if total_tokens + block_tokens > available_tokens:
                # Try layer 1 (shorter)
                formatted = _format_block_for_injection(block, layer=1)
                block_tokens = _estimate_tokens(formatted)

                if total_tokens + block_tokens > available_tokens:
                    continue

            # Add to appropriate category
            block_type = block.get("block_type", "")
            block_id = block.get("block_id", "unknown")

            entry = {
                "id": block_id,
                "content": formatted,
                "relevance": score,
            }

            if block_type in ("trap", "anti_pattern"):
                context["warnings"].append(entry)
            elif block_type == "pattern":
                context["patterns"].append(entry)
            else:
                context["tips"].append(entry)

            blocks_used.append(block_id)
            total_tokens += block_tokens

        return {
            "success": True,
            "context": context,
            "blocks_used": blocks_used,
            "token_count": total_tokens,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to prepare context: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Prepare memory context for injection")
    parser.add_argument("issue_json", help="Issue as JSON string or file path")
    parser.add_argument("memory_path", help="Path to memory store")
    parser.add_argument("--max-tokens", type=int, default=2000, help="Token limit")
    parser.add_argument("--domain", help="Domain filter")

    args = parser.parse_args()

    # Parse issue
    try:
        issue = json.loads(args.issue_json)
    except json.JSONDecodeError:
        issue_path = Path(args.issue_json)
        if issue_path.exists():
            issue = json.loads(issue_path.read_text())
        else:
            print("Error: Invalid JSON and file not found", file=sys.stderr)
            sys.exit(1)

    result = execute(
        issue=issue,
        memory_path=args.memory_path,
        max_tokens=args.max_tokens,
        domain=args.domain,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
