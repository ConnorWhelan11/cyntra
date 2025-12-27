"""
Context Injector - Prepare learned context for agent consumption.

Transforms raw memory blocks into optimized prompt injections:
- Selects relevant blocks based on task type
- Compresses content to fit token budgets
- Formats for different adapter conventions
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass
class InjectionConfig:
    """Configuration for context injection."""

    max_tokens: int = 500
    include_blocks: list[str] | None = None
    format: Literal["markdown", "xml", "plain"] = "markdown"
    include_metadata: bool = False


class ContextInjector:
    """Prepare learned context for prompt injection."""

    def __init__(self, learned_context_dir: Path):
        self.context_dir = Path(learned_context_dir)

    def load_block(self, name: str) -> str | None:
        """Load a single memory block."""
        path = self.context_dir / f"{name}.md"
        if path.exists():
            return path.read_text()
        return None

    def extract_entries(self, block_content: str) -> list[dict]:
        """Extract structured entries from a markdown block."""
        entries = []
        current_entry: dict = {}

        for line in block_content.split("\n"):
            # New entry starts with "- **"
            if line.startswith("- **"):
                if current_entry:
                    entries.append(current_entry)
                # Extract signature
                match = re.match(r"- \*\*(.+?)\*\*", line)
                current_entry = {
                    "signature": match.group(1) if match else line[4:],
                    "details": [],
                }
            elif line.strip().startswith("- ") and current_entry:
                # Detail line
                detail = line.strip()[2:]
                if ": " in detail:
                    key, value = detail.split(": ", 1)
                    current_entry[key.lower()] = value
                else:
                    current_entry["details"].append(detail)

        if current_entry:
            entries.append(current_entry)

        return entries

    def select_for_task(
        self,
        task_type: str | None = None,
        task_tags: list[str] | None = None,
    ) -> list[str]:
        """Select which blocks are relevant for a task."""
        blocks = ["failure_modes", "successful_patterns"]

        if task_tags:
            if "high-risk" in task_tags or "critical" in task_tags:
                blocks.append("trap_signatures")
            if "exploration" in task_tags:
                blocks.append("exploration_hints")

        if task_type == "repair":
            blocks = ["failure_modes", "trap_signatures", "successful_patterns"]
        elif task_type == "new_feature":
            blocks = ["successful_patterns", "exploration_hints"]

        return blocks

    def format_for_injection(
        self,
        entries: list[dict],
        config: InjectionConfig,
    ) -> str:
        """Format entries for prompt injection."""
        if config.format == "xml":
            return self._format_xml(entries, config)
        elif config.format == "plain":
            return self._format_plain(entries, config)
        else:
            return self._format_markdown(entries, config)

    def _format_markdown(self, entries: list[dict], config: InjectionConfig) -> str:
        """Format as markdown."""
        lines = []
        for entry in entries:
            sig = entry.get("signature", "")
            lines.append(f"- **{sig}**")

            if "mitigation" in entry:
                lines.append(f"  - {entry['mitigation']}")
            elif "avoidance" in entry:
                lines.append(f"  - Avoid: {entry['avoidance']}")

            if config.include_metadata and "frequency" in entry:
                lines.append(f"  - (seen {entry['frequency']} times)")

        return "\n".join(lines)

    def _format_xml(self, entries: list[dict], config: InjectionConfig) -> str:
        """Format as XML tags."""
        lines = ["<learned_context>"]
        for entry in entries:
            sig = entry.get("signature", "")
            lines.append(f"  <pattern>{sig}</pattern>")
            if "mitigation" in entry:
                lines.append(f"  <mitigation>{entry['mitigation']}</mitigation>")
        lines.append("</learned_context>")
        return "\n".join(lines)

    def _format_plain(self, entries: list[dict], config: InjectionConfig) -> str:
        """Format as plain text."""
        lines = []
        for entry in entries:
            sig = entry.get("signature", "")
            if "mitigation" in entry:
                lines.append(f"{sig}: {entry['mitigation']}")
            elif "avoidance" in entry:
                lines.append(f"AVOID: {sig} - {entry['avoidance']}")
            else:
                lines.append(sig)
        return "\n".join(lines)

    def inject(
        self,
        base_prompt: str,
        config: InjectionConfig | None = None,
        task_type: str | None = None,
        task_tags: list[str] | None = None,
    ) -> str:
        """
        Inject learned context into a prompt.

        Returns the augmented prompt.
        """
        if config is None:
            config = InjectionConfig()

        # Select blocks
        block_names = config.include_blocks or self.select_for_task(task_type, task_tags)

        # Collect entries
        all_entries: list[dict] = []
        for name in block_names:
            content = self.load_block(name)
            if content:
                entries = self.extract_entries(content)
                all_entries.extend(entries)

        if not all_entries:
            return base_prompt

        # Limit to most relevant (by frequency if available)
        all_entries.sort(
            key=lambda e: int(e.get("frequency", 0)),
            reverse=True,
        )
        all_entries = all_entries[:15]  # Top 15 entries

        # Format
        formatted = self.format_for_injection(all_entries, config)

        # Estimate tokens and truncate if needed
        # Rough estimate: 1 token ≈ 4 chars
        max_chars = config.max_tokens * 4
        if len(formatted) > max_chars:
            formatted = formatted[:max_chars] + "\n..."

        # Inject into prompt
        injection = f"\n\n## Learned Patterns (from prior runs)\n\n{formatted}\n"

        return base_prompt + injection


def create_injector(repo_root: Path) -> ContextInjector:
    """Create a context injector for a repository."""
    context_dir = repo_root / ".cyntra" / "learned_context"
    return ContextInjector(context_dir)
