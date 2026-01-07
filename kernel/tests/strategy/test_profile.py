"""Tests for StrategyProfile and DimensionValue."""

import json

import pytest

from cyntra.strategy import CYNTRA_V1_RUBRIC
from cyntra.strategy.profile import (
    DimensionValue,
    StrategyProfile,
)


class TestDimensionValue:
    """Tests for DimensionValue."""

    def test_create_valid_value(self):
        """Test creating a valid dimension value."""
        dv = DimensionValue(value="top_down", confidence=0.85)
        assert dv.value == "top_down"
        assert dv.confidence == 0.85
        assert dv.evidence is None

    def test_create_with_evidence(self):
        """Test creating a value with evidence."""
        dv = DimensionValue(
            value="bottom_up",
            confidence=0.9,
            evidence="Started with specific file analysis",
        )
        assert dv.value == "bottom_up"
        assert dv.evidence == "Started with specific file analysis"

    def test_default_confidence(self):
        """Test default confidence value."""
        dv = DimensionValue(value="local")
        assert dv.confidence == 0.5

    def test_empty_value_raises(self):
        """Test that empty value raises ValueError."""
        with pytest.raises(ValueError, match="non-empty string"):
            DimensionValue(value="")

    def test_invalid_confidence_too_low(self):
        """Test that confidence below 0 raises ValueError."""
        with pytest.raises(ValueError, match="between 0 and 1"):
            DimensionValue(value="test", confidence=-0.1)

    def test_invalid_confidence_too_high(self):
        """Test that confidence above 1 raises ValueError."""
        with pytest.raises(ValueError, match="between 0 and 1"):
            DimensionValue(value="test", confidence=1.5)

    def test_edge_confidence_values(self):
        """Test that edge confidence values are valid."""
        dv_zero = DimensionValue(value="test", confidence=0.0)
        dv_one = DimensionValue(value="test", confidence=1.0)
        assert dv_zero.confidence == 0.0
        assert dv_one.confidence == 1.0

    def test_to_dict_minimal(self):
        """Test dictionary serialization without evidence."""
        dv = DimensionValue(value="top_down", confidence=0.8)
        d = dv.to_dict()
        assert d == {"value": "top_down", "confidence": 0.8}
        assert "evidence" not in d

    def test_to_dict_with_evidence(self):
        """Test dictionary serialization with evidence."""
        dv = DimensionValue(value="local", confidence=0.7, evidence="Focused on single file")
        d = dv.to_dict()
        assert d["value"] == "local"
        assert d["evidence"] == "Focused on single file"

    def test_from_dict(self):
        """Test dictionary deserialization."""
        data = {"value": "deductive", "confidence": 0.75, "evidence": "Applied rules"}
        dv = DimensionValue.from_dict(data)
        assert dv.value == "deductive"
        assert dv.confidence == 0.75
        assert dv.evidence == "Applied rules"

    def test_from_dict_minimal(self):
        """Test deserialization with minimal data."""
        data = {"value": "iterative"}
        dv = DimensionValue.from_dict(data)
        assert dv.value == "iterative"
        assert dv.confidence == 0.5  # default
        assert dv.evidence is None

    def test_roundtrip_serialization(self):
        """Test that to_dict/from_dict are inverses."""
        original = DimensionValue(value="continuous", confidence=0.9, evidence="Checked often")
        restored = DimensionValue.from_dict(original.to_dict())
        assert restored.value == original.value
        assert restored.confidence == original.confidence
        assert restored.evidence == original.evidence


