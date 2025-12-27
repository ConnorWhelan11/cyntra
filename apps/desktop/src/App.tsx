import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "xterm-addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

import type {
  ActiveJobInfo,
  ArtifactInfo,
  BeadsIssue,
  BeadsIssuePatch,
  ChatMessage,
  KernelSnapshot,
  Nav,
  ProjectInfo,
  PtySessionInfo,
  RunInfo,
  ServerInfo,
} from "@/types";
import { parseTagsInput, STORAGE_KEYS, stripAnsi, stripEscalationTags } from "@/utils";
import {
  beadsInit as beadsInitService,
  clearGlobalEnv as clearGlobalEnvService,
  createIssue as createIssueService,
  createPty as createPtyService,
  detectProject as detectProjectService,
  getArtifacts as getArtifactsService,
  getGlobalEnv as getGlobalEnvService,
  getServerInfo as getServerInfoService,
  kernelSnapshot as kernelSnapshotService,
  killJob as killJobService,
  killPty as killPtyService,
  listActiveJobs as listActiveJobsService,
  listPty as listPtyService,
  listRuns as listRunsService,
  resizePty as resizePtyService,
  setGlobalEnv as setGlobalEnvService,
  setServerRoots as setServerRootsService,
  startJob as startJobService,
  updateIssue as updateIssueService,
  writePty as writePtyService,
} from "@/services";
import { useInterval, useKernelEventStream, useEventStreamCallback } from "@/hooks";
import type { KernelEvent } from "@/types";

import { WorkcellDetail } from "./WorkcellDetail";
import { ViewerView } from "./features/viewer";
import { ImmersaView } from "./features/immersa";
import { ProjectsView } from "./features/projects";
import { TerminalsView } from "./features/terminals";
import { RunsView } from "./features/runs";
import { KernelView } from "./features/kernel";
import { HomeWorldBuilderView } from "./features/home";
import { EvolutionLabView } from "./features/evolution";
import { MemoryAtlasView } from "./features/memory";
import { GalleryView2 } from "./features/gallery";
import { StageView } from "./features/stage";
import { GameplayView } from "./features/gameplay";
import { WorkflowsView } from "./features/workflows";
import { SearchView } from "./features/search";
import { GameplayProvider } from "./context/GameplayContext";
import { AddProjectModal, NewRunModal, CreateIssueModal } from "./components/modals";
import { MainLayout, PcbAmbientLayer } from "./components/layout";
import { CommandPalette } from "./components/shared";
import { ErrorBanner } from "./components/ui";
import { ViewportDevPanel } from "./components/dev/ViewportDevPanel";

function readStoredProjectRoots(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "root" in item) {
          const root = (item as { root?: unknown }).root;
          if (typeof root === "string") return root;
        }
        return null;
      })
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function readStoredActiveProjectRoot(): string | null {
  if (typeof localStorage === "undefined") return null;
  const root = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
  return root && root.trim().length > 0 ? root : null;
}

