"""Tests for observation types and structures."""

from datetime import UTC, datetime


class TestObservationType:
    """Tests for ObservationType enum."""

    def test_all_types_have_values(self):
        """Test that all types have string values."""
        from cyntra.memory.observations import ObservationType

        for obs_type in ObservationType:
            assert isinstance(obs_type.value, str)
            assert len(obs_type.value) > 0

    def test_claude_mem_types(self):
        """Test claude-mem standard types exist."""
        from cyntra.memory.observations import ObservationType

        claude_mem_types = ["decision", "bugfix", "feature", "refactor", "discovery", "change"]

        for type_name in claude_mem_types:
            assert hasattr(ObservationType, type_name.upper())

    def test_cyntra_extension_types(self):
        """Test Cyntra-specific types exist."""
        from cyntra.memory.observations import ObservationType

        cyntra_types = ["gate_result", "tool_sequence", "trap_warning", "repair_strategy"]

        for type_name in cyntra_types:
            assert hasattr(ObservationType, type_name.upper())


class TestConcept:
    """Tests for Concept enum."""

    def test_all_concepts(self):
        """Test all concept values."""
        from cyntra.memory.observations import Concept

        expected = {
            "discovery",
            "problem-solution",
            "pattern",
            "anti-pattern",
            "workflow",
            "configuration",
        }

        actual = {c.value for c in Concept}
        assert actual == expected


class TestImportance:
    """Tests for Importance enum."""

    def test_importance_levels(self):
        """Test importance level values."""
        from cyntra.memory.observations import Importance

        assert Importance.CRITICAL.value == "critical"
        assert Importance.DECISION.value == "decision"
        assert Importance.INFO.value == "info"


class TestObservation:
    """Tests for Observation dataclass."""

    def test_basic_creation(self):
        """Test basic observation creation."""
        from cyntra.memory.observations import (
            Importance,
            Observation,
            ObservationType,
        )

        obs = Observation(
            session_id="sess_123",
            obs_type=ObservationType.DECISION,
            content="Made a key decision",
        )

        assert obs.session_id == "sess_123"
        assert obs.obs_type == ObservationType.DECISION
        assert obs.content == "Made a key decision"
        assert obs.importance == Importance.INFO
        assert obs.id is not None

    def test_id_generation(self):
        """Test deterministic ID generation."""
        from cyntra.memory.observations import Observation, ObservationType

        obs1 = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="Same content",
        )
        obs2 = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="Same content",
        )

        # Same inputs should generate same ID
        assert obs1.id == obs2.id

    def test_id_different_for_different_content(self):
        """Test ID differs for different content."""
        from cyntra.memory.observations import Observation, ObservationType

        obs1 = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="Content A",
        )
        obs2 = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="Content B",
        )

        assert obs1.id != obs2.id

    def test_token_estimation(self):
        """Test token count estimation."""
        from cyntra.memory.observations import Observation, ObservationType

        obs = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="This is a test content with some words",
        )

        # Should be roughly content length / 4
        assert obs.token_count > 0
        assert obs.token_count < len(obs.content)

    def test_to_dict(self):
        """Test conversion to dictionary."""
        from cyntra.memory.observations import (
            Concept,
            Importance,
            Observation,
            ObservationType,
        )

        obs = Observation(
            session_id="sess_123",
            obs_type=ObservationType.GATE_RESULT,
            content="Gate passed",
            concept=Concept.PATTERN,
            importance=Importance.DECISION,
            gate_name="pytest",
            fail_codes=[],
        )

        d = obs.to_dict()

        assert d["session_id"] == "sess_123"
        assert d["type"] == "gate_result"
        assert d["concept"] == "pattern"
        assert d["importance"] == "decision"
        assert d["gate_name"] == "pytest"


