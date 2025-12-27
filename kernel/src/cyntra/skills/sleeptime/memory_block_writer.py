"""
Memory Block Writer - Update shared learned context blocks.

Manages persistent memory blocks that primary agents read for context injection.
Handles merging, deduplication, size limits, and version history.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

BLOCK_TEMPLATES = {
    "failure_modes": """# Failure Modes

Common failure patterns and mitigations learned from run history.

## Type Errors

## Test Failures

## Timeout Issues

## Gate Failures

---
*Last updated: {timestamp}*
""",
    "successful_patterns": """# Successful Patterns

Tool sequences and approaches with high success rates.

## Recommended Tool Chains

## Effective Repair Strategies

## Gate-Passing Patterns

---
*Last updated: {timestamp}*
""",
    "exploration_hints": """# Exploration Hints

Suggested areas to explore or avoid based on accumulated evidence.

## High-Value Areas

## Avoid These Approaches

## Under-Explored

---
*Last updated: {timestamp}*
""",
    "trap_signatures": """# Trap Signatures

Dynamics dead-ends and oscillation patterns to avoid.

## Confirmed Traps

## Near-Traps (Low Exit Probability)

## Oscillation Patterns

---
*Last updated: {timestamp}*
""",
    "genome_patches": """# Genome Patches

Recommended prompt improvements from pattern analysis.

## High-Confidence Patches

## Experimental Patches

## Deprecated Approaches

