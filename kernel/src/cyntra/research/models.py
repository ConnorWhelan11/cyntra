"""
Pydantic models for Cyntra Research System.

Defines the data structures for:
- Research programs (YAML configuration)
- Research runs (execution instances)
- Evidence (collected content)
- Draft memories (synthesized knowledge)
- Verification results (gate outcomes)
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

# =============================================================================
# Enums
# =============================================================================


class RunStatus(str, Enum):
    """Status of a research run."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OutputType(str, Enum):
    """Type of research output."""

    RADAR = "radar"  # Surface-level scan, fewer memories
    DEEP_DIVE = "deep_dive"  # Thorough analysis, more memories


class CitationKind(str, Enum):
    """Type of citation reference."""

    ARTIFACT_CHUNK = "artifact_chunk"
    RUN = "run"
    ISSUE = "issue"
    WEB = "web"


class MemoryStatus(str, Enum):
    """Status of a memory in the knowledge base."""

    DRAFT = "draft"
    REVIEWED = "reviewed"
    CANONICAL = "canonical"


# =============================================================================
# Schedule Configuration
# =============================================================================


class ScheduleConfig(BaseModel):
    """Schedule configuration for a research program."""

    cadence: str = Field(
        ...,
        description="Cron-like expression (minute hour day-of-month month day-of-week)",
        examples=["0 8 * * 1"],  # Every Monday at 8am
    )
    timezone: str = Field(
        default="UTC",
        description="Timezone for display (schedule runs in UTC)",
    )
    enabled: bool = Field(default=True, description="Enable/disable without deleting")
    skip_if_running: bool = Field(
        default=True,
        description="Skip if previous run still processing",
    )
    min_interval_hours: int = Field(
        default=24,
        ge=1,
        description="Minimum hours between runs (override protection)",
    )

    @field_validator("cadence")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        """Basic cron expression validation."""
        parts = v.strip().split()
        if len(parts) != 5:
            raise ValueError(
                f"Cron expression must have 5 parts (minute hour dom month dow), got {len(parts)}"
            )
        return v


# =============================================================================
# Source Configuration
# =============================================================================


class WebSource(BaseModel):
    """A web source to fetch content from."""

    domain: str = Field(..., description="Domain to fetch from")
    paths: list[str] = Field(default_factory=lambda: ["/"], description="URL paths to include")
    search_queries: list[str] = Field(
        default_factory=list,
        description="Search queries to run on this domain",
    )
    crawl_depth: int = Field(default=1, ge=1, le=5, description="How deep to crawl")


class RepoSource(BaseModel):
    """A repository source to index."""

    path: str = Field(..., description="Path to repository (relative or absolute)")
    include_patterns: list[str] = Field(
        default_factory=lambda: ["**/*.md"],
        description="Glob patterns to include",
    )
    exclude_patterns: list[str] = Field(
        default_factory=lambda: ["node_modules/**", ".git/**"],
        description="Glob patterns to exclude",
    )


class SourceConfig(BaseModel):
    """Source configuration for a research program."""

    web: list[WebSource] = Field(default_factory=list, description="Web sources")
    repos: list[RepoSource] = Field(default_factory=list, description="Repository sources")
    apis: list[dict[str, Any]] = Field(default_factory=list, description="API sources")


# =============================================================================
# Query Configuration
# =============================================================================


class QueryConfig(BaseModel):
    """Query configuration for research."""

    templates: list[str] = Field(
        default_factory=list,
        description="Search query templates with {{placeholders}}",
    )
    keywords: list[str] = Field(
        default_factory=list,
        description="Keywords to always include",
    )
    exclude_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords to exclude from results",
    )


# =============================================================================
# Output Configuration
# =============================================================================


class TagConfig(BaseModel):
    """Tag configuration for memories."""

    auto: bool = Field(default=True, description="Auto-generate tags from content")
    required: list[str] = Field(default_factory=list, description="Always add these tags")
    max_tags: int = Field(default=8, ge=1, le=20, description="Maximum tags per memory")


class OutputConfig(BaseModel):
    """Output configuration for a research program."""

    type: OutputType = Field(default=OutputType.RADAR, description="Type of research output")
    target_memories: int = Field(
        default=5,
        ge=1,
        le=50,
        description="Target number of memories per run",
    )
    max_memories: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Maximum memories per run (hard limit)",
    )
    min_confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Minimum confidence to emit memory",
    )
    tags: TagConfig = Field(default_factory=TagConfig, description="Tagging rules")
    granularity: str = Field(
        default="claim",
        description="Memory granularity: claim | topic | document",
    )
    title_template: str = Field(
        default="{{scope}}: {{topic}}",
        description="Template for memory titles",
    )


