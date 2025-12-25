"""
Memory Extraction Engine - Extract memories from agent run transcripts.

Adapted from Mira OS's extraction pipeline for agent swarm context.
Uses LLM to extract patterns, failures, dynamics, and context from runs.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from .events import RunCompletedEvent
from .models import (
    ExtractedMemory,
    ExtractionResult,
    MemoryType,
    ExtractionBatch,
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
class ExtractionConfig:
    """Configuration for memory extraction."""

    # Model settings
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 4096
    temperature: float = 0.3

    # Extraction settings
    max_memories_per_run: int = 10
    min_confidence: float = 0.6
    extract_patterns: bool = True
    extract_failures: bool = True
    extract_dynamics: bool = True
    extract_context: bool = True

    # Deduplication threshold
    dedup_similarity_threshold: float = 0.85


class MemoryExtractor:
    """
    Extract memories from agent run transcripts.

    Uses LLM to identify:
    - Patterns: What worked and why
    - Failures: What failed and root causes
    - Dynamics: Behavioral observations
    - Context: Codebase understanding
    """

    def __init__(
        self,
        config: ExtractionConfig = None,
        llm_client = None,
        vector_ops = None,
    ):
        """
        Initialize extractor.

        Args:
            config: Extraction configuration
            llm_client: LLM client for extraction calls
            vector_ops: VectorOps for deduplication
        """
        self.config = config or ExtractionConfig()
        self.llm_client = llm_client
        self.vector_ops = vector_ops

        # Load prompts
        self.system_prompt = _load_prompt("extraction_system.txt")
        self.user_prompt_template = _load_prompt("extraction_user.txt")

    async def extract_from_run(
        self,
        event: RunCompletedEvent,
    ) -> ExtractionResult:
        """
        Extract memories from a completed run.

        Args:
            event: RunCompletedEvent with transcript and metadata

        Returns:
            ExtractionResult with extracted memories and linking hints
        """
        logger.info(f"Extracting memories from run {event.run_id}")

        # Build extraction prompt
        user_prompt = self._build_extraction_prompt(event)

        # Call LLM for extraction
        try:
            response = await self._call_llm(user_prompt)
            memories = self._parse_extraction_response(response, event)
        except Exception as e:
            logger.error(f"Extraction failed for run {event.run_id}: {e}")
            return ExtractionResult(memories=[], linking_pairs=[])

        # Deduplicate within batch
        if self.vector_ops and len(memories) > 1:
            memories = await self._deduplicate_batch(memories)

        # Generate linking pairs for similar memories
        linking_pairs = self._generate_linking_pairs(memories)

        logger.info(f"Extracted {len(memories)} memories from run {event.run_id}")
        return ExtractionResult(memories=memories, linking_pairs=linking_pairs)

    def _build_extraction_prompt(self, event: RunCompletedEvent) -> str:
        """Build user prompt for extraction."""
        # Fallback if template not loaded
        if not self.user_prompt_template:
            return self._build_default_prompt(event)

        return self.user_prompt_template.format(
            run_id=event.run_id,
            agent_id=event.agent_id,
            status=event.status,
            patch_applied=event.patch_applied,
            gates_passed=event.gates_passed,
            issue_tags=", ".join(event.issue_tags) if event.issue_tags else "none",
            file_changes="\n".join(event.file_changes) if event.file_changes else "none",
            transcript=event.transcript[:50000],  # Truncate if needed
        )

    def _build_default_prompt(self, event: RunCompletedEvent) -> str:
        """Build default extraction prompt."""
        return f"""
Analyze this agent run and extract discrete memories.

Run ID: {event.run_id}
Agent: {event.agent_id}
Status: {event.status}
Patch Applied: {event.patch_applied}
Gates Passed: {event.gates_passed}
Issue Tags: {", ".join(event.issue_tags) if event.issue_tags else "none"}
Files Changed: {", ".join(event.file_changes[:10]) if event.file_changes else "none"}

Transcript:
{event.transcript[:50000]}

Extract the following types of memories:

1. PATTERNS (type: pattern): Successful approaches that worked
   - What specific approach worked?
   - Why did it work in this context?
   - When should this pattern be applied?

2. FAILURES (type: failure): Failed approaches with analysis
   - What specific approach failed?
   - What was the root cause?
   - How should it be fixed?

3. DYNAMICS (type: dynamic): Behavioral observations
   - What behavioral patterns were observed?
   - Under what conditions do they occur?
   - What is the confidence level?

