# mypy: disable_error_code=untyped-decorator

import datetime
import functools
import hashlib
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import cocoindex
import numpy as np
import yaml  # type: ignore[import-untyped]
from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool
from structlog import get_logger

from cyntra.indexing.path_rules import (
    ArtifactPathInfo,
    build_artifact_path_info,
    discover_repo_root,
    sha256_text,
)

logger = get_logger()

DEFAULT_EMBED_PROVIDER = os.environ.get(
    "CYNTRA_COCOINDEX_EMBED_PROVIDER", "sentence_transformers"
).lower()
DEFAULT_EMBED_MODEL = os.environ.get(
    "CYNTRA_COCOINDEX_EMBED_MODEL", "nomic-ai/nomic-embed-text-v1.5"
)
DEFAULT_EMBED_DIM = int(os.environ.get("CYNTRA_COCOINDEX_EMBED_DIM", "0"))
DEFAULT_STUB_EMBED_DIM = int(os.environ.get("CYNTRA_COCOINDEX_STUB_EMBED_DIM", "16"))
DEFAULT_EMBED_DEVICE = os.environ.get("CYNTRA_COCOINDEX_EMBED_DEVICE")
DEFAULT_OLLAMA_ADDRESS = os.environ.get("CYNTRA_COCOINDEX_OLLAMA_ADDRESS", "http://localhost:11434")

DEFAULT_CHUNK_SIZE_BYTES = int(os.environ.get("CYNTRA_COCOINDEX_CHUNK_SIZE_BYTES", "2000"))
DEFAULT_MIN_CHUNK_SIZE_BYTES = int(os.environ.get("CYNTRA_COCOINDEX_MIN_CHUNK_SIZE_BYTES", "500"))
DEFAULT_CHUNK_OVERLAP_BYTES = int(os.environ.get("CYNTRA_COCOINDEX_CHUNK_OVERLAP_BYTES", "200"))
DEFAULT_REFRESH_SECONDS = int(os.environ.get("CYNTRA_COCOINDEX_REFRESH_SECONDS", "30"))
DEFAULT_MAX_FILE_SIZE_BYTES = int(
    os.environ.get("CYNTRA_COCOINDEX_MAX_FILE_SIZE_BYTES", str(512 * 1024))
)
DEFAULT_SIGNAL_OUTPUT_MAX_CHARS = int(
    os.environ.get("CYNTRA_COCOINDEX_SIGNAL_OUTPUT_MAX_CHARS", "8192")
)

DEFAULT_GRAPH_TARGET = os.environ.get("CYNTRA_COCOINDEX_GRAPH_TARGET", "").lower()
DEFAULT_NEO4J_URI = os.environ.get("CYNTRA_COCOINDEX_NEO4J_URI", "bolt://localhost:7687")
DEFAULT_NEO4J_USER = os.environ.get("CYNTRA_COCOINDEX_NEO4J_USER", "neo4j")
DEFAULT_NEO4J_PASSWORD = os.environ.get("CYNTRA_COCOINDEX_NEO4J_PASSWORD", "cocoindex")
DEFAULT_NEO4J_DB = os.environ.get("CYNTRA_COCOINDEX_NEO4J_DB")


@functools.cache
def _repo_root() -> Path:
    override = os.environ.get("CYNTRA_REPO_ROOT")
    if override:
        return Path(override).expanduser().resolve()
    return discover_repo_root()


@cocoindex.transform_flow()
def text_to_embedding(text: cocoindex.DataSlice[str]) -> cocoindex.DataSlice[Any]:
    provider = DEFAULT_EMBED_PROVIDER
    if provider in {"sentence_transformers", "st"}:
        args: dict[str, Any] = {"trust_remote_code": True}
        if DEFAULT_EMBED_DEVICE:
            args["device"] = DEFAULT_EMBED_DEVICE
        return text.transform(
            cocoindex.functions.SentenceTransformerEmbed(
                model=DEFAULT_EMBED_MODEL,
                args=args,
            )
        )

    if provider == "ollama":
        expected_dim = DEFAULT_EMBED_DIM if DEFAULT_EMBED_DIM > 0 else None
        return text.transform(
            cocoindex.functions.EmbedText(
                api_type=cocoindex.llm.LlmApiType.Ollama,  # type: ignore[attr-defined]
                model=DEFAULT_EMBED_MODEL,
                address=DEFAULT_OLLAMA_ADDRESS,
                expected_output_dimension=expected_dim,
            )
        )

    if provider == "openai":
        api_key = os.environ.get("CYNTRA_COCOINDEX_OPENAI_API_KEY") or os.environ.get(
            "OPENAI_API_KEY"
        )
        if not api_key:
            raise RuntimeError(
                "CYNTRA_COCOINDEX_EMBED_PROVIDER=openai requires CYNTRA_COCOINDEX_OPENAI_API_KEY (or OPENAI_API_KEY)"
            )
        expected_dim = DEFAULT_EMBED_DIM if DEFAULT_EMBED_DIM > 0 else None
        return text.transform(
            cocoindex.functions.EmbedText(
                api_type=cocoindex.llm.LlmApiType.OpenAi,  # type: ignore[attr-defined]
                model=DEFAULT_EMBED_MODEL,
                api_key=cocoindex.add_transient_auth_entry(api_key),
                expected_output_dimension=expected_dim,
            )
        )

    if provider == "stub":
        if DEFAULT_STUB_EMBED_DIM != 16:
            raise ValueError("CYNTRA_COCOINDEX_STUB_EMBED_DIM must be 16 (stub provider only)")
        return text.transform(stub_embed_text)

    raise ValueError(f"Unsupported CYNTRA_COCOINDEX_EMBED_PROVIDER={provider!r}")


@cocoindex.op.function(cache=True, behavior_version=2)
def stub_embed_text(text: str) -> cocoindex.Vector[np.float32, Literal[16]]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    base = np.frombuffer(digest, dtype=np.uint8).astype(np.float32)
    vec = np.resize(base, 16) / 255.0
    norm = float(np.linalg.norm(vec))
    if norm:
        vec = vec / norm
    return vec.astype(np.float32)


@functools.cache
def _flow_def_hash() -> str:
    return sha256_text(Path(__file__).read_text(encoding="utf-8"))


