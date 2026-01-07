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


def _neo4j_tx_commit(
    *,
    http_url: str,
    user: str,
    password: str,
    db: str,
    statement: str,
    parameters: dict[str, object] | None = None,
) -> list[dict[str, object]]:
    import httpx

    resp = httpx.post(
        f"{http_url.rstrip('/')}/db/{db}/tx/commit",
        auth=(user, password),
        json={
            "statements": [
                {
                    "statement": statement,
                    "parameters": parameters or {},
                }
            ]
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    payload = resp.json()
    errors = payload.get("errors")
    if errors:
        raise RuntimeError(f"Neo4j cypher errors: {errors}")
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return []
    first = results[0]
    data = first.get("data")
    if not isinstance(data, list):
        return []
    out: list[dict[str, object]] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        row_data = row.get("row")
        if isinstance(row_data, list) and row_data:
            out.append({"row": row_data})
    return out


def test_cocoindex_neo4j_export(tmp_path: Path) -> None:
    db_url = os.environ.get("COCOINDEX_DATABASE_URL")
    if not db_url:
        pytest.skip("COCOINDEX_DATABASE_URL not set (requires Postgres + pgvector)")

    if os.environ.get("CYNTRA_COCOINDEX_GRAPH_TARGET") != "neo4j":
        pytest.skip("CYNTRA_COCOINDEX_GRAPH_TARGET!=neo4j (Neo4j export disabled)")

    neo4j_http_url = os.environ.get("CYNTRA_COCOINDEX_NEO4J_HTTP_URL", "http://localhost:7474")
    neo4j_user = os.environ.get("CYNTRA_COCOINDEX_NEO4J_USER", "neo4j")
    neo4j_password = os.environ.get("CYNTRA_COCOINDEX_NEO4J_PASSWORD", "cocoindex")
    neo4j_db = os.environ.get("CYNTRA_COCOINDEX_NEO4J_DB", "neo4j")

    try:
        import httpx

        httpx.get(neo4j_http_url, timeout=2.0).raise_for_status()
    except Exception as e:
        pytest.skip(f"Neo4j HTTP not reachable at {neo4j_http_url}: {e}")

    _ensure_pgvector(db_url)

    repo_root = tmp_path / "repo"
    run_id = f"run-neo4j-{uuid.uuid4().hex[:8]}"
    issue_id = f"{uuid.uuid4().hex[:8]}"
    namespace = f"ci_{uuid.uuid4().hex[:8]}"

    _write_text(
        repo_root / ".beads" / "issues.jsonl",
        json.dumps(
            {
                "id": issue_id,
                "title": "Neo4j export smoke",
                "description": "Ensure CocoIndex graph export populates Issue nodes",
                "status": "open",
                "tags": ["graph", "cocoindex"],
            }
        )
        + "\n",
    )

    _write_text(repo_root / ".cyntra" / "runs" / run_id / "terminal.log", "hello neo4j")
    _write_json(
        repo_root / ".cyntra" / "runs" / run_id / "run_meta.json",
        {"run_id": run_id, "label": "Neo4j smoke", "started_ms": 1, "project_root": str(repo_root)},
    )
    _write_json(
        repo_root / ".cyntra" / "runs" / run_id / "job_result.json",
        {"run_id": run_id, "job_id": "job-neo4j", "exit_code": 0, "ended_ms": 2},
    )

    _write_json(
        repo_root / ".cyntra" / "archives" / run_id / "manifest.json",
        {
            "issue": {"id": issue_id, "title": "Neo4j export smoke"},
            "toolchain": "codex",
            "job_type": "patch",
        },
    )

    env = os.environ.copy()
    env.update(
        {
            "COCOINDEX_DATABASE_URL": db_url,
            "COCOINDEX_APP_NAMESPACE": namespace,
            "CYNTRA_REPO_ROOT": str(repo_root),
            "CYNTRA_COCOINDEX_EMBED_PROVIDER": "stub",
            "CYNTRA_COCOINDEX_STUB_EMBED_DIM": "16",
            "CYNTRA_COCOINDEX_GRAPH_TARGET": "neo4j",
            "CYNTRA_COCOINDEX_NEO4J_USER": neo4j_user,
            "CYNTRA_COCOINDEX_NEO4J_PASSWORD": neo4j_password,
            "CYNTRA_COCOINDEX_NEO4J_DB": neo4j_db,
        }
    )
    if "CYNTRA_COCOINDEX_NEO4J_URI" in os.environ:
        env["CYNTRA_COCOINDEX_NEO4J_URI"] = os.environ["CYNTRA_COCOINDEX_NEO4J_URI"]

    _run_cyntra_index(["setup", "--force", "--reset"], env=env, cwd=repo_root)
    _run_cyntra_index(["update", "--force", "--quiet"], env=env, cwd=repo_root)

    issue_rows = _neo4j_tx_commit(
        http_url=neo4j_http_url,
        user=neo4j_user,
        password=neo4j_password,
        db=neo4j_db,
        statement="MATCH (i:Issue {issue_id: $issue_id}) RETURN i.title",
        parameters={"issue_id": issue_id},
    )
    assert issue_rows, "Expected Issue node in Neo4j export"

    rel_rows = _neo4j_tx_commit(
        http_url=neo4j_http_url,
        user=neo4j_user,
        password=neo4j_password,
        db=neo4j_db,
        statement="MATCH (:Run {run_id: $run_id})-[:FOR_ISSUE]->(:Issue {issue_id: $issue_id}) RETURN 1",
        parameters={"run_id": run_id, "issue_id": issue_id},
    )
    assert rel_rows, "Expected Run-[:FOR_ISSUE]->Issue relationship"

