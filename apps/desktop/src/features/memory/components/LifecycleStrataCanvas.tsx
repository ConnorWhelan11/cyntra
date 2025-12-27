import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { LIFECYCLE_LAYERS, getLifecycleLayerY, VAULT_LAYER_ID } from "../lifecycle/strata";
import { useMemoryAtlasContext, type MemoryType } from "../hooks/useMemoryAtlas";
import type { MemoryItem } from "@/types";
import type { ExtractedMemoryShard, MockLifecycleDataset } from "../lifecycle/mockDataset";
import { getVisibleLinkEdges } from "../lifecycle/linkGraph";
import { getVaultTilePosition } from "../lifecycle/layout";
import { getGlowForImportance, getScopeStyle, getSigilForType } from "../lifecycle/mappings";

interface LifecycleStrataCanvasProps {
  className?: string;
  dataset: MockLifecycleDataset;
}

function AmbientEnvironment() {
  return (
    <>
      <color attach="background" args={["#07070c"]} />
      <fog attach="fog" args={["#07070c", 8, 26]} />

      <ambientLight intensity={0.28} color="#fffaf0" />
      <pointLight position={[8, 10, 6]} intensity={0.55} color="#d4a574" distance={40} decay={2} />
      <pointLight
        position={[-10, -6, -10]}
        intensity={0.35}
        color="#64d2c8"
        distance={35}
        decay={2}
      />
      <pointLight position={[0, -10, 14]} intensity={0.2} color="#7eb8da" distance={30} decay={2} />
    </>
  );
}

function CameraController() {
  const { state, actions } = useMemoryAtlasContext();
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useFrame(() => {
    if (!state.camera.isAnimating || !controlsRef.current) return;

    const desiredTarget = new THREE.Vector3(...state.camera.target);
    const currentTarget = controlsRef.current.target;
    currentTarget.lerp(desiredTarget, 0.085);

    const desiredPosition = new THREE.Vector3(...state.camera.position);
    camera.position.lerp(desiredPosition, 0.085);

    const targetClose = currentTarget.distanceTo(desiredTarget) < 0.02;
    const posClose = camera.position.distanceTo(desiredPosition) < 0.04;
    if (targetClose && posClose) {
      actions.setCameraAnimating(false);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      minDistance={4}
      maxDistance={26}
      maxPolarAngle={Math.PI * 0.78}
    />
  );
}

interface StrataSlabProps {
  label: string;
  position: [number, number, number];
  isFocus?: boolean;
}

function StrataSlab({ label, position, isFocus = false }: StrataSlabProps) {
  const groupRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...position), [position]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(target, delta * 6.5);
  });

  const slabWidth = 11.2;
  const slabDepth = 7.2;
  const slabThickness = 0.08;

  const borderColor = isFocus ? "#d4a574" : "#6b7280";

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <boxGeometry args={[slabWidth, slabThickness, slabDepth]} />
        <meshPhysicalMaterial
          color={isFocus ? "#0e0f16" : "#0b0b12"}
          transparent
          opacity={isFocus ? 0.22 : 0.16}
          roughness={0.28}
          metalness={0.05}
          clearcoat={0.4}
          clearcoatRoughness={0.3}
          transmission={0.6}
          thickness={0.35}
          ior={1.4}
          emissive={new THREE.Color(isFocus ? "#2a241a" : "#0a0a10")}
          emissiveIntensity={isFocus ? 0.25 : 0.12}
        />
        <Edges
          scale={1}
          threshold={10}
          color={borderColor}
          opacity={isFocus ? 0.32 : 0.18}
          transparent
        />
      </mesh>

      {/* Etched label */}
      <Html
        position={[-slabWidth / 2 + 0.8, slabThickness / 2 + 0.02, slabDepth / 2 - 0.6]}
        transform
      >
        <div
          className="px-2 py-1 rounded-md border border-white/5"
          style={{
            background: "rgba(5, 5, 10, 0.35)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-mono">
            {label}
          </div>
        </div>
      </Html>
    </group>
  );
}