class TestStrategyProfile:
    """Tests for StrategyProfile."""

    @pytest.fixture
    def sample_dimensions(self):
        """Create sample dimension values."""
        return {
            "analytical_perspective": DimensionValue(value="top_down", confidence=0.85),
            "scope_approach": DimensionValue(value="local", confidence=0.7),
            "reasoning_type": DimensionValue(value="deductive", confidence=0.9),
        }

    def test_create_valid_profile(self, sample_dimensions):
        """Test creating a valid profile."""
        profile = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions=sample_dimensions,
            workcell_id="wc-001",
            issue_id="issue-123",
        )
        assert profile.rubric_version == "cyntra-v1"
        assert profile.workcell_id == "wc-001"
        assert len(profile.dimensions) == 3

    def test_empty_version_raises(self, sample_dimensions):
        """Test that empty version raises ValueError."""
        with pytest.raises(ValueError, match="Rubric version is required"):
            StrategyProfile(rubric_version="", dimensions=sample_dimensions)

    def test_invalid_extraction_method_raises(self, sample_dimensions):
        """Test that invalid extraction method raises ValueError."""
        with pytest.raises(ValueError, match="Invalid extraction method"):
            StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions=sample_dimensions,
                extraction_method="invalid_method",
            )

    def test_valid_extraction_methods(self, sample_dimensions):
        """Test that all valid extraction methods work."""
        for method in ["self_report", "llm_analysis", "classifier", "heuristic", "unknown"]:
            profile = StrategyProfile(
                rubric_version="cyntra-v1",
                dimensions=sample_dimensions,
                extraction_method=method,
            )
            assert profile.extraction_method == method

    def test_getitem(self, sample_dimensions):
        """Test accessing dimension by ID."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        assert profile["analytical_perspective"].value == "top_down"
        assert profile["scope_approach"].confidence == 0.7

    def test_getitem_missing_raises(self, sample_dimensions):
        """Test that missing dimension raises KeyError."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        with pytest.raises(KeyError):
            _ = profile["nonexistent"]

    def test_contains(self, sample_dimensions):
        """Test 'in' operator."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        assert "analytical_perspective" in profile
        assert "nonexistent" not in profile

    def test_get_with_default(self, sample_dimensions):
        """Test get() method with default."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        assert profile.get("analytical_perspective") is not None
        assert profile.get("nonexistent") is None
        default = DimensionValue(value="default")
        assert profile.get("nonexistent", default) == default

    def test_dimension_ids(self, sample_dimensions):
        """Test dimension_ids() method."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        ids = profile.dimension_ids()
        assert "analytical_perspective" in ids
        assert "scope_approach" in ids
        assert "reasoning_type" in ids

    def test_pattern_for(self, sample_dimensions):
        """Test pattern_for() method."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        assert profile.pattern_for("analytical_perspective") == "top_down"
        assert profile.pattern_for("nonexistent") is None

    def test_confidence_for(self, sample_dimensions):
        """Test confidence_for() method."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        assert profile.confidence_for("analytical_perspective") == 0.85
        assert profile.confidence_for("nonexistent") == 0.0

    def test_average_confidence(self, sample_dimensions):
        """Test average_confidence() calculation."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        expected = (0.85 + 0.7 + 0.9) / 3
        assert abs(profile.average_confidence() - expected) < 0.001

    def test_average_confidence_empty(self):
        """Test average_confidence() with no dimensions."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions={})
        assert profile.average_confidence() == 0.0

    def test_low_confidence_dimensions(self, sample_dimensions):
        """Test low_confidence_dimensions() method."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        low = profile.low_confidence_dimensions(threshold=0.8)
        assert "scope_approach" in low
        assert "analytical_perspective" not in low
        assert "reasoning_type" not in low

    def test_to_compact_string(self, sample_dimensions):
        """Test compact string representation."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        compact = profile.to_compact_string()
        assert "top_down" in compact
        assert "local" in compact
        assert "deductive" in compact

    def test_to_dict(self, sample_dimensions):
        """Test dictionary serialization."""
        profile = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions=sample_dimensions,
            workcell_id="wc-001",
            model="claude-opus",
            extraction_method="self_report",
        )
        d = profile.to_dict()
        assert d["schema_version"] == "cyntra.strategy_profile.v1"
        assert d["rubric_version"] == "cyntra-v1"
        assert d["workcell_id"] == "wc-001"
        assert d["model"] == "claude-opus"
        assert "profile" in d
        assert "analytical_perspective" in d["profile"]

    def test_to_json(self, sample_dimensions):
        """Test JSON serialization."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        json_str = profile.to_json()
        parsed = json.loads(json_str)
        assert parsed["rubric_version"] == "cyntra-v1"

    def test_from_dict(self, sample_dimensions):
        """Test dictionary deserialization."""
        original = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions=sample_dimensions,
            workcell_id="wc-001",
            model="claude-opus",
        )
        restored = StrategyProfile.from_dict(original.to_dict())
        assert restored.rubric_version == "cyntra-v1"
        assert restored.workcell_id == "wc-001"
        assert restored["analytical_perspective"].value == "top_down"

    def test_from_json(self, sample_dimensions):
        """Test JSON deserialization."""
        original = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        restored = StrategyProfile.from_json(original.to_json())
        assert restored.rubric_version == original.rubric_version

    def test_roundtrip_serialization(self, sample_dimensions):
        """Test full roundtrip through JSON."""
        original = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions=sample_dimensions,
            workcell_id="wc-001",
            issue_id="issue-123",
            model="claude-opus",
            toolchain="claude",
            extraction_method="self_report",
            notes="Test notes",
        )
        json_str = original.to_json()
        restored = StrategyProfile.from_json(json_str)

        assert restored.rubric_version == original.rubric_version
        assert restored.workcell_id == original.workcell_id
        assert restored.issue_id == original.issue_id
        assert restored.model == original.model
        assert restored.extraction_method == original.extraction_method
        assert restored.notes == original.notes

        for dim_id in original.dimension_ids():
            assert restored[dim_id].value == original[dim_id].value
            assert restored[dim_id].confidence == original[dim_id].confidence

    def test_create_empty(self):
        """Test create_empty() factory method."""
        profile = StrategyProfile.create_empty(
            rubric_version="cyntra-v1",
            workcell_id="wc-001",
        )
        assert profile.rubric_version == "cyntra-v1"
        assert profile.workcell_id == "wc-001"
        assert len(profile.dimensions) == 0

    def test_validate_against_rubric_valid(self, sample_dimensions):
        """Test validation against rubric - valid profile."""
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=sample_dimensions)
        errors = profile.validate_against_rubric(CYNTRA_V1_RUBRIC)
        assert len(errors) == 0

    def test_validate_against_rubric_invalid_pattern(self):
        """Test validation against rubric - invalid pattern."""
        dimensions = {
            "analytical_perspective": DimensionValue(value="invalid_pattern", confidence=0.8),
        }
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=dimensions)
        errors = profile.validate_against_rubric(CYNTRA_V1_RUBRIC)
        assert len(errors) == 1
        assert "Invalid pattern" in errors[0]

    def test_validate_against_rubric_unknown_dimension(self):
        """Test validation against rubric - unknown dimension."""
        dimensions = {
            "unknown_dimension": DimensionValue(value="test", confidence=0.5),
        }
        profile = StrategyProfile(rubric_version="cyntra-v1", dimensions=dimensions)
        errors = profile.validate_against_rubric(CYNTRA_V1_RUBRIC)
        assert len(errors) == 1
        assert "Unknown dimension" in errors[0]

    def test_validate_version_mismatch(self, sample_dimensions):
        """Test validation with version mismatch."""
        profile = StrategyProfile(rubric_version="wrong-v1", dimensions=sample_dimensions)
        errors = profile.validate_against_rubric(CYNTRA_V1_RUBRIC)
        assert len(errors) >= 1
        assert any("version mismatch" in e for e in errors)

    def test_validate_unknown_version_without_rubric(self, sample_dimensions):
        """Test validation with unknown version and no rubric provided."""
        profile = StrategyProfile(rubric_version="unknown-v1", dimensions=sample_dimensions)
        errors = profile.validate_against_rubric()  # No rubric provided
        assert len(errors) == 1
        assert "Unknown rubric version" in errors[0]


