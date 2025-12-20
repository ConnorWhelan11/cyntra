"""
Prepare Stage - Initialize Blender environment for deterministic builds.

This stage:
1. Injects determinism (seeds, environment)
2. Enables required addons (Sverchok)
3. Validates addon availability
4. Sets up base scene configuration

Implements the standard Fab World stage contract.
"""

from pathlib import Path
from typing import Any, Dict, Mapping
import os
import sys


def execute(
    *,
    run_dir: Path,
    stage_dir: Path,
    inputs: Mapping[str, Path],
    params: Dict[str, Any],
    manifest: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute the prepare stage.

    Returns:
        {
            "success": True/False,
            "outputs": [list of created file paths],
            "metadata": {stage-specific data},
            "errors": [list of error messages if failed]
        }
    """
    errors = []
    metadata = {}

    try:
        # Import bpy inside function so module is importable in CPython unit tests
        import bpy
    except ImportError:
        return {
            "success": False,
            "outputs": [],
            "metadata": {},
            "errors": ["Blender Python (bpy) not available - must run in Blender"],
        }

    # ==========================================================================
    # 1. INJECT DETERMINISM
    # ==========================================================================

    seed = manifest.get("determinism", {}).get("seed", 42)
    pythonhashseed = manifest.get("determinism", {}).get("pythonhashseed", 0)
    cycles_seed = manifest.get("determinism", {}).get("cycles_seed", 42)

    # Set Python random seed
    import random
    random.seed(seed)
    metadata["random_seed"] = seed

    # Set Blender scene seed (for modifiers, particles, etc.)
    bpy.context.scene.frame_current = 1  # Consistent frame

    # Set Cycles seed if available
    if hasattr(bpy.context.scene, "cycles"):
        bpy.context.scene.cycles.seed = cycles_seed
        bpy.context.scene.cycles.use_animated_seed = False
        metadata["cycles_seed"] = cycles_seed

    # Verify environment
    actual_pythonhashseed = os.environ.get("PYTHONHASHSEED", "not set")
    if actual_pythonhashseed != str(pythonhashseed):
        errors.append(
            f"PYTHONHASHSEED mismatch: expected {pythonhashseed}, got {actual_pythonhashseed}"
        )

    metadata["pythonhashseed"] = actual_pythonhashseed

    # ==========================================================================
    # 2. ENABLE REQUIRED ADDONS
    # ==========================================================================

    required_addons = manifest.get("generator", {}).get("required_addons", [])
    enabled_addons = []
    missing_addons = []

    for addon_spec in required_addons:
        addon_id = addon_spec["id"]
        is_required = addon_spec.get("required", True)

        # Try to enable the addon
        try:
            bpy.ops.preferences.addon_enable(module=addon_id)
            enabled_addons.append(addon_id)
            print(f"✓ Enabled addon: {addon_id}")
        except Exception as e:
            # Some addons (notably Sverchok) are commonly installed with a
            # directory name suffix (e.g. "sverchok-master"). Try to resolve
            # a best-effort match before failing.
            try:
                import addon_utils

                available = [m.__name__ for m in addon_utils.modules()]
                needle = addon_id.lower()

                def _matches(name: str) -> bool:
                    lowered = name.lower()
                    if lowered == needle:
                        return True
                    if lowered.startswith(needle):
                        return True
                    if needle in lowered:
                        return True
                    return False

                candidates = [name for name in available if _matches(name)]
                enabled = False
                for candidate in candidates:
                    try:
                        bpy.ops.preferences.addon_enable(module=candidate)
                        enabled_addons.append(candidate)
                        metadata.setdefault("addon_aliases", {})[addon_id] = candidate
                        print(f"✓ Enabled addon: {candidate} (requested '{addon_id}')")
                        enabled = True
                        break
                    except Exception:
                        continue

                if enabled:
                    continue
            except Exception:
                # Ignore addon resolution errors and fall through to original failure handling.
                pass

            if is_required:
                missing_addons.append(addon_id)
                errors.append(
                    f"Required addon '{addon_id}' not available: {e}\n"
                    f"Install it in Blender: Edit > Preferences > Add-ons > Install"
                )
            else:
                print(f"⚠ Optional addon '{addon_id}' not available: {e}")

    metadata["enabled_addons"] = enabled_addons
    metadata["missing_addons"] = missing_addons

    # ==========================================================================
    # 3. CONFIGURE SCENE SETTINGS
    # ==========================================================================

    # Set CPU rendering for determinism
    bpy.context.scene.cycles.device = "CPU"

    # Disable relative paths (use absolute for reproducibility)
    bpy.context.preferences.filepaths.use_relative_paths = False

    # Set default unit system
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"

    metadata["render_device"] = bpy.context.scene.cycles.device
    metadata["unit_system"] = bpy.context.scene.unit_settings.system

    # ==========================================================================
    # 4. RECORD VERSIONS
    # ==========================================================================

    metadata["blender_version"] = bpy.app.version_string
    metadata["python_version"] = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

    # Try to get Sverchok version if available
    try:
        import sverchok
        if hasattr(sverchok, "bl_info"):
            sv_version = sverchok.bl_info.get("version", "unknown")
            metadata["sverchok_version"] = ".".join(map(str, sv_version))
    except (ImportError, AttributeError):
        metadata["sverchok_version"] = "not installed"

    # ==========================================================================
    # 5. SAVE PREPARED SCENE
    # ==========================================================================

    stage_dir.mkdir(parents=True, exist_ok=True)
    prepared_blend = stage_dir / "prepared.blend"

    bpy.ops.wm.save_as_mainfile(filepath=str(prepared_blend))

    outputs = [str(prepared_blend)]

    # ==========================================================================
    # RETURN
    # ==========================================================================

    success = len(errors) == 0

    result = {
        "success": success,
        "outputs": outputs,
        "metadata": metadata,
        "errors": errors,
    }

    if success:
        print(f"✓ Prepare stage complete: {len(enabled_addons)} addons enabled")
    else:
        print(f"✗ Prepare stage failed with {len(errors)} error(s)")

    return result