@functools.cache
def _index_config_hash() -> str:
    cfg = {
        "embed_provider": DEFAULT_EMBED_PROVIDER,
        "embed_model": DEFAULT_EMBED_MODEL,
        "embed_dim": DEFAULT_EMBED_DIM,
        "stub_embed_dim": DEFAULT_STUB_EMBED_DIM,
        "embed_device": DEFAULT_EMBED_DEVICE,
        "ollama_address": DEFAULT_OLLAMA_ADDRESS if DEFAULT_EMBED_PROVIDER == "ollama" else None,
        "chunk_size_bytes": DEFAULT_CHUNK_SIZE_BYTES,
        "min_chunk_size_bytes": DEFAULT_MIN_CHUNK_SIZE_BYTES,
        "chunk_overlap_bytes": DEFAULT_CHUNK_OVERLAP_BYTES,
        "max_file_size_bytes": DEFAULT_MAX_FILE_SIZE_BYTES,
    }
    return sha256_text(json.dumps(cfg, sort_keys=True, separators=(",", ":")))


@cocoindex.op.function(cache=True, behavior_version=1)
def compute_artifact_path_info(
    source_relpath: str, *, source_kind: str, repo_prefix: str
) -> ArtifactPathInfo:
    return build_artifact_path_info(
        source_kind=source_kind,
        repo_prefix=repo_prefix,
        source_relpath=source_relpath,
    )


@cocoindex.op.function(cache=True, behavior_version=1)
def compute_content_hash(text: str) -> str:
    return sha256_text(text)


def _maybe_get_str(obj: dict[str, Any], key: str) -> str | None:
    value = obj.get(key)
    return value if isinstance(value, str) else None


def _maybe_get_int(obj: dict[str, Any], key: str) -> int | None:
    value = obj.get(key)
    return value if isinstance(value, int) else None


def _maybe_get_dict(obj: dict[str, Any], key: str) -> dict[str, Any] | None:
    value = obj.get(key)
    return value if isinstance(value, dict) else None


def _relationship_id(rel_type: str, source_id: str, target_id: str) -> str:
    return sha256_text(f"{rel_type}|{source_id}|{target_id}")


@cocoindex.op.function(cache=True, behavior_version=1)
def compute_relationship_id(source_id: str, *, rel_type: str, target_id: str) -> str:
    return _relationship_id(rel_type, source_id, target_id)


@cocoindex.op.function(cache=True, behavior_version=1)
def require_non_empty_str(value: str | None, *, field: str) -> str:
    if not value:
        raise ValueError(f"missing required field: {field}")
    return value


@dataclass(frozen=True)
class RunMetaRow:
    run_id: str
    label: str | None
    command: str | None
    started_ms: int | None
    project_root: str | None


@dataclass(frozen=True)
class JobResultRow:
    run_id: str
    job_id: str | None
    exit_code: int | None
    ended_ms: int | None


@dataclass(frozen=True)
class ArchiveManifestRow:
    workcell_id: str
    issue_id: str | None
    issue_title: str | None
    toolchain: str | None
    job_type: str | None
    branch_name: str | None
    speculate_mode: bool | None
    speculate_tag: str | None


@cocoindex.op.function(cache=True, behavior_version=1)
def parse_run_meta(data: dict[str, Any]) -> RunMetaRow:
    run_id = _maybe_get_str(data, "run_id")
    if not run_id:
        raise ValueError("run_meta.json missing run_id")
    return RunMetaRow(
        run_id=run_id,
        label=_maybe_get_str(data, "label"),
        command=_maybe_get_str(data, "command"),
        started_ms=_maybe_get_int(data, "started_ms"),
        project_root=_maybe_get_str(data, "project_root"),
    )


@cocoindex.op.function(cache=True, behavior_version=1)
def parse_job_result(data: dict[str, Any]) -> JobResultRow:
    run_id = _maybe_get_str(data, "run_id")
    if not run_id:
        raise ValueError("job_result.json missing run_id")
    return JobResultRow(
        run_id=run_id,
        job_id=_maybe_get_str(data, "job_id"),
        exit_code=_maybe_get_int(data, "exit_code"),
        ended_ms=_maybe_get_int(data, "ended_ms"),
    )


@cocoindex.op.function(cache=True, behavior_version=1)
def workcell_id_from_archive_relpath(source_relpath: str) -> str:
    parts = source_relpath.replace("\\", "/").split("/")
    return parts[0] if parts and parts[0] else source_relpath


@cocoindex.op.function(cache=True, behavior_version=1)
def parse_archive_manifest(
    data: dict[str, Any], *, workcell_id_from_path: str
) -> ArchiveManifestRow:
    workcell_id = _maybe_get_str(data, "workcell_id") or workcell_id_from_path
    issue = _maybe_get_dict(data, "issue") or {}
    return ArchiveManifestRow(
        workcell_id=workcell_id,
        issue_id=_maybe_get_str(issue, "id"),
        issue_title=_maybe_get_str(issue, "title"),
        toolchain=_maybe_get_str(data, "toolchain"),
        job_type=_maybe_get_str(data, "job_type"),
        branch_name=_maybe_get_str(data, "branch_name"),
        speculate_mode=data.get("speculate_mode")
        if isinstance(data.get("speculate_mode"), bool)
        else None,
        speculate_tag=_maybe_get_str(data, "speculate_tag"),
    )


@dataclass(frozen=True)
class RunIssueEdgeRow:
    id: str
    run_id: str
    issue_id: str
    issue_title: str | None
    toolchain: str | None
    job_type: str | None
    branch_name: str | None
    speculate_mode: bool | None
    speculate_tag: str | None


@cocoindex.op.function(cache=True, behavior_version=1)
def archive_manifest_to_issue_edges(row: ArchiveManifestRow) -> list[RunIssueEdgeRow]:
    if not row.issue_id:
        return []
    return [
        RunIssueEdgeRow(
            id=_relationship_id("FOR_ISSUE", row.workcell_id, row.issue_id),
            run_id=row.workcell_id,
            issue_id=row.issue_id,
            issue_title=row.issue_title,
            toolchain=row.toolchain,
            job_type=row.job_type,
            branch_name=row.branch_name,
            speculate_mode=row.speculate_mode,
            speculate_tag=row.speculate_tag,
        )
    ]


@dataclass(frozen=True)
class GateSignalRow:
    workcell_id: str
    issue_id: str | None
    gate_name: str
    passed: bool | None
    exit_code: int | None
    duration_ms: int | None
    output: str | None
    output_hash: str | None