class TestStrategyProfileComparison:
    """Tests for profile comparison."""

    def test_compare_identical_profiles(self):
        """Test comparing identical profiles."""
        dims = {
            "analytical_perspective": DimensionValue(value="top_down", confidence=0.8),
            "scope_approach": DimensionValue(value="local", confidence=0.7),
        }
        p1 = StrategyProfile(rubric_version="cyntra-v1", dimensions=dims.copy())
        p2 = StrategyProfile(rubric_version="cyntra-v1", dimensions=dims.copy())

        result = p1.compare(p2)
        assert result["compatible"] is True
        assert result["agreement_rate"] == 1.0
        assert len(result["agreements"]) == 2
        assert len(result["disagreements"]) == 0

    def test_compare_different_profiles(self):
        """Test comparing profiles with different patterns."""
        p1_dims = {
            "analytical_perspective": DimensionValue(value="top_down", confidence=0.8),
            "scope_approach": DimensionValue(value="local", confidence=0.7),
        }
        p2_dims = {
            "analytical_perspective": DimensionValue(value="bottom_up", confidence=0.8),
            "scope_approach": DimensionValue(value="local", confidence=0.7),
        }
        p1 = StrategyProfile(rubric_version="cyntra-v1", dimensions=p1_dims)
        p2 = StrategyProfile(rubric_version="cyntra-v1", dimensions=p2_dims)

        result = p1.compare(p2)
        assert result["compatible"] is True
        assert result["agreement_rate"] == 0.5
        assert len(result["agreements"]) == 1
        assert len(result["disagreements"]) == 1
        assert result["disagreements"][0]["dimension"] == "analytical_perspective"

    def test_compare_incompatible_versions(self):
        """Test comparing profiles with different rubric versions."""
        dims = {"analytical_perspective": DimensionValue(value="top_down")}
        p1 = StrategyProfile(rubric_version="cyntra-v1", dimensions=dims)
        p2 = StrategyProfile(rubric_version="cyntra-v2", dimensions=dims)

        result = p1.compare(p2)
        assert result["compatible"] is False
        assert "error" in result

    def test_compare_no_common_dimensions(self):
        """Test comparing profiles with no overlapping dimensions."""
        p1 = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions={"analytical_perspective": DimensionValue(value="top_down")},
        )
        p2 = StrategyProfile(
            rubric_version="cyntra-v1",
            dimensions={"scope_approach": DimensionValue(value="local")},
        )

        result = p1.compare(p2)
        assert result["compatible"] is True
        assert result["common_dimensions"] == 0
        assert result["agreement_rate"] == 0.0


