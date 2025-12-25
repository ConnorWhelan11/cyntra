"""
Failures Trinket - Surface relevant failure patterns to avoid.

Provides memories of what didn't work and why.
"""

from __future__ import annotations

from typing import List

from ..models import AgentMemory, MemoryType
from .base import AgentTrinket, RunContext


class FailuresTrinket(AgentTrinket):
    """
    Surface relevant failure patterns for the current task.

    Helps agents avoid repeating past mistakes.
    """

    priority = 75  # High priority - failures are important to avoid

    def __init__(
        self,
        store,  # MemoryStore
        vector_ops,  # VectorOps
        max_failures: int = 3,
        min_importance: float = 0.2,
    ):
        """
        Initialize failures trinket.

        Args:
            store: MemoryStore for retrieval
            vector_ops: VectorOps for embeddings
            max_failures: Maximum failures to include
            min_importance: Minimum importance score
        """
        self.store = store
        self.vector_ops = vector_ops
        self.max_failures = max_failures
        self.min_importance = min_importance

    def get_section_name(self) -> str:
        return "Known Failures to Avoid"

    async def generate_content(self, ctx: RunContext) -> str:
        """Generate content with relevant failures."""
        failures = await self._find_failures(ctx)

        if not failures:
            return ""

        lines = ["The following approaches have failed in similar contexts:\n"]
        for i, failure in enumerate(failures, 1):
            lines.append(f"{i}. **Avoid**: {failure.text}")

        return "\n".join(lines)

    async def _find_failures(self, ctx: RunContext) -> List[AgentMemory]:
        """Find relevant failures."""
        failures = []

        # Search by tags
        if ctx.issue_tags:
            tag_failures = await self.store.search_by_tags(
                tags=ctx.issue_tags,
                agent_id=ctx.agent_id,
                limit=self.max_failures,
            )
            failures.extend([f for f in tag_failures if f.memory_type == MemoryType.FAILURE])

        # Search by file paths
        if ctx.target_files:
            file_failures = await self.store.search_by_files(
                file_paths=ctx.target_files,
                agent_id=ctx.agent_id,
                limit=self.max_failures,
            )
            failures.extend([f for f in file_failures if f.memory_type == MemoryType.FAILURE])

        # Semantic search
        if ctx.issue_body and self.vector_ops:
            query_text = f"{ctx.issue_title or ''} {ctx.issue_body}"
            embedding = await self.vector_ops.generate_embedding(query_text)

            semantic_failures = await self.store.search_similar(
                embedding=embedding,
                agent_id=ctx.agent_id,
                limit=self.max_failures,
                min_importance=self.min_importance,
            )
            failures.extend([f for f in semantic_failures if f.memory_type == MemoryType.FAILURE])

        # Deduplicate and sort
        seen_ids = set()
        unique_failures = []
        for f in failures:
            if f.id not in seen_ids:
                seen_ids.add(f.id)
                unique_failures.append(f)

        unique_failures.sort(key=lambda f: f.importance_score, reverse=True)
        return unique_failures[:self.max_failures]

    async def should_include(self, ctx: RunContext) -> bool:
        """Include failures especially on retries."""
        # Always include if this is a retry
        if ctx.retry_count > 0:
            return True
        # Otherwise, only if we have relevant tags/files
        return bool(ctx.issue_tags or ctx.target_files)
