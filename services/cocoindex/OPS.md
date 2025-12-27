# CocoIndex Ops (Cyntra)

## Local dev

- Start Postgres+pgvector:
  - `mise run index-db-up`
- Configure env:
  - `cp services/cocoindex/.env.example .env`
- Setup + update:
  - `mise run index-setup`
  - `mise run index-update`
- Serve query API for Desktop dev (CORS + reload):
  - `mise run index-serve`

## Production shape (recommended)

- Run Postgres+pgvector as a managed service or via `docker compose` using `services/cocoindex/compose.yaml`.
- Optionally run Neo4j (knowledge graph export) as a managed service or via `services/cocoindex/compose.neo4j.yaml`.
- Run the CocoIndex server as a supervised long-lived process:
  - Bind to localhost and put it behind a reverse proxy for TLS/auth.
  - Example: `cyntra index serve --env-file /etc/cyntra/cocoindex.env --address 127.0.0.1:8020 --live`
- Put the server behind a reverse proxy if you need TLS and auth (the CocoIndex server itself is unauthenticated).
- Use `COCOINDEX_APP_NAMESPACE` to isolate per-env indexes (e.g. `prod`, `staging`, `connor_dev`).

## Service supervision (systemd example)

Create `/etc/systemd/system/cyntra-cocoindex.service`:

```ini
[Unit]
Description=Cyntra CocoIndex server
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/glia-fab
EnvironmentFile=/etc/cyntra/cocoindex.env
ExecStart=/srv/glia-fab/.venv/bin/cyntra index serve --env-file /etc/cyntra/cocoindex.env --address 127.0.0.1:8020 --live
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cyntra-cocoindex
sudo systemctl status cyntra-cocoindex
```

## Reverse proxy (TLS + auth)

The CocoIndex server is HTTP-only and unauthenticated. For production, bind it to `127.0.0.1` and terminate TLS + auth at a proxy.

### Caddy (simple)

Example `Caddyfile` (TLS + basic auth + JSON access logs):

```caddyfile
cocoindex.example.com {
  encode zstd gzip

  basicauth {
    # Generate hashes with: caddy hash-password
    admin JDJhJDE0JH...
  }

  reverse_proxy 127.0.0.1:8020

  log {
    output file /var/log/cocoindex/access.json
    format json
  }
}
```

### Nginx (simple)

Example server block:

```nginx
server {
  listen 443 ssl;
  server_name cocoindex.example.com;

  # TLS config omitted (certbot/ACME/etc)

  auth_basic "CocoIndex";
  auth_basic_user_file /etc/nginx/htpasswd-cocoindex;

  location / {
    proxy_pass http://127.0.0.1:8020;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Secrets

- Keep secrets out of git:
  - `.env` is already ignored by `.gitignore`.
- Place production secrets in `/etc/cyntra/cocoindex.env` (or your secret manager) and load via `--env-file`.
- Common secret env vars:
  - `COCOINDEX_DATABASE_URL`
  - `CYNTRA_COCOINDEX_OPENAI_API_KEY` (if using `CYNTRA_COCOINDEX_EMBED_PROVIDER=openai`)
  - `CYNTRA_COCOINDEX_NEO4J_PASSWORD` (if exporting graph to Neo4j)

## Observability

- Query handlers log structured timings via `structlog` from `kernel/src/cyntra/indexing/cocoindex_app.py`.
- Capture stdout/stderr to a log sink (systemd journal, filebeat, etc).
- For local dev, a simple pattern is:
  - `cyntra index serve ... > .cyntra/logs/cocoindex_server.log 2>&1`

### Metrics & tracing (pragmatic)

- Prefer proxy access logs + proxy metrics initially (request rates, latency percentiles, error counts).
- Add a synthetic probe (curl/blackbox) for `/` health + query endpoints you care about.
- Future: add OpenTelemetry at the Cyntra layer if/when the query surface becomes a first-class Cyntra API.
