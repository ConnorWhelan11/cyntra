import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectInfo } from "@/types";
import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Badge, Button, TextInput } from "@/components/ui";
import { STORAGE_KEYS } from "@/utils";

type MemoryRow = Record<string, unknown>;
type CitationRow = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function rowToObject(row: unknown): MemoryRow | null {
  if (row && typeof row === "object" && !Array.isArray(row)) return row as MemoryRow;
  if (!Array.isArray(row)) return null;
  const entries: [string, unknown][] = [];
  for (const item of row) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [key, value] = item;
    if (typeof key !== "string") return null;
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function encodeQuery(query: string, args: Record<string, unknown>): string {
  const keys = Object.keys(args).filter((k) => args[k] !== undefined && args[k] !== null);
  if (keys.length === 0) return query;
  const lines: string[] = [];
  for (const key of keys.sort()) {
    lines.push(`${key}=${String(args[key])}`);
  }
  return `${query.trim()}\n[CYNTRA_ARGS]\n${lines.join("\n")}\n[/CYNTRA_ARGS]`;
}

function parseRunRelPath(repoPath: string): { runId: string; relPath: string } | null {
  const prefix = ".cyntra/runs/";
  if (!repoPath.startsWith(prefix)) return null;
  const rest = repoPath.slice(prefix.length);
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { runId: parts[0], relPath: parts.slice(1).join("/") };
}

interface MemoryVaultViewProps {
  activeProject: ProjectInfo | null;
  onOpenRun?: (runId: string) => void | Promise<void>;
  onOpenRunArtifact?: (runId: string, relPath: string) => void | Promise<void>;
}

export function MemoryVaultView({
  activeProject,
  onOpenRun,
  onOpenRunArtifact,
}: MemoryVaultViewProps) {
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

  const [query, setQuery] = useState("*");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<MemoryRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{
    memoryId: string;
    visibility: string;
    title: string;
    contentMd: string;
    citations: CitationRow[];
  } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      setRows([]);
      setSelected(null);
      setSelectedDetail(null);
      setDetailError(null);

      try {
        const url = `${serverUrl}/cocoindex/api/flows/CyntraIndex/queryHandlers/search_memories?query=${encodeURIComponent(
          encodeQuery(trimmed, { k: 50 })
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { results?: unknown };
        if (!Array.isArray(payload.results)) throw new Error("Invalid response: expected results");
        const out: MemoryRow[] = [];
        for (const raw of payload.results) {
          const obj = rowToObject(raw);
          if (obj) out.push(obj);
        }
        setRows(out);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
        void checkHealth();
      }
    },
    [checkHealth, serverUrl]
  );

  useEffect(() => {
    void runSearch("*");
  }, [runSearch]);

  const loadMemory = useCallback(
    async (row: MemoryRow) => {
      const memoryId = asString(row.memory_id);
      const visibility = asString(row.visibility) ?? "shared";
      const title = asString(row.title) ?? "(untitled)";
      if (!memoryId) return;

      setSelected(row);
      setDetailLoading(true);
      setSelectedDetail(null);
      setDetailError(null);

      try {
        const q = encodeQuery("*", { memory_id: memoryId, visibility });
        const url = `${serverUrl}/cocoindex/api/flows/CyntraIndex/queryHandlers/get_memory?query=${encodeURIComponent(
          q
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { results?: unknown };
        if (!Array.isArray(payload.results) || payload.results.length === 0) {
          throw new Error("Memory not found");
        }
        const obj = rowToObject(payload.results[0]);
        if (!obj) throw new Error("Invalid response: expected object");

        const contentMd = asString(obj.content_md) ?? "";
        const citationsRaw = obj.citations;
        const citations: CitationRow[] = [];
        if (Array.isArray(citationsRaw)) {
          for (const c of citationsRaw) {
            const parsed = rowToObject(c);
            if (parsed) citations.push(parsed);
          }
        }

        setSelectedDetail({ memoryId, visibility, title, contentMd, citations });
      } catch (e) {
        setDetailError(String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [serverUrl]
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
        title="Memories"
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
        <div className="grid gap-3">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">CocoIndex server URL</div>
            <TextInput
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="http://127.0.0.1:8020"
            />
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Query</div>
            <div className="flex gap-2 items-center">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Search memories (or "*" for recent)…'
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch(query);
                }}
              />
              <Button variant="primary" onClick={() => void runSearch(query)} disabled={loading}>
                {loading ? "Searching…" : "Search"}
              </Button>
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Results</div>
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No memories found.</div>
            ) : (
              <div className="grid gap-2">
                {rows.map((row, idx) => {
                  const memoryId = asString(row.memory_id);
                  const title = asString(row.title);
                  const visibility = asString(row.visibility);
                  const status = asString(row.status);
                  const score = asNumber(row.score);
                  const snippet = asString(row.snippet);

                  const selectedId = selected ? asString(selected.memory_id) : null;
                  const isSelected = !!memoryId && selectedId === memoryId;

                  return (
                    <button
                      key={`${idx}-${memoryId ?? "row"}`}
                      onClick={() => void loadMemory(row)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-accent-primary/50 bg-accent-primary/5"
                          : "border-border bg-card/40 hover:bg-card/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {title ?? memoryId ?? "(memory)"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {visibility ?? "?"}
                            {status ? ` · ${status}` : ""}
                            {score !== null ? ` · score ${score.toFixed(3)}` : ""}
                          </div>
                        </div>
                      </div>
                      {snippet && (
                        <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-24 overflow-auto">
                          {snippet.length > 400 ? `${snippet.slice(0, 400)}…` : snippet}
                        </pre>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Detail</div>
            {!selectedDetail && !detailLoading && !detailError && (
              <div className="text-sm text-muted-foreground">Select a memory to view details.</div>
            )}
            {detailError && <div className="text-sm text-red-400">{detailError}</div>}
            {detailLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

            {selectedDetail && (
              <div className="rounded-xl border border-border bg-card/40 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{selectedDetail.title}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {selectedDetail.memoryId} · {selectedDetail.visibility}
                    </div>
                  </div>
                </div>

                {selectedDetail.contentMd && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-64 overflow-auto">
                    {selectedDetail.contentMd}
                  </pre>
                )}

                {selectedDetail.citations.length > 0 && (
                  <div className="grid gap-2">
                    <div className="text-xs text-muted-foreground">Citations</div>
                    <div className="grid gap-2">
                      {selectedDetail.citations.map((c, idx) => {
                        const repoPath = asString(c.repo_path);
                        const runId = asString(c.run_id);
                        const runRel = repoPath ? parseRunRelPath(repoPath) : null;
                        return (
                          <div
                            key={`${idx}-${repoPath ?? "citation"}`}
                            className="rounded-lg border border-border bg-card/30 p-2"
                          >
                            <div className="text-xs text-muted-foreground font-mono break-words">
                              {repoPath ?? "(no repo_path)"}
                            </div>
                            <div className="mt-1 flex gap-2 items-center">
                              {onOpenRun && runId && (
                                <Button
                                  variant="outline"
                                  onClick={() => void onOpenRun(runId)}
                                >
                                  Open Run
                                </Button>
                              )}
                              {onOpenRunArtifact && activeProject && runRel && (
                                <Button
                                  variant="outline"
                                  onClick={() => void onOpenRunArtifact(runRel.runId, runRel.relPath)}
                                >
                                  Open Artifact
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default MemoryVaultView;
