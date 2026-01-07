import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectInfo } from "@/types";
import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Badge, Button, TextInput } from "@/components/ui";
import { startJob } from "@/services";
import { STORAGE_KEYS } from "@/utils";

type SearchMode = "artifacts" | "runs";

type SearchResultRow = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function rowToObject(row: unknown): SearchResultRow | null {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    return row as SearchResultRow;
  }

  if (Array.isArray(row)) {
    const entries: [string, unknown][] = [];
    for (const item of row) {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const [key, value] = item;
      if (typeof key !== "string") return null;
      entries.push([key, value]);
    }
    return Object.fromEntries(entries);
  }

  return null;
}

function parseRunRelPath(repoPath: string): { runId: string; relPath: string } | null {
  const prefix = ".cyntra/runs/";
  if (!repoPath.startsWith(prefix)) return null;
  const rest = repoPath.slice(prefix.length);
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { runId: parts[0], relPath: parts.slice(1).join("/") };
}

interface SearchViewProps {
  activeProject: ProjectInfo | null;
  onOpenRun?: (runId: string) => void | Promise<void>;
  onOpenRunArtifact?: (runId: string, relPath: string) => void | Promise<void>;
}

export function SearchView({ activeProject, onOpenRun, onOpenRunArtifact }: SearchViewProps) {
  const [serverUrlInput, setServerUrlInput] = useState<string>(() => {
    if (typeof localStorage === "undefined") return "http://127.0.0.1:8020";
    return localStorage.getItem(STORAGE_KEYS.COCOINDEX_SERVER_URL) ?? "http://127.0.0.1:8020";
  });

  const serverUrl = useMemo(() => serverUrlInput.trim().replace(/\/+$/, ""), [serverUrlInput]);

  const [serverStatus, setServerStatus] = useState<{
    ok: boolean;
    version?: string | null;
    error?: string | null;
  }>({ ok: false, version: null, error: null });

  const [mode, setMode] = useState<SearchMode>("artifacts");
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const shQuote = useCallback((value: string) => {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }, []);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.COCOINDEX_SERVER_URL, serverUrl);
  }, [serverUrl]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl}/healthz`, { cache: "no-store" });
      if (!res.ok) {
        setServerStatus({ ok: false, version: null, error: `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { status?: unknown; version?: unknown };
      const status = asString(data.status);
      setServerStatus({
        ok: status === "ok",
        version: asString(data.version),
        error: status === "ok" ? null : `status=${String(status)}`,
      });
    } catch (e) {
      setServerStatus({ ok: false, version: null, error: String(e) });
    }
  }, [serverUrl]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setLastQuery(q);
    setResults([]);
    setSearchError(null);

    try {
      const handler = mode === "runs" ? "search_runs" : "search_artifacts";
      const url = `${serverUrl}/cocoindex/api/flows/CyntraIndex/queryHandlers/${handler}?query=${encodeURIComponent(q)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as { results?: unknown };
      const rawResults = payload.results;
      if (!Array.isArray(rawResults)) {
        throw new Error("Invalid response: expected results array");
      }
      const rows: SearchResultRow[] = [];
      for (const row of rawResults) {
        const normalized = rowToObject(row);
        if (normalized) rows.push(normalized);
      }
      setResults(rows);
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setLoading(false);
      void checkHealth();
    }
  }, [checkHealth, mode, query, serverUrl]);

  const draftMemoryFromResult = useCallback(
    async (resultIndex: number, defaultTitle: string) => {
      setMemoryError(null);
      if (!activeProject) {
        setMemoryError("Select a project to create memories.");
        return;
      }

      const title = window.prompt("Memory title", defaultTitle) ?? "";
      if (!title.trim()) return;
      const issueId = window.prompt("Issue ID (optional)", "") ?? "";

      const q = (lastQuery ?? query).trim();
      if (!q) {
        setMemoryError("Run a search first.");
        return;
      }

      const parts: string[] = [
        "uv run --project kernel python -m cyntra.cli memory draft-from-search",
        `--title ${shQuote(title.trim())}`,
        `--query ${shQuote(q)}`,
        `--select ${resultIndex}`,
        "--k 8",
        `--server-url ${shQuote(serverUrl)}`,
      ];
      if (issueId.trim()) {
        parts.push(`--issue-id ${shQuote(issueId.trim())}`);
      }
      const command = parts.join(" ");

      try {
        await startJob({
          projectRoot: activeProject.root,
          command,
          label: "memory-draft",
        });
      } catch (e) {
        setMemoryError(String(e));
      }
    },
    [activeProject, lastQuery, query, serverUrl, shQuote]
  );

  const subtitle = (
    <div className="text-xs">
      <span className="text-muted-foreground">CocoIndex</span>
      <span className="text-muted-foreground"> · </span>
      <span className="font-mono text-muted-foreground">{serverUrl}</span>
    </div>
  );

  return (
    <Panel style={{ height: "100%" }}>
      <PanelHeader
        title="Search"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={serverStatus.ok ? "success" : "failed"}>
              {serverStatus.ok ? "Index online" : "Index offline"}
            </Badge>
            <Button variant="outline" onClick={() => void checkHealth()}>
              Ping
            </Button>
          </div>
        }
      />

      <div className="p-4 space-y-4 overflow-auto" style={{ height: "calc(100% - 54px)" }}>
        {!activeProject && (
          <div className="text-sm text-muted-foreground">
            Select a project to enable deep-links into Runs.
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">CocoIndex server URL</div>
            <TextInput
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="http://127.0.0.1:8020"
            />
            {!serverStatus.ok && (
              <div className="text-xs text-muted-foreground">
                Start it with{" "}
                <code className="font-mono">
                  cyntra index serve --address 127.0.0.1:8020 --cors-local 1420
                </code>
                {serverStatus.error ? ` (${serverStatus.error})` : ""}
              </div>
            )}
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <Button
              variant={mode === "artifacts" ? "primary" : "outline"}
              onClick={() => setMode("artifacts")}
            >
              Artifacts
            </Button>
            <Button
              variant={mode === "runs" ? "primary" : "outline"}
              onClick={() => setMode("runs")}
            >
              Runs
            </Button>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Query</div>
            <div className="flex gap-2 items-center">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === "runs" ? "Search runs…" : "Search artifacts…"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
              />
              <Button variant="primary" onClick={() => void runSearch()} disabled={loading}>
                {loading ? "Searching…" : "Search"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs text-muted-foreground">
            {lastQuery ? `Results for “${lastQuery}”` : "Results"}
          </div>

          {searchError && <div className="text-sm text-red-400">{searchError}</div>}
          {memoryError && <div className="text-sm text-red-400">{memoryError}</div>}

          {results.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Enter a query to search indexed runs, artifacts, prompts, and docs.
            </div>
          )}

          {results.length > 0 && (
            <div className="grid gap-2">
              {results.map((row, idx) => {
                const repoPath = asString(row.repo_path);
                const runId = asString(row.run_id);
                const score = asNumber(row.score);
                const snippet = asString(row.snippet);
                const label = asString(row.label);
                const command = asString(row.command);
                const exitCode = asNumber(row.exit_code);

                const runRel = repoPath ? parseRunRelPath(repoPath) : null;

                return (
                  <div
                    key={`${idx}-${repoPath ?? runId ?? "row"}`}
                    className="rounded-xl border border-border bg-card/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {mode === "runs"
                            ? (runId ?? "(unknown run)")
                            : (repoPath ?? "(unknown path)")}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {score !== null ? `score ${score.toFixed(3)}` : ""}
                          {score !== null && runId ? " · " : ""}
                          {runId ? `run ${runId}` : ""}
                          {mode === "runs" && label ? ` · ${label}` : ""}
                          {mode === "runs" && exitCode !== null ? ` · exit ${exitCode}` : ""}
                        </div>
                      </div>

                      <div className="flex gap-2 items-center shrink-0">
                        {mode === "runs" && runId && onOpenRun && (
                          <Button variant="outline" onClick={() => void onOpenRun(runId)}>
                            Open
                          </Button>
                        )}
                        {mode === "artifacts" && activeProject && runRel && onOpenRunArtifact && (
                          <Button
                            variant="outline"
                            onClick={() => void onOpenRunArtifact(runRel.runId, runRel.relPath)}
                          >
                            Open
                          </Button>
                        )}
                        {mode === "artifacts" && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              void draftMemoryFromResult(idx, repoPath ?? lastQuery ?? "Memory")
                            }
                          >
                            Promote
                          </Button>
                        )}
                      </div>
                    </div>

                    {mode === "runs" && command && (
                      <div className="mt-2 text-xs text-muted-foreground font-mono break-words">
                        {command}
                      </div>
                    )}

                    {mode === "artifacts" && snippet && (
                      <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-auto">
                        {snippet.length > 1200 ? `${snippet.slice(0, 1200)}…` : snippet}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