class TestStrategyProfileFromPatternString:
    """Tests for from_pattern_string() factory method."""

    def test_from_pattern_string_basic(self):
        """Test creating profile from pattern string."""
        pattern_str = "top_down, local, deductive, linear"
        profile = StrategyProfile.from_pattern_string(pattern_str)

        assert profile.rubric_version == "cyntra-v1"
        assert profile["analytical_perspective"].value == "top_down"
        assert profile["scope_approach"].value == "local"
        assert profile["reasoning_type"].value == "deductive"
        assert profile["idea_development"].value == "linear"

    def test_from_pattern_string_with_confidence(self):
        """Test confidence setting in from_pattern_string."""
        profile = StrategyProfile.from_pattern_string("top_down, global", confidence=0.9)
        assert profile["analytical_perspective"].confidence == 0.9
        assert profile["scope_approach"].confidence == 0.9

    def test_from_pattern_string_normalized_case(self):
        """Test that patterns are case-normalized."""
        profile = StrategyProfile.from_pattern_string("TOP_DOWN, Local")
        assert profile["analytical_perspective"].value == "top_down"
        assert profile["scope_approach"].value == "local"

    def test_from_pattern_string_with_hyphens(self):
        """Test that hyphens are normalized to underscores."""
        profile = StrategyProfile.from_pattern_string("top-down, bottom-up")
        # First dimension should match top_down
        assert profile["analytical_perspective"].value == "top_down"

    def test_from_pattern_string_partial(self):
        """Test with fewer patterns than dimensions."""
        profile = StrategyProfile.from_pattern_string("top_down")
        assert len(profile.dimensions) == 1
        assert "analytical_perspective" in profile

    def test_from_pattern_string_extraction_method(self):
        """Test that extraction method is set to self_report."""
        profile = StrategyProfile.from_pattern_string("top_down, local")
        assert profile.extraction_method == "self_report"

    def test_from_pattern_string_with_kwargs(self):
        """Test passing additional kwargs."""
        profile = StrategyProfile.from_pattern_string(
            "top_down, local",
            workcell_id="wc-001",
            issue_id="issue-123",
        )
        assert profile.workcell_id == "wc-001"
        assert profile.issue_id == "issue-123"

    def test_from_pattern_string_unrecognized_skipped(self):
        """Test that unrecognized patterns are skipped."""
        # "unknown" won't match either pattern for analytical_perspective
        profile = StrategyProfile.from_pattern_string("unknown, local")
        # First dimension skipped, but second should match
        assert "scope_approach" in profile
        assert profile["scope_approach"].value == "local"