@cocoindex.op.function(cache=True, behavior_version=1)
def extract_gate_signals(
    proof: dict[str, Any], *, workcell_id_from_path: str, max_output_chars: int
) -> list[GateSignalRow]:
    workcell_id = _maybe_get_str(proof, "workcell_id") or workcell_id_from_path
    issue_id = _maybe_get_str(proof, "issue_id")

    verification = _maybe_get_dict(proof, "verification") or {}
    gates = verification.get("gates")
    if not isinstance(gates, dict):
        return []

    out: list[GateSignalRow] = []
    for gate_name in sorted(gates.keys(), key=str):
        gate = gates.get(gate_name)
        if not isinstance(gate, dict):
            continue
        passed = gate.get("passed") if isinstance(gate.get("passed"), bool) else None
        exit_code = gate.get("exit_code") if isinstance(gate.get("exit_code"), int) else None
        duration_ms = gate.get("duration_ms") if isinstance(gate.get("duration_ms"), int) else None
        output = gate.get("output") if isinstance(gate.get("output"), str) else None
        output_hash = sha256_text(output) if output is not None else None
        if output is not None and len(output) > max_output_chars:
            output = output[:max_output_chars]
        out.append(
            GateSignalRow(
                workcell_id=workcell_id,
                issue_id=issue_id,
                gate_name=str(gate_name),
                passed=passed,
                exit_code=exit_code,
                duration_ms=duration_ms,
                output=output,
                output_hash=output_hash,
            )
        )
    return out


@dataclass(frozen=True)
class TelemetrySummaryRow:
    workcell_id: str
    issue_id: str | None
    toolchain: str | None
    model: str | None
    status: str | None
    exit_code: int | None
    duration_ms: int | None
    started_at: str | None
    completed_at: str | None
    prompt_tokens: int | None
    input_tokens: int | None
    output_tokens: int | None
    cache_read_input_tokens: int | None
    cache_creation_input_tokens: int | None
    total_cost_usd: float | None
    num_turns: int | None
    events_count: int


@cocoindex.op.function(cache=True, behavior_version=1)
def summarize_telemetry_jsonl(content: str, *, workcell_id_from_path: str) -> TelemetrySummaryRow:
    workcell_id = workcell_id_from_path
    issue_id: str | None = None
    toolchain: str | None = None
    model: str | None = None
    started_at: str | None = None

    status: str | None = None
    exit_code: int | None = None
    duration_ms: int | None = None
    completed_at: str | None = None

    prompt_tokens: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_input_tokens: int | None = None
    cache_creation_input_tokens: int | None = None
    total_cost_usd: float | None = None
    num_turns: int | None = None

    events_count = 0

    for raw in content.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        events_count += 1

        etype = event.get("type")
        if etype == "started":
            if isinstance(event.get("workcell_id"), str):
                workcell_id = event["workcell_id"]
            issue_id = event.get("issue_id") if isinstance(event.get("issue_id"), str) else issue_id
            toolchain = (
                event.get("toolchain") if isinstance(event.get("toolchain"), str) else toolchain
            )
            model = event.get("model") if isinstance(event.get("model"), str) else model
            started_at = (
                event.get("timestamp") if isinstance(event.get("timestamp"), str) else started_at
            )
            continue

        if etype == "prompt_sent":
            if isinstance(event.get("tokens"), int):
                prompt_tokens = event["tokens"]
            continue

        if etype == "completed":
            status = event.get("status") if isinstance(event.get("status"), str) else status
            exit_code = (
                event.get("exit_code") if isinstance(event.get("exit_code"), int) else exit_code
            )
            duration_ms = (
                event.get("duration_ms")
                if isinstance(event.get("duration_ms"), int)
                else duration_ms
            )
            completed_at = (
                event.get("timestamp") if isinstance(event.get("timestamp"), str) else completed_at
            )
            continue

        if etype == "response_chunk":
            raw_content = event.get("content")
            if not isinstance(raw_content, str):
                continue
            try:
                payload = json.loads(raw_content)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            if isinstance(payload.get("total_cost_usd"), (int, float)):
                total_cost_usd = float(payload["total_cost_usd"])
            if isinstance(payload.get("num_turns"), int):
                num_turns = payload["num_turns"]
            usage = payload.get("usage")
            if isinstance(usage, dict):
                if isinstance(usage.get("input_tokens"), int):
                    input_tokens = usage["input_tokens"]
                if isinstance(usage.get("output_tokens"), int):
                    output_tokens = usage["output_tokens"]
                if isinstance(usage.get("cache_read_input_tokens"), int):
                    cache_read_input_tokens = usage["cache_read_input_tokens"]
                if isinstance(usage.get("cache_creation_input_tokens"), int):
                    cache_creation_input_tokens = usage["cache_creation_input_tokens"]

    return TelemetrySummaryRow(
        workcell_id=workcell_id,
        issue_id=issue_id,
        toolchain=toolchain,
        model=model,
        status=status,
        exit_code=exit_code,
        duration_ms=duration_ms,
        started_at=started_at,
        completed_at=completed_at,
        prompt_tokens=prompt_tokens,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_input_tokens=cache_read_input_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
        total_cost_usd=total_cost_usd,
        num_turns=num_turns,
        events_count=events_count,
    )


@dataclass(frozen=True)
class WorldRunManifestRow:
    run_id: str
    world_id: str | None
    world_config_id: str | None
    world_version: str | None
    created_at: str | None
    generator_name: str | None
    generator_author: str | None
    determinism_seed: int | None
    determinism_pythonhashseed: int | None
    determinism_cycles_seed: int | None


@cocoindex.op.function(cache=True, behavior_version=1)
def run_id_from_runs_relpath(source_relpath: str) -> str:
    parts = source_relpath.replace("\\", "/").split("/")
    return parts[0] if parts and parts[0] else source_relpath


@cocoindex.op.function(cache=True, behavior_version=1)
def parse_world_run_manifest(data: dict[str, Any], *, run_id_from_path: str) -> WorldRunManifestRow:
    generator = _maybe_get_dict(data, "generator") or {}
    determinism = _maybe_get_dict(data, "determinism") or {}
    return WorldRunManifestRow(
        run_id=_maybe_get_str(data, "run_id") or run_id_from_path,
        world_id=_maybe_get_str(data, "world_id"),
        world_config_id=_maybe_get_str(data, "world_config_id"),
        world_version=_maybe_get_str(data, "world_version"),
        created_at=_maybe_get_str(data, "created_at"),
        generator_name=_maybe_get_str(generator, "name"),
        generator_author=_maybe_get_str(generator, "author"),
        determinism_seed=_maybe_get_int(determinism, "seed"),
        determinism_pythonhashseed=_maybe_get_int(determinism, "pythonhashseed"),
        determinism_cycles_seed=_maybe_get_int(determinism, "cycles_seed"),
    )


