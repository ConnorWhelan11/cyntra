import json
import struct
from pathlib import Path

import pytest


def _write_minimal_glb(path: Path, gltf: dict) -> None:
    json_bytes = json.dumps(gltf).encode("utf-8")
    # GLB JSON chunk must be 4-byte aligned (pad with spaces).
    json_bytes += b" " * ((4 - (len(json_bytes) % 4)) % 4)

    total_length = 12 + 8 + len(json_bytes)
    header = b"glTF" + struct.pack("<II", 2, total_length)
    chunk_header = struct.pack("<I4s", len(json_bytes), b"JSON")
    path.write_bytes(header + chunk_header + json_bytes)


def test_read_glb_json_and_stats(tmp_path: Path) -> None:
    from cyntra.fab.godot import compute_gltf_stats, read_glb_json

    glb_path = tmp_path / "level.glb"
    _write_minimal_glb(
        glb_path,
        {
            "asset": {"version": "2.0"},
            "nodes": [
                {"name": "SPAWN_PLAYER"},
                {"name": "COLLIDER_GROUND", "mesh": 0},
                {"name": "MeshThing", "mesh": 0},
            ],
            "meshes": [{"primitives": [{}, {}]}],
            "materials": [{}, {}, {}],
        },
    )

    gltf = read_glb_json(glb_path)
    stats = compute_gltf_stats(gltf)

    assert stats.node_count == 3
    assert stats.mesh_count == 1
    assert stats.material_count == 3
    assert stats.primitive_count == 2
    # mesh referenced by 2 nodes, 2 primitives -> 4 draw calls estimate
    assert stats.draw_calls_estimate == 4


def test_gate_contract_failures_without_markers(tmp_path: Path) -> None:
    from cyntra.fab.godot import GodotGateConfig, run_godot_harness

    glb_path = tmp_path / "level.glb"
    _write_minimal_glb(
        glb_path,
        {
            "asset": {"version": "2.0"},
            "nodes": [{"name": "JustAThing", "mesh": 0}],
            "meshes": [{"primitives": [{}]}],
            "materials": [{}],
        },
    )

    out_dir = tmp_path / "out"
    result = run_godot_harness(
        asset_path=glb_path,
        config=GodotGateConfig(gate_config_id="godot_integration_v001"),
        template_dir=tmp_path / "template",
        output_dir=out_dir,
        skip_godot=True,
    )

    assert result.verdict == "fail"
    details = result.failures.get("details", {})
    assert "CONTRACT_NO_SPAWN" in details
    assert "CONTRACT_NO_COLLIDERS" in details
    assert result.next_actions, "Expected repair actions for contract failures"


def test_gate_budget_failures(tmp_path: Path) -> None:
    from cyntra.fab.godot import GodotBudgets, GodotGateConfig, run_godot_harness

    glb_path = tmp_path / "level.glb"
    _write_minimal_glb(
        glb_path,
        {
            "asset": {"version": "2.0"},
            "nodes": [{"name": "SPAWN_PLAYER"}, {"name": "COLLIDER_GROUND", "mesh": 0}],
            "meshes": [{"primitives": [{} for _ in range(10)]}],
            "materials": [{} for _ in range(50)],
        },
    )

    out_dir = tmp_path / "out"
    result = run_godot_harness(
        asset_path=glb_path,
        config=GodotGateConfig(
            gate_config_id="godot_integration_v001",
            budgets=GodotBudgets(max_materials=10, max_draw_calls_est=5, max_nodes=10),
        ),
        template_dir=tmp_path / "template",
        output_dir=out_dir,
        skip_godot=True,
    )

    assert result.verdict == "fail"
    details = result.failures.get("details", {})
    assert "BUDGET_TOO_MANY_MATERIALS" in details
    assert "BUDGET_TOO_MANY_DRAW_CALLS" in details


def test_gate_fails_fast_on_draco_when_decode_disabled(tmp_path: Path) -> None:
    from cyntra.fab.godot import (
        KHR_DRACO_MESH_COMPRESSION,
        GodotConfig,
        GodotGateConfig,
        run_godot_harness,
    )

    glb_path = tmp_path / "level.glb"
    _write_minimal_glb(
        glb_path,
        {
            "asset": {"version": "2.0"},
            "extensionsRequired": [KHR_DRACO_MESH_COMPRESSION],
            "nodes": [{"name": "SPAWN_PLAYER"}, {"name": "COLLIDER_GROUND", "mesh": 0}],
            "meshes": [{"primitives": [{}]}],
            "materials": [{}],
        },
    )

    (tmp_path / "template").mkdir()
    godot_bin = tmp_path / "godot"
    godot_bin.write_text("#!/bin/sh\nexit 0\n")

    out_dir = tmp_path / "out"
    result = run_godot_harness(
        asset_path=glb_path,
        config=GodotGateConfig(
            gate_config_id="godot_integration_v001",
            godot=GodotConfig(decode_draco_mesh_compression=False),
        ),
        template_dir=tmp_path / "template",
        output_dir=out_dir,
        godot_path=godot_bin,
        skip_godot=False,
    )

    assert result.verdict == "fail"
    details = result.failures.get("details", {})
    assert "GODOT_UNSUPPORTED_GLTF_EXTENSION" in details
    assert details["GODOT_UNSUPPORTED_GLTF_EXTENSION"]["extension"] == KHR_DRACO_MESH_COMPRESSION


