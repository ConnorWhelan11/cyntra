from __future__ import annotations

from typing import Any

from cyntra.kernel.config import KernelConfig, RoutingRule
from cyntra.universe.config import UniverseConfig


def universe_env_overrides(universe_config: UniverseConfig) -> dict[str, str]:
    """
    Environment variables implied by universe determinism policies.

    These are intended to be applied to subprocesses (toolchains, Blender, etc).
    """
    policies = universe_config.policies
    if not isinstance(policies, dict):
        return {}
    determinism = policies.get("determinism")
    if not isinstance(determinism, dict):
        return {}

    env: dict[str, str] = {}
    pythonhashseed = determinism.get("pythonhashseed")
    if isinstance(pythonhashseed, int):
        env["PYTHONHASHSEED"] = str(pythonhashseed)

    enforce_cpu_only = determinism.get("enforce_cpu_only")
    if enforce_cpu_only is True:
        # Prefer explicit, domain-specific signal while keeping a generic alias.
        env["FAB_CPU_ONLY"] = "1"
        env["CYNTRA_CPU_ONLY"] = "1"

    return env


def _parse_routing_rule(raw: dict[str, Any]) -> RoutingRule | None:
    match = raw.get("match") if isinstance(raw.get("match"), dict) else {}
    use = raw.get("use")
    if isinstance(use, str):
        use_list = [use]
    elif isinstance(use, list):
        use_list = [str(x) for x in use]
    else:
        use_list = []

    parallelism_value = raw.get("parallelism")
    parallelism_int: int | None = None
    if parallelism_value is not None:
        try:
            parallelism_int = int(parallelism_value)
        except (TypeError, ValueError):
            parallelism_int = None

    return RoutingRule(
        match=dict(match),
        use=use_list,
        speculate=bool(raw.get("speculate", False)),
        parallelism=parallelism_int,
    )


def apply_universe_policies(config: KernelConfig, universe_config: UniverseConfig) -> None:
    """Apply universe policies (budgets, determinism, routing overrides) to a KernelConfig."""
    policies = universe_config.policies
    if not isinstance(policies, dict):
        return

    budgets = policies.get("budgets")
    if isinstance(budgets, dict):
        max_wc = budgets.get("max_concurrent_workcells")
        if isinstance(max_wc, int) and max_wc > 0:
            config.max_concurrent_workcells = max_wc

        max_run_minutes = budgets.get("max_run_minutes")
        if isinstance(max_run_minutes, int) and max_run_minutes > 0:
            cap_seconds = max_run_minutes * 60
            for toolchain in config.toolchains.values():
                if toolchain.timeout_seconds > cap_seconds:
                    toolchain.timeout_seconds = cap_seconds

    env_overrides = universe_env_overrides(universe_config)
    if env_overrides:
        for toolchain in config.toolchains.values():
            toolchain.env.update(env_overrides)

    routing_overrides = policies.get("routing_overrides")
    if isinstance(routing_overrides, list) and routing_overrides:
        rules: list[RoutingRule] = []
        for item in routing_overrides:
            if not isinstance(item, dict):
                continue
            parsed = _parse_routing_rule(item)
            if parsed is not None:
                rules.append(parsed)
        if rules:
            config.routing.rules = [*rules, *config.routing.rules]

