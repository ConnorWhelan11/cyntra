"""
Evaluation harness for GEPA prompt evolution.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import structlog

logger = structlog.get_logger()


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _resolve_gepa() -> Any:
    try:
        import dspy  # type: ignore
    except ImportError as exc:
        raise ImportError("dspy is not installed. Install with `pip install dspy-ai`.") from exc

    if hasattr(dspy, "GEPA"):
        return dspy.GEPA
    if hasattr(dspy, "optimizers") and hasattr(dspy.optimizers, "GEPA"):
        return dspy.optimizers.GEPA
    if hasattr(dspy, "teleprompt") and hasattr(dspy.teleprompt, "GEPA"):
        return dspy.teleprompt.GEPA

    raise AttributeError("dspy.GEPA not found in installed dspy package")


def _call_optimizer(
    optimizer: Any,
    program: Any,
    trainset: Any,
    devset: Any,
    metric: Callable[..., Any] | None,
) -> tuple[Any, dict[str, Any]]:
    method = None
    for name in ("compile", "optimize", "run"):
        if hasattr(optimizer, name):
            method = getattr(optimizer, name)
            break

    if method is None:
        raise AttributeError("GEPA optimizer has no compile/optimize/run method")

    attempts: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
    kwargs: dict[str, Any] = {}
    if metric is not None:
        kwargs["metric"] = metric
    if devset is not None:
        kwargs["devset"] = devset
        kwargs["dev"] = devset

    attempts.append(((program, trainset), dict(kwargs)))
    attempts.append(((program, trainset), {}))
    attempts.append(((program,), {**kwargs, "trainset": trainset}))
    attempts.append(((), {**kwargs, "program": program, "trainset": trainset}))

    last_error: Exception | None = None
    for args, kw in attempts:
        try:
            result = method(*args, **kw)
            meta = {"method": method.__name__, "args": len(args), "kwargs": list(kw.keys())}
            return result, meta
        except TypeError as exc:
            last_error = exc
            continue

    if last_error:
        raise last_error
    raise RuntimeError("GEPA optimizer invocation failed")


def _maybe_extract_program(result: Any) -> Any:
    if isinstance(result, tuple) and result:
        return result[0]
    return result


def _program_repr(program: Any) -> str:
    try:
        return repr(program)
    except Exception:
        return "<program>"


def run_gepa(
    *,
    program: Any,
    trainset: Any,
    devset: Any,
    metric: Callable[..., Any] | None,
    gepa_config: dict[str, Any] | None = None,
) -> tuple[Any, dict[str, Any]]:
    gepa_class = _resolve_gepa()
    optimizer = gepa_class(**(gepa_config or {}))

    result, meta = _call_optimizer(
        optimizer,
        program=program,
        trainset=trainset,
        devset=devset,
        metric=metric,
    )
    optimized = _maybe_extract_program(result)
    return optimized, meta


def evaluate_program(
    *,
    program: Any,
    dataset: Any,
    evaluate_fn: Callable[[Any, Any], dict[str, Any]] | None,
) -> dict[str, Any]:
    if evaluate_fn is None:
        logger.warning("No evaluate() provided; metrics will be empty")
        return {}
    return evaluate_fn(program, dataset)


def build_result_payload(
    *,
    genome_id: str,
    metrics: dict[str, Any],
    gepa_meta: dict[str, Any],
    program: Any,
) -> dict[str, Any]:
    return {
        "genome_id": genome_id,
        "metrics": metrics,
        "program_repr": _program_repr(program),
        "gepa_meta": gepa_meta,
        "generated_at": _utc_now(),
    }
