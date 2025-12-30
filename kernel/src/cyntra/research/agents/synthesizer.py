"""
Synthesizer Agent - Draft memories from evidence.

The Synthesizer agent is the third step in the research pipeline:
1. Read all normalized evidence
2. Identify key claims, facts, patterns
3. Group related claims into memory units
4. For each memory: write summary, details, citations
5. Format as Markdown with YAML frontmatter
6. Return draft memories
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cyntra.research.agents.base import AgentContext, AgentResult, BaseResearchAgent
from cyntra.research.agents.collector import CollectedEvidence, CollectorOutput
from cyntra.research.models import (
    Citation,
    CitationKind,
    DraftMemory,
    OutputConfig,
)


@dataclass
class SynthesisDecision:
    """Record of a synthesis decision."""

    topic: str
    evidence_ids: list[str]
    confidence: float
    reasoning: str


@dataclass
class SynthesizerInput:
    """Input for the Synthesizer agent."""

    evidence: list[CollectedEvidence] = field(default_factory=list)
    output_config: OutputConfig = field(default_factory=OutputConfig)
    existing_memory_titles: list[str] = field(default_factory=list)
    existing_memory_ids: list[str] = field(default_factory=list)
    required_tags: list[str] = field(default_factory=list)


@dataclass
class SynthesizerOutput:
    """Output from the Synthesizer agent."""

    draft_memories: list[DraftMemory] = field(default_factory=list)
    synthesis_log: list[SynthesisDecision] = field(default_factory=list)
    total_drafted: int = 0
    total_skipped: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "draft_memories": [
                {
                    "memory_id": m.memory_id,
                    "title": m.title,
                    "scope": m.scope,
                    "confidence": m.confidence,
                    "citation_count": len(m.citations),
                }
                for m in self.draft_memories
            ],
            "synthesis_log": [
                {
                    "topic": d.topic,
                    "evidence_ids": d.evidence_ids,
                    "confidence": d.confidence,
                    "reasoning": d.reasoning,
                }
                for d in self.synthesis_log
            ],
            "total_drafted": self.total_drafted,
            "total_skipped": self.total_skipped,
        }


class SynthesizerAgent(BaseResearchAgent[SynthesizerInput, SynthesizerOutput]):
    """
    Synthesizer agent for drafting memories from evidence.

    Uses LLM to analyze evidence and create structured memories.
    """

    name = "synthesizer"

    def __init__(self, context: AgentContext, llm_client: Any | None = None):
        super().__init__(context)
        self._llm = llm_client

    async def execute(self, input_data: SynthesizerInput) -> AgentResult[SynthesizerOutput]:
        """Execute the synthesizer agent to draft memories."""
        result = AgentResult[SynthesizerOutput](success=False, started_at=datetime.now(UTC))
        output = SynthesizerOutput()

        try:
            # Create draft memories directory
            drafts_dir = self.context.run_dir / "draft_memories"
            drafts_dir.mkdir(parents=True, exist_ok=True)

            # Build context from evidence
            evidence_context = self._build_evidence_context(input_data.evidence)

            # Use LLM to synthesize memories
            if self._llm:
                memories = await self._synthesize_with_llm(input_data, evidence_context)
            else:
                # Fallback: Create simple memories from evidence (for testing)
                memories = self._synthesize_simple(input_data)

            # Write each memory to file
            for memory in memories:
                memory_path = drafts_dir / f"{memory.memory_id}.md"
                with open(memory_path, "w", encoding="utf-8") as f:
                    f.write(memory.to_markdown())

                output.draft_memories.append(memory)
                output.total_drafted += 1

                # Log the decision
                output.synthesis_log.append(
                    SynthesisDecision(
                        topic=memory.title,
                        evidence_ids=[c.url or c.repo_path or "" for c in memory.citations],
                        confidence=memory.confidence,
                        reasoning=f"Synthesized from {len(memory.citations)} sources",
                    )
                )

            # Write synthesis log
            await self._write_synthesis_log(output, drafts_dir.parent)

            self.logger.info(f"Synthesizer complete: {output.total_drafted} memories drafted")

            result.success = True
            result.output = output
            result.completed_at = datetime.now(UTC)

        except Exception as e:
            self.logger.error(f"Synthesizer failed: {e}")
            result.success = False
            result.error = str(e)
            result.completed_at = datetime.now(UTC)

        return result

    def _build_evidence_context(self, evidence: list[CollectedEvidence]) -> str:
        """Build a context string from evidence for LLM consumption."""
        parts = []

        for e in evidence:
            parts.append(f"### Source: {e.metadata.title or 'Untitled'}")
            parts.append(f"URL: {e.source.url}")
            parts.append(f"Type: {e.source.source_type}")
            parts.append("")
            parts.append(e.normalized_content[:5000])  # Limit content length
            parts.append("")
            parts.append("---")
            parts.append("")

        return "\n".join(parts)

    async def _synthesize_with_llm(
        self,
        input_data: SynthesizerInput,
        evidence_context: str,
    ) -> list[DraftMemory]:
        """Use LLM to synthesize memories from evidence."""
        # Load prompt template
        prompt_template = self.context.get_prompt("synthesizer")

        if not prompt_template:
            # Use default prompt
            prompt_template = self._default_prompt()

        # Fill in template variables
        prompt = prompt_template.replace("{{description}}", self.context.program.description)
        prompt = prompt.replace("{{scope}}", self.context.program.scope)
        prompt = prompt.replace(
            "{{target_memories}}", str(input_data.output_config.target_memories)
        )
        prompt = prompt.replace("{{min_confidence}}", str(input_data.output_config.min_confidence))
        prompt = prompt.replace("{{granularity}}", input_data.output_config.granularity)

        # Add evidence
        prompt = prompt.replace("{{evidence}}", evidence_context)

        # Add existing memories
        existing = "\n".join(f"- {t}" for t in input_data.existing_memory_titles)
        prompt = prompt.replace("{{existing_memories}}", existing)

        # Call LLM
        try:
            response = await self._llm.generate(
                prompt=prompt,
                temperature=self.context.temperature,
                max_tokens=self.context.max_tokens,
            )

            # Parse response into memories
            return self._parse_llm_response(response, input_data)

        except Exception as e:
            self.logger.warning(f"LLM synthesis failed: {e}")
            # Fall back to simple synthesis
            return self._synthesize_simple(input_data)

    def _synthesize_simple(self, input_data: SynthesizerInput) -> list[DraftMemory]:
        """Simple memory synthesis without LLM (for testing)."""
        memories = []
        scope = self.context.program.scope
        target = min(input_data.output_config.target_memories, len(input_data.evidence))

        for evidence in input_data.evidence[:target]:
            # Generate content hash
            content_hash = hashlib.sha256(evidence.normalized_content[:1000].encode()).hexdigest()

            # Extract topic from title
            title = evidence.metadata.title or "Untitled"
            topic_slug = re.sub(r"[^a-z0-9]+", "_", title.lower())[:30].strip("_")

            # Generate memory ID
            memory_id = f"mem_{scope}_{topic_slug}_{content_hash[:8]}"

            # Create citation
            citation = Citation(
                kind=CitationKind.WEB,
                url=evidence.source.url,
            )

            # Create summary from excerpt
            summary = evidence.metadata.excerpt or evidence.normalized_content[:300]
            if len(summary) > 300:
                summary = summary[:297] + "..."

            # Create memory
            memory = DraftMemory(
                memory_id=memory_id,
                title=f"{scope}: {title}",
                status="draft",
                visibility="shared",
                scope=scope,
                tags=list(input_data.required_tags) + [scope],
                citations=[citation],
                summary=summary,
                technical_details=evidence.normalized_content[:2000],
                confidence=0.75,
                run_id=self.context.run_id,
            )

            memories.append(memory)

        return memories

    def _parse_llm_response(
        self,
        response: str,
        input_data: SynthesizerInput,
    ) -> list[DraftMemory]:
        """Parse LLM response into DraftMemory objects."""
        memories = []

        # Split response by memory separators
        memory_blocks = re.split(r"\n---\s*\n", response)

        for block in memory_blocks:
            if not block.strip():
                continue

            try:
                # Try to parse as memory with frontmatter
                if block.strip().startswith("---"):
                    memory = DraftMemory.from_markdown(block, run_id=self.context.run_id)
                    memories.append(memory)
                else:
                    # Try to extract memory from JSON block
                    json_match = re.search(r"```json\s*(.*?)```", block, re.DOTALL)
                    if json_match:
                        data = json.loads(json_match.group(1))
                        memory = self._create_memory_from_dict(data, input_data)
                        if memory:
                            memories.append(memory)

            except Exception as e:
                self.logger.warning(f"Failed to parse memory block: {e}")
                continue

        return memories

    def _create_memory_from_dict(
        self,
        data: dict[str, Any],
        input_data: SynthesizerInput,
    ) -> DraftMemory | None:
        """Create a DraftMemory from a dictionary."""
        try:
            scope = self.context.program.scope

            # Extract fields
            title = data.get("title", "Untitled")
            summary = data.get("summary", "")
            details = data.get("technical_details", data.get("details", ""))
            confidence = float(data.get("confidence", 0.75))
            tags = data.get("tags", [])

            # Generate ID if not provided
            memory_id = data.get("memory_id")
            if not memory_id:
                content_hash = hashlib.sha256(summary.encode()).hexdigest()
                topic_slug = re.sub(r"[^a-z0-9]+", "_", title.lower())[:30].strip("_")
                memory_id = f"mem_{scope}_{topic_slug}_{content_hash[:8]}"

            # Parse citations
            citations = []
            for c in data.get("citations", []):
                if isinstance(c, dict):
                    kind = CitationKind(c.get("kind", "web"))
                    citation = Citation(
                        kind=kind,
                        url=c.get("url"),
                        repo_path=c.get("repo_path"),
                        run_id=c.get("run_id"),
                    )
                    citations.append(citation)

            # Add required tags
            all_tags = list(set(tags + list(input_data.required_tags)))

            return DraftMemory(
                memory_id=memory_id,
                title=title,
                status="draft",
                visibility="shared",
                scope=scope,
                tags=all_tags,
                citations=citations,
                summary=summary,
                technical_details=details,
                confidence=confidence,
                run_id=self.context.run_id,
            )

        except Exception as e:
            self.logger.warning(f"Failed to create memory from dict: {e}")
            return None

    def _default_prompt(self) -> str:
        """Return default synthesizer prompt."""
        return """You are a knowledge synthesizer for the Cyntra memory system.

