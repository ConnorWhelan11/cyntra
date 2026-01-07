"""Tests for strategy profiler extraction."""

import pytest

from cyntra.strategy import CYNTRA_V1_RUBRIC
from cyntra.strategy.profiler import (
    extract_from_self_report,
    extract_from_tool_usage,
    extract_profile,
    get_strategy_prompt_section,
    get_strategy_prompt_section_compact,
    _extract_strategy_text,
    _normalize_pattern,
    _parse_ordered_patterns,
    _parse_keyed_patterns,
)


class TestPromptGeneration:
    """Tests for strategy prompt section generation."""

    def test_get_strategy_prompt_section(self):
        """Test that prompt section contains all dimensions."""
        prompt = get_strategy_prompt_section()

        # Should contain header
        assert "Strategy Self-Report" in prompt
        assert "<strategy>" in prompt

        # Should contain all dimension names
        for dim in CYNTRA_V1_RUBRIC:
            assert dim.name in prompt
            assert dim.pattern_a in prompt
            assert dim.pattern_b in prompt

    def test_get_strategy_prompt_section_compact(self):
        """Test compact prompt section is shorter."""
        full = get_strategy_prompt_section()
        compact = get_strategy_prompt_section_compact()

        assert len(compact) < len(full)
        assert "<strategy>" in compact
        assert "Strategy Telemetry" in compact

    def test_prompt_contains_example_format(self):
        """Test that prompt shows example format."""
        prompt = get_strategy_prompt_section()
        assert "top_down" in prompt  # First pattern should be in example


class TestExtractStrategyText:
    """Tests for raw strategy text extraction."""

    def test_extract_strategy_block(self):
        """Test extracting from <strategy> block."""
        text = """
        Here is my analysis...

        <strategy>
        top_down, local, deductive, linear, continuous, proactive,
        detailed_plan, targeted_tools, preventive, heavy_context,
        minimal_surgical, gate_driven
        </strategy>

        That completes the task.
        """
        result = _extract_strategy_text(text)
        assert result is not None
        assert "top_down" in result
        assert "local" in result

    def test_extract_strategy_block_case_insensitive(self):
        """Test case-insensitive tag matching."""
        text = "<STRATEGY>top_down, local</STRATEGY>"
        result = _extract_strategy_text(text)
        assert result is not None
        assert "top_down" in result

    def test_extract_strategy_inline(self):
        """Test extracting from inline format."""
        text = "strategy: top_down, local, deductive\nDone."
        result = _extract_strategy_text(text)
        assert result is not None
        assert "top_down" in result

    def test_no_strategy_returns_none(self):
        """Test that missing strategy returns None."""
        text = "Just some regular text without any strategy block."
        result = _extract_strategy_text(text)
        assert result is None


class TestNormalizePattern:
    """Tests for pattern normalization."""

    def test_lowercase(self):
        """Test lowercase conversion."""
        assert _normalize_pattern("TOP_DOWN") == "top_down"

    def test_hyphen_to_underscore(self):
        """Test hyphen conversion."""
        assert _normalize_pattern("top-down") == "top_down"

    def test_space_to_underscore(self):
        """Test space conversion."""
        assert _normalize_pattern("top down") == "top_down"

    def test_strip_whitespace(self):
        """Test whitespace stripping."""
        assert _normalize_pattern("  top_down  ") == "top_down"

    def test_combined_normalization(self):
        """Test combined normalizations."""
        assert _normalize_pattern("  Top-Down  ") == "top_down"


class TestParseOrderedPatterns:
    """Tests for ordered pattern parsing."""

    def test_parse_full_pattern_string(self):
        """Test parsing a full 12-pattern string."""
        pattern_str = (
            "top_down, local, deductive, linear, continuous, proactive, "
            "detailed_plan, targeted_tools, preventive, heavy_context, "
            "minimal_surgical, gate_driven"
        )
        result = _parse_ordered_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        assert len(result) == 12
        assert result["analytical_perspective"].value == "top_down"
        assert result["scope_approach"].value == "local"
        assert result["reasoning_type"].value == "deductive"

    def test_parse_partial_patterns(self):
        """Test parsing fewer patterns than dimensions."""
        pattern_str = "top_down, global, inductive"
        result = _parse_ordered_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        assert len(result) == 3
        assert result["analytical_perspective"].value == "top_down"
        assert result["scope_approach"].value == "global"
        assert result["reasoning_type"].value == "inductive"

    def test_parse_with_variations(self):
        """Test parsing with hyphenated and cased variations."""
        pattern_str = "Top-Down, LOCAL, Deductive"
        result = _parse_ordered_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        assert result["analytical_perspective"].value == "top_down"
        assert result["scope_approach"].value == "local"
        assert result["reasoning_type"].value == "deductive"

    def test_parse_skips_unrecognized(self):
        """Test that unrecognized patterns are skipped."""
        pattern_str = "unknown_pattern, local, another_unknown"
        result = _parse_ordered_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        # Only "local" should match (second dimension)
        assert "scope_approach" in result
        assert result["scope_approach"].value == "local"
        # First and third dimensions should be missing
        assert "analytical_perspective" not in result