const TYPE_COLORS: Record<MemoryType, string> = {
  pattern: "#d4a574",
  failure: "#e07a5f",
  dynamic: "#64d2c8",
  context: "#7eb8da",
  playbook: "#a17dc9",
  frontier: "#72d181",
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hashUnit(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

function Sigil({ type }: { type: MemoryType }) {
  switch (getSigilForType(type)) {
    case "diamond":
      return <octahedronGeometry args={[1, 0]} />;
    case "tetra":
      return <tetrahedronGeometry args={[1, 0]} />;
    case "ring":
      return <torusGeometry args={[0.8, 0.22, 10, 48]} />;
    case "slab":
      return <boxGeometry args={[1.1, 1.1, 0.4]} />;
    case "pill":
      return <cylinderGeometry args={[0.6, 0.6, 0.55, 16]} />;
    case "poly":
      return <icosahedronGeometry args={[1, 0]} />;
  }
}

interface VaultTileProps {
  memory: MemoryItem;
  position: [number, number, number];
  isSelected: boolean;
  isHovered: boolean;
  isFiltered: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

function VaultTile({
  memory,
  position,
  isSelected,
  isHovered,
  isFiltered,
  onSelect,
  onHover,
}: VaultTileProps) {
  const groupRef = useRef<THREE.Group>(null);
  const baseRef = useRef<THREE.Mesh>(null);
  const sigilRef = useRef<THREE.Mesh>(null);

  const type = memory.type as MemoryType;
  const typeColor = TYPE_COLORS[type] ?? TYPE_COLORS.pattern;
  const scopeStyle = getScopeStyle(memory.scope);

  const targetScale = isSelected ? 1.12 : isHovered ? 1.06 : 1;
  const opacity = isFiltered ? 1 : 0.12;

  const baseEmissive = getGlowForImportance(memory.importance);
  const pulseStrength = Math.min(0.08, (memory.accessCount ?? 0) / 500);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    const nextScale = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, delta * 8);
    groupRef.current.scale.setScalar(nextScale);

    if (sigilRef.current) {
      const mat = sigilRef.current.material as THREE.MeshStandardMaterial;
      const pulse = 1 + Math.sin(t * (0.35 + (memory.accessCount ?? 0) * 0.02)) * pulseStrength;
      const focusBoost = isSelected ? 0.55 : isHovered ? 0.28 : 0;
      mat.emissiveIntensity = (baseEmissive + focusBoost) * pulse;
      mat.opacity = opacity;
    }

    if (baseRef.current) {
      const mat = baseRef.current.material as THREE.MeshPhysicalMaterial;
      mat.opacity = opacity;
    }
  });

  const showTooltip = isHovered && isFiltered;

  return (
    <group ref={groupRef} position={[position[0], position[1] + scopeStyle.elevation, position[2]]}>
      <mesh
        ref={baseRef}
        onClick={(e) => {
          e.stopPropagation();
          if (isFiltered) onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (isFiltered) {
            onHover(true);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry args={[1.15, 0.1, 0.72]} />
        <meshPhysicalMaterial
          color="#0b0b12"
          roughness={0.36}
          metalness={0.18}
          clearcoat={0.55}
          clearcoatRoughness={0.25}
          transmission={0.15}
          thickness={0.1}
          transparent
          opacity={opacity}
        />
        <Edges color={typeColor} transparent opacity={isSelected ? 0.45 : 0.18} />
      </mesh>

      {/* Sigil (etched glow) */}
      <mesh ref={sigilRef} position={[0, 0.075, 0]}>
        <Sigil type={type} />
        <meshStandardMaterial
          color={typeColor}
          emissive={typeColor}
          emissiveIntensity={baseEmissive}
          transparent
          opacity={opacity}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Collective crown */}
      {scopeStyle.crowned && (
        <mesh position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.95}>
          <torusGeometry args={[0.62, 0.02, 10, 36]} />
          <meshBasicMaterial color={typeColor} transparent opacity={isSelected ? 0.35 : 0.12} />
        </mesh>
      )}

      {showTooltip && (
        <Html position={[0, 0.35, 0]} center style={{ pointerEvents: "none" }}>
          <div
            className="px-3 py-2 rounded-lg text-xs max-w-[260px] border border-white/10"
            style={{
              background: "rgba(8, 8, 14, 0.92)",
              boxShadow: `0 0 24px ${typeColor}22`,
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">
              {memory.type} · {memory.scope}
            </div>
            <div className="text-secondary leading-snug">{memory.content}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function VaultTiles() {
  const { state, actions, memories, filteredMemories, nodePositions } = useMemoryAtlasContext();

  const filteredIds = useMemo(() => new Set(filteredMemories.map((m) => m.id)), [filteredMemories]);

  return (
    <group>
      {memories.map((memory) => {
        const position = nodePositions.get(memory.id);
        if (!position) return null;
        return (
          <VaultTile
            key={memory.id}
            memory={memory}
            position={position}
            isSelected={state.selectedMemoryId === memory.id}
            isHovered={state.hoveredMemoryId === memory.id}
            isFiltered={filteredIds.has(memory.id)}
            onSelect={() => actions.selectMemory(memory.id)}
            onHover={(hovering) => actions.setHoveredMemory(hovering ? memory.id : null)}
          />
        );
      })}
    </group>
  );
}

interface PlaybackSimShard {
  shard: ExtractedMemoryShard;
  offset: { x: number; z: number };
  type: MemoryType;
  color: string;
}

interface PlaybackSimGroup {
  key: string;
  type: MemoryType;
  color: string;
  shardIndexes: number[];
  centerXZ: { x: number; z: number };
  output: MemoryItem;
  destination: [number, number, number];
}

interface PlaybackSimData {
  runId: string;
  baseCount: number;
  shards: PlaybackSimShard[];
  groups: PlaybackSimGroup[];
}

function PlaybackSimulation({
  sim,
  view,
  onComplete,
}: {
  sim: PlaybackSimData;
  view: "vault" | "lifecycle";
  onComplete: (outputs: MemoryItem[]) => void;
}) {
  const capsuleRef = useRef<THREE.Mesh>(null);
  const shardRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<(THREE.Mesh | null)[]>([]);

  const startedAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const runsIndex = LIFECYCLE_LAYERS.findIndex((l) => l.id === "runs");
  const extractionIndex = LIFECYCLE_LAYERS.findIndex((l) => l.id === "extraction");
  const dedupIndex = LIFECYCLE_LAYERS.findIndex((l) => l.id === "dedup");

  const slabThickness = 0.08;

  const runsY = getLifecycleLayerY(Math.max(0, runsIndex), view) + slabThickness / 2 + 0.22;
  const extractionY =
    getLifecycleLayerY(Math.max(0, extractionIndex), view) + slabThickness / 2 + 0.2;
  const dedupY = getLifecycleLayerY(Math.max(0, dedupIndex), view) + slabThickness / 2 + 0.22;

  useFrame((state) => {
    const now = state.clock.getElapsedTime();
    if (startedAtRef.current === null) startedAtRef.current = now;
    const elapsed = now - startedAtRef.current;

    const duration = 7.8;
    const p = clamp01(elapsed / duration);

    // Timeline segments
    const capsuleIn = 0.18;
    const shardsSpawn = 0.22;
    const toExtraction = 0.42;
    const toDedup = 0.65;
    const mergeEnd = 0.78;

    // Capsule
    if (capsuleRef.current) {
      const start = new THREE.Vector3(-7.2, runsY, 0);
      const end = new THREE.Vector3(-3.6, runsY, 0);
      const a = clamp01(p / capsuleIn);
      capsuleRef.current.position.lerpVectors(start, end, a);
      const visible = p <= shardsSpawn;
      capsuleRef.current.scale.setScalar(visible ? 1 : 0);

      const mat = capsuleRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = visible ? 0.55 : 0;
    }

    // Shards
    sim.shards.forEach((s, i) => {
      const mesh = shardRefs.current[i];
      if (!mesh) return;

      const spawnPos = new THREE.Vector3(-3.6 + s.offset.x * 0.22, runsY + 0.08, s.offset.z * 0.22);
      const extractionPos = new THREE.Vector3(
        -2.4 + s.offset.x * 0.55,
        extractionY,
        s.offset.z * 0.65
      );
      const dedupPos = new THREE.Vector3(0 + s.offset.x * 0.15, dedupY, s.offset.z * 0.15);

      const isVisible = p >= shardsSpawn && p <= mergeEnd;
      mesh.scale.setScalar(isVisible ? 0.065 : 0);

      if (!isVisible) return;

      if (p < toExtraction) {
        const a = clamp01((p - shardsSpawn) / (toExtraction - shardsSpawn));
        mesh.position.lerpVectors(spawnPos, extractionPos, a);
      } else if (p < toDedup) {
        const a = clamp01((p - toExtraction) / (toDedup - toExtraction));
        mesh.position.lerpVectors(extractionPos, dedupPos, a);
      } else {
        const a = clamp01((p - toDedup) / (mergeEnd - toDedup));
        const groupIndex = sim.groups.findIndex((g) => g.shardIndexes.includes(i));
        const group = sim.groups[Math.max(0, groupIndex)];
        const center = new THREE.Vector3(group.centerXZ.x, dedupY + 0.08, group.centerXZ.z);
        mesh.position.lerpVectors(dedupPos, center, a);
      }

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.22 + s.shard.provisional_importance * 0.78;
    });

    // Merge outputs
    sim.groups.forEach((g, i) => {
      const mesh = groupRefs.current[i];
      if (!mesh) return;

      const center = new THREE.Vector3(g.centerXZ.x, dedupY + 0.08, g.centerXZ.z);
      const dest = new THREE.Vector3(...g.destination);

      const isVisible = p >= toDedup;
      mesh.scale.setScalar(isVisible ? 0.14 : 0);

      if (!isVisible) return;

      if (p < mergeEnd) {
        const a = clamp01((p - toDedup) / (mergeEnd - toDedup));
        mesh.position.copy(center);
        mesh.scale.setScalar(0.06 + a * 0.11);
      } else {
        const a = clamp01((p - mergeEnd) / (1 - mergeEnd));
        mesh.position.lerpVectors(center, dest, a);
        mesh.scale.setScalar(0.14 - a * 0.06);

        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = (1 - a) * 0.55;
      }
    });

    if (p >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete(sim.groups.map((g) => g.output));
    }
  });

  return (
    <group>
      {/* Dedup lens */}
      <mesh position={[0, dedupY + 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.75, 48]} />
        <meshBasicMaterial color="#64d2c8" transparent opacity={0.16} />
      </mesh>

      {/* Run capsule */}
      <mesh ref={capsuleRef} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.14, 0.5, 8, 14]} />
        <meshStandardMaterial
          color="#0b0b12"
          emissive="#1b1720"
          emissiveIntensity={0.25}
          transparent
          opacity={0.55}
          roughness={0.35}
          metalness={0.15}
        />
        <Edges color="#d4a574" transparent opacity={0.22} />
      </mesh>

      <Html position={[-3.6, runsY + 0.35, 0]} center style={{ pointerEvents: "none" }} transform>
        <div
          className="px-2 py-1 rounded-md border border-white/10"
          style={{
            background: "rgba(6, 6, 10, 0.5)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-mono">
            RUN #{sim.runId}
          </div>
        </div>
      </Html>

      {/* Extracted shards */}
      {sim.shards.map((s, i) => (
        <mesh
          key={s.shard.temp_id}
          ref={(el) => {
            shardRefs.current[i] = el;
          }}
        >
          <Sigil type={s.type} />
          <meshStandardMaterial
            color={s.color}
            emissive={s.color}
            emissiveIntensity={0.55}
            transparent
            opacity={0.8}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
      ))}

      {/* Merged output runes */}
      {sim.groups.map((g, i) => (
        <mesh
          key={g.key}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
        >
          <Sigil type={g.type} />
          <meshStandardMaterial
            color={g.color}
            emissive={g.color}
            emissiveIntensity={0.95}
            transparent
            opacity={0.55}
            roughness={0.35}
            metalness={0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

export function LifecycleStrataCanvas({ className = "", dataset }: LifecycleStrataCanvasProps) {
  const { state, actions, nodePositions, memories, selectedMemory } = useMemoryAtlasContext();
  const { setLifecycleView, setPlaybackRunning } = actions;

  const linkingIndex = LIFECYCLE_LAYERS.findIndex((l) => l.id === "linking");
  const linkingY = getLifecycleLayerY(Math.max(0, linkingIndex), state.lifecycleView) + 0.55;

  const visibleEdges = useMemo(
    () =>
      getVisibleLinkEdges({
        selectedId: state.selectedMemoryId,
        links: dataset.links,
        maxHops: state.linkDepth,
        allowedTypes: ["supersedes", "instance_of"],
      }),
    [dataset.links, state.linkDepth, state.selectedMemoryId]
  );

  const filaments = useMemo(() => {
    return visibleEdges
      .map((e) => {
        const from = nodePositions.get(e.a);
        const to = nodePositions.get(e.b);
        if (!from || !to) return null;

        const fromV = new THREE.Vector3(...from).add(new THREE.Vector3(0, 0.06, 0));
        const toV = new THREE.Vector3(...to).add(new THREE.Vector3(0, 0.06, 0));
        const mid = new THREE.Vector3((fromV.x + toV.x) / 2, linkingY, (fromV.z + toV.z) / 2);

        const color = e.link_type === "supersedes" ? "#d4a574" : "#64d2c8";

        const dir = new THREE.Vector3().subVectors(toV, mid).normalize();
        const arrowPos = toV.clone().add(dir.multiplyScalar(-0.12));
        const arrowQuat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir
        );

        return {
          key: `${e.a}:${e.link_type}:${e.b}`,
          points: [fromV, mid, toV] as const,
          color,
          arrowPos,
          arrowQuat,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [linkingY, nodePositions, visibleEdges]);

  const originRun = useMemo(() => {
    if (!selectedMemory?.sourceRun) return null;
    const from = nodePositions.get(selectedMemory.id);
    if (!from) return null;
    return { runId: selectedMemory.sourceRun, from };
  }, [nodePositions, selectedMemory]);

  const [playbackSim, setPlaybackSim] = useState<PlaybackSimData | null>(null);

  useEffect(() => {
    if (!state.playback.isRunning) return;
    if (dataset.runs.length === 0) {
      setPlaybackRunning(false);
      return;
    }

    // Playback is most legible in Lifecycle View.
    if (state.lifecycleView !== "lifecycle") {
      setLifecycleView("lifecycle");
    }

    const selectedRunId = selectedMemory?.sourceRun ?? null;
    const runId =
      (selectedRunId && dataset.runs.some((r) => r.run_id === selectedRunId)
        ? selectedRunId
        : null) ??
      dataset.runs
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .at(-1)!.run_id;

    const shardsForRun = dataset.extracted
      .filter((s) => s.run_id === runId)
      .slice(0, 12)
      .map((shard) => {
        const type = shard.type as MemoryType;
        const offset = {
          x: (hashUnit(`${shard.temp_id}:x`) - 0.5) * 2.2,
          z: (hashUnit(`${shard.temp_id}:z`) - 0.5) * 2.2,
        };
        return {
          shard,
          offset,
          type,
          color: TYPE_COLORS[type] ?? TYPE_COLORS.pattern,
        };
      });

    const byType = new Map<MemoryType, number[]>();
    shardsForRun.forEach((s, idx) => {
      byType.set(s.type, [...(byType.get(s.type) ?? []), idx]);
    });

    const typeOrder: MemoryType[] = [
      "pattern",
      "failure",
      "dynamic",
      "context",
      "playbook",
      "frontier",
    ];
    const groupedTypes = [...byType.keys()].sort(
      (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
    );

    const baseCount = memories.length;
    const groups: PlaybackSimGroup[] = groupedTypes.map((type, i) => {
      const shardIndexes = byType.get(type) ?? [];
      const key = `merge:${runId}:${type}:${i}`;
      const color = TYPE_COLORS[type] ?? TYPE_COLORS.pattern;

      const angle = (i / Math.max(1, groupedTypes.length)) * Math.PI * 2 + 0.6;
      const centerXZ = { x: Math.cos(angle) * 0.72, z: Math.sin(angle) * 0.52 };

      const avgImportance = clamp01(
        shardIndexes.reduce((sum, si) => sum + shardsForRun[si].shard.provisional_importance, 0) /
          Math.max(1, shardIndexes.length)
      );
      const example = shardsForRun[shardIndexes[0]]?.shard.text ?? "Distilled memory shard.";

      const output: MemoryItem = {
        id: `mem-live-${runId}-${type}-${String(i + 1).padStart(2, "0")}`,
        type,
        agent: selectedMemory?.agent ?? "claude",
        scope: avgImportance > 0.78 ? "collective" : "individual",
        importance: clamp01(0.4 + avgImportance * 0.6),
        content: example,
        sourceRun: runId,
        accessCount: 1,
        createdAt: `Run #${runId}`,
      };

      const destination = getVaultTilePosition(baseCount + i, baseCount + groupedTypes.length);
      return { key, type, color, shardIndexes, centerXZ, output, destination };
    });

    setPlaybackSim({ runId, baseCount, shards: shardsForRun, groups });
  }, [
    dataset,
    memories.length,
    selectedMemory?.agent,
    selectedMemory?.sourceRun,
    setLifecycleView,
    setPlaybackRunning,
    state.lifecycleView,
    state.playback.isRunning,
    state.playback.nonce,
  ]);

  return (
    <div className={`absolute inset-0 ${className}`}>
      <Canvas
        onPointerMissed={(e) => {
          if (e.button === 0) actions.selectMemory(null);
        }}
        camera={{
          position: state.camera.position,
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
      >
        <AmbientEnvironment />
        <CameraController />

        <group position={[0, 0, 0]}>
          {LIFECYCLE_LAYERS.map((layer, index) => (
            <StrataSlab
              key={layer.id}
              label={layer.label}
              position={[0, getLifecycleLayerY(index, state.lifecycleView), 0]}
              isFocus={layer.id === VAULT_LAYER_ID}
            />
          ))}
        </group>

        {/* Vault tiles (persisted memory) */}
        <VaultTiles />

        {/* Origin run highlight (single filament, on focus) */}
        {originRun && (
          <group>
            {(() => {
              const runsIndex = LIFECYCLE_LAYERS.findIndex((l) => l.id === "runs");
              const slabThickness = 0.08;
              const runsY =
                getLifecycleLayerY(Math.max(0, runsIndex), state.lifecycleView) +
                slabThickness / 2 +
                0.22;

              const fromV = new THREE.Vector3(...originRun.from).add(new THREE.Vector3(0, 0.08, 0));
              const marker = new THREE.Vector3(-3.6, runsY, 0);
              const mid = new THREE.Vector3(fromV.x, (fromV.y + marker.y) / 2 + 0.8, fromV.z);

              return (
                <>
                  <Line
                    points={[fromV, mid, marker]}
                    color="#7eb8da"
                    transparent
                    opacity={0.22}
                    lineWidth={1}
                  />
                  <mesh position={marker} rotation={[0, 0, Math.PI / 2]}>
                    <capsuleGeometry args={[0.11, 0.42, 8, 14]} />
                    <meshStandardMaterial
                      color="#0b0b12"
                      emissive="#0b2a2a"
                      emissiveIntensity={0.35}
                      transparent
                      opacity={0.65}
                      roughness={0.38}
                      metalness={0.12}
                    />
                    <Edges color="#7eb8da" transparent opacity={0.25} />
                  </mesh>
                  <Html
                    position={[-3.6, runsY + 0.28, 0]}
                    center
                    style={{ pointerEvents: "none" }}
                    transform
                  >
                    <div
                      className="px-2 py-1 rounded-md border border-white/10"
                      style={{ background: "rgba(6, 6, 10, 0.5)", backdropFilter: "blur(8px)" }}
                    >
                      <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-mono">
                        RUN #{originRun.runId}
                      </div>
                    </div>
                  </Html>
                </>
              );
            })()}
          </group>
        )}

        {/* Linking loom (only on focus) */}
        {state.selectedMemoryId && state.linkDepth > 0 && (
          <group>
            {filaments.map((f) => (
              <group key={f.key}>
                <Line points={f.points} color={f.color} transparent opacity={0.38} lineWidth={1} />
                <mesh position={f.arrowPos} quaternion={f.arrowQuat}>
                  <coneGeometry args={[0.045, 0.12, 12]} />
                  <meshBasicMaterial color={f.color} transparent opacity={0.35} />
                </mesh>
              </group>
            ))}
          </group>
        )}

        {/* Playback (simulated run → extraction → dedup → vault) */}
        {state.playback.isRunning && playbackSim && (
          <PlaybackSimulation
            sim={playbackSim}
            view={state.lifecycleView}
            onComplete={(outputs) => {
              actions.appendMemories(outputs);
              actions.setPlaybackRunning(false);
              setPlaybackSim(null);
            }}
          />
        )}
      </Canvas>
    </div>
  );
}

export default LifecycleStrataCanvas;