---
*Last updated: {timestamp}*
""",
}


@dataclass
class BlockEntry:
    """Single entry within a memory block."""

    content: str
    source_runs: list[str]
    frequency: int
    added_at: str
    confidence: float = 1.0


@dataclass
class WriteResult:
    """Result of a block write operation."""

    updated_block_path: str
    block_hash: str
    entries_added: int
    entries_pruned: int
    block_size_remaining: int


class MemoryBlockWriter:
    """Manage shared memory blocks for sleeptime consolidation."""

    def __init__(
        self,
        blocks_dir: Path | str = ".cyntra/learned_context",
        history_dir: Path | str = ".cyntra/learned_context/.history",
        max_block_size: int = 8000,
    ):
        self.blocks_dir = Path(blocks_dir)
        self.history_dir = Path(history_dir)
        self.max_block_size = max_block_size

    def ensure_dirs(self) -> None:
        """Create directories if needed."""
        self.blocks_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)

    def get_block_path(self, block_name: str) -> Path:
        """Get path to a memory block file."""
        return self.blocks_dir / f"{block_name}.md"

    def load_block(self, block_name: str) -> str:
        """Load existing block or create from template."""
        path = self.get_block_path(block_name)

        if path.exists():
            return path.read_text()

        # Initialize from template
        template = BLOCK_TEMPLATES.get(block_name, f"# {block_name}\n\n")
        timestamp = datetime.now(UTC).isoformat()
        return template.format(timestamp=timestamp)

    def save_block(self, block_name: str, content: str) -> str:
        """Save block and return hash."""
        self.ensure_dirs()
        path = self.get_block_path(block_name)

        # Archive current version
        if path.exists():
            timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
            archive_path = self.history_dir / f"{block_name}_{timestamp}.md"
            shutil.copy(path, archive_path)

            # Keep only last 10 versions
            versions = sorted(self.history_dir.glob(f"{block_name}_*.md"))
            for old in versions[:-10]:
                old.unlink()

        path.write_text(content)
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def find_section(self, content: str, section: str) -> tuple[int, int]:
        """Find start and end positions of a section."""
        lines = content.split("\n")
        start = -1
        end = len(lines)

        for i, line in enumerate(lines):
            if line.startswith("## ") and section.lower() in line.lower():
                start = i + 1
            elif start >= 0 and line.startswith("## ") or start >= 0 and line.startswith("---"):
                end = i
                break

        return start, end

    def format_entry(self, entry: dict) -> str:
        """Format a single entry for insertion."""
        lines = []

        if "signature" in entry:
            lines.append(f"- **{entry['signature']}**")
        elif "pattern" in entry:
            lines.append(f"- **{entry['pattern']}**")
        else:
            lines.append(f"- {entry.get('content', str(entry))}")

        if "frequency" in entry:
            lines.append(f"  - Frequency: {entry['frequency']}")
        if "confidence" in entry:
            lines.append(f"  - Confidence: {entry['confidence']:.0%}")
        if "mitigation" in entry:
            lines.append(f"  - Mitigation: {entry['mitigation']}")
        if "suggested_avoidance" in entry:
            lines.append(f"  - Avoid: {entry['suggested_avoidance']}")
        if "source_runs" in entry and entry["source_runs"]:
            runs = entry["source_runs"][:3]
            lines.append(f"  - From: {', '.join(runs)}")

        return "\n".join(lines)

    def dedupe_entries(self, existing: str, new_entries: list[dict]) -> list[dict]:
        """Filter out entries already present."""
        unique = []
        existing_lower = existing.lower()

        for entry in new_entries:
            sig = entry.get("signature", entry.get("pattern", str(entry)))
            if sig.lower() not in existing_lower:
                unique.append(entry)

        return unique

    def prune_to_fit(self, content: str, max_size: int) -> tuple[str, int]:
        """Remove old entries to fit size limit."""
        if len(content) <= max_size:
            return content, 0

        lines = content.split("\n")
        pruned = 0

        # Find list items and remove from end of sections
        i = len(lines) - 1
        while len("\n".join(lines)) > max_size and i > 0:
            if lines[i].startswith("- ") or lines[i].startswith("  -"):
                lines.pop(i)
                pruned += 1
            i -= 1

        return "\n".join(lines), pruned

    def write(
        self,
        block_name: str,
        new_content: dict,
        merge_strategy: Literal[
            "append", "replace", "dedupe_append", "priority_merge"
        ] = "dedupe_append",
    ) -> WriteResult:
        """
        Write entries to a memory block.

        Args:
            block_name: Which block to update
            new_content: {section: str, entries: list[dict], metadata: dict}
            merge_strategy: How to merge with existing

        Returns:
            WriteResult with path, hash, counts
        """
        content = self.load_block(block_name)
        section = new_content.get("section", "")
        entries = new_content.get("entries", [])

        if not entries:
            return WriteResult(
                updated_block_path=str(self.get_block_path(block_name)),
                block_hash=hashlib.sha256(content.encode()).hexdigest()[:16],
                entries_added=0,
                entries_pruned=0,
                block_size_remaining=self.max_block_size - len(content),
            )

        # Apply merge strategy
        if merge_strategy == "dedupe_append":
            entries = self.dedupe_entries(content, entries)
        elif merge_strategy == "replace":
            # Clear section first
            start, end = self.find_section(content, section)
            if start >= 0:
                lines = content.split("\n")
                lines = lines[:start] + [""] + lines[end:]
                content = "\n".join(lines)

        # Find insertion point
        start, end = self.find_section(content, section)
        if start < 0:
            # Section not found, append at end before footer
            insert_pos = content.rfind("---")
            if insert_pos < 0:
                insert_pos = len(content)
            new_section = f"\n## {section}\n\n"
            content = content[:insert_pos] + new_section + content[insert_pos:]
            start, end = self.find_section(content, section)

        # Format and insert entries
        formatted = [self.format_entry(e) for e in entries]
        new_text = "\n".join(formatted) + "\n"

        lines = content.split("\n")
        lines.insert(start, new_text)
        content = "\n".join(lines)

        # Update timestamp
        timestamp = datetime.now(UTC).isoformat()
        content = content.replace(
            content[content.rfind("*Last updated:") : content.rfind("*") + 1],
            f"*Last updated: {timestamp}*",
        )

        # Prune if needed
        content, pruned = self.prune_to_fit(content, self.max_block_size)

        # Save
        block_hash = self.save_block(block_name, content)

        return WriteResult(
            updated_block_path=str(self.get_block_path(block_name)),
            block_hash=block_hash,
            entries_added=len(entries),
            entries_pruned=pruned,
            block_size_remaining=self.max_block_size - len(content),
        )


if __name__ == "__main__":
    import sys

    writer = MemoryBlockWriter()

    # Example usage
    if len(sys.argv) > 1:
        data = json.loads(Path(sys.argv[1]).read_text())
        result = writer.write(
            block_name=data["block_name"],
            new_content=data["new_content"],
            merge_strategy=data.get("merge_strategy", "dedupe_append"),
        )
        print(json.dumps(asdict(result), indent=2))
    else:
        # Demo
        result = writer.write(
            block_name="failure_modes",
            new_content={
                "section": "Type Errors",
                "entries": [
                    {
                        "signature": "Cannot assign None to required field",
                        "frequency": 5,
                        "mitigation": "Check Optional[] annotations",
                        "source_runs": ["run_001", "run_003"],
                    }
                ],
            },
        )
        print(json.dumps(asdict(result), indent=2))