# =============================================================================
# Budget Configuration
# =============================================================================


class BudgetConfig(BaseModel):
    """Budget configuration for a research program."""

    max_pages: int = Field(default=50, ge=1, le=500, description="Max pages to fetch")
    max_tokens_input: int = Field(
        default=100_000,
        ge=1000,
        description="Max input tokens",
    )
    max_tokens_output: int = Field(
        default=50_000,
        ge=1000,
        description="Max output tokens",
    )
    max_evidence_mb: float = Field(
        default=10.0,
        ge=0.1,
        le=100.0,
        description="Max evidence storage in MB",
    )
    max_cost_per_run: float = Field(
        default=2.0,
        ge=0.01,
        description="Max cost per run in USD",
    )
    max_cost_per_day: float = Field(
        default=5.0,
        ge=0.01,
        description="Max cost per day in USD",
    )
    max_cost_per_week: float = Field(
        default=20.0,
        ge=0.01,
        description="Max cost per week in USD",
    )
    max_duration_minutes: int = Field(
        default=30,
        ge=1,
        le=120,
        description="Max run duration in minutes",
    )


# =============================================================================
# Safety Configuration
# =============================================================================


class SafetyConfig(BaseModel):
    """Safety configuration for a research program."""

    domain_allowlist: list[str] = Field(
        default_factory=list,
        description="Additional allowed domains (adds to global)",
    )
    domain_denylist: list[str] = Field(
        default_factory=list,
        description="Additional denied domains",
    )
    pii_scan: bool = Field(default=True, description="Scan for PII")
    secrets_scan: bool = Field(default=True, description="Scan for API keys, etc.")
    redact_on_detect: bool = Field(
        default=True,
        description="Redact PII/secrets (vs reject entirely)",
    )
    allowed_filetypes: list[str] = Field(
        default_factory=lambda: [".md", ".txt", ".html", ".pdf"],
        description="Allowed file extensions",
    )
    max_file_size_kb: int = Field(
        default=500,
        ge=1,
        le=10000,
        description="Max file size in KB",
    )


# =============================================================================
# Diff Mode Configuration
# =============================================================================


class DiffModeConfig(BaseModel):
    """Diff mode configuration for change detection."""

    enabled: bool = Field(default=True, description="Enable diff mode")
    compare_runs: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Compare against last N runs",
    )
    emit_changes_only: bool = Field(
        default=True,
        description="Only emit memories for new/changed content",
    )
    hash_algorithm: str = Field(default="sha256", description="Content hash algorithm")
    stale_threshold_hours: int = Field(
        default=168,  # 7 days
        ge=1,
        description="Skip if content unchanged for this long",
    )


# =============================================================================
# Agent Configuration
# =============================================================================


class AgentConfig(BaseModel):
    """Agent configuration for a research program."""

    toolchain: str = Field(default="claude", description="Toolchain to use")
    model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model to use for agents",
    )
    scout_temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    collector_temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    synthesizer_temperature: float = Field(default=0.4, ge=0.0, le=1.0)
    verifier_temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    prompt_overrides: dict[str, str | None] = Field(
        default_factory=dict,
        description="Custom prompt overrides per agent",
    )


# =============================================================================
# Research Program
# =============================================================================


