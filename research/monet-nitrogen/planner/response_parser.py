"""Parse and extract JSON from Monet planner responses."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from schemas.planner_output import PlannerOutput

logger = logging.getLogger(__name__)


def extract_json_from_text(text: str) -> dict[str, Any] | None:
    """Extract JSON object from text using multiple strategies.

    Tries increasingly aggressive extraction methods:
    1. Direct JSON parse
    2. Extract from markdown code block
    3. Find any JSON object pattern
    4. Find JSON after common prefixes

    Args:
        text: Raw text that may contain JSON

    Returns:
        Parsed JSON dict or None if extraction fails
    """
    text = text.strip()

    # Strategy 1: Direct parse (text is pure JSON)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Extract from markdown code block
    code_block_patterns = [
        r"```json\s*([\s\S]*?)\s*```",
        r"```\s*([\s\S]*?)\s*```",
    ]
    for pattern in code_block_patterns:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

    # Strategy 3: Find any complete JSON object
    # Look for balanced braces
    json_pattern = r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}"
    matches = re.findall(json_pattern, text)
    for match in matches:
        try:
            return json.loads(match)
        except json.JSONDecodeError:
            continue

    # Strategy 4: More aggressive - find from first { to last }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace : last_brace + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # Strategy 5: Try to fix common JSON errors
    fixed = _fix_common_json_errors(text)
    if fixed != text:
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

    logger.warning(f"Failed to extract JSON from text: {text[:200]}...")
    return None


def _fix_common_json_errors(text: str) -> str:
    """Attempt to fix common JSON formatting errors.

    Args:
        text: Potentially malformed JSON string

    Returns:
        Fixed string (may still be invalid JSON)
    """
    # Find JSON portion
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace == -1 or last_brace == -1:
        return text

    json_str = text[first_brace : last_brace + 1]

    # Fix: trailing commas before closing braces/brackets
    json_str = re.sub(r",\s*([}\]])", r"\1", json_str)

    # Fix: single quotes instead of double quotes
    # Be careful not to break strings that contain apostrophes
    json_str = re.sub(r"'([^']*)':", r'"\1":', json_str)
    json_str = re.sub(r":\s*'([^']*)'([,}\]])", r': "\1"\2', json_str)

    # Fix: unquoted keys
    json_str = re.sub(r"([{,]\s*)(\w+)(\s*:)", r'\1"\2"\3', json_str)

    # Fix: True/False/None to JSON equivalents
    json_str = re.sub(r"\bTrue\b", "true", json_str)
    json_str = re.sub(r"\bFalse\b", "false", json_str)
    json_str = re.sub(r"\bNone\b", "null", json_str)

    return json_str


def parse_planner_response(text: str) -> PlannerOutput | None:
    """Parse a Monet planner response into a PlannerOutput.

    Args:
        text: Raw text response from Monet

    Returns:
        Validated PlannerOutput or None if parsing/validation fails
    """
    # Extract JSON
    data = extract_json_from_text(text)
    if data is None:
        return None

    # Validate and create PlannerOutput
    try:
        # Handle missing optional fields
        if "constraints" not in data:
            data["constraints"] = []

        # Ensure timestamp exists
        if "timestamp_ms" not in data:
            import time

            data["timestamp_ms"] = int(time.time() * 1000)

        return PlannerOutput(**data)

    except Exception as e:
        logger.warning(f"Failed to validate planner output: {e}")
        logger.debug(f"Data was: {data}")
        return None


def parse_planner_response_lenient(text: str) -> tuple[PlannerOutput | None, list[str]]:
    """Parse with detailed error reporting.

    Args:
        text: Raw text response

    Returns:
        Tuple of (parsed output or None, list of warning/error messages)
    """
    messages: list[str] = []

    data = extract_json_from_text(text)
    if data is None:
        messages.append("ERROR: Failed to extract JSON from response")
        return None, messages

    # Check required fields
    required = ["intent", "target", "skill", "confidence"]
    missing = [f for f in required if f not in data]
    if missing:
        messages.append(f"WARNING: Missing required fields: {missing}")

    # Add defaults for missing fields
    if "constraints" not in data:
        data["constraints"] = []
        messages.append("INFO: Added empty constraints list")

    if "timestamp_ms" not in data:
        import time

        data["timestamp_ms"] = int(time.time() * 1000)
        messages.append("INFO: Added timestamp_ms")

    # Try to create output
    try:
        output = PlannerOutput(**data)
        return output, messages
    except Exception as e:
        messages.append(f"ERROR: Validation failed: {e}")
        return None, messages
