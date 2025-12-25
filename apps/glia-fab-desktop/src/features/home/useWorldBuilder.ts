/**
 * useWorldBuilder - State management hook for World Builder Console
 *
 * Manages prompt text, blueprint configuration, template selection,
 * submission lifecycle, and active world builds with kernel integration.
 */

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import type {
  BlueprintDraft,
  WorldBuilderMode,
  WorldSubmitState,
  WorldTemplate,
  RecentWorld,
  WorldBuildState,
  WorldBuildStatus,
  AgentState,
  BuildEvent,
  RefinementMessage,
  KernelEvent,
} from "@/types";
import { WORLD_TEMPLATES } from "./templates";
import { createIssue } from "@/services/kernelService";
import { startJob, killJob } from "@/services/runService";

const STORAGE_KEY_RECENT_WORLDS = "cyntra:recent-worlds";
const MAX_RECENT_WORLDS = 8;

/** Default blueprint configuration */
const DEFAULT_BLUEPRINT: BlueprintDraft = {
  name: "",
  runtime: "three",
  outputs: ["viewer"],
  gates: [],
  tags: [],
};

/** Hook configuration */
export interface UseWorldBuilderConfig {
  /** Project root for kernel integration */
  projectRoot?: string | null;
  /** Callback when kernel events arrive for active build */
  onKernelEvents?: (events: KernelEvent[]) => void;
}

/** Generate issue tags from blueprint */
function blueprintToTags(blueprint: BlueprintDraft): string[] {
  const tags: string[] = [];

  // Asset type
  tags.push("asset:world");

  // Runtime
  tags.push(`runtime:${blueprint.runtime}`);

  // Outputs
  blueprint.outputs.forEach((output) => tags.push(`output:${output}`));

  // Gates
  tags.push("gate:fab-realism");
  if (blueprint.runtime === "godot" || blueprint.runtime === "hybrid") {
    tags.push("gate:godot");
  }
  blueprint.gates.forEach((gate) => {
    if (!tags.includes(`gate:${gate}`)) {
      tags.push(`gate:${gate}`);
    }
  });

  // User tags
  blueprint.tags.forEach((tag) => {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  });

  return tags;
}

/** Create initial build state */
function createInitialBuildState(
  issueId: string,
  prompt: string,
  blueprint: BlueprintDraft
): WorldBuildState {
  return {
    issueId,
    status: "queued",
    prompt,
    blueprint,
    isSpeculating: false,
    agents: [],
    generation: 0,
    bestFitness: 0,
    refinements: [],
    startedAt: Date.now(),
  };
}

/** Map kernel event to build status */
function eventToBuildStatus(eventType: string): WorldBuildStatus | null {
  const mapping: Record<string, WorldBuildStatus> = {
    "schedule.computed": "scheduling",
    "workcell.created": "generating",
    "fab.stage.generate": "generating",
    "fab.stage.render": "rendering",
    "fab.stage.critics": "critiquing",
    "fab.stage.repair": "repairing",
    "fab.stage.godot": "exporting",
    "speculate.voting": "voting",
    "issue.completed": "complete",
    "issue.failed": "failed",
  };
  return mapping[eventType] ?? null;
}

/** Load recent worlds from localStorage */
function loadRecentWorlds(): RecentWorld[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_WORLDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Save recent worlds to localStorage */
function saveRecentWorlds(worlds: RecentWorld[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_RECENT_WORLDS, JSON.stringify(worlds.slice(0, MAX_RECENT_WORLDS)));
  } catch {
    // Ignore storage errors
  }
}

export interface WorldBuilderState {
  // Mode
  builderMode: WorldBuilderMode;
  setBuilderMode: (mode: WorldBuilderMode) => void;

  // Console
  promptText: string;
  setPromptText: (text: string) => void;
  consoleFocused: boolean;
  setConsoleFocused: (focused: boolean) => void;

  // Blueprint
  blueprintDraft: BlueprintDraft;
  updateBlueprint: (partial: Partial<BlueprintDraft>) => void;
  resetBlueprint: () => void;

  // Template
  selectedTemplateId: string | null;
  selectedTemplate: WorldTemplate | null;
  selectTemplate: (id: string | null) => void;
  templates: WorldTemplate[];

