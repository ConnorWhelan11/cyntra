from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cyntra.universe.run_context import read_run_context


def _read_json_dict(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    return raw


def _parse_iso_to_ms(raw: object) -> int | None:
    if not isinstance(raw, str) or not raw:
        return None
    candidate = raw.strip()
    if candidate.endswith("Z"):
        candidate = candidate.removesuffix("Z") + "+00:00"
    try:
        dt = datetime.fromisoformat(candidate)
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp() * 1000)


def _infer_started_ms(run_dir: Path, run_id: str) -> int | None:
    meta = _read_json_dict(run_dir / "run_meta.json")
    if meta is not None and isinstance(meta.get("started_ms"), int):
        return meta["started_ms"]

    manifest = _read_json_dict(run_dir / "manifest.json")
    if manifest is not None:
        created_ms = _parse_iso_to_ms(manifest.get("created_at"))
        if created_ms is not None:
            return created_ms

    verdict = _read_json_dict(run_dir / "verdict" / "gate_verdict.json")
    if verdict is not None:
        timing = verdict.get("timing")
        if isinstance(timing, dict):
            started_at = _parse_iso_to_ms(timing.get("started_at"))
            if started_at is not None:
                return started_at

    if run_id.startswith("run_"):
        parts = run_id.split("_", 2)
        if len(parts) >= 2 and parts[1].isdigit():
            try:
                return int(parts[1])
            except Exception:
                return None

    return None


def _iso_z(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=UTC).isoformat().replace("+00:00", "Z")


def _signature_hash(signature: str) -> str:
    return hashlib.sha256(signature.encode("utf-8")).hexdigest()[:8]


def _ngrams(sequence: tuple[str, ...], n: int) -> Iterable[tuple[str, ...]]:
    if len(sequence) < n:
        return ()
    return (sequence[i : i + n] for i in range(len(sequence) - n + 1))


def _read_tool_sequence(run_dir: Path) -> tuple[str, ...]:
    tools_path = run_dir / "tools.jsonl"
    if not tools_path.exists():
        return ()
    sequence: list[str] = []
    for line in tools_path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
        except Exception:
            continue
        if not isinstance(entry, dict):
            continue
        tool = entry.get("tool")
        if isinstance(tool, str) and tool:
            sequence.append(tool)
    return tuple(sequence)


def _infer_success(run_dir: Path, fab_verdict: dict[str, Any] | None) -> bool | None:
    if fab_verdict is not None:
        verdict = fab_verdict.get("verdict")
        if verdict == "pass":
            return True
        if verdict in ("fail", "escalate"):
            return False

    job_result = _read_json_dict(run_dir / "job_result.json")
    if job_result is not None and isinstance(job_result.get("exit_code"), int):
        return job_result["exit_code"] == 0

    return None


def _decayed_confidence(
    base_confidence: float,
    *,
    last_seen_ms: int | None,
    reference_ms: int | None,
    decay_per_day: float = 0.95,
) -> float:
    if last_seen_ms is None or reference_ms is None:
        return base_confidence
    if reference_ms <= last_seen_ms:
        return base_confidence
    age_days = (reference_ms - last_seen_ms) / (1000 * 60 * 60 * 24)
    decayed = base_confidence * (decay_per_day**age_days)
    return float(max(0.0, min(1.0, decayed)))


@dataclass(frozen=True)
class _RunEvidence:
    run_id: str
    started_ms: int | None
    success: bool | None
    tool_sequence: tuple[str, ...]
    universe_id: str
    world_id: str | None
    objective_id: str | None
    fab_verdict: dict[str, Any] | None


