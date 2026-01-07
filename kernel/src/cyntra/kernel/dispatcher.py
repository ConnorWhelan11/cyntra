"""
Dispatcher - Spawns workcells, routes to toolchains, monitors execution.

Responsibilities:
- Create git worktrees for each task
- Write task manifests
- Route tasks to appropriate toolchains via adapters
- Monitor execution and collect results
- Handle timeouts and errors
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog

from cyntra.adapters import get_adapter
from cyntra.adapters.base import PatchProof
from cyntra.control.exploration_controller import ExplorationController
from cyntra.hooks import HookContext, HookRunner, HookTrigger
from cyntra.kernel.routing import ordered_toolchain_candidates

if TYPE_CHECKING:
    from cyntra.kernel.config import KernelConfig
    from cyntra.state.models import Issue

logger = structlog.get_logger()


def _utc_now() -> datetime:
    """Get current UTC time as timezone-aware datetime."""
    return datetime.now(UTC)


def _deep_merge_dicts(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """
    Deterministically merge dictionaries (recursively).

    Non-dict values in `override` replace values in `base`.
    """
    result: dict[str, Any] = dict(base)
    for key, value in override.items():
        existing = result.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            result[key] = _deep_merge_dicts(existing, value)
        else:
            result[key] = value
    return result


@dataclass
class DispatchResult:
    """Result of dispatching a task."""

    success: bool
    proof: PatchProof | None
    workcell_id: str
    issue_id: str
    toolchain: str
    duration_ms: int = 0
    error: str | None = None
    speculate_tag: str | None = None


@dataclass
class SpeculateResult:
    """Result of speculate+vote dispatch."""

    winner: DispatchResult | None
    candidates: list[DispatchResult] = field(default_factory=list)
    all_failed: bool = False


class Dispatcher:
    """
    Spawns workcells and routes tasks to toolchains.

    Uses the adapter system to execute tasks via different
    LLM-powered coding agents (Codex, Claude, etc).
    """

    def __init__(
        self, config: KernelConfig, controller: ExplorationController | None = None
    ) -> None:
        self.config = config
        self.controller = controller or ExplorationController(config)
        self._adapters: dict[str, Any] = {}
        self._init_adapters()
        self.hook_runner = HookRunner(config)

    def _init_adapters(self) -> None:
        """Initialize available adapters."""
        for name in self.config.toolchain_priority:
            tc_config = self.config.toolchains.get(name)
            if tc_config and not tc_config.enabled:
                continue

            adapter_config: dict[str, Any] = {}
            if tc_config:
                adapter_config.update(tc_config.config or {})
                if tc_config.model and "model" not in adapter_config:
                    adapter_config["model"] = tc_config.model
                if tc_config.path and "path" not in adapter_config:
                    adapter_config["path"] = tc_config.path
                if tc_config.env:
                    merged_env = dict(tc_config.env)
                    if isinstance(adapter_config.get("env"), dict):
                        merged_env = {**adapter_config["env"], **merged_env}
                    adapter_config["env"] = merged_env

            adapter = get_adapter(name, adapter_config)
            if adapter:
                self._adapters[name] = adapter
                logger.debug("Adapter initialized", name=name, available=adapter.available)

    def dispatch(
        self,
        issue: Issue,
        workcell_path: Path,
        speculate_tag: str | None = None,
        toolchain_override: str | None = None,
        memory_context: dict[str, Any] | None = None,
        manifest_overrides: dict[str, Any] | None = None,
    ) -> DispatchResult:
        """
        Dispatch a task to a workcell synchronously.

        1. Write task manifest
        2. Invoke toolchain via adapter
        3. Return result with proof
        """
        started_at = _utc_now()
        workcell_id = workcell_path.name

        # Determine toolchain
        toolchain = toolchain_override or self._route_toolchain(issue)

        # Build and write manifest
        manifest = self._build_manifest(issue, workcell_id, toolchain, speculate_tag)

        # Inject memory context if provided
        if memory_context:
            manifest["memory_context"] = memory_context

        if manifest_overrides:
            manifest = _deep_merge_dicts(manifest, manifest_overrides)

        manifest_path = workcell_path / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        logger.info(
            "Dispatching to toolchain",
            issue_id=issue.id,
            toolchain=toolchain,
            workcell=workcell_id,
            speculate=speculate_tag,
        )

        # Get adapter
        adapter = self._adapters.get(toolchain)
        if not adapter:
            logger.error("No adapter available", toolchain=toolchain)
            return DispatchResult(
                success=False,
                proof=None,
                workcell_id=workcell_id,
                issue_id=issue.id,
                toolchain=toolchain,
                error=f"No adapter available for {toolchain}",
                speculate_tag=speculate_tag,
            )

        # Get timeout from config
        tc_config = self.config.toolchains.get(toolchain)
        timeout_seconds = 1800  # default 30 min
        if tc_config:
            timeout_seconds = getattr(tc_config, "timeout_seconds", 1800)
        planner = manifest.get("planner") if isinstance(manifest.get("planner"), dict) else {}
        timeout_override = (
            planner.get("timeout_seconds_override") if isinstance(planner, dict) else None
        )
        if isinstance(timeout_override, int) and timeout_override > 0:
            timeout_seconds = timeout_override

        # Execute via adapter
        try:
            proof = adapter.execute_sync(
                manifest=manifest,
                workcell_path=workcell_path,
                timeout_seconds=timeout_seconds,
            )

            completed_at = _utc_now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            success = proof.status in ("success", "partial")

            logger.info(
                "Dispatch completed",
                issue_id=issue.id,
                status=proof.status,
                duration_ms=duration_ms,
            )

            # Run post-execution hooks
            if success:
                hook_context = HookContext(
                    workcell_path=workcell_path,
                    workcell_id=workcell_id,
                    issue_id=issue.id,
                    proof=proof,
                    manifest=manifest,
                )
                hook_results = self.hook_runner.run_hooks(
                    HookTrigger.POST_EXECUTION,
                    hook_context,
                )
                # Attach hook results to proof
                if hook_results:
                    proof.review = {
                        "hooks_executed": [h.hook_name for h in hook_results],
                        "recommendations": [r for h in hook_results for r in h.recommendations],
                        "hook_outputs": {h.hook_name: h.output for h in hook_results},
                    }

            return DispatchResult(
                success=success,
                proof=proof,
                workcell_id=workcell_id,
                issue_id=issue.id,
                toolchain=toolchain,
                duration_ms=duration_ms,
                speculate_tag=speculate_tag,
            )

        except Exception as e:
            completed_at = _utc_now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            logger.error(
                "Dispatch failed",
                issue_id=issue.id,
                error=str(e),
            )

            return DispatchResult(
                success=False,
                proof=None,
                workcell_id=workcell_id,
                issue_id=issue.id,
                toolchain=toolchain,
                duration_ms=duration_ms,
                error=str(e),
                speculate_tag=speculate_tag,
            )

    async def dispatch_async(
        self,
        issue: Issue,
        workcell_path: Path,
        speculate_tag: str | None = None,
        toolchain_override: str | None = None,
        memory_context: dict[str, Any] | None = None,
        manifest_overrides: dict[str, Any] | None = None,
    ) -> DispatchResult:
        """
        Dispatch a task to a workcell asynchronously.
        """
        started_at = _utc_now()
        workcell_id = workcell_path.name

        # Determine toolchain
        toolchain = toolchain_override or self._route_toolchain(issue)

        # Build and write manifest
        manifest = self._build_manifest(issue, workcell_id, toolchain, speculate_tag)

        # Inject memory context if provided
        if memory_context:
            manifest["memory_context"] = memory_context

        if manifest_overrides:
            manifest = _deep_merge_dicts(manifest, manifest_overrides)

        manifest_path = workcell_path / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        logger.info(
            "Dispatching async to toolchain",
            issue_id=issue.id,
            toolchain=toolchain,
            workcell=workcell_id,
        )

        # Get adapter
        adapter = self._adapters.get(toolchain)
        if not adapter:
            return DispatchResult(
                success=False,
                proof=None,
                workcell_id=workcell_id,
                issue_id=issue.id,
                toolchain=toolchain,
                error=f"No adapter available for {toolchain}",
                speculate_tag=speculate_tag,
            )

        # Get timeout
        tc_config = self.config.toolchains.get(toolchain)
        timeout_seconds = 1800
        if tc_config:
            timeout_seconds = getattr(tc_config, "timeout_seconds", 1800)
        planner = manifest.get("planner") if isinstance(manifest.get("planner"), dict) else {}
        timeout_override = (
            planner.get("timeout_seconds_override") if isinstance(planner, dict) else None
        )
        if isinstance(timeout_override, int) and timeout_override > 0:
            timeout_seconds = timeout_override

        try:
            proof = await adapter.execute(
                manifest=manifest,
                workcell_path=workcell_path,
                timeout=timedelta(seconds=timeout_seconds),
            )

            completed_at = _utc_now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            success = proof.status in ("success", "partial")

            # Run post-execution hooks asynchronously
            if success:
                hook_context = HookContext(
                    workcell_path=workcell_path,
                    workcell_id=workcell_id,
                    issue_id=issue.id,
                    proof=proof,
                    manifest=manifest,
                )
                hook_results = await self.hook_runner.run_hooks_async(
                    HookTrigger.POST_EXECUTION,
                    hook_context,
                )
                if hook_results:
                    proof.review = {
                        "hooks_executed": [h.hook_name for h in hook_results],
                        "recommendations": [r for h in hook_results for r in h.recommendations],
                        "hook_outputs": {h.hook_name: h.output for h in hook_results},
                    }

            return DispatchResult(
                success=success,
                proof=proof,
                workcell_id=workcell_id,
                issue_id=issue.id,
                toolchain=toolchain,
                duration_ms=duration_ms,
                speculate_tag=speculate_tag,
            )

        except Exception as e:
            completed_at = _utc_now()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            return DispatchResult(
                success=False,
                proof=None,
                workcell_id=workcell_id,
                issue_id=issue.id,
                toolchain=toolchain,
                duration_ms=duration_ms,
                error=str(e),
                speculate_tag=speculate_tag,
            )

    async def dispatch_speculate(
        self,
        issue: Issue,
        workcell_paths: list[tuple[str, Path]],
    ) -> SpeculateResult:
        """
        Dispatch multiple parallel workcells for speculate+vote.

        Args:
            issue: The issue to work on
            workcell_paths: List of (speculate_tag, workcell_path) tuples

        Returns:
            SpeculateResult with winner and all candidates
        """
        logger.info(
            "Dispatching speculate+vote",
            issue_id=issue.id,
            parallelism=len(workcell_paths),
        )

        # Launch all dispatches in parallel
        tasks = [self.dispatch_async(issue, path, tag) for tag, path in workcell_paths]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter to successful results
        candidates: list[DispatchResult] = []
        for result in results:
            if isinstance(result, DispatchResult):
                candidates.append(result)
            elif isinstance(result, Exception):
                logger.error("Speculate dispatch failed", error=str(result))

        if not candidates:
            return SpeculateResult(winner=None, candidates=[], all_failed=True)

        # Find winner (first successful with passing gates)
        winner = None
        for candidate in candidates:
            if (
                candidate.success
                and candidate.proof
                and candidate.proof.verification.get("all_passed", False)
            ):
                winner = candidate
                break

        # If no verified winner, take best successful one
        if not winner:
            successful = [c for c in candidates if c.success]
            if successful:
                # Sort by confidence
                successful.sort(
                    key=lambda x: x.proof.confidence if x.proof else 0,
                    reverse=True,
                )
                winner = successful[0]

        return SpeculateResult(
            winner=winner,
            candidates=candidates,
            all_failed=winner is None,
        )

    def apply_patch(self, proof: PatchProof, workcell_path: Path) -> bool:
        """Apply the workcell's patch to main."""
        try:
            branch = proof.patch.get("branch", "")
            if not branch:
                # Get branch from workcell
                result = subprocess.run(
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    cwd=workcell_path,
                    capture_output=True,
                    text=True,
                )
                branch = result.stdout.strip()

            if not branch:
                logger.error("No branch to merge")
                return False

            # Checkout main and merge
            subprocess.run(
                ["git", "checkout", "main"],
                cwd=self.config.repo_root,
                capture_output=True,
            )

            result = subprocess.run(
                ["git", "merge", branch, "--no-ff", "-m", f"Merge {branch}"],
                cwd=self.config.repo_root,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                logger.error("Failed to merge", error=result.stderr)
                return False

            logger.info("Patch applied", branch=branch)
            return True

        except Exception as e:
            logger.error("Failed to apply patch", error=str(e))
            return False

    def _route_toolchain(self, issue: Issue) -> str:
        """Route issue to appropriate toolchain based on rules."""
        # Check explicit hint from issue
        if issue.dk_tool_hint and issue.dk_tool_hint in self._adapters:
            return issue.dk_tool_hint

        candidates = ordered_toolchain_candidates(self.config, issue)
        chosen = self._first_available_toolchain(candidates)
        if chosen:
            return chosen

        # Default to first in priority
        return self.config.toolchain_priority[0] if self.config.toolchain_priority else "codex"

    def _first_available_toolchain(self, toolchains: list[str]) -> str | None:
        """Return first toolchain with an available adapter."""
        for name in toolchains:
            adapter = self._adapters.get(name)
            if adapter and adapter.available:
                return name
        return None

    def _build_manifest(
        self,
        issue: Issue,
        workcell_id: str,
        toolchain: str,
        speculate_tag: str | None,
    ) -> dict[str, Any]:
        """Build task manifest for workcell."""
        # Get issue tags for routing
        tags = getattr(issue, "tags", []) or []

        # Build quality gates based on issue tags (or explicit override on the issue).
        quality_gates = self._build_quality_gates(tags)

        # Detect world build jobs
        job_type = "code"  # Default
        world_config = None

        if "asset:world" in tags:
            job_type = "fab-world"
            world_config = self._build_world_config(issue, tags)
            # World builds run their own gates as part of the fab-world pipeline.
            # Avoid accidentally running generic fab/code gates in the verifier.
            quality_gates = {}
        elif getattr(issue, "dk_quality_gates", None):
            dk_gates = issue.dk_quality_gates
            if isinstance(dk_gates, dict) and dk_gates:
                quality_gates = dk_gates

        manifest = {
            "schema_version": "1.0.0",
            "workcell_id": workcell_id,
            "branch_name": f"wc/{issue.id}/{workcell_id}",
            "apply_patch": bool(getattr(issue, "dk_apply_patch", True)),
            "issue": {
                "id": issue.id,
                "title": issue.title,
                "description": issue.description,
                "acceptance_criteria": issue.acceptance_criteria or [],
                "context_files": issue.context_files or [],
                "forbidden_paths": issue.dk_forbidden_paths or [],
                "dk_estimated_tokens": issue.dk_estimated_tokens,
                "tags": tags,  # Include tags for gate routing
            },
            "job_type": job_type,
            "toolchain": toolchain,
            "toolchain_config": {
                "model": self._get_model_for_toolchain(toolchain),
            },
            "quality_gates": quality_gates,
            "speculate_mode": speculate_tag is not None,
            "speculate_tag": speculate_tag,
        }

        strategy_cfg = self._build_strategy_config(issue=issue, toolchain=toolchain)
        if strategy_cfg:
            manifest["strategy"] = strategy_cfg

        try:
            from cyntra.prompts.runtime import detect_domain, load_prompt_genome
            from cyntra.prompts.selector import select_prompt_genome_id

            domain = detect_domain(str(job_type))
            prompt_genome_id = getattr(issue, "dk_prompt_genome_id", None)
            if not prompt_genome_id:
                prompt_genome_id = select_prompt_genome_id(
                    repo_root=self.config.repo_root,
                    domain=domain,
                    toolchain=toolchain,
                )

            if isinstance(prompt_genome_id, str) and prompt_genome_id.strip():
                manifest["toolchain_config"]["prompt_genome_id"] = prompt_genome_id.strip()

                # If the controller didn't set sampling yet, fall back to genome defaults.
                if "sampling" not in manifest["toolchain_config"]:
                    genome = load_prompt_genome(
                        prompts_root=self.config.repo_root / "prompts",
                        domain=domain,
                        toolchain=toolchain,
                        genome_id=prompt_genome_id.strip(),
                    )
                    if isinstance(genome, dict):
                        sampling_cfg = genome.get("sampling")
                        if isinstance(sampling_cfg, dict):
                            temperature = sampling_cfg.get("temperature")
                            top_p = sampling_cfg.get("top_p")
                            manifest["toolchain_config"]["sampling"] = {
                                "temperature": float(temperature)
                                if isinstance(temperature, (int, float))
                                else None,
                                "top_p": float(top_p) if isinstance(top_p, (int, float)) else None,
                            }
        except Exception:
            # Prompt genomes are optional; selection is best-effort.
            pass

        sampling_override = getattr(issue, "dk_sampling", None)
        if isinstance(sampling_override, dict) and sampling_override:
            temperature = sampling_override.get("temperature")
            top_p = sampling_override.get("top_p")
            sampling_override = {
                "temperature": float(temperature)
                if isinstance(temperature, (int, float))
                else None,
                "top_p": float(top_p) if isinstance(top_p, (int, float)) else None,
            }
        else:
            sampling_override = None

        decision = self.controller.decide(issue)
        controller_sampling = self.controller.sampling_for_issue(issue)
        sampling = sampling_override or controller_sampling
        if not sampling:
            sampling = manifest.get("toolchain_config", {}).get("sampling")
        if sampling:
            manifest["toolchain_config"]["sampling"] = sampling
        manifest["control"] = {
            "mode": decision.mode,
            "reason": decision.reason,
            "action_rate": decision.action_rate,
            "speculate_parallelism": decision.speculate_parallelism,
            "sampling": sampling,
        }

        if world_config:
            manifest["world_config"] = world_config

        return manifest

    def _build_quality_gates(self, tags: list[str]) -> dict[str, Any]:
        """
        Build quality gates configuration based on issue tags.

        Asset-tagged issues get fab-realism gates instead of/in addition to code gates.
        """
        # Default code gates
        gates: dict[str, Any] = {
            "test": self.config.gates.test_command,
            "typecheck": self.config.gates.typecheck_command,
            "lint": self.config.gates.lint_command,
        }

        # Check for asset tags that require fab-realism gate
        asset_tags = [t for t in tags if t.startswith("asset:")]
        gate_tags = [t for t in tags if t.startswith("gate:")]

        if asset_tags or "gate:realism" in gate_tags:
            # Determine asset category from tags
            category = "car"  # Default
            for tag in asset_tags:
                # Extract category from "asset:car", "asset:vehicle", etc.
                parts = tag.split(":")
                if len(parts) >= 2:
                    category = parts[1]
                    break

            # Normalize common aliases to supported fab gate categories/configs.
            category_aliases = {
                # Vehicles
                "vehicle": "car",
                # Furniture
                "chair": "furniture",
                "table": "furniture",
                # Architecture
                "building": "architecture",
                "house": "architecture",
                # Interiors (fab gate config is named "interior_library_v001")
                "interior_architecture": "interior",
                "library": "interior",
            }
            normalized_category = category_aliases.get(category, category)

            # Determine gate config from tags
            default_gate_config_by_category = {
                "car": "car_realism_v001",
                "furniture": "furniture_realism_v001",
                "architecture": "architecture_realism_v001",
                "interior": "interior_library_v001",
            }
            gate_config_id = default_gate_config_by_category.get(
                normalized_category, f"{normalized_category}_realism_v001"
            )
            for tag in gate_tags:
                if tag.startswith("gate:config:"):
                    gate_config_id = tag.replace("gate:config:", "")
                    break

            # Add fab-realism gate
            gates["fab-realism"] = {
                "type": "fab-realism",
                "category": category,
                "gate_config_id": gate_config_id,
                "command": f"python -m cyntra.fab.gate --asset {{asset_path}} --config {gate_config_id} --out {{output_dir}}",
            }

            # Optional engine integration gate (Godot Web export)
            if "gate:godot" in gate_tags or "gate:engine" in gate_tags:
                godot_config_id = "godot_integration_v001"
                for tag in gate_tags:
                    if tag.startswith("gate:godot-config:"):
                        godot_config_id = tag.replace("gate:godot-config:", "")
                        break

                gates["fab-godot"] = {
                    "type": "fab-godot",
                    "gate_config_id": godot_config_id,
                    # Workcell-relative path (works for monorepo tasks)
                    "template_dir": "fab/godot/template",
                }

            # Optional playability gate (NitroGen automated testing)
            # Check for gate:playability, gate:nitrogen, or gate:playability-config:*
            has_playability_tag = (
                "gate:playability" in gate_tags
                or "gate:nitrogen" in gate_tags
                or any(t.startswith("gate:playability-config:") for t in gate_tags)
            )
            if has_playability_tag:
                playability_config_id = "gameplay_playability_v001"
                for tag in gate_tags:
                    if tag.startswith("gate:playability-config:"):
                        playability_config_id = tag.replace("gate:playability-config:", "")
                        break

                gates["fab-playability"] = {
                    "type": "fab-playability",
                    "gate_config_id": playability_config_id,
                }

            # For asset-only issues, disable code gates
            if "gate:asset-only" in gate_tags:
                gates.pop("test", None)
                gates.pop("typecheck", None)
                gates.pop("lint", None)

        # Backbay Imperium (Rust + optional Godot QA) gates.
        if "gate:backbay" in gate_tags:
            gates["backbay-test"] = "cd research/backbay-imperium && cargo test"

        if "gate:backbay-qa" in gate_tags:
            gates["backbay-qa"] = (
                "cd research/backbay-imperium && ./scripts/build_godot_bridge.sh && cd ../.. && "
                "scripts/godot-qa-runner.sh --project research/backbay-imperium/client "
                "--scene res://tests/run_all_tests.tscn && "
                "scripts/godot-qa-runner.sh --project research/backbay-imperium/client "
                "--scene res://tests/qa_validate_scripts.tscn && "
                "python skills/development/visual-qa.py --mode compare --capture-mode all"
            )

        return gates

    def _build_strategy_config(self, *, issue: Issue, toolchain: str) -> dict[str, Any] | None:
        """
        Build strategy telemetry + routing configuration for this manifest.

        This is intentionally compact and deterministic:
        - Always file-first (manifest captures decisions for replay)
        - No verbose chain-of-thought storage required
        """
        strategy = getattr(self.config, "strategy", None)
        if not strategy or not bool(getattr(strategy, "enabled", False)):
            return None

        prompt_style = str(getattr(strategy, "prompt_style", "compact") or "compact").strip()
        prompt_style = prompt_style.lower()
        if prompt_style not in {"compact", "full"}:
            prompt_style = "compact"

        cfg: dict[str, Any] = {
            "enabled": True,
            "prompt_style": prompt_style,
            "self_report": bool(getattr(strategy, "self_report", True)),
        }

        routing = getattr(strategy, "routing", None)
        if not routing or not bool(getattr(routing, "enabled", False)):
            return cfg

        mode = str(getattr(routing, "mode", "dataset_optimal") or "dataset_optimal").strip().lower()
        if mode not in {"dataset_optimal"}:
            return cfg

        # Deterministic A/B bucketing (based only on issue_id).
        ab_enabled = bool(getattr(routing, "ab_test_enabled", False))
        ab_ratio_raw = getattr(routing, "ab_test_ratio", 0.5)
        ab_ratio = float(ab_ratio_raw) if isinstance(ab_ratio_raw, (int, float)) else 0.5
        ab_ratio = max(0.0, min(1.0, ab_ratio))
        ab_salt = str(getattr(routing, "ab_test_salt", "") or "").strip() or "cyntra.strategy.ab.v1"

        bucket_value = int(
            hashlib.sha256(f"{ab_salt}:{issue.id}".encode("utf-8")).hexdigest(), 16
        ) % 10_000
        treatment_cutoff = int(ab_ratio * 10_000)
        is_treatment = (bucket_value < treatment_cutoff) if ab_enabled else True

        cfg["routing"] = {
            "mode": "dataset_optimal",
            "ab_test_enabled": ab_enabled,
            "ab_test_ratio": ab_ratio,
            "ab_bucket_value": bucket_value,
            "ab_bucket": "treatment" if is_treatment else "control",
        }

        if not is_treatment:
            return cfg

        # Fetch dataset-wide optimal patterns from the local dynamics DB.
        patterns = self._get_dataset_optimal_patterns(toolchain=toolchain, routing=routing)
        if not patterns:
            return cfg

        digest = hashlib.sha256(
            json.dumps(patterns, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode(
                "utf-8"
            )
        ).hexdigest()

        cfg["directive"] = {
            "source": "dataset_optimal",
            "toolchain_scope": toolchain if bool(getattr(routing, "per_toolchain", True)) else None,
            "outcome": str(getattr(routing, "outcome", "passed") or "passed"),
            "min_confidence": float(getattr(routing, "min_confidence", 0.5) or 0.5),
            "patterns": patterns,
            "directive_hash": f"stg_{digest[:12]}",
        }

        return cfg

    def _get_dataset_optimal_patterns(
        self, *, toolchain: str, routing: Any
    ) -> dict[str, str]:
        """Query dataset-wide optimal patterns (most common on successful runs)."""
        db_path = self.config.repo_root / ".cyntra" / "dynamics" / "cyntra.db"
        if not db_path.exists():
            return {}

        try:
            from cyntra.dynamics.transition_db import TransitionDB

            outcome = str(getattr(routing, "outcome", "passed") or "passed")
            min_conf = float(getattr(routing, "min_confidence", 0.5) or 0.5)
            per_toolchain = bool(getattr(routing, "per_toolchain", True))
            db = TransitionDB(db_path)
            try:
                return db.get_optimal_strategy_for(
                    toolchain=toolchain if per_toolchain else None,
                    outcome=outcome,
                    min_confidence=min_conf,
                )
            finally:
                db.close()
        except Exception:
            return {}

    def _build_world_config(self, issue: Issue, tags: list[str]) -> dict[str, Any]:
        """
        Build world-specific configuration for fab-world jobs.

        Extracts world parameters from issue description or tags.
        """
        # Default world config
        config = {
            "world_path": "fab/worlds/outora_library",  # Default to outora
            "seed": 42,
            "param_overrides": {},
        }

        # Look for world: tag
        for tag in tags:
            if tag.startswith("world:"):
                world_id = tag.split(":", 1)[1]
                config["world_path"] = f"fab/worlds/{world_id}"
                break

        # Look for seed: tag
        for tag in tags:
            if tag.startswith("seed:"):
                try:
                    seed = int(tag.split(":", 1)[1])
                    config["seed"] = seed
                except ValueError:
                    pass
                break

        # Look for param: tags (e.g., param:lighting.preset=cosmic)
        for tag in tags:
            if tag.startswith("param:"):
                param_spec = tag.split(":", 1)[1]
                if "=" in param_spec:
                    key, value = param_spec.split("=", 1)
                    config["param_overrides"][key] = value

        # Determine gates for this world
        gate_configs = []
        for tag in tags:
            if tag.startswith("gate:"):
                gate_name = tag.split(":", 1)[1]
                # Skip generic gate: tags like gate:realism
                if gate_name not in [
                    "realism",
                    "quality",
                    "godot",
                    "engine",
                    "playability",
                    "nitrogen",
                ]:
                    gate_configs.append(f"fab/gates/{gate_name}_v001.yaml")

        # Default gates for world jobs
        if not gate_configs:
            gate_configs = [
                "fab/gates/interior_library_v001.yaml",
                "fab/gates/godot_integration_v001.yaml",
            ]

        # Add playability gate based on world type
        world_id = config.get("world_path", "").split("/")[-1]
        playability_gate_map = {
            "enchanted_forest": "gameplay_playability_forest_v001",
            "dark_dungeon": "gameplay_playability_dungeon_v001",
            "orbital_station": "gameplay_playability_scifi_v001",
            "outora_library": "gameplay_playability_gothic_v001",
        }

        if world_id in playability_gate_map:
            gate_configs.append(f"fab/gates/{playability_gate_map[world_id]}.yaml")
        elif "gate:playability" in tags or "gate:nitrogen" in tags:
            # Use default playability gate
            gate_configs.append("fab/gates/gameplay_playability_v001.yaml")

        config["quality_gates"] = gate_configs

        return config

    def _get_model_for_toolchain(self, toolchain: str) -> str:
        """Get the model to use for a toolchain."""
        tc_config = self.config.toolchains.get(toolchain)
        if tc_config:
            model = getattr(tc_config, "model", None)
            if model:
                return model

        # Defaults
        defaults = {
            "codex": "gpt-5.2",
            "claude": "claude-opus-4-5-20251101",
        }
        return defaults.get(toolchain, "")

    def get_available_toolchains(self) -> list[str]:
        """Get list of available toolchains."""
        return [name for name, adapter in self._adapters.items() if adapter.available]
