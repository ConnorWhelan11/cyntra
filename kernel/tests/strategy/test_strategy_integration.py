"""Tests for strategy integration with kernel lifecycle."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from cyntra.dynamics.transition_db import TransitionDB
from cyntra.kernel.strategy_integration import StrategyIntegration


class MockIssue:
    """Mock Issue for testing."""

    def __init__(
        self,
        id: str = "issue-123",
        tags: list[str] | None = None,
    ):
        self.id = id
        self.tags = tags or []


class MockProof:
    """Mock PatchProof for testing."""

    def __init__(
        self,
        commands_executed: list[dict] | None = None,
        metadata: dict | None = None,
    ):
        self.commands_executed = commands_executed
        self.metadata = metadata or {}


@pytest.fixture
def temp_db():
    """Create a temporary TransitionDB."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    db = TransitionDB(db_path)
    yield db
    db.conn.close()
    db_path.unlink(missing_ok=True)


@pytest.fixture
def temp_workcell():
    """Create a temporary workcell directory."""
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def integration(temp_db):
    """Create a StrategyIntegration instance."""
    return StrategyIntegration(temp_db)


class TestStrategyIntegration:
    """Tests for StrategyIntegration class."""

    def test_init(self, temp_db):
        """Test initialization."""
        integration = StrategyIntegration(temp_db)
        assert integration.transition_db is temp_db

    def test_extract_from_self_report(self, integration, temp_workcell):
        """Test extraction from agent response with strategy block."""
        # Create telemetry with strategy block
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {
                "type": "response_complete",
                "content": """
                I've fixed the bug.

                <strategy>
                top_down, local, deductive, linear, continuous, proactive,
                detailed_plan, targeted_tools, preventive, heavy_context,
                minimal_surgical, gate_driven
                </strategy>
                """,
            }
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        issue = MockIssue()
        proof = MockProof(metadata={"model": "claude-opus"})

        profile_id = integration.extract_and_store(
            workcell_id="wc-001",
            workcell_path=temp_workcell,
            issue=issue,
            proof=proof,
            toolchain="claude",
            outcome="success",
        )

        assert profile_id is not None

        # Verify stored in DB
        profiles = integration.transition_db.get_profiles(workcell_id="wc-001")
        assert len(profiles) == 1
        assert profiles[0]["outcome"] == "success"
        assert profiles[0]["toolchain"] == "claude"
        assert profiles[0]["extraction_method"] == "self_report"

    def test_extract_from_tool_usage(self, integration, temp_workcell):
        """Test extraction from tool usage patterns."""
        # Create telemetry with tool calls (no strategy block)
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "file_read", "path": "file1.py"},
            {"type": "file_read", "path": "file2.py"},
            {"type": "tool_call", "tool": "Grep", "args": {"pattern": "TODO"}},
            {"type": "file_read", "path": "file3.py"},
            {"type": "file_write", "path": "fix.py"},
            {"type": "response_complete", "content": "Done with the fix."},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        issue = MockIssue()
        proof = MockProof()

        profile_id = integration.extract_and_store(
            workcell_id="wc-002",
            workcell_path=temp_workcell,
            issue=issue,
            proof=proof,
            toolchain="codex",
            outcome="success",
        )

        assert profile_id is not None

        # Verify heuristic extraction
        profiles = integration.transition_db.get_profiles(workcell_id="wc-002")
        assert len(profiles) == 1
        assert profiles[0]["extraction_method"] == "heuristic"
        assert profiles[0]["toolchain"] == "codex"

    def test_extract_with_proof_commands(self, integration, temp_workcell):
        """Test extraction using proof.commands_executed."""
        # Empty telemetry
        telemetry_path = temp_workcell / "telemetry.jsonl"
        telemetry_path.touch()

        issue = MockIssue()
        proof = MockProof(
            commands_executed=[
                {"tool": "Read", "content": "file1.py"},
                {"tool": "Read", "content": "file2.py"},
                {"tool": "Read", "content": "file3.py"},
                {"tool": "Read", "content": "file4.py"},
                {"tool": "Edit", "new_string": "fix"},
            ]
        )

        profile_id = integration.extract_and_store(
            workcell_id="wc-003",
            workcell_path=temp_workcell,
            issue=issue,
            proof=proof,
            toolchain="claude",
            outcome="success",
        )

        assert profile_id is not None

        profiles = integration.transition_db.get_profiles(workcell_id="wc-003")
        assert len(profiles) == 1
        # Should detect heavy_context from high read ratio
        assert profiles[0]["extraction_method"] == "heuristic"

    def test_extract_failed_outcome(self, integration, temp_workcell):
        """Test extraction with failed outcome."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "response_complete", "content": "<strategy>bottom_up, global</strategy>"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        issue = MockIssue()
        proof = MockProof()

        profile_id = integration.extract_and_store(
            workcell_id="wc-004",
            workcell_path=temp_workcell,
            issue=issue,
            proof=proof,
            toolchain="claude",
            outcome="failed",
        )

        assert profile_id is not None

        profiles = integration.transition_db.get_profiles(outcome="failed")
        assert len(profiles) == 1
        assert profiles[0]["outcome"] == "failed"

    def test_no_extraction_possible(self, integration, temp_workcell):
        """Test when no extraction is possible."""
        # Empty workcell - no telemetry
        issue = MockIssue()
        proof = None

        profile_id = integration.extract_and_store(
            workcell_id="wc-005",
            workcell_path=temp_workcell,
            issue=issue,
            proof=proof,
            toolchain="claude",
            outcome="failed",
        )

        # Should return None when no extraction possible
        assert profile_id is None

    def test_model_from_proof_metadata(self, integration, temp_workcell):
        """Test that model is extracted from proof metadata."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "response_complete", "content": "<strategy>top_down, local</strategy>"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        issue = MockIssue()
        proof = MockProof(metadata={"model": "gpt-5.2-turbo"})

        profile_id = integration.extract_and_store(
            workcell_id="wc-006",
            workcell_path=temp_workcell,
            issue=issue,
            proof=proof,
            toolchain="codex",
            outcome="success",
        )

        profiles = integration.transition_db.get_profiles(workcell_id="wc-006")
        assert len(profiles) == 1
        assert profiles[0]["model"] == "gpt-5.2-turbo"