def build_patterns_store(
    *,
    universe_id: str,
    runs_dir: Path,
    output_path: Path,
    min_frequency: int = 2,
    max_evidence_runs: int = 5,
) -> tuple[Path, int]:
    """
    Rebuild `.cyntra/universes/<universe_id>/patterns/patterns.jsonl` by scanning `.cyntra/runs/`.

    The output is deterministic relative to the available run artifacts. Confidence decay is
    computed against the most recent run timestamp in the scanned set (not wall-clock time).
    """
    runs_dir = runs_dir.resolve()
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    evidence: list[_RunEvidence] = []
    if runs_dir.exists():
        for run_dir in sorted((p for p in runs_dir.iterdir() if p.is_dir()), key=lambda p: p.name):
            ctx = read_run_context(run_dir)
            if ctx is None or ctx.universe_id != universe_id:
                continue

            run_id = run_dir.name
            started_ms = _infer_started_ms(run_dir, run_id)
            fab_verdict = _read_json_dict(run_dir / "verdict" / "gate_verdict.json")
            success = _infer_success(run_dir, fab_verdict)
            tool_sequence = _read_tool_sequence(run_dir)

            evidence.append(
                _RunEvidence(
                    run_id=run_id,
                    started_ms=started_ms,
                    success=success,
                    tool_sequence=tool_sequence,
                    universe_id=ctx.universe_id,
                    world_id=ctx.world_id,
                    objective_id=ctx.objective_id,
                    fab_verdict=fab_verdict,
                )
            )

    reference_ms: int | None = None
    started_values = [e.started_ms for e in evidence if e.started_ms is not None]
    if started_values:
        reference_ms = max(started_values)

    def _group_key(item: _RunEvidence) -> tuple[str | None, str | None]:
        return item.world_id, item.objective_id

    patterns: list[dict[str, Any]] = []

    for world_id, objective_id in sorted(
        {(_group_key(e)) for e in evidence}, key=lambda k: (k[0] or "", k[1] or "")
    ):
        group = [e for e in evidence if _group_key(e) == (world_id, objective_id)]

        # Tool-chain patterns from tools.jsonl (when available).
        ngram_runs: dict[tuple[str, ...], list[_RunEvidence]] = {}
        for run in group:
            seq = run.tool_sequence
            if len(seq) < 2:
                continue
            for n in range(2, min(6, len(seq) + 1)):
                for ngram in _ngrams(seq, n):
                    ngram_runs.setdefault(ngram, []).append(run)

        for ngram, runs in ngram_runs.items():
            if len(runs) < min_frequency:
                continue
            signature = " -> ".join(ngram)
            successes = sum(1 for r in runs if r.success is True)
            failures = sum(1 for r in runs if r.success is False)
            unknown = len(runs) - successes - failures

            total = max(1, successes + failures)
            success_rate = successes / total

            evidence_sorted = sorted(
                runs,
                key=lambda r: (r.started_ms or 0, r.run_id),
                reverse=True,
            )
            evidence_runs = [r.run_id for r in evidence_sorted[:max_evidence_runs]]
            last_seen_ms = evidence_sorted[0].started_ms if evidence_sorted else None

            base_confidence = float(max(0.0, min(1.0, success_rate)))
            confidence = _decayed_confidence(
                base_confidence, last_seen_ms=last_seen_ms, reference_ms=reference_ms
            )

            domain = "fab_world" if world_id else "code"

            patterns.append(
                {
                    "schema_version": "1.0",
                    "pattern_id": f"tc_{_signature_hash(signature)}",
                    "pattern_kind": "pattern",
                    "pattern_type": "tool_chain",
                    "domain": domain,
                    "signature": signature,
                    "recommended_action": f"Prefer tool chain: {signature}",
                    "frequency": len(runs),
                    "success_rate": success_rate,
                    "confidence": confidence,
                    "outcome_distribution": {
                        "success": successes,
                        "failure": failures,
                        "unknown": unknown,
                    },
                    "evidence_runs": evidence_runs,
                    "last_updated_at": _iso_z(last_seen_ms),
                    "universe_id": universe_id,
                    "world_id": world_id,
                    "objective_id": objective_id,
                }
            )

        # Fab gate failure code anti-patterns (when gate verdicts exist).
        fail_runs: dict[str, list[_RunEvidence]] = {}
        for run in group:
            verdict = run.fab_verdict
            if verdict is None or verdict.get("verdict") == "pass":
                continue
            failures = verdict.get("failures")
            if not isinstance(failures, dict):
                continue
            for bucket in ("hard", "soft"):
                items = failures.get(bucket) or []
                if not isinstance(items, list):
                    continue
                for code in items:
                    if not isinstance(code, str) or not code:
                        continue
                    fail_runs.setdefault(code, []).append(run)

        for fail_code, runs in sorted(fail_runs.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            if len(runs) < min_frequency:
                continue

            evidence_sorted = sorted(
                runs,
                key=lambda r: (r.started_ms or 0, r.run_id),
                reverse=True,
            )
            evidence_runs = [r.run_id for r in evidence_sorted[:max_evidence_runs]]
            last_seen_ms = evidence_sorted[0].started_ms if evidence_sorted else None

            base_confidence = 1.0
            confidence = _decayed_confidence(
                base_confidence, last_seen_ms=last_seen_ms, reference_ms=reference_ms
            )

            patterns.append(
                {
                    "schema_version": "1.0",
                    "pattern_id": f"fail_{_signature_hash(fail_code)}",
                    "pattern_kind": "anti_pattern",
                    "pattern_type": "fab_fail_code",
                    "domain": "fab_world",
                    "signature": fail_code,
                    "recommended_action": f"Address Fab failure code: {fail_code}",
                    "frequency": len(runs),
                    "success_rate": None,
                    "confidence": confidence,
                    "outcome_distribution": {"failure": len(runs)},
                    "evidence_runs": evidence_runs,
                    "last_updated_at": _iso_z(last_seen_ms),
                    "universe_id": universe_id,
                    "world_id": world_id,
                    "objective_id": objective_id,
                }
            )

    patterns.sort(
        key=lambda r: (
            str(r.get("world_id") or ""),
            str(r.get("objective_id") or ""),
            str(r.get("pattern_kind") or ""),
            str(r.get("pattern_type") or ""),
            -(int(r.get("frequency") or 0)),
            str(r.get("pattern_id") or ""),
        )
    )

    payload = "\n".join(json.dumps(row, sort_keys=True) for row in patterns)
    if payload:
        payload += "\n"
    output_path.write_text(payload, encoding="utf-8")

    return output_path, len(patterns)
