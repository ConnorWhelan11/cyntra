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

    // Motion
    prefersReducedMotion,
  } = useWorldBuilder({ projectRoot });

  // Stream kernel events while a build is active (for real-time status/progress)
  const handleKernelStreamEvents = useEventStreamCallback(processKernelEvents);
  useKernelEventStream(activeWorldBuild && projectRoot ? projectRoot : null, handleKernelStreamEvents);

  // Handle world creation
  const handleCreateWorld = useCallback(async () => {
    const issueId = await createWorld();
    if (issueId && projectRoot) {
      // Start the kernel build job
      await startWorldBuild(issueId);
    }
  }, [createWorld, projectRoot, startWorldBuild]);

  const handleViewInEvolution = useCallback(() => {
    if (activeWorldBuild && onNavigateToWorld) onNavigateToWorld(activeWorldBuild.issueId);
  }, [activeWorldBuild, onNavigateToWorld]);

  const handleBackToBuilder = useCallback(() => {
    setPreviewMode("asset");
    dismissWorldBuild();
  }, [dismissWorldBuild]);

  // Handle resume from recent worlds row
  const handleResumeWorld = useCallback(
    (world: RecentWorld) => {
      if (onNavigateToWorld) {
        onNavigateToWorld(world.id);
      }
    },
    [onNavigateToWorld]
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
        <WorldBuilderConsole
          promptText={promptText}
          onPromptChange={setPromptText}
          onFocusChange={setConsoleFocused}
          onSubmit={handleCreateWorld}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          submitState={submitState}
          submitError={submitError}
          prefersReducedMotion={prefersReducedMotion}
          blueprint={blueprintDraft}
          onBlueprintChange={updateBlueprint}
        />
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
    </div>
  );
}

export default HomeWorldBuilderView;
