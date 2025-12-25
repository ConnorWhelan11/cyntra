/**
 * ParetoSurface - 3D React Three Fiber visualization of Pareto frontier
 * Displays quality vs speed vs complexity as an organic iridescent surface
 */

import React, { useRef, useMemo, Suspense } from "react";
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

interface ParetoSurfaceProps {
  data: ParetoPoint[];
  highlightedId?: string | null;
  onPointClick?: (point: ParetoPoint) => void;
  onPointHover?: (point: ParetoPoint | null) => void;
  className?: string;
}

// Inner 3D scene component
function ParetoScene({
  data,
  highlightedId: _highlightedId,
  onPointClick: _onPointClick,
  onPointHover: _onPointHover,
}: Omit<ParetoSurfaceProps, "className">) {
  const pointsRef = useRef<THREE.Points>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // Create surface geometry from Delaunay triangulation approximation
  const surfaceGeometry = useMemo(() => {
    if (data.length < 4) return null;

    // Create a parametric surface based on data distribution
    const resolution = 32;
    const geometry = new THREE.PlaneGeometry(2, 2, resolution, resolution);
    const positions = geometry.attributes.position;
    const fitnesses = new Float32Array(positions.count);

    // Sample fitness values across the surface
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) / 2 + 0.5; // 0-1 range
      const z = positions.getZ(i) / 2 + 0.5;

      // Find nearby data points and interpolate fitness
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

  // Create points geometry for data markers
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

  // Surface shader material
  const surfaceMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: paretoVertexShader,
        fragmentShader: paretoFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uBreathing: { value: 0.5 },
          uLowColor: { value: new THREE.Color(...defaultColors.low) },
          uMidColor: { value: new THREE.Color(...defaultColors.mid) },
          uHighColor: { value: new THREE.Color(...defaultColors.high) },
          uFrontierColor: { value: new THREE.Color(...defaultColors.frontier) },
          uIridescence: { value: 0.4 },
          uCellular: { value: 0.6 },
        },
        transparent: true,
        side: THREE.DoubleSide,
      }),
    []
  );

  // Points shader material
  const pointsMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointVertexShader,
        fragmentShader: pointFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uPointSize: { value: 12 },
          uOptimalColor: { value: new THREE.Color(...defaultColors.optimal) },
          uNormalColor: { value: new THREE.Color(...defaultColors.normal) },
        },
        transparent: true,
        depthWrite: false,
      }),
    []
  );

  // Animation loop
  useFrame((_, delta) => {
    timeRef.current += delta;

    if (surfaceMaterial.uniforms) {
      surfaceMaterial.uniforms.uTime.value = timeRef.current;
    }
    if (pointsMaterial.uniforms) {
      pointsMaterial.uniforms.uTime.value = timeRef.current;
    }
  });

  // Pareto optimal points for frontier highlighting
  const optimalPoints = useMemo(
    () => data.filter((p) => p.isParetoOptimal),
    [data]
  );

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-3, 2, -3]} intensity={0.3} color="#5DE0FF" />

      {/* Surface mesh */}
      {surfaceGeometry && (
        <mesh
          ref={surfaceRef}
          geometry={surfaceGeometry}
          material={surfaceMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}

      {/* Data points */}
      {pointsGeometry && (
        <points
          ref={pointsRef}
          geometry={pointsGeometry}
          material={pointsMaterial}
        />
      )}

      {/* Axis indicators */}
      <group>
        {/* X axis - Quality */}
        <mesh position={[0, -0.5, -1.1]}>
          <boxGeometry args={[2, 0.02, 0.02]} />
          <meshBasicMaterial color="#ff6b6b" opacity={0.5} transparent />
        </mesh>
        <Html position={[1.1, -0.5, -1.1]} center>
          <span className="text-[10px] text-secondary font-mono whitespace-nowrap">
            Quality
          </span>
        </Html>

        {/* Y axis - Complexity */}
        <mesh position={[-1.1, 0, -1.1]}>
          <boxGeometry args={[0.02, 1, 0.02]} />
          <meshBasicMaterial color="#4ecdc4" opacity={0.5} transparent />
        </mesh>
        <Html position={[-1.1, 0.6, -1.1]} center>
          <span className="text-[10px] text-secondary font-mono whitespace-nowrap">
            Complexity
          </span>
        </Html>

        {/* Z axis - Speed */}
        <mesh position={[-1.1, -0.5, 0]}>
          <boxGeometry args={[0.02, 0.02, 2]} />
          <meshBasicMaterial color="#ffe66d" opacity={0.5} transparent />
        </mesh>
        <Html position={[-1.1, -0.5, 1.1]} center>
          <span className="text-[10px] text-secondary font-mono whitespace-nowrap">
            Speed
          </span>
        </Html>
      </group>

      {/* Frontier highlight line */}
      {optimalPoints.length > 2 && (() => {
        const linePositions = new Float32Array(
          optimalPoints.flatMap((p) => [
            (p.quality - 0.5) * 2,
            (p.complexity - 0.5) * 0.8 + 0.1,
            (p.speed - 0.5) * 2,
          ])
        );
        return (
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[linePositions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffd700" opacity={0.6} transparent linewidth={2} />
          </line>
        );
      })()}

      {/* Orbit controls */}
      <OrbitControls
        enablePan={false}
        minDistance={2}
        maxDistance={6}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <Html center>
      <div className="text-tertiary text-sm animate-pulse">Loading 3D...</div>
    </Html>
  );
}

// Main component
export function ParetoSurface({
  data,
  highlightedId,
  onPointClick,
  onPointHover,
  className = "",
}: ParetoSurfaceProps) {
  // Stats summary
  const stats = useMemo(() => {
    const optimal = data.filter((p) => p.isParetoOptimal);
    const avgFitness = data.reduce((sum, p) => sum + p.fitness, 0) / data.length;
    return {
      total: data.length,
      optimal: optimal.length,
      avgFitness: isNaN(avgFitness) ? 0 : avgFitness,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={`mc-panel ${className}`}>
        <div className="mc-panel-header">
          <span className="mc-panel-title">Pareto Surface</span>
        </div>
        <div className="aspect-square bg-void flex items-center justify-center">
          <div className="text-center text-tertiary">
            <span className="text-4xl mb-2 block opacity-40">{"\u25C6"}</span>
            <span className="text-sm">No Pareto data available</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mc-panel ${className}`}>
      <div className="mc-panel-header">
        <span className="mc-panel-title">Pareto Surface</span>
        <div className="mc-panel-actions">
          <span className="text-xs text-tertiary font-mono">
            {stats.optimal}/{stats.total} optimal
          </span>
        </div>
      </div>

      <div className="aspect-square bg-void relative overflow-hidden">
        <Canvas
          camera={{ position: [2.5, 2, 2.5], fov: 45 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 0.9,
          }}
        >
          <color attach="background" args={["#040812"]} />
          <fog attach="fog" args={["#040812", 4, 10]} />

          <Suspense fallback={<LoadingFallback />}>
            <ParetoScene
              data={data}
              highlightedId={highlightedId}
              onPointClick={onPointClick}
              onPointHover={onPointHover}
            />
          </Suspense>
        </Canvas>

        {/* Overlay legend */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end pointer-events-none">
          <div className="flex items-center gap-2 text-[10px] text-tertiary bg-obsidian/70 px-2 py-1 rounded">
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: `rgb(${defaultColors.optimal.map((c) => c * 255).join(",")})` }}
              />
              Pareto-optimal
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: `rgb(${defaultColors.normal.map((c) => c * 255).join(",")})` }}
              />
              Dominated
            </span>
          </div>
          <div className="text-[10px] text-tertiary bg-obsidian/70 px-2 py-1 rounded">
            Drag to rotate
          </div>
        </div>
      </div>
    </div>
  );
}

export default ParetoSurface;
