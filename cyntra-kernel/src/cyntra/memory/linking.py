"""
Memory Linking Service - Classify relationships between memories.

Adapted from Mira OS's linking.py for agent swarm context.
Uses LLM to identify causal, temporal, and semantic relationships.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from .models import (
    AgentMemory,
    MemoryLink,
    LinkType,
    LinkingBatch,
)

logger = logging.getLogger(__name__)

# Load prompts
PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_prompt(name: str) -> str:
    """Load prompt template from file."""
    path = PROMPTS_DIR / name
    if path.exists():
        return path.read_text()
    return ""


@dataclass
class LinkingConfig:
    """Configuration for relationship linking."""

    # Model settings
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 2048
    temperature: float = 0.2

    # Linking settings
    min_confidence: float = 0.7  # Only create links above this confidence
    max_candidates_per_memory: int = 10
    similarity_threshold: float = 0.6  # For candidate selection


class LinkingService:
    """
    Classify and create relationships between memories.

    Relationship types:
    - conflicts: Mutually exclusive information
    - supersedes: Explicitly updates older information
    - causes: Direct causal relationship
    - instance_of: Specific example of general pattern
    - invalidated_by: Empirical disproof
    - motivated_by: Explains reasoning
    - improves_on: Enhanced version (agent-specific)
    - requires: Dependency relationship (agent-specific)
    - repairs: Fix for failure mode (agent-specific)
    """

    def __init__(
        self,
        config: LinkingConfig = None,
        llm_client = None,
        store = None,  # MemoryStore
        vector_ops = None,  # VectorOps
    ):
        """
        Initialize linking service.

        Args:
            config: Linking configuration
            llm_client: LLM client for classification
            store: MemoryStore for database access
            vector_ops: VectorOps for similarity search
        """
        self.config = config or LinkingConfig()
        self.llm_client = llm_client
        self.store = store
        self.vector_ops = vector_ops

        # Load prompts
        self.system_prompt = _load_prompt("linking_system.txt")

    async def find_link_candidates(
        self,
        memory: AgentMemory,
        limit: int = None,
    ) -> List[AgentMemory]:
        """
        Find candidate memories for linking.

        Uses vector similarity to find semantically related memories.

        Args:
            memory: Source memory
            limit: Maximum candidates

        Returns:
            List of candidate memories
        """
        limit = limit or self.config.max_candidates_per_memory

        if not memory.embedding:
            return []

        candidates = await self.store.search_similar(
            embedding=memory.embedding,
            agent_id=memory.agent_id,
            limit=limit + 1,  # +1 to exclude self
            similarity_threshold=self.config.similarity_threshold,
            include_collective=True,
        )

        # Filter out self
        return [c for c in candidates if c.id != memory.id][:limit]

    async def classify_relationship(
        self,
        source: AgentMemory,
        target: AgentMemory,
    ) -> Optional[MemoryLink]:
        """
        Classify relationship between two memories.

        Args:
            source: Source memory
            target: Target memory

        Returns:
            MemoryLink if relationship exists, None otherwise
        """
        if not self.llm_client:
            raise RuntimeError("LLM client not configured")

        # Build classification prompt
        prompt = self._build_classification_prompt(source, target)

        try:
            response = await self._call_llm(prompt)
            result = self._parse_classification_response(response)

            if result is None:
                return None

            link_type, confidence, reasoning = result

            # Filter low confidence links
            if confidence < self.config.min_confidence:
                return None

            return MemoryLink(
                source_id=source.id,
                target_id=target.id,
                link_type=link_type,
                confidence=confidence,
                reasoning=reasoning,
                created_at=datetime.utcnow(),
            )

        except Exception as e:
            logger.error(f"Classification failed: {e}")
            return None

    async def classify_batch(
        self,
        pairs: List[Tuple[AgentMemory, AgentMemory]],
    ) -> List[MemoryLink]:
        """
        Classify multiple memory pairs.

        Args:
            pairs: List of (source, target) pairs

        Returns:
            List of created MemoryLinks
        """
        links = []

        for source, target in pairs:
            link = await self.classify_relationship(source, target)
            if link:
                links.append(link)

        return links

    async def create_bidirectional_link(
        self,
        link: MemoryLink,
    ) -> None:
        """
        Create bidirectional link between memories.

        Args:
            link: MemoryLink to create
        """
        await self.store.create_link(link)

    async def link_new_memory(
        self,
        memory: AgentMemory,
    ) -> List[MemoryLink]:
        """
        Find and create links for a newly created memory.

        Args:
            memory: New memory to link

        Returns:
            List of created links
        """
        # Find candidates
        candidates = await self.find_link_candidates(memory)

        if not candidates:
            return []

        # Classify each pair
        links = []
        for candidate in candidates:
            link = await self.classify_relationship(memory, candidate)
            if link:
                await self.create_bidirectional_link(link)
                links.append(link)

        logger.info(f"Created {len(links)} links for memory {memory.id}")
        return links

    async def traverse_related(
        self,
        memory_id: UUID,
        max_depth: int = 2,
        max_per_level: int = 5,
    ) -> List[AgentMemory]:
        """
        Traverse memory links to find related memories.

        Args:
            memory_id: Starting memory ID
            max_depth: Maximum traversal depth
            max_per_level: Maximum memories per level

        Returns:
            List of related memories (excluding start)
        """
        visited = {memory_id}
        result = []
        current_level = [memory_id]

        for depth in range(max_depth):
            next_level = []

            for mid in current_level:
                memory = await self.store.get(mid)
                if not memory:
                    continue

                # Collect linked IDs
                linked_ids = []
                for link in memory.outbound_links[:max_per_level]:
                    try:
                        linked_id = UUID(link.get("uuid", ""))
                        if linked_id not in visited:
                            linked_ids.append(linked_id)
                            visited.add(linked_id)
                    except (ValueError, TypeError):
                        continue

                for link in memory.inbound_links[:max_per_level]:
                    try:
                        linked_id = UUID(link.get("uuid", ""))
                        if linked_id not in visited:
                            linked_ids.append(linked_id)
                            visited.add(linked_id)
                    except (ValueError, TypeError):
                        continue

                # Fetch linked memories
                if linked_ids:
                    memories = await self.store.get_batch(linked_ids[:max_per_level])
                    result.extend(memories)
                    next_level.extend([m.id for m in memories])

            current_level = next_level
            if not current_level:
                break

        return result

    async def heal_dead_links(
        self,
        memory: AgentMemory,
    ) -> int:
        """
        Clean up dead links for a memory.

        Args:
            memory: Memory to check

        Returns:
            Number of dead links removed
        """
        dead_ids = []

        # Check outbound links
        for link in memory.outbound_links:
            try:
                linked_id = UUID(link.get("uuid", ""))
                linked = await self.store.get(linked_id)
                if linked is None or linked.is_archived:
                    dead_ids.append(linked_id)
            except (ValueError, TypeError):
                continue

        # Check inbound links
        for link in memory.inbound_links:
            try:
                linked_id = UUID(link.get("uuid", ""))
                linked = await self.store.get(linked_id)
                if linked is None or linked.is_archived:
                    dead_ids.append(linked_id)
            except (ValueError, TypeError):
                continue

        if dead_ids:
            await self.store.heal_dead_links(dead_ids)

        return len(dead_ids)

    def _build_classification_prompt(
        self,
        source: AgentMemory,
        target: AgentMemory,
    ) -> str:
        """Build classification prompt for two memories."""
        return f"""