class TestParseKeyedPatterns:
    """Tests for keyed pattern parsing."""

    def test_parse_keyed_format(self):
        """Test parsing key:value format."""
        pattern_str = "analytical_perspective:top_down, scope_approach:local"
        result = _parse_keyed_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        assert result["analytical_perspective"].value == "top_down"
        assert result["scope_approach"].value == "local"

    def test_parse_keyed_with_variations(self):
        """Test keyed format with normalization."""
        pattern_str = "analytical-perspective:TOP_DOWN, scope-approach:LOCAL"
        result = _parse_keyed_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        assert result["analytical_perspective"].value == "top_down"
        assert result["scope_approach"].value == "local"

    def test_parse_keyed_out_of_order(self):
        """Test that keyed format doesn't require order."""
        pattern_str = "diff_strategy:minimal_surgical, analytical_perspective:bottom_up"
        result = _parse_keyed_patterns(pattern_str, CYNTRA_V1_RUBRIC)

        assert result["diff_strategy"].value == "minimal_surgical"
        assert result["analytical_perspective"].value == "bottom_up"


class TestExtractFromSelfReport:
    """Tests for full self-report extraction."""

    def test_extract_from_strategy_block(self):
        """Test extraction from strategy block."""
        text = """
        Task completed successfully.

        <strategy>
        top_down, local, deductive, linear, continuous, proactive,
        detailed_plan, targeted_tools, preventive, heavy_context,
        minimal_surgical, gate_driven
        </strategy>
        """
        profile = extract_from_self_report(text)

        assert profile is not None
        assert profile.rubric_version == "cyntra-v1"
        assert profile.extraction_method == "self_report"
        assert profile["analytical_perspective"].value == "top_down"
        assert len(profile.dimensions) == 12

    def test_extract_with_metadata(self):
        """Test extraction with additional metadata."""
        text = "<strategy>top_down, local</strategy>"
        profile = extract_from_self_report(
            text,
            workcell_id="wc-001",
            issue_id="issue-123",
            model="claude-opus",
            toolchain="claude",
        )

        assert profile is not None
        assert profile.workcell_id == "wc-001"
        assert profile.issue_id == "issue-123"
        assert profile.model == "claude-opus"
        assert profile.toolchain == "claude"

    def test_extract_returns_none_without_strategy(self):
        """Test that extraction returns None without strategy block."""
        text = "Just a regular response without strategy."
        profile = extract_from_self_report(text)
        assert profile is None

    def test_extract_confidence_scoring(self):
        """Test that confidence is set appropriately."""
        text = "<strategy>top_down, local</strategy>"
        profile = extract_from_self_report(text)

        assert profile is not None
        # Exact matches should have high confidence
        assert profile["analytical_perspective"].confidence >= 0.9
        assert profile["scope_approach"].confidence >= 0.9

    def test_extract_partial_match_lower_confidence(self):
        """Test that partial matches have lower confidence."""
        # "topdown" is not exact match but should partially match
        text = "<strategy>topdown, local</strategy>"
        profile = extract_from_self_report(text)

        assert profile is not None
        # Partial match should have lower confidence
        if "analytical_perspective" in profile:
            assert profile["analytical_perspective"].confidence < 0.9


