"""
Stage Execution - Invoke Blender stages and track outputs.

Handles running Blender stage scripts in isolated, deterministic environments.
"""

from pathlib import Path
from typing import Any, Dict, Mapping
import subprocess
import tempfile
import time
import os
import sys


class StageExecutor:
    """Executes Blender stages with proper environment and contract."""

    def __init__(self, world_config, manifest):
        """Initialize executor."""
        self.world_config = world_config
        self.manifest = manifest

    def execute_blender_stage(
        self,
        stage: Dict[str, Any],
        run_dir: Path,
        stage_dir: Path,
        inputs: Mapping[str, Path],
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a Blender stage script.

        Args:
            stage: Stage configuration dict
            run_dir: Root run directory
            stage_dir: This stage's output directory
            inputs: Map of {stage_id: stage_dir} for dependencies
            params: Resolved parameters

        Returns:
            Stage execution result with success, outputs, metadata, errors
        """
        stage_id = stage["id"]
        script_path = self.world_config.get_stage_script_path(stage)

        if not script_path.exists():
            return {
                "success": False,
                "outputs": [],
                "metadata": {},
                "errors": [f"Stage script not found: {script_path}"],
            }

        print(f"\n{'='*60}")
        print(f"Executing stage: {stage_id}")
        print(f"Script: {script_path}")
        print(f"{'='*60}\n")

        # Create stage directory
        stage_dir.mkdir(parents=True, exist_ok=True)

        # Get template blend file
        template_blend = self.world_config.get_template_blend_path()

        # Create a temporary Python script that:
        # 1. Opens the template blend
        # 2. Imports the stage script
        # 3. Calls execute() with proper contract
        # 4. Writes result to a JSON file

        result_file = stage_dir / f"{stage_id}_result.json"

        # Build the execution wrapper
        wrapper_script = self._build_wrapper_script(
            script_path=script_path,
            run_dir=run_dir,
            stage_dir=stage_dir,
            inputs=inputs,
            params=params,
            manifest_data=self.manifest.to_dict(),
            result_file=result_file,
            template_blend=template_blend if stage_id == "prepare" else None,
        )

        # Write wrapper to temp file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(wrapper_script)
            wrapper_path = f.name

        try:
            # Build Blender command
            blender_exe = self.world_config.get_blender_executable()
            blender_args = self.world_config.get_blender_args()
            blender_env = self.world_config.get_blender_env()

            # Merge with current environment
            env = os.environ.copy()
            env.update(blender_env)

            # Add stage-specific env vars
            env["FAB_RUN_DIR"] = str(run_dir)
            env["FAB_STAGE_DIR"] = str(stage_dir)
            env["FAB_STAGE_ID"] = stage_id
            env["FAB_SEED"] = str(self.manifest.data["determinism"]["seed"])
            env["FAB_RUN_ID"] = self.manifest.get_run_id()

            # Build command
            cmd = [blender_exe] + blender_args

            # For prepare stage, open template directly
            if stage_id == "prepare":
                cmd.extend([str(template_blend)])

            # Add Python script execution
            cmd.extend(["--python", wrapper_path])

            # Setup logging
            log_dir = run_dir / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / f"{stage_id}.log"

            print(f"Running Blender with stage script...")
            print(f"Command: {' '.join(cmd[:3])} ...")
            print(f"Log file: {log_file}")

            # Execute
            start_time = time.time()

            with open(log_file, "w") as log:
                result = subprocess.run(
                    cmd,
                    env=env,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    timeout=3600,  # 1 hour timeout
                )

            duration_ms = int((time.time() - start_time) * 1000)

            # Check result
            if result.returncode != 0:
                return {
                    "success": False,
                    "outputs": [],
                    "metadata": {"duration_ms": duration_ms},
                    "errors": [
                        f"Blender exited with code {result.returncode}",
                        f"See log: {log_file}",
                    ],
                }

            # Read result from JSON file
            if not result_file.exists():
                return {
                    "success": False,
                    "outputs": [],
                    "metadata": {"duration_ms": duration_ms},
                    "errors": [
                        "Stage script did not produce result file",
                        f"Expected: {result_file}",
                    ],
                }

            import json
            with open(result_file) as f:
                stage_result = json.load(f)

            # Add duration
            stage_result["metadata"]["duration_ms"] = duration_ms

            return stage_result

        finally:
            # Cleanup temp file
            try:
                os.unlink(wrapper_path)
            except:
                pass

    def _build_wrapper_script(
        self,
        script_path: Path,
        run_dir: Path,
        stage_dir: Path,
        inputs: Mapping[str, Path],
        params: Dict[str, Any],
        manifest_data: Dict[str, Any],
        result_file: Path,
        template_blend: Path = None,
    ) -> str:
        """Build Python wrapper script for Blender execution."""

        # Convert paths to strings and make serializable
        inputs_dict = {k: str(v) for k, v in inputs.items()}

        wrapper = f"""
# Fab World Stage Execution Wrapper
# Auto-generated - do not edit

import sys
from pathlib import Path
import json
import os

import bpy


def _enforce_cpu_only():
    if os.environ.get("FAB_CPU_ONLY") != "1" and os.environ.get("CYNTRA_CPU_ONLY") != "1":
        return
    try:
        bpy.context.preferences.addons["cycles"].preferences.compute_device_type = "NONE"
        bpy.context.scene.cycles.device = "CPU"
    except Exception:
        # Best-effort: keep going even if Cycles isn't available in the current Blender context.
        return


_enforce_cpu_only()

# Add stage script directory to path
stage_script = Path(r"{script_path}")
sys.path.insert(0, str(stage_script.parent))

# Import the stage module
import importlib.util
spec = importlib.util.spec_from_file_location("stage_module", stage_script)
stage_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage_module)

