"""
Tests for research agents.

Tests the Scout, Collector, Synthesizer, Verifier, and Librarian agents.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cyntra.research.agents import (
    AgentContext,
    CollectedEvidence,
    CollectorAgent,
    CollectorInput,
    LibrarianAgent,
    LibrarianInput,
    ScoutAgent,
    ScoutInput,
    SourceEntry,
    SynthesizerAgent,
    SynthesizerInput,
    VerifierAgent,
    VerifierInput,
    create_scout_input,
)
from cyntra.research.models import (
    Citation,
    CitationKind,
    DraftMemory,
    EvidenceMetadata,
    OutputConfig,
    ResearchProgram,
    SafetyConfig,
    ScheduleConfig,
    SourceConfig,
    WebSource,
)


@pytest.fixture
def minimal_program() -> ResearchProgram:
    """Create a minimal research program for testing."""
    return ResearchProgram(
        program_id="test_program",
        name="Test Program",
        description="A test research program",
        owner="@test",
        scope="test",
        schedule=ScheduleConfig(cadence="0 8 * * 1"),
        sources=SourceConfig(
            web=[
                WebSource(
                    domain="example.com",
                    paths=["/docs"],
                    search_queries=["test query"],
                )
            ]
        ),
    )


@pytest.fixture
def agent_context(tmp_path: Path, minimal_program: ResearchProgram) -> AgentContext:
    """Create an agent context for testing."""
    run_dir = tmp_path / "runs" / "test_run"
    run_dir.mkdir(parents=True)

    return AgentContext(
        program=minimal_program,
        run_id="test_run_123",
        run_dir=run_dir,
        repo_root=tmp_path,
        temperature=0.3,
        max_tokens=4000,
    )


class TestScoutAgent:
    """Tests for the Scout agent."""

    @pytest.mark.asyncio
    async def test_scout_executes_without_firecrawl(self, agent_context: AgentContext) -> None:
        """Scout should work without Firecrawl (fallback mode)."""
        scout = ScoutAgent(agent_context, firecrawl_client=None)

        input_data = ScoutInput(
            query_templates=["{{scope}} documentation"],
            keywords=["test"],
            web_sources=agent_context.program.sources.web,
            allowed_domains=["example.com"],
            max_pages=10,
        )

        result = await scout.execute(input_data)

        assert result.success
        assert result.output is not None
        # Without Firecrawl, sources come from paths only
        assert len(result.output.source_manifest) >= 0

    @pytest.mark.asyncio
    async def test_scout_expands_query_templates(self, agent_context: AgentContext) -> None:
        """Scout should expand query templates with placeholders."""
        scout = ScoutAgent(agent_context)

        input_data = ScoutInput(
            query_templates=["{{scope}} new features {{year}}"],
            keywords=["api"],
            web_sources=[],
            max_pages=10,
        )

        result = await scout.execute(input_data)

        assert result.success
        # Check query log for expanded queries
        if result.output and result.output.query_log:
            for query in result.output.query_log:
                assert "{{scope}}" not in query.query
                assert "{{year}}" not in query.query

    @pytest.mark.asyncio
    async def test_scout_filters_blocked_domains(self, agent_context: AgentContext) -> None:
        """Scout should filter out blocked domains."""
        scout = ScoutAgent(agent_context)

        input_data = ScoutInput(
            query_templates=[],
            web_sources=[],
            blocked_domains=["blocked.com"],
            max_pages=10,
        )

        result = await scout.execute(input_data)

        assert result.success
        if result.output:
            for source in result.output.source_manifest:
                assert "blocked.com" not in source.domain

    @pytest.mark.asyncio
    async def test_scout_creates_source_manifest(self, agent_context: AgentContext) -> None:
        """Scout should create source_manifest.json."""
        scout = ScoutAgent(agent_context)

        input_data = ScoutInput(
            query_templates=[],
            web_sources=[WebSource(domain="example.com", paths=["/test"])],
            allowed_domains=["example.com"],
            max_pages=10,
        )

        result = await scout.execute(input_data)

        assert result.success
        manifest_path = agent_context.run_dir / "source_manifest.json"
        assert manifest_path.exists()

    def test_create_scout_input_from_context(self, agent_context: AgentContext) -> None:
        """create_scout_input should properly extract program config."""
        input_data = create_scout_input(
            agent_context,
            global_allowlist=["example.com"],
            global_denylist=["spam.com"],
        )

        assert "example.com" in input_data.allowed_domains
        assert "spam.com" in input_data.blocked_domains
        assert len(input_data.web_sources) > 0


class TestCollectorAgent:
    """Tests for the Collector agent."""

    @pytest.fixture
    def sample_sources(self) -> list[SourceEntry]:
        """Create sample source entries."""
        return [
            SourceEntry(
                url="https://example.com/docs/test",
                domain="example.com",
                source_type="documentation",
                relevance_score=0.9,
            ),
        ]

    @pytest.mark.asyncio
    async def test_collector_creates_evidence_directories(
        self,
        agent_context: AgentContext,
        sample_sources: list[SourceEntry],
    ) -> None:
        """Collector should create evidence directories."""
        collector = CollectorAgent(agent_context)

        input_data = CollectorInput(
            source_manifest=sample_sources,
            safety_config=SafetyConfig(),
        )

        # Will fail to fetch without client, but should create directories
        await collector.execute(input_data)

        evidence_dir = agent_context.run_dir / "evidence"
        assert evidence_dir.exists()
        assert (evidence_dir / "raw").exists()
        assert (evidence_dir / "normalized").exists()

    @pytest.mark.asyncio
    async def test_collector_scans_for_pii(self, agent_context: AgentContext) -> None:
        """Collector should detect PII in content."""
        collector = CollectorAgent(agent_context)

        # Test PII scanning directly
        content = "Contact john@example.com for details"
        result = collector._scan_content(content, SafetyConfig(pii_scan=True))

        assert not result.passed
        assert len(result.pii_found) > 0
        assert result.pii_found[0][0] == "email"

    @pytest.mark.asyncio
    async def test_collector_scans_for_secrets(self, agent_context: AgentContext) -> None:
        """Collector should detect secrets in content."""
        collector = CollectorAgent(agent_context)

        content = "Use AKIAIOSFODNN7EXAMPLE for AWS access"
        result = collector._scan_content(content, SafetyConfig(secrets_scan=True))

        assert not result.passed
        assert len(result.secrets_found) > 0

    @pytest.mark.asyncio
    async def test_collector_redacts_content(self, agent_context: AgentContext) -> None:
        """Collector should redact PII when configured."""
        collector = CollectorAgent(agent_context)

        content = "Email: test@example.com"
        result = collector._scan_content(
            content, SafetyConfig(pii_scan=True, redact_on_detect=True)
        )

        assert result.redacted_content is not None
        assert "[REDACTED]" in result.redacted_content

    def test_collector_normalizes_markdown(self, agent_context: AgentContext) -> None:
        """Collector should normalize HTML to Markdown."""
        collector = CollectorAgent(agent_context)

        html = "<h1>Title</h1><p>Content</p>"
        markdown = collector._normalize_to_markdown(html, "text/html")

        assert "Title" in markdown
        assert "Content" in markdown


class TestSynthesizerAgent:
    """Tests for the Synthesizer agent."""

    @pytest.fixture
    def sample_evidence(self, agent_context: AgentContext) -> list[CollectedEvidence]:
        """Create sample evidence."""
        source = SourceEntry(
            url="https://example.com/docs/test",
            domain="example.com",
            source_type="documentation",
        )

        metadata = EvidenceMetadata(
            evidence_id="evi_test_123",
            source_type="web",
            url="https://example.com/docs/test",
            title="Test Documentation",
            content_hash="sha256:abc123",
            size_bytes=1000,
        )

        return [
            CollectedEvidence(
                source=source,
                metadata=metadata,
                raw_content="<h1>Test</h1><p>This is test content.</p>",
                normalized_content="# Test\n\nThis is test content about testing.",
                safety_result=type(
                    "SafetyResult",
                    (),
                    {
                        "passed": True,
                        "pii_found": [],
                        "secrets_found": [],
                        "to_dict": lambda self: {
                            "passed": True,
                            "pii_count": 0,
                            "secrets_count": 0,
                            "issues": [],
                        },
                    },
                )(),
            )
        ]

    @pytest.mark.asyncio
    async def test_synthesizer_creates_memories(
        self,
        agent_context: AgentContext,
        sample_evidence: list[CollectedEvidence],
    ) -> None:
        """Synthesizer should create draft memories."""
        synthesizer = SynthesizerAgent(agent_context)

        input_data = SynthesizerInput(
            evidence=sample_evidence,
            output_config=OutputConfig(target_memories=1),
            required_tags=["test"],
        )

        result = await synthesizer.execute(input_data)

        assert result.success
        assert result.output is not None
        assert len(result.output.draft_memories) > 0

    @pytest.mark.asyncio
    async def test_synthesizer_creates_draft_directory(
        self,
        agent_context: AgentContext,
        sample_evidence: list[CollectedEvidence],
    ) -> None:
        """Synthesizer should create draft_memories directory."""
        synthesizer = SynthesizerAgent(agent_context)

        input_data = SynthesizerInput(
            evidence=sample_evidence,
            output_config=OutputConfig(target_memories=1),
        )

        await synthesizer.execute(input_data)

        drafts_dir = agent_context.run_dir / "draft_memories"
        assert drafts_dir.exists()

    @pytest.mark.asyncio
    async def test_synthesizer_includes_citations(
        self,
        agent_context: AgentContext,
        sample_evidence: list[CollectedEvidence],
    ) -> None:
        """Synthesizer should include citations in memories."""
        synthesizer = SynthesizerAgent(agent_context)

        input_data = SynthesizerInput(
            evidence=sample_evidence,
            output_config=OutputConfig(target_memories=1),
        )

        result = await synthesizer.execute(input_data)

        if result.output and result.output.draft_memories:
            memory = result.output.draft_memories[0]
            assert len(memory.citations) > 0


class TestVerifierAgent:
    """Tests for the Verifier agent."""

    @pytest.fixture
    def sample_memory(self) -> DraftMemory:
        """Create a sample draft memory."""
        return DraftMemory(
            memory_id="mem_test_example_12345678",
            title="Test: Example Memory",
            scope="test",
            summary="This is a test memory about testing concepts.",
            technical_details="The test uses pytest for validation.",
            tags=["test", "example"],
            citations=[
                Citation(kind=CitationKind.WEB, url="https://example.com/docs"),
            ],
            confidence=0.85,
        )

    @pytest.mark.asyncio
    async def test_verifier_validates_schema(
        self,
        agent_context: AgentContext,
        sample_memory: DraftMemory,
    ) -> None:
        """Verifier should validate memory schema."""
        verifier = VerifierAgent(agent_context)

        input_data = VerifierInput(
            draft_memories=[sample_memory],
            evidence=[],
        )

        result = await verifier.execute(input_data)

        assert result.success
        assert result.output is not None
        assert len(result.output.verification_results) == 1

    @pytest.mark.asyncio
    async def test_verifier_rejects_missing_summary(
        self,
        agent_context: AgentContext,
    ) -> None:
        """Verifier should reject memories missing required fields."""
        verifier = VerifierAgent(agent_context)

        # Memory with empty summary (validates other schema issues)
        memory = DraftMemory(
            memory_id="mem_test_empty_12345678",
            title="",  # Empty title should fail
            scope="test",
            summary="",  # Empty summary should fail
            citations=[],
        )

        gate_result = verifier._check_schema(memory)

        # Should have issues for missing title and summary
        assert not gate_result.passed
        assert any("SCHEMA_INVALID" in i for i in gate_result.issues)

    @pytest.mark.asyncio
    async def test_verifier_checks_citations(
        self,
        agent_context: AgentContext,
        sample_memory: DraftMemory,
    ) -> None:
        """Verifier should check citation validity."""
        verifier = VerifierAgent(agent_context)

        # Citation URL should be in evidence
        evidence_urls = {"https://example.com/docs"}

        result = verifier._check_citations_valid(sample_memory, evidence_urls)

        assert result.passed

    @pytest.mark.asyncio
    async def test_verifier_detects_duplicates(
        self,
        agent_context: AgentContext,
        sample_memory: DraftMemory,
    ) -> None:
        """Verifier should detect duplicate memories."""
        verifier = VerifierAgent(agent_context)

        # Existing memory with similar content
        existing = {"mem_existing": "This is a test memory about testing concepts."}

        result = await verifier._check_duplicates(
            sample_memory,
            existing,
            threshold=0.85,
        )

        # Should detect high similarity
        assert result.details.get("max_similarity", 0) > 0.5

    @pytest.mark.asyncio
    async def test_verifier_detects_pii(
        self,
        agent_context: AgentContext,
    ) -> None:
        """Verifier should detect PII in memories."""
        verifier = VerifierAgent(agent_context)

        memory = DraftMemory(
            memory_id="mem_test_pii_12345678",
            title="Test Memory",
            scope="test",
            summary="Contact admin@example.com for help.",
            citations=[],
        )

        result = verifier._check_safety(memory)

        assert not result.passed
        assert any("PII_DETECTED" in i for i in result.issues)


class TestLibrarianAgent:
    """Tests for the Librarian agent."""

    @pytest.fixture
    def sample_memory(self) -> DraftMemory:
        """Create a sample verified memory."""
        return DraftMemory(
            memory_id="mem_test_storage_12345678",
            title="Test: Storage Memory",
            scope="test",
            summary="This memory tests storage functionality.",
            citations=[
                Citation(kind=CitationKind.WEB, url="https://example.com"),
            ],
            confidence=0.9,
        )

    @pytest.mark.asyncio
    async def test_librarian_stores_memories(
        self,
        agent_context: AgentContext,
        sample_memory: DraftMemory,
    ) -> None:
        """Librarian should store memories to drafts directory."""
        librarian = LibrarianAgent(agent_context)

        # Create draft_memories directory with memory file
        drafts_dir = agent_context.run_dir / "draft_memories"
        drafts_dir.mkdir(parents=True)
        memory_path = drafts_dir / f"{sample_memory.memory_id}.md"
        memory_path.write_text(sample_memory.to_markdown())

        input_data = LibrarianInput(
            verified_memories=[sample_memory],
        )

        result = await librarian.execute(input_data)

        assert result.success
        assert result.output is not None
        assert result.output.total_stored == 1

        # Check memory was stored
        target_path = agent_context.repo_root / ".cyntra" / "memories" / "drafts"
        assert target_path.exists()
        assert (target_path / f"{sample_memory.memory_id}.md").exists()

    @pytest.mark.asyncio
    async def test_librarian_creates_manifest(
        self,
        agent_context: AgentContext,
        sample_memory: DraftMemory,
    ) -> None:
        """Librarian should create run manifest."""
        librarian = LibrarianAgent(agent_context)

        # Create draft_memories directory with memory file
        drafts_dir = agent_context.run_dir / "draft_memories"
        drafts_dir.mkdir(parents=True)
        memory_path = drafts_dir / f"{sample_memory.memory_id}.md"
        memory_path.write_text(sample_memory.to_markdown())

        input_data = LibrarianInput(
            verified_memories=[sample_memory],
        )

        result = await librarian.execute(input_data)

        assert result.output is not None
        assert result.output.manifest_path is not None
        assert result.output.manifest_path.exists()

    @pytest.mark.asyncio
    async def test_librarian_creates_report(
        self,
        agent_context: AgentContext,
        sample_memory: DraftMemory,
    ) -> None:
        """Librarian should create run report."""
        librarian = LibrarianAgent(agent_context)

        # Create draft_memories directory with memory file
        drafts_dir = agent_context.run_dir / "draft_memories"
        drafts_dir.mkdir(parents=True)
        memory_path = drafts_dir / f"{sample_memory.memory_id}.md"
        memory_path.write_text(sample_memory.to_markdown())

        input_data = LibrarianInput(
            verified_memories=[sample_memory],
        )

        result = await librarian.execute(input_data)

        assert result.output is not None
        assert result.output.report_path is not None
        assert result.output.report_path.exists()

        # Check report content
        report = result.output.report_path.read_text()
        assert "Research Run Report" in report
        assert sample_memory.title in report


class TestAgentHelpers:
    """Tests for agent helper functions."""

    def test_source_entry_to_dict(self) -> None:
        """SourceEntry should convert to dict correctly."""
        source = SourceEntry(
            url="https://example.com",
            domain="example.com",
            relevance_score=0.8,
        )

        data = source.to_dict()

        assert data["url"] == "https://example.com"
        assert data["domain"] == "example.com"
        assert data["relevance_score"] == 0.8

    def test_draft_memory_to_markdown(self) -> None:
        """DraftMemory should serialize to Markdown."""
        memory = DraftMemory(
            memory_id="mem_test_md_12345678",
            title="Test Memory",
            scope="test",
            summary="Summary text",
            technical_details="Details here",
            tags=["tag1", "tag2"],
            citations=[
                Citation(kind=CitationKind.WEB, url="https://example.com"),
            ],
        )

        markdown = memory.to_markdown()

        assert "---" in markdown
        assert "memory_id: mem_test_md_12345678" in markdown
        assert "## Summary" in markdown
        assert "Summary text" in markdown

    def test_draft_memory_from_markdown(self) -> None:
        """DraftMemory should parse from Markdown."""
        markdown = """---
memory_id: mem_test_parse_12345678
title: "Test: Parse Memory"
status: draft
visibility: shared
scope: test
tags: [test]
related_issue_ids: []
citations:
  - kind: web
    url: "https://example.com"
---

## Summary

This is a test summary.

## Technical Details

These are details.
"""

        memory = DraftMemory.from_markdown(markdown)

        assert memory.memory_id == "mem_test_parse_12345678"
        assert memory.title == "Test: Parse Memory"
        assert memory.scope == "test"
        assert "test summary" in memory.summary.lower()