export default function App() {
  const [nav, setNav] = useState<Nav>("universe");
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectsHydrated, setProjectsHydrated] = useState(false);
  const [activeProjectRoot, setActiveProjectRoot] = useState<string | null>(null);
  const [globalEnvText, setGlobalEnvText] = useState("");
  const [globalEnvLoaded, setGlobalEnvLoaded] = useState(false);
  const [globalEnvSaving, setGlobalEnvSaving] = useState(false);

  const [sessions, setSessions] = useState<PtySessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [activeArtifactRelPath, setActiveArtifactRelPath] = useState<string | null>(null);
  const [artifactText, setArtifactText] = useState<string | null>(null);
  const [jobOutputs, setJobOutputs] = useState<Record<string, string>>({});
  const [jobExitCodes, setJobExitCodes] = useState<Record<string, number | null>>({});

  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");

  const [isNewRunOpen, setIsNewRunOpen] = useState(false);
  const [newRunCommand, setNewRunCommand] = useState("ls -la");
  const [newRunLabel, setNewRunLabel] = useState("");

  const [kernelSnapshot, setKernelSnapshot] = useState<KernelSnapshot | null>(null);
  const [kernelSelectedIssueId, setKernelSelectedIssueId] = useState<string | null>(null);
  const [kernelFilter, setKernelFilter] = useState("");
  const [kernelOnlyReady, setKernelOnlyReady] = useState(false);
  const [kernelOnlyActiveIssues, setKernelOnlyActiveIssues] = useState(false);
  const [kernelEventsForSelectedIssue, setKernelEventsForSelectedIssue] = useState(false);
  const [streamedEvents, setStreamedEvents] = useState<KernelEvent[]>([]);

  const [activeJobs, setActiveJobs] = useState<ActiveJobInfo[]>([]);
  const [kernelJobId, setKernelJobId] = useState<string | null>(null);
  const [kernelRunId, setKernelRunId] = useState<string | null>(null);
  const [selectedWorkcellId, setSelectedWorkcellId] = useState<string | null>(null);

  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssueDescription, setNewIssueDescription] = useState("");
  const [newIssueTags, setNewIssueTags] = useState("");
  const [newIssuePriority, setNewIssuePriority] = useState("P2");
  const [newIssueToolHint, setNewIssueToolHint] = useState<string>("");
  const [newIssueRisk, setNewIssueRisk] = useState("medium");
  const [newIssueSize, setNewIssueSize] = useState("M");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null!);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.root === activeProjectRoot) ?? null,
    [projects, activeProjectRoot]
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeRunId) ?? null,
    [runs, activeRunId]
  );

  const activeArtifact = useMemo(
    () => artifacts.find((a) => a.relPath === activeArtifactRelPath) ?? null,
    [artifacts, activeArtifactRelPath]
  );

  const newIssueTagSet = useMemo(() => new Set(parseTagsInput(newIssueTags)), [newIssueTags]);

  const selectedKernelIssue = useMemo(() => {
    if (!kernelSnapshot || !kernelSelectedIssueId) return null;
    return kernelSnapshot.issues.find((i) => i.id === kernelSelectedIssueId) ?? null;
  }, [kernelSnapshot, kernelSelectedIssueId]);

  useEffect(() => {
    (async () => {
      try {
        const info = await getServerInfoService();
        setServerInfo(info);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  // Command palette keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const text = await getGlobalEnvService();
        setGlobalEnvText(text ?? "");
        setGlobalEnvLoaded(true);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedRoots = readStoredProjectRoots();
      const savedActive = readStoredActiveProjectRoot();
      if (savedRoots.length === 0) {
        if (!cancelled) setProjectsHydrated(true);
        return;
      }
      try {
        const infos = await Promise.all(
          savedRoots.map(async (root) => {
            try {
              return await detectProjectService(root);
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        const validInfos = infos.filter((info): info is ProjectInfo => Boolean(info));
        if (validInfos.length > 0) {
          setProjects(validInfos);
          const nextActive =
            validInfos.find((p) => p.root === savedActive)?.root ?? validInfos[0].root;
          const nextInfo = validInfos.find((p) => p.root === nextActive) ?? null;
          await setActiveProjectWithInfo(nextActive, nextInfo);
        }
      } finally {
        if (!cancelled) setProjectsHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectsHydrated) return;
    if (typeof localStorage === "undefined") return;
    const roots = Array.from(new Set(projects.map((p) => p.root)));
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(roots));
  }, [projects, projectsHydrated]);

  useEffect(() => {
    if (!projectsHydrated) return;
    if (typeof localStorage === "undefined") return;
    if (activeProjectRoot) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, activeProjectRoot);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT);
    }
  }, [activeProjectRoot, projectsHydrated]);

  async function refreshRuns(projectRoot: string) {
    try {
      const list = await listRunsService({ projectRoot });
      setRuns(list);
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadArtifacts(projectRoot: string, runId: string) {
    try {
      const list = await getArtifactsService({ projectRoot, runId });
      setArtifacts(list);
      setActiveArtifactRelPath(null);
      setArtifactText(null);
      return list;
    } catch (e) {
      setError(String(e));
      return [];
    }
  }

  async function refreshActiveJobs() {
    try {
      const list = await listActiveJobsService();
      setActiveJobs(list);
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshKernel(projectRoot: string) {
    try {
      const snap = await kernelSnapshotService({ projectRoot, limitEvents: 200 });
      setKernelSnapshot(snap);
      if (snap.issues.length > 0) {
        setKernelSelectedIssueId((prev) => {
          if (prev && snap.issues.some((i) => i.id === prev)) return prev;
          return snap.issues[0].id;
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function initBeads() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    try {
      await beadsInitService(activeProject.root);
      await refreshKernel(activeProject.root);
    } catch (e) {
      setError(String(e));
    }
  }

  async function createIssue() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    const title = newIssueTitle.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }
    try {
      const tags = parseTagsInput(newIssueTags);
      const created = await createIssueService({
        projectRoot: activeProject.root,
        title,
        description: newIssueDescription.trim() ? newIssueDescription.trim() : null,
        tags: tags.length ? tags : null,
        dkPriority: newIssuePriority || null,
        dkRisk: newIssueRisk || null,
        dkSize: newIssueSize || null,
        dkToolHint: newIssueToolHint.trim() ? newIssueToolHint.trim() : null,
      });
      setIsCreateIssueOpen(false);
      setNewIssueTitle("");
      setNewIssueDescription("");
      setNewIssueTags("");
      setKernelSelectedIssueId(created.id);
      await refreshKernel(activeProject.root);
    } catch (e) {
      setError(String(e));
    }
  }

  async function updateIssue(issueId: string, patch: BeadsIssuePatch) {
    if (!activeProject) return;
    try {
      await updateIssueService({ projectRoot: activeProject.root, issueId, ...patch });
      await refreshKernel(activeProject.root);
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleIssueTag(issue: BeadsIssue, tag: string) {
    const tags = new Set(issue.tags ?? []);
    if (tags.has(tag)) tags.delete(tag);
    else tags.add(tag);
    await updateIssue(issue.id, { tags: Array.from(tags).sort() });
  }

  async function setIssueStatus(issueId: string, status: string) {
    await updateIssue(issueId, { status });
  }

  async function setIssueToolHint(issueId: string, tool: string | null) {
    await updateIssue(issueId, { dkToolHint: tool });
  }

  async function restartIssue(issue: BeadsIssue) {
    const nextTags = stripEscalationTags(issue.tags);
    await updateIssue(issue.id, {
      status: "ready",
      dkAttempts: 0,
      tags: nextTags,
    });
  }

  function addChat(role: ChatMessage["role"], text: string) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);
    setChatMessages((prev) => [...prev, { id, role, text, ts: Date.now() }]);
  }

  function parseChatMeta(tokens: string[]) {
    const tags: string[] = [];
    let dkPriority: string | null = null;
    let dkRisk: string | null = null;
    let dkSize: string | null = null;
    let dkToolHint: string | null = null;

    const titleTokens: string[] = [];
    for (const token of tokens) {
      if (token.startsWith("#") && token.length > 1) {
        tags.push(token.slice(1));
        continue;
      }
      if (/^p[0-3]$/i.test(token)) {
        dkPriority = token.toUpperCase();
        continue;
      }
      const toolMatch = token.match(/^tool:(.+)$/i);
      if (toolMatch) {
        dkToolHint = toolMatch[1].trim();
        continue;
      }
      const riskMatch = token.match(/^risk:(.+)$/i);
      if (riskMatch) {
        dkRisk = riskMatch[1].trim();
        continue;
      }
      const sizeMatch = token.match(/^size:(xs|s|m|l|xl)$/i);
      if (sizeMatch) {
        dkSize = sizeMatch[1].toUpperCase();
        continue;
      }
      titleTokens.push(token);
    }

    return { tags, dkPriority, dkRisk, dkSize, dkToolHint, title: titleTokens.join(" ") };
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    addChat("user", text);

    if (!activeProject) {
      addChat("system", "Select a project first.");
      return;
    }

    const lower = text.toLowerCase();

    // kernel watch/once/stop
    const kernelMatch = lower.match(/^kernel\\s+(once|watch|stop)\\b/);
    if (kernelMatch) {
      const mode = kernelMatch[1];
      if (mode === "once") {
        await kernelRunOnce();
        addChat("system", "Started: cyntra run --once");
        return;
      }
      if (mode === "watch") {
        await kernelRunWatch();
        addChat("system", "Started: cyntra run --watch");
        return;
      }
      if (mode === "stop") {
        await kernelStop();
        addChat("system", "Sent kill to active job (if any).");
        return;
      }
    }

    // run issue <id>
    const runIssueMatch = lower.match(/^run\\s+issue\\s+(\\d+)\\b/);
    if (runIssueMatch) {
      await kernelRunIssueOnce(runIssueMatch[1]);
      addChat("system", `Started: cyntra run --once --issue ${runIssueMatch[1]}`);
      return;
    }

    // issue <id> <status>
    const issueStatusMatch = lower.match(
      /^issue\\s+(\\d+)\\s+(open|ready|blocked|done|running)\\b/
    );
    if (issueStatusMatch) {
      const [, id, status] = issueStatusMatch;
      await setIssueStatus(id, status);
      addChat("system", `Updated issue ${id}: status=${status}`);
      return;
    }

    // tool <id> <toolchain>
    const toolMatch = lower.match(/^tool\\s+(\\d+)\\s+(codex|claude|opencode|crush|none)\\b/);
    if (toolMatch) {
      const [, id, tool] = toolMatch;
      await setIssueToolHint(id, tool === "none" ? null : tool);
      addChat("system", `Updated issue ${id}: dk_tool_hint=${tool}`);
      return;
    }

    // create <title...> (supports #tags p1 risk:high size:L tool:codex)
    const createMatch = text.match(/^(create|new)\\s+(.+)$/i);
    if (createMatch) {
      const rest = createMatch[2].trim();
      const tokens = rest.split(/\\s+/g);
      const meta = parseChatMeta(tokens);
      const title = meta.title.trim();
      if (!title) {
        addChat("system", "Create failed: missing title.");
        return;
      }
      try {
        const created = await createIssueService({
          projectRoot: activeProject.root,
          title,
          description: null,
          tags: meta.tags.length ? meta.tags : null,
          dkPriority: meta.dkPriority,
          dkRisk: meta.dkRisk,
          dkSize: meta.dkSize,
          dkToolHint: meta.dkToolHint,
        });
        setKernelSelectedIssueId(created.id);
        await refreshKernel(activeProject.root);
        addChat("system", `Created issue ${created.id}: ${created.title}`);
      } catch (e) {
        addChat("system", `Create failed: ${String(e)}`);
      }
      return;
    }

    addChat(
      "system",
      "Try: `create <title> #tag ...`, `issue <id> done`, `tool <id> codex`, `kernel watch`, `run issue <id>`."
    );
  }

  async function kernelInit() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    setNewRunLabel("cyntra_init");
    setNewRunCommand("cyntra init");
    setIsNewRunOpen(true);
  }

  async function kernelRunOnce() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    try {
      const job = await startJobService({
        projectRoot: activeProject.root,
        command: "cyntra run --once",
        label: "cyntra_once",
      });
      setKernelJobId(job.jobId);
      setKernelRunId(job.runId);
      setJobOutputs((prev) => ({ ...prev, [job.runId]: "" }));
      setJobExitCodes((prev) => ({ ...prev, [job.runId]: null }));
      await refreshActiveJobs();
      await refreshKernel(activeProject.root);
    } catch (e) {
      setError(String(e));
    }
  }

  async function kernelRunWatch() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    try {
      const job = await startJobService({
        projectRoot: activeProject.root,
        command: "cyntra run --watch",
        label: "cyntra_watch",
      });
      setKernelJobId(job.jobId);
      setKernelRunId(job.runId);
      setJobOutputs((prev) => ({ ...prev, [job.runId]: "" }));
      setJobExitCodes((prev) => ({ ...prev, [job.runId]: null }));
      await refreshActiveJobs();
      await refreshKernel(activeProject.root);
    } catch (e) {
      setError(String(e));
    }
  }

  async function kernelStop() {
    if (!kernelJobId) return;
    try {
      await killJobService(kernelJobId);
      await refreshActiveJobs();
    } catch (e) {
      setError(String(e));
    }
  }

  async function kernelRunIssueOnce(issueId: string) {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    try {
      const job = await startJobService({
        projectRoot: activeProject.root,
        command: `cyntra run --once --issue ${issueId}`,
        label: `cyntra_issue_${issueId}`,
      });
      setKernelJobId(job.jobId);
      setKernelRunId(job.runId);
      setJobOutputs((prev) => ({ ...prev, [job.runId]: "" }));
      setJobExitCodes((prev) => ({ ...prev, [job.runId]: null }));
      await refreshActiveJobs();
      await refreshKernel(activeProject.root);
      setNav("runs");
      setActiveRunId(job.runId);
      await refreshRuns(activeProject.root);
      await loadArtifacts(activeProject.root, job.runId);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const list = await listPtyService();
        setSessions(list);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    (async () => {
      const unlistenOutput = await listen<{ session_id: string; data: string }>(
        "pty_output",
        (event) => {
          if (event.payload.session_id !== activeSessionId) return;
          xtermRef.current?.write(event.payload.data);
        }
      );
      unsubs.push(unlistenOutput);

      const unlistenExit = await listen<{
        session_id: string;
        exit_code: number | null;
      }>("pty_exit", (event) => {
        setSessions((prev) => prev.filter((s) => s.id !== event.payload.session_id));
        setActiveSessionId((prev) => (prev === event.payload.session_id ? null : prev));
      });
      unsubs.push(unlistenExit);
    })();

    return () => {
      for (const u of unsubs) u();
    };
  }, [activeSessionId]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    (async () => {
      const unlistenOutput = await listen<{ job_id: string; run_id: string; data: string }>(
        "job_output",
        (event) => {
          const { run_id, data } = event.payload;
          const cleaned = stripAnsi(data);
          setJobOutputs((prev) => ({ ...prev, [run_id]: (prev[run_id] ?? "") + cleaned }));
        }
      );
      unsubs.push(unlistenOutput);

      const unlistenExit = await listen<{
        job_id: string;
        run_id: string;
        exit_code: number | null;
      }>("job_exit", async (event) => {
        const { run_id, exit_code } = event.payload;
        setJobExitCodes((prev) => ({ ...prev, [run_id]: exit_code }));
        if (activeProject) {
          await refreshRuns(activeProject.root);
          if (activeRunId === run_id) {
            await loadArtifacts(activeProject.root, run_id);
          }
        }
      });
      unsubs.push(unlistenExit);
    })();

    return () => {
      for (const u of unsubs) u();
    };
  }, [activeProject, activeRunId]);

  useEffect(() => {
    if (nav !== "terminals") return;
    if (!terminalRef.current) return;

    terminalRef.current.innerHTML = "";

    if (!xtermRef.current) {
      const term = new Terminal({
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 13,
        cursorBlink: true,
        convertEol: true,
        theme: {
          background: "#0b0d10",
          foreground: "rgba(255,255,255,0.9)",
          cursor: "rgba(212,165,116,0.95)",
          selectionBackground: "rgba(212,165,116,0.25)",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(terminalRef.current);
      fit.fit();
      term.onData((data) => {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) return;
        writePtyService({ sessionId, data }).catch((e) => setError(String(e)));
      });
      xtermRef.current = term;
      fitRef.current = fit;
      term.focus();
    } else {
      xtermRef.current.open(terminalRef.current);
      fitRef.current?.fit();
      xtermRef.current.focus();
    }

    const term = xtermRef.current;
    const fit = fitRef.current;
    const onResize = () => {
      fit?.fit();
      if (!term) return;
      const cols = term.cols;
      const rows = term.rows;
      if (activeSessionId) {
        resizePtyService({ sessionId: activeSessionId, cols, rows }).catch(() => {});
      }
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [nav, activeSessionId]);

  useEffect(() => {
    if (nav !== "terminals") return;
    if (!xtermRef.current) return;
    xtermRef.current.reset();
    xtermRef.current.writeln(
      activeSessionId
        ? `Connected to session ${activeSessionId}`
        : "Select or create a terminal session"
    );
    xtermRef.current.focus();
  }, [nav, activeSessionId]);

  async function setActiveProjectWithInfo(root: string, info: ProjectInfo | null) {
    setActiveProjectRoot(root);
    try {
      await setServerRootsService({ viewerDir: info?.viewer_dir ?? null, projectRoot: root });
      await refreshRuns(root);
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveGlobalEnv() {
    setGlobalEnvSaving(true);
    try {
      await setGlobalEnvService(globalEnvText);
      setGlobalEnvLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setGlobalEnvSaving(false);
    }
  }

  async function clearGlobalEnv() {
    setGlobalEnvSaving(true);
    try {
      await clearGlobalEnvService();
      setGlobalEnvText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setGlobalEnvSaving(false);
    }
  }

  async function confirmAddProject() {
    const root = newProjectPath.trim();
    if (!root) {
      setError("Project path is required.");
      return;
    }

    try {
      const info = await detectProjectService(root);
      setProjects((prev) => {
        const exists = prev.some((p) => p.root === info.root);
        return exists ? prev : [...prev, info];
      });
      await setActiveProjectWithInfo(info.root, info);
      setIsAddProjectOpen(false);
      setNewProjectPath("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function setActiveProject(root: string) {
    const info = projects.find((p) => p.root === root) ?? null;
    await setActiveProjectWithInfo(root, info);
  }

  async function bootstrapCyntraKernel() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    if (!activeProject.cyntra_kernel_dir) {
      setError("This project does not contain `kernel/`.");
      return;
    }
    setNewRunLabel("bootstrap_cyntra_kernel");
    setNewRunCommand(
      [
        "set -e",
        "mkdir -p .cyntra",
        "[ -x .cyntra/venv/bin/python ] || python3 -m venv .cyntra/venv",
        "source .cyntra/venv/bin/activate",
        "python -m pip install -U pip",
        'python -m pip install -e "kernel[dev]"',
      ].join(" && ")
    );
    setIsNewRunOpen(true);
  }

  async function createTerminalAt(cwd: string | null) {
    const cols = xtermRef.current?.cols ?? 120;
    const rows = xtermRef.current?.rows ?? 34;
    try {
      const id = await createPtyService({ cwd, cols, rows });
      const list = await listPtyService();
      setSessions(list);
      setActiveSessionId(id);
      setNav("terminals");
    } catch (e) {
      setError(String(e));
    }
  }

  async function createTerminal() {
    await createTerminalAt(activeProject?.root ?? null);
  }

  async function killTerminal(sessionId: string) {
    try {
      await killPtyService(sessionId);
    } catch (e) {
      setError(String(e));
    }
  }

  const activeArtifactUrl = useMemo(() => {
    if (!serverInfo) return null;
    if (!activeArtifact) return null;
    return `${serverInfo.base_url}${activeArtifact.url}`;
  }, [serverInfo, activeArtifact]);

  async function confirmStartRun() {
    if (!activeProject) {
      setError("Select a project first.");
      return;
    }
    const command = newRunCommand.trim();
    if (!command) {
      setError("Command is required.");
      return;
    }

    try {
      const job = await startJobService({
        projectRoot: activeProject.root,
        command,
        label: newRunLabel.trim() ? newRunLabel.trim() : null,
      });
      setJobOutputs((prev) => ({ ...prev, [job.runId]: "" }));
      setJobExitCodes((prev) => ({ ...prev, [job.runId]: null }));
      setActiveRunId(job.runId);
      setNav("runs");
      await refreshRuns(activeProject.root);
      await loadArtifacts(activeProject.root, job.runId);
      setIsNewRunOpen(false);
      setNewRunLabel("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function selectRun(runId: string) {
    setActiveRunId(runId);
    setActiveArtifactRelPath(null);
    setArtifactText(null);
    if (activeProject) {
      return await loadArtifacts(activeProject.root, runId);
    }
    return [];
  }

  async function selectArtifact(relPath: string, artifactList?: ArtifactInfo[]) {
    setActiveArtifactRelPath(relPath);
    setArtifactText(null);
    const artifact = (artifactList ?? artifacts).find((a) => a.relPath === relPath) ?? null;
    if (!artifact || !serverInfo) return;
    if (artifact.kind !== "json" && artifact.kind !== "text" && artifact.kind !== "html") return;
    try {
      const url = `${serverInfo.base_url}${artifact.url}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      const cleanedText = stripAnsi(text);
      if (artifact.kind === "json") {
        try {
          setArtifactText(JSON.stringify(JSON.parse(text), null, 2));
          return;
        } catch {
          // fall through
        }
      }
      setArtifactText(cleanedText);
    } catch (e) {
      setError(String(e));
    }
  }

  const kernelIssues = useMemo(() => kernelSnapshot?.issues ?? [], [kernelSnapshot]);
  const kernelWorkcells = useMemo(() => kernelSnapshot?.workcells ?? [], [kernelSnapshot]);
  // Merge polled events with streamed events, prefer streamed for real-time updates
  const kernelEvents = useMemo(() => {
    const polledEvents = kernelSnapshot?.events ?? [];
    if (streamedEvents.length === 0) return polledEvents;

    // Merge and deduplicate, sorted by timestamp (newest last)
    const all = [...polledEvents, ...streamedEvents];
    const seen = new Set<string>();
    const deduped = all.filter((e) => {
      const key = `${e.timestamp}-${e.type}-${e.issueId ?? ""}-${e.workcellId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      return ta.localeCompare(tb);
    });
  }, [kernelSnapshot, streamedEvents]);
  const visibleKernelEvents = useMemo(() => {
    if (!kernelEventsForSelectedIssue) return kernelEvents;
    if (!kernelSelectedIssueId) return kernelEvents;
    return kernelEvents.filter((e) => e.issueId === kernelSelectedIssueId);
  }, [kernelEvents, kernelEventsForSelectedIssue, kernelSelectedIssueId]);

  const kernelCounts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let ready = 0;
    for (const issue of kernelIssues) {
      byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
      if (issue.ready) ready += 1;
    }
    return { byStatus, total: kernelIssues.length, ready };
  }, [kernelIssues]);

  const selectedIssueWorkcells = useMemo(() => {
    if (!kernelSelectedIssueId) return [];
    return kernelWorkcells.filter((w) => w.issueId === kernelSelectedIssueId);
  }, [kernelWorkcells, kernelSelectedIssueId]);

  const filteredKernelIssues = useMemo(() => {
    const q = kernelFilter.trim().toLowerCase();
    return kernelIssues
      .filter((i) => {
        if (!q) return true;
        return (
          i.id.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .filter((i) => (kernelOnlyReady ? i.ready : true))
      .filter((i) => {
        if (!kernelOnlyActiveIssues) return true;
        return kernelWorkcells.some((w) => w.issueId === i.id);
      });
  }, [kernelIssues, kernelWorkcells, kernelFilter, kernelOnlyReady, kernelOnlyActiveIssues]);

  useEffect(() => {
    if (nav !== "kernel") return;
    if (!activeProjectRoot) return;
    refreshKernel(activeProjectRoot);
    refreshActiveJobs();
  }, [nav, activeProjectRoot]);

  useInterval(
    () => {
      if (nav !== "kernel") return;
      if (!activeProject) return;
      refreshKernel(activeProject.root);
      refreshActiveJobs();
    },
    // Increase polling interval since events stream in real-time
    nav === "kernel" && activeProject ? 5000 : null
  );

  // Real-time event streaming via file watcher
  const handleStreamedEvents = useEventStreamCallback((events: KernelEvent[]) => {
    setStreamedEvents((prev) => {
      // Deduplicate by timestamp+type, keep last 500 events
      const newEvents = [...prev, ...events];
      const seen = new Set<string>();
      const deduped = newEvents.filter((e) => {
        const key = `${e.timestamp}-${e.type}-${e.issueId ?? ""}-${e.workcellId ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return deduped.slice(-500);
    });
  });

  // Only enable streaming when on kernel page with active project
  const streamProjectRoot = nav === "kernel" && activeProject ? activeProject.root : null;
  useKernelEventStream(streamProjectRoot, handleStreamedEvents);

  // Clear streamed events when project changes
  useEffect(() => {
    setStreamedEvents([]);
  }, [activeProjectRoot]);

  // Derive kernel state from active jobs
  const kernelState = useMemo(() => {
    if (!kernelJobId) return "idle" as const;
    const isActive = activeJobs.some((j) => j.jobId === kernelJobId);
    return isActive ? ("running" as const) : ("idle" as const);
  }, [kernelJobId, activeJobs]);

  // Command palette items - use sigil icons for navigation
  const commandPaletteItems = [
    {
      id: "nav-universe",
      type: "navigation" as const,
      title: "Go to Universe",
      icon: "cosmograph",
      isSigil: true,
      action: () => setNav("universe"),
    },
    {
      id: "nav-kernel",
      type: "navigation" as const,
      title: "Go to Kernel",
      icon: "hexcore",
      isSigil: true,
      action: () => setNav("kernel"),
    },
    {
      id: "nav-workflows",
      type: "navigation" as const,
      title: "Go to Workflows",
      icon: "flow",
      isSigil: true,
      action: () => setNav("workflows"),
    },
    {
      id: "nav-evolution",
      type: "navigation" as const,
      title: "Go to Evolution",
      icon: "helix",
      isSigil: true,
      action: () => setNav("evolution"),
    },
    {
      id: "nav-memory",
      type: "navigation" as const,
      title: "Go to Memory",
      icon: "neuron",
      isSigil: true,
      action: () => setNav("memory"),
    },
    {
      id: "nav-search",
      type: "navigation" as const,
      title: "Go to Search",
      icon: "search",
      isSigil: true,
      action: () => setNav("search"),
    },
    {
      id: "nav-terminals",
      type: "navigation" as const,
      title: "Go to Terminals",
      icon: "prompt",
      isSigil: true,
      action: () => setNav("terminals"),
    },
    {
      id: "nav-gallery",
      type: "navigation" as const,
      title: "Go to Gallery",
      icon: "aperture",
      isSigil: true,
      action: () => setNav("gallery"),
    },
    {
      id: "nav-stage",
      type: "navigation" as const,
      title: "Go to Stage",
      icon: "stage",
      isSigil: true,
      action: () => setNav("stage"),
    },
    {
      id: "nav-projects",
      type: "navigation" as const,
      title: "Go to Projects",
      icon: "cog",
      isSigil: true,
      action: () => setNav("projects"),
    },
    {
      id: "kernel-once",
      type: "command" as const,
      title: "Kernel: Run Once",
      action: () => kernelRunOnce(),
    },
    {
      id: "kernel-watch",
      type: "command" as const,
      title: "Kernel: Run Watch",
      action: () => kernelRunWatch(),
    },
    {
      id: "kernel-stop",
      type: "command" as const,
      title: "Kernel: Stop",
      action: () => kernelStop(),
    },
    {
      id: "new-terminal",
      type: "command" as const,
      title: "New Terminal",
      action: () => {
        createTerminal();
        setNav("terminals");
      },
    },
    {
      id: "new-issue",
      type: "command" as const,
      title: "Create Issue",
      action: () => setIsCreateIssueOpen(true),
    },
    {
      id: "add-project",
      type: "command" as const,
      title: "Add Project",
      action: () => setIsAddProjectOpen(true),
    },
  ];

  return (
    <>
      {/* PCB substrate background - renders behind all UI */}
      <PcbAmbientLayer performance="medium" />

      <MainLayout
        nav={nav}
        onNavChange={setNav}
        serverInfo={serverInfo}
        kernelSnapshot={kernelSnapshot}
        kernelState={kernelState}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      >
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        {/* New Mission Control views */}
        {nav === "universe" && (
          <HomeWorldBuilderView
            projectRoot={activeProject?.root}
            onNavigateToWorld={(_worldId) => {
              // Navigate to evolution view with this world
              setNav("evolution");
              // TODO: Pass worldId to EvolutionLabView via state
            }}
          />
        )}

        {nav === "evolution" && <EvolutionLabView activeProject={activeProject} />}

        {nav === "memory" && <MemoryAtlasView activeProject={activeProject} />}

        {nav === "search" && (
          <SearchView
            activeProject={activeProject}
            onOpenRun={async (runId) => {
              if (!activeProject) {
                setError("Select a project first.");
                return;
              }
              setNav("runs");
              await refreshRuns(activeProject.root);
              await selectRun(runId);
            }}
            onOpenRunArtifact={async (runId, relPath) => {
              if (!activeProject) {
                setError("Select a project first.");
                return;
              }
              setNav("runs");
              await refreshRuns(activeProject.root);
              const loaded = await selectRun(runId);
              await selectArtifact(relPath, loaded);
            }}
          />
        )}

        {nav === "gallery" && <GalleryView2 activeProject={activeProject} />}

        {nav === "stage" && (
          <StageView
            activeProject={activeProject}
            serverInfo={serverInfo}
            initialWorldId={activeWorldId}
            onWorldSelected={setActiveWorldId}
            onNavigate={(n) => setNav(n)}
          />
        )}

        {nav === "gameplay" && (
          <GameplayProvider>
            <GameplayView
              worldPath={
                activeProject?.root
                  ? `${activeProject.root}/fab/worlds/${activeWorldId ?? "outora_library"}`
                  : undefined
              }
              onNavigate={(n) => setNav(n as Nav)}
            />
          </GameplayProvider>
        )}

        {/* Legacy views */}
        {nav === "projects" && (
          <ProjectsView
            projects={projects}
            activeProjectRoot={activeProjectRoot}
            activeProject={activeProject}
            globalEnvText={globalEnvText}
            globalEnvLoaded={globalEnvLoaded}
            globalEnvSaving={globalEnvSaving}
            setNewProjectPath={setNewProjectPath}
            setIsAddProjectOpen={setIsAddProjectOpen}
            setActiveProject={setActiveProject}
            setGlobalEnvText={setGlobalEnvText}
            saveGlobalEnv={saveGlobalEnv}
            clearGlobalEnv={clearGlobalEnv}
            createTerminal={createTerminal}
            bootstrapCyntraKernel={bootstrapCyntraKernel}
          />
        )}

        {nav === "runs" && (
          <RunsView
            activeProject={activeProject}
            runs={runs}
            activeRunId={activeRunId}
            activeRun={activeRun}
            artifacts={artifacts}
            activeArtifactRelPath={activeArtifactRelPath}
            activeArtifact={activeArtifact}
            activeArtifactUrl={activeArtifactUrl}
            artifactText={artifactText}
            jobExitCodes={jobExitCodes}
            jobOutputs={jobOutputs}
            serverInfo={serverInfo}
            setNewRunCommand={setNewRunCommand}
            setNewRunLabel={setNewRunLabel}
            setIsNewRunOpen={setIsNewRunOpen}
            refreshRuns={refreshRuns}
            selectRun={selectRun}
            selectArtifact={selectArtifact}
          />
        )}

        {nav === "kernel" && (
          <KernelView
            activeProject={activeProject}
            serverInfo={serverInfo}
            kernelSnapshot={kernelSnapshot}
            kernelCounts={kernelCounts}
            kernelWorkcells={kernelWorkcells}
            filteredKernelIssues={filteredKernelIssues}
            kernelSelectedIssueId={kernelSelectedIssueId}
            selectedKernelIssue={selectedKernelIssue}
            selectedIssueWorkcells={selectedIssueWorkcells}
            kernelFilter={kernelFilter}
            setKernelFilter={setKernelFilter}
            kernelOnlyReady={kernelOnlyReady}
            setKernelOnlyReady={setKernelOnlyReady}
            kernelOnlyActiveIssues={kernelOnlyActiveIssues}
            setKernelOnlyActiveIssues={setKernelOnlyActiveIssues}
            setKernelSelectedIssueId={setKernelSelectedIssueId}
            visibleKernelEvents={visibleKernelEvents}
            kernelEventsForSelectedIssue={kernelEventsForSelectedIssue}
            setKernelEventsForSelectedIssue={setKernelEventsForSelectedIssue}
            kernelRunId={kernelRunId}
            kernelJobId={kernelJobId}
            activeJobs={activeJobs}
            jobOutputs={jobOutputs}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            setSelectedWorkcellId={setSelectedWorkcellId}
            refreshKernel={refreshKernel}
            initBeads={initBeads}
            setNewIssueTitle={setNewIssueTitle}
            setNewIssueDescription={setNewIssueDescription}
            setNewIssueTags={setNewIssueTags}
            setNewIssuePriority={setNewIssuePriority}
            setNewIssueToolHint={setNewIssueToolHint}
            setNewIssueRisk={setNewIssueRisk}
            setNewIssueSize={setNewIssueSize}
            setIsCreateIssueOpen={setIsCreateIssueOpen}
            kernelInit={kernelInit}
            kernelRunOnce={kernelRunOnce}
            kernelRunWatch={kernelRunWatch}
            kernelStop={kernelStop}
            setIssueStatus={setIssueStatus}
            kernelRunIssueOnce={kernelRunIssueOnce}
            restartIssue={restartIssue}
            createTerminalAt={createTerminalAt}
            setIssueToolHint={setIssueToolHint}
            toggleIssueTag={toggleIssueTag}
            sendChat={sendChat}
          />
        )}

        {nav === "workflows" && <WorkflowsView activeProject={activeProject} />}

        {nav === "terminals" && (
          <TerminalsView
            sessions={sessions}
            activeSessionId={activeSessionId}
            activeSession={activeSession}
            terminalRef={terminalRef}
            setActiveSessionId={setActiveSessionId}
            createTerminal={createTerminal}
            killTerminal={killTerminal}
          />
        )}

        {nav === "viewer" && <ViewerView serverInfo={serverInfo} activeProject={activeProject} />}

        {nav === "immersa" && <ImmersaView serverInfo={serverInfo} activeProject={activeProject} />}
      </MainLayout>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={commandPaletteItems}
      />

      {/* Modals */}
      <AddProjectModal
        isOpen={isAddProjectOpen}
        newProjectPath={newProjectPath}
        setNewProjectPath={setNewProjectPath}
        onClose={() => setIsAddProjectOpen(false)}
        onConfirm={confirmAddProject}
      />

      <NewRunModal
        isOpen={isNewRunOpen}
        newRunCommand={newRunCommand}
        newRunLabel={newRunLabel}
        setNewRunCommand={setNewRunCommand}
        setNewRunLabel={setNewRunLabel}
        onClose={() => setIsNewRunOpen(false)}
        onConfirm={confirmStartRun}
      />

      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        newIssueTitle={newIssueTitle}
        newIssueDescription={newIssueDescription}
        newIssueTags={newIssueTags}
        newIssueTagSet={newIssueTagSet}
        newIssuePriority={newIssuePriority}
        newIssueToolHint={newIssueToolHint}
        newIssueRisk={newIssueRisk}
        newIssueSize={newIssueSize}
        setNewIssueTitle={setNewIssueTitle}
        setNewIssueDescription={setNewIssueDescription}
        setNewIssueTags={setNewIssueTags}
        setNewIssuePriority={setNewIssuePriority}
        setNewIssueToolHint={setNewIssueToolHint}
        setNewIssueRisk={setNewIssueRisk}
        setNewIssueSize={setNewIssueSize}
        parseTagsInput={parseTagsInput}
        onClose={() => setIsCreateIssueOpen(false)}
        onCreate={createIssue}
      />

      {selectedWorkcellId && activeProject && (
        <WorkcellDetail
          projectRoot={activeProject.root}
          workcellId={selectedWorkcellId}
          onClose={() => setSelectedWorkcellId(null)}
        />
      )}

      <ViewportDevPanel />
    </>
  );
}
