import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest


def _write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True))


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _ensure_pgvector(db_url: str) -> None:
    import psycopg

    with psycopg.connect(db_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")


def _run_cyntra_index(cmd: list[str], *, env: dict[str, str], cwd: Path) -> None:
    try:
        subprocess.run(
            [sys.executable, "-m", "cyntra.cli", "index", *cmd],
            cwd=cwd,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            "\n".join(
                [
                    f"cyntra index {' '.join(cmd)} failed (exit={e.returncode})",
                    "--- stdout ---",
                    e.stdout or "",
                    "--- stderr ---",
                    e.stderr or "",
                ]
            )
        ) from e


def test_cocoindex_setup_update_and_query(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_url = os.environ.get("COCOINDEX_DATABASE_URL")
    if not db_url:
        pytest.skip("COCOINDEX_DATABASE_URL not set (requires Postgres + pgvector)")

    _ensure_pgvector(db_url)

    repo_root = tmp_path / "repo"
    run_id = "run-test-123"
    namespace = f"ci_{uuid.uuid4().hex[:8]}"

    (repo_root / "docs").mkdir(parents=True, exist_ok=True)
    (repo_root / "prompts").mkdir(parents=True, exist_ok=True)

    _write_text(repo_root / ".cyntra" / "runs" / run_id / "terminal.log", "hello cocoindex")
    _write_json(
        repo_root / ".cyntra" / "runs" / run_id / "run_meta.json",
        {
            "run_id": run_id,
            "label": "Test run",
            "command": "pytest -q",
            "started_ms": 123,
            "project_root": str(repo_root),
        },
    )
    _write_json(
        repo_root / ".cyntra" / "runs" / run_id / "job_result.json",
        {"run_id": run_id, "job_id": "job-1", "exit_code": 0, "ended_ms": 456},
    )
    _write_json(
        repo_root / ".cyntra" / "runs" / run_id / "manifest.json",
        {
            "run_id": run_id,
            "world_id": "test_world",
            "world_config_id": "test_world_config",
            "world_version": "v0",
            "created_at": "2025-01-01T00:00:00Z",
            "generator": {"name": "test-gen", "author": "test"},
            "determinism": {"seed": 1, "pythonhashseed": 0, "cycles_seed": 2},
        },
    )

    # Archive-derived structured sources.
    _write_json(
        repo_root / ".cyntra" / "archives" / run_id / "manifest.json",
        {
            # Intentionally omit workcell_id to exercise fallback-from-path behavior.
            "issue": {"id": "42", "title": "Test issue"},
            "toolchain": "codex",
            "job_type": "patch",
            "branch_name": "test/branch",
        },
    )
    _write_json(
        repo_root / ".cyntra" / "archives" / run_id / "proof.json",
        {
            # Intentionally omit workcell_id to exercise fallback-from-path behavior.
            "issue_id": "42",
            "verification": {
                "gates": {
                    "pytest": {
                        "passed": True,
                        "exit_code": 0,
                        "duration_ms": 12,
                        "output": "ok",
                    }
                }
            },
        },
    )
    _write_text(
        repo_root / ".cyntra" / "archives" / run_id / "telemetry.jsonl",
        "\n".join(
            [
                json.dumps(
                    {
                        "type": "started",
                        "timestamp": "2025-01-01T00:00:00Z",
                        "toolchain": "codex",
                        "model": "stub-model",
                        "issue_id": "42",
                        "workcell_id": run_id,
                    }
                ),
                json.dumps(
                    {"type": "prompt_sent", "timestamp": "2025-01-01T00:00:00Z", "tokens": 10}
                ),
                json.dumps(
                    {
                        "type": "response_chunk",
                        "timestamp": "2025-01-01T00:00:01Z",
                        "content": json.dumps(
                            {
                                "total_cost_usd": 0.01,
                                "num_turns": 1,
                                "usage": {
                                    "input_tokens": 11,
                                    "output_tokens": 22,
                                    "cache_read_input_tokens": 0,
                                    "cache_creation_input_tokens": 0,
                                },
                            }
                        ),
                    }
                ),
                json.dumps(
                    {
                        "type": "completed",
                        "timestamp": "2025-01-01T00:00:02Z",
                        "status": "success",
                        "exit_code": 0,
                        "duration_ms": 100,
                    }
                ),
                "",
            ]
        ),
    )

    _write_text(
        repo_root / "fab" / "worlds" / "test_world" / "world.yaml",
        "\n".join(
            [
                "world_id: test_world",
                "world_config_id: test_world_config",
                "world_type: test",
                "version: v0",
                "generator:",
                "  name: test-gen",
                "  author: test",
                "",
            ]
        ),
    )

    env = os.environ.copy()
    env.update(
        {
            "COCOINDEX_DATABASE_URL": db_url,
            "COCOINDEX_APP_NAMESPACE": namespace,
            "CYNTRA_REPO_ROOT": str(repo_root),
            "CYNTRA_COCOINDEX_EMBED_PROVIDER": "stub",
            "CYNTRA_COCOINDEX_STUB_EMBED_DIM": "16",
        }
    )

    _run_cyntra_index(["setup", "--force", "--reset"], env=env, cwd=repo_root)
    _run_cyntra_index(["update", "--force", "--quiet"], env=env, cwd=repo_root)

    monkeypatch.setenv("COCOINDEX_DATABASE_URL", db_url)
    monkeypatch.setenv("COCOINDEX_APP_NAMESPACE", namespace)
    monkeypatch.setenv("CYNTRA_COCOINDEX_EMBED_PROVIDER", "stub")
    monkeypatch.setenv("CYNTRA_COCOINDEX_STUB_EMBED_DIM", "16")

    import cocoindex
    import psycopg

    from cyntra.indexing import cocoindex_app

    chunks_table = cocoindex.utils.get_target_default_name(
        cocoindex_app.cyntra_index_flow, "chunks"
    )
    gate_signals_table = cocoindex.utils.get_target_default_name(
        cocoindex_app.cyntra_index_flow, "gate_signals"
    )
    telemetry_table = cocoindex.utils.get_target_default_name(
        cocoindex_app.cyntra_index_flow, "telemetry_summaries"
    )

    chunk_text: str | None = None
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT text FROM {chunks_table} WHERE repo_path = %s ORDER BY start_pos LIMIT 1",
            (f".cyntra/runs/{run_id}/terminal.log",),
        )
        row = cur.fetchone()
        assert row is not None
        chunk_text = row[0]

        cur.execute(f"SELECT COUNT(*) FROM {gate_signals_table}")
        assert cur.fetchone()[0] >= 1
        cur.execute(f"SELECT COUNT(*) FROM {telemetry_table}")
        assert cur.fetchone()[0] >= 1

    assert chunk_text is not None
    out = cocoindex_app.search_artifacts(chunk_text, k=5)
    assert out.results
    assert out.results[0]["repo_path"] == f".cyntra/runs/{run_id}/terminal.log"
    assert "embedding" not in out.results[0]
