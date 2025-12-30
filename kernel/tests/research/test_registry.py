"""
Unit tests for the research registry.

Tests:
- Program loading from YAML
- Domain safety configuration
- Schedule state management
- Run ledger
"""

import json
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from cyntra.research.models import ResearchProgram, ResearchRun, RunStatus, ScheduleConfig
from cyntra.research.registry import (
    DomainSafetyConfig,
    Registry,
    RunLedger,
    ScheduleState,
    create_run_directory,
    load_prompts,
)


class TestDomainSafetyConfig:
    """Tests for DomainSafetyConfig."""

    def test_empty_config_allows_all(self):
        """Empty config should allow all domains."""
        config = DomainSafetyConfig()
        assert config.is_allowed("example.com")
        assert config.is_allowed("any-domain.org")

    def test_allowlist_only(self):
        """With allowlist, only listed domains are allowed."""
        config = DomainSafetyConfig(allowed_domains=["github.com", "docs.python.org"])

        assert config.is_allowed("github.com")
        assert config.is_allowed("docs.python.org")
        assert not config.is_allowed("example.com")

    def test_denylist_takes_precedence(self):
        """Denylist should override allowlist."""
        config = DomainSafetyConfig(
            allowed_domains=["github.com"],
            blocked_domains=["github.com"],
        )
        assert not config.is_allowed("github.com")

    def test_subdomain_matching(self):
        """Subdomains should match parent domain."""
        config = DomainSafetyConfig(allowed_domains=["github.com"])

        assert config.is_allowed("github.com")
        assert config.is_allowed("api.github.com")
        assert config.is_allowed("raw.githubusercontent.com") is False  # Different domain

    def test_www_normalization(self):
        """www prefix should be normalized."""
        config = DomainSafetyConfig(allowed_domains=["example.com"])
        assert config.is_allowed("www.example.com")

    def test_load_from_files(self):
        """Config should load from YAML files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            domains_dir = Path(tmpdir)

            # Create allowlist
            (domains_dir / "allowlist.yaml").write_text(
                """
allowed_domains:
  - github.com
  - docs.anthropic.com
"""
            )

            # Create denylist
            (domains_dir / "denylist.yaml").write_text(
                """
blocked_domains:
  - malware.example.com
"""
            )

            config = DomainSafetyConfig.load(domains_dir)

            assert "github.com" in config.allowed_domains
            assert "docs.anthropic.com" in config.allowed_domains
            assert "malware.example.com" in config.blocked_domains


class TestScheduleState:
    """Tests for ScheduleState."""

    def test_empty_state(self):
        """Empty state should be valid."""
        state = ScheduleState()
        assert len(state.programs) == 0

    def test_get_or_create_program_state(self):
        """get_program_state should create if missing."""
        state = ScheduleState()
        program_state = state.get_program_state("test_program")

        assert program_state.program_id == "test_program"
        assert program_state.consecutive_failures == 0
        assert "test_program" in state.programs

    def test_save_and_load(self):
        """State should persist to disk."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "schedule.json"

            # Create and save state
            state = ScheduleState()
            program_state = state.get_program_state("test_program")
            program_state.consecutive_failures = 3
            program_state.last_error = "Test error"
            state.save(path)

            # Load and verify
            loaded = ScheduleState.load(path)
            loaded_program = loaded.get_program_state("test_program")

            assert loaded_program.consecutive_failures == 3
            assert loaded_program.last_error == "Test error"

    def test_load_missing_file(self):
        """Loading missing file should return empty state."""
        state = ScheduleState.load(Path("/nonexistent/path.json"))
        assert len(state.programs) == 0