class ResearchProgram(BaseModel):
    """
    A research program definition.

    Loaded from YAML files in knowledge/research/programs/.
    """

    # Required fields
    program_id: str = Field(..., description="Unique program identifier")
    name: str = Field(..., description="Human-readable name")
    description: str = Field(..., description="Brief description")
    owner: str = Field(..., description="Program owner (GitHub handle or email)")
    scope: str = Field(..., description="Scope for memories (matches memory scope field)")

    # Configuration sections
    schedule: ScheduleConfig = Field(..., description="Schedule configuration")
    sources: SourceConfig = Field(default_factory=SourceConfig, description="Source configuration")
    queries: QueryConfig = Field(default_factory=QueryConfig, description="Query configuration")
    output: OutputConfig = Field(default_factory=OutputConfig, description="Output configuration")
    budgets: BudgetConfig = Field(default_factory=BudgetConfig, description="Budget configuration")
    safety: SafetyConfig = Field(default_factory=SafetyConfig, description="Safety configuration")
    diff_mode: DiffModeConfig = Field(
        default_factory=DiffModeConfig,
        description="Diff mode configuration",
    )
    agents: AgentConfig = Field(default_factory=AgentConfig, description="Agent configuration")

    # Dependencies
    dependencies: dict[str, list[str]] = Field(
        default_factory=lambda: {"requires": [], "notifies": []},
        description="Program dependencies",
    )

    @field_validator("program_id")
    @classmethod
    def validate_program_id(cls, v: str) -> str:
        """Validate program ID format."""
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            raise ValueError(
                f"program_id must be lowercase alphanumeric with underscores, got '{v}'"
            )
        return v

    @field_validator("owner")
    @classmethod
    def validate_owner(cls, v: str) -> str:
        """Validate owner format (GitHub handle or email)."""
        if not (v.startswith("@") or "@" in v):
            raise ValueError(f"owner must be GitHub handle (@user) or email, got '{v}'")
        return v

    @model_validator(mode="after")
    def validate_output_limits(self) -> ResearchProgram:
        """Ensure target_memories <= max_memories."""
        if self.output.target_memories > self.output.max_memories:
            raise ValueError(
                f"target_memories ({self.output.target_memories}) cannot exceed "
                f"max_memories ({self.output.max_memories})"
            )
        return self

    @classmethod
    def from_yaml_file(cls, path: Path) -> ResearchProgram:
        """Load a research program from a YAML file."""
        import yaml

        with open(path) as f:
            data = yaml.safe_load(f)
        return cls.model_validate(data)

    def to_yaml(self) -> str:
        """Serialize to YAML string."""
        import yaml

        return yaml.dump(self.model_dump(exclude_none=True), sort_keys=False)


# =============================================================================
# Evidence Models
# =============================================================================


class EvidenceMetadata(BaseModel):
    """Metadata for a piece of evidence."""

    evidence_id: str = Field(..., description="Unique evidence ID")
    source_type: str = Field(..., description="Source type: web | repo | api")
    url: str | None = Field(default=None, description="Source URL")
    domain: str | None = Field(default=None, description="Source domain")
    path: str | None = Field(default=None, description="Source path")

    # Fetch info
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status_code: int | None = Field(default=None, description="HTTP status code")
    content_type: str | None = Field(default=None, description="Content type")

    # Content info
    raw_file: str | None = Field(default=None, description="Raw file path (relative)")
    normalized_file: str | None = Field(default=None, description="Normalized file path")
    content_hash: str | None = Field(default=None, description="Content hash (sha256)")
    size_bytes: int = Field(default=0, ge=0, description="Content size in bytes")

    # Extraction info
    title: str | None = Field(default=None, description="Extracted title")
    excerpt: str | None = Field(default=None, description="Content excerpt")

    # Quality signals
    is_primary_content: bool = Field(default=True, description="Is primary content")
    noise_ratio: float = Field(default=0.0, ge=0.0, le=1.0, description="Noise ratio")
    language: str = Field(default="en", description="Content language")
    freshness_days: int | None = Field(default=None, description="Days since last update")


class Evidence(BaseModel):
    """A collected piece of evidence."""

    evidence_id: str
    run_id: str
    metadata: EvidenceMetadata
    raw_content: str | None = None
    normalized_content: str | None = None

    @classmethod
    def generate_id(cls, run_id: str, source: str, content_hash: str) -> str:
        """Generate a stable evidence ID."""
        hash_input = f"{run_id}:{source}:{content_hash}"
        short_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:8]
        # Extract domain from source for readability
        domain_part = source.split("/")[0].replace(".", "_") if "/" in source else source[:20]
        return f"evi_{run_id}_{domain_part}_{short_hash}"


# =============================================================================
# Citation Model
# =============================================================================


class Citation(BaseModel):
    """A citation reference in a memory."""

    kind: CitationKind = Field(..., description="Type of citation")
    repo_path: str | None = Field(default=None, description="Path in repository")
    run_id: str | None = Field(default=None, description="Research run ID")
    issue_id: str | None = Field(default=None, description="Issue ID")
    chunk_id: str | None = Field(default=None, description="Evidence chunk ID")
    excerpt_hash: str | None = Field(default=None, description="Hash of cited excerpt")
    url: str | None = Field(default=None, description="Source URL (for web citations)")

    @model_validator(mode="after")
    def validate_citation_fields(self) -> Citation:
        """Ensure required fields based on citation kind."""
        if self.kind == CitationKind.ARTIFACT_CHUNK and not self.repo_path:
            raise ValueError("artifact_chunk citation requires repo_path")
        if self.kind == CitationKind.RUN and not self.run_id:
            raise ValueError("run citation requires run_id")
        if self.kind == CitationKind.ISSUE and not self.issue_id:
            raise ValueError("issue citation requires issue_id")
        if self.kind == CitationKind.WEB and not self.url:
            raise ValueError("web citation requires url")
        return self


