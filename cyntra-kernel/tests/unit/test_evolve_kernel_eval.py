"""Tests for evolve kernel evaluation helpers."""

from __future__ import annotations

from pathlib import Path

from cyntra.evolve.kernel_eval import CaseResult, aggregate_case_results, resolve_bench_issues
from cyntra.kernel.config import KernelConfig


def test_resolve_bench_issues_accepts_inline_case_dict(tmp_path: Path) -> None:
    config = KernelConfig(repo_root=tmp_path)
    bench = {
        "name": "inline_case_payload",
        "cases": [
            {
                "id": "cs01",
                "title": "Case 01",
                "description": "Do the thing.\n",
                "dk_apply_patch": False,
                "quality_gates": {"test": "pytest -q"},
            }
        ],
    }

    issues = resolve_bench_issues(config, bench)
    assert len(issues) == 1

    issue = issues[0]
    assert issue.id == "cs01"
    assert issue.title == "Case 01"
    assert issue.dk_apply_patch is False
    assert issue.dk_quality_gates == {"test": "pytest -q"}


def test_aggregate_case_results_sets_quality_and_cost_aliases() -> None:
    results = [
        CaseResult(
            issue_id="a",
            title="A",
            workcell_id="wc-a",
            toolchain="codex",
            status="success",
            verified=True,
            cost_usd=0.25,
            duration_ms=100,
            diff_lines=5,
        ),
        CaseResult(
            issue_id="b",
            title="B",
            workcell_id="wc-b",
            toolchain="codex",
            status="failed",
            verified=False,
            cost_usd=0.75,
            duration_ms=300,
            diff_lines=15,
        ),
    ]

    metrics = aggregate_case_results(results)
    assert metrics["cases_total"] == 2
    assert metrics["cases_passed"] == 1
    assert metrics["pass_rate"] == 0.5
    assert metrics["quality"] == 0.5
    assert metrics["avg_cost_usd"] == 0.5
    assert metrics["cost"] == 0.5

