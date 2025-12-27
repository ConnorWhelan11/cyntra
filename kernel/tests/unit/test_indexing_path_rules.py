from __future__ import annotations

from pathlib import Path

from cyntra.indexing.path_rules import (
    build_artifact_path_info,
    discover_repo_root,
    infer_artifact_kind,
    infer_content_type,
    infer_run_id,
    make_repo_path,
    sha256_text,
)


def test_discover_repo_root(tmp_path: Path) -> None:
    (tmp_path / ".cyntra").mkdir()
    (tmp_path / ".cyntra" / "config.yaml").write_text("ok", encoding="utf-8")

    nested = tmp_path / "a" / "b" / "c"
    nested.mkdir(parents=True)
    assert discover_repo_root(nested) == tmp_path


def test_make_repo_path_normalizes_separators() -> None:
    assert (
        make_repo_path(".cyntra/runs", "run_123/terminal.log")
        == ".cyntra/runs/run_123/terminal.log"
    )
    assert make_repo_path("docs", r"foo\\bar.md") == "docs/foo/bar.md"


def test_infer_run_id() -> None:
    assert infer_run_id("cyntra_runs", "run_123/terminal.log") == "run_123"
    assert (
        infer_run_id("cyntra_archives", "wc-1-20250101T000000Z/manifest.json")
        == "wc-1-20250101T000000Z"
    )
    assert infer_run_id("docs", "foo.md") is None


def test_infer_artifact_kind() -> None:
    assert infer_artifact_kind(".cyntra/archives/wc-1/manifest.json") == "workcell_manifest"
    assert infer_artifact_kind(".cyntra/archives/wc-1/rollout.json") == "rollout"
    assert infer_artifact_kind(".cyntra/archives/wc-1/proof.json") == "proof"
    assert infer_artifact_kind(".cyntra/runs/run_1/run_meta.json") == "run_meta"
    assert infer_artifact_kind("fab/worlds/demo/world.yaml") == "world_config"
    assert infer_artifact_kind("docs/spec.md") == "doc"
    assert infer_artifact_kind("tmp/events.jsonl") == "json"
    assert infer_artifact_kind("tmp/out.log") == "log"


def test_infer_content_type() -> None:
    assert infer_content_type("docs/spec.md") == "text/markdown"
    assert infer_content_type("fab/worlds/demo/world.yaml") == "application/x-yaml"
    assert infer_content_type("tmp/events.jsonl") == "application/x-ndjson"
    assert infer_content_type("tmp/report.json") == "application/json"
    assert infer_content_type("tmp/out.log") == "text/plain"


def test_sha256_text_stable() -> None:
    assert sha256_text("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_build_artifact_path_info() -> None:
    info = build_artifact_path_info(
        source_kind="cyntra_runs",
        repo_prefix=".cyntra/runs",
        source_relpath="run_123/terminal.log",
    )
    assert info.artifact_id == ".cyntra/runs/run_123/terminal.log"
    assert info.repo_path == ".cyntra/runs/run_123/terminal.log"
    assert info.run_id == "run_123"
    assert info.artifact_kind == "terminal_log"
    assert info.content_type == "text/plain"