# =============================================================================
# Draft Memory Model
# =============================================================================


class DraftMemory(BaseModel):
    """A draft memory synthesized from evidence."""

    memory_id: str = Field(..., description="Unique memory ID")
    title: str = Field(..., description="Memory title")
    status: MemoryStatus = Field(default=MemoryStatus.DRAFT, description="Memory status")
    visibility: str = Field(default="shared", description="shared | private")
    scope: str = Field(..., description="Memory scope")
    tags: list[str] = Field(default_factory=list, description="Memory tags")
    related_issue_ids: list[str] = Field(default_factory=list, description="Related issues")
    citations: list[Citation] = Field(default_factory=list, description="Citations")

    # Content
    summary: str = Field(..., description="Summary paragraph")
    technical_details: str = Field(default="", description="Technical details section")
    notes: str = Field(default="", description="Optional notes section")

    # Metadata
    confidence: float = Field(default=0.8, ge=0.0, le=1.0, description="Confidence score")
    run_id: str | None = Field(default=None, description="Source research run")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("memory_id")
    @classmethod
    def validate_memory_id(cls, v: str) -> str:
        """Validate memory ID starts with 'mem_'."""
        if not v.startswith("mem_"):
            raise ValueError(f"memory_id must start with 'mem_', got '{v}'")
        return v

    @classmethod
    def generate_id(cls, scope: str, topic: str, content_hash: str) -> str:
        """Generate a stable memory ID."""
        # Normalize topic to slug
        topic_slug = re.sub(r"[^a-z0-9]+", "_", topic.lower())[:30].strip("_")
        short_hash = content_hash[:8]
        return f"mem_{scope}_{topic_slug}_{short_hash}"

    def to_markdown(self) -> str:
        """Serialize to Markdown with YAML frontmatter."""
        import yaml

        frontmatter = {
            "memory_id": self.memory_id,
            "title": self.title,
            "status": self.status.value,
            "visibility": self.visibility,
            "scope": self.scope,
            "tags": self.tags,
            "related_issue_ids": self.related_issue_ids,
            "citations": [c.model_dump(exclude_none=True) for c in self.citations],
        }

        content_parts = [
            "---",
            yaml.dump(frontmatter, sort_keys=False).strip(),
            "---",
            "",
            "## Summary",
            "",
            self.summary,
            "",
        ]

        if self.technical_details:
            content_parts.extend(
                [
                    "## Technical Details",
                    "",
                    self.technical_details,
                    "",
                ]
            )

        if self.notes:
            content_parts.extend(
                [
                    "## Notes",
                    "",
                    self.notes,
                    "",
                ]
            )

        return "\n".join(content_parts)

    @classmethod
    def from_markdown(cls, content: str, run_id: str | None = None) -> DraftMemory:
        """Parse from Markdown with YAML frontmatter."""
        import yaml

        # Split frontmatter and content
        if not content.startswith("---"):
            raise ValueError("Memory file must start with YAML frontmatter (---)")

        parts = content.split("---", 2)
        if len(parts) < 3:
            raise ValueError("Invalid frontmatter format")

        frontmatter = yaml.safe_load(parts[1])
        body = parts[2].strip()

        # Parse body sections
        sections = {"summary": "", "technical_details": "", "notes": ""}
        current_section = None

        for line in body.split("\n"):
            if line.startswith("## Summary"):
                current_section = "summary"
            elif line.startswith("## Technical Details"):
                current_section = "technical_details"
            elif line.startswith("## Notes"):
                current_section = "notes"
            elif current_section:
                sections[current_section] += line + "\n"

        # Parse citations
        citations = []
        for c in frontmatter.get("citations", []):
            citations.append(Citation.model_validate(c))

        return cls(
            memory_id=frontmatter["memory_id"],
            title=frontmatter["title"],
            status=MemoryStatus(frontmatter.get("status", "draft")),
            visibility=frontmatter.get("visibility", "shared"),
            scope=frontmatter["scope"],
            tags=frontmatter.get("tags", []),
            related_issue_ids=frontmatter.get("related_issue_ids", []),
            citations=citations,
            summary=sections["summary"].strip(),
            technical_details=sections["technical_details"].strip(),
            notes=sections["notes"].strip(),
            run_id=run_id,
        )


