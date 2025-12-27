from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


@dataclass(frozen=True)
class ArtifactPathInfo:
    artifact_id: str
    repo_path: str
    run_id: str | None
    artifact_kind: str
    content_type: str


def discover_repo_root(start: Path | None = None) -> Path:
    """
    Discover the Cyntra repo root by walking upward looking for `.cyntra/config.yaml`.

    This keeps the CocoIndex app usable from subdirectories without requiring callers
    to set a repo-root flag, while still staying local-first.
    """
    cursor = (start or Path.cwd()).resolve()
    for candidate in [cursor, *cursor.parents]:
        if (candidate / ".cyntra" / "config.yaml").exists():
            return candidate
    raise FileNotFoundError(
        "Unable to locate repo root (expected `.cyntra/config.yaml` in a parent dir)"
    )


def _normalize_relpath(relpath: str) -> str:
    return str(PurePosixPath(relpath.replace("\\", "/")))


def make_repo_path(prefix: str, source_relpath: str) -> str:
    prefix_norm = _normalize_relpath(prefix).strip("/")
    rel_norm = _normalize_relpath(source_relpath).lstrip("/")
    return str(PurePosixPath(prefix_norm) / PurePosixPath(rel_norm))


def infer_run_id(source_kind: str, source_relpath: str) -> str | None:
    """
    Infer `run_id` from the source+relpath.

    - `cyntra_runs`: `.cyntra/runs/<run_id>/...`
    - `cyntra_archives`: `.cyntra/archives/<workcell_id>/...` (workcell_id treated as run_id)
    - everything else: None
    """
    rel_norm = _normalize_relpath(source_relpath)
    parts = PurePosixPath(rel_norm).parts
    if not parts:
        return None
    if source_kind in {"cyntra_runs", "cyntra_archives"}:
        return parts[0]
    return None


def infer_artifact_kind(repo_path: str) -> str:
    p = PurePosixPath(_normalize_relpath(repo_path))
    name = p.name

    if name == "prompt.md":
        return "prompt"
    if name == "manifest.json":
        return "workcell_manifest"
    if name == "rollout.json":
        return "rollout"
    if name == "proof.json":
        return "proof"
    if name == "telemetry.jsonl":
        return "telemetry"
    if name == "terminal.log":
        return "terminal_log"
    if name == "run_meta.json":
        return "run_meta"
    if name == "job_result.json":
        return "job_result"

    if "fab/worlds" in p.as_posix() and name in {"world.yaml", "world.yml"}:
        return "world_config"

    ext = p.suffix.lower()
    if ext in {".md", ".mdx"}:
        return "doc"
    if ext in {".yaml", ".yml", ".toml"}:
        return "config"
    if ext in {".json", ".jsonl"}:
        return "json"
    if ext in {".log", ".txt"}:
        return "log"
    return "artifact"


def infer_content_type(repo_path: str) -> str:
    ext = PurePosixPath(_normalize_relpath(repo_path)).suffix.lower()
    if ext == ".json":
        return "application/json"
    if ext == ".jsonl":
        return "application/x-ndjson"
    if ext in {".yaml", ".yml"}:
        return "application/x-yaml"
    if ext == ".toml":
        return "application/toml"
    if ext in {".md", ".mdx"}:
        return "text/markdown"
    if ext in {".txt", ".log"}:
        return "text/plain"
    return "application/octet-stream"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_artifact_path_info(
    *, source_kind: str, repo_prefix: str, source_relpath: str
) -> ArtifactPathInfo:
    repo_path = make_repo_path(repo_prefix, source_relpath)
    return ArtifactPathInfo(
        artifact_id=repo_path,
        repo_path=repo_path,
        run_id=infer_run_id(source_kind, source_relpath),
        artifact_kind=infer_artifact_kind(repo_path),
        content_type=infer_content_type(repo_path),
    )
