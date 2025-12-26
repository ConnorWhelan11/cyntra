/**
 * HomeWorldBuilderView - World Builder Console Layout
 *
 * Single-column hero layout with ChatGPT-style prompt console.
 * Templates and Recent Worlds are secondary, below the fold.
 * PCB Quantum Field as living backdrop.
 *
 * When a world build is active, shows BuildingConsole instead.
 */

import React, { useCallback, useRef, useEffect, useState } from "react";
import { WorldBuilderConsole } from "./WorldBuilderConsole";
import { TemplateGallery } from "./TemplateGallery";
import { RecentWorldsRow } from "./RecentWorldsRow";
import { BuildingConsole } from "./BuildingConsole";
import { useWorldBuilder } from "./useWorldBuilder";
import { useEventStreamCallback, useKernelEventStream } from "@/hooks";
import type { RecentWorld, PreviewMode } from "@/types";
import type { FieldBus } from "@quantum-field";
import { AddProjectModal } from "@/components/modals";
import { Button } from "@/components/ui/Button";
import { detectProject, setServerRoots } from "@/services";
import { STORAGE_KEYS } from "@/utils";

function readStoredActiveProjectRoot(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const root = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
    return root && root.trim().length > 0 ? root : null;
  } catch {
    return null;
  }
}

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

interface HomeWorldBuilderViewProps {
  /** Project root for kernel integration */
  projectRoot?: string | null;
  /** Callback when navigating to a world */
  onNavigateToWorld?: (worldId: string) => void;
  /** Callback to open fork modal */
  onOpenForkModal?: () => void;
  /** Callback to open import modal */
  onOpenImportModal?: () => void;
  /** Optional FieldBus for PCB integration */
  fieldBus?: FieldBus;
}