@dataclass(frozen=True)
class RunWorldConfigEdgeRow:
    id: str
    run_id: str
    world_id: str
    world_config_id: str | None
    world_version: str | None
    created_at: str | None
    generator_name: str | None
    generator_author: str | None
    determinism_seed: int | None
    determinism_pythonhashseed: int | None
    determinism_cycles_seed: int | None


@cocoindex.op.function(cache=True, behavior_version=1)
def world_run_to_world_config_edges(row: WorldRunManifestRow) -> list[RunWorldConfigEdgeRow]:
    if not row.world_id:
        return []
    return [
        RunWorldConfigEdgeRow(
            id=_relationship_id("USES_WORLD_CONFIG", row.run_id, row.world_id),
            run_id=row.run_id,
            world_id=row.world_id,
            world_config_id=row.world_config_id,
            world_version=row.world_version,
            created_at=row.created_at,
            generator_name=row.generator_name,
            generator_author=row.generator_author,
            determinism_seed=row.determinism_seed,
            determinism_pythonhashseed=row.determinism_pythonhashseed,
            determinism_cycles_seed=row.determinism_cycles_seed,
        )
    ]


@dataclass(frozen=True)
class WorldConfigRow:
    world_id: str
    world_config_id: str | None
    world_type: str | None
    version: str | None
    generator_name: str | None
    generator_author: str | None


@cocoindex.op.function(cache=True, behavior_version=1)
def world_id_from_world_relpath(source_relpath: str) -> str:
    parts = source_relpath.replace("\\", "/").split("/")
    return parts[0] if parts and parts[0] else source_relpath


@cocoindex.op.function(cache=True, behavior_version=1)
def parse_world_config_yaml(content: str, *, world_id_from_path: str) -> WorldConfigRow:
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError:
        data = None
    if not isinstance(data, dict):
        data = {}

    generator = data.get("generator")
    if not isinstance(generator, dict):
        generator = {}

    return WorldConfigRow(
        world_id=_maybe_get_str(data, "world_id") or world_id_from_path,
        world_config_id=_maybe_get_str(data, "world_config_id"),
        world_type=_maybe_get_str(data, "world_type"),
        version=_maybe_get_str(data, "version"),
        generator_name=_maybe_get_str(generator, "name"),
        generator_author=_maybe_get_str(generator, "author"),
    )


