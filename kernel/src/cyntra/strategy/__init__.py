"""
Strategy Telemetry Module.

Provides infrastructure for analyzing and steering model reasoning strategies
based on the CoT Encyclopedia framework (arXiv:2505.10185).

Core components:
- StrategyRubric: Defines reasoning dimensions and their contrastive patterns
- StrategyProfile: Compact representation of a model's reasoning approach
- CYNTRA_V1_RUBRIC: Default rubric with 12 dimensions tailored to Cyntra
- Profiler: Extract profiles from agent self-reports or tool usage

Usage:
    from cyntra.strategy import StrategyProfile, CYNTRA_V1_RUBRIC

    # Create a profile
    profile = StrategyProfile(
        rubric_version="cyntra-v1",
        dimensions={
            "analytical_perspective": DimensionValue(value="top_down", confidence=0.85),
            ...
        }
    )

    # Serialize for storage
    json_str = profile.to_json()

    # Extract from agent response
    from cyntra.strategy import extract_from_self_report
    profile = extract_from_self_report(agent_response_text)
"""

from cyntra.strategy.rubric import (
    CYNTRA_V1_RUBRIC,
    StrategyDimension,
    StrategyRubric,
)
from cyntra.strategy.profile import (
    DimensionValue,
    StrategyProfile,
)
from cyntra.strategy.profiler import (
    extract_from_self_report,
    extract_from_tool_usage,
    extract_profile,
    get_strategy_prompt_section,
    get_strategy_prompt_section_compact,
)

__all__ = [
    # Rubric
    "StrategyDimension",
    "StrategyRubric",
    "CYNTRA_V1_RUBRIC",
    # Profile
    "DimensionValue",
    "StrategyProfile",
    # Profiler
    "extract_from_self_report",
    "extract_from_tool_usage",
    "extract_profile",
    "get_strategy_prompt_section",
    "get_strategy_prompt_section_compact",
]