## Evidence Provided

{{evidence}}

## Existing Memories (avoid duplicating)

{{existing_memories}}

## Instructions

Create {{target_memories}} distinct, valuable knowledge memories.

Each memory should:
1. Be actionable and specific
2. Be grounded in evidence with citations
3. Not duplicate existing memories
4. Follow the memory schema format

Output each memory as a Markdown file with YAML frontmatter.
Use footnote citations [^1] in the content and list sources at the end.

Begin synthesis now."""

    async def _write_synthesis_log(self, output: SynthesizerOutput, run_dir: Path) -> None:
        """Write synthesis log to JSON file."""
        log_path = run_dir / "synthesis_log.json"

        with open(log_path, "w") as f:
            json.dump(output.to_dict(), f, indent=2)

        self.write_log(f"Wrote synthesis log with {len(output.synthesis_log)} decisions")


def create_synthesizer_input(
    collector_output: CollectorOutput,
    output_config: OutputConfig,
    existing_memory_titles: list[str] | None = None,
    required_tags: list[str] | None = None,
) -> SynthesizerInput:
    """Create SynthesizerInput from CollectorOutput."""
    return SynthesizerInput(
        evidence=collector_output.evidence_collected,
        output_config=output_config,
        existing_memory_titles=existing_memory_titles or [],
        required_tags=required_tags or [],
    )
