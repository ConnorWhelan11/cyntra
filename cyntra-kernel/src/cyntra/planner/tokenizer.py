from __future__ import annotations

import hashlib
from collections.abc import Iterable
from typing import Any

from cyntra.planner.keywords import extract_keywords

PAD = "[PAD]"
UNK = "[UNK]"
BOS = "[BOS]"
SEP = "[SEP]"
EOS = "[EOS]"
EQUALS = "[=]"

TAG_BUCKETS = 1024
KW_BUCKETS = 1024
FAIL_BUCKETS = 1024
GATE_BUCKETS = 1024


def key_token(name: str) -> str:
    return f"[KEY:{name}]"


def val_token(namespace: str, value: str) -> str:
    return f"[VAL:{namespace}:{value}]"


def _stable_bucket(value: str, *, salt: str, buckets: int) -> int:
    digest = hashlib.sha256(f"{salt}:{value}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % buckets


def tag_hash_token(tag: str) -> str:
    return f"[TAG_HASH_{_stable_bucket(tag, salt='tag', buckets=TAG_BUCKETS)}]"


def kw_hash_token(keyword: str) -> str:
    return f"[KW_HASH_{_stable_bucket(keyword, salt='kw', buckets=KW_BUCKETS)}]"


def fail_hash_token(code: str) -> str:
    return f"[FAIL_HASH_{_stable_bucket(code, salt='fail', buckets=FAIL_BUCKETS)}]"


def gate_hash_token(gate_name: str) -> str:
    return f"[GATE_HASH_{_stable_bucket(gate_name, salt='gate', buckets=GATE_BUCKETS)}]"


def run_index_token(index: int) -> str:
    return f"[RUN_{index}]"


def _safe_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _kv(out: list[str], key: str, value: str | None, namespace: str) -> None:
    out.append(key_token(key))
    out.append(EQUALS)
    out.append(val_token(namespace, value if value is not None else "NONE"))


def tokenize_planner_input(
    planner_input: dict[str, Any],
    *,
    max_similar_runs: int = 8,
    max_tokens_per_run_summary: int = 64,
    max_tokens: int = 1024,
) -> list[str]:
    """
    Deterministic tokenization of `planner_input.v1` into a bounded token sequence.
    """
    out: list[str] = [BOS]

    universe_id = _safe_str(planner_input.get("universe_id"))
    job_type = _safe_str(planner_input.get("job_type"))
    defaults = planner_input.get("universe_defaults")
    defaults = defaults if isinstance(defaults, dict) else {}

    _kv(out, "UNIVERSE_ID", universe_id, "UNIVERSE_ID")
    _kv(out, "JOB_TYPE", job_type, "JOB_TYPE")
    _kv(out, "DEFAULT_SWARM_ID", _safe_str(defaults.get("swarm_id")), "SWARM_ID")

    objective_id = _safe_str(defaults.get("objective_id"))
    if objective_id is not None:
        out.append(key_token("DEFAULT_OBJECTIVE"))
        out.append(EQUALS)
        out.append(kw_hash_token(objective_id))

    out.append(SEP)

    issue = planner_input.get("issue")
    issue = issue if isinstance(issue, dict) else {}

    _kv(out, "DK_PRIORITY", _safe_str(issue.get("dk_priority")), "DK_PRIORITY")
    _kv(out, "DK_RISK", _safe_str(issue.get("dk_risk")), "DK_RISK")
    _kv(out, "DK_SIZE", _safe_str(issue.get("dk_size")), "DK_SIZE")
    _kv(out, "DK_TOOL_HINT", _safe_str(issue.get("dk_tool_hint")), "TOOLCHAIN")

    tags_value = issue.get("tags")
    tags: list[str] = [t for t in tags_value if isinstance(t, str) and t] if isinstance(tags_value, list) else []
    if tags:
        out.append(key_token("TAGS"))
        out.append(EQUALS)
        out.extend(sorted({tag_hash_token(t) for t in tags}))

    keywords = []
    kw_value = issue.get("keywords")
    if isinstance(kw_value, list):
        keywords = [k for k in kw_value if isinstance(k, str) and k]
    else:
        title = _safe_str(issue.get("title")) or ""
        desc = _safe_str(issue.get("description")) or ""
        keywords = extract_keywords(f"{title}\n{desc}", max_keywords=16)

    if keywords:
        out.append(key_token("KEYWORDS"))
        out.append(EQUALS)
        out.extend(sorted({kw_hash_token(k) for k in keywords}))

    out.append(SEP)

    system_state = planner_input.get("system_state")
    if isinstance(system_state, dict):
        for key, ns in [
            ("active_workcells_bin", "BIN"),
            ("queue_depth_bin", "BIN"),
            ("hour_bucket", "HOUR"),
            ("budget_remaining_bin", "BIN"),
        ]:
            _kv(out, key.upper(), _safe_str(system_state.get(key)), ns)

        available_toolchains = system_state.get("available_toolchains")
        if isinstance(available_toolchains, list) and available_toolchains:
            out.append(key_token("AVAILABLE_TOOLCHAINS"))
            out.append(EQUALS)
            for tc in sorted({t for t in available_toolchains if isinstance(t, str) and t}):
                out.append(val_token("TOOLCHAIN", tc))

    out.append(SEP)

    history = planner_input.get("history")
    history = history if isinstance(history, dict) else {}
    runs = history.get("last_n_similar_runs")
    runs_list: list[dict[str, Any]] = [r for r in runs if isinstance(r, dict)] if isinstance(runs, list) else []

    # Sequence layout expects most recent first. Ensure order is stable.
    runs_list.sort(key=lambda r: (-int(r.get("started_ms") or 0), str(r.get("run_id") or "")))
    runs_list = runs_list[: max_similar_runs]

    for idx, run in enumerate(runs_list):
        before = len(out)
        out.append(run_index_token(idx))

        outcome = run.get("outcome")
        outcome = outcome if isinstance(outcome, dict) else {}
        _kv(out, "OUTCOME_STATUS", _safe_str(outcome.get("status")), "STATUS")

        action = run.get("action_executed")
        action = action if isinstance(action, dict) else {}
        _kv(out, "EXEC_SWARM_ID", _safe_str(action.get("swarm_id")), "SWARM_ID")

        runtime = run.get("runtime")
        runtime = runtime if isinstance(runtime, dict) else {}
        duration = runtime.get("duration_ms")
        if isinstance(duration, int) and duration >= 0:
            out.append(key_token("DURATION_BIN"))
            out.append(EQUALS)
            out.append(val_token("DURATION_BIN", _duration_bin(duration)))

        fail_codes = outcome.get("fail_codes")
        fail_list = [c for c in fail_codes if isinstance(c, str) and c] if isinstance(fail_codes, list) else []
        if fail_list:
            out.append(key_token("FAIL_CODES"))
            out.append(EQUALS)
            out.extend(sorted({fail_hash_token(c) for c in fail_list[:8]}))

        gates = outcome.get("gates")
        gates_list = [g for g in gates if isinstance(g, dict)] if isinstance(gates, list) else []
        failing_gates: list[str] = []
        for g in gates_list:
            passed = g.get("passed")
            name = g.get("name")
            if passed is False and isinstance(name, str) and name:
                failing_gates.append(name)
        if failing_gates:
            out.append(key_token("FAIL_GATES"))
            out.append(EQUALS)
            out.extend(sorted({gate_hash_token(n) for n in failing_gates[:8]}))

        # Cap run block length deterministically.
        after = len(out)
        if after - before > max_tokens_per_run_summary:
            out = out[: before + max_tokens_per_run_summary]

        out.append(SEP)

        if len(out) >= max_tokens:
            out = out[: max_tokens]
            break

    if out and out[-1] == SEP:
        out.pop()
    out.append(EOS)

    return out[:max_tokens]


def _duration_bin(duration_ms: int) -> str:
    seconds = duration_ms / 1000.0
    if seconds < 1:
        return "LT_1S"
    if seconds < 10:
        return "1_10S"
    if seconds < 30:
        return "10_30S"
    if seconds < 60:
        return "30_60S"
    if seconds < 5 * 60:
        return "1_5M"
    if seconds < 30 * 60:
        return "5_30M"
    return "GE_30M"


def fixed_hash_bucket_tokens(*, prefix: str, buckets: int) -> list[str]:
    return [f"[{prefix}_{i}]" for i in range(buckets)]


def fixed_special_tokens() -> list[str]:
    return [PAD, UNK, BOS, SEP, EOS, EQUALS]


def fixed_run_index_tokens(max_runs: int = 16) -> list[str]:
    return [run_index_token(i) for i in range(max_runs)]


def fixed_hash_tokens() -> list[str]:
    return (
        [f"[TAG_HASH_{i}]" for i in range(TAG_BUCKETS)]
        + [f"[KW_HASH_{i}]" for i in range(KW_BUCKETS)]
        + [f"[FAIL_HASH_{i}]" for i in range(FAIL_BUCKETS)]
        + [f"[GATE_HASH_{i}]" for i in range(GATE_BUCKETS)]
    )


def iter_fixed_tokens() -> Iterable[str]:
    yield from fixed_special_tokens()
    yield from fixed_run_index_tokens()
    yield from fixed_hash_tokens()