class TestObservationFactories:
    """Tests for Observation factory methods."""

    def test_from_tool_use_edit(self):
        """Test observation from Edit tool use."""
        from cyntra.memory.observations import Concept, Observation, ObservationType

        obs = Observation.from_tool_use(
            session_id="sess_tool",
            tool_name="Edit",
            tool_args={"file": "main.py", "operation": "replace"},
            result="Successfully edited main.py",
            file_refs=["main.py"],
        )

        assert obs.obs_type == ObservationType.CHANGE
        assert obs.tool_name == "Edit"
        assert obs.concept == Concept.WORKFLOW
        assert obs.outcome == "success"
        assert "main.py" in obs.file_refs

    def test_from_tool_use_read(self):
        """Test observation from Read tool use."""
        from cyntra.memory.observations import Concept, Observation

        obs = Observation.from_tool_use(
            session_id="sess_tool",
            tool_name="Read",
            tool_args={"file": "config.yaml"},
            result="File contents here",
        )

        assert obs.tool_name == "Read"
        assert obs.concept == Concept.DISCOVERY

    def test_from_tool_use_error(self):
        """Test observation from failed tool use."""
        from cyntra.memory.observations import Observation

        obs = Observation.from_tool_use(
            session_id="sess_tool",
            tool_name="Edit",
            tool_args={"file": "missing.py"},
            result="Error: file not found",
        )

        assert obs.outcome == "error"

    def test_from_gate_result_pass(self):
        """Test observation from passing gate."""
        from cyntra.memory.observations import (
            Importance,
            Observation,
            ObservationType,
        )

        obs = Observation.from_gate_result(
            session_id="sess_gate",
            gate_name="pytest",
            passed=True,
            score=1.0,
        )

        assert obs.obs_type == ObservationType.GATE_RESULT
        assert obs.gate_name == "pytest"
        assert obs.outcome == "pass"
        assert obs.importance == Importance.INFO
        assert "passed" in obs.content

    def test_from_gate_result_fail(self):
        """Test observation from failing gate."""
        from cyntra.memory.observations import (
            Concept,
            Importance,
            Observation,
        )

        obs = Observation.from_gate_result(
            session_id="sess_gate",
            gate_name="mypy",
            passed=False,
            fail_codes=["TYPE_ERROR", "MISSING_IMPORT"],
        )

        assert obs.outcome == "fail"
        assert obs.concept == Concept.PROBLEM_SOLUTION
        assert obs.importance == Importance.CRITICAL
        assert "TYPE_ERROR" in obs.fail_codes
        assert "failed" in obs.content

    def test_from_decision(self):
        """Test observation from decision."""
        from cyntra.memory.observations import (
            Concept,
            Importance,
            Observation,
            ObservationType,
        )

        obs = Observation.from_decision(
            session_id="sess_dec",
            decision="Use async/await pattern",
            rationale="Better for I/O-bound operations",
            file_refs=["src/api.py"],
        )

        assert obs.obs_type == ObservationType.DECISION
        assert obs.concept == Concept.PATTERN
        assert obs.importance == Importance.DECISION
        assert "async/await" in obs.content
        assert "Rationale:" in obs.content

    def test_from_discovery(self):
        """Test observation from discovery."""
        from cyntra.memory.observations import (
            Concept,
            Observation,
            ObservationType,
        )

        obs = Observation.from_discovery(
            session_id="sess_disc",
            discovery="The codebase uses dependency injection",
            context="Found in src/container.py",
        )

        assert obs.obs_type == ObservationType.DISCOVERY
        assert obs.concept == Concept.DISCOVERY
        assert "dependency injection" in obs.content
        assert "Context:" in obs.content

    def test_from_tool_sequence(self):
        """Test observation from tool sequence."""
        from cyntra.memory.observations import (
            Concept,
            Importance,
            Observation,
            ObservationType,
        )

        obs = Observation.from_tool_sequence(
            session_id="sess_seq",
            tools=["Read", "Grep", "Edit"],
            outcome="Successfully refactored function",
            success_rate=0.9,
        )

        assert obs.obs_type == ObservationType.TOOL_SEQUENCE
        assert obs.concept == Concept.PATTERN
        assert obs.importance == Importance.DECISION
        assert obs.success_rate == 0.9
        assert "Read → Grep → Edit" in obs.content

    def test_from_tool_sequence_low_success(self):
        """Test observation from low-success tool sequence."""
        from cyntra.memory.observations import Concept, Observation

        obs = Observation.from_tool_sequence(
            session_id="sess_seq",
            tools=["Edit", "Run"],
            outcome="Tests failed",
            success_rate=0.3,
        )

        assert obs.concept == Concept.ANTI_PATTERN

    def test_from_trap_warning(self):
        """Test observation from trap warning."""
        from cyntra.memory.observations import (
            Concept,
            Importance,
            Observation,
            ObservationType,
        )

        obs = Observation.from_trap_warning(
            session_id="sess_trap",
            state_id="state_123",
            reason="Repeated edit-test-fail loop detected",
            recommendation="Step back and review approach",
        )

        assert obs.obs_type == ObservationType.TRAP_WARNING
        assert obs.concept == Concept.ANTI_PATTERN
        assert obs.importance == Importance.CRITICAL
        assert "Trap detected" in obs.content


class TestObservationWithCyntraFields:
    """Tests for Cyntra-specific observation fields."""

    def test_gate_fields(self):
        """Test gate-specific fields."""
        from cyntra.memory.observations import Observation, ObservationType

        obs = Observation(
            session_id="sess_123",
            obs_type=ObservationType.GATE_RESULT,
            content="Gate result",
            gate_name="pytest",
            fail_codes=["ASSERTION_ERROR"],
            success_rate=0.5,
        )

        assert obs.gate_name == "pytest"
        assert obs.fail_codes == ["ASSERTION_ERROR"]
        assert obs.success_rate == 0.5

    def test_file_refs(self):
        """Test file references."""
        from cyntra.memory.observations import Observation, ObservationType

        obs = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="Changed files",
            file_refs=["src/main.py", "src/utils.py"],
        )

        assert len(obs.file_refs) == 2
        assert "src/main.py" in obs.file_refs

    def test_created_at_default(self):
        """Test created_at default value."""
        from cyntra.memory.observations import Observation, ObservationType

        before = datetime.now(UTC)
        obs = Observation(
            session_id="sess_123",
            obs_type=ObservationType.CHANGE,
            content="Test",
        )
        after = datetime.now(UTC)

        assert before <= obs.created_at <= after