  // Recent worlds
  recentWorlds: RecentWorld[];
  addRecentWorld: (world: RecentWorld) => void;
  removeRecentWorld: (id: string) => void;
  updateRecentWorld: (id: string, update: Partial<RecentWorld>) => void;
  mostRecentWorld: RecentWorld | null;

  // Fork source
  forkSourceId: string | null;
  setForkSourceId: (id: string | null) => void;

  // Submit
  submitState: WorldSubmitState;
  submitError: string | null;
  createWorld: () => Promise<string | null>;
  resetSubmitState: () => void;

  // Active Build State
  activeWorldBuild: WorldBuildState | null;
  isBuilding: boolean;
  startWorldBuild: (
    issueId: string,
    init?: { prompt?: string; blueprint?: BlueprintDraft; recentName?: string }
  ) => Promise<void>;
  cancelWorldBuild: () => Promise<void>;
  dismissWorldBuild: () => void;
  pauseWorldBuild: () => Promise<void>;
  resumeWorldBuild: () => Promise<void>;
  retryWorldBuild: () => Promise<void>;
  processKernelEvents: (events: KernelEvent[]) => void;

  // Refinements
  queueRefinement: (text: string) => Promise<void>;
  applyRefinementNow: (refinementId: string) => Promise<void>;

  // Motion
  prefersReducedMotion: boolean;

  // Computed
  canSubmit: boolean;
  isSubmitting: boolean;
  hasKernelIntegration: boolean;
}

