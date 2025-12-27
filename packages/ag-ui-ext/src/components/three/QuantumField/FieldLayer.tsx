"use client";

/**
 * Quantum Field Canvas - Field Layer Component
 *
 * The main R3F canvas component that renders the reactive field substrate.
 * Supports multiple visual styles: constellation (A), pcb (B), water (C).
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ConstellationField } from "./ConstellationField";
import type { FieldBus } from "./FieldBus";
import { createFieldBus } from "./FieldBus";
import { clientToNdc } from "./domMapping";
import { FieldProvider, useFieldBus } from "./FieldProvider";
import { PcbField } from "./PcbField";
import type { FieldConfig, FieldRuntimeState } from "./types";
import { DEFAULT_FIELD_CONFIG } from "./types";
import { WaterField } from "./WaterField";

// -----------------------------------------------------------------------------
// Debug Shader Material
// -----------------------------------------------------------------------------

const DEBUG_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DEBUG_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec4 uHover; // xy = uv, z = intent (0=probe, 1=etch), w = active
uniform vec4 uImpulses[24]; // xy = uv, z = radius, w = amp
uniform float uImpulsesAge[24]; // normalized age (0-1, 1 = expired)
uniform int uImpulseCount;
uniform vec4 uAnchors[8]; // xy = uv, z = strength, w = phase
uniform int uAnchorCount;

varying vec2 vUv;

// Subtle grid pattern
float grid(vec2 uv, float spacing) {
  vec2 g = abs(fract(uv * spacing - 0.5) - 0.5) / fwidth(uv * spacing);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

// Smooth circle
float circle(vec2 uv, vec2 center, float radius, float softness) {
  float d = length(uv - center);
  return 1.0 - smoothstep(radius - softness, radius + softness, d);
}

// Ring shape
float ring(vec2 uv, vec2 center, float radius, float thickness, float softness) {
  float d = length(uv - center);
  float inner = smoothstep(radius - thickness - softness, radius - thickness, d);
  float outer = 1.0 - smoothstep(radius, radius + softness, d);
  return inner * outer;
}

void main() {
  vec2 uv = vUv;
  
  // Base: very subtle dark with faint grid
  vec3 baseColor = vec3(0.02, 0.03, 0.05);
  float gridVal = grid(uv, 20.0) * 0.03;
  vec3 color = baseColor + vec3(gridVal);
  
  // Hover probe effect
  if (uHover.w > 0.5) {
    vec2 hoverUv = uHover.xy;
    float probeRadius = 0.08;
    float intensity = uHover.z > 0.5 ? 0.4 : 0.25; // etch vs probe
    
    float probe = circle(uv, hoverUv, probeRadius, 0.02);
    vec3 probeColor = uHover.z > 0.5 
      ? vec3(0.9, 0.2, 0.5) // magenta for etch
      : vec3(0.1, 0.8, 0.9); // cyan for probe
    
    color += probeColor * probe * intensity;
    
    // Add subtle crackle near probe
    float crackle = fract(sin(dot(uv * 100.0 + uTime * 5.0, vec2(12.9898, 78.233))) * 43758.5453);
    float crackleZone = circle(uv, hoverUv, probeRadius * 1.5, 0.05);
    color += vec3(0.1, 0.6, 0.7) * crackle * crackleZone * 0.1;
  }
  
  // Impulse rings (bursts)
  for (int i = 0; i < 24; i++) {
    if (i >= uImpulseCount) break;
    
    vec4 imp = uImpulses[i];
    float age = uImpulsesAge[i];
    
    if (age >= 1.0) continue;
    
    vec2 impUv = imp.xy;
    float baseRadius = imp.z;
    float amp = imp.w;
    
    // Expanding ring
    float expandedRadius = baseRadius + age * 0.3;
    float thickness = 0.01 + (1.0 - age) * 0.02;
    float ringVal = ring(uv, impUv, expandedRadius, thickness, 0.005);
    
    // Fade out with age
    float fade = (1.0 - age) * amp;
    
    // Interference pattern
    float interference = sin((length(uv - impUv) - uTime * 0.5) * 60.0) * 0.5 + 0.5;
    
    vec3 ringColor = mix(
      vec3(0.2, 0.9, 1.0), // cyan
      vec3(1.0, 0.3, 0.6), // magenta
      interference
    );
    
    color += ringColor * ringVal * fade;
  }
  
  // Anchors (persistent glowing nodes)
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    
    vec4 anchor = uAnchors[i];
    vec2 anchorUv = anchor.xy;
    float strength = anchor.z;
    float phase = anchor.w;
    
    // Pulsing glow
    float pulse = 0.7 + 0.3 * sin(uTime * 3.0 + phase);
    float anchorGlow = circle(uv, anchorUv, 0.03, 0.02) * strength * pulse;
    
    // Tether-like radial streak
    vec2 toAnchor = anchorUv - uv;
    float dist = length(toAnchor);
    float angle = atan(toAnchor.y, toAnchor.x);
    float streak = smoothstep(0.1, 0.0, dist) * (0.5 + 0.5 * sin(angle * 8.0 + uTime * 2.0));
    
    color += vec3(0.3, 0.9, 0.4) * anchorGlow; // emerald
    color += vec3(0.2, 0.6, 0.3) * streak * 0.1 * strength;
  }
  
  gl_FragColor = vec4(color, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Field Plane Component (inside Canvas)
// -----------------------------------------------------------------------------

interface FieldPlaneProps {
  bus: FieldBus;
  config: FieldConfig;
}

// Reusable raycast objects
const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();
const _intersections: THREE.Intersection[] = [];

function FieldPlane({ bus, config }: FieldPlaneProps) {
  const { camera, size, gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);

  // Local refs for state (avoid re-renders)
  const stateRef = useRef<FieldRuntimeState>(bus.getSnapshot());

  // Subscribe to bus updates
  useEffect(() => {
    const unsub = bus.subscribe((state) => {
      stateRef.current = state;
    });
    return unsub;
  }, [bus]);

  // UV computation via raycast
  const computeUv = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!meshRef.current) return null;

      // Get canvas bounds
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();

      // Convert client coords to NDC relative to canvas
      const ndc = clientToNdc(clientX - rect.left, clientY - rect.top, {
        width: rect.width,
        height: rect.height,
      });

      _ndcVec.set(ndc.x, ndc.y);
      _raycaster.setFromCamera(_ndcVec, camera);

      _intersections.length = 0;
      meshRef.current.raycast(_raycaster, _intersections);

      if (_intersections.length > 0 && _intersections[0].uv) {
        return {
          x: _intersections[0].uv.x,
          y: _intersections[0].uv.y,
        };
      }

      return null;
    },
    [camera, gl.domElement]
  );

  // Create uniforms
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHover: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
      uImpulses: {
        value: Array(24)
          .fill(null)
          .map(() => new THREE.Vector4(0, 0, 0, 0)),
      },
      uImpulsesAge: { value: new Float32Array(24) },
      uImpulseCount: { value: 0 },
      uAnchors: {
        value: Array(8)
          .fill(null)
          .map(() => new THREE.Vector4(0, 0, 0, 0)),
      },
      uAnchorCount: { value: 0 },
    }),
    []
  );

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: DEBUG_VERTEX_SHADER,
      fragmentShader: DEBUG_FRAGMENT_SHADER,
      uniforms,
      transparent: true,
    });
  }, [uniforms]);

  // Calculate plane size based on camera
  const planeSize = useMemo(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = camera.position.z;
      const vFov = (camera.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * (size.width / size.height);
      return { width: width * 1.2, height: height * 1.2 };
    }
    return { width: 20, height: 15 };
  }, [camera, size]);

  // Animation frame
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const currentTs = Date.now();
    const currentState = stateRef.current;

    // Process pending events with raycast UV computation
    bus.processPendingWithUv(computeUv);

    // Tick the bus
    bus.tick(delta * 1000, currentTs);

    // Update time
    material.uniforms.uTime.value = state.clock.elapsedTime;

    // Update hover uniform
    if (currentState.hover.active) {
      // Convert last known client position to UV via raycast
      const hover = currentState.hover;
      material.uniforms.uHover.value.set(
        hover.uv.x,
        hover.uv.y,
        hover.intent === "etch" ? 1 : 0,
        1
      );
    } else {
      material.uniforms.uHover.value.w = 0;
    }

    // Update impulses
    const impulses = currentState.impulses;
    material.uniforms.uImpulseCount.value = impulses.length;

    for (let i = 0; i < 24; i++) {
      if (i < impulses.length) {
        const imp = impulses[i];
        const age = Math.min(1, (currentTs - imp.startTs) / config.impulseDecayMs);
        material.uniforms.uImpulses.value[i].set(imp.uv.x, imp.uv.y, imp.radius, imp.amplitude);
        material.uniforms.uImpulsesAge.value[i] = age;
      } else {
        material.uniforms.uImpulsesAge.value[i] = 1;
      }
    }

    // Update anchors
    const anchors = Array.from(currentState.anchors.values());
    material.uniforms.uAnchorCount.value = anchors.length;

    for (let i = 0; i < 8; i++) {
      if (i < anchors.length) {
        const anchor = anchors[i];
        const phase = (currentTs - anchor.createdTs) * 0.001;
        material.uniforms.uAnchors.value[i].set(anchor.uv.x, anchor.uv.y, anchor.strength, phase);
      }
    }
  });

  // Dispose material on unmount
  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} material={material}>
      <planeGeometry args={[planeSize.width, planeSize.height]} />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// Main Field Layer Component
// -----------------------------------------------------------------------------

export interface FieldLayerProps {
  /** Custom configuration overrides */
  config?: Partial<FieldConfig>;
  /** Custom class for the wrapper */
  className?: string;
  /** Whether to pin to viewport (fixed) or fill parent (absolute) */
  pinToViewport?: boolean;
  /** Z-index for the canvas wrapper */
  zIndex?: number;
  /** Camera FOV */
  fov?: number;
  /** Camera Z position */
  cameraZ?: number;
}

