"""Tests for the exploration controller."""

from __future__ import annotations

import json
from pathlib import Path

from datetime import datetime, timezone

from cyntra.control.exploration_controller import ExplorationController
from cyntra.kernel.config import KernelConfig
from cyntra.state.models import Issue


def _issue(tags: list[str] | None = None) -> Issue:
    now = datetime.now(timezone.utc)
    return Issue(
        id="1",
        title="Test",
        status="open",
        created=now,
        updated=now,
        tags=tags or [],
    )


def _write_report(path: Path, action_rate: float) -> None:
    payload = {
        "schema_version": "cyntra.dynamics_report.v1",
        "action_summary": {
            "global_action_rate": action_rate,
            "by_domain": {"code": action_rate},
            "traps": [],
        },
    }
    path.write_text(json.dumps(payload))


def test_controller_trap(tmp_path: Path) -> None:
    config = KernelConfig()
    config.kernel_dir = tmp_path
    report_path = tmp_path / "dynamics" / "dynamics_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    _write_report(report_path, action_rate=0.05)

    controller = ExplorationController(config)
    decision = controller.decide(_issue())

    assert decision.mode == "trap"
    assert decision.speculate_parallelism == config.speculation.default_parallelism + 1
    assert decision.temperature > config.control.temperature_base


def test_controller_chaos(tmp_path: Path) -> None:
    config = KernelConfig()
    config.kernel_dir = tmp_path
    report_path = tmp_path / "dynamics" / "dynamics_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    _write_report(report_path, action_rate=0.9)

    controller = ExplorationController(config)
    decision = controller.decide(_issue())

    assert decision.mode == "chaos"
    assert decision.speculate_parallelism == max(
        1, config.speculation.default_parallelism - 1
    )
    assert decision.temperature <= config.control.temperature_base
