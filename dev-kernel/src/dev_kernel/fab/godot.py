"""
Fab Godot Harness - Build a minimal playable Web export from a Blender-authored GLB.

This is an *engine integration* gate (separate from realism). It validates:
- Minimal gameplay metadata via naming conventions (spawn + colliders)
- Complexity budgets (materials / draw-call estimate)
- (When Godot is available) imports and exports a deterministic Web build

Usage:
  python -m dev_kernel.fab.godot --help
  python -m dev_kernel.fab.godot --asset scene.glb --config godot_integration_v001 --out /tmp/game
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import shutil
import struct
import subprocess
import sys
import time
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .config import find_gate_config

logger = logging.getLogger(__name__)

DEFAULT_REPAIR_PLAYBOOK: dict[str, dict[str, Any]] = {}

KHR_DRACO_MESH_COMPRESSION = "KHR_draco_mesh_compression"


def find_godot() -> Path | None:
    """Find a Godot executable on the system."""
    candidates = [
        # macOS app bundle
        "/Applications/Godot.app/Contents/MacOS/Godot",
        "/Applications/Godot_4.app/Contents/MacOS/Godot",
        "/Applications/Godot4.app/Contents/MacOS/Godot",
        str(Path.home() / "Applications/Godot.app/Contents/MacOS/Godot"),
        # Linux
        "/usr/bin/godot",
        "/usr/local/bin/godot",
    ]

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return path

    for name in ("godot", "godot4", "Godot"):
        which = shutil.which(name)
        if which:
            return Path(which).resolve()

    return None


def get_godot_version(godot_path: Path) -> str | None:
    try:
        result = subprocess.run(
            [str(godot_path), "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return None

    if result.returncode != 0:
        return None

    # Godot 4 prints like: "4.3.stable.official [hash]"
    version = result.stdout.strip().splitlines()[0].strip()
    return version or None


def read_glb_json(glb_path: Path) -> dict[str, Any]:
    """Read the JSON chunk from a .glb file (glTF 2.0 binary)."""
    file_size = glb_path.stat().st_size
    with glb_path.open("rb") as handle:
        header = handle.read(12)
        if len(header) < 12:
            raise ValueError("Invalid GLB: file too small")

        magic = header[0:4]
        if magic != b"glTF":
            raise ValueError("Invalid GLB: bad magic header")

        version, length = struct.unpack_from("<II", header, 4)
        if version != 2:
            raise ValueError(f"Unsupported GLB version: {version}")
        if length != file_size:
            raise ValueError("Invalid GLB: length header mismatch")

        offset = 12
        while offset + 8 <= length:
            handle.seek(offset)
            chunk_header = handle.read(8)
            if len(chunk_header) < 8:
                raise ValueError("Invalid GLB: truncated chunk header")

            chunk_length, chunk_type = struct.unpack("<I4s", chunk_header)
            chunk_start = offset + 8
            chunk_end = chunk_start + chunk_length
            if chunk_end > length:
                raise ValueError("Invalid GLB: chunk overruns file")

            if chunk_type == b"JSON":
                handle.seek(chunk_start)
                json_chunk = handle.read(chunk_length)
                if len(json_chunk) < chunk_length:
                    raise ValueError("Invalid GLB: truncated JSON chunk")
                # JSON chunk is padded with spaces to 4-byte alignment.
                return json.loads(json_chunk.decode("utf-8").rstrip(" \t\r\n\0"))

            offset = chunk_end

    raise ValueError("Invalid GLB: missing JSON chunk")


def _get_extensions(gltf: dict[str, Any], key: str) -> list[str]:
    value = gltf.get(key, [])
    if not isinstance(value, list):
        return []
    return [v for v in value if isinstance(v, str)]


def _parse_unsupported_extension(log_text: str) -> str | None:
    match = re.search(r"required extension '([^']+)' is not supported", log_text)
    if not match:
        return None
    ext = match.group(1).strip()
    return ext or None


def _log_tail(log_text: str, max_lines: int = 80) -> str:
    if max_lines <= 0:
        return ""
    lines = log_text.splitlines()
    if len(lines) <= max_lines:
        return log_text.strip()
    return "\n".join(lines[-max_lines:]).strip()


def _extract_error_lines(log_text: str, max_lines: int = 30) -> list[str]:
    lines = [line.strip() for line in log_text.splitlines() if "ERROR:" in line]
    if max_lines <= 0:
        return []
    return lines[-max_lines:]


def _strip_wrapping_quotes(value: str) -> str:
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        return v[1:-1]
    return v


def _parse_bool(value: str, default: bool) -> bool:
    v = _strip_wrapping_quotes(value).strip().lower()
    if v in {"true", "1", "yes", "y", "on"}:
        return True
    if v in {"false", "0", "no", "n", "off"}:
        return False
    return default


def _parse_int(value: str, default: int) -> int:
    v = _strip_wrapping_quotes(value).strip()
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _read_export_preset_options(export_presets_path: Path, preset_name: str) -> dict[str, str]:
    """
    Parse export preset options from Godot's `export_presets.cfg`.

    The file uses INI-like sections:
      [preset.0]
      name="Web"
      ...
      [preset.0.options]
      html/canvas_resize_policy=2
      ...
    """
    if not export_presets_path.exists():
        return {}

    lines = export_presets_path.read_text().splitlines()

    preset_index: str | None = None
    current_section: str | None = None
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if line.startswith("[") and line.endswith("]"):
            current_section = line[1:-1].strip()
            continue
        if not current_section:
            continue
        if not current_section.startswith("preset.") or ".options" in current_section:
            continue
        if not line.startswith("name="):
            continue
        name_value = _strip_wrapping_quotes(line.split("=", 1)[1])
        if name_value == preset_name:
            preset_index = current_section.split(".", 1)[1]
            break

    if preset_index is None:
        return {}

    options_section = f"preset.{preset_index}.options"
    current_section = None
    options: dict[str, str] = {}
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if line.startswith("[") and line.endswith("]"):
            current_section = line[1:-1].strip()
            continue
        if current_section != options_section:
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        options[key.strip()] = value.strip()

    return options


def _infer_export_templates_version_dir(godot_version: str | None) -> str | None:
    if not godot_version:
        return None
    token = godot_version.strip().split()[0]
    parts = token.split(".")
    if len(parts) >= 4:
        return ".".join(parts[:4])
    return token or None


def _find_godot_export_template_zip(
    *,
    godot_version: str | None,
    template_filename: str,
) -> Path | None:
    version_dir = _infer_export_templates_version_dir(godot_version)
    if not version_dir:
        return None

    candidates: list[Path] = []

    # macOS
    candidates.append(
        Path.home()
        / "Library"
        / "Application Support"
        / "Godot"
        / "export_templates"
        / version_dir
        / template_filename
    )

    # Linux (common)
    candidates.append(
        Path.home()
        / ".local"
        / "share"
        / "godot"
        / "export_templates"
        / version_dir
        / template_filename
    )
    candidates.append(
        Path.home()
        / ".local"
        / "share"
        / "Godot"
        / "export_templates"
        / version_dir
        / template_filename
    )

    # Windows (best-effort; not exhaustive)
    candidates.append(
        Path.home()
        / "AppData"
        / "Roaming"
        / "Godot"
        / "export_templates"
        / version_dir
        / template_filename
    )

    for path in candidates:
        if path.exists():
            return path
    return None


def _safe_extract_zip(zip_path: Path, dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            member_path = Path(member.filename)
            if member_path.is_absolute() or ".." in member_path.parts:
                raise ValueError(f"Unsafe zip entry: {member.filename}")
            out_path = dest_dir / member_path
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member, "r") as src, out_path.open("wb") as dst:
                shutil.copyfileobj(src, dst)


def _stitch_web_export_from_pack(
    *,
    output_dir: Path,
    pack_filename: str,
    options: dict[str, str],
    godot_version: str | None,
    export_log_path: Path,
    asset_id: str,
) -> None:
    thread_support = _parse_bool(options.get("variant/thread_support", "false"), False)
    extensions_support = _parse_bool(
        options.get("variant/extensions_support", "false"), False
    )

    if extensions_support and thread_support:
        template_zip_name = "web_dlink_release.zip"
    elif extensions_support and not thread_support:
        template_zip_name = "web_dlink_nothreads_release.zip"
    elif not extensions_support and thread_support:
        template_zip_name = "web_release.zip"
    else:
        template_zip_name = "web_nothreads_release.zip"

    template_zip = _find_godot_export_template_zip(
        godot_version=godot_version, template_filename=template_zip_name
    )
    if template_zip is None:
        raise FileNotFoundError(
            f"Godot export template zip not found: {template_zip_name} (version_dir={_infer_export_templates_version_dir(godot_version)!r})"
        )

    # Extract runtime files (godot.js/godot.wasm/etc) to output dir.
    _safe_extract_zip(template_zip, output_dir)

    # Build minimal HTML shell (index.html) by filling placeholders in godot.html.
    template_html_path = output_dir / "godot.html"
    if not template_html_path.exists():
        raise FileNotFoundError("Template html not found after extraction: godot.html")

    pack_path = output_dir / pack_filename
    if not pack_path.exists():
        raise FileNotFoundError(f"Export pack missing: {pack_filename}")

    file_sizes: dict[str, int] = {}
    for filename in ("godot.wasm", "godot.side.wasm", pack_filename):
        p = output_dir / filename
        if p.exists():
            file_sizes[filename] = p.stat().st_size

    canvas_resize_policy = _parse_int(options.get("html/canvas_resize_policy", "2"), 2)
    focus_canvas = _parse_bool(options.get("html/focus_canvas_on_start", "true"), True)
    experimental_vk = _parse_bool(
        options.get("html/experimental_virtual_keyboard", "false"), False
    )

    head_include = _strip_wrapping_quotes(options.get("html/head_include", "")).strip()
    ensure_coi = _parse_bool(
        options.get("progressive_web_app/ensure_cross_origin_isolation_headers", "false"),
        False,
    )

    config_obj: dict[str, Any] = {
        "canvasResizePolicy": canvas_resize_policy,
        "focusCanvas": focus_canvas,
        "experimentalVK": experimental_vk,
        "executable": "godot",
        "mainPack": pack_filename,
        "args": [],
        "fileSizes": file_sizes,
        # Keep service worker disabled unless we also fill its placeholders.
        "serviceWorker": "",
        "ensureCrossOriginIsolationHeaders": ensure_coi,
    }

    html = template_html_path.read_text()
    html = html.replace("$GODOT_PROJECT_NAME", asset_id)
    html = html.replace("$GODOT_SPLASH_COLOR", "#000000")
    html = html.replace("$GODOT_HEAD_INCLUDE", head_include)
    html = html.replace("$GODOT_SPLASH_CLASSES", "show-image--false fullsize--true use-filter--true")
    html = html.replace("$GODOT_SPLASH", "")
    html = html.replace("$GODOT_URL", "godot.js")
    html = html.replace("$GODOT_THREADS_ENABLED", "true" if thread_support else "false")
    html = html.replace("$GODOT_CONFIG", json.dumps(config_obj))

    index_path = output_dir / "index.html"
    index_path.write_text(html)

    (output_dir / "web_build_meta.json").write_text(
        json.dumps(
            {
                "method": "export-pack+template-zip",
                "template_zip": str(template_zip),
                "thread_support": thread_support,
                "extensions_support": extensions_support,
                "pack": pack_filename,
                "asset_id": asset_id,
                "godot_version": godot_version,
                "source_export_log": str(export_log_path),
            },
            indent=2,
        )
        + "\n"
    )


def _import_log_has_failure(log_text: str) -> bool:
    return (
        "Error importing 'res://" in log_text
        or "glTF: Can't import file" in log_text
        or "ERR_PARSE_ERROR" in log_text
    )


def _decode_draco_glb_with_blender(
    *,
    blender_bin: Path,
    source_glb: Path,
    dest_glb: Path,
    log_path: Path,
    timeout_s: int = 3600,
) -> None:
    dest_glb.parent.mkdir(parents=True, exist_ok=True)
    script_path = log_path.parent / "blender_decode_draco.py"
    script_path.write_text(
        "\n".join(
            [
                "import sys",
                "import bpy",
                "",
                "argv = sys.argv",
                "argv = argv[argv.index('--') + 1 :] if '--' in argv else []",
                "if len(argv) != 2:",
                "    raise SystemExit('Expected: <source_glb> <dest_glb>')",
                "source_glb, dest_glb = argv",
                "",
                "bpy.ops.wm.read_factory_settings(use_empty=True)",
                "bpy.ops.import_scene.gltf(filepath=source_glb)",
                "bpy.ops.export_scene.gltf(",
                "    filepath=dest_glb,",
                "    export_format='GLB',",
                "    export_draco_mesh_compression_enable=False,",
                ")",
                "",
            ]
        )
        + "\n"
    )

    cmd = [
        str(blender_bin),
        "--background",
        "--factory-startup",
        "--python",
        str(script_path),
        "--",
        str(source_glb),
        str(dest_glb),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    log_path.write_text((result.stdout or "") + "\n" + (result.stderr or ""))
    if result.returncode != 0:
        raise RuntimeError(f"Blender Draco decode failed (exit {result.returncode})")
    if not dest_glb.exists():
        raise RuntimeError("Blender Draco decode did not produce output GLB")


def _ensure_web_compatibility_renderer(project_godot_path: Path) -> bool:
    """
    Godot Web exports run on WebGL, which requires the Compatibility renderer.

    Some templates default to Vulkan renderers (Forward+/Mobile). To make the
    engine integration gate more robust, force `renderer/rendering_method` to
    `gl_compatibility` for Web exports.
    """
    if not project_godot_path.exists():
        return False

    lines = project_godot_path.read_text().splitlines()

    def _is_setting_line(line: str) -> bool:
        return line.strip().startswith("renderer/rendering_method=")

    for i, line in enumerate(lines):
        if _is_setting_line(line):
            if '"gl_compatibility"' in line or "=gl_compatibility" in line:
                return False
            lines[i] = 'renderer/rendering_method="gl_compatibility"'
            project_godot_path.write_text("\n".join(lines) + "\n")
            return True

    # Insert inside an existing [rendering] section if present.
    for i, line in enumerate(lines):
        if line.strip() == "[rendering]":
            insert_at = i + 1
            lines.insert(insert_at, 'renderer/rendering_method="gl_compatibility"')
            project_godot_path.write_text("\n".join(lines) + "\n")
            return True

    # Otherwise append a new section.
    if lines and lines[-1].strip() != "":
        lines.append("")
    lines.extend(["[rendering]", "", 'renderer/rendering_method="gl_compatibility"'])
    project_godot_path.write_text("\n".join(lines) + "\n")
    return True


def _name_is_spawn(name: str, spawn_names: list[str]) -> bool:
    upper = name.strip().upper()
    for token in spawn_names:
        t = token.strip().upper()
        if upper == t or upper.startswith(t + "_"):
            return True
    return False


def _name_has_prefix(name: str, prefixes: list[str]) -> bool:
    upper = name.strip().upper()
    for prefix in prefixes:
        p = prefix.strip().upper()
        if upper.startswith(p):
            return True
    return False


@dataclass
class GltfStats:
    node_count: int
    mesh_count: int
    material_count: int
    primitive_count: int
    draw_calls_estimate: int
    node_names: list[str]


def compute_gltf_stats(gltf: dict[str, Any]) -> GltfStats:
    nodes = gltf.get("nodes", []) if isinstance(gltf.get("nodes", []), list) else []
    meshes = gltf.get("meshes", []) if isinstance(gltf.get("meshes", []), list) else []
    materials = (
        gltf.get("materials", []) if isinstance(gltf.get("materials", []), list) else []
    )

    node_names: list[str] = []
    mesh_ref_counts: dict[int, int] = {}
    for node in nodes:
        if isinstance(node, dict):
            name = node.get("name")
            if isinstance(name, str):
                node_names.append(name)
            mesh_index = node.get("mesh")
            if isinstance(mesh_index, int):
                mesh_ref_counts[mesh_index] = mesh_ref_counts.get(mesh_index, 0) + 1

    primitive_counts: dict[int, int] = {}
    total_primitives = 0
    for i, mesh in enumerate(meshes):
        if not isinstance(mesh, dict):
            continue
        primitives = mesh.get("primitives", [])
        if not isinstance(primitives, list):
            continue
        primitive_count = sum(1 for p in primitives if isinstance(p, dict))
        primitive_counts[i] = primitive_count
        total_primitives += primitive_count

    draw_calls = 0
    for mesh_index, ref_count in mesh_ref_counts.items():
        draw_calls += primitive_counts.get(mesh_index, 0) * ref_count

    return GltfStats(
        node_count=len(nodes),
        mesh_count=len(meshes),
        material_count=len(materials),
        primitive_count=total_primitives,
        draw_calls_estimate=draw_calls,
        node_names=node_names,
    )


@dataclass
class GodotRequirements:
    require_spawn: bool = True
    spawn_names: list[str] = field(default_factory=lambda: ["SPAWN_PLAYER", "OL_SPAWN_PLAYER"])
    require_colliders: bool = True
    collider_prefixes: list[str] = field(default_factory=lambda: ["COLLIDER_", "OL_COLLIDER_"])
    trigger_prefixes: list[str] = field(default_factory=lambda: ["TRIGGER_", "OL_TRIGGER_"])
    interact_prefixes: list[str] = field(default_factory=lambda: ["INTERACT_", "OL_INTERACT_"])


@dataclass
class GodotBudgets:
    max_materials: int = 256
    max_draw_calls_est: int = 8000
    max_nodes: int = 100000


@dataclass
class GodotConfig:
    export_preset: str = "Web"
    level_asset_relpath: str = "assets/level.glb"
    decode_draco_mesh_compression: bool = True


@dataclass
class GodotGateConfig:
    gate_config_id: str
    category: str = "engine_integration"
    schema_version: str = "1.0"
    requirements: GodotRequirements = field(default_factory=GodotRequirements)
    budgets: GodotBudgets = field(default_factory=GodotBudgets)
    godot: GodotConfig = field(default_factory=GodotConfig)
    hard_fail_codes: list[str] = field(default_factory=list)
    repair_playbook: dict[str, dict[str, Any]] = field(default_factory=dict)


def load_godot_gate_config(config_path: Path) -> GodotGateConfig:
    raw = yaml.safe_load(config_path.read_text())
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid config format in {config_path}")

    requirements_raw = raw.get("requirements", {}) if isinstance(raw.get("requirements"), dict) else {}
    budgets_raw = raw.get("budgets", {}) if isinstance(raw.get("budgets"), dict) else {}
    godot_raw = raw.get("godot", {}) if isinstance(raw.get("godot"), dict) else {}

    requirements = GodotRequirements(
        require_spawn=bool(requirements_raw.get("require_spawn", True)),
        spawn_names=list(requirements_raw.get("spawn_names", GodotRequirements().spawn_names)),
        require_colliders=bool(requirements_raw.get("require_colliders", True)),
        collider_prefixes=list(
            requirements_raw.get("collider_prefixes", GodotRequirements().collider_prefixes)
        ),
        trigger_prefixes=list(
            requirements_raw.get("trigger_prefixes", GodotRequirements().trigger_prefixes)
        ),
        interact_prefixes=list(
            requirements_raw.get("interact_prefixes", GodotRequirements().interact_prefixes)
        ),
    )

    budgets = GodotBudgets(
        max_materials=int(budgets_raw.get("max_materials", 256)),
        max_draw_calls_est=int(budgets_raw.get("max_draw_calls_est", 8000)),
        max_nodes=int(budgets_raw.get("max_nodes", 100000)),
    )

    godot = GodotConfig(
        export_preset=str(godot_raw.get("export_preset", "Web")),
        level_asset_relpath=str(godot_raw.get("level_asset_relpath", "assets/level.glb")),
        decode_draco_mesh_compression=bool(
            godot_raw.get("decode_draco_mesh_compression", True)
        ),
    )

    return GodotGateConfig(
        gate_config_id=str(raw.get("gate_config_id", config_path.stem)),
        category=str(raw.get("category", "engine_integration")),
        schema_version=str(raw.get("schema_version", "1.0")),
        requirements=requirements,
        budgets=budgets,
        godot=godot,
        hard_fail_codes=list(raw.get("hard_fail_codes", [])),
        repair_playbook=raw.get("repair_playbook", {}) or {},
    )


@dataclass
class GodotGateResult:
    gate_config_id: str
    asset_id: str
    verdict: str
    stats: dict[str, Any]
    failures: dict[str, Any]
    artifacts: dict[str, str]
    timing: dict[str, Any]
    tool_versions: dict[str, str | None] = field(default_factory=dict)
    next_actions: list[dict[str, Any]] = field(default_factory=list)
    scores: dict[str, Any] = field(default_factory=dict)


def generate_next_actions(
    verdict: str,
    hard_fails: list[str],
    soft_fails: list[str],
    repair_playbook: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if verdict == "pass":
        return []

    actions: list[dict[str, Any]] = []
    for code in hard_fails + soft_fails:
        entry = repair_playbook.get(code)
        if entry:
            actions.append(
                {
                    "action": "repair",
                    "priority": int(entry.get("priority", 3)),
                    "fail_code": code,
                    "instructions": str(entry.get("instructions", f"Fix {code}")).strip(),
                }
            )
        else:
            actions.append(
                {
                    "action": "repair",
                    "priority": 3,
                    "fail_code": code,
                    "instructions": f"Fix {code}",
                }
            )

    actions.sort(key=lambda x: x.get("priority", 3))
    return actions


def run_godot_harness(
    *,
    asset_path: Path,
    config: GodotGateConfig,
    template_dir: Path,
    output_dir: Path,
    godot_path: Path | None = None,
    skip_godot: bool = False,
) -> GodotGateResult:
    start_time = time.time()
    output_dir.mkdir(parents=True, exist_ok=True)

    asset_id = asset_path.stem
    failure_details: dict[str, Any] = {}
    artifacts: dict[str, str] = {}
    scores: dict[str, Any] = {}

    # Parse GLB and validate contract + budgets.
    try:
        gltf = read_glb_json(asset_path)
        stats = compute_gltf_stats(gltf)
    except Exception as e:
        failure_details["ASSET_PARSE_FAILED"] = {"error": str(e)}
        hard_fails = ["ASSET_PARSE_FAILED"]
        soft_fails: list[str] = []
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats={},
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    extensions_used = _get_extensions(gltf, "extensionsUsed")
    extensions_required = _get_extensions(gltf, "extensionsRequired")
    uses_draco = KHR_DRACO_MESH_COMPRESSION in set(extensions_used + extensions_required)

    spawn_nodes = [n for n in stats.node_names if _name_is_spawn(n, config.requirements.spawn_names)]
    collider_nodes = [
        n for n in stats.node_names if _name_has_prefix(n, config.requirements.collider_prefixes)
    ]
    trigger_nodes = [
        n for n in stats.node_names if _name_has_prefix(n, config.requirements.trigger_prefixes)
    ]
    interact_nodes = [
        n for n in stats.node_names if _name_has_prefix(n, config.requirements.interact_prefixes)
    ]

    if config.requirements.require_spawn:
        if len(spawn_nodes) == 0:
            failure_details["CONTRACT_NO_SPAWN"] = {"expected": config.requirements.spawn_names}
        elif len(spawn_nodes) > 1:
            failure_details["CONTRACT_TOO_MANY_SPAWNS"] = {"found": spawn_nodes}

    if config.requirements.require_colliders and len(collider_nodes) == 0:
        failure_details["CONTRACT_NO_COLLIDERS"] = {
            "expected_prefixes": config.requirements.collider_prefixes
        }

    if stats.material_count > config.budgets.max_materials:
        failure_details["BUDGET_TOO_MANY_MATERIALS"] = {
            "found": stats.material_count,
            "max": config.budgets.max_materials,
        }

    if stats.draw_calls_estimate > config.budgets.max_draw_calls_est:
        failure_details["BUDGET_TOO_MANY_DRAW_CALLS"] = {
            "found": stats.draw_calls_estimate,
            "max": config.budgets.max_draw_calls_est,
        }

    if stats.node_count > config.budgets.max_nodes:
        failure_details["BUDGET_TOO_MANY_NODES"] = {
            "found": stats.node_count,
            "max": config.budgets.max_nodes,
        }

    stats_dict = {
        "node_count": stats.node_count,
        "mesh_count": stats.mesh_count,
        "material_count": stats.material_count,
        "primitive_count": stats.primitive_count,
        "draw_calls_estimate": stats.draw_calls_estimate,
        "gltf": {
            "extensions_used": extensions_used,
            "extensions_required": extensions_required,
        },
        "contract": {
            "spawns": spawn_nodes,
            "colliders": collider_nodes,
            "triggers": trigger_nodes,
            "interactables": interact_nodes,
        },
    }

    failure_codes = sorted(failure_details.keys())
    hard_fails = [c for c in failure_codes if c in set(config.hard_fail_codes)]
    soft_fails = [c for c in failure_codes if c not in set(config.hard_fail_codes)]

    scores["budgets_ok"] = not any(k.startswith("BUDGET_") for k in failure_details)
    scores["contract_ok"] = not any(k.startswith("CONTRACT_") for k in failure_details)

    # If contract/budget already fails, skip Godot build.
    if failure_details and not skip_godot:
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    if skip_godot:
        verdict = "pass" if not failure_details else "fail"
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            verdict,
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict=verdict,
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    # Godot build.
    godot_bin = godot_path or find_godot()
    if godot_bin is None:
        failure_details["GODOT_MISSING"] = {
            "hint": "Install Godot 4 and ensure `godot` is on PATH."
        }
        hard_fails = sorted({*hard_fails, "GODOT_MISSING"})
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            tool_versions={"godot": None},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    project_dir = output_dir / "project"
    if project_dir.exists():
        shutil.rmtree(project_dir)
    shutil.copytree(template_dir, project_dir)

    if config.godot.export_preset.strip().lower() == "web":
        forced = _ensure_web_compatibility_renderer(project_dir / "project.godot")
        if forced:
            artifacts["renderer_forced"] = "gl_compatibility"

    level_dest = project_dir / config.godot.level_asset_relpath
    level_dest.parent.mkdir(parents=True, exist_ok=True)
    if uses_draco and not config.godot.decode_draco_mesh_compression:
        failure_details["GODOT_UNSUPPORTED_GLTF_EXTENSION"] = {
            "extension": KHR_DRACO_MESH_COMPRESSION,
            "hint": "Godot 4.x does not support KHR_draco_mesh_compression; enable "
            "`decode_draco_mesh_compression` or export a non-Draco GLB for engine integration.",
        }
        hard_fails = sorted({*hard_fails, "GODOT_UNSUPPORTED_GLTF_EXTENSION"})
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            tool_versions={"godot": get_godot_version(godot_bin)},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    if uses_draco and config.godot.decode_draco_mesh_compression:
        from .render import find_blender

        decode_log = output_dir / "blender_decode_draco.log"
        artifacts["decode_draco_log"] = str(decode_log)

        blender_bin = find_blender()
        if blender_bin is None:
            failure_details["GODOT_DRACO_DECODE_FAILED"] = {
                "error": "Blender not found; cannot decode Draco-compressed GLB for Godot import.",
                "hint": "Install Blender or set `decode_draco_mesh_compression: false` and "
                "export a non-Draco GLB.",
                "log": str(decode_log),
            }
            hard_fails = sorted({*hard_fails, "GODOT_DRACO_DECODE_FAILED"})
            duration_ms = int((time.time() - start_time) * 1000)
            next_actions = generate_next_actions(
                "fail",
                hard_fails=hard_fails,
                soft_fails=soft_fails,
                repair_playbook=config.repair_playbook,
            )
            report = GodotGateResult(
                gate_config_id=config.gate_config_id,
                asset_id=asset_id,
                verdict="fail",
                stats=stats_dict,
                failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
                artifacts=artifacts,
                timing={"duration_ms": duration_ms},
                tool_versions={"godot": get_godot_version(godot_bin)},
                scores=scores,
                next_actions=next_actions,
            )
            _write_report(output_dir, report)
            return report

        try:
            _decode_draco_glb_with_blender(
                blender_bin=blender_bin,
                source_glb=asset_path,
                dest_glb=level_dest,
                log_path=decode_log,
            )
        except Exception as e:
            failure_details["GODOT_DRACO_DECODE_FAILED"] = {
                "error": str(e),
                "hint": "Re-export a non-Draco GLB, or ensure Blender can import this GLB.",
                "log": str(decode_log),
            }
            hard_fails = sorted({*hard_fails, "GODOT_DRACO_DECODE_FAILED"})
            duration_ms = int((time.time() - start_time) * 1000)
            next_actions = generate_next_actions(
                "fail",
                hard_fails=hard_fails,
                soft_fails=soft_fails,
                repair_playbook=config.repair_playbook,
            )
            report = GodotGateResult(
                gate_config_id=config.gate_config_id,
                asset_id=asset_id,
                verdict="fail",
                stats=stats_dict,
                failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
                artifacts=artifacts,
                timing={"duration_ms": duration_ms},
                tool_versions={"godot": get_godot_version(godot_bin)},
                scores=scores,
                next_actions=next_actions,
            )
            _write_report(output_dir, report)
            return report
    else:
        shutil.copy2(asset_path, level_dest)

    artifacts["project_dir"] = str(project_dir)

    import_log = output_dir / "godot_import.log"
    export_log = output_dir / "godot_export.log"
    artifacts["import_log"] = str(import_log)
    artifacts["export_log"] = str(export_log)

    import_rc, import_text = _run_godot_import(godot_bin, project_dir, import_log)
    unsupported_ext = _parse_unsupported_extension(import_text)
    if unsupported_ext is not None:
        failure_details["GODOT_UNSUPPORTED_GLTF_EXTENSION"] = {
            "extension": unsupported_ext,
            "log": str(import_log),
        }
        hard_fails = sorted({*hard_fails, "GODOT_UNSUPPORTED_GLTF_EXTENSION"})
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            tool_versions={"godot": get_godot_version(godot_bin)},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    if import_rc != 0 or _import_log_has_failure(import_text):
        failure_details["GODOT_IMPORT_FAILED"] = {
            "error": "Godot import failed" if import_rc != 0 else "Godot import reported errors",
            "exit_code": import_rc,
            "log": str(import_log),
            "errors": _extract_error_lines(import_text),
            "log_tail": _log_tail(import_text),
        }
        hard_fails = sorted({*hard_fails, "GODOT_IMPORT_FAILED"})
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            tool_versions={"godot": get_godot_version(godot_bin)},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    export_index = output_dir / "index.html"
    export_index_abs = export_index.resolve()
    export_rc, _export_text = _run_godot_export(
        godot_bin, project_dir, config.godot.export_preset, export_index_abs, export_log
    )
    if export_rc != 0:
        # Godot Web export can fail with "configuration errors" despite a valid project/import.
        # As a pragmatic fallback, export the pack and stitch it with the official Web runtime template.
        if config.godot.export_preset.strip().lower() == "web":
            try:
                export_pack_log = output_dir / "godot_export_pack.log"
                artifacts["export_pack_log"] = str(export_pack_log)

                pack_filename = f"{asset_id}.pck"
                export_pack_path = output_dir / pack_filename
                pack_rc, _pack_text = _run_godot_export_pack(
                    godot_bin,
                    project_dir,
                    config.godot.export_preset,
                    export_pack_path,
                    export_pack_log,
                )

                if pack_rc == 0 and export_pack_path.exists():
                    options = _read_export_preset_options(
                        project_dir / "export_presets.cfg", config.godot.export_preset
                    )
                    _stitch_web_export_from_pack(
                        output_dir=output_dir,
                        pack_filename=pack_filename,
                        options=options,
                        godot_version=get_godot_version(godot_bin),
                        export_log_path=export_log,
                        asset_id=asset_id,
                    )

                    artifacts["web_index"] = str(export_index)
                    artifacts["export_pack"] = str(export_pack_path)
                    artifacts["web_build_meta"] = str(output_dir / "web_build_meta.json")

                    failure_details["GODOT_EXPORT_FALLBACK_USED"] = {
                        "warning": "Godot --export-release failed; built Web export via --export-pack + template zip.",
                        "export_release_exit_code": export_rc,
                        "export_release_log": str(export_log),
                        "export_pack_log": str(export_pack_log),
                    }
                    soft_fails = sorted({*soft_fails, "GODOT_EXPORT_FALLBACK_USED"})

                    duration_ms = int((time.time() - start_time) * 1000)
                    report = GodotGateResult(
                        gate_config_id=config.gate_config_id,
                        asset_id=asset_id,
                        verdict="pass",
                        stats=stats_dict,
                        failures={
                            "hard": hard_fails,
                            "soft": soft_fails,
                            "details": failure_details,
                        },
                        artifacts=artifacts,
                        timing={"duration_ms": duration_ms},
                        tool_versions={"godot": get_godot_version(godot_bin)},
                        scores=scores,
                        next_actions=[],
                    )
                    _write_report(output_dir, report)
                    return report
                raise RuntimeError(
                    f"Godot export-pack failed (exit {pack_rc}); see {export_pack_log}"
                )

            except Exception as e:
                failure_details["GODOT_EXPORT_FALLBACK_FAILED"] = {
                    "error": str(e),
                    "export_release_exit_code": export_rc,
                    "export_release_log": str(export_log),
                }
                soft_fails = sorted({*soft_fails, "GODOT_EXPORT_FALLBACK_FAILED"})

        failure_details["GODOT_EXPORT_FAILED"] = {
            "error": "Godot export failed",
            "exit_code": export_rc,
            "log": str(export_log),
            "errors": _extract_error_lines(_export_text),
            "log_tail": _log_tail(_export_text),
        }
        hard_fails = sorted({*hard_fails, "GODOT_EXPORT_FAILED"})
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            tool_versions={"godot": get_godot_version(godot_bin)},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    if not export_index_abs.exists():
        failure_details["GODOT_EXPORT_FAILED"] = {
            "error": "Godot export did not produce index.html",
            "log": str(export_log),
        }
        hard_fails = sorted({*hard_fails, "GODOT_EXPORT_FAILED"})
        duration_ms = int((time.time() - start_time) * 1000)
        next_actions = generate_next_actions(
            "fail",
            hard_fails=hard_fails,
            soft_fails=soft_fails,
            repair_playbook=config.repair_playbook,
        )
        report = GodotGateResult(
            gate_config_id=config.gate_config_id,
            asset_id=asset_id,
            verdict="fail",
            stats=stats_dict,
            failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
            artifacts=artifacts,
            timing={"duration_ms": duration_ms},
            tool_versions={"godot": get_godot_version(godot_bin)},
            scores=scores,
            next_actions=next_actions,
        )
        _write_report(output_dir, report)
        return report

    artifacts["web_index"] = str(export_index)

    duration_ms = int((time.time() - start_time) * 1000)
    report = GodotGateResult(
        gate_config_id=config.gate_config_id,
        asset_id=asset_id,
        verdict="pass",
        stats=stats_dict,
        failures={"hard": hard_fails, "soft": soft_fails, "details": failure_details},
        artifacts=artifacts,
        timing={"duration_ms": duration_ms},
        tool_versions={"godot": get_godot_version(godot_bin)},
        scores=scores,
        next_actions=[],
    )
    _write_report(output_dir, report)
    return report


def _run_godot_import(godot_bin: Path, project_dir: Path, log_path: Path) -> tuple[int, str]:
    project_dir_abs = project_dir.resolve()
    cmd = [
        str(godot_bin),
        "--verbose",
        "--headless",
        "--path",
        str(project_dir_abs),
        "--import",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    log_text = (result.stdout or "") + "\n" + (result.stderr or "")
    log_path.write_text(log_text)
    return result.returncode, log_text


def _run_godot_export(
    godot_bin: Path,
    project_dir: Path,
    export_preset: str,
    export_index: Path,
    log_path: Path,
) -> tuple[int, str]:
    project_dir_abs = project_dir.resolve()
    export_index_abs = export_index.resolve()
    cmd = [
        str(godot_bin),
        "--verbose",
        "--headless",
        "--path",
        str(project_dir_abs),
        "--export-release",
        export_preset,
        str(export_index_abs),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    log_text = (result.stdout or "") + "\n" + (result.stderr or "")
    log_path.write_text(log_text)
    return result.returncode, log_text


def _run_godot_export_pack(
    godot_bin: Path,
    project_dir: Path,
    export_preset: str,
    export_pack: Path,
    log_path: Path,
) -> tuple[int, str]:
    project_dir_abs = project_dir.resolve()
    export_pack_abs = export_pack.resolve()
    cmd = [
        str(godot_bin),
        "--verbose",
        "--headless",
        "--path",
        str(project_dir_abs),
        "--export-pack",
        export_preset,
        str(export_pack_abs),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    log_text = (result.stdout or "") + "\n" + (result.stderr or "")
    log_path.write_text(log_text)
    return result.returncode, log_text


def _write_report(output_dir: Path, report: GodotGateResult) -> None:
    report_path = output_dir / "godot_report.json"
    report_path.write_text(json.dumps(asdict(report), indent=2, default=str) + "\n")


def _parse_args(args: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fab Godot integration gate")
    parser.add_argument("--asset", type=Path, required=True, help="Path to exported .glb asset")
    parser.add_argument(
        "--config",
        type=str,
        default="godot_integration_v001",
        help="Gate config ID (in fab/gates/) or path to YAML",
    )
    parser.add_argument("--template-dir", type=Path, default=Path("fab/godot/template"))
    parser.add_argument("--out", type=Path, required=True, help="Output directory for build + report")
    parser.add_argument("--godot", type=Path, default=None, help="Optional path to Godot binary")
    parser.add_argument(
        "--skip-godot",
        action="store_true",
        help="Only validate GLB + budgets; do not run Godot import/export",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON to stdout")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    return parser.parse_args(args)


def main(args: list[str] | None = None) -> int:
    parsed = _parse_args(args or sys.argv[1:])
    logging.basicConfig(
        level=logging.DEBUG if parsed.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    config_path = Path(parsed.config)
    if not (config_path.exists() and config_path.suffix in (".yaml", ".yml")):
        config_path = find_gate_config(parsed.config)
    gate_config = load_godot_gate_config(config_path)

    result = run_godot_harness(
        asset_path=parsed.asset,
        config=gate_config,
        template_dir=parsed.template_dir,
        output_dir=parsed.out,
        godot_path=parsed.godot,
        skip_godot=parsed.skip_godot,
    )

    if parsed.json:
        print(json.dumps(asdict(result), indent=2, default=str))
    else:
        print("\n" + "=" * 60)
        print("Fab Godot Gate Result")
        print("=" * 60)
        print(f"Asset:   {result.asset_id}")
        print(f"Config:  {result.gate_config_id}")
        print(f"Verdict: {result.verdict.upper()}")
        print(f"Output:  {parsed.out}")
        print("=" * 60 + "\n")

    if result.verdict == "pass":
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
