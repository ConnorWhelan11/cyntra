"""Tests for memory lifecycle hooks."""

import tempfile
from pathlib import Path

import pytest


class TestMemoryHooksInit:
    """Tests for MemoryHooks initialization."""

    def test_init_defaults(self):
        """Test initialization with defaults."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)

            assert hooks.max_context_observations == 50
            assert hooks.max_context_tokens == 2000
            assert hooks._session_id is None

            hooks.close()

    def test_init_custom_params(self):
        """Test initialization with custom parameters."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(
                db_path=db_path,
                max_context_observations=100,
                max_context_tokens=5000,
            )

            assert hooks.max_context_observations == 100
            assert hooks.max_context_tokens == 5000

            hooks.close()


class TestWorkcellStart:
    """Tests for workcell_start hook."""

    @pytest.fixture
    def hooks(self):
        """Create hooks instance."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)
            yield hooks
            hooks.close()

    def test_workcell_start_creates_session(self, hooks):
        """Test that workcell_start creates session."""
        hooks.workcell_start(
            workcell_id="wc-42",
            issue_id="42",
            domain="code",
            toolchain="claude",
        )

        assert hooks._session_id is not None
        assert hooks._workcell_id == "wc-42"
        assert hooks._domain == "code"

    def test_workcell_start_returns_context(self, hooks):
        """Test that workcell_start returns injection context."""
        context = hooks.workcell_start(
            workcell_id="wc-ctx",
            domain="api",
        )

        assert "memory_available" in context
        assert context["memory_available"] is True
        assert "patterns" in context
        assert "warnings" in context
        assert "observation_index" in context

    def test_workcell_start_clears_observations(self, hooks):
        """Test that workcell_start clears previous observations."""
        # Start first session and add observation
        hooks.workcell_start(workcell_id="wc-1")
        hooks.tool_use(tool_name="Edit", tool_args={"file": "test.py"}, result="OK")

        assert len(hooks._observations) == 1

        # Start new session
        hooks.workcell_start(workcell_id="wc-2")

        assert len(hooks._observations) == 0


class TestToolUse:
    """Tests for tool_use hook."""

    @pytest.fixture
    def hooks(self):
        """Create hooks with active session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)
            hooks.workcell_start(workcell_id="wc-tool", domain="code")
            yield hooks
            hooks.close()

    def test_tool_use_captures_observation(self, hooks):
        """Test that tool_use captures observation."""
        hooks.tool_use(
            tool_name="Edit",
            tool_args={"file": "main.py"},
            result="File edited successfully",
            file_refs=["main.py"],
        )

        assert len(hooks._observations) == 1
        obs = hooks._observations[0]
        assert obs.tool_name == "Edit"

    def test_tool_use_skips_pure_reads(self, hooks):
        """Test that pure reads without file_refs are skipped."""
        hooks.tool_use(
            tool_name="Read",
            tool_args={"file": "test.py"},
            result="File contents...",
            file_refs=None,  # No file refs
        )

        assert len(hooks._observations) == 0

    def test_tool_use_without_session(self):
        """Test tool_use without active session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)

            # Should not raise, just log warning
            hooks.tool_use(
                tool_name="Edit",
                tool_args={},
                result="test",
            )

            assert len(hooks._observations) == 0
            hooks.close()


class TestGateResult:
    """Tests for gate_result hook."""

    @pytest.fixture
    def hooks(self):
        """Create hooks with active session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)
            hooks.workcell_start(workcell_id="wc-gate")
            yield hooks
            hooks.close()

    def test_gate_result_pass(self, hooks):
        """Test capturing passing gate result."""
        hooks.gate_result(
            gate_name="pytest",
            passed=True,
            score=1.0,
        )

        assert len(hooks._observations) == 1
        obs = hooks._observations[0]
        assert obs.gate_name == "pytest"
        assert obs.outcome == "pass"

    def test_gate_result_fail(self, hooks):
        """Test capturing failing gate result."""
        hooks.gate_result(
            gate_name="mypy",
            passed=False,
            fail_codes=["TYPE_ERROR", "MISSING_RETURN"],
        )

        assert len(hooks._observations) == 1
        obs = hooks._observations[0]
        assert obs.outcome == "fail"
        assert "TYPE_ERROR" in obs.fail_codes

    def test_gate_result_with_details(self, hooks):
        """Test gate result with score."""
        hooks.gate_result(
            gate_name="coverage",
            passed=True,
            score=0.85,
            details={"lines_covered": 850, "total_lines": 1000},
        )

        assert len(hooks._observations) == 1
        obs = hooks._observations[0]
        assert obs.success_rate == 0.85


