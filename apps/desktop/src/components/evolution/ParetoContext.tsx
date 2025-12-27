/**
 * ParetoContext - Ambient 3D wrapper for ParetoSurface
 * Provides a muted, depth-blurred background context for the lab interface
 */

import React, { useRef, Suspense, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ParetoPoint } from "@/types";
import {
  paretoVertexShader,
  paretoFragmentShader,
  pointVertexShader,
  pointFragmentShader,
  defaultColors,
} from "./paretoShaders";

interface ParetoContextProps {
  data: ParetoPoint[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onPointClick?: (point: ParetoPoint) => void;
  onPointHover?: (point: ParetoPoint | null) => void;
  ambientMode?: boolean; // Muted, background context
  className?: string;
}

// Selection halo component
function SelectionHalo({ position, isSelected }: { position: THREE.Vector3; isSelected: boolean }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ref.current && isSelected) {
      ref.current.rotation.z += delta * 0.5;
    }
  });

  if (!isSelected) return null;

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.08, 0.1, 32]} />
      <meshBasicMaterial color="#ffd700" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Inner scene with ambient styling
function AmbientScene({
  data,
  selectedId,
  hoveredId: _hoveredId,
  onPointClick: _onPointClick,
  onPointHover: _onPointHover,
  ambientMode,
}: Omit<ParetoContextProps, "className">) {
  const pointsRef = useRef<THREE.Points>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // Selected point position for halo
  const selectedPosition = useMemo(() => {
    const point = data.find((p) => p.id === selectedId);
    if (!point) return null;
    return new THREE.Vector3(
      (point.quality - 0.5) * 2,
      (point.complexity - 0.5) * 0.8,
      (point.speed - 0.5) * 2
    );
  }, [data, selectedId]);

  // Create surface geometry
  const surfaceGeometry = useMemo(() => {
    if (data.length < 4) return null;

    const resolution = 24; // Slightly lower for ambient mode
    const geometry = new THREE.PlaneGeometry(2, 2, resolution, resolution);
    const positions = geometry.attributes.position;
    const fitnesses = new Float32Array(positions.count);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) / 2 + 0.5;
      const z = positions.getZ(i) / 2 + 0.5;

      let totalWeight = 0;
      let weightedFitness = 0;
      let weightedY = 0;

      for (const point of data) {
        const dx = point.quality - x;
        const dz = point.speed - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const weight = 1 / (dist * dist + 0.1);
        totalWeight += weight;
        weightedFitness += point.fitness * weight;
        weightedY += point.complexity * weight;
      }

      const fitness = weightedFitness / totalWeight;
      const y = (weightedY / totalWeight) * 0.8 - 0.4;

      positions.setY(i, y);
      fitnesses[i] = fitness;
    }

    geometry.setAttribute("fitness", new THREE.BufferAttribute(fitnesses, 1));
    geometry.computeVertexNormals();

    return geometry;
  }, [data]);

  // Points geometry
  const pointsGeometry = useMemo(() => {
    if (data.length === 0) return null;

    const positions = new Float32Array(data.length * 3);
    const fitnesses = new Float32Array(data.length);
    const optimals = new Float32Array(data.length);

    data.forEach((point, i) => {
      positions[i * 3] = (point.quality - 0.5) * 2;
      positions[i * 3 + 1] = (point.complexity - 0.5) * 0.8;
      positions[i * 3 + 2] = (point.speed - 0.5) * 2;
      fitnesses[i] = point.fitness;
      optimals[i] = point.isParetoOptimal ? 1.0 : 0.0;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("fitness", new THREE.BufferAttribute(fitnesses, 1));
    geometry.setAttribute("isOptimal", new THREE.BufferAttribute(optimals, 1));

    return geometry;
  }, [data]);

  // Surface material with ambient adjustments
  const surfaceMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: paretoVertexShader,
        fragmentShader: paretoFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uBreathing: { value: ambientMode ? 0.3 : 0.5 },
          uLowColor: { value: new THREE.Color(...defaultColors.low) },
          uMidColor: { value: new THREE.Color(...defaultColors.mid) },
          uHighColor: { value: new THREE.Color(...defaultColors.high) },
          uFrontierColor: { value: new THREE.Color(...defaultColors.frontier) },
          uIridescence: { value: ambientMode ? 0.2 : 0.4 },
          uCellular: { value: ambientMode ? 0.3 : 0.6 },
        },
        transparent: true,
        side: THREE.DoubleSide,
      }),
    [ambientMode]
  );

  // Points material
  const pointsMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointVertexShader,
        fragmentShader: pointFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uPointSize: { value: ambientMode ? 8 : 12 },
          uOptimalColor: { value: new THREE.Color(...defaultColors.optimal) },
          uNormalColor: { value: new THREE.Color(...defaultColors.normal) },
        },
        transparent: true,
        depthWrite: false,
      }),
    [ambientMode]
  );

  // Animation
  useFrame((_, delta) => {
    timeRef.current += delta;

    if (surfaceMaterial.uniforms) {
      surfaceMaterial.uniforms.uTime.value = timeRef.current;
    }
    if (pointsMaterial.uniforms) {
      pointsMaterial.uniforms.uTime.value = timeRef.current;
    }
  });

  return (
    <>
      {/* Ambient lighting - softer for background mode */}
      <ambientLight intensity={ambientMode ? 0.3 : 0.4} />
      <directionalLight position={[5, 5, 5]} intensity={ambientMode ? 0.4 : 0.6} />
      <pointLight position={[-3, 2, -3]} intensity={ambientMode ? 0.2 : 0.3} color="#5DE0FF" />

      {/* Depth fog for ambient mode */}
      {ambientMode && <fog attach="fog" args={["#040812", 2, 8]} />}

      {/* Surface */}
      {surfaceGeometry && (
        <mesh
          ref={surfaceRef}
          geometry={surfaceGeometry}
          material={surfaceMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}

      {/* Points */}
      {pointsGeometry && (
        <points ref={pointsRef} geometry={pointsGeometry} material={pointsMaterial} />
      )}

      {/* Selection halo */}
      {selectedPosition && <SelectionHalo position={selectedPosition} isSelected={true} />}

      {/* Minimal axis hints (ambient mode only shows subtle hints) */}
      {!ambientMode && (
        <group>
          <mesh position={[0, -0.5, -1.1]}>
            <boxGeometry args={[2, 0.015, 0.015]} />
            <meshBasicMaterial color="#ff6b6b" opacity={0.3} transparent />
          </mesh>
          <mesh position={[-1.1, 0, -1.1]}>
            <boxGeometry args={[0.015, 1, 0.015]} />
            <meshBasicMaterial color="#4ecdc4" opacity={0.3} transparent />
          </mesh>
          <mesh position={[-1.1, -0.5, 0]}>
            <boxGeometry args={[0.015, 0.015, 2]} />
            <meshBasicMaterial color="#ffe66d" opacity={0.3} transparent />
          </mesh>
        </group>
      )}

      {/* Orbit controls - slower rotation for ambient */}
      <OrbitControls
        enablePan={false}
        enableZoom={!ambientMode}
        minDistance={ambientMode ? 3 : 2}
        maxDistance={ambientMode ? 5 : 6}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
        autoRotate
        autoRotateSpeed={ambientMode ? 0.3 : 0.5}
      />
    </>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <Html center>
      <div className="text-tertiary text-sm animate-pulse">Loading arena...</div>
    </Html>
  );
}

export function ParetoContext({
  data,
  selectedId,
  hoveredId,
  onPointClick,
  onPointHover,
  ambientMode = true,
  className = "",
}: ParetoContextProps) {
  // Stats
  const stats = useMemo(() => {
    const optimal = data.filter((p) => p.isParetoOptimal);
    return { total: data.length, optimal: optimal.length };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={`relative h-full rounded-lg overflow-hidden bg-void ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center text-tertiary">
          <div className="text-center">
            <span className="text-4xl mb-2 block opacity-30">{"\u25C6"}</span>
            <span className="text-sm">Waiting for candidates...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full rounded-lg overflow-hidden ${className}`}>
      <Canvas
        camera={{ position: [2.5, 2, 2.5], fov: ambientMode ? 50 : 45 }}
        dpr={[1, ambientMode ? 1.5 : 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: ambientMode ? 0.7 : 0.9,
        }}
      >
        <color attach="background" args={["#040812"]} />

        <Suspense fallback={<LoadingFallback />}>
          <AmbientScene
            data={data}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onPointClick={onPointClick}
            onPointHover={onPointHover}
            ambientMode={ambientMode}
          />
        </Suspense>
      </Canvas>

      {/* Overlay vignette for depth effect */}
      {ambientMode && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at center, transparent 30%, var(--void) 100%)
            `,
            opacity: 0.5,
          }}
        />
      )}

      {/* Minimal stats badge */}
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-obsidian/60 backdrop-blur-sm text-[10px] text-tertiary">
        {stats.optimal} optimal / {stats.total} candidates
      </div>
    </div>
  );
}

export default ParetoContext;
