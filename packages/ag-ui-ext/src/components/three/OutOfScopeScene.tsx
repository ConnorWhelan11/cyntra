"use client";

import { cn } from "@/lib/utils";
import { Scroll, ScrollControls, Stars, useScroll } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import React, {
  cloneElement,
  isValidElement,
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { ScopeBox, type ScopeBoxProps } from "./ScopeBox/ScopeBox";

interface SceneRigProps {
  onSectionChange?: (section: number) => void;
  sceneContent?: ReactNode;
  pages?: number;
  htmlPortal?: React.RefObject<HTMLElement | null>;
  scopeBoxProps?: Partial<ScopeBoxProps>;
}

const SceneRig = ({
  onSectionChange,
  sceneContent,
  pages = 4,
  htmlPortal,
  scopeBoxProps = {},
}: SceneRigProps) => {
  const scroll = useScroll();
  const lastSection = useRef(0);
  const [currentPhase, setCurrentPhase] = useState(0);
  const target = useRef(new THREE.Vector3(0, 0, 8));

  useFrame((state) => {
    const offset = scroll.offset;
    // Map offset (0..1) to total scrollable sections (pages - 1)
    const scrollableSections = Math.max(1, pages - 1);
    const progress = offset * scrollableSections;
    const section = Math.min(Math.floor(progress), scrollableSections);

    if (lastSection.current !== section) {
      lastSection.current = section;
      setCurrentPhase(section);
      onSectionChange?.(section);
    }

    const t = state.clock.elapsedTime;

    // Base path: only move in x/z, keep y = 0 so the box stays vertically centered
    let camX = 0;
    let camZ = 8;

    if (progress < 1) {
      // Phase 0: close-up - pushed back and shifted right to clear HUD
      camX = 0;
      camZ = 10;
    } else if (progress < 2) {
      // Phase 1: slight strafe / pull back
      const p = progress - 1;
      camX = -2 + 2.8 * p; // Move from -2 to 0.8
      camZ = 14 - 6 * p + 1.2 * p; // Move from 14 to ~9.2? No, let's re-plan the transition.
      // Previous: 8 -> 9.2.
      // New start: 14.
      // If we want to keep the "zoom in" effect or just stay back?
      // "Pushed back" implies it should stay back.
      // Let's keep it further back throughout.

      // Let's try keeping the offset +6 relative to original.
      // Original P1: 8 -> 9.2 (delta +1.2).
      // New P1: 14 -> 15.2.

      camX = -2 + 2.8 * p; // -2 -> 0.8 (Transitions to original P1 end of 0.8)
      camZ = 14 + 1.2 * p;
    } else if (progress < 3) {
      // Phase 2: a bit further back + more angle
      const p = progress - 2;
      camX = 0.8 + 0.7 * p;
      camZ = 15.2 + 1.3 * p; // 15.2 -> 16.5
    } else {
      // Phase 3+: wide shot, recenter x
      const p = progress - 3;
      camX = 1.5 - 1.5 * p;
      camZ = 16.5 + 3 * p;
    }

    // Gentle breathing – only in x/z, no vertical drift
    camX += Math.sin(t * 0.15) * 0.1;
    camZ += Math.cos(t * 0.12) * 0.2;

    const vec = target.current;
    vec.set(camX, 0, camZ); // <- y locked to 0

    state.camera.position.lerp(vec, 0.08);
    state.camera.lookAt(0, 0, 0);
  });

  // Inject currentPhase and htmlPortal into sceneContent
  const content = isValidElement(sceneContent)
    ? cloneElement(
        sceneContent as React.ReactElement,
        {
          phase: currentPhase,
          htmlPortal,
          ...scopeBoxProps,
        } as Partial<ScopeBoxProps>
      )
    : sceneContent;

  return (
    <>
      <Stars radius={100} depth={60} count={2500} factor={4} saturation={0} fade speed={0.4} />
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} color="#00f0ff" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#f000ff" />
      {content ?? (
        <ScopeBox
          showNodes
          phase={currentPhase}
          htmlPortal={htmlPortal}
          enableIntro
          {...scopeBoxProps}
        />
      )}
    </>
  );
};

