"""
Base class for research agents.

All research agents (Scout, Collector, Synthesizer, Verifier, Librarian)
inherit from BaseResearchAgent and implement the execute() method.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Generic, TypeVar

from cyntra.research.models import ResearchProgram

logger = logging.getLogger(__name__)


@dataclass
class AgentContext:
    """Context passed to research agents."""

    program: ResearchProgram
    run_id: str
    run_dir: Path
    repo_root: Path

    # Agent configuration
    temperature: float = 0.3
    max_tokens: int = 8000
    timeout_seconds: int = 120

    # Prompt template
    prompt_template: str = ""
    prompt_overrides: dict[str, str] = field(default_factory=dict)

    # Prior context
    prior_evidence: list[dict[str, Any]] = field(default_factory=list)
    prior_memories: list[dict[str, Any]] = field(default_factory=list)

    def get_prompt(self, agent_name: str) -> str:
        """Get the prompt for an agent, with overrides applied."""
        if agent_name in self.prompt_overrides and self.prompt_overrides[agent_name]:
            return self.prompt_overrides[agent_name]
        return self.prompt_template


TInput = TypeVar("TInput")
TOutput = TypeVar("TOutput")


@dataclass
class AgentResult(Generic[TOutput]):
    """Result from a research agent execution."""

    success: bool
    output: TOutput | None = None
    error: str | None = None

    # Metrics
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    tokens_used: int = 0
    cost_usd: float = 0.0

    # Logs
    log_path: Path | None = None

    def duration_seconds(self) -> float | None:
        """Calculate execution duration."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()


class BaseResearchAgent(ABC, Generic[TInput, TOutput]):
    """
    Base class for research agents.

    Subclasses must implement:
    - execute(context, input) -> AgentResult[TOutput]
    """

    name: str = "base"

    def __init__(self, context: AgentContext):
        self.context = context
        self.logger = logging.getLogger(f"cyntra.research.agents.{self.name}")

    @abstractmethod
    async def execute(self, input_data: TInput) -> AgentResult[TOutput]:
        """Execute the agent with the given input."""
        raise NotImplementedError

    def log_dir(self) -> Path:
        """Get the log directory for this agent."""
        return self.context.run_dir / "logs"

    def write_log(self, content: str, filename: str | None = None) -> Path:
        """Write a log file for this agent."""
        log_dir = self.log_dir()
        log_dir.mkdir(parents=True, exist_ok=True)

        filename = filename or f"{self.name}.log"
        log_path = log_dir / filename

        with open(log_path, "a") as f:
            f.write(f"[{datetime.now(UTC).isoformat()}] {content}\n")

        return log_path