@cocoindex.flow_def(name="CyntraIndex")
def cyntra_index_flow(flow_builder: cocoindex.FlowBuilder, data_scope: cocoindex.DataScope) -> None:
    repo_root = _repo_root()
    refresh_interval = datetime.timedelta(seconds=DEFAULT_REFRESH_SECONDS)
    graph_enabled = DEFAULT_GRAPH_TARGET == "neo4j"

    # Broad text artifact sources (for chunking + embeddings).
    text_patterns = [
        "**/*.md",
        "**/*.mdx",
        "**/*.txt",
        "**/*.log",
        "**/*.json",
        "**/*.jsonl",
        "**/*.yaml",
        "**/*.yml",
        "**/*.toml",
    ]
    excluded_patterns = ["**/.*", "**/__pycache__", "node_modules", ".venv", "target"]
    max_file_size = DEFAULT_MAX_FILE_SIZE_BYTES

    data_scope["cyntra_runs_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "runs"),
            included_patterns=text_patterns,
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=256,
    )
    data_scope["cyntra_archives_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "archives"),
            included_patterns=text_patterns,
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=256,
    )
    data_scope["docs_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / "docs"),
            included_patterns=["**/*.md", "**/*.mdx", "**/*.yaml", "**/*.yml"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=datetime.timedelta(minutes=5),
        max_inflight_rows=128,
    )
    data_scope["prompts_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / "prompts"),
            included_patterns=["**/*.md", "**/*.mdx", "**/*.yaml", "**/*.yml"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=datetime.timedelta(minutes=5),
        max_inflight_rows=128,
    )
    data_scope["worlds_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / "fab" / "worlds"),
            included_patterns=["**/*.yaml", "**/*.yml", "**/*.md"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=datetime.timedelta(minutes=5),
        max_inflight_rows=128,
    )

    artifacts = data_scope.add_collector()
    chunks = data_scope.add_collector()
    run_nodes = data_scope.add_collector()
    run_meta_edges = data_scope.add_collector()
    run_job_result_edges = data_scope.add_collector()
    run_artifact_edges = data_scope.add_collector()
    run_archive_manifest_edges = data_scope.add_collector()
    run_telemetry_edges = data_scope.add_collector()
    run_issue_edges = data_scope.add_collector()
    run_gate_edges = data_scope.add_collector()
    run_world_edges = data_scope.add_collector()

    def add_text_source(
        *,
        source_kind: str,
        repo_prefix: str,
        table: cocoindex.DataSlice[Any],
        graph_collect_run_edges: bool = False,
        chunk_size: int = DEFAULT_CHUNK_SIZE_BYTES,
        min_chunk_size: int = DEFAULT_MIN_CHUNK_SIZE_BYTES,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP_BYTES,
    ) -> None:
        with table.row(max_inflight_rows=256) as file:
            file["path_info"] = file["filename"].transform(
                compute_artifact_path_info,
                source_kind=source_kind,
                repo_prefix=repo_prefix,
            )
            path_info: Any = file["path_info"]
            artifact_id = path_info["artifact_id"]
            repo_path = path_info["repo_path"]
            run_id = path_info["run_id"]
            artifact_kind = path_info["artifact_kind"]
            content_type = path_info["content_type"]
            file["content_hash"] = file["content"].transform(compute_content_hash)
            index_flow_hash = _flow_def_hash()
            index_config_hash = _index_config_hash()

            if graph_enabled and graph_collect_run_edges:
                file["run_id_key"] = run_id.transform(require_non_empty_str, field="run_id")
                file["run_artifact_edge_id"] = file["run_id_key"].transform(
                    compute_relationship_id,
                    rel_type="HAS_ARTIFACT",
                    target_id=artifact_id,
                )
                run_nodes.collect(run_id=file["run_id_key"])
                run_artifact_edges.collect(
                    id=file["run_artifact_edge_id"],
                    run_id=file["run_id_key"],
                    artifact_id=artifact_id,
                )

            # Use filename-based language detection when possible.
            file["language"] = file["filename"].transform(
                cocoindex.functions.DetectProgrammingLanguage()
            )
            file["chunks"] = file["content"].transform(
                cocoindex.functions.SplitRecursively(),
                language=file["language"],
                chunk_size=chunk_size,
                min_chunk_size=min_chunk_size,
                chunk_overlap=chunk_overlap,
            )

            artifacts.collect(
                artifact_id=artifact_id,
                repo_path=repo_path,
                run_id=run_id,
                artifact_kind=artifact_kind,
                content_type=content_type,
                content_hash=file["content_hash"],
                source_kind=source_kind,
                index_flow_hash=index_flow_hash,
                index_config_hash=index_config_hash,
                embed_provider=DEFAULT_EMBED_PROVIDER,
                embed_model=DEFAULT_EMBED_MODEL,
                chunk_size_bytes=chunk_size,
                min_chunk_size_bytes=min_chunk_size,
                chunk_overlap_bytes=chunk_overlap,
                max_file_size_bytes=DEFAULT_MAX_FILE_SIZE_BYTES,
                text=file["content"],
            )

            with file["chunks"].row(max_inflight_rows=512) as chunk:
                chunk["embedding"] = chunk["text"].call(text_to_embedding)
                chunks.collect(
                    artifact_id=artifact_id,
                    repo_path=repo_path,
                    run_id=run_id,
                    artifact_kind=artifact_kind,
                    content_type=content_type,
                    source_kind=source_kind,
                    location=chunk["location"],
                    text=chunk["text"],
                    embedding=chunk["embedding"],
                    start_pos=chunk["start"],
                    end_pos=chunk["end"],
                    index_flow_hash=index_flow_hash,
                    index_config_hash=index_config_hash,
                    embed_provider=DEFAULT_EMBED_PROVIDER,
                    embed_model=DEFAULT_EMBED_MODEL,
                )

    add_text_source(
        source_kind="cyntra_runs",
        repo_prefix=".cyntra/runs",
        table=data_scope["cyntra_runs_files"],
        graph_collect_run_edges=graph_enabled,
    )
    add_text_source(
        source_kind="cyntra_archives",
        repo_prefix=".cyntra/archives",
        table=data_scope["cyntra_archives_files"],
        graph_collect_run_edges=graph_enabled,
    )
    add_text_source(
        source_kind="docs",
        repo_prefix="docs",
        table=data_scope["docs_files"],
    )
    add_text_source(
        source_kind="prompts",
        repo_prefix="prompts",
        table=data_scope["prompts_files"],
    )
    add_text_source(
        source_kind="worlds",
        repo_prefix="fab/worlds",
        table=data_scope["worlds_files"],
    )

    artifacts.export(
        "artifacts",
        cocoindex.targets.Postgres(),
        primary_key_fields=["artifact_id"],
    )
    chunks.export(
        "chunks",
        cocoindex.targets.Postgres(),
        primary_key_fields=["artifact_id", "location"],
        vector_indexes=[
            cocoindex.VectorIndexDef(
                field_name="embedding",
                metric=cocoindex.VectorSimilarityMetric.COSINE_SIMILARITY,
            )
        ],
    )

    # Structured run metadata sources.
    data_scope["run_meta_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "runs"),
            included_patterns=["**/run_meta.json"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=256,
    )
    data_scope["job_result_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "runs"),
            included_patterns=["**/job_result.json"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=256,
    )
    data_scope["archive_manifest_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "archives"),
            included_patterns=["*/manifest.json"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=256,
    )

    run_meta = data_scope.add_collector()
    job_results = data_scope.add_collector()
    archive_manifests = data_scope.add_collector()

    with data_scope["run_meta_files"].row(max_inflight_rows=256) as file:
        file["json"] = file["content"].transform(cocoindex.functions.ParseJson())
        file["row"] = file["json"].transform(parse_run_meta)
        run_meta.collect(
            run_id=file["row"]["run_id"],
            label=file["row"]["label"],
            command=file["row"]["command"],
            started_ms=file["row"]["started_ms"],
            project_root=file["row"]["project_root"],
            index_flow_hash=_flow_def_hash(),
            index_config_hash=_index_config_hash(),
        )
        if graph_enabled:
            file["edge_id"] = file["row"]["run_id"].transform(
                compute_relationship_id,
                rel_type="HAS_META",
                target_id=file["row"]["run_id"],
            )
            run_meta_edges.collect(
                id=file["edge_id"],
                run_id=file["row"]["run_id"],
                run_meta_run_id=file["row"]["run_id"],
            )

    with data_scope["job_result_files"].row(max_inflight_rows=256) as file:
        file["json"] = file["content"].transform(cocoindex.functions.ParseJson())
        file["row"] = file["json"].transform(parse_job_result)
        job_results.collect(
            run_id=file["row"]["run_id"],
            job_id=file["row"]["job_id"],
            exit_code=file["row"]["exit_code"],
            ended_ms=file["row"]["ended_ms"],
            index_flow_hash=_flow_def_hash(),
            index_config_hash=_index_config_hash(),
        )
        if graph_enabled:
            file["edge_id"] = file["row"]["run_id"].transform(
                compute_relationship_id,
                rel_type="HAS_JOB_RESULT",
                target_id=file["row"]["run_id"],
            )
            run_job_result_edges.collect(
                id=file["edge_id"],
                run_id=file["row"]["run_id"],
                job_result_run_id=file["row"]["run_id"],
            )

    with data_scope["archive_manifest_files"].row(max_inflight_rows=256) as file:
        file["json"] = file["content"].transform(cocoindex.functions.ParseJson())
        file["workcell_id_from_path"] = file["filename"].transform(workcell_id_from_archive_relpath)
        file["row"] = file["json"].transform(
            parse_archive_manifest,
            workcell_id_from_path=file["workcell_id_from_path"],
        )
        archive_manifests.collect(
            workcell_id=file["row"]["workcell_id"],
            issue_id=file["row"]["issue_id"],
            issue_title=file["row"]["issue_title"],
            toolchain=file["row"]["toolchain"],
            job_type=file["row"]["job_type"],
            branch_name=file["row"]["branch_name"],
            speculate_mode=file["row"]["speculate_mode"],
            speculate_tag=file["row"]["speculate_tag"],
            index_flow_hash=_flow_def_hash(),
            index_config_hash=_index_config_hash(),
        )
        if graph_enabled:
            file["edge_id"] = file["row"]["workcell_id"].transform(
                compute_relationship_id,
                rel_type="HAS_ARCHIVE_MANIFEST",
                target_id=file["row"]["workcell_id"],
            )
            run_archive_manifest_edges.collect(
                id=file["edge_id"],
                run_id=file["row"]["workcell_id"],
                workcell_id=file["row"]["workcell_id"],
            )
            file["issue_edges"] = file["row"].transform(archive_manifest_to_issue_edges)
            with file["issue_edges"].row(max_inflight_rows=256) as edge:
                run_issue_edges.collect(
                    id=edge["id"],
                    run_id=edge["run_id"],
                    issue_id=edge["issue_id"],
                    issue_title=edge["issue_title"],
                    toolchain=edge["toolchain"],
                    job_type=edge["job_type"],
                    branch_name=edge["branch_name"],
                    speculate_mode=edge["speculate_mode"],
                    speculate_tag=edge["speculate_tag"],
                )

    run_meta.export("run_meta", cocoindex.targets.Postgres(), primary_key_fields=["run_id"])
    job_results.export("job_results", cocoindex.targets.Postgres(), primary_key_fields=["run_id"])
    archive_manifests.export(
        "archive_manifests", cocoindex.targets.Postgres(), primary_key_fields=["workcell_id"]
    )

    # Structured signals + telemetry sources (from workcell archives).
    data_scope["archive_proof_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "archives"),
            included_patterns=["*/proof.json"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=128,
    )
    data_scope["archive_telemetry_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "archives"),
            included_patterns=["*/telemetry.jsonl"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=128,
    )

    gate_signals = data_scope.add_collector()
    telemetry_summaries = data_scope.add_collector()

    with data_scope["archive_proof_files"].row(max_inflight_rows=128) as file:
        file["json"] = file["content"].transform(cocoindex.functions.ParseJson())
        file["workcell_id_from_path"] = file["filename"].transform(workcell_id_from_archive_relpath)
        file["signals"] = file["json"].transform(
            extract_gate_signals,
            workcell_id_from_path=file["workcell_id_from_path"],
            max_output_chars=DEFAULT_SIGNAL_OUTPUT_MAX_CHARS,
        )
        with file["signals"].row(max_inflight_rows=512) as signal:
            gate_signals.collect(
                workcell_id=signal["workcell_id"],
                issue_id=signal["issue_id"],
                gate_name=signal["gate_name"],
                passed=signal["passed"],
                exit_code=signal["exit_code"],
                duration_ms=signal["duration_ms"],
                output=signal["output"],
                output_hash=signal["output_hash"],
                source_kind="cyntra_archives",
                index_flow_hash=_flow_def_hash(),
                index_config_hash=_index_config_hash(),
            )
            if graph_enabled:
                signal["edge_id"] = signal["workcell_id"].transform(
                    compute_relationship_id,
                    rel_type="HAS_GATE_RESULT",
                    target_id=signal["gate_name"],
                )
                run_gate_edges.collect(
                    id=signal["edge_id"],
                    run_id=signal["workcell_id"],
                    gate_name=signal["gate_name"],
                    issue_id=signal["issue_id"],
                    passed=signal["passed"],
                    exit_code=signal["exit_code"],
                    duration_ms=signal["duration_ms"],
                    output_hash=signal["output_hash"],
                )

    with data_scope["archive_telemetry_files"].row(max_inflight_rows=128) as file:
        file["workcell_id_from_path"] = file["filename"].transform(workcell_id_from_archive_relpath)
        file["row"] = file["content"].transform(
            summarize_telemetry_jsonl,
            workcell_id_from_path=file["workcell_id_from_path"],
        )
        telemetry_summaries.collect(
            workcell_id=file["row"]["workcell_id"],
            issue_id=file["row"]["issue_id"],
            toolchain=file["row"]["toolchain"],
            model=file["row"]["model"],
            status=file["row"]["status"],
            exit_code=file["row"]["exit_code"],
            duration_ms=file["row"]["duration_ms"],
            started_at=file["row"]["started_at"],
            completed_at=file["row"]["completed_at"],
            prompt_tokens=file["row"]["prompt_tokens"],
            input_tokens=file["row"]["input_tokens"],
            output_tokens=file["row"]["output_tokens"],
            cache_read_input_tokens=file["row"]["cache_read_input_tokens"],
            cache_creation_input_tokens=file["row"]["cache_creation_input_tokens"],
            total_cost_usd=file["row"]["total_cost_usd"],
            num_turns=file["row"]["num_turns"],
            events_count=file["row"]["events_count"],
            source_kind="cyntra_archives",
            index_flow_hash=_flow_def_hash(),
            index_config_hash=_index_config_hash(),
        )
        if graph_enabled:
            file["edge_id"] = file["row"]["workcell_id"].transform(
                compute_relationship_id,
                rel_type="HAS_TELEMETRY",
                target_id=file["row"]["workcell_id"],
            )
            run_telemetry_edges.collect(
                id=file["edge_id"],
                run_id=file["row"]["workcell_id"],
                workcell_id=file["row"]["workcell_id"],
            )

    gate_signals.export(
        "gate_signals",
        cocoindex.targets.Postgres(),
        primary_key_fields=["workcell_id", "gate_name"],
    )
    telemetry_summaries.export(
        "telemetry_summaries",
        cocoindex.targets.Postgres(),
        primary_key_fields=["workcell_id"],
    )

    # Structured world configs + world-run manifests (beyond treating YAML/JSON as pure text).
    data_scope["world_run_manifest_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / ".cyntra" / "runs"),
            included_patterns=["*/manifest.json"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=refresh_interval,
        max_inflight_rows=128,
    )
    data_scope["world_config_files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=str(repo_root / "fab" / "worlds"),
            included_patterns=["*/world.yaml", "*/world.yml"],
            excluded_patterns=excluded_patterns,
            max_file_size=max_file_size,
        ),
        refresh_interval=datetime.timedelta(minutes=5),
        max_inflight_rows=128,
    )

    world_runs = data_scope.add_collector()
    world_configs = data_scope.add_collector()

    with data_scope["world_run_manifest_files"].row(max_inflight_rows=128) as file:
        file["json"] = file["content"].transform(cocoindex.functions.ParseJson())
        file["run_id_from_path"] = file["filename"].transform(run_id_from_runs_relpath)
        file["row"] = file["json"].transform(
            parse_world_run_manifest,
            run_id_from_path=file["run_id_from_path"],
        )
        world_runs.collect(
            run_id=file["row"]["run_id"],
            world_id=file["row"]["world_id"],
            world_config_id=file["row"]["world_config_id"],
            world_version=file["row"]["world_version"],
            created_at=file["row"]["created_at"],
            generator_name=file["row"]["generator_name"],
            generator_author=file["row"]["generator_author"],
            determinism_seed=file["row"]["determinism_seed"],
            determinism_pythonhashseed=file["row"]["determinism_pythonhashseed"],
            determinism_cycles_seed=file["row"]["determinism_cycles_seed"],
            source_kind="cyntra_runs",
            index_flow_hash=_flow_def_hash(),
            index_config_hash=_index_config_hash(),
        )
        if graph_enabled:
            file["world_edges"] = file["row"].transform(world_run_to_world_config_edges)
            with file["world_edges"].row(max_inflight_rows=256) as edge:
                run_world_edges.collect(
                    id=edge["id"],
                    run_id=edge["run_id"],
                    world_id=edge["world_id"],
                    world_config_id=edge["world_config_id"],
                    world_version=edge["world_version"],
                    created_at=edge["created_at"],
                    generator_name=edge["generator_name"],
                    generator_author=edge["generator_author"],
                    determinism_seed=edge["determinism_seed"],
                    determinism_pythonhashseed=edge["determinism_pythonhashseed"],
                    determinism_cycles_seed=edge["determinism_cycles_seed"],
                )

    with data_scope["world_config_files"].row(max_inflight_rows=128) as file:
        file["world_id_from_path"] = file["filename"].transform(world_id_from_world_relpath)
        file["row"] = file["content"].transform(
            parse_world_config_yaml,
            world_id_from_path=file["world_id_from_path"],
        )
        world_configs.collect(
            world_id=file["row"]["world_id"],
            world_config_id=file["row"]["world_config_id"],
            world_type=file["row"]["world_type"],
            version=file["row"]["version"],
            generator_name=file["row"]["generator_name"],
            generator_author=file["row"]["generator_author"],
            source_kind="worlds",
            index_flow_hash=_flow_def_hash(),
            index_config_hash=_index_config_hash(),
        )

    world_runs.export("world_runs", cocoindex.targets.Postgres(), primary_key_fields=["run_id"])
    world_configs.export(
        "world_configs", cocoindex.targets.Postgres(), primary_key_fields=["world_id"]
    )

    # Always register the Neo4j auth entry so CocoIndex can clean up previously-created
    # Neo4j targets when graph export is disabled.
    neo4j_conn = cocoindex.add_auth_entry(
        "cyntra_neo4j",
        cocoindex.targets.Neo4jConnection(
            uri=DEFAULT_NEO4J_URI,
            user=DEFAULT_NEO4J_USER,
            password=DEFAULT_NEO4J_PASSWORD,
            db=DEFAULT_NEO4J_DB,
        ),
    )

    if graph_enabled:
        flow_builder.declare(
            cocoindex.targets.Neo4jDeclaration(
                connection=neo4j_conn,
                nodes_label="Issue",
                primary_key_fields=["issue_id"],
            )
        )
        flow_builder.declare(
            cocoindex.targets.Neo4jDeclaration(
                connection=neo4j_conn,
                nodes_label="Gate",
                primary_key_fields=["gate_name"],
            )
        )

        run_nodes.export(
            "kg_runs",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="Run"),
            ),
            primary_key_fields=["run_id"],
        )
        artifacts.export(
            "kg_artifacts",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="Artifact"),
            ),
            primary_key_fields=["artifact_id"],
        )
        run_meta.export(
            "kg_run_meta",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="RunMeta"),
            ),
            primary_key_fields=["run_id"],
        )
        job_results.export(
            "kg_job_results",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="JobResult"),
            ),
            primary_key_fields=["run_id"],
        )
        archive_manifests.export(
            "kg_archive_manifests",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="ArchiveManifest"),
            ),
            primary_key_fields=["workcell_id"],
        )
        telemetry_summaries.export(
            "kg_telemetry_summaries",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="TelemetrySummary"),
            ),
            primary_key_fields=["workcell_id"],
        )
        world_configs.export(
            "kg_world_configs",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Nodes(label="WorldConfig"),
            ),
            primary_key_fields=["world_id"],
        )

        run_artifact_edges.export(
            "kg_run_has_artifact",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="HAS_ARTIFACT",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="Artifact",
                        fields=[cocoindex.targets.TargetFieldMapping(source="artifact_id")],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )

        run_meta_edges.export(
            "kg_run_has_meta",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="HAS_META",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="RunMeta",
                        fields=[
                            cocoindex.targets.TargetFieldMapping(
                                source="run_meta_run_id",
                                target="run_id",
                            )
                        ],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )
        run_job_result_edges.export(
            "kg_run_has_job_result",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="HAS_JOB_RESULT",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="JobResult",
                        fields=[
                            cocoindex.targets.TargetFieldMapping(
                                source="job_result_run_id",
                                target="run_id",
                            )
                        ],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )
        run_archive_manifest_edges.export(
            "kg_run_has_archive_manifest",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="HAS_ARCHIVE_MANIFEST",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="ArchiveManifest",
                        fields=[cocoindex.targets.TargetFieldMapping(source="workcell_id")],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )
        run_telemetry_edges.export(
            "kg_run_has_telemetry",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="HAS_TELEMETRY",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="TelemetrySummary",
                        fields=[cocoindex.targets.TargetFieldMapping(source="workcell_id")],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )

        run_issue_edges.export(
            "kg_run_for_issue",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="FOR_ISSUE",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="Issue",
                        fields=[cocoindex.targets.TargetFieldMapping(source="issue_id")],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )
        run_gate_edges.export(
            "kg_run_has_gate_result",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="HAS_GATE_RESULT",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="Gate",
                        fields=[cocoindex.targets.TargetFieldMapping(source="gate_name")],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )
        run_world_edges.export(
            "kg_run_uses_world_config",
            cocoindex.targets.Neo4j(
                connection=neo4j_conn,
                mapping=cocoindex.targets.Relationships(
                    rel_type="USES_WORLD_CONFIG",
                    source=cocoindex.targets.NodeFromFields(
                        label="Run",
                        fields=[cocoindex.targets.TargetFieldMapping(source="run_id")],
                    ),
                    target=cocoindex.targets.NodeFromFields(
                        label="WorldConfig",
                        fields=[cocoindex.targets.TargetFieldMapping(source="world_id")],
                    ),
                ),
            ),
            primary_key_fields=["id"],
        )