class TestRunLedger:
    """Tests for RunLedger."""

    def test_append_and_iter(self):
        """Runs should be appended and iterable."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger = RunLedger(Path(tmpdir) / "ledger.jsonl")

            # Append runs
            run1 = ResearchRun(
                run_id="research_test_20250129T100000Z",
                program_id="test",
                status=RunStatus.COMPLETED,
            )
            run2 = ResearchRun(
                run_id="research_test_20250129T110000Z",
                program_id="test",
                status=RunStatus.FAILED,
            )
            ledger.append(run1)
            ledger.append(run2)

            # Iterate
            runs = list(ledger.iter_runs())
            assert len(runs) == 2

    def test_filter_by_program(self):
        """Runs should be filterable by program."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger = RunLedger(Path(tmpdir) / "ledger.jsonl")

            ledger.append(
                ResearchRun(run_id="run1", program_id="prog_a", status=RunStatus.COMPLETED)
            )
            ledger.append(
                ResearchRun(run_id="run2", program_id="prog_b", status=RunStatus.COMPLETED)
            )
            ledger.append(
                ResearchRun(run_id="run3", program_id="prog_a", status=RunStatus.COMPLETED)
            )

            runs = list(ledger.iter_runs(program_id="prog_a"))
            assert len(runs) == 2
            assert all(r.program_id == "prog_a" for r in runs)

    def test_filter_by_status(self):
        """Runs should be filterable by status."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger = RunLedger(Path(tmpdir) / "ledger.jsonl")

            ledger.append(ResearchRun(run_id="run1", program_id="test", status=RunStatus.COMPLETED))
            ledger.append(ResearchRun(run_id="run2", program_id="test", status=RunStatus.FAILED))

            completed = list(ledger.iter_runs(status=RunStatus.COMPLETED))
            assert len(completed) == 1
            assert completed[0].run_id == "run1"

    def test_get_last_run(self):
        """get_last_run should return most recent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            ledger = RunLedger(Path(tmpdir) / "ledger.jsonl")

            ledger.append(
                ResearchRun(
                    run_id="run1",
                    program_id="test",
                    started_at=datetime(2025, 1, 29, 10, 0, 0, tzinfo=UTC),
                    status=RunStatus.COMPLETED,
                )
            )
            ledger.append(
                ResearchRun(
                    run_id="run2",
                    program_id="test",
                    started_at=datetime(2025, 1, 29, 11, 0, 0, tzinfo=UTC),
                    status=RunStatus.COMPLETED,
                )
            )

            last = ledger.get_last_run("test")
            assert last is not None
            assert last.run_id == "run2"


class TestRegistry:
    """Tests for Registry."""

    @pytest.fixture
    def test_repo(self, tmp_path):
        """Create a test repository structure."""
        # Create directories
        programs_dir = tmp_path / "knowledge" / "research" / "programs"
        domains_dir = tmp_path / "knowledge" / "research" / "domains"
        prompts_dir = tmp_path / "knowledge" / "research" / "prompts"
        state_dir = tmp_path / ".cyntra" / "research"

        programs_dir.mkdir(parents=True)
        domains_dir.mkdir(parents=True)
        prompts_dir.mkdir(parents=True)
        state_dir.mkdir(parents=True)

        # Create a test program
        (programs_dir / "test_program.yaml").write_text(
            """
program_id: test_program
name: Test Program
description: A test program
owner: "@test"
scope: test
schedule:
  cadence: "0 8 * * 1"
  enabled: true
sources:
  web:
    - domain: github.com
      paths: ["/test"]
output:
  type: radar
  target_memories: 5
budgets:
  max_pages: 10
  max_cost_per_run: 0.50
"""
        )

        # Create domain configs
        (domains_dir / "allowlist.yaml").write_text(
            """
allowed_domains:
  - github.com
  - docs.python.org
"""
        )
        (domains_dir / "denylist.yaml").write_text(
            """
blocked_domains:
  - malware.com
"""
        )

        # Create a prompt
        (prompts_dir / "scout_v1.md").write_text("# Scout Prompt\n\nTest prompt content.")

        return tmp_path

    def test_load_registry(self, test_repo):
        """Registry should load programs from disk."""
        registry = Registry.load(test_repo)

        assert len(registry.list_programs()) == 1
        program = registry.get_program("test_program")
        assert program is not None
        assert program.name == "Test Program"

    def test_list_program_ids(self, test_repo):
        """list_program_ids should return program IDs."""
        registry = Registry.load(test_repo)
        ids = registry.list_program_ids()

        assert "test_program" in ids

    def test_domain_safety(self, test_repo):
        """Registry should provide domain safety config."""
        registry = Registry.load(test_repo)

        assert registry.domain_safety.is_allowed("github.com")
        assert not registry.domain_safety.is_allowed("malware.com")

    def test_is_domain_allowed_for_program(self, test_repo):
        """is_domain_allowed should check combined safety."""
        registry = Registry.load(test_repo)
        program = registry.get_program("test_program")

        assert registry.is_domain_allowed(program, "github.com")
        assert not registry.is_domain_allowed(program, "unknown-domain.com")

    def test_validate_program(self, test_repo):
        """validate_program should check constraints."""
        registry = Registry.load(test_repo)
        program = registry.get_program("test_program")

        errors = registry.validate_program(program)
        assert len(errors) == 0  # Valid program

    def test_validate_program_with_invalid_domain(self, test_repo):
        """validate_program should catch invalid domains."""
        registry = Registry.load(test_repo)

        # Create program with invalid domain
        program = ResearchProgram(
            program_id="invalid_domain_program",
            name="Invalid",
            description="Test",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )
        # Add a web source with unknown domain
        from cyntra.research.models import SourceConfig, WebSource

        program.sources = SourceConfig(
            web=[WebSource(domain="unknown-blocked-domain.com", paths=["/"])]
        )

        errors = registry.validate_program(program)
        assert len(errors) > 0
        assert any("not allowed" in e for e in errors)

    def test_record_run_lifecycle(self, test_repo):
        """Registry should track run lifecycle."""
        registry = Registry.load(test_repo)

        run = ResearchRun(
            run_id="research_test_program_20250129T100000Z",
            program_id="test_program",
            status=RunStatus.RUNNING,
        )

        # Record start
        registry.record_run_start(run)
        state = registry.schedule_state.get_program_state("test_program")
        assert state.last_run_id == run.run_id

        # Record completion
        run.status = RunStatus.COMPLETED
        run.completed_at = datetime.now(UTC)
        registry.record_run_complete(run)

        state = registry.schedule_state.get_program_state("test_program")
        assert state.consecutive_failures == 0

    def test_get_program_stats(self, test_repo):
        """get_program_stats should return summary."""
        registry = Registry.load(test_repo)
        stats = registry.get_program_stats("test_program")

        assert stats["program_id"] == "test_program"
        assert stats["name"] == "Test Program"
        assert stats["enabled"] is True