class TestGenerateSummary:
    """Tests for generate_summary hook."""

    @pytest.fixture
    def hooks(self):
        """Create hooks with observations."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)
            hooks.workcell_start(workcell_id="wc-summary")

            # Add some observations
            hooks.gate_result("pytest", passed=True)
            hooks.gate_result("mypy", passed=False, fail_codes=["TYPE_ERROR"])

            yield hooks
            hooks.close()

    def test_generate_summary(self, hooks):
        """Test summary generation."""
        summary = hooks.generate_summary()

        assert summary is not None
        assert "summary_id" in summary
        assert "patterns" in summary
        assert "anti_patterns" in summary

    def test_generate_summary_no_session(self):
        """Test summary generation without session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)

            summary = hooks.generate_summary()

            assert summary is None
            hooks.close()


class TestWorkcellEnd:
    """Tests for workcell_end hook."""

    @pytest.fixture
    def hooks(self):
        """Create hooks with active session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)
            hooks.workcell_start(workcell_id="wc-end")
            hooks.tool_use("Edit", {"file": "test.py"}, "OK", ["test.py"])
            yield hooks
            hooks.close()

    def test_workcell_end_closes_session(self, hooks):
        """Test that workcell_end closes session."""
        result = hooks.workcell_end(status="success")

        assert result["success"] is True
        assert hooks._session_id is None
        assert hooks._workcell_id is None
        assert len(hooks._observations) == 0

    def test_workcell_end_includes_summary(self, hooks):
        """Test that workcell_end includes summary."""
        result = hooks.workcell_end()

        assert "summary" in result
        assert result["observation_count"] >= 1

    def test_workcell_end_without_session(self):
        """Test workcell_end without active session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)

            result = hooks.workcell_end()

            assert result["success"] is False
            assert "error" in result
            hooks.close()


class TestUtilityMethods:
    """Tests for utility methods."""

    @pytest.fixture
    def hooks(self):
        """Create hooks with session."""
        from cyntra.memory.hooks import MemoryHooks

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            hooks = MemoryHooks(db_path=db_path)
            hooks.workcell_start(workcell_id="wc-util")
            yield hooks
            hooks.close()

    def test_add_decision(self, hooks):
        """Test adding decision observation."""
        hooks.add_decision(
            decision="Use async approach for I/O",
            rationale="Better performance for concurrent requests",
            file_refs=["src/api.py"],
        )

        assert len(hooks._observations) == 1
        obs = hooks._observations[0]
        assert "async approach" in obs.content

    def test_add_discovery(self, hooks):
        """Test adding discovery observation."""
        hooks.add_discovery(
            discovery="The codebase uses dependency injection",
            context="Found in src/core.py",
        )

        assert len(hooks._observations) == 1

    def test_search(self, hooks):
        """Test search functionality."""
        hooks.add_discovery("API uses REST endpoints")

        results = hooks.search("REST", limit=5)

        # Search might return results from FTS
        assert isinstance(results, list)


class TestSessionIdGeneration:
    """Tests for session ID generation."""

    def test_generate_session_id(self):
        """Test session ID format."""
        from cyntra.memory.hooks import _generate_session_id

        session_id = _generate_session_id("wc-42")

        assert session_id.startswith("sess_wc-42_")
        assert len(session_id) > len("sess_wc-42_")

    def test_generate_summary_id(self):
        """Test summary ID format."""
        from cyntra.memory.hooks import _generate_summary_id

        summary_id = _generate_summary_id("sess_test_123")

        assert summary_id.startswith("sum_")
        assert len(summary_id) == 12  # "sum_" + 8 chars