export function FieldLayer({
  config: configOverrides,
  className,
  pinToViewport = true,
  zIndex = -1,
  fov = 50,
  cameraZ = 10,
}: FieldLayerProps) {
  const bus = useFieldBus();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Merge config
  const config = useMemo(
    () => ({ ...DEFAULT_FIELD_CONFIG, ...configOverrides }),
    [configOverrides]
  );

  // Update bus config when it changes
  useEffect(() => {
    bus.setConfig(config);
  }, [bus, config]);

  const wrapperStyle: React.CSSProperties = {
    position: pinToViewport ? "fixed" : "absolute",
    inset: 0,
    zIndex,
    pointerEvents: "none",
    overflow: "hidden",
  };

  return (
    <div ref={wrapperRef} className={className} style={wrapperStyle} data-field-layer>
      <Canvas
        ref={canvasRef}
        camera={{ position: [0, 0, cameraZ], fov }}
        dpr={config.dpr}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          {config.style === "constellation" ? (
            <ConstellationField bus={bus} config={config} />
          ) : config.style === "pcb" ? (
            <PcbField bus={bus} config={config} />
          ) : config.style === "water" ? (
            <WaterField bus={bus} config={config} />
          ) : (
            // Fallback to debug plane
            <FieldPlane bus={bus} config={config} />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Standalone Field Layer (includes its own provider)
// -----------------------------------------------------------------------------

export interface StandaloneFieldLayerProps extends FieldLayerProps {
  /** Initial bus configuration */
  busConfig?: Partial<FieldConfig>;
}

export function StandaloneFieldLayer({ busConfig, ...props }: StandaloneFieldLayerProps) {
  const busRef = useRef<FieldBus | null>(null);

  // Create bus once
  if (!busRef.current) {
    busRef.current = createFieldBus(busConfig);
  }

  return (
    <FieldProvider bus={busRef.current}>
      <FieldLayer {...props} />
    </FieldProvider>
  );
}
