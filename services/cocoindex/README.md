# CocoIndex (Cyntra indexing substrate)

Local dev brings up a Postgres+pgvector instance for CocoIndex internal storage and exported targets.

## Start DB

```bash
docker compose -f services/cocoindex/compose.yaml up -d
```

## Optional: start Neo4j (knowledge graph export)

```bash
docker compose -f services/cocoindex/compose.neo4j.yaml up -d
```

## Configure env

Copy `services/cocoindex/.env.example` to `.env` (repo root), or pass an explicit env file to CocoIndex:

```bash
cp services/cocoindex/.env.example .env
```

## Enable Neo4j export (optional)

- Set `CYNTRA_COCOINDEX_GRAPH_TARGET=neo4j` (in `.env` or as an env var on the command).
- Ensure Neo4j is reachable (see `services/cocoindex/compose.neo4j.yaml` + `.env.example` for defaults).

## Run indexing

From repo root:

```bash
# Install CocoIndex integration (one-time)
cd kernel
pip install -e ".[dev,indexing]"
cd ..

# Defaults:
# - 512KB max per file (CYNTRA_COCOINDEX_MAX_FILE_SIZE_BYTES)
# - sentence-transformers embeddings (CYNTRA_COCOINDEX_EMBED_PROVIDER)
# Configure overrides in `.env` (see services/cocoindex/.env.example).

# one-time setup (creates internal tables + targets)
cyntra index setup --env-file .env --force

# one-time update (incremental)
cyntra index update --env-file .env

# run query server (optionally live-update)
# Desktop dev UI runs at http://localhost:1420, so enable CORS for that origin.
cyntra index serve --env-file .env --address 127.0.0.1:8020 --cors-local 1420 --live
```

Tip: for fast local runs, use deterministic stub embeddings:

```bash
CYNTRA_COCOINDEX_EMBED_PROVIDER=stub cyntra index update --env-file .env
```

## Mise tasks

Most commands above are wrapped as `mise` tasks:

- `mise run index-db-up`, `mise run index-db-down`
- `mise run index-neo4j-up`, `mise run index-neo4j-down`
- `mise run index-setup`, `mise run index-update`
- `mise run index-serve` (dev) / `mise run index-serve-prod` (prod-ish defaults)

## Observability

- Query handlers log structured timings via `structlog` (stdout); redirect logs as needed, e.g. `> .cyntra/logs/cocoindex_server.log`.

See `services/cocoindex/OPS.md` for production deployment guidance (TLS/auth, supervision, secrets).