def test_gate_reports_unsupported_extension_from_import_log(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from cyntra.fab import godot as godot_mod
    from cyntra.fab.godot import GodotGateConfig, run_godot_harness

    glb_path = tmp_path / "level.glb"
    _write_minimal_glb(
        glb_path,
        {
            "asset": {"version": "2.0"},
            "nodes": [{"name": "SPAWN_PLAYER"}, {"name": "COLLIDER_GROUND", "mesh": 0}],
            "meshes": [{"primitives": [{}]}],
            "materials": [{}],
        },
    )

    (tmp_path / "template").mkdir()
    godot_bin = tmp_path / "godot"
    godot_bin.write_text("#!/bin/sh\nexit 0\n")

    def fake_import(_godot_bin: Path, _project_dir: Path, log_path: Path) -> tuple[int, str]:
        log_text = (
            "ERROR: glTF: Can't import file 'level', required extension "
            "'KHR_draco_mesh_compression' is not supported.\n"
        )
        log_path.write_text(log_text)
        return 0, log_text

    def fake_export(*_args: object, **_kwargs: object) -> tuple[int, str]:
        raise AssertionError("Export should not run when import reports unsupported extensions")

    monkeypatch.setattr(godot_mod, "_run_godot_import", fake_import)
    monkeypatch.setattr(godot_mod, "_run_godot_export", fake_export)

    out_dir = tmp_path / "out"
    result = run_godot_harness(
        asset_path=glb_path,
        config=GodotGateConfig(gate_config_id="godot_integration_v001"),
        template_dir=tmp_path / "template",
        output_dir=out_dir,
        godot_path=godot_bin,
        skip_godot=False,
    )

    assert result.verdict == "fail"
    details = result.failures.get("details", {})
    assert "GODOT_UNSUPPORTED_GLTF_EXTENSION" in details
    assert details["GODOT_UNSUPPORTED_GLTF_EXTENSION"]["extension"] == "KHR_draco_mesh_compression"


def test_gate_reports_draco_decode_failed_when_blender_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from cyntra.fab import render as render_mod
    from cyntra.fab.godot import (
        KHR_DRACO_MESH_COMPRESSION,
        GodotGateConfig,
        run_godot_harness,
    )

    glb_path = tmp_path / "level.glb"
    _write_minimal_glb(
        glb_path,
        {
            "asset": {"version": "2.0"},
            "extensionsRequired": [KHR_DRACO_MESH_COMPRESSION],
            "nodes": [{"name": "SPAWN_PLAYER"}, {"name": "COLLIDER_GROUND", "mesh": 0}],
            "meshes": [{"primitives": [{}]}],
            "materials": [{}],
        },
    )

    (tmp_path / "template").mkdir()
    godot_bin = tmp_path / "godot"
    godot_bin.write_text("#!/bin/sh\nexit 0\n")

    monkeypatch.setattr(render_mod, "find_blender", lambda: None)

    out_dir = tmp_path / "out"
    result = run_godot_harness(
        asset_path=glb_path,
        config=GodotGateConfig(gate_config_id="godot_integration_v001"),
        template_dir=tmp_path / "template",
        output_dir=out_dir,
        godot_path=godot_bin,
        skip_godot=False,
    )

    assert result.verdict == "fail"
    details = result.failures.get("details", {})
    assert "GODOT_DRACO_DECODE_FAILED" in details


def test_ensure_web_compatibility_renderer_patches_project_file(tmp_path: Path) -> None:
    from cyntra.fab.godot import _ensure_web_compatibility_renderer

    project_path = tmp_path / "project.godot"
    project_path.write_text(
        "\n".join(
            [
                "config_version=5",
                "",
                "[rendering]",
                "",
                'renderer/rendering_method="forward_plus"',
                "",
            ]
        )
        + "\n"
    )

    changed = _ensure_web_compatibility_renderer(project_path)
    assert changed is True
    assert 'renderer/rendering_method="gl_compatibility"' in project_path.read_text()