class TestResponseTextExtraction:
    """Tests for response text extraction from telemetry."""

    def test_single_response(self, integration, temp_workcell):
        """Test extraction of single response."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "response_complete", "content": "Hello world"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        text = integration._get_response_text(temp_workcell)
        assert text == "Hello world"

    def test_multiple_responses(self, integration, temp_workcell):
        """Test extraction of multiple responses."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "response_complete", "content": "First response"},
            {"type": "tool_call", "tool": "Read"},
            {"type": "response_complete", "content": "Second response"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        text = integration._get_response_text(temp_workcell)
        assert "First response" in text
        assert "Second response" in text

    def test_no_telemetry_file(self, integration, temp_workcell):
        """Test when telemetry file doesn't exist."""
        text = integration._get_response_text(temp_workcell)
        assert text is None

    def test_empty_telemetry(self, integration, temp_workcell):
        """Test when telemetry has no response events."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "tool_call", "tool": "Read"},
            {"type": "tool_result", "tool": "Read", "result": "..."},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        text = integration._get_response_text(temp_workcell)
        assert text is None


class TestCommandExtraction:
    """Tests for command extraction from telemetry."""

    def test_extract_tool_calls(self, integration, temp_workcell):
        """Test extraction of tool_call events."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "tool_call", "tool": "Read", "args": {"path": "file.py"}},
            {"type": "tool_call", "tool": "Grep", "args": {"pattern": "TODO"}},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        commands = integration._get_commands(temp_workcell, None)
        assert len(commands) == 2
        assert commands[0]["tool"] == "Read"
        assert commands[1]["tool"] == "Grep"

    def test_extract_file_events(self, integration, temp_workcell):
        """Test extraction of file_read and file_write events."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "file_read", "path": "input.py"},
            {"type": "file_write", "path": "output.py"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        commands = integration._get_commands(temp_workcell, None)
        assert len(commands) == 2
        assert commands[0]["tool"] == "Read"
        assert commands[1]["tool"] == "Write"

    def test_extract_bash_commands(self, integration, temp_workcell):
        """Test extraction of bash_command events."""
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "bash_command", "command": "npm test"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        commands = integration._get_commands(temp_workcell, None)
        assert len(commands) == 1
        assert commands[0]["tool"] == "Bash"
        assert commands[0]["content"] == "npm test"

    def test_prefer_proof_commands(self, integration, temp_workcell):
        """Test that proof.commands_executed is preferred over telemetry."""
        # Create telemetry with different commands
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "tool_call", "tool": "Read", "args": {}},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        # Proof has different commands
        proof = MockProof(commands_executed=[
            {"tool": "Write", "content": "file.py"},
        ])

        commands = integration._get_commands(temp_workcell, proof)
        assert len(commands) == 1
        assert commands[0]["tool"] == "Write"


class TestToolClassification:
    """Tests for tool classification."""

    def test_classify_read_tools(self, integration):
        """Test classification of read tools."""
        assert integration._classify_tool("Read") == "read"
        assert integration._classify_tool("cat") == "read"
        assert integration._classify_tool("FileRead") == "read"

    def test_classify_write_tools(self, integration):
        """Test classification of write tools."""
        assert integration._classify_tool("Write") == "write"
        assert integration._classify_tool("Edit") == "write"
        assert integration._classify_tool("FileEdit") == "write"

    def test_classify_search_tools(self, integration):
        """Test classification of search tools."""
        assert integration._classify_tool("Grep") == "search"
        assert integration._classify_tool("Search") == "search"
        assert integration._classify_tool("Glob") == "search"

    def test_classify_bash(self, integration):
        """Test classification of bash."""
        assert integration._classify_tool("Bash") == "bash"
        assert integration._classify_tool("bash") == "bash"

    def test_classify_other(self, integration):
        """Test classification of unknown tools."""
        assert integration._classify_tool("Unknown") == "other"
        assert integration._classify_tool("CustomTool") == "other"


class TestOptimalStrategy:
    """Tests for optimal strategy recommendations."""

    def test_get_optimal_strategy(self, integration, temp_workcell):
        """Test getting optimal strategy after storing profiles."""
        # Store some successful profiles
        for i in range(5):
            wc_path = temp_workcell / f"wc-{i}"
            wc_path.mkdir(exist_ok=True)
            telem = wc_path / "telemetry.jsonl"
            events = [
                {"type": "response_complete", "content": "<strategy>top_down, local</strategy>"},
            ]
            with open(telem, "w") as f:
                for event in events:
                    f.write(json.dumps(event) + "\n")

            issue = MockIssue(id=f"issue-{i}", tags=["bugfix"])
            integration.extract_and_store(
                workcell_id=f"wc-{i}",
                workcell_path=wc_path,
                issue=issue,
                proof=MockProof(),
                toolchain="claude",
                outcome="success",
            )

        # Query for optimal strategy
        optimal = integration.get_optimal_strategy(
            toolchain="claude",
            outcome="success",
        )

        # Should recommend patterns that led to success
        assert "analytical_perspective" in optimal
        assert optimal["analytical_perspective"] == "top_down"

    def test_profile_count(self, integration, temp_workcell):
        """Test profile counting."""
        assert integration.profile_count() == 0

        # Add a profile
        telemetry_path = temp_workcell / "telemetry.jsonl"
        events = [
            {"type": "response_complete", "content": "<strategy>top_down</strategy>"},
        ]
        with open(telemetry_path, "w") as f:
            for event in events:
                f.write(json.dumps(event) + "\n")

        integration.extract_and_store(
            workcell_id="wc-001",
            workcell_path=temp_workcell,
            issue=MockIssue(),
            proof=MockProof(),
            toolchain="claude",
            outcome="success",
        )

        assert integration.profile_count() == 1


class TestDimensionDistribution:
    """Tests for dimension distribution analysis."""

    def test_get_dimension_distribution(self, integration, temp_workcell):
        """Test getting dimension distribution."""
        # Store profiles with different patterns
        for i, pattern in enumerate(["top_down", "top_down", "bottom_up"]):
            wc_path = temp_workcell / f"wc-{i}"
            wc_path.mkdir(exist_ok=True)
            telem = wc_path / "telemetry.jsonl"
            events = [
                {"type": "response_complete", "content": f"<strategy>{pattern}</strategy>"},
            ]
            with open(telem, "w") as f:
                for event in events:
                    f.write(json.dumps(event) + "\n")

            integration.extract_and_store(
                workcell_id=f"wc-{i}",
                workcell_path=wc_path,
                issue=MockIssue(id=f"issue-{i}"),
                proof=MockProof(),
                toolchain="claude",
                outcome="success",
            )

        dist = integration.get_dimension_distribution("analytical_perspective")

        assert dist.get("top_down", 0) == 2
        assert dist.get("bottom_up", 0) == 1