4. CONTEXT (type: context): Codebase understanding
   - What files/modules were understood?
   - What is their purpose?
   - How do they relate to other code?

Return a JSON array of memories:
```json
[
  {{
    "type": "pattern|failure|dynamic|context",
    "text": "The memory content",
    "importance": 0.1-1.0,
    "confidence": 0.1-1.0,
    "issue_tags": ["tag1", "tag2"],
    "file_paths": ["path/to/file.py"],
    "linking_hints": [1, 2]  // Indices of related memories in this batch
  }}
]
```
"""

    async def _call_llm(self, user_prompt: str) -> str:
        """Call LLM for extraction."""
        if not self.llm_client:
            raise RuntimeError("LLM client not configured")

        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        response = await self.llm_client.messages.create(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
            messages=messages,
        )

        return response.content[0].text

    def _parse_extraction_response(
        self,
        response: str,
        event: RunCompletedEvent,
    ) -> List[ExtractedMemory]:
        """Parse LLM response into ExtractedMemory objects."""
        memories = []

        # Extract JSON from response
        try:
            # Try to find JSON array in response
            start_idx = response.find("[")
            end_idx = response.rfind("]") + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_str = response[start_idx:end_idx]
                raw_memories = json.loads(json_str)
            else:
                logger.warning("No JSON array found in extraction response")
                return memories
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse extraction response: {e}")
            return memories

        # Convert to ExtractedMemory objects
        for i, raw in enumerate(raw_memories[:self.config.max_memories_per_run]):
            try:
                memory_type = self._parse_memory_type(raw.get("type", "pattern"))
                importance = float(raw.get("importance", 0.5))
                confidence = float(raw.get("confidence", 0.8))

                # Filter low confidence extractions
                if confidence < self.config.min_confidence:
                    continue

                memory = ExtractedMemory(
                    text=raw.get("text", ""),
                    memory_type=memory_type,
                    importance_score=min(max(importance, 0.0), 1.0),
                    confidence=min(max(confidence, 0.0), 1.0),
                    issue_tags=raw.get("issue_tags", event.issue_tags),
                    file_paths=raw.get("file_paths", event.file_changes[:5]),
                    linking_hints=raw.get("linking_hints", []),
                )
                memories.append(memory)
            except Exception as e:
                logger.warning(f"Failed to parse memory {i}: {e}")
                continue

        return memories

    def _parse_memory_type(self, type_str: str) -> MemoryType:
        """Parse memory type string to enum."""
        type_map = {
            "pattern": MemoryType.PATTERN,
            "failure": MemoryType.FAILURE,
            "dynamic": MemoryType.DYNAMIC,
            "context": MemoryType.CONTEXT,
            "playbook": MemoryType.PLAYBOOK,
            "frontier": MemoryType.FRONTIER,
        }
        return type_map.get(type_str.lower(), MemoryType.PATTERN)

    async def _deduplicate_batch(
        self,
        memories: List[ExtractedMemory],
    ) -> List[ExtractedMemory]:
        """
        Remove duplicate memories within batch using semantic similarity.

        Args:
            memories: List of extracted memories

        Returns:
            Deduplicated list
        """
        if not self.vector_ops or len(memories) <= 1:
            return memories

        # Generate embeddings
        texts = [m.text for m in memories]
        embeddings = await self.vector_ops.batch_embeddings(texts)

        # Find duplicates using similarity threshold
        keep_indices = set(range(len(memories)))
        threshold = self.config.dedup_similarity_threshold

        for i in range(len(memories)):
            if i not in keep_indices:
                continue
            for j in range(i + 1, len(memories)):
                if j not in keep_indices:
                    continue
                similarity = self.vector_ops.cosine_similarity(
                    embeddings[i], embeddings[j]
                )
                if similarity >= threshold:
                    # Keep the one with higher importance
                    if memories[i].importance_score >= memories[j].importance_score:
                        keep_indices.discard(j)
                    else:
                        keep_indices.discard(i)
                        break

        return [memories[i] for i in sorted(keep_indices)]

    def _generate_linking_pairs(
        self,
        memories: List[ExtractedMemory],
    ) -> List[Tuple[int, int]]:
        """
        Generate pairs of memories to evaluate for relationships.

        Uses linking_hints from extraction plus type-based heuristics.

        Args:
            memories: List of extracted memories

        Returns:
            List of (index1, index2) pairs for relationship classification
        """
        pairs = set()

        # Add pairs from linking hints
        for i, memory in enumerate(memories):
            for hint_idx in memory.linking_hints:
                if 0 <= hint_idx < len(memories) and hint_idx != i:
                    pair = (min(i, hint_idx), max(i, hint_idx))
                    pairs.add(pair)

        # Add heuristic pairs: patterns with failures
        for i, mem_i in enumerate(memories):
            for j, mem_j in enumerate(memories):
                if i >= j:
                    continue
                # Pattern + Failure likely related
                types = {mem_i.memory_type, mem_j.memory_type}
                if {MemoryType.PATTERN, MemoryType.FAILURE} == types:
                    pairs.add((i, j))

        return list(pairs)

    async def persist_extracted(
        self,
        memories: List[ExtractedMemory],
        agent_id: str,
        run_id: str,
        store,  # MemoryStore
        world_id: Optional[str] = None,
    ) -> List[UUID]:
        """
        Persist extracted memories to database.

        Args:
            memories: Extracted memories to persist
            agent_id: Agent identifier
            run_id: Run identifier
            store: MemoryStore instance
            world_id: Optional Fab World identifier

        Returns:
            List of created memory UUIDs
        """
        if not memories:
            return []

        # Generate embeddings
        embeddings = None
        if self.vector_ops:
            texts = [m.text for m in memories]
            embeddings = await self.vector_ops.batch_embeddings(texts)

        # Persist to store
        return await store.create_batch(
            memories=memories,
            agent_id=agent_id,
            embeddings=embeddings,
            run_id=run_id,
            world_id=world_id,
        )


class ExtractionBatchService:
    """
    Batch processing service for async memory extraction.

    Handles submission to LLM batch APIs and result processing.
    """

    def __init__(
        self,
        store,  # MemoryStore
        extractor: MemoryExtractor,
    ):
        """
        Initialize batch service.

        Args:
            store: MemoryStore for batch tracking
            extractor: MemoryExtractor for processing
        """
        self.store = store
        self.extractor = extractor

    async def submit_batch(
        self,
        runs: List[RunCompletedEvent],
    ) -> str:
        """
        Submit multiple runs for batch extraction.

        Args:
            runs: List of completed run events

        Returns:
            Batch ID for status polling
        """
        batch_id = str(uuid4())

        for i, run in enumerate(runs):
            batch = ExtractionBatch(
                batch_id=batch_id,
                custom_id=f"{batch_id}_{i}",
                agent_id=run.agent_id,
                run_id=run.run_id,
                request_payload={"transcript": run.transcript[:10000]},
                run_metadata={
                    "status": run.status,
                    "patch_applied": run.patch_applied,
                    "gates_passed": run.gates_passed,
                    "issue_tags": run.issue_tags,
                },
                status="submitted",
                created_at=datetime.utcnow(),
                submitted_at=datetime.utcnow(),
            )
            await self.store.create_extraction_batch(batch)

        logger.info(f"Submitted extraction batch {batch_id} with {len(runs)} runs")
        return batch_id

    async def poll_batch(self, batch_id: str) -> Dict[str, Any]:
        """
        Poll batch status.

        Args:
            batch_id: Batch ID to check

        Returns:
            Status dict with counts
        """
        batches = await self.store.get_pending_extraction_batches()
        batch_items = [b for b in batches if b.batch_id == batch_id]

        total = len(batch_items)
        completed = sum(1 for b in batch_items if b.status == "completed")
        failed = sum(1 for b in batch_items if b.status == "failed")
        processing = sum(1 for b in batch_items if b.status in ("submitted", "processing"))

        return {
            "batch_id": batch_id,
            "total": total,
            "completed": completed,
            "failed": failed,
            "processing": processing,
            "status": "completed" if processing == 0 else "processing",
        }

    async def process_results(
        self,
        batch_id: str,
    ) -> List[ExtractedMemory]:
        """
        Process completed batch results.

        Args:
            batch_id: Batch ID to process

        Returns:
            List of all extracted memories from batch
        """
        batches = await self.store.get_pending_extraction_batches()
        batch_items = [b for b in batches if b.batch_id == batch_id and b.status == "completed"]

        all_memories = []
        for batch in batch_items:
            if batch.extracted_memories:
                for raw in batch.extracted_memories:
                    try:
                        memory = ExtractedMemory(**raw)
                        all_memories.append(memory)
                    except Exception as e:
                        logger.warning(f"Failed to parse batch memory: {e}")

        return all_memories