Classify the relationship between these two agent memories.

## Memory A
Type: {source.memory_type.value}
Text: {source.text}

## Memory B
Type: {target.memory_type.value}
Text: {target.text}

## Relationship Types

Choose ONE relationship type if applicable:

1. **conflicts** - These memories describe contradictory or mutually exclusive information
2. **supersedes** - Memory A explicitly updates/replaces information in Memory B
3. **causes** - Memory A describes a cause that leads to the effect in Memory B
4. **instance_of** - Memory A is a specific example of the general pattern in Memory B
5. **invalidated_by** - Memory A provides evidence that disproves Memory B
6. **motivated_by** - Memory A was a decision/action driven by Memory B
7. **improves_on** - Memory A is an enhanced or better version of the approach in Memory B
8. **requires** - Memory A depends on or requires Memory B to be effective
9. **repairs** - Memory A is a fix for the failure described in Memory B
10. **none** - No meaningful relationship exists

## Output Format

Return JSON:
```json
{{
  "relationship": "relationship_type or none",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this relationship exists"
}}
```
"""

    async def _call_llm(self, prompt: str) -> str:
        """Call LLM for classification."""
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self.llm_client.messages.create(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
            messages=messages,
        )

        return response.content[0].text

    def _parse_classification_response(
        self,
        response: str,
    ) -> Optional[Tuple[LinkType, float, str]]:
        """Parse LLM classification response."""
        try:
            # Extract JSON
            start_idx = response.find("{")
            end_idx = response.rfind("}") + 1
            if start_idx < 0 or end_idx <= start_idx:
                return None

            data = json.loads(response[start_idx:end_idx])

            relationship = data.get("relationship", "none").lower()
            if relationship == "none":
                return None

            # Map to LinkType
            link_type_map = {
                "conflicts": LinkType.CONFLICTS,
                "supersedes": LinkType.SUPERSEDES,
                "causes": LinkType.CAUSES,
                "instance_of": LinkType.INSTANCE_OF,
                "invalidated_by": LinkType.INVALIDATED_BY,
                "motivated_by": LinkType.MOTIVATED_BY,
                "improves_on": LinkType.IMPROVES_ON,
                "requires": LinkType.REQUIRES,
                "repairs": LinkType.REPAIRS,
            }

            link_type = link_type_map.get(relationship)
            if not link_type:
                return None

            confidence = float(data.get("confidence", 0.5))
            reasoning = data.get("reasoning", "")

            return (link_type, confidence, reasoning)

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to parse classification: {e}")
            return None
