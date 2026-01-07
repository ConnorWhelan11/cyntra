"""Tests for strategy rubric definitions."""

import pytest

from cyntra.strategy.rubric import (
    CYNTRA_V1_RUBRIC,
    StrategyDimension,
    StrategyRubric,
)


class TestStrategyDimension:
    """Tests for StrategyDimension."""

    def test_create_valid_dimension(self):
        """Test creating a valid dimension."""
        dim = StrategyDimension(
            id="test_dim",
            name="Test Dimension",
            pattern_a="pattern_a",
            pattern_b="pattern_b",
            description_a="Description A",
            description_b="Description B",
        )
        assert dim.id == "test_dim"
        assert dim.name == "Test Dimension"
        assert dim.pattern_a == "pattern_a"
        assert dim.pattern_b == "pattern_b"

    def test_dimension_patterns(self):
        """Test patterns() method."""
        dim = StrategyDimension(
            id="test_dim",
            name="Test",
            pattern_a="alpha",
            pattern_b="beta",
            description_a="Alpha desc",
            description_b="Beta desc",
        )
        assert dim.patterns() == ("alpha", "beta")

    def test_is_valid_pattern(self):
        """Test pattern validation."""
        dim = StrategyDimension(
            id="test_dim",
            name="Test",
            pattern_a="top_down",
            pattern_b="bottom_up",
            description_a="Top-down approach",
            description_b="Bottom-up approach",
        )
        assert dim.is_valid_pattern("top_down") is True
        assert dim.is_valid_pattern("bottom_up") is True
        assert dim.is_valid_pattern("invalid") is False
        assert dim.is_valid_pattern("") is False

    def test_invalid_id_raises(self):
        """Test that invalid IDs raise ValueError."""
        with pytest.raises(ValueError, match="Invalid dimension id"):
            StrategyDimension(
                id="",
                name="Test",
                pattern_a="a",
                pattern_b="b",
                description_a="A",
                description_b="B",
            )

    def test_same_patterns_raises(self):
        """Test that identical patterns raise ValueError."""
        with pytest.raises(ValueError, match="Patterns must be different"):
            StrategyDimension(
                id="test",
                name="Test",
                pattern_a="same",
                pattern_b="same",
                description_a="A",
                description_b="B",
            )

    def test_empty_pattern_raises(self):
        """Test that empty patterns raise ValueError."""
        with pytest.raises(ValueError, match="Both patterns must be non-empty"):
            StrategyDimension(
                id="test",
                name="Test",
                pattern_a="",
                pattern_b="valid",
                description_a="A",
                description_b="B",
            )

    def test_to_dict(self):
        """Test dictionary serialization."""
        dim = StrategyDimension(
            id="test_dim",
            name="Test Dimension",
            pattern_a="alpha",
            pattern_b="beta",
            description_a="Alpha desc",
            description_b="Beta desc",
            keywords_a=("key1", "key2"),
            keywords_b=("key3",),
            source="test_source",
        )
        d = dim.to_dict()
        assert d["id"] == "test_dim"
        assert d["pattern_a"] == "alpha"
        assert d["keywords_a"] == ["key1", "key2"]
        assert d["source"] == "test_source"

    def test_from_dict(self):
        """Test dictionary deserialization."""
        data = {
            "id": "restored_dim",
            "name": "Restored",
            "pattern_a": "one",
            "pattern_b": "two",
            "description_a": "One desc",
            "description_b": "Two desc",
            "keywords_a": ["kw1"],
            "keywords_b": [],
            "source": "test",
        }
        dim = StrategyDimension.from_dict(data)
        assert dim.id == "restored_dim"
        assert dim.pattern_a == "one"
        assert dim.keywords_a == ("kw1",)

    def test_roundtrip_serialization(self):
        """Test that to_dict/from_dict are inverses."""
        original = StrategyDimension(
            id="roundtrip",
            name="Roundtrip Test",
            pattern_a="start",
            pattern_b="end",
            description_a="Start desc",
            description_b="End desc",
            keywords_a=("begin", "initial"),
            keywords_b=("finish", "final"),
            source="test_roundtrip",
        )
        restored = StrategyDimension.from_dict(original.to_dict())
        assert restored.id == original.id
        assert restored.pattern_a == original.pattern_a
        assert restored.keywords_a == original.keywords_a
        assert restored.source == original.source


