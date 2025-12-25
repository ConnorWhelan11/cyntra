"""
World Runner - Orchestrate world build pipeline.

Executes stages in topological order, manages dependencies,
and tracks progress in the manifest.
"""

from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional
import time

from .world_config import WorldConfig
from .world_manifest import WorldManifest
from .stage_executor import execute_stage


class WorldRunner:
    """Orchestrates world build pipeline execution."""

    def __init__(
        self,
        world_config: WorldConfig,
        run_dir: Path,
        seed: Optional[int] = None,
        param_overrides: Optional[Dict[str, Any]] = None,
        until_stage: Optional[str] = None,
        prune_intermediates: bool = False,
    ):
        """
        Initialize world runner.

        Args:
            world_config: Loaded and validated world configuration
            run_dir: Output directory for this run
            seed: Random seed override (uses world config default if None)
            param_overrides: Parameter overrides (dot-path keys)
            until_stage: Stop after this stage (for incremental builds)
        """
        self.world_config = world_config
        self.run_dir = run_dir.resolve()
        self.until_stage = until_stage
        self.prune_intermediates = prune_intermediates

        # Resolve seed
        if seed is None:
            seed = world_config.get_determinism_config().get("seed", 42)
        self.seed = seed

        # Resolve parameters
        self.params = world_config.resolve_parameters(param_overrides or {})

        # Create manifest
        self.manifest = WorldManifest(
            run_dir=run_dir,
            world_config=world_config,
            seed=seed,
            params=self.params,
        )

        # Track completed stages
        self.completed_stages: Dict[str, Path] = {}
        self._dependents_remaining: Dict[str, int] = {}
        self._optional_stage_failures: list[str] = []
        self._has_export_stage = any(
            isinstance(stage.get("id"), str) and "export" in stage.get("id", "").lower()
            for stage in (world_config.stages or [])
            if isinstance(stage, dict)
        )

    def run(self) -> bool:
        """
        Execute the world build pipeline.

        Returns:
            True if all stages succeeded, False otherwise
        """
        print(f"\n{'='*60}")
        print(f"Fab World Build: {self.world_config.world_id}")
        print(f"Version: {self.world_config.version}")
        print(f"Run ID: {self.manifest.get_run_id()}")
        print(f"Seed: {self.seed}")
        print(f"Output: {self.run_dir}")
        print(f"{'='*60}\n")

        # Get stage execution order
        stage_order = self.world_config.get_stage_order()

        # Determine which stages to run
        if self.until_stage:
            if self.until_stage not in stage_order:
                print(f"✗ Error: Stage '{self.until_stage}' not found")
                return False

            # Run up to and including until_stage
            until_index = stage_order.index(self.until_stage)
            stages_to_run = stage_order[: until_index + 1]
            print(f"Running stages up to '{self.until_stage}': {', '.join(stages_to_run)}\n")
        else:
            stages_to_run = stage_order
            print(f"Running all stages: {', '.join(stages_to_run)}\n")

        # Build dependent counts for pruning (only stages we actually run)
        self._dependents_remaining = {sid: 0 for sid in stages_to_run}
        if self.prune_intermediates:
            for stage in self.world_config.stages:
                sid = stage.get("id")
                if sid not in self._dependents_remaining:
                    continue
                for dep in stage.get("requires", []):
                    if dep in self._dependents_remaining:
                        self._dependents_remaining[dep] += 1

        # Execute stages
        for stage_id in stages_to_run:
            success = self._execute_stage(stage_id)

            if not success:
                print(f"\n✗ Build failed at stage: {stage_id}")
                print(f"See manifest: {self.manifest.manifest_path}")
                return False

            # Optionally prune dependencies whose last dependent just completed.
            if self.prune_intermediates:
                stage = self.world_config.get_stage(stage_id) or {}
                for dep_id in stage.get("requires", []):
                    if dep_id in self._dependents_remaining:
                        self._dependents_remaining[dep_id] -= 1
                        if self._dependents_remaining[dep_id] <= 0:
                            self._prune_stage_dir(dep_id)

        # Build complete
        print(f"\n{'='*60}")
        print(f"✓ Build complete!")
        print(f"Run ID: {self.manifest.get_run_id()}")
        print(f"Manifest: {self.manifest.manifest_path}")

        if self._optional_stage_failures:
            print("\nOptional stages failed (build continues):")
            for stage_id in self._optional_stage_failures:
                print(f"  - {stage_id}")

        if self.prune_intermediates:
            self._prune_world_intermediates()

        # Print final outputs
        if self.manifest.data["final_outputs"]:
            print(f"\nFinal outputs:")
            for output in self.manifest.data["final_outputs"]:
                size_mb = output["size_bytes"] / (1024 * 1024)
                print(f"  - {output['path']} ({size_mb:.1f} MB)")
                print(f"    SHA256: {output['sha256'][:16]}...")

        print(f"{'='*60}\n")

        return True

    def _prune_stage_dir(self, stage_id: str) -> None:
        """Delete an intermediate stage directory to save disk."""
        import shutil

        stage_dir = self.run_dir / "stages" / stage_id
        if stage_dir.exists():
            try:
                shutil.rmtree(stage_dir)
                print(f"Pruned intermediate stage dir: {stage_dir}")
            except Exception as e:
                print(f"⚠ Failed to prune stage dir {stage_dir}: {e}")

    def _prune_world_intermediates(self) -> None:
        """Delete large intermediate artifacts (best-effort)."""
        import json
        from datetime import datetime, timezone

        world_dir = self.run_dir / "world"
        if not world_dir.exists():
            return

        removed: list[dict[str, Any]] = []
        for candidate in sorted(world_dir.glob("*_baked.blend*")):
            if not candidate.is_file():
                continue
            try:
                size_bytes = candidate.stat().st_size
            except Exception:
                size_bytes = None
            try:
                candidate.unlink()
            except Exception as exc:
                print(f"⚠ Failed to prune world artifact {candidate}: {exc}")
                continue

            try:
                rel_path = str(candidate.relative_to(self.run_dir))
            except ValueError:
                rel_path = str(candidate)
            removed.append({"path": rel_path, "size_bytes": size_bytes})

        if not removed:
            return

        pruned_path = self.run_dir / "pruned_intermediates.json"
        payload = {
            "schema_version": "cyntra.fab.pruned_intermediates.v1",
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "removed": removed,
        }
        try:
            pruned_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        except Exception:
            pass

        print(f"Pruned {len(removed)} large world artifacts (see {pruned_path})")

    def _execute_stage(self, stage_id: str) -> bool:
        """Execute a single stage."""
        stage = self.world_config.get_stage(stage_id)
        if not stage:
            print(f"✗ Stage '{stage_id}' not found in config")
            return False

        is_optional = bool(stage.get("optional", False))

        # Create stage directory
        stage_dir = self.run_dir / "stages" / stage_id
        stage_dir.mkdir(parents=True, exist_ok=True)

        # Collect inputs from dependencies
        inputs: Dict[str, Path] = {}
        for dep_id in stage.get("requires", []):
            if dep_id not in self.completed_stages:
                print(f"✗ Missing dependency: {dep_id} for stage {stage_id}")
                return False
            inputs[dep_id] = self.completed_stages[dep_id]

        # Filter parameters for this stage
        stage_params = self._get_stage_params(stage)

        # Start stage in manifest
        self.manifest.start_stage(stage_id)

        # Execute the stage
        start_time = time.time()

        result = execute_stage(
            stage=stage,
            world_config=self.world_config,
            manifest=self.manifest,
            run_dir=self.run_dir,
            stage_dir=stage_dir,
            inputs=inputs,
            params=stage_params,
        )

        duration_ms = int((time.time() - start_time) * 1000)

        stage_success = bool(result.get("success"))
        stage_status: str | None = None
        if is_optional and not stage_success:
            stage_status = "optional_failed"

        # Update manifest
        self.manifest.complete_stage(
            stage_id=stage_id,
            success=stage_success,
            outputs=result.get("outputs", []),
            metadata=result.get("metadata", {}),
            errors=result.get("errors", []),
            duration_ms=duration_ms,
            optional=is_optional,
            status=stage_status,
        )

        # Check success
        if not stage_success:
            if is_optional:
                print(f"\n⚠ Optional stage '{stage_id}' failed (continuing):")
                for error in result.get("errors", []):
                    print(f"  - {error}")
                self._optional_stage_failures.append(stage_id)
                return True

            print(f"\n✗ Stage '{stage_id}' failed:")
            for error in result.get("errors", []):
                print(f"  - {error}")
            return False

        # Track completion
        self.completed_stages[stage_id] = stage_dir

        # Add to final outputs if this is an export stage
        add_final = "export" in stage_id.lower() or stage_id == "export"
        if stage_id == "bake" and (not self.prune_intermediates or not self._has_export_stage):
            add_final = True

        if add_final:
            output_patterns = stage.get("outputs", [])
            if output_patterns:
                self.manifest.add_final_outputs(output_patterns)

        return True

    def _get_stage_params(self, stage: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get filtered parameters for a stage.

        Returns only the parameters declared in the stage's 'params' field,
        or all parameters if no filter is specified.
        """
        param_keys = stage.get("params", [])

        if not param_keys:
            # No filter - return all parameters
            return self.params

        # Filter to requested params
        filtered = {}

        for key in param_keys:
            # Navigate dot-path to get value
            parts = key.split(".")
            value = self.params

            try:
                for part in parts:
                    value = value[part]

                # Reconstruct nested structure
                current = filtered
                for part in parts[:-1]:
                    if part not in current:
                        current[part] = {}
                    current = current[part]
                current[parts[-1]] = value

            except (KeyError, TypeError):
                # Parameter not found - skip
                pass

        return filtered

    def get_manifest(self) -> WorldManifest:
        """Get the manifest."""
        return self.manifest


def run_world(
    world_path: Path,
    output_dir: Path,
    seed: Optional[int] = None,
    param_overrides: Optional[Dict[str, Any]] = None,
    until_stage: Optional[str] = None,
    prune_intermediates: bool = False,
) -> bool:
    """
    Run a world build.

    Args:
        world_path: Path to world directory or world.yaml
        output_dir: Output directory for run
        seed: Random seed override
        param_overrides: Parameter overrides (dot-path keys)
        until_stage: Stop after this stage

    Returns:
        True if successful, False otherwise
    """
    from .world_config import load_world_config

    # Load config
    world_config = load_world_config(world_path)

    # Create runner
    runner = WorldRunner(
        world_config=world_config,
        run_dir=output_dir,
        seed=seed,
        param_overrides=param_overrides,
        until_stage=until_stage,
        prune_intermediates=prune_intermediates,
    )

    # Execute
    return runner.run()
