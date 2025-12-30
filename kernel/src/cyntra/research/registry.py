"""
Research Program Registry - Load, validate, and manage research programs.

The registry handles:
- Loading programs from YAML files in knowledge/research/programs/
- Validating program schemas
- Managing program state (schedule, last run, etc.)
- Providing access to global domain allowlists/denylists
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from cyntra.research.models import ResearchProgram, ResearchRun, RunStatus

logger = logging.getLogger(__name__)


# =============================================================================
# Domain Safety Configuration
# =============================================================================


class DomainSafetyConfig(BaseModel):
    """Global domain safety configuration."""

    allowed_domains: list[str] = Field(default_factory=list)
    blocked_domains: list[str] = Field(default_factory=list)

    def is_allowed(self, domain: str) -> bool:
        """Check if a domain is allowed."""
        # Normalize domain
        domain = domain.lower().strip()
        if domain.startswith("www."):
            domain = domain[4:]

        # Check denylist first (explicit blocks)
        for blocked in self.blocked_domains:
            if domain == blocked or domain.endswith(f".{blocked}"):
                return False

        # If allowlist is empty, allow all (except blocked)
        if not self.allowed_domains:
            return True

        # Check allowlist
        for allowed in self.allowed_domains:
            if domain == allowed or domain.endswith(f".{allowed}"):
                return True

        return False

    @classmethod
    def load(cls, domains_dir: Path) -> DomainSafetyConfig:
        """Load domain safety config from directory."""
        config = cls()

        allowlist_path = domains_dir / "allowlist.yaml"
        denylist_path = domains_dir / "denylist.yaml"

        if allowlist_path.exists():
            with open(allowlist_path) as f:
                data = yaml.safe_load(f) or {}
                config.allowed_domains = data.get("allowed_domains", [])

        if denylist_path.exists():
            with open(denylist_path) as f:
                data = yaml.safe_load(f) or {}
                config.blocked_domains = data.get("blocked_domains", [])

        return config


# =============================================================================
# Schedule State
# =============================================================================


class ProgramScheduleState(BaseModel):
    """Schedule state for a single program."""

    program_id: str
    next_run_at: datetime | None = None
    last_run_at: datetime | None = None
    last_run_id: str | None = None
    consecutive_failures: int = 0
    last_error: str | None = None


class ScheduleState(BaseModel):
    """Global schedule state (persisted to .cyntra/research/schedule.json)."""

    programs: dict[str, ProgramScheduleState] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def get_program_state(self, program_id: str) -> ProgramScheduleState:
        """Get or create state for a program."""
        if program_id not in self.programs:
            self.programs[program_id] = ProgramScheduleState(program_id=program_id)
        return self.programs[program_id]

    def save(self, path: Path) -> None:
        """Save state to file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.model_dump(mode="json"), f, indent=2, default=str)

    @classmethod
    def load(cls, path: Path) -> ScheduleState:
        """Load state from file."""
        if not path.exists():
            return cls()
        with open(path) as f:
            data = json.load(f)
        return cls.model_validate(data)


# =============================================================================
# Run Ledger
# =============================================================================


class RunLedger:
    """Append-only ledger of research runs (stored in .cyntra/research/ledger.jsonl)."""

    def __init__(self, ledger_path: Path):
        self.ledger_path = ledger_path

    def append(self, run: ResearchRun) -> None:
        """Append a run record to the ledger."""
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.ledger_path, "a") as f:
            f.write(run.model_dump_json() + "\n")

    def iter_runs(
        self,
        program_id: str | None = None,
        status: RunStatus | None = None,
        limit: int | None = None,
    ):
        """Iterate over runs, optionally filtered."""
        if not self.ledger_path.exists():
            return

        count = 0
        with open(self.ledger_path) as f:
            for line in f:
                if not line.strip():
                    continue
                run = ResearchRun.model_validate_json(line)

                if program_id and run.program_id != program_id:
                    continue
                if status and run.status != status:
                    continue

                yield run
                count += 1

                if limit and count >= limit:
                    break

    def get_last_run(self, program_id: str) -> ResearchRun | None:
        """Get the most recent run for a program."""
        last_run = None
        for run in self.iter_runs(program_id=program_id):
            if last_run is None or run.started_at > last_run.started_at:
                last_run = run
        return last_run


