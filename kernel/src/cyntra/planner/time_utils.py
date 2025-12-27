from __future__ import annotations

from datetime import UTC, datetime


def utc_now_rfc3339() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def parse_rfc3339_to_ms(value: str) -> int | None:
    """
    Parse RFC3339-ish timestamps into epoch milliseconds.

    Returns None if parsing fails.
    """
    if not value:
        return None
    text = value.strip()
    # Normalize common forms.
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp() * 1000)


def ms_to_rfc3339(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=UTC)
    return dt.isoformat().replace("+00:00", "Z")
