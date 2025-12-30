"""
Unit tests for research system models.

Tests:
- ResearchProgram loading and validation
- Evidence and DraftMemory models
- Citation validation
- Manifest serialization
"""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from cyntra.research.models import (
    BudgetConfig,
    Citation,
    CitationKind,
    DraftMemory,
    Evidence,
    EvidenceMetadata,
    MemoryStatus,
    OutputConfig,
    OutputType,
    ResearchManifest,
    ResearchProgram,
    ResearchRun,
    RunStatus,
    SafetyConfig,
    ScheduleConfig,
    SourceConfig,
    WebSource,
)


class TestScheduleConfig:
    """Tests for ScheduleConfig model."""

    def test_valid_cron_expression(self):
        """Valid cron expressions should parse."""
        config = ScheduleConfig(cadence="0 8 * * 1")
        assert config.cadence == "0 8 * * 1"

    def test_invalid_cron_expression(self):
        """Invalid cron expressions should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            ScheduleConfig(cadence="0 8 * *")  # Missing 5th field
        assert "must have 5 parts" in str(exc_info.value)

    def test_default_values(self):
        """Default values should be set correctly."""
        config = ScheduleConfig(cadence="0 0 * * *")
        assert config.timezone == "UTC"
        assert config.enabled is True
        assert config.skip_if_running is True
        assert config.min_interval_hours == 24


class TestSourceConfig:
    """Tests for SourceConfig model."""

    def test_web_sources(self):
        """Web sources should parse correctly."""
        config = SourceConfig(
            web=[
                WebSource(
                    domain="github.com",
                    paths=["/anthropics/claude-code"],
                    search_queries=["claude code changelog"],
                )
            ]
        )
        assert len(config.web) == 1
        assert config.web[0].domain == "github.com"
        assert "/anthropics/claude-code" in config.web[0].paths

    def test_crawl_depth_limits(self):
        """Crawl depth should be within bounds."""
        # Valid
        WebSource(domain="example.com", crawl_depth=3)

        # Too deep
        with pytest.raises(ValidationError):
            WebSource(domain="example.com", crawl_depth=10)


class TestOutputConfig:
    """Tests for OutputConfig model."""

    def test_output_type_enum(self):
        """Output type should be valid enum value."""
        config = OutputConfig(type=OutputType.RADAR)
        assert config.type == OutputType.RADAR

        config = OutputConfig(type=OutputType.DEEP_DIVE)
        assert config.type == OutputType.DEEP_DIVE

    def test_memory_limits(self):
        """Memory count limits should be enforced."""
        # Valid
        config = OutputConfig(target_memories=5, max_memories=10)
        assert config.target_memories == 5

        # Target > Max should fail at model level
        # Note: This is validated in ResearchProgram, not OutputConfig


class TestBudgetConfig:
    """Tests for BudgetConfig model."""

    def test_default_budgets(self):
        """Default budget values should be reasonable."""
        config = BudgetConfig()
        assert config.max_pages == 50
        assert config.max_cost_per_run == 2.0
        assert config.max_duration_minutes == 30

    def test_budget_constraints(self):
        """Budget constraints should be enforced."""
        with pytest.raises(ValidationError):
            BudgetConfig(max_pages=0)  # Must be >= 1

        with pytest.raises(ValidationError):
            BudgetConfig(max_cost_per_run=-1.0)  # Must be >= 0.01


class TestSafetyConfig:
    """Tests for SafetyConfig model."""

    def test_default_safety(self):
        """Default safety settings should be secure."""
        config = SafetyConfig()
        assert config.pii_scan is True
        assert config.secrets_scan is True
        assert config.redact_on_detect is True

    def test_allowed_filetypes(self):
        """Default filetypes should be safe."""
        config = SafetyConfig()
        assert ".md" in config.allowed_filetypes
        assert ".exe" not in config.allowed_filetypes


class TestResearchProgram:
    """Tests for ResearchProgram model."""

    def test_minimal_program(self):
        """Minimal valid program should parse."""
        program = ResearchProgram(
            program_id="test_program",
            name="Test Program",
            description="A test program",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )
        assert program.program_id == "test_program"
        assert program.name == "Test Program"

    def test_invalid_program_id(self):
        """Invalid program IDs should fail."""
        with pytest.raises(ValidationError) as exc_info:
            ResearchProgram(
                program_id="Invalid-ID",  # Contains uppercase and hyphen
                name="Test",
                description="Test",
                owner="@test",
                scope="test",
                schedule=ScheduleConfig(cadence="0 0 * * *"),
            )
        assert "lowercase alphanumeric" in str(exc_info.value)

    def test_invalid_owner(self):
        """Invalid owner format should fail."""
        with pytest.raises(ValidationError) as exc_info:
            ResearchProgram(
                program_id="test",
                name="Test",
                description="Test",
                owner="invalid",  # Not @handle or email
                scope="test",
                schedule=ScheduleConfig(cadence="0 0 * * *"),
            )
        assert "GitHub handle" in str(exc_info.value)

    def test_target_exceeds_max_memories(self):
        """target_memories > max_memories should fail."""
        with pytest.raises(ValidationError) as exc_info:
            ResearchProgram(
                program_id="test",
                name="Test",
                description="Test",
                owner="@test",
                scope="test",
                schedule=ScheduleConfig(cadence="0 0 * * *"),
                output=OutputConfig(target_memories=20, max_memories=10),
            )
        assert "cannot exceed" in str(exc_info.value)

    def test_yaml_serialization(self):
        """Program should serialize to YAML."""
        program = ResearchProgram(
            program_id="test",
            name="Test",
            description="Test description",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )
        yaml_str = program.to_yaml()
        assert "program_id: test" in yaml_str
        assert "name: Test" in yaml_str


class TestCitation:
    """Tests for Citation model."""

    def test_web_citation(self):
        """Web citations require URL."""
        citation = Citation(kind=CitationKind.WEB, url="https://example.com")
        assert citation.url == "https://example.com"

    def test_web_citation_missing_url(self):
        """Web citations without URL should fail."""
        with pytest.raises(ValidationError) as exc_info:
            Citation(kind=CitationKind.WEB)
        assert "requires url" in str(exc_info.value)

    def test_artifact_citation(self):
        """Artifact citations require repo_path."""
        citation = Citation(kind=CitationKind.ARTIFACT_CHUNK, repo_path="docs/README.md")
        assert citation.repo_path == "docs/README.md"

    def test_run_citation(self):
        """Run citations require run_id."""
        citation = Citation(kind=CitationKind.RUN, run_id="research_test_20250129")
        assert citation.run_id == "research_test_20250129"


class TestDraftMemory:
    """Tests for DraftMemory model."""

    def test_valid_memory(self):
        """Valid memory should parse."""
        memory = DraftMemory(
            memory_id="mem_test_topic_a1b2c3d4",
            title="Test: Topic",
            scope="test",
            summary="This is a test summary.",
            citations=[Citation(kind=CitationKind.WEB, url="https://example.com")],
        )
        assert memory.memory_id == "mem_test_topic_a1b2c3d4"
        assert memory.status == MemoryStatus.DRAFT
        assert len(memory.citations) == 1

    def test_invalid_memory_id_prefix(self):
        """Memory IDs must start with 'mem_'."""
        with pytest.raises(ValidationError) as exc_info:
            DraftMemory(
                memory_id="invalid_id",
                title="Test",
                scope="test",
                summary="Summary",
            )
        assert "must start with 'mem_'" in str(exc_info.value)

    def test_generate_id(self):
        """ID generation should produce valid IDs."""
        memory_id = DraftMemory.generate_id("cyntra", "Memory Hooks Lifecycle", "abcd1234")
        assert memory_id.startswith("mem_cyntra_")
        assert "abcd1234" in memory_id

    def test_markdown_serialization(self):
        """Memory should serialize to Markdown."""
        memory = DraftMemory(
            memory_id="mem_test_topic_a1b2c3d4",
            title="Test: Topic",
            scope="test",
            summary="This is a test summary.",
            technical_details="Some technical details here.",
            tags=["test", "example"],
            citations=[Citation(kind=CitationKind.WEB, url="https://example.com")],
        )
        md = memory.to_markdown()

        assert "---" in md  # Frontmatter delimiter
        assert "memory_id: mem_test_topic_a1b2c3d4" in md
        assert "## Summary" in md
        assert "This is a test summary." in md
        assert "## Technical Details" in md

    def test_markdown_parsing(self):
        """Memory should parse from Markdown."""
        md_content = """---
