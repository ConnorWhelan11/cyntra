"""
Librarian Agent - Store and index memories.

The Librarian agent is the fifth step in the research pipeline:
1. Generate stable memory IDs
2. Copy verified memories to .cyntra/memories/drafts/
3. Update run manifest with final paths
4. Generate run report
5. Trigger CocoIndex update
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cyntra.research.agents.base import AgentContext, AgentResult, BaseResearchAgent
from cyntra.research.agents.verifier import VerifierOutput
from cyntra.research.models import (
    BudgetConsumed,
    DraftMemory,
    ManifestEvidence,
    ManifestInputs,
    ManifestMemories,
    ManifestMemory,
    ManifestVerification,
    ResearchManifest,
    RunStatus,
)


@dataclass
class StoredMemory:
    """A memory that has been stored."""

    memory_id: str
    title: str
    source_path: Path
    target_path: Path
    content_hash: str
    size_bytes: int
    indexed: bool = False


@dataclass
class LibrarianInput:
    """Input for the Librarian agent."""

    verified_memories: list[DraftMemory] = field(default_factory=list)
    evidence_count: int = 0
    pages_fetched: int = 0
    pages_failed: int = 0
    total_evidence_bytes: int = 0
    budget_consumed: BudgetConsumed = field(default_factory=BudgetConsumed)
    trigger_indexing: bool = True


@dataclass
class LibrarianOutput:
    """Output from the Librarian agent."""

    stored_memories: list[StoredMemory] = field(default_factory=list)
    manifest_path: Path | None = None
    report_path: Path | None = None
    indexing_triggered: bool = False

    total_stored: int = 0
    total_bytes: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "stored_memories": [
                {
                    "memory_id": m.memory_id,
                    "title": m.title,
                    "target_path": str(m.target_path),
                    "content_hash": m.content_hash,
                    "indexed": m.indexed,
                }
                for m in self.stored_memories
            ],
            "manifest_path": str(self.manifest_path) if self.manifest_path else None,
            "report_path": str(self.report_path) if self.report_path else None,
            "indexing_triggered": self.indexing_triggered,
            "total_stored": self.total_stored,
            "total_bytes": self.total_bytes,
        }


class LibrarianAgent(BaseResearchAgent[LibrarianInput, LibrarianOutput]):
    """
    Librarian agent for storing and indexing memories.

    Copies verified memories to permanent storage and triggers indexing.
    """

    name = "librarian"

    def __init__(self, context: AgentContext, indexer: Any | None = None):
        super().__init__(context)
        self._indexer = indexer

    async def execute(self, input_data: LibrarianInput) -> AgentResult[LibrarianOutput]:
        """Execute the librarian agent to store memories."""
        result = AgentResult[LibrarianOutput](success=False, started_at=datetime.now(UTC))
        output = LibrarianOutput()

        try:
            # Create memories drafts directory
            drafts_dir = self.context.repo_root / ".cyntra" / "memories" / "drafts"
            drafts_dir.mkdir(parents=True, exist_ok=True)

            # Store each verified memory
            for memory in input_data.verified_memories:
                stored = await self._store_memory(memory, drafts_dir)
                output.stored_memories.append(stored)
                output.total_stored += 1
                output.total_bytes += stored.size_bytes

            # Generate and write manifest
            manifest = self._create_manifest(input_data, output)
            manifest_path = self.context.run_dir / "manifest.json"
            with open(manifest_path, "w") as f:
                f.write(manifest.to_json())
            output.manifest_path = manifest_path

            # Generate and write report
            report = self._generate_report(input_data, output, manifest)
            report_path = self.context.run_dir / "report.md"
            with open(report_path, "w") as f:
                f.write(report)
            output.report_path = report_path

            # Trigger indexing if enabled
            if input_data.trigger_indexing:
                output.indexing_triggered = await self._trigger_indexing(output)

            self.logger.info(f"Librarian complete: {output.total_stored} memories stored")

            result.success = True
            result.output = output
            result.completed_at = datetime.now(UTC)

        except Exception as e:
            self.logger.error(f"Librarian failed: {e}")
            result.success = False
            result.error = str(e)
            result.completed_at = datetime.now(UTC)

        return result

    async def _store_memory(
        self,
        memory: DraftMemory,
        drafts_dir: Path,
    ) -> StoredMemory:
        """Store a single memory to permanent location."""
        # Source path in run directory
        source_path = self.context.run_dir / "draft_memories" / f"{memory.memory_id}.md"

        # Target path in drafts directory
        target_path = drafts_dir / f"{memory.memory_id}.md"

        # Read content (from source if exists, otherwise generate from memory)
        content = source_path.read_text() if source_path.exists() else memory.to_markdown()

        # Compute hash
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        size_bytes = len(content.encode())

        # Write to target
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)

        self.logger.debug(f"Stored {memory.memory_id} to {target_path}")

        return StoredMemory(
            memory_id=memory.memory_id,
            title=memory.title,
            source_path=source_path,
            target_path=target_path,
            content_hash=f"sha256:{content_hash}",
            size_bytes=size_bytes,
        )

    def _create_manifest(
        self,
        input_data: LibrarianInput,
        output: LibrarianOutput,
    ) -> ResearchManifest:
        """Create the run manifest."""
        program = self.context.program

        # Compute input hashes
        program_hash = hashlib.sha256(program.to_yaml().encode()).hexdigest()
        prompts_hash = (
            hashlib.sha256(self.context.prompt_template.encode()).hexdigest()
            if self.context.prompt_template
            else "none"
        )

        # Build memory entries
        memory_items = [
            ManifestMemory(
                memory_id=sm.memory_id,
                title=sm.title,
                status="draft",
                draft_path=str(sm.source_path.relative_to(self.context.run_dir)),
                target_path=str(sm.target_path),
                content_hash=sm.content_hash,
                citation_count=len(
                    next(
                        (
                            m.citations
                            for m in input_data.verified_memories
                            if m.memory_id == sm.memory_id
                        ),
                        [],
                    )
                ),
                citation_coverage=0.9,  # TODO: Get from verifier
                confidence=next(
                    (
                        m.confidence
                        for m in input_data.verified_memories
                        if m.memory_id == sm.memory_id
                    ),
                    0.8,
                ),
            )
            for sm in output.stored_memories
        ]

        return ResearchManifest(
            run_id=self.context.run_id,
            program_id=program.program_id,
            started_at=datetime.now(UTC),  # TODO: Use actual start time
            status=RunStatus.COMPLETED,
            toolchain=program.agents.toolchain,
            model=program.agents.model,
            inputs=ManifestInputs(
                program_hash=f"sha256:{program_hash[:16]}",
                prompts_hash=f"sha256:{prompts_hash[:16]}",
            ),
            evidence=ManifestEvidence(
                sources_queried=input_data.evidence_count,
                pages_fetched=input_data.pages_fetched,
                pages_failed=input_data.pages_failed,
                total_bytes=input_data.total_evidence_bytes,
            ),
            memories=ManifestMemories(
                drafted=len(input_data.verified_memories),
                verified=output.total_stored,
                rejected=len(input_data.verified_memories) - output.total_stored,
                items=memory_items,
            ),
            verification=ManifestVerification(
                passed=True,
                gates={
                    "schema_valid": True,
                    "citations_complete": True,
                    "no_duplicates": True,
                    "safety_passed": True,
                },
            ),
            budget_consumed=input_data.budget_consumed,
        )

    def _generate_report(
        self,
        input_data: LibrarianInput,
        output: LibrarianOutput,
        manifest: ResearchManifest,
    ) -> str:
        """Generate the run report."""
        program = self.context.program
        now = datetime.now(UTC)

        lines = [
            "# Research Run Report",
            "",
            f"**Run ID**: `{self.context.run_id}`",
            f"**Program**: {program.name} (`{program.program_id}`)",
            f"**Date**: {now.strftime('%Y-%m-%d %H:%M UTC')}",
            f"**Duration**: {input_data.budget_consumed.duration_minutes:.1f} minutes",
            "",
            "## Summary",
            "",
            f"- Sources queried: {manifest.evidence.sources_queried}",
            f"- Pages fetched: {manifest.evidence.pages_fetched}",
            f"- Pages failed: {manifest.evidence.pages_failed}",
            f"- Memories created: {output.total_stored}",
            "",
            "## Created Memories",
            "",
        ]

        for memory in output.stored_memories:
            m = next(
                (m for m in input_data.verified_memories if m.memory_id == memory.memory_id), None
            )
            if m:
                lines.extend(
                    [
                        f"### {m.title}",
                        f"- ID: `{m.memory_id}`",
                        f"- Confidence: {m.confidence:.0%}",
                        f"- Citations: {len(m.citations)}",
                        f"- Path: `{memory.target_path}`",
                        "",
                    ]
                )

        lines.extend(
            [
                "## Budget Consumed",
                "",
                f"- Pages: {input_data.budget_consumed.pages}/{program.budgets.max_pages}",
                f"- Input tokens: {input_data.budget_consumed.input_tokens}",
                f"- Output tokens: {input_data.budget_consumed.output_tokens}",
                f"- Cost: ${input_data.budget_consumed.cost_usd:.4f}",
                f"- Duration: {input_data.budget_consumed.duration_minutes:.1f} min",
                "",
                "## Recommendations",
                "",
                "- Review the draft memories in the Knowledge tab",
                "- Promote valuable memories to 'reviewed' status",
                "- Archive or delete low-value memories",
                "",
                "---",
                "*Generated by Cyntra Research System*",
                "",
            ]
        )

        return "\n".join(lines)

    async def _trigger_indexing(self, output: LibrarianOutput) -> bool:
        """Trigger CocoIndex to update."""
        if not self._indexer:
            self.logger.debug("No indexer configured, skipping")
            return False

        try:
            # Trigger incremental index update
            await self._indexer.update_incremental(
                paths=[str(m.target_path) for m in output.stored_memories]
            )

            # Mark memories as indexed
            for memory in output.stored_memories:
                memory.indexed = True

            self.logger.info(f"Triggered indexing for {len(output.stored_memories)} memories")
            return True

        except Exception as e:
            self.logger.warning(f"Indexing failed: {e}")
            return False


def create_librarian_input(
    verifier_output: VerifierOutput,
    evidence_count: int = 0,
    pages_fetched: int = 0,
    pages_failed: int = 0,
    total_evidence_bytes: int = 0,
    budget_consumed: BudgetConsumed | None = None,
) -> LibrarianInput:
    """Create LibrarianInput from VerifierOutput."""
    return LibrarianInput(
        verified_memories=verifier_output.verified_memories,
        evidence_count=evidence_count,
        pages_fetched=pages_fetched,
        pages_failed=pages_failed,
        total_evidence_bytes=total_evidence_bytes,
        budget_consumed=budget_consumed or BudgetConsumed(),
    )