# Prepare arguments
run_dir = Path(r"{run_dir}")
stage_dir = Path(r"{stage_dir}")

inputs = {{k: Path(v) for k, v in {inputs_dict}.items()}}

params = {repr(params)}

manifest = {repr(manifest_data)}

# Execute the stage
try:
    result = stage_module.execute(
        run_dir=run_dir,
        stage_dir=stage_dir,
        inputs=inputs,
        params=params,
        manifest=manifest,
    )
except Exception as e:
    import traceback
    result = {{
        "success": False,
        "outputs": [],
        "metadata": {{}},
        "errors": [
            f"Stage execution raised exception: {{e}}",
            traceback.format_exc(),
        ],
    }}

# Write result to file
result_file = Path(r"{result_file}")
with open(result_file, "w") as f:
    json.dump(result, f, indent=2)

print(f"Stage result written to: {{result_file}}")

# Exit cleanly
bpy.ops.wm.quit_blender()
"""

        return wrapper


def _resolve_fab_python() -> str:
    """
    Pick a Python executable for Fab subprocess tools (fab-gate, fab-godot, etc).

    Preference order:
      1) Explicit override via env (`CYNTRA_FAB_PYTHON` or `FAB_PYTHON`)
      2) Current interpreter if it can import `numpy`
      3) Fallback to `python` on PATH
    """
    override = os.environ.get("CYNTRA_FAB_PYTHON") or os.environ.get("FAB_PYTHON")
    if override and override.strip():
        return override.strip()

    try:
        probe = subprocess.run(
            [sys.executable, "-c", "import numpy"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        if probe.returncode == 0:
            return sys.executable
    except Exception:
        pass

    return "python"


def _fab_subprocess_env(*, repo_root: Path | None) -> dict[str, str]:
    """
    Build an environment for Fab subprocess invocations.

    Ensures `cyntra` is importable from source via `PYTHONPATH` even when the
    selected Python executable does not have Cyntra installed.
    """
    env = os.environ.copy()
    if repo_root is None:
        return env

    kernel_src = (repo_root / "cyntra-kernel" / "src").resolve()
    if kernel_src.exists():
        existing = env.get("PYTHONPATH")
        env["PYTHONPATH"] = str(kernel_src) if not existing else str(kernel_src) + os.pathsep + existing
    return env


def execute_godot_stage(
    stage: Dict[str, Any],
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute Godot build stage.

    Uses fab-godot CLI to create a playable web export from the exported GLB.
    """
    errors = []
    metadata = {}

    # Find the main GLB export from previous stages
    export_glb: Path | None = None
    world_dir = run_dir / "world"
    if world_dir.exists():
        glbs = sorted(world_dir.glob("*.glb"))
        if glbs:
            export_glb = glbs[0]

    if export_glb is None:
        errors.append("No GLB file found in world/ directory")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }

    print(f"Using GLB: {export_glb.name}")

    # Create Godot output directory
    godot_dir = run_dir / "godot"
    godot_dir.mkdir(parents=True, exist_ok=True)

    # Get gate config for Godot (use godot_integration_v001.yaml)
    gate_config = stage.get("gate_config", "godot_integration_v001")

    print(f"Building Godot export from {export_glb.name}...")
    print(f"Gate config: {gate_config}")

    # Prefer module invocation to avoid PATH issues when running from source.
    repo_root: Path | None = None
    for candidate in [run_dir.resolve(), *run_dir.resolve().parents]:
        if (candidate / ".git").exists():
            repo_root = candidate
            break

    python_exe = _resolve_fab_python()
    env = _fab_subprocess_env(repo_root=repo_root)

    cmd = [
        python_exe,
        "-m",
        "cyntra.fab.godot",
        "--asset", str(export_glb),
        "--config", gate_config,
        "--out", str(godot_dir),
    ]

    try:
        # Execute fab-godot
        start_time = time.time()

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
            env=env,
            cwd=repo_root or Path.cwd(),
        )

        duration_ms = int((time.time() - start_time) * 1000)

        # Check result
        if result.returncode != 0:
            errors.append(f"fab-godot exited with code {result.returncode}")
            errors.append(f"stderr: {result.stderr}")

            return {
                "success": False,
                "outputs": [],
                "metadata": {"duration_ms": duration_ms},
                "errors": errors,
            }

        # Collect outputs
        outputs = []

        # Look for index.html (web export)
        index_html = godot_dir / "index.html"
        if index_html.exists():
            outputs.append(str(index_html))

        # Look for project directory
        project_dir = godot_dir / "project"
        if project_dir.exists():
            outputs.append(str(project_dir))

        metadata["godot_export_complete"] = True
        metadata["duration_ms"] = duration_ms

        print(f"✓ Godot export complete: {len(outputs)} outputs")

        return {
            "success": True,
            "outputs": outputs,
            "metadata": metadata,
            "errors": [],
        }

    except subprocess.TimeoutExpired:
        errors.append("fab-godot timed out after 10 minutes")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }
    except Exception as e:
        errors.append(f"Failed to execute fab-godot: {e}")
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": errors,
        }