class TestLoadPrompts:
    """Tests for load_prompts utility."""

    def test_load_prompts(self, tmp_path):
        """Prompts should load from directory."""
        prompts_dir = tmp_path / "prompts"
        prompts_dir.mkdir()

        (prompts_dir / "scout_v1.md").write_text("Scout prompt content")
        (prompts_dir / "collector_v1.md").write_text("Collector prompt content")

        prompts = load_prompts(prompts_dir)

        assert "scout" in prompts
        assert "collector" in prompts
        assert prompts["scout"] == "Scout prompt content"

    def test_load_prompts_empty_dir(self, tmp_path):
        """Empty directory should return empty dict."""
        prompts_dir = tmp_path / "prompts"
        prompts_dir.mkdir()

        prompts = load_prompts(prompts_dir)
        assert prompts == {}

    def test_load_prompts_missing_dir(self, tmp_path):
        """Missing directory should return empty dict."""
        prompts = load_prompts(tmp_path / "nonexistent")
        assert prompts == {}


class TestCreateRunDirectory:
    """Tests for create_run_directory utility."""

    def test_create_run_directory(self, tmp_path):
        """Run directory should be created with proper structure."""
        runs_dir = tmp_path / "runs"
        runs_dir.mkdir()

        program = ResearchProgram(
            program_id="test",
            name="Test",
            description="Test program",
            owner="@test",
            scope="test",
            schedule=ScheduleConfig(cadence="0 0 * * *"),
        )

        prompts = {"scout": "Scout prompt", "collector": "Collector prompt"}

        run_dir = create_run_directory(
            runs_dir=runs_dir,
            run_id="research_test_20250129T100000Z",
            program=program,
            prompts=prompts,
        )

        # Check directory structure
        assert run_dir.exists()
        assert (run_dir / "inputs").exists()
        assert (run_dir / "inputs" / "prompts").exists()
        assert (run_dir / "inputs" / "context").exists()
        assert (run_dir / "evidence" / "raw").exists()
        assert (run_dir / "evidence" / "normalized").exists()
        assert (run_dir / "draft_memories").exists()
        assert (run_dir / "logs").exists()

        # Check files
        assert (run_dir / "inputs" / "program.yaml").exists()
        assert (run_dir / "inputs" / "prompts" / "scout.md").exists()
        assert (run_dir / "manifest.json").exists()

        # Check manifest content
        manifest = json.loads((run_dir / "manifest.json").read_text())
        assert manifest["run_id"] == "research_test_20250129T100000Z"
        assert manifest["program_id"] == "test"
        assert "program_hash" in manifest["inputs"]