memory_id: mem_test_topic_a1b2c3d4
title: "Test: Topic"
status: draft
visibility: shared
scope: test
tags: [test, example]
related_issue_ids: []
citations:
  - kind: web
    url: "https://example.com"
---

## Summary

This is a test summary.

## Technical Details

Some technical details.

## Notes

Some notes.
"""
        memory = DraftMemory.from_markdown(md_content)

        assert memory.memory_id == "mem_test_topic_a1b2c3d4"
        assert memory.title == "Test: Topic"
        assert memory.scope == "test"
        assert "test summary" in memory.summary
        assert len(memory.citations) == 1


class TestEvidence:
    """Tests for Evidence model."""

    def test_generate_id(self):
        """Evidence ID generation should be stable."""
        id1 = Evidence.generate_id("run_123", "github.com/test", "abcd1234")
        id2 = Evidence.generate_id("run_123", "github.com/test", "abcd1234")
        assert id1 == id2  # Same inputs = same ID

        id3 = Evidence.generate_id("run_123", "github.com/other", "abcd1234")
        assert id1 != id3  # Different source = different ID

    def test_evidence_metadata(self):
        """Evidence metadata should parse."""
        metadata = EvidenceMetadata(
            evidence_id="evi_run_github_a1b2c3d4",
            source_type="web",
            url="https://github.com/test",
            domain="github.com",
            content_hash="sha256:abcd1234",
            size_bytes=1024,
        )
        assert metadata.domain == "github.com"
        assert metadata.size_bytes == 1024


class TestResearchRun:
    """Tests for ResearchRun model."""

    def test_generate_id(self):
        """Run ID generation should include program and timestamp."""
        run_id = ResearchRun.generate_id("test_program")
        assert run_id.startswith("research_test_program_")
        assert "T" in run_id  # ISO timestamp

    def test_run_with_specific_timestamp(self):
        """Run ID should use provided timestamp."""
        ts = datetime(2025, 1, 29, 10, 0, 0, tzinfo=UTC)
        run_id = ResearchRun.generate_id("test_program", ts)
        assert run_id == "research_test_program_20250129T100000Z"

    def test_duration_calculation(self):
        """Duration should be calculated correctly."""
        run = ResearchRun(
            run_id="test_run",
            program_id="test",
            started_at=datetime(2025, 1, 29, 10, 0, 0, tzinfo=UTC),
            completed_at=datetime(2025, 1, 29, 10, 5, 0, tzinfo=UTC),
            status=RunStatus.COMPLETED,
        )
        assert run.duration_seconds() == 300  # 5 minutes


class TestResearchManifest:
    """Tests for ResearchManifest model."""

    def test_manifest_serialization(self):
        """Manifest should serialize to JSON."""
        from cyntra.research.models import ManifestInputs

        manifest = ResearchManifest(
            run_id="research_test_20250129T100000Z",
            program_id="test",
            started_at=datetime(2025, 1, 29, 10, 0, 0, tzinfo=UTC),
            status=RunStatus.COMPLETED,
            toolchain="claude",
            model="claude-sonnet-4-20250514",
            inputs=ManifestInputs(
                program_hash="sha256:abc123",
                prompts_hash="sha256:def456",
            ),
        )
        json_str = manifest.to_json()

        assert "research_test_20250129T100000Z" in json_str
        assert "claude-sonnet-4-20250514" in json_str

    def test_manifest_roundtrip(self):
        """Manifest should survive JSON roundtrip."""
        from cyntra.research.models import ManifestInputs

        original = ResearchManifest(
            run_id="research_test_20250129T100000Z",
            program_id="test",
            started_at=datetime(2025, 1, 29, 10, 0, 0, tzinfo=UTC),
            status=RunStatus.COMPLETED,
            toolchain="claude",
            model="claude-sonnet-4-20250514",
            inputs=ManifestInputs(
                program_hash="sha256:abc123",
                prompts_hash="sha256:def456",
            ),
        )
        json_str = original.to_json()
        parsed = ResearchManifest.from_json(json_str)

        assert parsed.run_id == original.run_id
        assert parsed.program_id == original.program_id
        assert parsed.status == original.status