export function useWorldBuilder(config: UseWorldBuilderConfig = {}): WorldBuilderState {
  const { projectRoot, onKernelEvents } = config;

  // Mode
  const [builderMode, setBuilderMode] = useState<WorldBuilderMode>("scratch");

  // Console
  const [promptText, setPromptText] = useState("");
  const [consoleFocused, setConsoleFocused] = useState(false);

  // Blueprint
  const [blueprintDraft, setBlueprintDraft] = useState<BlueprintDraft>(DEFAULT_BLUEPRINT);

  // Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Recent worlds
  const [recentWorlds, setRecentWorlds] = useState<RecentWorld[]>([]);

  // Fork source
  const [forkSourceId, setForkSourceId] = useState<string | null>(null);

  // Submit
  const [submitState, setSubmitState] = useState<WorldSubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Active build state
  const [activeWorldBuild, setActiveWorldBuild] = useState<WorldBuildState | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const activeIssueIdRef = useRef<string | null>(null);

  // Motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    return mediaQuery?.matches ?? false;
  }, []);

  // Kernel integration available
  const hasKernelIntegration = Boolean(projectRoot);

  // Load recent worlds on mount
  useEffect(() => {
    setRecentWorlds(loadRecentWorlds());
  }, []);

  // Keep active issue ref in sync (avoids stale closure in event handlers)
  useEffect(() => {
    activeIssueIdRef.current = activeWorldBuild?.issueId ?? null;
  }, [activeWorldBuild?.issueId]);

  // Derived: selected template
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return WORLD_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null;
  }, [selectedTemplateId]);

  // Derived: most recent world
  const mostRecentWorld = useMemo(() => {
    if (recentWorlds.length === 0) return null;
    return recentWorlds.reduce((latest, current) =>
      current.updatedAt > latest.updatedAt ? current : latest
    );
  }, [recentWorlds]);

  // Update blueprint
  const updateBlueprint = useCallback((partial: Partial<BlueprintDraft>) => {
    setBlueprintDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  // Reset blueprint
  const resetBlueprint = useCallback(() => {
    setBlueprintDraft(DEFAULT_BLUEPRINT);
  }, []);

  // Select template
  const selectTemplate = useCallback((id: string | null) => {
    setSelectedTemplateId(id);

    if (id) {
      const template = WORLD_TEMPLATES.find((t) => t.id === id);
      if (template) {
        setPromptText(template.promptText);
        setBlueprintDraft({
          name: "", // User can override
          ...template.blueprintDefaults,
        });
        setBuilderMode("template");
      }
    } else {
      // Clear template selection
      setBuilderMode("scratch");
    }
  }, []);

  // Add recent world
  const addRecentWorld = useCallback((world: RecentWorld) => {
    setRecentWorlds((prev) => {
      const filtered = prev.filter((w) => w.id !== world.id);
      const updated = [world, ...filtered].slice(0, MAX_RECENT_WORLDS);
      saveRecentWorlds(updated);
      return updated;
    });
  }, []);

  // Update recent world
  const updateRecentWorld = useCallback((id: string, update: Partial<RecentWorld>) => {
    setRecentWorlds((prev) => {
      const updated = prev.map((w) =>
        w.id === id ? { ...w, ...update, updatedAt: Date.now() } : w
      );
      saveRecentWorlds(updated);
      return updated;
    });
  }, []);

  // Remove recent world
  const removeRecentWorld = useCallback((id: string) => {
    setRecentWorlds((prev) => {
      const updated = prev.filter((w) => w.id !== id);
      saveRecentWorlds(updated);
      return updated;
    });
  }, []);

  const upsertRecentWorld = useCallback(
    (world: RecentWorld) => {
      setRecentWorlds((prev) => {
        const existing = prev.find((w) => w.id === world.id);
        if (!existing) {
          const updated = [world, ...prev].slice(0, MAX_RECENT_WORLDS);
          saveRecentWorlds(updated);
          return updated;
        }
        const merged = prev.map((w) =>
          w.id === world.id ? { ...w, ...world, updatedAt: Date.now() } : w
        );
        saveRecentWorlds(merged);
        return merged;
      });
    },
    []
  );

  const stopActiveJob = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    activeJobIdRef.current = null;
    if (!jobId) return;
    try {
      await killJob(jobId);
    } catch (error) {
      console.error("Failed to kill job:", error);
    }
  }, []);

  // Create world - with real kernel integration when projectRoot available
  const createWorld = useCallback(async (): Promise<string | null> => {
    if (!promptText.trim()) {
      setSubmitError("Please describe your world");
      return null;
    }

    setSubmitState("submitting");
    setSubmitError(null);

    const worldName = blueprintDraft.name || `World ${Date.now().toString(36).slice(-6)}`;

    try {
      // If kernel integration available, create real issue
      if (projectRoot) {
        const tags = blueprintToTags(blueprintDraft);

        const issue = await createIssue({
          projectRoot,
          title: worldName,
          description: promptText,
          tags,
          dkPriority: "P1",
          dkRisk: "high", // Triggers speculation for high-risk
          dkSize: "M",
          dkToolHint: null, // Let routing decide
        });

        // Add to recent worlds with real issue ID
        addRecentWorld({
          id: issue.id,
          name: worldName,
          status: "building",
          lastPrompt: promptText,
          updatedAt: Date.now(),
        });

        // Initialize build state
        setActiveWorldBuild(createInitialBuildState(issue.id, promptText, blueprintDraft));

        setSubmitState("success");
        // Reset submit state after brief success flash (so user can start another build)
        setTimeout(() => setSubmitState("idle"), 900);
        return issue.id;
      } else {
        // Fallback: mock mode when no project root
        await new Promise((resolve) => setTimeout(resolve, 800));

        const worldId = `world-${Date.now().toString(36)}`;

        addRecentWorld({
          id: worldId,
          name: worldName,
          status: "building",
          lastPrompt: promptText,
          updatedAt: Date.now(),
        });

        // Create mock build state
        setActiveWorldBuild(createInitialBuildState(worldId, promptText, blueprintDraft));

        setSubmitState("success");

        // Reset after brief delay
        setTimeout(() => setSubmitState("idle"), 900);

        return worldId;
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create world");
      setSubmitState("error");
      return null;
    }
  }, [promptText, blueprintDraft, projectRoot, addRecentWorld]);

  // Start world build - kicks off kernel job after issue created
  const startWorldBuild = useCallback(async (
    issueId: string,
    init?: { prompt?: string; blueprint?: BlueprintDraft; recentName?: string }
  ) => {
    if (!projectRoot) {
      console.warn("Cannot start world build without projectRoot");
      return;
    }

    try {
      // Ensure we have an active build state for this issue (refinements may start a different issue)
      setActiveWorldBuild((prev) => {
        if (prev && prev.issueId === issueId) return prev;
        const nextPrompt = init?.prompt ?? promptText;
        const nextBlueprint = init?.blueprint ?? blueprintDraft;
        return createInitialBuildState(issueId, nextPrompt, nextBlueprint);
      });

      // Ensure issue shows up in recents even if started via refinement
      if (init?.recentName) {
        upsertRecentWorld({
          id: issueId,
          name: init.recentName,
          status: "building",
          lastPrompt: init?.prompt ?? promptText,
          updatedAt: Date.now(),
        });
      }

      const jobInfo = await startJob({
        projectRoot,
        command: `cyntra run --once --issue ${issueId}`,
        label: `Build World ${issueId}`,
      });

      activeJobIdRef.current = jobInfo.jobId;

      // Update build state with run info
      setActiveWorldBuild((prev) =>
        prev && prev.issueId === issueId
          ? { ...prev, runId: jobInfo.runId, status: "scheduling", error: undefined }
          : prev
      );
    } catch (error) {
      console.error("Failed to start world build:", error);
      setActiveWorldBuild((prev) =>
        prev && prev.issueId === issueId
          ? {
              ...prev,
              status: "failed",
              error: error instanceof Error ? error.message : "Failed to start build",
            }
          : prev
      );
    }
  }, [projectRoot, promptText, blueprintDraft, upsertRecentWorld]);

  // Cancel world build (user intent: stop and return to builder)
  const cancelWorldBuild = useCallback(async () => {
    await stopActiveJob();

    // Update recent world status
    if (activeWorldBuild) {
      updateRecentWorld(activeWorldBuild.issueId, {
        status: "canceled",
        lastRunOutcome: null,
      });
    }

    // Clear build state
    setActiveWorldBuild(null);
    setSubmitState("idle");
  }, [activeWorldBuild, stopActiveJob, updateRecentWorld]);

  // Dismiss build UI without changing recent-world status (used after complete/failed)
  const dismissWorldBuild = useCallback(() => {
    activeJobIdRef.current = null;
    setActiveWorldBuild(null);
    setSubmitState("idle");
  }, []);

  // Pause world build (best-effort stop; can be resumed/retried)
  const pauseWorldBuild = useCallback(async () => {
    if (!activeWorldBuild) return;
    await stopActiveJob();
    setActiveWorldBuild((prev) => (prev ? { ...prev, status: "paused" } : null));
    updateRecentWorld(activeWorldBuild.issueId, { status: "paused", lastRunOutcome: null });
  }, [activeWorldBuild, stopActiveJob, updateRecentWorld]);

  const resetBuildForRestart = useCallback((build: WorldBuildState): WorldBuildState => {
    return {
      ...createInitialBuildState(build.issueId, build.prompt, build.blueprint),
      refinements: build.refinements,
    };
  }, []);

  const resumeWorldBuild = useCallback(async () => {
    if (!activeWorldBuild || activeWorldBuild.status !== "paused") return;
    if (!projectRoot) return;

    const issueId = activeWorldBuild.issueId;
    const { prompt, blueprint } = activeWorldBuild;

    setActiveWorldBuild(resetBuildForRestart(activeWorldBuild));
    updateRecentWorld(issueId, { status: "building", lastRunOutcome: null });
    await startWorldBuild(issueId, { prompt, blueprint });
  }, [activeWorldBuild, projectRoot, resetBuildForRestart, startWorldBuild, updateRecentWorld]);

  const retryWorldBuild = useCallback(async () => {
    if (!activeWorldBuild || activeWorldBuild.status !== "failed") return;
    if (!projectRoot) return;

    const issueId = activeWorldBuild.issueId;
    const { prompt, blueprint } = activeWorldBuild;

    setActiveWorldBuild(resetBuildForRestart(activeWorldBuild));
    updateRecentWorld(issueId, { status: "building", lastRunOutcome: null });
    await startWorldBuild(issueId, { prompt, blueprint });
  }, [activeWorldBuild, projectRoot, resetBuildForRestart, startWorldBuild, updateRecentWorld]);

  // Process kernel events for active build
  const processKernelEvents = useCallback((events: KernelEvent[]) => {
    const activeIssueId = activeIssueIdRef.current;
    if (!activeIssueId) return;

    const relevantEvents = events.filter((e) => e.issueId === activeIssueId);
    if (relevantEvents.length === 0) return;

    onKernelEvents?.(relevantEvents);

    // Update build state based on events
    setActiveWorldBuild((prev) => {
      if (!prev || prev.issueId !== activeIssueId) return prev;

      let updated = { ...prev };

      for (const event of relevantEvents) {
        // Update status
        const newStatus = eventToBuildStatus(event.type);
        if (newStatus) {
          updated.status = newStatus;
        }

        // Track workcells (agents)
        if (event.type === "workcell.created" && event.workcellId) {
          const toolchain = (event.data as { toolchain?: string })?.toolchain ?? "claude";
          const newAgent: AgentState = {
            id: event.workcellId,
            toolchain: toolchain as AgentState["toolchain"],
            status: "running",
            fitness: 0,
            events: [],
          };

          // Check if speculating
          const isSpeculating = updated.agents.length > 0 ||
            event.workcellId.includes("spec-");

          updated = {
            ...updated,
            isSpeculating,
            agents: [...updated.agents, newAgent],
          };
        }

        // Update agent fitness
        if (event.type === "fab.critic.result" && event.workcellId) {
          const fitness = (event.data as { fitness?: number })?.fitness ?? 0;
          updated.agents = updated.agents.map((agent) =>
            agent.id === event.workcellId
              ? { ...agent, fitness }
              : agent
          );

          // Update best fitness
          const bestFitness = Math.max(
            updated.bestFitness,
            ...updated.agents.map((a) => a.fitness)
          );
          updated.bestFitness = bestFitness;

          // Update leading agent
          const leadingAgent = updated.agents.reduce((best, agent) =>
            agent.fitness > best.fitness ? agent : best
          );
          updated.leadingAgentId = leadingAgent.id;
        }

        // Handle completion
        if (event.type === "issue.completed") {
          updated.status = "complete";
          updated.completedAt = Date.now();
          activeJobIdRef.current = null;

          // Update recent world
          updateRecentWorld(prev.issueId, {
            status: "complete",
            fitness: updated.bestFitness,
            generation: updated.generation,
            lastRunOutcome: "pass",
          });
        }

        // Handle failure
        if (event.type === "issue.failed") {
          updated.status = "failed";
          updated.error = (event.data as { error?: string })?.error ?? "Build failed";
          activeJobIdRef.current = null;

          updateRecentWorld(prev.issueId, {
            status: "failed",
            lastRunOutcome: "fail",
          });
        }

        // Track generation increments
        if (event.type === "fab.iteration.complete") {
          updated.generation = (updated.generation ?? 0) + 1;
        }

        // Update current stage
        if (event.type.startsWith("fab.stage.")) {
          updated.currentStage = event.type.replace("fab.stage.", "");
        }

        // Add event to agent log
        if (event.workcellId) {
          // Update agent stage if applicable
          if (event.type.startsWith("fab.stage.")) {
            const stage = event.type.replace("fab.stage.", "");
            updated.agents = updated.agents.map((agent) =>
              agent.id === event.workcellId ? { ...agent, currentStage: stage } : agent
            );
          }

          const buildEvent: BuildEvent = {
            id: `${event.type}-${Date.now()}`,
            agentId: event.workcellId,
            type: event.type.includes("error") ? "error" :
                  event.type.includes("critic") ? "critic" :
                  event.type.includes("vote") ? "vote" : "agent",
            message: event.type,
            timestamp: event.timestamp ? new Date(event.timestamp).getTime() : Date.now(),
            metadata: event.data as Record<string, unknown>,
          };

          updated.agents = updated.agents.map((agent) =>
            agent.id === event.workcellId
              ? { ...agent, events: [...agent.events, buildEvent] }
              : agent
          );
        }

        // Opportunistically pick up preview URLs from event payloads
        if (event.data && typeof event.data === "object") {
          const data = event.data as Record<string, unknown>;
          const glbUrl =
            (typeof data.previewGlbUrl === "string" && data.previewGlbUrl) ||
            (typeof data.glbUrl === "string" && data.glbUrl) ||
            (typeof data.glb_url === "string" && data.glb_url) ||
            null;
          const godotUrl =
            (typeof data.previewGodotUrl === "string" && data.previewGodotUrl) ||
            (typeof data.godotUrl === "string" && data.godotUrl) ||
            (typeof data.godot_url === "string" && data.godot_url) ||
            null;
          if (glbUrl) updated.previewGlbUrl = glbUrl;
          if (godotUrl) updated.previewGodotUrl = godotUrl;
        }
      }

      return updated;
    });
  }, [onKernelEvents, updateRecentWorld]);

  // Queue refinement for next iteration
  const queueRefinement = useCallback(async (text: string) => {
    if (!activeWorldBuild || !projectRoot) return;

    const refinement: RefinementMessage = {
      id: `ref-${Date.now()}`,
      text,
      timestamp: Date.now(),
      status: "pending",
    };

    // Create child issue for refinement
    try {
      const description = `${activeWorldBuild.prompt}\n\nRefinement: ${text}`;
      const issue = await createIssue({
        projectRoot,
        title: `Refine: ${text.slice(0, 50)}${text.length > 50 ? "..." : ""}`,
        description,
        tags: [...blueprintToTags(activeWorldBuild.blueprint), "refinement"],
        dkPriority: "P1",
        dkRisk: "medium",
        dkSize: "S",
        dkToolHint: null,
      });

      // Update refinement with issue ID
      setActiveWorldBuild((prev) =>
        prev
          ? {
              ...prev,
              refinements: [
                ...prev.refinements,
                { ...refinement, issueId: issue.id, status: "queued", issueTitle: issue.title },
              ],
            }
          : null
      );
    } catch (error) {
      console.error("Failed to create refinement issue:", error);
    }
  }, [activeWorldBuild, projectRoot]);

  // Apply refinement immediately (interrupt current work)
  const applyRefinementNow = useCallback(async (refinementId: string) => {
    if (!activeWorldBuild) return;

    const refinement = activeWorldBuild.refinements.find((r) => r.id === refinementId);
    if (!refinement) return;
    if (!refinement.issueId) return;

    // Interrupt current build (best-effort) and mark current issue as canceled (not failed)
    await stopActiveJob();
    updateRecentWorld(activeWorldBuild.issueId, { status: "canceled", lastRunOutcome: null });

    // Mark refinement as applying (so it disappears from the queue)
    setActiveWorldBuild((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        refinements: prev.refinements.map((r) =>
          r.id === refinementId ? { ...r, status: "applying" } : r
        ),
      };
    });

    // Start new build for the refinement issue
    if (projectRoot) {
      const combinedPrompt = `${activeWorldBuild.prompt}\n\nRefinement: ${refinement.text}`;
      const recentName = refinement.issueTitle ?? `Refine: ${refinement.text.slice(0, 50)}`;

      setActiveWorldBuild(
        createInitialBuildState(refinement.issueId, combinedPrompt, activeWorldBuild.blueprint)
      );

      upsertRecentWorld({
        id: refinement.issueId,
        name: recentName,
        status: "building",
        lastPrompt: combinedPrompt,
        updatedAt: Date.now(),
      });

      await startWorldBuild(refinement.issueId, {
        prompt: combinedPrompt,
        blueprint: activeWorldBuild.blueprint,
        recentName,
      });
    }
  }, [activeWorldBuild, projectRoot, startWorldBuild, stopActiveJob, updateRecentWorld, upsertRecentWorld]);

  // Reset submit state
  const resetSubmitState = useCallback(() => {
    setSubmitState("idle");
    setSubmitError(null);
  }, []);

  // Computed: can submit
  const canSubmit = useMemo(() => {
    return promptText.trim().length > 0 && submitState === "idle";
  }, [promptText, submitState]);

  // Computed: is submitting
  const isSubmitting = submitState === "submitting";

  // Computed: is building
  const isBuilding = Boolean(
    activeWorldBuild &&
    activeWorldBuild.status !== "complete" &&
    activeWorldBuild.status !== "failed"
  );

  return {
    // Mode
    builderMode,
    setBuilderMode,

    // Console
    promptText,
    setPromptText,
    consoleFocused,
    setConsoleFocused,

    // Blueprint
    blueprintDraft,
    updateBlueprint,
    resetBlueprint,

    // Template
    selectedTemplateId,
    selectedTemplate,
    selectTemplate,
    templates: WORLD_TEMPLATES,

    // Recent worlds
    recentWorlds,
    addRecentWorld,
    removeRecentWorld,
    updateRecentWorld,
    mostRecentWorld,

    // Fork source
    forkSourceId,
    setForkSourceId,

    // Submit
    submitState,
    submitError,
    createWorld,
    resetSubmitState,

    // Active Build State
    activeWorldBuild,
    isBuilding,
    startWorldBuild,
    cancelWorldBuild,
    dismissWorldBuild,
    pauseWorldBuild,
    resumeWorldBuild,
    retryWorldBuild,
    processKernelEvents,

    // Refinements
    queueRefinement,
    applyRefinementNow,

    // Motion
    prefersReducedMotion,

    // Computed
    canSubmit,
    isSubmitting,
    hasKernelIntegration,
  };
}
