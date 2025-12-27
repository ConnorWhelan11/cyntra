from __future__ import annotations

from pathlib import Path

from cyntra.kernel.config import KernelConfig, RoutingRule, ToolchainConfig
from cyntra.universe.config import UniverseConfig
from cyntra.universe.policy import apply_universe_policies


def _universe(tmp_path: Path, *, policies: dict) -> UniverseConfig:
    return UniverseConfig(
        repo_root=tmp_path,
        universe_dir=tmp_path / "universes" / "test",
        raw={
            "schema_version": "1.0",
            "universe_id": "test",
            "worlds": [],
            "policies": policies,
        },
    )


def test_apply_universe_policies_caps_timeout_and_sets_env(tmp_path: Path) -> None:
    config = KernelConfig()
    config.toolchains = {
        "codex": ToolchainConfig(name="codex", timeout_seconds=4000, env={"PYTHONHASHSEED": "7"}),
        "claude": ToolchainConfig(name="claude", timeout_seconds=300, env={}),
    }

    universe_cfg = _universe(
        tmp_path,
        policies={
            "determinism": {"enforce_cpu_only": True, "pythonhashseed": 0},
            "budgets": {"max_run_minutes": 10},
        },
    )

    apply_universe_policies(config, universe_cfg)

    assert config.toolchains["codex"].timeout_seconds == 600
    assert config.toolchains["claude"].timeout_seconds == 300
    assert config.toolchains["codex"].env["PYTHONHASHSEED"] == "0"
    assert config.toolchains["codex"].env["FAB_CPU_ONLY"] == "1"
    assert config.toolchains["codex"].env["CYNTRA_CPU_ONLY"] == "1"


def test_apply_universe_policies_prepends_routing_overrides(tmp_path: Path) -> None:
    config = KernelConfig()
    config.routing.rules = [
        RoutingRule(
            match={"dk_tool_hint": "codex"}, use=["codex"], speculate=False, parallelism=None
        )
    ]

    universe_cfg = _universe(
        tmp_path,
        policies={
            "routing_overrides": [
                {
                    "match": {"dk_tool_hint": "claude"},
                    "use": ["claude"],
                    "speculate": True,
                    "parallelism": 2,
                },
                "invalid",
            ]
        },
    )

    apply_universe_policies(config, universe_cfg)

    assert config.routing.rules[0].use == ["claude"]
    assert config.routing.rules[0].speculate is True
    assert config.routing.rules[0].parallelism == 2
    assert config.routing.rules[1].use == ["codex"]
