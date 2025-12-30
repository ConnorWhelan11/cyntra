"""
Research Runner - Orchestrate the agent pipeline.

The ResearchRunner coordinates the execution of the full research pipeline:
1. Initialize run context and directories
2. Execute Scout → Collector → Synthesizer → Verifier → Librarian
3. Handle retries and failures
4. Record metrics and update ledger
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cyntra.research.agents import (
    AgentContext,
    CollectorAgent,
    LibrarianAgent,
    ScoutAgent,
    SynthesizerAgent,
    VerifierAgent,
    create_collector_input,
    create_librarian_input,
    create_scout_input,
    create_synthesizer_input,
    create_verifier_input,
)
from cyntra.research.models import (
    BudgetConsumed,
    ResearchProgram,
    ResearchRun,
    RunStatus,
)

logger = logging.getLogger(__name__)


@dataclass
class RunnerConfig:
    """Configuration for the research runner."""

    repo_root: Path
    max_retries: int = 3
    retry_backoff_seconds: float = 5.0

    # External clients (optional)
    firecrawl_client: Any | None = None
    llm_client: Any | None = None
    embedding_client: Any | None = None
    indexer_client: Any | None = None

    # Global domain lists
    global_allowlist: list[str] = field(default_factory=list)
    global_denylist: list[str] = field(default_factory=list)


@dataclass
class RunResult:
    """Result of a research run."""

    run: ResearchRun
    success: bool
    error: str | None = None

    # Stage outputs
    scout_output: Any | None = None
    collector_output: Any | None = None
    synthesizer_output: Any | None = None
    verifier_output: Any | None = None
    librarian_output: Any | None = None


class ResearchRunner:
    """
    Orchestrates the research agent pipeline.

    Usage:
        config = RunnerConfig(repo_root=Path("."))
        runner = ResearchRunner(config)
        result = await runner.run(program)
    """

    def __init__(self, config: RunnerConfig):
        self.config = config
        self.logger = logging.getLogger("cyntra.research.runner")

    async def run(
        self,
        program: ResearchProgram,
        prior_evidence: list[dict[str, Any]] | None = None,
        prior_memories: list[dict[str, Any]] | None = None,
    ) -> RunResult:
        """Execute a research program through the full pipeline."""
        # Generate run ID and create run record
        run_id = ResearchRun.generate_id(program.program_id)
        run = ResearchRun(
            run_id=run_id,
            program_id=program.program_id,
            status=RunStatus.RUNNING,
            toolchain=program.agents.toolchain,
            model=program.agents.model,
        )

        # Create run directory
        run_dir = self.config.repo_root / ".cyntra" / "runs" / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        run.run_dir = run_dir

        result = RunResult(run=run, success=False)

        try:
            self.logger.info(f"Starting research run: {run_id}")

            # Create agent context
            context = self._create_context(program, run_id, run_dir, prior_evidence, prior_memories)

            # Stage 1: Scout
            self.logger.info("Stage 1: Scout - discovering sources")
            scout_result = await self._run_scout(context)
            result.scout_output = scout_result

            if not scout_result or len(scout_result.source_manifest) == 0:
                self.logger.warning("Scout found no sources, ending run")
                run.status = RunStatus.COMPLETED
                run.completed_at = datetime.now(UTC)
                result.success = True
                return result

            run.sources_queried = scout_result.total_discovered

            # Stage 2: Collector
            self.logger.info(
                f"Stage 2: Collector - fetching {len(scout_result.source_manifest)} sources"
            )
            collector_result = await self._run_collector(context, scout_result)
            result.collector_output = collector_result

            if not collector_result or len(collector_result.evidence_collected) == 0:
                self.logger.warning("Collector found no evidence, ending run")
                run.status = RunStatus.COMPLETED
                run.completed_at = datetime.now(UTC)
                result.success = True
                return result

            run.pages_fetched = collector_result.total_fetched
            run.pages_failed = collector_result.total_failed
            run.budget_consumed.pages = collector_result.total_fetched

            # Stage 3: Synthesizer
            self.logger.info(
                f"Stage 3: Synthesizer - drafting from {len(collector_result.evidence_collected)} sources"
            )
            synthesizer_result = await self._run_synthesizer(context, collector_result)
            result.synthesizer_output = synthesizer_result

            if not synthesizer_result or len(synthesizer_result.draft_memories) == 0:
                self.logger.warning("Synthesizer produced no memories, ending run")
                run.status = RunStatus.COMPLETED
                run.completed_at = datetime.now(UTC)
                result.success = True
                return result

            run.memories_drafted = synthesizer_result.total_drafted

            # Stage 4: Verifier
            self.logger.info(
                f"Stage 4: Verifier - validating {len(synthesizer_result.draft_memories)} memories"
            )
            verifier_result = await self._run_verifier(
                context, synthesizer_result, collector_result
            )
            result.verifier_output = verifier_result

            run.memories_verified = verifier_result.total_verified
            run.memories_rejected = verifier_result.total_rejected

            # Retry loop if verification failed
            retry_count = 0
            while verifier_result.total_rejected > 0 and retry_count < self.config.max_retries:
                self.logger.info(
                    f"Retry {retry_count + 1}: Re-synthesizing {verifier_result.total_rejected} rejected memories"
                )

                # TODO: Implement re-synthesis with verification feedback
                # For now, just proceed with verified memories
                break

            # Stage 5: Librarian
            self.logger.info(
                f"Stage 5: Librarian - storing {len(verifier_result.verified_memories)} memories"
            )
            librarian_result = await self._run_librarian(context, verifier_result, collector_result)
            result.librarian_output = librarian_result

            # Update run metrics
            run.status = RunStatus.COMPLETED
            run.completed_at = datetime.now(UTC)
            run.manifest_path = librarian_result.manifest_path
            run.budget_consumed.duration_minutes = (
                run.duration_seconds() / 60.0 if run.duration_seconds() else 0
            )

            result.success = True
            self.logger.info(
                f"Research run complete: {run.memories_verified} memories created in "
                f"{run.budget_consumed.duration_minutes:.1f} minutes"
            )

        except Exception as e:
            self.logger.error(f"Research run failed: {e}")
            run.status = RunStatus.FAILED
            run.error_message = str(e)
            run.completed_at = datetime.now(UTC)
            result.error = str(e)

        return result

    def _create_context(
        self,
        program: ResearchProgram,
        run_id: str,
        run_dir: Path,
        prior_evidence: list[dict[str, Any]] | None,
        prior_memories: list[dict[str, Any]] | None,
    ) -> AgentContext:
        """Create agent context for the run."""
        # Load prompt template
        prompt_path = (
            self.config.repo_root / "knowledge" / "research" / "prompts" / "synthesizer_v1.md"
        )
        prompt_template = ""
        if prompt_path.exists():
            prompt_template = prompt_path.read_text()

        return AgentContext(
            program=program,
            run_id=run_id,
            run_dir=run_dir,
            repo_root=self.config.repo_root,
            temperature=program.agents.synthesizer_temperature,
            max_tokens=8000,
            prompt_template=prompt_template,
            prompt_overrides=program.agents.prompt_overrides,
            prior_evidence=prior_evidence or [],
            prior_memories=prior_memories or [],
        )

    async def _run_scout(self, context: AgentContext) -> Any:
        """Run the Scout agent."""
        scout = ScoutAgent(context, firecrawl_client=self.config.firecrawl_client)

        # Create input from program config
        input_data = create_scout_input(
            context,
            global_allowlist=self.config.global_allowlist,
            global_denylist=self.config.global_denylist,
        )

        result = await scout.execute(input_data)

        if not result.success:
            raise Exception(f"Scout failed: {result.error}")

        return result.output

    async def _run_collector(self, context: AgentContext, scout_output: Any) -> Any:
        """Run the Collector agent."""
        collector = CollectorAgent(context, firecrawl_client=self.config.firecrawl_client)

        input_data = create_collector_input(
            scout_output,
            context.program.safety,
        )

        result = await collector.execute(input_data)

        if not result.success:
            raise Exception(f"Collector failed: {result.error}")

        return result.output

    async def _run_synthesizer(self, context: AgentContext, collector_output: Any) -> Any:
        """Run the Synthesizer agent."""
        synthesizer = SynthesizerAgent(context, llm_client=self.config.llm_client)

        # Get existing memory titles for dedup
        existing_titles = [m.get("title", "") for m in context.prior_memories]

        input_data = create_synthesizer_input(
            collector_output,
            context.program.output,
            existing_memory_titles=existing_titles,
            required_tags=context.program.output.tags.required,
        )

        result = await synthesizer.execute(input_data)

        if not result.success:
            raise Exception(f"Synthesizer failed: {result.error}")

        return result.output

    async def _run_verifier(
        self,
        context: AgentContext,
        synthesizer_output: Any,
        collector_output: Any,
    ) -> Any:
        """Run the Verifier agent."""
        verifier = VerifierAgent(context, embedding_client=self.config.embedding_client)

        # Build existing memory contents for dedup
        existing_contents = {
            m.get("memory_id", ""): m.get("content", "")
            for m in context.prior_memories
            if m.get("memory_id")
        }

        input_data = create_verifier_input(
            synthesizer_output,
            collector_output.evidence_collected,
            existing_memory_contents=existing_contents,
            min_confidence=context.program.output.min_confidence,
        )

        result = await verifier.execute(input_data)

        if not result.success:
            raise Exception(f"Verifier failed: {result.error}")

        return result.output

    async def _run_librarian(
        self,
        context: AgentContext,
        verifier_output: Any,
        collector_output: Any,
    ) -> Any:
        """Run the Librarian agent."""
        librarian = LibrarianAgent(context, indexer=self.config.indexer_client)

        budget = BudgetConsumed(
            pages=collector_output.total_fetched,
            evidence_mb=collector_output.total_bytes / (1024 * 1024),
        )

        input_data = create_librarian_input(
            verifier_output,
            evidence_count=len(collector_output.evidence_collected),
            pages_fetched=collector_output.total_fetched,
            pages_failed=collector_output.total_failed,
            total_evidence_bytes=collector_output.total_bytes,
            budget_consumed=budget,
        )

        result = await librarian.execute(input_data)

        if not result.success:
            raise Exception(f"Librarian failed: {result.error}")

        return result.output


async def run_research_program(
    program: ResearchProgram,
    repo_root: Path,
    firecrawl_client: Any | None = None,
    llm_client: Any | None = None,
) -> RunResult:
    """
    Convenience function to run a research program.

    Usage:
        from cyntra.research import ResearchProgram
        from cyntra.research.runner import run_research_program

        program = ResearchProgram.from_yaml_file("program.yaml")
        result = await run_research_program(program, Path("."))

        if result.success:
            print(f"Created {result.run.memories_verified} memories")
    """
    config = RunnerConfig(
        repo_root=repo_root,
        firecrawl_client=firecrawl_client,
        llm_client=llm_client,
    )

    runner = ResearchRunner(config)
    return await runner.run(program)