interface OutOfScopeSceneProps {
  className?: string;
  pages?: number;
  onSectionChange?: (section: number) => void;
  children?: ReactNode; // optional HTML overlay
  sceneContent?: ReactNode; // optional R3F content to render instead of default ScopeBox
  showPurpose?: boolean;
  showLegend?: boolean;
  pinToViewport?: boolean; // if true, fixes canvas to viewport; if false, fills parent
  scopeBoxProps?: Partial<ScopeBoxProps>;
}

export const OutOfScopeScene = ({
  className,
  pages = 4,
  onSectionChange,
  children,
  sceneContent,
  showPurpose = true,
  showLegend = true,
  pinToViewport = true,
  scopeBoxProps = {},
}: OutOfScopeSceneProps) => {
  const htmlContainerRef = useRef<HTMLDivElement>(null);
  const htmlPortalRef = useRef<HTMLDivElement>(null);
  const [measuredPages, setMeasuredPages] = useState<number>(pages);

  // Measure html content to sync ScrollControls pages with actual content height.
  useLayoutEffect(() => {
    if (!children || !htmlContainerRef.current) {
      setMeasuredPages(pages);
      return;
    }
    const el = htmlContainerRef.current;
    const updatePages = () => {
      const vh = window.innerHeight || 1;
      const nextPages = Math.max(pages, Math.ceil(el.scrollHeight / vh));
      setMeasuredPages(nextPages);
    };
    const ro = new ResizeObserver(updatePages);
    ro.observe(el);
    updatePages();
    window.addEventListener("resize", updatePages);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updatePages);
    };
  }, [children, pages]);

  const wrapperClass = pinToViewport
    ? "fixed inset-0 h-screen w-screen overflow-hidden"
    : "relative h-full w-full min-h-screen overflow-hidden";

  return (
    <div className={cn(wrapperClass, className)}>
      <Canvas
        className="absolute inset-0"
        camera={{ position: [-2, 0, 14], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <ScrollControls pages={measuredPages} damping={0.1}>
            <SceneRig
              onSectionChange={onSectionChange}
              sceneContent={sceneContent}
              pages={measuredPages}
              htmlPortal={htmlPortalRef}
              scopeBoxProps={scopeBoxProps}
            />
            {children && (
              <Scroll html>
                <div
                  ref={htmlContainerRef}
                  className="relative w-full"
                  style={{ minHeight: `${measuredPages * 100}vh` }}
                >
                  {children}
                </div>
              </Scroll>
            )}
          </ScrollControls>
        </Suspense>
      </Canvas>

      {/* Persistent UI Overlays */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Portal Target for 3D-attached HTML to avoid scroll transforms */}
        <div ref={htmlPortalRef} className="absolute inset-0" />

        {/* Top Left: Purpose */}
        {showPurpose && (
          <div className="absolute left-6 top-6 max-w-xs md:left-[100px] md:top-8">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">
              Out of Scope
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-white/30 font-mono">
              Documenting the entropy that exists outside the spec.
              <br />
              Scroll to traverse the boundary.
            </p>
          </div>
        )}

        {/* Bottom Left: Legend */}
        {showLegend && (
          <div className="absolute bottom-24 left-6 flex flex-col gap-2 md:left-[100px] md:bottom-24">
            <div className="text-[10px] uppercase tracking-widest text-white/20 mb-1">Legend</div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_cyan]" />
              <span className="text-[10px] text-white/50 font-mono">Spec / Happy Path</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-magenta-500 shadow-[0_0_5px_magenta]" />
              <span className="text-[10px] text-white/50 font-mono">Reality / User</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_5px_yellow]" />
              <span className="text-[10px] text-white/50 font-mono">Edge Case / Debt</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_emerald]" />
              <span className="text-[10px] text-white/50 font-mono">Critical / Bug</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