export function HomeWorldBuilderView({
  projectRoot,
  onNavigateToWorld,
  onOpenForkModal: _onOpenForkModal,
  onOpenImportModal: _onOpenImportModal,
  fieldBus,
}: HomeWorldBuilderViewProps) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("asset");
  const [storedProjectRoot, setStoredProjectRoot] = useState<string | null>(() =>
    projectRoot ?? readStoredActiveProjectRoot()
  );
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  const effectiveProjectRoot = projectRoot ?? storedProjectRoot;

  const {
    // Console
    promptText,
    setPromptText,
    consoleFocused,
    setConsoleFocused,

    // Blueprint
    blueprintDraft,
    updateBlueprint,

    // Template
    selectedTemplateId,
    selectTemplate,
    templates,

    // Recent worlds
    recentWorlds,
    removeRecentWorld,
    openRecentWorld,

    // Submit
    submitState,
    submitError,
    createWorld,
    isSubmitting,
    canSubmit,

    // Active build
    activeWorldBuild,
    startWorldBuild,
    cancelWorldBuild,
    dismissWorldBuild,
    pauseWorldBuild,
    resumeWorldBuild,
    retryWorldBuild,
    queueRefinement,
    applyRefinementNow,
    processKernelEvents,

    // Playtest
    runPlaytest,

    // Motion
    prefersReducedMotion,
  } = useWorldBuilder({ projectRoot: effectiveProjectRoot });

  // Stream kernel events while a build is active (for real-time status/progress)
  const handleKernelStreamEvents = useEventStreamCallback(processKernelEvents);
  useKernelEventStream(
    activeWorldBuild && effectiveProjectRoot ? effectiveProjectRoot : null,
    handleKernelStreamEvents
  );

  useEffect(() => {
    if (projectRoot && projectRoot !== storedProjectRoot) {
      setStoredProjectRoot(projectRoot);
    }
  }, [projectRoot, storedProjectRoot]);

  const handleOpenAddProject = useCallback(() => {
    setProjectError(null);
    setNewProjectPath("");
    setIsAddProjectOpen(true);
  }, []);

  const handleConfirmProject = useCallback(async () => {
    const root = newProjectPath.trim();
    if (!root) {
      setProjectError("Project path is required.");
      return;
    }

    try {
      const info = await detectProject(root);
      if (typeof localStorage !== "undefined") {
        const storedRoots = readStoredProjectRoots();
        const nextRoots = Array.from(new Set([info.root, ...storedRoots]));
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(nextRoots));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, info.root);
      }
      await setServerRoots({
        viewerDir: info.viewer_dir ?? null,
        projectRoot: info.root,
      });
      setStoredProjectRoot(info.root);
      setProjectError(null);
      setIsAddProjectOpen(false);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    }
  }, [newProjectPath]);

  // Handle world creation
  const handleCreateWorld = useCallback(async () => {
    if (!effectiveProjectRoot) {
      setProjectError("Select an active project before starting a build.");
      setIsAddProjectOpen(true);
      return;
    }

    const issueId = await createWorld();
    if (issueId && effectiveProjectRoot) {
      // Start the kernel build job
      await startWorldBuild(issueId);
    }
  }, [createWorld, effectiveProjectRoot, startWorldBuild]);

  const handleViewInEvolution = useCallback(() => {
    if (activeWorldBuild && onNavigateToWorld) onNavigateToWorld(activeWorldBuild.issueId);
  }, [activeWorldBuild, onNavigateToWorld]);

  const handleBackToBuilder = useCallback(() => {
    setPreviewMode("asset");
    dismissWorldBuild();
  }, [dismissWorldBuild]);

  // Handle resume from recent worlds row
  const handleResumeWorld = useCallback(
    async (world: RecentWorld) => {
      if (!effectiveProjectRoot) {
        setProjectError("Select an active project before starting a build.");
        setIsAddProjectOpen(true);
        return;
      }
      await openRecentWorld(world);
    },
    [effectiveProjectRoot, openRecentWorld]
  );

  // Emit burst event to PCB on submit
  useEffect(() => {
    if (submitState === "submitting" && fieldBus && consoleRef.current) {
      const rect = consoleRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      fieldBus.emit({
        kind: "burst",
        id: "world-console-submit",
        clientX: centerX,
        clientY: centerY,
        amplitude: 1.0,
        radius: 0.15,
        ts: Date.now(),
      });
    }
  }, [submitState, fieldBus]);

  // If there's an active build, show the BuildingConsole (including complete/failed)
  if (activeWorldBuild) {
    return (
      <BuildingConsole
        buildState={activeWorldBuild}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        onCancel={cancelWorldBuild}
        onDismiss={handleBackToBuilder}
        onPause={pauseWorldBuild}
        onResume={resumeWorldBuild}
        onRetry={retryWorldBuild}
        onViewInEvolution={handleViewInEvolution}
        onQueueRefinement={queueRefinement}
        onApplyRefinementNow={applyRefinementNow}
        onRunPlaytest={runPlaytest}
      />
    );
  }

  return (
    <div
      className={`home-world-builder ${consoleFocused ? "console-focused" : ""}`}
      data-submit-state={submitState}
    >
      {/* Hero Section - Single Column Centered */}
      <section ref={consoleRef} className="home-hero">
        <div className="home-hero-stack">
          {!effectiveProjectRoot && (
            <div className="shell-session-error home-project-alert" role="alert">
              <div className="home-project-alert-title">No active project selected.</div>
              <div className="home-project-alert-text">
                Add a repo root to enable kernel builds and create beads issues.
              </div>
              <div className="home-project-alert-actions">
                <Button variant="primary" onClick={handleOpenAddProject}>
                  Set project root
                </Button>
              </div>
              {projectError && (
                <div className="home-project-alert-error">{projectError}</div>
              )}
            </div>
          )}
          <WorldBuilderConsole
            promptText={promptText}
            onPromptChange={setPromptText}
            onFocusChange={setConsoleFocused}
            onSubmit={handleCreateWorld}
            isSubmitting={isSubmitting}
            canSubmit={canSubmit && Boolean(effectiveProjectRoot)}
            submitState={submitState}
            submitError={submitError}
            prefersReducedMotion={prefersReducedMotion}
            blueprint={blueprintDraft}
            onBlueprintChange={updateBlueprint}
          />
        </div>
      </section>

      {/* Templates Section - Secondary, below hero */}
      <section className="home-templates">
        <TemplateGallery
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={selectTemplate}
          disabled={isSubmitting}
        />
      </section>

      {/* Recent Worlds Section - Secondary, below templates */}
      {recentWorlds.length > 0 && (
        <section className="home-recents">
          <RecentWorldsRow
            worlds={recentWorlds}
            onResume={handleResumeWorld}
            onRemove={removeRecentWorld}
          />
        </section>
      )}

      <AddProjectModal
        isOpen={isAddProjectOpen}
        newProjectPath={newProjectPath}
        setNewProjectPath={setNewProjectPath}
        onClose={() => setIsAddProjectOpen(false)}
        onConfirm={handleConfirmProject}
      />
    </div>
  );
}

export default HomeWorldBuilderView;
