import { Html, Line } from "@react-three/drei";
import { type RootState, type ThreeEvent, useFrame } from "@react-three/fiber";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GlitchText } from "../../atoms/GlitchText/GlitchText";
import { AnimatedNode } from "./AnimatedNode";
import { MissionButtons } from "./MissionButtons";
import { MissionIntroPanel } from "./MissionIntroPanel";
import type { ScopeBoxProps } from "./types";
import { useIntroSequence } from "./useIntroSequence";
import { generateChaosPosition } from "./utils";

export type { ScopeBoxProps };

// Animation constants
const CONTAINMENT_LERP_FACTOR = 0.03;
const BOX_SCALE_LERP_FACTOR = 0.1;
const NODE_ROTATION_SPEED_BASE = 0.002;
const NODE_ROTATION_SPEED_ACTIVE = 0.005;

export const ScopeBox = ({
  showNodes = true,
  onNodeClick,
  highlightedNodeId,
  phase = 0,
  htmlPortal,
  onCreateMission,
  onResumeMission,
  enableIntro = true,
  forceIntro = false,
  onIntroComplete,
  variant = "glia-premed",
}: ScopeBoxProps) => {
  const boxRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.Group>(null);
  const introOrbRef = useRef<THREE.Mesh | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Intro state management via hook
  const {
    currentStep,
    introPhase,
    advanceStep,
    orbActive,
    orbProgress,
    containmentProgress,
    stepStartTime,
    hasSeenIntro,
  } = useIntroSequence({
    variant,
    enableIntro,
    forceIntro,
    onIntroComplete,
  });

  // Chaos seed for node positions (stable across renders)
  const chaosSeed = useRef(Math.random() * 100);

  // Hover interaction state
  const [interactionState, setInteractionState] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const handleHoverStart = (e?: ThreeEvent<PointerEvent> | ReactMouseEvent) => {
    e?.stopPropagation?.();
    // Disable hover interactions during intro to prevent animation glitches
    if (introPhase !== "done") return;
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setInteractionState(true);
  };

  const handleHoverEnd = () => {
    // Disable hover interactions during intro to prevent animation glitches
    if (introPhase !== "done") return;
    hoverTimeout.current = setTimeout(() => {
      setInteractionState(false);
    }, 100);
  };

  const effectiveHover = isHovered || interactionState;

  // Animation Loop
  useFrame((state: RootState, delta: number) => {
    const t = state.clock.elapsedTime;

    // Initialize step start time
    if (stepStartTime.current === null) {
      stepStartTime.current = t;
    }

    const stepElapsed = (t - stepStartTime.current) * 1000; // ms

    // Handle "wait" type steps (automatic progression)
    if (currentStep.type === "wait" && currentStep.duration) {
      if (stepElapsed >= currentStep.duration) {
        advanceStep();
      }
    }

    // === CONTAINMENT PHYSICS ===
    const targetContainment = currentStep.containmentTarget;
    containmentProgress.current +=
      (targetContainment - containmentProgress.current) * CONTAINMENT_LERP_FACTOR;

    if (boxRef.current) {
      // Base rotation - gentle breathing
      let rotationY = Math.sin(t * 0.2) * 0.1;

      // Shake Physics
      const shakeIntensity = currentStep.shakeIntensity || 0;

      if (shakeIntensity > 0) {
        // Chaos Shake
        const chaosShake = (Math.sin(t * 8) * 0.02 + Math.cos(t * 13) * 0.015) * shakeIntensity;
        boxRef.current.position.x = chaosShake;
        boxRef.current.position.y = chaosShake * 0.5;
      } else if (phase === 2 && introPhase === "done") {
        // Scroll-phase 2 shake - only after intro complete
        const shake = Math.random() * 0.05;
        boxRef.current.position.x = shake;
        boxRef.current.position.y = shake;
        rotationY += shake;
      } else {
        boxRef.current.position.set(0, 0, 0);
      }

      // Scale effect on hover + containment pulse
      let targetScale = effectiveHover ? 1.03 : 1;

      // Pulse on containment completion
      if (introPhase === "done" && containmentProgress.current > 0.98) {
        const pulse = 1 + Math.sin(t * 2) * 0.01;
        targetScale *= pulse;
      }

      boxRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        BOX_SCALE_LERP_FACTOR
      );

      boxRef.current.rotation.y = rotationY;
    }

    // Node group rotation
    if (nodesRef.current) {
      if (introPhase === "done") {
        // Only rotate once intro is complete
        const rotSpeed = phase >= 1 ? NODE_ROTATION_SPEED_ACTIVE : NODE_ROTATION_SPEED_BASE;
        nodesRef.current.rotation.y += rotSpeed;
        nodesRef.current.rotation.z = Math.sin(t * 0.1) * 0.1;
      } else {
        // During intro: freeze global rotation, let individual nodes animate
        nodesRef.current.rotation.y = 0;
        nodesRef.current.rotation.z = 0;
      }
    }

    // Orb Animation Logic
    if (currentStep.type === "orb" && orbActive && introOrbRef.current) {
      const duration = 3;
      const next = Math.min(1, orbProgress.current + delta / duration);
      orbProgress.current = next;

      const start = new THREE.Vector3(-4.5, 1.2, 0.2);
      const end = new THREE.Vector3(0, 0, 0);

      // Ease-out cubic
      const p = next < 0.5 ? 4 * next * next * next : 1 - Math.pow(-2 * next + 2, 3) / 2;

      const current = new THREE.Vector3().lerpVectors(start, end, p);
      introOrbRef.current.position.copy(current);

      const dist = current.length();
      const pulse = 1 + (1 - Math.min(dist / 5, 1)) * 0.5;
      introOrbRef.current.scale.setScalar(pulse);

      if (next >= 1) {
        advanceStep();
      }
    }
  });

  // Generate nodes with narrative types + chaos positions
  const nodes = useMemo(() => {
    const items = [
      // Core nodes (always visible)
      { id: "cars", label: "CARS", color: "cyan", type: "Planned" },
      { id: "bio", label: "BIO", color: "cyan", type: "Foundation" },

      // Reality nodes (Phase 1+)
      { id: "orgo", label: "ORGO", color: "magenta", type: "Hacked" },
      { id: "psych", label: "PSYCH", color: "yellow", type: "Exploited" },
      { id: "soc", label: "SOC", color: "magenta", type: "Bodied" },

      // Leak nodes (Phase 2+)
      { id: "chem", label: "CHEM", color: "emerald", type: "Nuked" },
      { id: "aamc", label: "AAMC", color: "yellow", type: "deez" },
      { id: "mcat", label: "MCAT", color: "emerald", type: "Cooked" },

      // Expansion nodes (Phase 3+)
      { id: "md", label: "MD", color: "magenta", type: "Check" },
      { id: "do", label: "DO", color: "yellow", type: "Check" },
      { id: "phd", label: "PHD", color: "cyan", type: "Check" },
    ];

    const seed = chaosSeed.current;

    return items.map((item, i) => {
      // Spherical distribution for contained/orbital position
      const phi = Math.acos(-1 + (2 * i) / items.length);
      const theta = Math.sqrt(items.length * Math.PI) * phi;
      const radius = 3.5;

      const orbitalPos = new THREE.Vector3(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi)
      );

      // Generate chaos position (scattered far outside)
      const chaosPos = generateChaosPosition(i, seed);

      return {
        ...item,
        orbitalPos,
        chaosPos,
        initialPos: orbitalPos,
      };
    });
  }, []);

  const frameColor = "#4de0ff";

  return (
    <group>
      {/* Reticle Frame */}
      <group>
        <Line
          points={[
            [-2.4, -2.4, 0],
            [2.4, -2.4, 0],
            [2.4, 2.4, 0],
            [-2.4, 2.4, 0],
            [-2.4, -2.4, 0],
          ]}
          color={frameColor}
          transparent
          opacity={0.08}
          lineWidth={1}
        />
        <Line
          points={[
            [0, -2.6, 0],
            [0, 2.6, 0],
          ]}
          color={frameColor}
          transparent
          opacity={0.05}
          lineWidth={1}
        />
        <Line
          points={[
            [-2.6, 0, 0],
            [2.6, 0, 0],
          ]}
          color={frameColor}
          transparent
          opacity={0.05}
          lineWidth={1}
        />
      </group>

      {/* Main Scope Box */}
      <group ref={boxRef}>
        {/* Glass Slab Volume */}
        <mesh>
          <boxGeometry args={[2.8, 2.8, 2.8]} />
          <meshPhysicalMaterial
            color="#001524"
            roughness={0.1}
            metalness={0.1}
            transparent
            opacity={0.3}
            transmission={0.2}
            thickness={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Intro Orb */}
        {currentStep.type === "orb" && (
          <mesh ref={introOrbRef}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshBasicMaterial color="#00f0ff" transparent opacity={0.9} />
          </mesh>
        )}

        {/* Wireframe Box */}
        <mesh
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            // Disable hover during intro to prevent animation glitches
            if (introPhase !== "done") return;
            setIsHovered(true);
            document.body.style.cursor = "help";
          }}
          onPointerOut={() => {
            if (introPhase !== "done") return;
            setIsHovered(false);
            document.body.style.cursor = "auto";
          }}
        >
          <boxGeometry args={[3, 3, 3]} />
          <meshBasicMaterial
            color={effectiveHover || phase === 2 ? "#00f0ff" : "#ffffff"}
            wireframe
            transparent
            opacity={effectiveHover ? 0.3 : phase === 2 ? 0.4 : 0.15}
          />
        </mesh>

        {/* Interaction Zone & Hero UI */}
        <group>
          <mesh visible={false} onPointerOver={handleHoverStart} onPointerOut={handleHoverEnd}>
            <boxGeometry args={[1.8, 1.8, 1.8]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>

          <Html
            position={[0, -0.1, 0]}
            zIndexRange={[0, 0]}
            center
            transform
            sprite
            distanceFactor={14}
            portal={htmlPortal}
            className="pointer-events-none"
            occlude="blending"
          >
            <div
              className={`
                flex flex-col items-center justify-center pointer-events-auto origin-center
                ${
                  introPhase === "done"
                    ? "scale-[0.8] sm:scale-[0.9]"
                    : "scale-[0.4] sm:scale-[0.48] md:scale-[0.55] lg:scale-[0.6]"
                }
              `}
              onMouseEnter={() => handleHoverStart()}
              onMouseLeave={handleHoverEnd}
              data-intro-seen={hasSeenIntro ? "1" : "0"}
            >
              {currentStep.content?.showButtons ? (
                <MissionButtons
                  onCreateMission={onCreateMission}
                  onResumeMission={onResumeMission}
                  variant={variant}
                />
              ) : currentStep.type === "text" ? (
                <MissionIntroPanel step={currentStep} onStepComplete={() => advanceStep()} />
              ) : null}
            </div>
          </Html>
        </group>

        {/* Face Labels */}
        {phase === 0 && (
          <>
            <Html
              position={[0, 1.5, 0]}
              transform
              rotation={[-Math.PI / 2, 0, 0]}
              center
              portal={htmlPortal}
            >
              <div className="text-[6px] font-mono text-cyan-neon/40 tracking-[0.2em] pointer-events-none">
                ROADMAP/SPEC
              </div>
            </Html>
            <Html
              position={[0, -1.5, 0]}
              transform
              rotation={[Math.PI / 2, 0, 0]}
              center
              portal={htmlPortal}
            >
              <div className="text-[6px] font-mono text-cyan-neon/40 tracking-[0.2em] pointer-events-none">
                INFRASTRUCTURE
              </div>
            </Html>
            <Html
              position={[1.5, 0, 0]}
              transform
              rotation={[0, Math.PI / 2, 0]}
              center
              portal={htmlPortal}
            >
              <div className="text-[6px] font-mono text-cyan-neon/40 tracking-[0.2em] pointer-events-none">
                SYSTEM_BEHAVIOR
              </div>
            </Html>
            <Html
              position={[-1.5, 0, 0]}
              transform
              rotation={[0, -Math.PI / 2, 0]}
              center
              portal={htmlPortal}
            >
              <div className="text-[6px] font-mono text-cyan-neon/40 tracking-[0.2em] pointer-events-none">
                ORG_PROCESSES
              </div>
            </Html>
          </>
        )}

        {/* "Happy Path" Capsule */}
        <Line
          points={[
            [-1.2, 0, 0],
            [1.2, 0, 0],
          ]}
          color={phase === 2 ? "#ff0055" : "white"}
          lineWidth={2}
          transparent
          opacity={phase === 2 ? 0.4 : 0.8}
        />

        {/* Label on the box */}
        <group position={[0, 1.6, 0]} scale={[0.55, 0.55, 0.55]}>
          <Html center transform sprite distanceFactor={8} portal={htmlPortal}>
            <div
              className={`
                relative flex items-center gap-2
                px-3 py-1
                rounded-[2px]
                border
                bg-black/70
                text-[8px] font-mono uppercase tracking-[0.28em]
                whitespace-nowrap
                shadow-[0_0_14px_rgba(56,189,248,0.35)]
                transition-all duration-300
                ${
                  phase === 2
                    ? "border-rose-400/70 text-rose-200 shadow-[0_0_18px_rgba(248,113,113,0.7)]"
                    : introPhase === "chaos"
                      ? "border-cyan-300/20 text-cyan-100/40"
                      : "border-cyan-300/40 text-cyan-100/80"
                }
              `}
            >
              <span className="h-px w-3 bg-cyan-200/60" />
              {/* Static during intro phases, glitch only after done */}
              {introPhase === "done" ? (
                <GlitchText
                  variants={[
                    "GLIA MISSION CONTROL",
                    "MCAT COUNTEROFFENSIVE",
                    "FROM THE TRENCHES",
                    "NO CURVE. NO MERCY.",
                    "MEDICINE UNDER NEW MANAGEMENT",
                    "SCHEDULE THE WAR",
                    "BURNOUT BUFFER ACTIVE",
                    "QUESTION BANK PAYBACK",
                    "DOOMSCROLL QUARANTINE",
                    "EXECUTIVE FUNCTION ONLINE",
                    "STUDY POD: LIVE",
                    "NOT QUEUING THIS SOLO",
                  ]}
                  interval={5000}
                  className="text-cyan-neon"
                />
              ) : (
                <span className={introPhase === "chaos" ? "opacity-50" : ""}>
                  {introPhase === "chaos" ? "INITIALIZING..." : "GLIA LAUNCH"}
                </span>
              )}
              <span className="h-px w-3 bg-cyan-200/60" />
            </div>
          </Html>
        </group>
      </group>

      {/* Floating Nodes - Animated from chaos to orbital positions */}
      {showNodes && (
        <group ref={nodesRef}>
          {nodes.map((node) => {
            const isHighlighted = highlightedNodeId === node.id;
            const isNodeHovered = hoveredNodeId === node.id;

            // Filter visibility based on scroll phase (not intro phase)
            // During intro, show all nodes in chaos
            if (introPhase === "done") {
              if (phase === 0 && !["orgo", "soc"].includes(node.id)) return null;
              if (phase < 3 && ["md", "do", "phd"].includes(node.id)) return null;
            }

            return (
              <AnimatedNode
                key={node.id}
                node={node}
                isHighlighted={isHighlighted}
                isNodeHovered={isNodeHovered}
                onHover={() => setHoveredNodeId(node.id)}
                onLeave={() => setHoveredNodeId(null)}
                onClick={() => onNodeClick?.(node.id)}
                containmentProgress={containmentProgress}
                htmlPortal={htmlPortal}
                introPhase={introPhase}
                phase={phase}
              />
            );
          })}
        </group>
      )}
    </group>
  );
};
