"""
Bench loader for GEPA runs.
"""

from __future__ import annotations

import importlib
import importlib.util
from pathlib import Path
from typing import Any


def load_bench(bench_ref: str) -> dict[str, Any]:
    """
    Load a bench config from a module path or file path.

    The bench module must expose either:
    - `get_bench()` returning a dict
    - `BENCH` dict
    """
    if bench_ref.endswith(".py"):
        path = Path(bench_ref)
        if not path.exists():
            raise FileNotFoundError(f"Bench file not found: {bench_ref}")
        spec = importlib.util.spec_from_file_location(path.stem, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Failed to load bench module from {bench_ref}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    else:
        module = importlib.import_module(bench_ref)

    if hasattr(module, "get_bench"):
        bench = module.get_bench()
    elif hasattr(module, "BENCH"):
        bench = module.BENCH
    else:
        raise AttributeError("Bench module must define get_bench() or BENCH")

    if not isinstance(bench, dict):
        raise TypeError("Bench must be a dict")
    return bench
