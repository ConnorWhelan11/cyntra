import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/layout/Panel";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Button } from "@/components/ui/Button";
import type { ChatMessage, ProjectInfo, ServerInfo, ImmersaAsset } from "@/types";
import { killJob, startJob } from "@/services";
import { createImmersaBridge, type ImmersaBridge } from "./ImmersaBridge";
import * as ImmersaService from "./ImmersaService";
import type { ImmersaMessage, ImmersaSavePayload } from "./types";

interface ImmersaViewProps {
  serverInfo: ServerInfo | null;
  activeProject: ProjectInfo | null;
}

function normalizeDeckId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "cyntra_latest";
}

function shellQuote(value: string): string {
  if (value === "") return "''";
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Immersa 3D presentation tool view
 * Embeds Immersa in an iframe with postMessage bridge for integration
 */
export function ImmersaView({ serverInfo, activeProject }: ImmersaViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ImmersaBridge | null>(null);
  const lastLoadedPresentationSigRef = useRef<string | null>(null);

  const [presentations, setPresentations] = useState<string[]>([]);
  const [assets, setAssets] = useState<ImmersaAsset[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deck Agent (chat-driven deck generation)
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [deckId, setDeckId] = useState("cyntra_latest");
  const [deckTitle, setDeckTitle] = useState("Cyntra Latest");
  const [deckLimit, setDeckLimit] = useState<number | null>(null);
  const [includeOutora, setIncludeOutora] = useState(true);
  const [includeRuns, setIncludeRuns] = useState(true);
  const [pollSeconds, setPollSeconds] = useState(2);
  const [followUpdates, setFollowUpdates] = useState(false);
  const [activePresentationId, setActivePresentationId] = useState<string | null>(
    null
  );
  const [watchJobId, setWatchJobId] = useState<string | null>(null);
  const [watchRunId, setWatchRunId] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);

  // Determine iframe URL based on environment
  const immersaUrl = useMemo(() => {
    if (!serverInfo || !activeProject) return null;

    // Dev mode: use separate dev server
    if (import.meta.env.DEV) {
      return "http://localhost:8280";
    }

    // Prod mode: use Tauri server
    return `${serverInfo.base_url}/immersa/index.html`;
  }, [serverInfo, activeProject]);

  // Handle messages from Immersa
  const handleMessage = useCallback(
    async (message: ImmersaMessage) => {
      if (!activeProject) return;

      switch (message.type) {
        case "ready":
          setIsReady(true);
          // Send assets when Immersa is ready
          if (bridgeRef.current && assets.length > 0) {
            bridgeRef.current.sendAssets(assets);
          }
          break;

        case "save_presentation": {
          const payload = message.payload as ImmersaSavePayload;
          if (payload?.id && payload?.data) {
            try {
              await ImmersaService.savePresentation(
                activeProject.root,
                payload.id,
                payload.data
              );
              // Refresh presentation list
              const ids = await ImmersaService.listPresentations(
                activeProject.root
              );
              setPresentations(ids);
            } catch (err) {
              setError(`Failed to save presentation: ${err}`);
            }
          }
          break;
        }

        case "request_assets":
          // Re-send current assets
          if (bridgeRef.current) {
            bridgeRef.current.sendAssets(assets);
          }
          break;
      }
    },
    [activeProject, assets]
  );

  // Initialize bridge
  useEffect(() => {
    if (!iframeRef.current) return;

    const bridge = createImmersaBridge(iframeRef, handleMessage);
    bridgeRef.current = bridge;
    bridge.start();

    return () => {
      bridge.stop();
      bridgeRef.current = null;
    };
  }, [handleMessage]);

  // Load presentations and assets when project changes
  useEffect(() => {
    if (!activeProject) {
      setPresentations([]);
      setAssets([]);
      setIsReady(false);
      return;
    }

    const projectRoot = activeProject.root;
    let disposed = false;
    let presentationsInFlight = false;
    let assetsInFlight = false;

    async function refreshPresentations() {
      if (presentationsInFlight) return;
      presentationsInFlight = true;
      try {
        const presIds = await ImmersaService.listPresentations(projectRoot);
        if (!disposed) setPresentations(presIds);
      } catch (err) {
        if (!disposed) setError(`Failed to load Immersa presentations: ${err}`);
      } finally {
        presentationsInFlight = false;
      }
    }

    async function refreshAssets() {
      if (assetsInFlight) return;
      assetsInFlight = true;
      try {
        const assetList = await ImmersaService.listImmersaAssets(projectRoot);
        if (!disposed) setAssets(assetList);

        // Send assets to Immersa if ready
        if (!disposed && bridgeRef.current?.isReady()) {
          bridgeRef.current.sendAssets(assetList);
        }
      } catch (err) {
        if (!disposed) setError(`Failed to load Immersa assets: ${err}`);
      } finally {
        assetsInFlight = false;
      }
    }

    refreshPresentations();
    refreshAssets();

    const presentationsTimer = window.setInterval(refreshPresentations, 2000);
    const assetsTimer = window.setInterval(refreshAssets, 5000);

    // Notify Immersa of project change
    if (bridgeRef.current) {
      bridgeRef.current.notifyProjectChanged();
    }

    return () => {
      disposed = true;
      window.clearInterval(presentationsTimer);
      window.clearInterval(assetsTimer);
    };
  }, [activeProject]);

  // Send assets when they're loaded and Immersa is ready
  useEffect(() => {
    if (isReady && bridgeRef.current && assets.length > 0) {
      bridgeRef.current.sendAssets(assets);
    }
  }, [isReady, assets]);

  // Load a specific presentation
  const handleLoadPresentation = useCallback(
    async (id: string) => {
      if (!activeProject) return;

      try {
        const data = await ImmersaService.loadPresentation(
          activeProject.root,
          id
        );
        if (data && bridgeRef.current) {
          bridgeRef.current.sendPresentation(id, data);
          setActivePresentationId(id);
          lastLoadedPresentationSigRef.current = JSON.stringify(data);
        }
      } catch (err) {
        setError(`Failed to load presentation: ${err}`);
      }
    },
    [activeProject]
  );

  // Delete a presentation
  const handleDeletePresentation = useCallback(
    async (id: string) => {
      if (!activeProject) return;

      try {
        await ImmersaService.deletePresentation(activeProject.root, id);
        setPresentations((prev) => prev.filter((p) => p !== id));
      } catch (err) {
        setError(`Failed to delete presentation: ${err}`);
      }
    },
    [activeProject]
  );

  const refreshPresentationsOnce = useCallback(async () => {
    if (!activeProject) return;
    const ids = await ImmersaService.listPresentations(activeProject.root);
    setPresentations(ids);
  }, [activeProject]);

  const waitForPresentation = useCallback(
    async (id: string, timeoutMs = 12_000) => {
      if (!activeProject) return null;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const data = await ImmersaService.loadPresentation(activeProject.root, id);
        if (data) return data;
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    },
    [activeProject]
  );

  const runGenerate = useCallback(
    async ({
      id,
      title,
      limit,
      outora,
      runs,
    }: {
      id: string;
      title: string;
      limit: number | null;
      outora: boolean;
      runs: boolean;
    }) => {
      if (!activeProject) return;

      const safeId = normalizeDeckId(id);
      const cmd = [
        "cyntra immersa generate",
        "--repo .",
        `--deck-id ${shellQuote(safeId)}`,
        `--title ${shellQuote(title)}`,
        limit ? `--limit ${limit}` : null,
        outora ? "--include-outora" : "--no-include-outora",
        runs ? "--include-runs" : "--no-include-runs",
      ]
        .filter(Boolean)
        .join(" ");

      const job = await startJob({
        projectRoot: activeProject.root,
        command: cmd,
        label: `immersa_generate_${safeId}`,
      });

      const data = await waitForPresentation(safeId);
      if (!data) {
        throw new Error(`Timed out waiting for presentation: ${safeId}`);
      }
      await refreshPresentationsOnce();
      await handleLoadPresentation(safeId);
      return job;
    },
    [activeProject, handleLoadPresentation, refreshPresentationsOnce, waitForPresentation]
  );

  const runWatch = useCallback(
    async ({
      id,
      title,
      limit,
      outora,
      runs,
      poll,
    }: {
      id: string;
      title: string;
      limit: number | null;
      outora: boolean;
      runs: boolean;
      poll: number;
    }) => {
      if (!activeProject) return;

      const safeId = normalizeDeckId(id);
      const cmd = [
        "cyntra immersa watch",
        "--repo .",
        `--deck-id ${shellQuote(safeId)}`,
        `--title ${shellQuote(title)}`,
        `--poll-seconds ${poll}`,
        limit ? `--limit ${limit}` : null,
        outora ? "--include-outora" : "--no-include-outora",
        runs ? "--include-runs" : "--no-include-runs",
      ]
        .filter(Boolean)
        .join(" ");

      const job = await startJob({
        projectRoot: activeProject.root,
        command: cmd,
        label: `immersa_watch_${safeId}`,
      });

      setWatchJobId(job.jobId);
      setWatchRunId(job.runId);
      const data = await waitForPresentation(safeId);
      if (!data) {
        throw new Error(`Timed out waiting for presentation: ${safeId}`);
      }
      await refreshPresentationsOnce();
      await handleLoadPresentation(safeId);
      return job;
    },
    [activeProject, handleLoadPresentation, refreshPresentationsOnce, waitForPresentation]
  );

  const stopWatch = useCallback(async () => {
    if (!watchJobId) return false;
    await killJob(watchJobId);
    setWatchJobId(null);
    setWatchRunId(null);
    return true;
  }, [watchJobId]);

  // Auto-reload the currently loaded deck if it changes on disk (e.g. watch mode updates).
  useEffect(() => {
    if (!activeProject) return;
    if (!followUpdates) return;
    if (!activePresentationId) return;

    const projectRoot = activeProject.root;
    const presentationId = activePresentationId;
    let disposed = false;
    let inFlight = false;

    async function tick() {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const data = await ImmersaService.loadPresentation(projectRoot, presentationId);
        if (!data) return;
        const sig = JSON.stringify(data);
        if (sig === lastLoadedPresentationSigRef.current) return;
        lastLoadedPresentationSigRef.current = sig;
        bridgeRef.current?.sendPresentation(presentationId, data);
      } catch {
        // Ignore transient read/parse errors while files are being written.
      } finally {
        inFlight = false;
      }
    }

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeProject, activePresentationId, followUpdates]);

  const subtitle = activeProject
    ? `${presentations.length} presentations, ${assets.length} assets`
    : "no project selected";

  const addAgentChat = useCallback((role: ChatMessage["role"], text: string) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);
    setAgentMessages((prev) => [...prev, { id, role, text, ts: Date.now() }]);
  }, []);

  const sendAgentChat = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? agentInput).trim();
    if (!text) return;
    setAgentInput("");
    addAgentChat("user", text);

    if (!activeProject) {
      addAgentChat("system", "Select a project first.");
      return;
    }

    const lower = text.toLowerCase();

    if (lower === "help" || lower === "/help") {
      addAgentChat(
        "system",
        [
          "Commands:",
          "- deck <id>            (set deck id)",
          "- title <text>         (set deck title)",
          "- limit <n|off>        (limit assets)",
          "- include outora on|off",
          "- include runs on|off",
          "- poll <seconds>       (watch poll interval)",
          "- follow on|off        (auto-reload loaded deck)",
          "- generate             (generate deck JSON)",
          "- watch                (watch assets + regenerate)",
          "- stop                 (stop watch)",
          "- load [id]            (load a deck into Immersa)",
        ].join("\n")
      );
      return;
    }

    const deckMatch = text.match(/^deck\s+(.+)$/i);
    if (deckMatch) {
      const next = normalizeDeckId(deckMatch[1]);
      setDeckId(next);
      addAgentChat("system", `Deck id set: ${next}`);
      return;
    }

    const titleMatch = text.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      const next = titleMatch[1].trim();
      setDeckTitle(next);
      addAgentChat("system", `Title set: ${next}`);
      return;
    }

    const limitMatch = text.match(/^limit\s+(.+)$/i);
    if (limitMatch) {
      const raw = limitMatch[1].trim();
      if (/^(off|none|no)$/i.test(raw)) {
        setDeckLimit(null);
        addAgentChat("system", "Limit cleared.");
        return;
      }
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) {
        addAgentChat("system", "Limit must be a positive integer (or `limit off`).");
        return;
      }
      setDeckLimit(n);
      addAgentChat("system", `Limit set: ${n}`);
      return;
    }

    const includeMatch = lower.match(/^include\s+(outora|runs)\s+(on|off)$/);
    if (includeMatch) {
      const [, target, mode] = includeMatch;
      const enabled = mode === "on";
      if (target === "outora") setIncludeOutora(enabled);
      if (target === "runs") setIncludeRuns(enabled);
      addAgentChat("system", `Include ${target}: ${enabled ? "on" : "off"}`);
      return;
    }

    const pollMatch = text.match(/^poll\s+(.+)$/i);
    if (pollMatch) {
      const s = Number.parseFloat(pollMatch[1]);
      if (!Number.isFinite(s) || s <= 0) {
        addAgentChat("system", "Poll must be a positive number (seconds).");
        return;
      }
      setPollSeconds(s);
      addAgentChat("system", `Poll set: ${s}s`);
      return;
    }

    const followMatch = lower.match(/^follow\s+(on|off)$/);
    if (followMatch) {
      const enabled = followMatch[1] === "on";
      setFollowUpdates(enabled);
      addAgentChat("system", `Follow updates: ${enabled ? "on" : "off"}`);
      return;
    }

    const loadMatch = text.match(/^load(?:\s+(.+))?$/i);
    if (loadMatch) {
      const id = normalizeDeckId(loadMatch[1] ?? deckId);
      setDeckId(id);
      addAgentChat("system", `Loading deck: ${id}`);
      await handleLoadPresentation(id);
      return;
    }

    if (lower === "generate" || lower === "gen") {
      setAgentBusy(true);
      addAgentChat(
        "system",
        `Generating: deck=${deckId} title=${deckTitle}${deckLimit ? ` limit=${deckLimit}` : ""}`
      );
      try {
        const job = await runGenerate({
          id: deckId,
          title: deckTitle,
          limit: deckLimit,
          outora: includeOutora,
          runs: includeRuns,
        });
        addAgentChat(
          "system",
          job ? `Generated and loaded. (run ${job.runId})` : "Generated and loaded."
        );
      } catch (e) {
        addAgentChat("system", `Generate failed: ${String(e)}`);
      } finally {
        setAgentBusy(false);
      }
      return;
    }

    if (lower === "watch") {
      setAgentBusy(true);
      if (watchJobId) {
        addAgentChat(
          "system",
          `Watch already running (${watchRunId ?? watchJobId}). Say \`stop\` first.`
        );
        setAgentBusy(false);
        return;
      }
      setFollowUpdates(true);
      addAgentChat(
        "system",
        `Starting watch: deck=${deckId} poll=${pollSeconds}s${deckLimit ? ` limit=${deckLimit}` : ""}`
      );
      try {
        const job = await runWatch({
          id: deckId,
          title: deckTitle,
          limit: deckLimit,
          outora: includeOutora,
          runs: includeRuns,
          poll: pollSeconds,
        });
        addAgentChat(
          "system",
          job ? `Watch started. (run ${job.runId})` : "Watch started."
        );
      } catch (e) {
        addAgentChat("system", `Watch failed: ${String(e)}`);
      } finally {
        setAgentBusy(false);
      }
      return;
    }

    if (lower === "stop") {
      setAgentBusy(true);
      try {
        const stopped = await stopWatch();
        addAgentChat("system", stopped ? "Stopped watch job." : "No watch job running.");
      } catch (e) {
        addAgentChat("system", `Stop failed: ${String(e)}`);
      } finally {
        setAgentBusy(false);
      }
      return;
    }

    // Natural language fallback: treat as a request to create a deck
    // Example: `make a deck called "June Demo" with 12 slides and watch`
    const quotedTitle = text.match(/["“](.+?)["”]/)?.[1]?.trim();
    const nextTitle = quotedTitle || text.trim();
    const nextDeckId = normalizeDeckId(nextTitle);
    const nextLimit = text.match(/\b(?:limit|slides?)\s+(\d+)\b/i)?.[1];
    const wantsWatch = /\bwatch\b|\blive\b|\bauto[- ]?update\b/i.test(text);

    setDeckTitle(nextTitle);
    setDeckId(nextDeckId);
    if (nextLimit) setDeckLimit(Number.parseInt(nextLimit, 10));

    setAgentBusy(true);
    addAgentChat(
      "system",
      `Building deck: deck=${nextDeckId} title=${nextTitle}${nextLimit ? ` limit=${nextLimit}` : ""}${wantsWatch ? ` watch poll=${pollSeconds}s` : ""}`
    );
    try {
      if (wantsWatch) {
        if (watchJobId) {
          await stopWatch();
        }
        setFollowUpdates(true);
        await runWatch({
          id: nextDeckId,
          title: nextTitle,
          limit: nextLimit ? Number.parseInt(nextLimit, 10) : deckLimit,
          outora: includeOutora,
          runs: includeRuns,
          poll: pollSeconds,
        });
        addAgentChat("system", "Deck is live and will update as assets change.");
      } else {
        await runGenerate({
          id: nextDeckId,
          title: nextTitle,
          limit: nextLimit ? Number.parseInt(nextLimit, 10) : deckLimit,
          outora: includeOutora,
          runs: includeRuns,
        });
        addAgentChat("system", "Deck generated and loaded.");
      }
    } catch (e) {
      addAgentChat("system", `Build failed: ${String(e)}`);
    } finally {
      setAgentBusy(false);
    }
  }, [
    activeProject,
    addAgentChat,
    agentInput,
    deckId,
    deckTitle,
    deckLimit,
    includeOutora,
    includeRuns,
    pollSeconds,
    handleLoadPresentation,
    runGenerate,
    runWatch,
    stopWatch,
    watchJobId,
    watchRunId,
  ]);

  return (
    <div style={{ display: "flex", height: "100%", gap: 0 }}>
      {/* Sidebar: Presentations list */}
      <Panel style={{ width: 240, flexShrink: 0 }}>
        <PanelHeader title="Presentations" />
        <div style={{ padding: 8, overflowY: "auto", flex: 1 }}>
          {presentations.length === 0 ? (
            <div className="text-muted-foreground" style={{ padding: 8 }}>
              No presentations yet.
              {isReady
                ? " Create one in Immersa."
                : " Waiting for Immersa to load..."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {presentations.map((id) => (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "var(--background-secondary)",
                  }}
                >
                  <button
                    onClick={() => handleLoadPresentation(id)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {id}
                  </button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => handleDeletePresentation(id)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assets summary */}
        <div
          style={{
            padding: 8,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            {assets.length} GLB assets available
          </div>
        </div>
      </Panel>

      {/* Main: Immersa iframe */}
      <Panel style={{ flex: 1 }}>
        <PanelHeader title="Immersa" subtitle={subtitle} />
        <div style={{ height: "calc(100% - 49px)" }}>
          {error && (
            <div
              style={{
                padding: 14,
                color: "var(--destructive)",
                background: "var(--destructive-muted)",
              }}
            >
              {error}
              <Button
                variant="ghost"
                size="small"
                onClick={() => setError(null)}
                style={{ marginLeft: 8 }}
              >
                Dismiss
              </Button>
            </div>
          )}

          {immersaUrl ? (
            <iframe
              ref={iframeRef}
              className="iframe"
              src={immersaUrl}
              style={{
                width: "100%",
                height: error ? "calc(100% - 44px)" : "100%",
              }}
            />
          ) : (
            <div style={{ padding: 14 }} className="text-muted-foreground">
              {!activeProject
                ? "Select a project to use Immersa."
                : "Immersa is not available. Run `npm run watch` in apps/immersa for development."}
            </div>
          )}
        </div>
      </Panel>

      {/* Right: Deck Agent */}
      <Panel style={{ width: 360, flexShrink: 0 }}>
        <PanelHeader
          title="Deck Agent"
          subtitle={activeProject ? deckId : "no project selected"}
          actions={
            <div className="row">
              <Button
                variant="ghost"
                size="small"
                onClick={() => {
                  setAgentMessages([]);
                  addAgentChat(
                    "system",
                    "Cleared. Type `help` for commands, or describe the deck you want."
                  );
                }}
              >
                Clear
              </Button>
            </div>
          }
        />
        <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div>
              Deck: <code>{deckId}</code>
            </div>
            <div>Title: {deckTitle}</div>
            <div>
              Limit: {deckLimit ?? "none"} · Outora: {includeOutora ? "on" : "off"} ·
              Runs: {includeRuns ? "on" : "off"}
            </div>
            <div>
              Poll: {pollSeconds}s · Follow: {followUpdates ? "on" : "off"} · Loaded:{" "}
              {activePresentationId ?? "—"}
            </div>
            <div>
              Watch:{" "}
              {watchJobId ? (
                <span>
                  on ({watchRunId ?? watchJobId})
                </span>
              ) : (
                "off"
              )}
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="row" style={{ gap: 8 }}>
            <Button
              onClick={() => sendAgentChat().catch((e) => setError(String(e)))}
              disabled={!activeProject || agentBusy}
            >
              Send
            </Button>
            <Button
              variant="ghost"
              onClick={() => sendAgentChat("generate").catch((e) => setError(String(e)))}
              disabled={!activeProject || agentBusy}
            >
              Generate
            </Button>
            <Button
              variant="ghost"
              onClick={() => sendAgentChat("load").catch((e) => setError(String(e)))}
              disabled={!activeProject || agentBusy}
            >
              Load
            </Button>
            <Button
              variant="ghost"
              onClick={() => sendAgentChat(watchJobId ? "stop" : "watch").catch((e) => setError(String(e)))}
              disabled={!activeProject || agentBusy}
            >
              {watchJobId ? "Stop" : "Watch"}
            </Button>
          </div>
        </div>

        <div className="chat" style={{ padding: 10, height: "100%" }}>
          <div className="chat-log" style={{ height: "calc(100% - 44px)" }}>
            {agentMessages.length === 0 && (
              <div className="muted">
                Try:{" "}
                <code>
                  make a deck called &ldquo;Cyntra Latest&rdquo; with 12 slides and watch
                </code>{" "}
                then <code>generate</code> and <code>load</code>.
              </div>
            )}
            {agentMessages.slice(-60).map((m) => (
              <div
                key={m.id}
                className={"chat-msg " + (m.role === "user" ? "user" : "system")}
              >
                <div className="chat-meta">
                  {m.role} · {new Date(m.ts).toLocaleTimeString()}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input
              className="text-input"
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendAgentChat().catch((err) => setError(String(err)));
                }
              }}
              placeholder="Describe a deck, or type `help`…"
              disabled={!activeProject || agentBusy}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}