# =============================================================================
# Verification Result
# =============================================================================


class GateResult(BaseModel):
    """Result of a single gate check."""

    gate_name: str
    passed: bool
    issues: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class VerificationResult(BaseModel):
    """Result of verifying a draft memory."""

    memory_id: str
    passed: bool
    gates: list[GateResult] = Field(default_factory=list)
    citation_coverage: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Fraction of claims with valid citations",
    )
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


# =============================================================================
# Research Run
# =============================================================================


class BudgetConsumed(BaseModel):
    """Budget consumed during a research run."""

    pages: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    evidence_mb: float = 0.0
    cost_usd: float = 0.0
    duration_minutes: float = 0.0


class ResearchRun(BaseModel):
    """A single execution of a research program."""

    run_id: str = Field(..., description="Unique run ID")
    program_id: str = Field(..., description="Source program ID")
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = Field(default=None)
    status: RunStatus = Field(default=RunStatus.PENDING)

    # Execution info
    toolchain: str = Field(default="claude")
    model: str = Field(default="claude-sonnet-4-20250514")

    # Artifacts
    run_dir: Path | None = Field(default=None, description="Run artifacts directory")
    manifest_path: Path | None = Field(default=None, description="Manifest file path")

    # Metrics
    sources_queried: int = 0
    pages_fetched: int = 0
    pages_failed: int = 0
    memories_drafted: int = 0
    memories_verified: int = 0
    memories_rejected: int = 0

    # Budget tracking
    budget_consumed: BudgetConsumed = Field(default_factory=BudgetConsumed)

    # Error handling
    error_message: str | None = Field(default=None)
    retry_count: int = 0

    @classmethod
    def generate_id(cls, program_id: str, timestamp: datetime | None = None) -> str:
        """Generate a unique run ID."""
        ts = timestamp or datetime.now(UTC)
        ts_str = ts.strftime("%Y%m%dT%H%M%SZ")
        return f"research_{program_id}_{ts_str}"

    def duration_seconds(self) -> float | None:
        """Calculate run duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()


# =============================================================================
# Manifest Model
# =============================================================================


class ManifestInputs(BaseModel):
    """Manifest inputs section."""

    program_hash: str
    prompts_hash: str
    context_hash: str | None = None


class ManifestEvidence(BaseModel):
    """Manifest evidence section."""

    sources_queried: int = 0
    pages_fetched: int = 0
    pages_normalized: int = 0
    pages_failed: int = 0
    total_bytes: int = 0
    items: list[EvidenceMetadata] = Field(default_factory=list)


class ManifestMemory(BaseModel):
    """Manifest memory entry."""

    memory_id: str
    title: str
    status: str
    draft_path: str
    target_path: str
    content_hash: str
    citation_count: int
    citation_coverage: float
    confidence: float


class ManifestMemories(BaseModel):
    """Manifest memories section."""

    drafted: int = 0
    verified: int = 0
    rejected: int = 0
    items: list[ManifestMemory] = Field(default_factory=list)


class ManifestVerification(BaseModel):
    """Manifest verification section."""

    passed: bool
    gates: dict[str, bool] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)


class ResearchManifest(BaseModel):
    """Complete manifest for a research run."""

    schema_version: str = Field(default="cyntra://schemas/research_manifest_v1")
    version: str = Field(default="1.0")

    # Run info
    run_id: str
    program_id: str
    started_at: datetime
    completed_at: datetime | None = None
    duration_seconds: float | None = None
    status: RunStatus
    toolchain: str
    model: str

    # Sections
    inputs: ManifestInputs
    evidence: ManifestEvidence = Field(default_factory=ManifestEvidence)
    memories: ManifestMemories = Field(default_factory=ManifestMemories)
    verification: ManifestVerification = Field(
        default_factory=lambda: ManifestVerification(passed=False)
    )
    budget_consumed: BudgetConsumed = Field(default_factory=BudgetConsumed)

    def to_json(self) -> str:
        """Serialize to JSON string."""
        import json

        return json.dumps(self.model_dump(mode="json"), indent=2, default=str)

    @classmethod
    def from_json(cls, json_str: str) -> ResearchManifest:
        """Parse from JSON string."""
        import json

        data = json.loads(json_str)
        return cls.model_validate(data)