class TestExtractFromToolUsage:
    """Tests for heuristic extraction from tool usage."""

    def test_extract_heavy_context_usage(self):
        """Test detection of heavy context usage."""
        commands = [
            {"tool": "Read", "content": "file1.py"},
            {"tool": "Read", "content": "file2.py"},
            {"tool": "Grep", "content": "search"},
            {"tool": "Read", "content": "file3.py"},
            {"tool": "Edit", "new_string": "small change"},
        ]
        profile = extract_from_tool_usage(commands)

        assert profile is not None
        assert profile.extraction_method == "heuristic"
        assert "context_usage" in profile
        # 4 read/search out of 5 = 80% -> heavy_context
        assert profile["context_usage"].value == "heavy_context"

    def test_extract_minimal_context_usage(self):
        """Test detection of minimal context usage."""
        commands = [
            {"tool": "Edit", "new_string": "change1\nline2\nline3"},
            {"tool": "Edit", "new_string": "change2"},
            {"tool": "Bash", "content": "npm test"},
        ]
        profile = extract_from_tool_usage(commands)

        assert profile is not None
        assert "context_usage" in profile
        # 0 read/search out of 3 = 0% -> minimal_context
        assert profile["context_usage"].value == "minimal_context"

    def test_extract_exploratory_tools(self):
        """Test detection of exploratory tool strategy."""
        commands = [
            {"tool": "Glob", "content": "**/*.py"},
            {"tool": "Grep", "content": "pattern"},
            {"tool": "Grep", "content": "another"},
            {"tool": "Read", "content": "file.py"},
        ]
        profile = extract_from_tool_usage(commands)

        assert profile is not None
        assert "tool_strategy" in profile
        # 2 search out of 4 = 50% -> exploratory
        assert profile["tool_strategy"].value == "exploratory_tools"

    def test_extract_targeted_tools(self):
        """Test detection of targeted tool strategy."""
        commands = [
            {"tool": "Read", "content": "specific_file.py"},
            {"tool": "Edit", "new_string": "fix"},
            {"tool": "Bash", "content": "pytest"},
        ]
        profile = extract_from_tool_usage(commands)

        assert profile is not None
        assert "tool_strategy" in profile
        # 0 search out of 3 = 0% -> targeted
        assert profile["tool_strategy"].value == "targeted_tools"

    def test_extract_surgical_diffs(self):
        """Test detection of minimal surgical diff strategy."""
        commands = [
            {"tool": "Edit", "new_string": "line1\nline2"},
            {"tool": "Edit", "new_string": "small"},
        ]
        profile = extract_from_tool_usage(commands)

        assert profile is not None
        assert "diff_strategy" in profile
        # Avg ~2 lines -> minimal_surgical
        assert profile["diff_strategy"].value == "minimal_surgical"

    def test_extract_with_metadata(self):
        """Test heuristic extraction with metadata."""
        commands = [{"tool": "Read", "content": "file.py"}]
        profile = extract_from_tool_usage(
            commands,
            workcell_id="wc-001",
            model="codex",
        )

        assert profile is not None
        assert profile.workcell_id == "wc-001"
        assert profile.model == "codex"


class TestExtractProfile:
    """Tests for combined extraction function."""

    def test_prefers_self_report(self):
        """Test that self-report is preferred when available."""
        text = "<strategy>bottom_up, global</strategy>"
        commands = [{"tool": "Read"}] * 10  # Would suggest heavy_context

        profile = extract_profile(
            response_text=text,
            commands=commands,
            prefer_self_report=True,
        )

        assert profile is not None
        assert profile.extraction_method == "self_report"
        assert profile["analytical_perspective"].value == "bottom_up"

    def test_falls_back_to_heuristic(self):
        """Test fallback to heuristic when self-report unavailable."""
        text = "No strategy block here."
        commands = [{"tool": "Read"}] * 5

        profile = extract_profile(
            response_text=text,
            commands=commands,
        )

        assert profile is not None
        assert profile.extraction_method == "heuristic"

    def test_returns_none_with_no_data(self):
        """Test returns None when no extraction possible."""
        profile = extract_profile(
            response_text="No strategy.",
            commands=None,
        )
        assert profile is None

    def test_heuristic_only_mode(self):
        """Test forcing heuristic extraction."""
        text = "<strategy>top_down, local</strategy>"
        commands = [{"tool": "Read"}] * 5

        profile = extract_profile(
            response_text=text,
            commands=commands,
            prefer_self_report=False,
        )

        # Should still use self_report since commands will be tried first
        # But if we pass response_text=None, it forces heuristic
        profile2 = extract_profile(
            response_text=None,
            commands=commands,
        )

        assert profile2 is not None
        assert profile2.extraction_method == "heuristic"


class TestEdgeCases:
    """Tests for edge cases and robustness."""

    def test_empty_strategy_block(self):
        """Test handling of empty strategy block."""
        text = "<strategy></strategy>"
        profile = extract_from_self_report(text)
        # Should return profile but with no dimensions
        assert profile is None or len(profile.dimensions) == 0

    def test_malformed_patterns(self):
        """Test handling of malformed pattern strings."""
        text = "<strategy>,,, , ,</strategy>"
        profile = extract_from_self_report(text)
        assert profile is None or len(profile.dimensions) == 0

    def test_extra_whitespace(self):
        """Test handling of extra whitespace."""
        text = """
        <strategy>
            top_down  ,   local   ,    deductive
        </strategy>
        """
        profile = extract_from_self_report(text)
        assert profile is not None
        assert profile["analytical_perspective"].value == "top_down"

    def test_newlines_in_block(self):
        """Test handling of newlines in strategy block."""
        text = """<strategy>
top_down,
local,
deductive
</strategy>"""
        profile = extract_from_self_report(text)
        assert profile is not None
        assert len(profile.dimensions) >= 3

    def test_empty_commands_list(self):
        """Test heuristic extraction with empty commands."""
        profile = extract_from_tool_usage([])
        assert profile is not None
        # Should still return a profile, possibly empty

    def test_commands_without_tool_key(self):
        """Test handling of malformed command entries."""
        commands = [
            {"content": "something"},
            {"other": "field"},
        ]
        profile = extract_from_tool_usage(commands)
        assert profile is not None