class TestStrategyRubric:
    """Tests for StrategyRubric."""

    @pytest.fixture
    def sample_dimensions(self):
        """Create sample dimensions for testing."""
        return (
            StrategyDimension(
                id="dim1",
                name="Dimension 1",
                pattern_a="a1",
                pattern_b="b1",
                description_a="A1",
                description_b="B1",
            ),
            StrategyDimension(
                id="dim2",
                name="Dimension 2",
                pattern_a="a2",
                pattern_b="b2",
                description_a="A2",
                description_b="B2",
            ),
        )

    def test_create_valid_rubric(self, sample_dimensions):
        """Test creating a valid rubric."""
        rubric = StrategyRubric(
            version="test-v1",
            dimensions=sample_dimensions,
            description="Test rubric",
        )
        assert rubric.version == "test-v1"
        assert len(rubric) == 2
        assert rubric.description == "Test rubric"

    def test_rubric_iteration(self, sample_dimensions):
        """Test iterating over rubric dimensions."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        dims = list(rubric)
        assert len(dims) == 2
        assert dims[0].id == "dim1"
        assert dims[1].id == "dim2"

    def test_rubric_getitem_by_index(self, sample_dimensions):
        """Test accessing dimensions by index."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        assert rubric[0].id == "dim1"
        assert rubric[1].id == "dim2"

    def test_rubric_getitem_by_id(self, sample_dimensions):
        """Test accessing dimensions by ID."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        assert rubric["dim1"].name == "Dimension 1"
        assert rubric["dim2"].pattern_a == "a2"

    def test_rubric_getitem_invalid_id_raises(self, sample_dimensions):
        """Test that invalid ID raises KeyError."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        with pytest.raises(KeyError):
            _ = rubric["nonexistent"]

    def test_rubric_contains(self, sample_dimensions):
        """Test 'in' operator for dimension IDs."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        assert "dim1" in rubric
        assert "dim2" in rubric
        assert "dim3" not in rubric

    def test_dimension_ids(self, sample_dimensions):
        """Test dimension_ids() method."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        assert rubric.dimension_ids() == ["dim1", "dim2"]

    def test_get_with_default(self, sample_dimensions):
        """Test get() with default value."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        assert rubric.get("dim1") is not None
        assert rubric.get("nonexistent") is None
        assert rubric.get("nonexistent", sample_dimensions[0]) == sample_dimensions[0]

    def test_empty_version_raises(self, sample_dimensions):
        """Test that empty version raises ValueError."""
        with pytest.raises(ValueError, match="Rubric version is required"):
            StrategyRubric(version="", dimensions=sample_dimensions)

    def test_empty_dimensions_raises(self):
        """Test that empty dimensions raises ValueError."""
        with pytest.raises(ValueError, match="Rubric must have at least one dimension"):
            StrategyRubric(version="test-v1", dimensions=())

    def test_duplicate_dimension_ids_raises(self):
        """Test that duplicate dimension IDs raise ValueError."""
        dim1 = StrategyDimension(
            id="same_id",
            name="First",
            pattern_a="a1",
            pattern_b="b1",
            description_a="A1",
            description_b="B1",
        )
        dim2 = StrategyDimension(
            id="same_id",
            name="Second",
            pattern_a="a2",
            pattern_b="b2",
            description_a="A2",
            description_b="B2",
        )
        with pytest.raises(ValueError, match="Duplicate dimension IDs"):
            StrategyRubric(version="test-v1", dimensions=(dim1, dim2))

    def test_to_dict(self, sample_dimensions):
        """Test dictionary serialization."""
        rubric = StrategyRubric(
            version="test-v1",
            dimensions=sample_dimensions,
            description="Test description",
        )
        d = rubric.to_dict()
        assert d["version"] == "test-v1"
        assert d["description"] == "Test description"
        assert len(d["dimensions"]) == 2

    def test_from_dict(self, sample_dimensions):
        """Test dictionary deserialization."""
        original = StrategyRubric(
            version="test-v1",
            dimensions=sample_dimensions,
            description="Original description",
        )
        restored = StrategyRubric.from_dict(original.to_dict())
        assert restored.version == "test-v1"
        assert len(restored) == 2
        assert restored["dim1"].pattern_a == "a1"

    def test_to_prompt_section(self, sample_dimensions):
        """Test prompt section generation."""
        rubric = StrategyRubric(version="test-v1", dimensions=sample_dimensions)
        prompt = rubric.to_prompt_section()
        assert "Strategy Self-Report" in prompt
        assert "Dimension 1" in prompt
        assert "a1 / b1" in prompt
        assert "Dimension 2" in prompt


class TestCyntraV1Rubric:
    """Tests for the default CYNTRA_V1_RUBRIC."""

    def test_rubric_exists(self):
        """Test that CYNTRA_V1_RUBRIC is defined."""
        assert CYNTRA_V1_RUBRIC is not None
        assert isinstance(CYNTRA_V1_RUBRIC, StrategyRubric)

    def test_rubric_version(self):
        """Test rubric version."""
        assert CYNTRA_V1_RUBRIC.version == "cyntra-v1"

    def test_rubric_has_12_dimensions(self):
        """Test that rubric has exactly 12 dimensions."""
        assert len(CYNTRA_V1_RUBRIC) == 12

    def test_paper_derived_dimensions_present(self):
        """Test that paper-derived dimensions are present."""
        expected_paper_dims = [
            "analytical_perspective",
            "scope_approach",
            "reasoning_type",
            "idea_development",
            "verification_focus",
            "clarification_approach",
        ]
        for dim_id in expected_paper_dims:
            assert dim_id in CYNTRA_V1_RUBRIC, f"Missing dimension: {dim_id}"

    def test_cyntra_specific_dimensions_present(self):
        """Test that Cyntra-specific dimensions are present."""
        expected_cyntra_dims = [
            "planning_depth",
            "tool_strategy",
            "error_handling",
            "context_usage",
            "diff_strategy",
            "gate_awareness",
        ]
        for dim_id in expected_cyntra_dims:
            assert dim_id in CYNTRA_V1_RUBRIC, f"Missing dimension: {dim_id}"

    def test_all_dimensions_have_different_patterns(self):
        """Test that each dimension has distinct patterns."""
        for dim in CYNTRA_V1_RUBRIC:
            assert dim.pattern_a != dim.pattern_b

    def test_all_dimensions_have_descriptions(self):
        """Test that all dimensions have non-empty descriptions."""
        for dim in CYNTRA_V1_RUBRIC:
            assert dim.description_a, f"{dim.id} missing description_a"
            assert dim.description_b, f"{dim.id} missing description_b"

    def test_all_dimensions_have_source(self):
        """Test that all dimensions have source attribution."""
        for dim in CYNTRA_V1_RUBRIC:
            assert dim.source in ("paper_3.2", "cyntra_specific")

    def test_analytical_perspective_dimension(self):
        """Test specific values of analytical_perspective dimension."""
        dim = CYNTRA_V1_RUBRIC["analytical_perspective"]
        assert dim.pattern_a == "top_down"
        assert dim.pattern_b == "bottom_up"
        assert dim.source == "paper_3.2"

    def test_diff_strategy_dimension(self):
        """Test specific values of diff_strategy dimension."""
        dim = CYNTRA_V1_RUBRIC["diff_strategy"]
        assert dim.pattern_a == "minimal_surgical"
        assert dim.pattern_b == "comprehensive_refactor"
        assert dim.source == "cyntra_specific"

    def test_prompt_section_includes_all_dimensions(self):
        """Test that prompt section includes all 12 dimensions."""
        prompt = CYNTRA_V1_RUBRIC.to_prompt_section()
        for dim in CYNTRA_V1_RUBRIC:
            assert dim.name in prompt, f"Missing dimension in prompt: {dim.name}"

    def test_rubric_is_immutable(self):
        """Test that rubric is frozen (immutable)."""
        with pytest.raises(AttributeError):
            CYNTRA_V1_RUBRIC.version = "modified"