# =============================================================================
# Registry
# =============================================================================


class Registry:
    """
    Research program registry.

    Loads and manages research programs from the knowledge/research/programs/ directory.
    """

    def __init__(
        self,
        repo_root: Path,
        programs_dir: Path | None = None,
        domains_dir: Path | None = None,
        state_dir: Path | None = None,
    ):
        self.repo_root = Path(repo_root)
        self.programs_dir = programs_dir or (self.repo_root / "knowledge" / "research" / "programs")
        self.domains_dir = domains_dir or (self.repo_root / "knowledge" / "research" / "domains")
        self.state_dir = state_dir or (self.repo_root / ".cyntra" / "research")

        self._programs: dict[str, ResearchProgram] = {}
        self._domain_safety: DomainSafetyConfig | None = None
        self._schedule_state: ScheduleState | None = None
        self._ledger: RunLedger | None = None

    @classmethod
    def load(cls, repo_root: Path) -> Registry:
        """Load the registry from the repository root."""
        registry = cls(repo_root)
        registry.reload()
        return registry

    def reload(self) -> None:
        """Reload all programs from disk."""
        self._programs.clear()
        self._domain_safety = None
        self._schedule_state = None

        if not self.programs_dir.exists():
            logger.warning(f"Programs directory does not exist: {self.programs_dir}")
            return

        for yaml_file in self.programs_dir.glob("*.yaml"):
            try:
                program = ResearchProgram.from_yaml_file(yaml_file)
                self._programs[program.program_id] = program
                logger.info(f"Loaded research program: {program.program_id}")
            except Exception as e:
                logger.error(f"Failed to load program from {yaml_file}: {e}")

        logger.info(f"Loaded {len(self._programs)} research programs")

    @property
    def domain_safety(self) -> DomainSafetyConfig:
        """Get domain safety configuration (lazy loaded)."""
        if self._domain_safety is None:
            self._domain_safety = DomainSafetyConfig.load(self.domains_dir)
        return self._domain_safety

    @property
    def schedule_state(self) -> ScheduleState:
        """Get schedule state (lazy loaded)."""
        if self._schedule_state is None:
            self._schedule_state = ScheduleState.load(self.state_dir / "schedule.json")
        return self._schedule_state

    @property
    def ledger(self) -> RunLedger:
        """Get run ledger (lazy loaded)."""
        if self._ledger is None:
            self._ledger = RunLedger(self.state_dir / "ledger.jsonl")
        return self._ledger

    def get_program(self, program_id: str) -> ResearchProgram | None:
        """Get a program by ID."""
        return self._programs.get(program_id)

    def list_programs(self, enabled_only: bool = False) -> list[ResearchProgram]:
        """List all programs."""
        programs = list(self._programs.values())
        if enabled_only:
            programs = [p for p in programs if p.schedule.enabled]
        return sorted(programs, key=lambda p: p.program_id)

    def list_program_ids(self, enabled_only: bool = False) -> list[str]:
        """List all program IDs."""
        return [p.program_id for p in self.list_programs(enabled_only=enabled_only)]

    def validate_program(self, program: ResearchProgram) -> list[str]:
        """
        Validate a program against registry constraints.

        Returns list of validation errors (empty if valid).
        """
        errors: list[str] = []

        # Check dependencies exist
        for dep_id in program.dependencies.get("requires", []):
            if dep_id not in self._programs:
                errors.append(f"Required program '{dep_id}' not found")

        # Check domain safety
        for web_source in program.sources.web:
            combined_allowlist = (
                self.domain_safety.allowed_domains + program.safety.domain_allowlist
            )
            combined_denylist = self.domain_safety.blocked_domains + program.safety.domain_denylist

            # Create combined config for this program
            combined_safety = DomainSafetyConfig(
                allowed_domains=combined_allowlist,
                blocked_domains=combined_denylist,
            )

            if not combined_safety.is_allowed(web_source.domain):
                errors.append(f"Domain '{web_source.domain}' is not allowed")

        return errors

    def is_domain_allowed(self, program: ResearchProgram, domain: str) -> bool:
        """Check if a domain is allowed for a program."""
        # Combine global and program-specific lists
        combined_allowlist = self.domain_safety.allowed_domains + program.safety.domain_allowlist
        combined_denylist = self.domain_safety.blocked_domains + program.safety.domain_denylist

        combined_safety = DomainSafetyConfig(
            allowed_domains=combined_allowlist,
            blocked_domains=combined_denylist,
        )

        return combined_safety.is_allowed(domain)

    def save_schedule_state(self) -> None:
        """Save schedule state to disk."""
        self.schedule_state.save(self.state_dir / "schedule.json")

    def record_run_start(self, run: ResearchRun) -> None:
        """Record the start of a research run."""
        # Update schedule state
        state = self.schedule_state.get_program_state(run.program_id)
        state.last_run_at = run.started_at
        state.last_run_id = run.run_id
        self.save_schedule_state()

        # Append to ledger
        self.ledger.append(run)

    def record_run_complete(self, run: ResearchRun) -> None:
        """Record the completion of a research run."""
        # Update schedule state
        state = self.schedule_state.get_program_state(run.program_id)

        if run.status == RunStatus.COMPLETED:
            state.consecutive_failures = 0
            state.last_error = None
        elif run.status == RunStatus.FAILED:
            state.consecutive_failures += 1
            state.last_error = run.error_message

        self.save_schedule_state()

        # Append final state to ledger
        self.ledger.append(run)

    def get_program_stats(self, program_id: str) -> dict[str, Any]:
        """Get statistics for a program."""
        program = self.get_program(program_id)
        if not program:
            return {}

        state = self.schedule_state.get_program_state(program_id)
        last_run = self.ledger.get_last_run(program_id)

        return {
            "program_id": program_id,
            "name": program.name,
            "enabled": program.schedule.enabled,
            "cadence": program.schedule.cadence,
            "last_run_at": state.last_run_at,
            "last_run_id": state.last_run_id,
            "last_run_status": last_run.status.value if last_run else None,
            "consecutive_failures": state.consecutive_failures,
            "last_error": state.last_error,
        }


