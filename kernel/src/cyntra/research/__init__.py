"""
Cyntra Research System - Scheduled agents that build the knowledge base.

This module provides:
- ResearchProgram: Definition of a research program (loaded from YAML)
- ResearchRun: A single execution of a research program
- Registry: Program loading, validation, and scheduling
- Agents: Scout, Collector, Synthesizer, Verifier, Librarian
- Gates: Schema validation, citation checking, dedup, safety

Usage:
    from cyntra.research import ResearchProgram, Registry

    registry = Registry.load(repo_root)
    program = registry.get_program("cyntra_docs_radar")
    run = await runner.execute(program)
"""

from cyntra.research.models import (
    Citation,
    CitationKind,
    DraftMemory,
    Evidence,
    EvidenceMetadata,
    OutputConfig,
    OutputType,
    ResearchProgram,
    ResearchRun,
    RunStatus,
    SafetyConfig,
    ScheduleConfig,
    SourceConfig,
    VerificationResult,
    WebSource,
)
from cyntra.research.registry import Registry
from cyntra.research.runner import (
    ResearchRunner,
    RunnerConfig,
    RunResult,
    run_research_program,
)
from cyntra.research.scheduler import (
    BudgetTracker,
    CronExpression,
    PriorityRanker,
    RankedProgram,
    ScheduleDecision,
    Scheduler,
)

__all__ = [
    # Core models
    "ResearchProgram",
    "ResearchRun",
    "RunStatus",
    # Config models
    "ScheduleConfig",
    "SourceConfig",
    "WebSource",
    "OutputConfig",
    "OutputType",
    "SafetyConfig",
    # Evidence and memory models
    "Evidence",
    "EvidenceMetadata",
    "DraftMemory",
    "Citation",
    "CitationKind",
    "VerificationResult",
    # Registry
    "Registry",
    # Scheduler
    "Scheduler",
    "ScheduleDecision",
    "CronExpression",
    "BudgetTracker",
    "PriorityRanker",
    "RankedProgram",
    # Runner
    "ResearchRunner",
    "RunnerConfig",
    "RunResult",
    "run_research_program",
]