def execute_gate_stage(
    stage: Dict[str, Any],
    world_config,
    run_dir: Path,
    stage_dir: Path,
    asset_path: Path | None = None,
) -> Dict[str, Any]:
    """
    Execute a gate validation stage.

    Runs the gates declared in stage["gates"] against the exported world GLB.
    """
    errors: list[str] = []
    metadata: dict[str, Any] = {"gates": []}
    outputs: list[str] = []

    if asset_path is not None:
        main_glb = asset_path
    else:
        world_dir = run_dir / "world"
        world_id = getattr(world_config, "world_id", "world")
        main_glb = world_dir / f"{world_id}.glb"
        if not main_glb.exists() and world_dir.exists():
            glbs = sorted(world_dir.glob("*.glb"))
            if glbs:
                main_glb = glbs[0]

    if not main_glb.exists():
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": [f"GLB not found: {main_glb}"],
        }

    gate_refs = stage.get("gates", []) or []
    if not gate_refs:
        return {
            "success": True,
            "outputs": [],
            "metadata": {"skipped": True, "reason": "no gates configured"},
            "errors": [],
        }

    stage_dir.mkdir(parents=True, exist_ok=True)

    repo_root = None
    world_dir_cfg = getattr(world_config, "world_dir", None)
    if isinstance(world_dir_cfg, Path):
        for candidate in [world_dir_cfg.resolve(), *world_dir_cfg.resolve().parents]:
            if (candidate / ".git").exists():
                repo_root = candidate
                break

    python_exe = _resolve_fab_python()
    env = _fab_subprocess_env(repo_root=repo_root)

    def resolve_gate_path(gate_ref: str) -> Path | None:
        ref = Path(gate_ref)
        if ref.is_absolute() and ref.exists():
            return ref
        if ref.exists():
            return ref.resolve()
        if isinstance(world_dir_cfg, Path):
            candidate = (world_dir_cfg / ref).resolve()
            if candidate.exists():
                return candidate
        if repo_root is not None:
            candidate = (repo_root / ref).resolve()
            if candidate.exists():
                return candidate
        return None

    for gate_ref in gate_refs:
        gate_path = resolve_gate_path(str(gate_ref))
        gate_name = Path(str(gate_ref)).stem
        gate_out = stage_dir / gate_name
        gate_out.mkdir(parents=True, exist_ok=True)

        if gate_path is None:
            errors.append(f"Gate config not found: {gate_ref}")
            metadata["gates"].append({"gate": gate_name, "passed": False, "error": "config not found"})
            continue

        # Decide which harness to run based on config shape.
        is_godot_gate = False
        try:
            import yaml

            raw = yaml.safe_load(gate_path.read_text())
            if isinstance(raw, dict):
                if raw.get("category") == "engine_integration":
                    is_godot_gate = True
                if "requirements" in raw or "godot" in raw:
                    is_godot_gate = True
        except Exception:
            # Fall back to filename heuristic.
            if "godot" in gate_name.lower():
                is_godot_gate = True

        if is_godot_gate:
            cmd = [
                python_exe,
                "-m",
                "cyntra.fab.godot",
                "--asset",
                str(main_glb),
                "--config",
                str(gate_path),
                "--out",
                str(gate_out),
                "--json",
                "--skip-godot",
            ]
        else:
            render_dir: Path | None = None
            try:
                for candidate_dir in [run_dir / "render", gate_out / "render"]:
                    if not candidate_dir.exists():
                        continue
                    beauty = list((candidate_dir / "beauty").glob("*.png"))
                    clay = list((candidate_dir / "clay").glob("*.png"))
                    if beauty or clay:
                        render_dir = candidate_dir
                        break
            except Exception:
                render_dir = None

            cmd = [
                python_exe,
                "-m",
                "cyntra.fab.gate",
                "--asset",
                str(main_glb),
                "--config",
                str(gate_path),
                "--out",
                str(gate_out),
                *(
                    ["--render-dir", str(render_dir)]
                    if render_dir is not None
                    else []
                ),
                "--json",
            ]

        try:
            result = subprocess.run(
                cmd,
                cwd=repo_root or Path.cwd(),
                capture_output=True,
                text=True,
                timeout=1800,
                env=env,
            )
        except subprocess.TimeoutExpired:
            errors.append(f"Gate '{gate_name}' timed out")
            metadata["gates"].append({"gate": gate_name, "passed": False, "error": "timeout"})
            continue
        except Exception as e:
            errors.append(f"Gate '{gate_name}' failed to execute: {e}")
            metadata["gates"].append({"gate": gate_name, "passed": False, "error": str(e)})
            continue

        gate_stdout = (result.stdout or "").strip()
        gate_stderr = (result.stderr or "").strip()
        gate_json: dict[str, Any] | None = None
        if gate_stdout:
            try:
                import json

                gate_json = json.loads(gate_stdout)
            except Exception:
                gate_json = None

        passed = result.returncode == 0
        verdict_reason: str | None = None
        verdict_data: dict[str, Any] | None = None
        if gate_json and isinstance(gate_json, dict):
            verdict = gate_json.get("verdict")
            if isinstance(verdict, str) and verdict.lower() in {"pass", "fail", "escalate"}:
                passed = verdict.lower() == "pass"

        # Prefer structured on-disk artifacts for richer failure reasons.
        verdict_path = gate_out / "verdict" / "gate_verdict.json"
        if verdict_path.exists():
            try:
                import json

                raw_verdict = json.loads(verdict_path.read_text())
                if isinstance(raw_verdict, dict):
                    verdict_data = raw_verdict
                    verdict = verdict_data.get("verdict")
                    if isinstance(verdict, str) and verdict.lower() in {"pass", "fail", "escalate"}:
                        passed = verdict.lower() == "pass"
                    if isinstance(verdict_data.get("verdict_reason"), str):
                        verdict_reason = verdict_data["verdict_reason"]
            except Exception:
                pass

        gate_entry: dict[str, Any] = {
            "gate": gate_name,
            "passed": passed,
            "exit_code": result.returncode,
            "verdict": (gate_json or {}).get("verdict") if gate_json else None,
            "verdict_reason": verdict_reason,
            "config": str(gate_path),
        }
        if verdict_data:
            if isinstance(verdict_data.get("next_actions"), list):
                gate_entry["next_actions"] = verdict_data["next_actions"]
            if isinstance(verdict_data.get("failures"), dict):
                gate_entry["failures"] = verdict_data["failures"]
            if isinstance(verdict_data.get("scores"), dict):
                gate_entry["scores"] = verdict_data["scores"]

        metadata["gates"].append(gate_entry)

        # Capture logs for debugging.
        if gate_stderr:
            (gate_out / "stderr.log").write_text(gate_stderr + "\n")
            outputs.append(str(gate_out / "stderr.log"))
        if gate_stdout and gate_json is None:
            (gate_out / "stdout.log").write_text(gate_stdout + "\n")
            outputs.append(str(gate_out / "stdout.log"))

        # Add canonical artifacts if present.
        candidate_outputs = [
            gate_out / "verdict" / "gate_verdict.json",
            gate_out / "critics" / "report.json",
            gate_out / "manifest.json",
            gate_out / "godot_report.json",
        ]
        for candidate in candidate_outputs:
            if candidate.exists():
                outputs.append(str(candidate))

        if not passed:
            reason = verdict_reason
            if reason is None and gate_json and isinstance(gate_json, dict):
                reason = str(gate_json.get("failures") or gate_json.get("errors") or "").strip() or None
            errors.append(f"Gate '{gate_name}' failed{': ' + str(reason) if reason else ''}")

    success = not errors

    # Write a canonical, run-level verdict for universe tooling.
    try:
        import json
        from datetime import datetime, timezone

        world_id = getattr(world_config, "world_id", None)
        if not isinstance(world_id, str) or not world_id:
            world_id = main_glb.stem

        gate_entries = metadata.get("gates") if isinstance(metadata.get("gates"), list) else []
        overall_values: list[float] = []
        by_critic: dict[str, float] = {}
        hard_failures: list[str] = []
        soft_failures: list[str] = []
        next_actions: list[dict[str, Any]] = []

        for entry in gate_entries:
            if not isinstance(entry, dict):
                continue
            gate_name = str(entry.get("gate") or "").strip() or "gate"

            scores = entry.get("scores")
            if isinstance(scores, dict):
                overall = scores.get("overall")
                if isinstance(overall, (int, float)):
                    overall_values.append(float(overall))
                per = scores.get("by_critic")
                if isinstance(per, dict):
                    for critic_name, value in per.items():
                        if not isinstance(critic_name, str) or not critic_name:
                            continue
                        if isinstance(value, (int, float)):
                            by_critic[f"{gate_name}:{critic_name}"] = float(value)

            failures = entry.get("failures")
            if isinstance(failures, dict):
                hard = failures.get("hard")
                soft = failures.get("soft")
                if isinstance(hard, list):
                    for code in hard:
                        if isinstance(code, str) and code:
                            hard_failures.append(f"{gate_name}:{code}")
                if isinstance(soft, list):
                    for code in soft:
                        if isinstance(code, str) and code:
                            soft_failures.append(f"{gate_name}:{code}")

            actions = entry.get("next_actions")
            if isinstance(actions, list):
                for action in actions:
                    if not isinstance(action, dict):
                        continue
                    action_type = action.get("action")
                    priority = action.get("priority")
                    instructions = action.get("instructions")
                    if not isinstance(action_type, str) or not isinstance(instructions, str):
                        continue
                    if not isinstance(priority, int):
                        continue
                    payload: dict[str, Any] = {
                        "action": action_type,
                        "priority": priority,
                        "instructions": f"[{gate_name}] {instructions}",
                    }
                    fail_code = action.get("fail_code")
                    if isinstance(fail_code, str) and fail_code:
                        payload["fail_code"] = fail_code
                    template_ref = action.get("suggested_template_ref")
                    if isinstance(template_ref, str) and template_ref:
                        payload["suggested_template_ref"] = template_ref
                    next_actions.append(payload)

        next_actions.sort(key=lambda item: (int(item.get("priority") or 99), str(item.get("action") or "")))

        overall_score = min(overall_values) if overall_values else (1.0 if success else 0.0)

        duration_ms: int | None = None
        started_at: str | None = None
        manifest_path = run_dir / "manifest.json"
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except Exception:
                manifest = None
            if isinstance(manifest, dict):
                started_at_value = manifest.get("created_at")
                if isinstance(started_at_value, str):
                    started_at = started_at_value
                stages = manifest.get("stages")
                if isinstance(stages, list):
                    total = 0
                    for stage in stages:
                        if not isinstance(stage, dict):
                            continue
                        dur = stage.get("duration_ms")
                        if isinstance(dur, int) and dur >= 0:
                            total += dur
                    duration_ms = total

        verdict_dir = run_dir / "verdict"
        verdict_dir.mkdir(parents=True, exist_ok=True)
        completed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        timing: dict[str, Any] = {"completed_at": completed_at}
        if started_at is not None:
            timing["started_at"] = started_at
        if duration_ms is not None:
            timing["duration_ms"] = duration_ms

        artifacts: dict[str, str] = {}
        if manifest_path.exists():
            artifacts["manifest_path"] = str(manifest_path)
        render_root = run_dir / "render"
        if render_root.exists():
            artifacts["render_dir"] = str(render_root)
        else:
            artifacts["render_dir"] = str(stage_dir)

        verdict_payload: dict[str, Any] = {
            "schema_version": "1.0",
            "run_id": run_dir.name,
            "asset_id": world_id,
            "gate_config_id": f"world_validate_{world_id}",
            "verdict": "pass" if success else "fail",
            "verdict_reason": "All gates passed"
            if success
            else "Gate failures: " + ", ".join([e.get("gate") for e in gate_entries if isinstance(e, dict) and not e.get("passed")])
            if gate_entries
            else "One or more gates failed",
            "scores": {"overall": overall_score, "by_critic": by_critic},
            "failures": {"hard": hard_failures, "soft": soft_failures},
            "next_actions": next_actions,
            "timing": timing,
            "artifacts": artifacts,
        }

        (verdict_dir / "gate_verdict.json").write_text(
            json.dumps(verdict_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except Exception:
        # Verdict is best-effort: world builds should not fail because the summary couldn't be written.
        pass

    return {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }


def execute_stage(
    stage: Dict[str, Any],
    world_config,
    manifest,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute a stage based on its type.

    Args:
        stage: Stage configuration
        world_config: World configuration
        manifest: World manifest
        run_dir: Run directory
        stage_dir: Stage output directory
        inputs: Input stage directories
        params: Resolved parameters

    Returns:
        Stage execution result
    """
    stage_type = stage["type"]
    stage_id = stage["id"]

    if stage_type == "blender":
        executor = StageExecutor(world_config, manifest)
        return executor.execute_blender_stage(
            stage=stage,
            run_dir=run_dir,
            stage_dir=stage_dir,
            inputs=inputs,
            params=params,
        )

    elif stage_type == "gate":
        return execute_gate_stage(
            stage=stage,
            world_config=world_config,
            run_dir=run_dir,
            stage_dir=stage_dir,
        )

    elif stage_type == "godot":
        # Godot build stage - invoke fab-godot CLI
        return execute_godot_stage(
            stage=stage,
            run_dir=run_dir,
            stage_dir=stage_dir,
            inputs=inputs,
            params=params,
        )

    else:
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": [f"Unknown stage type: {stage_type}"],
        }