# =============================================================================
# Utility Functions
# =============================================================================


def load_prompts(prompts_dir: Path) -> dict[str, str]:
    """Load agent prompts from directory."""
    prompts: dict[str, str] = {}

    if not prompts_dir.exists():
        return prompts

    for md_file in prompts_dir.glob("*.md"):
        agent_name = md_file.stem.replace("_v1", "").replace("_v2", "")
        prompts[agent_name] = md_file.read_text()

    return prompts


def create_run_directory(
    runs_dir: Path,
    run_id: str,
    program: ResearchProgram,
    prompts: dict[str, str],
) -> Path:
    """Create and initialize a run directory."""
    import hashlib

    run_dir = runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectories
    (run_dir / "inputs").mkdir(exist_ok=True)
    (run_dir / "inputs" / "prompts").mkdir(exist_ok=True)
    (run_dir / "inputs" / "context").mkdir(exist_ok=True)
    (run_dir / "evidence" / "raw").mkdir(parents=True, exist_ok=True)
    (run_dir / "evidence" / "normalized").mkdir(parents=True, exist_ok=True)
    (run_dir / "draft_memories").mkdir(exist_ok=True)
    (run_dir / "logs").mkdir(exist_ok=True)

    # Save program snapshot
    program_yaml = program.to_yaml()
    (run_dir / "inputs" / "program.yaml").write_text(program_yaml)

    # Save prompts
    for agent_name, prompt_content in prompts.items():
        (run_dir / "inputs" / "prompts" / f"{agent_name}.md").write_text(prompt_content)

    # Compute hashes
    program_hash = hashlib.sha256(program_yaml.encode()).hexdigest()
    prompts_hash = hashlib.sha256("".join(sorted(prompts.values())).encode()).hexdigest()

    # Write initial manifest
    manifest_data = {
        "run_id": run_id,
        "program_id": program.program_id,
        "inputs": {
            "program_hash": f"sha256:{program_hash}",
            "prompts_hash": f"sha256:{prompts_hash}",
        },
    }

    with open(run_dir / "manifest.json", "w") as f:
        json.dump(manifest_data, f, indent=2)

    return run_dir