@functools.cache
def _connection_pool() -> ConnectionPool:
    return ConnectionPool(os.environ["COCOINDEX_DATABASE_URL"], open=True)


TOP_K_DEFAULT = 10


@cyntra_index_flow.query_handler(
    name="search_artifacts",
    result_fields=cocoindex.QueryHandlerResultFields(score="score"),
)
def search_artifacts(query: str, k: int = TOP_K_DEFAULT) -> cocoindex.QueryOutput:
    chunks_table = cocoindex.utils.get_target_default_name(cyntra_index_flow, "chunks")
    query_vector = text_to_embedding.eval(query)
    started = time.perf_counter()

    with _connection_pool().connection() as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  artifact_id,
                  repo_path,
                  run_id,
                  artifact_kind,
                  content_type,
                  text,
                  start_pos,
                  end_pos,
                  embedding <=> %s AS distance
                FROM {chunks_table}
                ORDER BY distance
                LIMIT %s
                """,
                (query_vector, k),
            )
            results = []
            for row in cur.fetchall():
                results.append(
                    {
                        "artifact_id": row[0],
                        "repo_path": row[1],
                        "run_id": row[2],
                        "artifact_kind": row[3],
                        "content_type": row[4],
                        "snippet": row[5],
                        "start": row[6],
                        "end": row[7],
                        "score": 1.0 - row[8],
                    }
                )

    logger.info(
        "cocoindex.search_artifacts",
        query_len=len(query),
        k=k,
        results=len(results),
        ms=int((time.perf_counter() - started) * 1000),
    )

    return cocoindex.QueryOutput(
        results=results,
        query_info=cocoindex.QueryInfo(
            similarity_metric=cocoindex.VectorSimilarityMetric.COSINE_SIMILARITY,
        ),
    )


@cyntra_index_flow.query_handler(
    name="search_runs",
    result_fields=cocoindex.QueryHandlerResultFields(score="score"),
)
def search_runs(
    query: str, k: int = TOP_K_DEFAULT, per_chunk_k: int = 200
) -> cocoindex.QueryOutput:
    chunks_table = cocoindex.utils.get_target_default_name(cyntra_index_flow, "chunks")
    run_meta_table = cocoindex.utils.get_target_default_name(cyntra_index_flow, "run_meta")
    job_results_table = cocoindex.utils.get_target_default_name(cyntra_index_flow, "job_results")
    archive_manifests_table = cocoindex.utils.get_target_default_name(
        cyntra_index_flow, "archive_manifests"
    )
    telemetry_table = cocoindex.utils.get_target_default_name(
        cyntra_index_flow, "telemetry_summaries"
    )
    world_runs_table = cocoindex.utils.get_target_default_name(cyntra_index_flow, "world_runs")

    query_vector = text_to_embedding.eval(query)
    started = time.perf_counter()

    with _connection_pool().connection() as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                f"""
                WITH hits AS (
                  SELECT
                    run_id,
                    1.0 - (embedding <=> %s) AS score
                  FROM {chunks_table}
                  WHERE run_id IS NOT NULL
                  ORDER BY embedding <=> %s
                  LIMIT %s
                ),
                runs AS (
                  SELECT run_id, MAX(score) AS score
                  FROM hits
                  GROUP BY run_id
                  ORDER BY score DESC
                  LIMIT %s
                )
                SELECT
                  runs.run_id,
                  runs.score,
                  rm.label,
                  rm.command,
                  rm.started_ms,
                  jr.exit_code,
                  jr.ended_ms,
                  am.issue_id,
                  am.issue_title,
                  am.toolchain,
                  am.job_type,
                  am.speculate_mode,
                  am.speculate_tag,
                  ts.toolchain,
                  ts.model,
                  ts.status,
                  ts.duration_ms,
                  ts.total_cost_usd,
                  ts.input_tokens,
                  ts.output_tokens,
                  wr.world_id,
                  wr.world_config_id,
                  wr.world_version
                FROM runs
                LEFT JOIN {run_meta_table} rm ON rm.run_id = runs.run_id
                LEFT JOIN {job_results_table} jr ON jr.run_id = runs.run_id
                LEFT JOIN {archive_manifests_table} am ON am.workcell_id = runs.run_id
                LEFT JOIN {telemetry_table} ts ON ts.workcell_id = runs.run_id
                LEFT JOIN {world_runs_table} wr ON wr.run_id = runs.run_id
                ORDER BY runs.score DESC
                """,
                (query_vector, query_vector, per_chunk_k, k),
            )
            results = []
            for row in cur.fetchall():
                results.append(
                    {
                        "run_id": row[0],
                        "score": row[1],
                        "label": row[2],
                        "command": row[3],
                        "started_ms": row[4],
                        "exit_code": row[5],
                        "ended_ms": row[6],
                        "issue_id": row[7],
                        "issue_title": row[8],
                        "toolchain": row[9],
                        "job_type": row[10],
                        "speculate_mode": row[11],
                        "speculate_tag": row[12],
                        "telemetry_toolchain": row[13],
                        "telemetry_model": row[14],
                        "telemetry_status": row[15],
                        "telemetry_duration_ms": row[16],
                        "total_cost_usd": row[17],
                        "input_tokens": row[18],
                        "output_tokens": row[19],
                        "world_id": row[20],
                        "world_config_id": row[21],
                        "world_version": row[22],
                    }
                )

    logger.info(
        "cocoindex.search_runs",
        query_len=len(query),
        k=k,
        per_chunk_k=per_chunk_k,
        results=len(results),
        ms=int((time.perf_counter() - started) * 1000),
    )

    return cocoindex.QueryOutput(results=results)
